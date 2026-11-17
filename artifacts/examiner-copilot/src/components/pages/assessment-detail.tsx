"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getGetAssessmentQueryKey, useGetAssessment, useStartAssessment, useStopAssessment,
  type AgentStep, type AssessmentAlert, type AssessmentDetail, type CodeCheck, type Evidence, type Finding, type FindingStatus,
} from "@workspace/api-client-react";
import {
  AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, FileWarning, Info, Loader2, RotateCw, ShieldAlert, Square, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageFrame } from "@/components/page-frame";
import { EmptyState, QueryError } from "@/components/states";
import { BankQuote, StatusPill, ToolText } from "@/components/voice";
import { DocChip, UsageBar, countsSentence, totalCount } from "@/components/assess/shared";
import { useAssessInvalidate } from "@/components/pages/assess";
import { useToast } from "@/hooks/use-toast";
import { parseApiError } from "@/lib/api-errors";
import {
  AGENT_LABELS, CHECK_TYPE_LABELS, EVIDENCE_VERIFICATION_LABELS, FINDING_STATUS_LABELS, FINDING_STATUS_ORDER,
  SEVERITY_PILL, assessmentStatusPill, formatDuration,
} from "@/lib/labels";
import { useCanWrite, ViewerReason } from "@/lib/write-access";
import { cn } from "@/lib/utils";

const POLL = 2000;

function StatusStrip({ a, filter, setFilter }: { a: AssessmentDetail; filter: FindingStatus | null; setFilter: (f: FindingStatus | null) => void }) {
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-card-border bg-card sm:grid-cols-5" role="group" aria-label="Filter findings by status" data-testid="strip-status-counts">
      {FINDING_STATUS_ORDER.map((k) => {
        const on = filter === k;
        return (
          <button key={k} type="button" aria-pressed={on} onClick={() => setFilter(on ? null : k)} data-testid={`filter-${k}`}
            className={cn("flex flex-col items-start gap-1 border-b border-r border-border px-4 py-3 text-left transition-colors last:border-r-0 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:border-b-0",
              on && "bg-muted")}>
            <StatusPill variant={k} className="pointer-events-none" />
            <span className="font-mono text-xl font-medium">{a.counts[k]}</span>
          </button>
        );
      })}
    </div>
  );
}

const ALERT_META = {
  injection: { icon: ShieldAlert, title: "Text addressed to an AI system", tone: "bad" },
  extraction_gap: { icon: FileWarning, title: "Pages without text", tone: "warn" },
  missing_document: { icon: AlertTriangle, title: "Missing document", tone: "warn" },
  model_error: { icon: AlertCircle, title: "Model error", tone: "bad" },
} as const;

