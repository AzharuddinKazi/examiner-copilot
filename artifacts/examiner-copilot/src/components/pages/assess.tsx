"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  getListAssessmentCandidatesQueryKey, getListAssessmentsQueryKey,
  useListAssessmentCandidates, useListAssessments, useStartAssessment, useStopAssessment,
  type AssessmentCandidate, type AssessmentCandidates, type AssessmentSummary,
} from "@workspace/api-client-react";
import { AlertTriangle, ArrowRight, Bot, BookOpen, CheckCircle2, History, Loader2, Play, Settings, Square, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageFrame } from "@/components/page-frame";
import { EmptyState, QueryError } from "@/components/states";
import { StatusPill, ToolText } from "@/components/voice";
import { CountPills, DocChip, UsageBar, countsSentence } from "@/components/assess/shared";
import { useToast } from "@/hooks/use-toast";
import { parseApiError } from "@/lib/api-errors";
import { DOC_TYPE_LABELS, assessmentStatusPill, formatDuration } from "@/lib/labels";
import { useCanWrite, useInvalidate, ViewerReason, VIEWER_REASON } from "@/lib/write-access";

const POLL = 2000;

export function useAssessInvalidate() {
  const invalidate = useInvalidate();
  return () => invalidate([getListAssessmentCandidatesQueryKey(), getListAssessmentsQueryKey()]);
}

function Preconditions({ d }: { d: AssessmentCandidates }) {
  return (
    <div className="grid overflow-hidden rounded-lg border border-card-border bg-card md:grid-cols-3" data-testid="strip-preconditions">
      <div className="space-y-1 border-b border-border p-4 md:border-b-0 md:border-r">
        <p className="text-[11px] text-muted-foreground">Rulebook</p>
        {d.activeRulebookVersionId ? (
          <p className="flex items-start gap-2 text-sm">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[hsl(var(--tone-ok))]" aria-hidden />
            <span>
              <Link href={`/library/rulebook/${d.activeRulebookVersionId}`} className="font-medium underline underline-offset-2" data-testid="link-active-rulebook">Active version</Link>
              <span className="text-muted-foreground"> · <span className="font-mono">{d.activeRuleCount}</span> rules</span>
            </span>
          </p>
        ) : (
          <p className="flex items-start gap-2 text-sm" data-testid="text-no-rulebook">
            <XCircle className="mt-0.5 size-4 shrink-0 text-[hsl(var(--tone-bad))]" aria-hidden />
            <span>No active rulebook. <Link href="/library/rulebook" className="underline underline-offset-2">Activate one</Link></span>
          </p>
        )}
      </div>
      <div className="space-y-1 border-b border-border p-4 md:border-b-0 md:border-r">
        <p className="text-[11px] text-muted-foreground">Model provider</p>
        <p className="flex items-start gap-2 text-sm" data-testid="text-llm-status">
          {d.llmConfigured
            ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[hsl(var(--tone-ok))]" aria-hidden />
            : <XCircle className="mt-0.5 size-4 shrink-0 text-[hsl(var(--tone-bad))]" aria-hidden />}
          <span className="min-w-0">
            <span className="font-medium">{d.llmConfigured ? "Configured" : "Not configured"}</span>
            <ToolText as="span" className="block text-xs text-muted-foreground">{d.llmMessage}</ToolText>
            {!d.llmConfigured ? (
              <Link href="/settings" className="mt-1 inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2" data-testid="link-settings">
                <Settings className="size-3" aria-hidden /> Open settings
              </Link>
            ) : null}
          </span>
        </p>
      </div>
      <div className="space-y-1 p-4">
        <p className="text-[11px] text-muted-foreground">Run limits</p>
        <ToolText className="text-xs" data-testid="text-limits">
          steps ≤ {d.limits.stepLimit.toLocaleString()}<br />tokens ≤ {d.limits.tokenLimit.toLocaleString()}
        </ToolText>
        <p className="text-[11px] text-muted-foreground">A run stops when either limit is reached.</p>
      </div>
    </div>
  );
}

function LivePanel({ run }: { run: AssessmentSummary }) {
  const { canWrite } = useCanWrite();
  const stop = useStopAssessment();
  const refresh = useAssessInvalidate();
  const { toast } = useToast();
  return (
    <div role="status" aria-live="polite" className="rise space-y-4 rounded-lg border border-primary/30 bg-card p-4 shadow-sm" data-testid="panel-live-run">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden /> Assessment #{run.id} is {run.status}
          </p>
          <p className="mt-0.5 font-medium">{run.bankName ? `${run.bankName} · ` : ""}{run.productName ?? "Product"}</p>
          <ToolText className="mt-1 text-xs" data-testid="text-live-progress">{run.progress ?? "Waiting to start…"}</ToolText>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="outline" size="sm" className="bg-card" disabled={!canWrite || stop.isPending} data-testid="button-stop-live"
            onClick={() => stop.mutate({ id: run.id, data: {} }, {
              onSuccess: () => { refresh(); toast({ title: "Stop requested", description: "The run will stop after its current step." }); },
              onError: (e) => toast({ title: "Could not stop", description: parseApiError(e).message, variant: "destructive" }),
            })}>
            <Square aria-hidden /> {stop.isPending ? "Stopping…" : "Stop"}
          </Button>
          <Button asChild size="sm" variant="ghost" data-testid="link-live-detail">
            <Link href={`/assess/${run.id}`}>Watch <ArrowRight aria-hidden /></Link>
          </Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <UsageBar label="steps" used={run.stepsUsed} limit={run.stepLimit} testId="bar-steps" />
        <UsageBar label="tokens" used={run.tokensIn + run.tokensOut} limit={run.tokenLimit} testId="bar-tokens" />
      </div>
    </div>
  );
}

function disabledReason(c: AssessmentCandidate, d: AssessmentCandidates, canWrite: boolean): string | null {
  if (!canWrite) return VIEWER_REASON;
  if (d.runningId) return "Another assessment is running. Wait for it to finish or stop it.";
  if (!d.llmConfigured) return "The model provider is not configured.";
  if (!c.ready) return c.notReadyReason ?? "Not ready to assess.";
  return null;
}

function RunButton({ c, d, onStart, pending }: { c: AssessmentCandidate; d: AssessmentCandidates; onStart: (id: number) => void; pending: boolean }) {
  const { canWrite } = useCanWrite();
  const reason = disabledReason(c, d, canWrite);
  const rid = `reason-run-${c.productId}`;
  return (
    <div className="flex flex-col items-start gap-1 md:items-end">
      <Button size="sm" disabled={!!reason || pending} aria-describedby={reason ? rid : undefined}
        onClick={() => onStart(c.productId)} data-testid={`button-run-${c.productId}`}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />} {pending ? "Starting…" : "Run assessment"}
      </Button>
      {reason && canWrite ? <p id={rid} className="max-w-[220px] text-[11px] text-muted-foreground md:text-right">{reason}</p> : null}
      {!canWrite ? <span id={rid} className="sr-only">{reason}</span> : null}
    </div>
  );
}