function AlertItem({ al, i }: { al: AssessmentAlert; i: number }) {
  const m = ALERT_META[al.kind];
  const Icon = m.icon;
  return (
    <li className={cn("space-y-2 rounded-lg border p-4",
      m.tone === "bad" ? "border-[hsl(var(--tone-bad)/0.35)] bg-[hsl(var(--tone-bad-bg))]" : "border-[hsl(var(--tone-warn)/0.3)] bg-[hsl(var(--tone-warn-bg))]")}
      data-testid={`alert-${al.kind}-${i}`}>
      <p className="flex items-start gap-2 text-sm font-medium">
        <Icon className={cn("mt-0.5 size-4 shrink-0", m.tone === "bad" ? "text-[hsl(var(--tone-bad))]" : "text-[hsl(var(--tone-warn))]")} aria-hidden />
        <span><span className="sr-only">{m.title}: </span>{al.message}</span>
      </p>
      {al.quote ? (
        <BankQuote document={al.documentName ?? "Document"} page={al.pageNo} dir={/[\u0600-\u06FF]/.test(al.quote) ? "rtl" : "ltr"}>
          {al.quote}
        </BankQuote>
      ) : null}
      {al.documentId ? (
        <Link href={`/upload/${al.documentId}${al.pageNo ? `#page-${al.pageNo}` : ""}`} className="inline-block text-xs font-medium underline underline-offset-2" data-testid={`link-alert-doc-${i}`}>
          Open {al.documentName ?? "document"}{al.pageNo ? `, page ${al.pageNo}` : ""}
        </Link>
      ) : null}
    </li>
  );
}

function VerifyMark({ v }: { v: Evidence["verified"] }) {
  const Icon = v === "exact" ? CheckCircle2 : v === "normalized" ? Info : XCircle;
  const tone = v === "exact" ? "text-[hsl(var(--tone-ok))]" : v === "normalized" ? "text-[hsl(var(--tone-info))]" : "text-[hsl(var(--tone-bad))]";
  return (
    <span className={cn("inline-flex items-center gap-1 font-mono text-[11px]", tone)}>
      <Icon className="size-3" aria-hidden /> {EVIDENCE_VERIFICATION_LABELS[v]}
    </span>
  );
}

function CheckRow({ c }: { c: CodeCheck }) {
  const Icon = c.result === "pass" ? CheckCircle2 : c.result === "fail" ? XCircle : Info;
  const tone = c.result === "pass" ? "text-[hsl(var(--tone-ok))]" : c.result === "fail" ? "text-[hsl(var(--tone-bad))]" : "text-[hsl(var(--tone-info))]";
  return (
    <li className="grid grid-cols-[72px_1fr] gap-2 py-1.5 text-xs">
      <span className={cn("inline-flex items-center gap-1 font-medium", tone)}><Icon className="size-3.5" aria-hidden /> {c.result === "pass" ? "Pass" : c.result === "fail" ? "Fail" : "Info"}</span>
      <span><span className="font-medium">{c.label}</span> <ToolText as="span" className="text-xs text-muted-foreground">{c.detail}</ToolText></span>
    </li>
  );
}

function FindingCard({ f, defaultOpen }: { f: Finding; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [ruleOpen, setRuleOpen] = useState(false);
  const sev = SEVERITY_PILL[f.severity];
  const bodyId = `finding-body-${f.id}`;
  return (
    <li className="overflow-hidden rounded-lg border border-card-border bg-card" data-testid={`card-finding-${f.id}`}>
      <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((o) => !o)}
        className="flex w-full flex-col gap-2 px-4 py-3 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:flex-row sm:items-center"
        data-testid={`button-toggle-finding-${f.id}`}>
        <span className="min-w-0 flex-1">
          <span className="mr-2 font-mono text-xs text-muted-foreground">{f.ruleCode}</span>
          <span className="font-medium">{f.ruleTitle}</span>
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <StatusPill variant={f.proposedStatus} />
          {f.proposedStatus === "breach" || f.proposedStatus === "warning" || f.proposedStatus === "needs_review"
            ? <StatusPill variant={sev.variant} label={`${sev.label} severity`} />
            : <span className="sr-only">{sev.label} severity</span>}
          {f.verification === "verified"
            ? <span className="inline-flex items-center gap-1 px-1 text-xs text-muted-foreground" data-testid={`badge-verified-${f.id}`}><CheckCircle2 className="size-3.5" aria-hidden />Quote verified</span>
            : <StatusPill variant="error" label="Unsupported quote" data-testid={`badge-unsupported-${f.id}`} />}
          <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
        </span>
      </button>
      {open ? (
        <div id={bodyId} className="space-y-4 border-t border-border px-4 py-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Proposed by {f.proposedBy} · {CHECK_TYPE_LABELS[f.checkType]}</p>
            <ToolText data-testid={`text-rationale-${f.id}`}>{f.rationale}</ToolText>
          </div>
          <div>
            <Button variant="ghost" size="sm" className="-ml-2" aria-expanded={ruleOpen} onClick={() => setRuleOpen((o) => !o)} data-testid={`button-rule-text-${f.id}`}>
              <ChevronDown className={ruleOpen ? "rotate-180" : ""} aria-hidden /> {ruleOpen ? "Hide rule text" : "Show rule text"}
            </Button>
            {ruleOpen ? <p className="mt-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">{f.ruleText}</p> : null}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Evidence</p>
            {f.evidence.length === 0 ? <p className="text-xs text-muted-foreground">No quote cited.</p> : (
              <ul className="space-y-3">
                {f.evidence.map((e) => (
                  <li key={e.id} className="space-y-1">
                    <BankQuote document={e.documentName} page={e.pageNo} dir={e.language === "ar" ? "rtl" : "ltr"} data-testid={`quote-evidence-${e.id}`}>{e.quote}</BankQuote>
                    <div className="flex flex-wrap items-center gap-3">
                      <VerifyMark v={e.verified} />
                      <Link href={`/upload/${e.documentId}#page-${e.pageNo}`} className="text-xs font-medium underline underline-offset-2" data-testid={`link-open-page-${e.id}`}>Open page</Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {f.checks.length ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Checks run by code</p>
              <ul className="divide-y divide-dashed divide-border">{f.checks.map((c, i) => <CheckRow key={i} c={c} />)}</ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function Trace({ a }: { a: AssessmentDetail }) {
  const [open, setOpen] = useState(false);
  const steps = useMemo(() => [...a.steps].sort((x, y) => x.stepNo - y.stepNo), [a.steps]);
  const latency = steps.reduce((s, x) => s + (x.latencyMs ?? 0), 0);
  return (
    <div className="rounded-lg border border-card-border bg-card" data-testid="section-trace">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid="button-toggle-trace"
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        <span>Agent trace <span className="text-xs font-normal text-muted-foreground">· {steps.length} steps</span></span>
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div className="border-t border-border">
          {steps.length === 0 ? <p className="px-4 py-3 text-sm text-muted-foreground">No steps recorded yet.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-xs" data-testid="table-trace">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">#</th><th className="px-3 py-2 font-medium">Agent</th><th className="px-3 py-2 font-medium">Tool</th>
                    <th className="px-3 py-2 font-medium">Summary</th><th className="px-3 py-2 text-right font-medium">Tokens in/out</th><th className="px-3 py-2 text-right font-medium">Latency</th>
                  </tr>
                </thead>
                <tbody>
                  {steps.map((s: AgentStep) => (
                    <tr key={s.id} className="border-b border-border align-top last:border-0" data-testid={`row-step-${s.stepNo}`}>
                      <td className="px-3 py-2 font-mono">{s.stepNo}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{AGENT_LABELS[s.agent]}</td>
                      <td className="px-3 py-2 font-mono text-muted-foreground">{s.tool ?? "—"}</td>
                      <td className="px-3 py-2">
                        <ToolText as="span" className="text-xs">{s.summary}</ToolText>
                        {s.error ? <span className="mt-1 flex items-start gap-1 text-[hsl(var(--tone-bad))]"><AlertCircle className="mt-0.5 size-3 shrink-0" aria-hidden /> Error: {s.error}</span> : null}
                      </td>
                      <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{s.tokensIn.toLocaleString()} / {s.tokensOut.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{s.latencyMs !== null ? `${s.latencyMs.toLocaleString()} ms` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <ToolText className="border-t border-border px-4 py-3 text-xs" data-testid="text-trace-totals">
            total: {a.stepsUsed}/{a.stepLimit} steps · {a.tokensIn.toLocaleString()} in / {a.tokensOut.toLocaleString()} out of {a.tokenLimit.toLocaleString()} tokens · {latency.toLocaleString()} ms model time
            {a.stopReason ? <><br />ended: {a.stopReason}</> : null}
          </ToolText>
        </div>
      ) : null}
    </div>
  );
}

export function AssessmentDetailView({ id }: { id: number }) {
  const router = useRouter();
  const { canWrite } = useCanWrite();
  const { toast } = useToast();
  const refresh = useAssessInvalidate();
  const q = useGetAssessment(id, {
    query: {
      enabled: Number.isFinite(id), queryKey: getGetAssessmentQueryKey(id),
      refetchInterval: (qq) => (qq.state.data && (qq.state.data.status === "queued" || qq.state.data.status === "running") ? POLL : false),
    },
  });
  const start = useStartAssessment();
  const stop = useStopAssessment();
  const [filter, setFilter] = useState<FindingStatus | null>(null);
  const a = q.data;

  const findings = useMemo(() => {
    if (!a) return [];
    return [...a.findings].sort((x, y) =>
      FINDING_STATUS_ORDER.indexOf(x.proposedStatus) - FINDING_STATUS_ORDER.indexOf(y.proposedStatus) || x.ruleCode.localeCompare(y.ruleCode, undefined, { numeric: true }));
  }, [a]);

  if (q.isLoading) {
    return <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-10 sm:px-6 lg:px-10"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }
  if (q.isError || !a) {
    const pe = parseApiError(q.error);
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-10 sm:px-6 lg:px-10">
        <QueryError title={pe.status === 404 ? "Assessment not found" : "Could not load this assessment"} error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} testId="error-assessment" />
        <Link href="/assess" className="text-sm underline underline-offset-2" data-testid="link-back-assess">Back to assessments</Link>
      </div>
    );
  }

  const live = a.status === "queued" || a.status === "running";
  const ended = a.status === "failed" || a.status === "stopped";
  const pill = assessmentStatusPill(a.status);
  const firstOpen = findings.find((f) => f.proposedStatus === "breach" || f.proposedStatus === "warning")?.id;
  const shown = filter ? findings.filter((f) => f.proposedStatus === filter) : findings;
  const dur = formatDuration(a.startedAt, a.finishedAt);

  const runAgain = () => {
    if (!a.productId) return;
    start.mutate({ data: { productId: a.productId } }, {
      onSuccess: (n) => { refresh(); router.push(`/assess/${n.id}`); },
      onError: (e) => { const pe = parseApiError(e); toast({ title: pe.status === 409 ? "Another run is in progress" : "Could not start", description: pe.message, variant: "destructive" }); },
    });
  };
  const doStop = () => stop.mutate({ id: a.id, data: {} }, {
    onSuccess: () => { refresh(); q.refetch(); toast({ title: "Stop requested", description: "The run will stop after its current step." }); },
    onError: (e) => toast({ title: "Could not stop", description: parseApiError(e).message, variant: "destructive" }),
  });

  return (
    <PageFrame
      eyebrow={`Step 2 of 4 · Assess · #${a.id}`}
      question={`${a.productName ?? "Product"} against rulebook version ${a.rulebookVersion ?? "?"}`}
      meta={
        <>
          <StatusPill variant={pill.variant} label={pill.label} data-testid="status-assessment" />
          {a.bankName ? <span className="text-xs text-muted-foreground">{a.bankName}</span> : null}
          <span className="font-mono text-xs text-muted-foreground">{dur ?? ""}</span>
        </>
      }
      primaryAction={
        <div className="flex flex-col items-start gap-1.5 md:items-end">
          <div className="flex flex-wrap gap-2">
            {live ? (
              <Button variant="outline" className="bg-card" onClick={doStop} disabled={!canWrite || stop.isPending} data-testid="button-stop">
                <Square aria-hidden /> {stop.isPending ? "Stopping…" : "Stop"}
              </Button>
            ) : (
              <Button variant="outline" className="bg-card" onClick={runAgain} disabled={!canWrite || !a.productId || start.isPending} data-testid="button-run-again">
                <RotateCw className={start.isPending ? "animate-spin" : ""} aria-hidden /> Run again
              </Button>
            )}
            {live ? (
              <Button disabled data-testid="button-review">Review and decide</Button>
            ) : (
              <Button asChild data-testid="button-review"><Link href="/review">Review and decide</Link></Button>
            )}
          </div>
          {live ? <p className="text-[11px] text-muted-foreground">Review opens when the run finishes.</p> : null}
          <ViewerReason className="max-w-xs md:text-right" />
        </div>
      }
      answer={
        <div className="space-y-4">
          {live ? (
            <div role="status" aria-live="polite" className="space-y-3 rounded-lg border border-primary/30 bg-card p-4" data-testid="panel-progress">
              <p className="flex items-center gap-2 text-[15px]"><Loader2 className="size-4 animate-spin text-primary" aria-hidden /> {a.status === "queued" ? "Queued." : "Running."}</p>
              <ToolText data-testid="text-progress">{a.progress ?? "Waiting to start…"}</ToolText>
              <div className="grid gap-3 sm:grid-cols-2">
                <UsageBar label="steps" used={a.stepsUsed} limit={a.stepLimit} />
                <UsageBar label="tokens" used={a.tokensIn + a.tokensOut} limit={a.tokenLimit} />
              </div>
            </div>
          ) : (
            <p className="text-[15px]" data-testid="text-answer">
              {totalCount(a.counts) ? `${countsSentence(a.counts)}. ` : "No findings were produced. "}
              These are proposals; examiners decide in Step 3.
            </p>
          )}
          {ended ? (
            <div role="alert" className={cn("space-y-1 rounded-lg border p-4", a.status === "failed" ? "border-[hsl(var(--tone-bad)/0.35)] bg-[hsl(var(--tone-bad-bg))]" : "border-[hsl(var(--tone-warn)/0.3)] bg-[hsl(var(--tone-warn-bg))]")} data-testid="panel-stop-reason">
              <p className="text-sm font-semibold">{a.status === "failed" ? "The run failed." : "The run stopped early."}</p>
              <ToolText>{a.stopReason ?? "No reason was recorded."}</ToolText>
              <p className="text-xs text-muted-foreground">No results were invented. Only findings completed before the run ended are shown; rules without one were not assessed.</p>
            </div>
          ) : null}
          {a.findings.length ? <StatusStrip a={a} filter={filter} setFilter={setFilter} /> : null}
        </div>
      }
      reason={
        a.alerts.length ? (
          <ul className="space-y-3" data-testid="list-alerts">{a.alerts.map((al, i) => <AlertItem key={i} al={al} i={i} />)}</ul>
        ) : (
          <p className="text-sm text-muted-foreground">No alerts: no text addressed to an AI system, no missing documents, no extraction gaps, no model errors.</p>
        )
      }
      evidence={
        <div className="space-y-6">
          {findings.length === 0 ? (
            live ? <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div> : (
              <EmptyState icon={Info} title="No findings" testId="empty-findings">This run produced no proposals.</EmptyState>
            )
          ) : (
            <div className="space-y-2">
              {filter ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  Showing {FINDING_STATUS_LABELS[filter]} only.
                  <button type="button" className="underline underline-offset-2" onClick={() => setFilter(null)} data-testid="button-clear-filter">Show all</button>
                </p>
              ) : null}
              {shown.length === 0 ? <p className="text-sm text-muted-foreground">No findings with this status.</p> : (
                <ul className="space-y-2" data-testid="list-findings">
                  {shown.map((f) => <FindingCard key={f.id} f={f} defaultOpen={f.id === firstOpen} />)}
                </ul>
              )}
            </div>
          )}
          <Trace a={a} />
        </div>
      }
      action={
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Documents assessed</p>
          {a.documents.length ? (
            <div className="flex flex-wrap gap-1.5" data-testid="list-assessed-documents">{a.documents.map((d) => <DocChip key={d.id} d={d} link />)}</div>
          ) : <p className="text-xs text-muted-foreground">None recorded.</p>}
        </div>
      }
      next={{ href: "/review", label: "Review and decide" }}
    />
  );
}