function CandidateNotes({ c }: { c: AssessmentCandidate }) {
  return (
    <div className="space-y-1">
      {c.missingDocTypes.map((t) => (
        <p key={t} className="flex items-start gap-1.5 text-xs text-[hsl(var(--tone-warn))]">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden /> No {DOC_TYPE_LABELS[t]} document: those rules will be Needs review
        </p>
      ))}
      {c.awaitingCount > 0 ? (
        <p className="text-xs text-muted-foreground">
          <Link href="/upload" className="underline underline-offset-2" data-testid={`link-awaiting-${c.productId}`}>
            {c.awaitingCount} {c.awaitingCount === 1 ? "document awaiting confirmation is" : "documents awaiting confirmation are"} not included
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function LastRun({ a }: { a: AssessmentSummary | null }) {
  if (!a) return <span className="text-xs text-muted-foreground">Never assessed</span>;
  const pill = assessmentStatusPill(a.status);
  return (
    <div className="space-y-1">
      <Link href={`/assess/${a.id}`} className="inline-flex items-center gap-2 text-xs underline-offset-2 hover:underline" data-testid={`link-last-${a.id}`}>
        <StatusPill variant={pill.variant} label={pill.label} /> <span className="font-mono">#{a.id}</span>
      </Link>
      {a.status !== "running" && a.status !== "queued" ? <CountPills c={a.counts} /> : null}
    </div>
  );
}

function Candidates({ d, onStart, pendingId }: { d: AssessmentCandidates; onStart: (id: number) => void; pendingId: number | null }) {
  if (!d.items.length) {
    return (
      <EmptyState icon={Bot} title="No card products to assess" testId="empty-candidates"
        action={<Button asChild variant="outline" className="bg-card"><Link href="/upload">Upload documents</Link></Button>}>
        Upload and confirm the disclosures for a card product first.
      </EmptyState>
    );
  }
  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border border-card-border bg-card md:block">
        <table className="w-full text-sm" data-testid="table-candidates">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Product</th>
              <th className="px-3 py-2.5 font-medium">Confirmed documents</th>
              <th className="px-3 py-2.5 font-medium">Last assessment</th>
              <th className="px-4 py-2.5 font-medium"><span className="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody>
            {d.items.map((c) => (
              <tr key={c.productId} className="border-b border-border align-top last:border-0 hover:bg-muted/40" data-testid={`row-candidate-${c.productId}`}>
                <td className="px-4 py-3">
                  <p className="font-medium">{c.productName}</p>
                  <p className="text-xs text-muted-foreground">{c.bankName}</p>
                </td>
                <td className="max-w-[340px] space-y-2 px-3 py-3">
                  <div className="flex flex-wrap gap-1">
                    {c.documents.length ? c.documents.map((doc) => <DocChip key={doc.id} d={doc} />) : <span className="text-xs text-muted-foreground">None confirmed</span>}
                  </div>
                  <CandidateNotes c={c} />
                </td>
                <td className="px-3 py-3"><LastRun a={c.lastAssessment} /></td>
                <td className="px-4 py-3"><RunButton c={c} d={d} onStart={onStart} pending={pendingId === c.productId} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-2 md:hidden" data-testid="list-candidates">
        {d.items.map((c) => (
          <li key={c.productId} className="space-y-2.5 rounded-lg border border-card-border bg-card p-3" data-testid={`card-candidate-${c.productId}`}>
            <div>
              <p className="font-medium">{c.productName}</p>
              <p className="text-xs text-muted-foreground">{c.bankName}</p>
            </div>
            <div className="flex flex-wrap gap-1">
              {c.documents.length ? c.documents.map((doc) => <DocChip key={doc.id} d={doc} />) : <span className="text-xs text-muted-foreground">None confirmed</span>}
            </div>
            <CandidateNotes c={c} />
            <LastRun a={c.lastAssessment} />
            <RunButton c={c} d={d} onStart={onStart} pending={pendingId === c.productId} />
          </li>
        ))}
      </ul>
    </>
  );
}

function HistoryList({ items }: { items: AssessmentSummary[] }) {
  if (!items.length) {
    return (
      <EmptyState icon={History} title="No assessments run yet" testId="empty-history">
        Five read-only agents read the confirmed documents against the active rulebook and propose a status per rule. They cannot change documents, rules or decisions.
      </EmptyState>
    );
  }
  return (
    <ul className="divide-y divide-border rounded-lg border border-card-border bg-card" data-testid="list-history">
      {items.map((a) => {
        const pill = assessmentStatusPill(a.status);
        const dur = formatDuration(a.startedAt, a.finishedAt);
        return (
          <li key={a.id}>
            <Link href={`/assess/${a.id}`} className="flex flex-col gap-2 px-4 py-3 hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none md:flex-row md:items-center md:gap-4" data-testid={`link-history-${a.id}`}>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <StatusPill variant={pill.variant} label={pill.label} />
                  <span className="font-medium">{a.productName ?? "Product removed"}</span>
                  <span className="font-mono text-xs text-muted-foreground">#{a.id}{a.rulebookVersion ? ` · v${a.rulebookVersion}` : ""}</span>
                </p>
                {a.stopReason ? <ToolText className="mt-1 text-xs text-muted-foreground">{a.stopReason}</ToolText> : null}
              </div>
              <CountPills c={a.counts} />
              <ToolText as="span" className="shrink-0 text-[11px] text-muted-foreground md:w-44 md:text-right">
                {format(new Date(a.createdAt), "d MMM, HH:mm")}{dur ? ` · ${dur}` : ""}
              </ToolText>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function AssessView() {
  const router = useRouter();
  const refresh = useAssessInvalidate();
  const cand = useListAssessmentCandidates({
    query: { queryKey: getListAssessmentCandidatesQueryKey(), refetchInterval: (q) => (q.state.data?.runningId ? POLL : false) },
  });
  const list = useListAssessments({
    query: { queryKey: getListAssessmentsQueryKey(), refetchInterval: (q) => (q.state.data?.runningId || cand.data?.runningId ? POLL : false) },
  });
  const start = useStartAssessment();
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const onStart = (productId: number) => {
    setStartError(null); setPendingId(productId);
    start.mutate({ data: { productId } }, {
      onSuccess: (a) => { refresh(); router.push(`/assess/${a.id}`); },
      onError: (e) => {
        const pe = parseApiError(e);
        const prefix = pe.status === 409 ? "Another run is in progress. " : pe.status === 503 ? "Model not configured. " : pe.status === 400 ? "Not ready. " : "";
        setStartError(prefix + pe.message); refresh();
      },
      onSettled: () => setPendingId(null),
    });
  };

  const d = cand.data;
  const runningId = d?.runningId ?? list.data?.runningId ?? null;
  const running = runningId ? list.data?.items.find((a) => a.id === runningId) : undefined;
  const ready = d?.items.filter((c) => c.ready).length ?? 0;
  const done = list.data?.items.filter((a) => a.status === "complete") ?? [];

  const answer = cand.isLoading ? <Skeleton className="h-24 w-full" /> : cand.isError || !d ? (
    <QueryError title="Could not load assessment candidates" error={cand.error} onRetry={() => cand.refetch()} retrying={cand.isFetching} testId="error-candidates" />
  ) : (
    <div className="space-y-4">
      {running ? <LivePanel run={running} /> : runningId ? <Skeleton className="h-28 w-full" /> : null}
      <p className="text-[15px]" data-testid="text-answer">
        {runningId ? "An assessment is running. Its proposals will appear when it finishes."
          : done[0] ? <>Latest for {done[0].productName ?? "a product"}: {countsSentence(done[0].counts).toLowerCase()}. These are proposals; examiners decide in Step 3.</>
          : ready ? `${ready} ${ready === 1 ? "product is" : "products are"} ready. Run an assessment to see what the agents propose.`
          : "No product is ready yet. Confirm documents and activate a rulebook first."}
      </p>
      <Preconditions d={d} />
    </div>
  );

  return (
    <PageFrame
      eyebrow="Step 2 of 4 · Assess"
      question="What do the agents propose?"
      primaryAction={
        <div className="flex flex-col items-start gap-1.5 md:items-end">
          {runningId ? (
            <Button asChild data-testid="button-open-running"><Link href={`/assess/${runningId}`}><Loader2 className="animate-spin" aria-hidden /> Open running assessment</Link></Button>
          ) : (
            <Button asChild variant="outline" className="bg-card" data-testid="button-jump-candidates"><a href="#candidates"><Play aria-hidden /> Choose a product</a></Button>
          )}
          <ViewerReason className="max-w-xs md:text-right" />
        </div>
      }
      answer={answer}
      reason={
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>Agents read each product's confirmed documents against the active rulebook version and propose one status per rule. They cannot change documents, rules or decisions.</p>
          <p className="max-w-prose text-sm text-muted-foreground">Every proposed finding must cite a quote and page. Code checks each quote against the extracted text; a quote that cannot be found makes the finding a Warning.</p>
        </div>
      }
      evidence={
        <div className="space-y-8">
          <div id="candidates" className="scroll-mt-20 space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><BookOpen className="size-4" aria-hidden /> Card products</h3>
            {startError ? <p role="alert" className="rounded-md bg-[hsl(var(--tone-bad-bg))] px-3 py-2 text-sm text-[hsl(var(--tone-bad))]" data-testid="text-start-error">{startError}</p> : null}
            {cand.isLoading ? <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
              : d ? <Candidates d={d} onStart={onStart} pendingId={pendingId} /> : null}
          </div>
          <div className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><History className="size-4" aria-hidden /> History</h3>
            {list.isLoading ? <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
              : list.isError || !list.data ? <QueryError title="Could not load past assessments" error={list.error} onRetry={() => list.refetch()} retrying={list.isFetching} testId="error-history" />
              : <HistoryList items={list.data.items} />}
          </div>
        </div>
      }
      next={{ href: "/review", label: "Review and decide" }}
    />
  );
}
