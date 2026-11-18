"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  getGetFindingQueryKey, useApproveDecision, useDecideFinding, useGetFinding,
  type Decision, type DecisionKind, type FindingDetail, type FindingStatus, type SourcePage,
} from "@workspace/api-client-react";
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, Info, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { PageFrame } from "@/components/page-frame";
import { QueryError } from "@/components/states";
import { ExaminerNote, StatusPill, ToolText } from "@/components/voice";
import { DECISION_LABELS, DecisionOutcome, useReviewInvalidate } from "@/components/review/shared";
import { useToast } from "@/hooks/use-toast";
import { parseApiError } from "@/lib/api-errors";
import { ROLE_LABELS, type RoleValue } from "@/lib/role";
import { CHECK_TYPE_LABELS, DOC_TYPE_SHORT, EVIDENCE_VERIFICATION_LABELS, FINDING_STATUS_LABELS, FINDING_STATUS_ORDER, SEVERITY_PILL } from "@/lib/labels";
import { useCanWrite, ViewerReason } from "@/lib/write-access";
import { cn } from "@/lib/utils";

/** A decision that needs a senior examiner's sign-off before it counts. Mirrors the server rule. */
const needsApproval = (kind: DecisionKind, finalStatus: FindingStatus | null) => kind !== "accept" || finalStatus === "breach";

/** The checker step: approve, or return to the maker with a note. Shown only to a senior examiner who did not make the decision. */
function ApprovalPanel({ f, d }: { f: FindingDetail; d: Decision }) {
  const { role } = useCanWrite();
  const approve = useApproveDecision();
  const invalidate = useReviewInvalidate();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setNote(""); setError(null); }, [d.id]);
  if (d.approvalStatus !== "awaiting" || !f.isLatest) return null;
  if (d.makerIsYou) {
    return <p className="text-xs text-muted-foreground" data-testid="text-own-decision">You made this decision, so a different senior examiner must approve it.</p>;
  }
  if (role !== "senior_examiner") {
    return <p className="text-xs text-muted-foreground" data-testid="text-needs-senior">A senior examiner must approve this decision before it counts.</p>;
  }
  const send = (action: "approve" | "return") => {
    if (action === "return" && !note.trim()) { setError("Write a note telling the examiner what to change."); return; }
    setError(null);
    approve.mutate({ id: d.id, data: { action, note: note.trim() || null } }, {
      onSuccess: () => { invalidate(f.id); toast({ title: action === "approve" ? `Approved: ${f.ruleCode}` : `Returned: ${f.ruleCode}`, description: "Recorded in the audit log." }); },
      onError: (e) => setError(parseApiError(e).message),
    });
  };
  return (
    <div className="space-y-2 border-t border-dashed border-border pt-3" data-testid="form-approval">
      <Label htmlFor="a-note">Checker note <span className="font-normal text-muted-foreground">(required to return)</span></Label>
      <Textarea id="a-note" rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What should change, or why you approve"
        className="font-serif text-[15px] italic text-pen placeholder:not-italic" data-testid="input-checker-note" />
      {error ? <p role="alert" className="text-sm text-[hsl(var(--tone-bad))]" data-testid="text-approval-error">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => send("approve")} disabled={approve.isPending} data-testid="button-approve">Approve</Button>
        <Button size="sm" variant="outline" className="bg-card" onClick={() => send("return")} disabled={approve.isPending} data-testid="button-return">Return to examiner</Button>
      </div>
    </div>
  );
}

/** Who decided: the signed-in person, with their role at the time. */
const who = (d: { actor: string | null; role: string }) =>
  `${d.actor ? d.actor.replace(/\s*<.*>$/, "") : "Unknown"} (${ROLE_LABELS[d.role as RoleValue] ?? d.role})`;

const CONTEXT = 360;

/** Splits page text into plain and highlighted runs. Overlapping highlights are merged. */
function runs(text: string, hl: SourcePage["highlights"]) {
  const merged: { start: number; end: number }[] = [];
  for (const h of [...hl].sort((a, b) => a.start - b.start)) {
    const last = merged[merged.length - 1];
    if (last && h.start <= last.end) last.end = Math.max(last.end, h.end);
    else merged.push({ start: h.start, end: h.end });
  }
  const out: { t: string; mark: boolean; start: number }[] = [];
  let i = 0;
  for (const m of merged) {
    if (m.start > i) out.push({ t: text.slice(i, m.start), mark: false, start: i });
    out.push({ t: text.slice(m.start, m.end), mark: true, start: m.start });
    i = m.end;
  }
  if (i < text.length) out.push({ t: text.slice(i), mark: false, start: i });
  return { out, merged };
}

function SourcePanel({ p }: { p: SourcePage }) {
  const [full, setFull] = useState(false);
  const rtl = p.language === "ar";
  const { out, merged } = runs(p.text, p.highlights);
  const from = merged.length ? Math.max(0, merged[0]!.start - CONTEXT) : 0;
  const to = merged.length ? Math.min(p.text.length, merged[merged.length - 1]!.end + CONTEXT) : Math.min(p.text.length, CONTEXT * 2);
  const clipped = !full && (from > 0 || to < p.text.length);
  const visible = clipped
    ? out
        .map((r) => {
          const s = Math.max(r.start, from);
          const e = Math.min(r.start + r.t.length, to);
          return e > s ? { ...r, t: p.text.slice(s, e) } : null;
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
    : out;
  return (
    <figure className="overflow-hidden rounded-lg border border-paper-border bg-paper" data-testid={`source-${p.documentId}-${p.pageNo}`}>
      {p.isGap ? (
        <p className="flex items-center gap-2 px-4 py-3 text-sm text-[hsl(var(--tone-warn))]"><AlertTriangle className="size-4" aria-hidden /> No text on this page.</p>
      ) : (
        <blockquote dir={rtl ? "rtl" : "ltr"} lang={rtl ? "ar" : undefined}
          className={cn("whitespace-pre-wrap break-words px-4 py-3 text-[15px] leading-relaxed", rtl ? "font-arabic text-right text-base leading-loose" : "font-serif")}>
          {clipped && from > 0 ? "… " : null}
          {visible.map((r, i) => r.mark
            ? <mark key={i} className="rounded-sm bg-[hsl(var(--tone-warn)/0.22)] px-0.5 text-foreground">{r.t}</mark>
            : <span key={i}>{r.t}</span>)}
          {clipped && to < p.text.length ? " …" : null}
        </blockquote>
      )}
      <figcaption className="flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-paper-border px-4 py-1.5 font-mono text-[11px] text-muted-foreground">
        <span>{p.docType ? `${DOC_TYPE_SHORT[p.docType]} · ` : ""}{p.documentName} · p. {p.pageNo}{p.highlights.length ? "" : " · quote not located on this page"}</span>
        <span className="flex gap-3 font-sans">
          {(from > 0 || to < p.text.length) && !p.isGap ? (
            <button type="button" className="underline underline-offset-2" onClick={() => setFull((f) => !f)} aria-expanded={full} data-testid={`button-full-page-${p.documentId}-${p.pageNo}`}>
              {full ? "Show less" : "Show full page"}
            </button>
          ) : null}
          <Link href={`/upload/${p.documentId}#page-${p.pageNo}`} className="underline underline-offset-2">Open document</Link>
        </span>
      </figcaption>
    </figure>
  );
}

function DecisionForm({ f, onDone }: { f: FindingDetail; onDone: (next: number | null) => void }) {
  const { canWrite } = useCanWrite();
  const decide = useDecideFinding();
  const invalidate = useReviewInvalidate();
  const { toast } = useToast();
  const [kind, setKind] = useState<DecisionKind>("accept");
  const [status, setStatus] = useState<FindingStatus | "">("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setKind("accept"); setStatus(""); setNote(""); setError(null); }, [f.id]);

  const noteRequired = kind !== "accept";
  const valid = (kind !== "modify" || (status && status !== f.proposedStatus)) && (!noteRequired || note.trim().length > 0);
  const closed = !f.isLatest;

  const submit = () => {
    if (!valid) return;
    setError(null);
    decide.mutate(
      { id: f.id, data: { decision: kind, finalStatus: kind === "modify" ? (status as FindingStatus) : null, examinerNote: note.trim() || null } },
      {
        onSuccess: (r) => {
          invalidate(f.id);
          toast({ title: `${DECISION_LABELS[kind]}: ${f.ruleCode}`, description: `${f.productName ?? "Product removed"} · recorded in the audit log.` });
          onDone(r.nextUndecidedId);
        },
        onError: (e) => setError(parseApiError(e).message),
      },
    );
  };

  if (closed) {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-4 text-sm" data-testid="text-decision-closed">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        A newer assessment of this product exists, so this finding is kept for the record and closed to decisions.
      </p>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-card-border bg-card p-4" data-testid="form-decision">
      <RadioGroup value={kind} onValueChange={(v) => { setKind(v as DecisionKind); setError(null); }} className="grid gap-2 sm:grid-cols-3" aria-label="Your decision">
        {([
          ["accept", "Accept", `${FINDING_STATUS_LABELS[f.proposedStatus]} stands`],
          ["modify", "Modify", "Set a different status"],
          ["reject", "Reject", "No finding stands"],
        ] as const).map(([v, label, hint]) => (
          <Label key={v} htmlFor={`d-${v}`}
            className={cn("flex cursor-pointer items-start gap-2 rounded-md border p-3 font-normal", kind === v ? "border-pen bg-pen/5" : "border-border")}>
            <RadioGroupItem value={v} id={`d-${v}`} className="mt-0.5" data-testid={`radio-decision-${v}`} />
            <span><span className="block text-sm font-medium">{label}</span><span className="block text-xs text-muted-foreground">{hint}</span></span>
          </Label>
        ))}
      </RadioGroup>
      {kind === "modify" ? (
        <div>
          <Label htmlFor="d-status">Status you are setting</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as FindingStatus)}>
            <SelectTrigger id="d-status" className="mt-1.5 sm:w-64" data-testid="select-final-status"><SelectValue placeholder="Choose a status" /></SelectTrigger>
            <SelectContent>
              {FINDING_STATUS_ORDER.filter((s) => s !== f.proposedStatus).map((s) => <SelectItem key={s} value={s}>{FINDING_STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <div>
        <Label htmlFor="d-note">Your note {noteRequired ? <span className="font-normal text-muted-foreground">(required)</span> : <span className="font-normal text-muted-foreground">(optional)</span>}</Label>
        <Textarea id="d-note" rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)}
          placeholder={kind === "reject" ? "Why this proposal is wrong" : kind === "modify" ? "Why the status should be different" : "Anything the next reader should know"}
          className="mt-1.5 font-serif text-[15px] italic text-pen placeholder:not-italic" data-testid="input-examiner-note" />
      </div>
      {error ? <p role="alert" className="text-sm text-[hsl(var(--tone-bad))]" data-testid="text-decision-error">{error}</p> : null}
      {needsApproval(kind, kind === "modify" ? (status || null) : kind === "accept" ? f.proposedStatus : null) ? (
        <p className="text-xs text-muted-foreground" data-testid="text-approval-needed">A different senior examiner must approve this decision before it counts in scores or notices.</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={submit} disabled={!canWrite || !valid || decide.isPending} data-testid="button-submit-decision">
          {decide.isPending ? "Recording…" : f.decision ? "Record new decision" : "Record decision"}
        </Button>
        {f.decision ? <span className="text-xs text-muted-foreground">The earlier decision stays in the history.</span> : null}
      </div>
      <ViewerReason />
    </div>
  );
}

export function FindingView({ id }: { id: number }) {
  const router = useRouter();
  const q = useGetFinding(id, { query: { enabled: Number.isFinite(id), queryKey: getGetFindingQueryKey(id) } });
  const [ruleOpen, setRuleOpen] = useState(false);
  const f = q.data;
  const sev = f ? SEVERITY_PILL[f.severity] : null;
  const evidenceById = useMemo(() => new Map((f?.evidence ?? []).map((e) => [e.id, e])), [f]);

  if (q.isLoading) {
    return <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-10 sm:px-6 lg:px-10"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }
  if (q.isError || !f || !sev) {
    const pe = parseApiError(q.error);
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-10 sm:px-6 lg:px-10">
        <QueryError title={pe.status === 404 ? "Finding not found" : "Could not load this finding"} error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} testId="error-finding" />
        <Link href="/review" className="text-sm underline underline-offset-2">Back to the review queue</Link>
      </div>
    );
  }

  const unlocated = f.evidence.filter((e) => e.verified === "not_found" || !f.sourcePages.some((p) => p.highlights.some((h) => h.evidenceId === e.id)));

  return (
    <PageFrame
      eyebrow={`Step 3 of 4 · Review and decide · ${f.ruleCode}`}
      question={`Do you agree: ${FINDING_STATUS_LABELS[f.proposedStatus].toLowerCase()} on “${f.ruleTitle}”?`}
      meta={
        <>
          <span className="text-xs text-muted-foreground">{f.productName ?? "Deleted product"}{f.bankName ? ` · ${f.bankName}` : ""}</span>
          <Link href={`/assess/${f.assessmentId}`} className="font-mono text-xs text-muted-foreground underline underline-offset-2">assessment #{f.assessmentId}</Link>
        </>
      }
      primaryAction={
        <nav aria-label="Findings" className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="bg-card" disabled={!f.prevId} onClick={() => f.prevId && router.push(`/review/${f.prevId}`)} data-testid="button-prev-finding">
            <ArrowLeft aria-hidden /> Previous
          </Button>
          <Button variant="outline" size="sm" className="bg-card" disabled={!f.nextId} onClick={() => f.nextId && router.push(`/review/${f.nextId}`)} data-testid="button-next-finding">
            Next <ArrowRight aria-hidden />
          </Button>
        </nav>
      }
      answer={
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2" data-testid="block-proposal">
            <span className="text-sm text-muted-foreground">Agents propose</span>
            <StatusPill variant={f.proposedStatus} data-testid="status-proposed" />
            <StatusPill variant={sev.variant} label={`${sev.label} severity`} />
            {f.verification === "unsupported" ? <StatusPill variant="error" label="Unsupported quote" /> : null}
          </div>
          {f.challenger ? (
            <p className={cn("rounded-md border px-3 py-2 text-sm", f.challenger.verdict === "does_not_support" ? "border-[hsl(var(--tone-warn)/0.35)] bg-[hsl(var(--tone-warn-bg))]" : "border-border bg-card")} data-testid="text-challenger">
              <span className="font-medium">Challenger: {f.challenger.verdict === "supports" ? "supports" : f.challenger.verdict === "does_not_support" ? "does not support" : "unclear"}.</span>{" "}
              <ToolText as="span" className="text-sm">{f.challenger.note}</ToolText>
              {f.challenger.downgraded ? <span className="text-muted-foreground"> Because it disagrees with the Rule agent, the proposal was moved to Needs review.</span> : null}
            </p>
          ) : null}
          {f.decision ? (
            <div className="space-y-2 rounded-lg border border-pen/30 bg-card p-4" data-testid="block-current-decision">
              <p className="flex flex-wrap items-center gap-2 text-sm"><span className="text-muted-foreground">{f.decision.makerIsYou ? "You decided" : `${who(f.decision)} decided`}</span> <DecisionOutcome d={f.decision} /></p>
              {f.decision.examinerNote ? (
                <ExaminerNote author={`${who(f.decision)} · ${format(new Date(f.decision.decidedAt), "d MMM yyyy, HH:mm")}`}>{f.decision.examinerNote}</ExaminerNote>
              ) : null}
              {f.decision.approvalStatus === "awaiting" ? (
                <p className="text-xs text-muted-foreground">Awaiting approval: it does not count in scores or notices yet.</p>
              ) : null}
              {(f.decision.approvalStatus === "approved" || f.decision.approvalStatus === "returned") && f.decision.checkedAt ? (
                <div className="space-y-1" data-testid="block-checker">
                  <p className="text-xs text-muted-foreground">
                    {f.decision.approvalStatus === "approved" ? "Approved" : "Returned"} by {f.decision.checker?.replace(/\s*<.*>$/, "") ?? "a senior examiner"} · {format(new Date(f.decision.checkedAt), "d MMM yyyy, HH:mm")}
                  </p>
                  {f.decision.checkerNote ? <ExaminerNote author="Checker note">{f.decision.checkerNote}</ExaminerNote> : null}
                  {f.decision.approvalStatus === "returned" ? <p className="text-xs font-medium text-[hsl(var(--tone-bad))]">Returned to the examiner: record a new decision below.</p> : null}
                </div>
              ) : null}
              <ApprovalPanel f={f} d={f.decision} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="text-undecided">No decision yet.</p>
          )}
        </div>
      }
      reason={
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Proposed by {f.proposedBy} · {CHECK_TYPE_LABELS[f.checkType]}</p>
            <ToolText data-testid="text-rationale">{f.rationale}</ToolText>
          </div>
          {f.checks.length ? (
            <ul className="divide-y divide-dashed divide-border rounded-lg border border-card-border bg-card px-3" data-testid="list-checks">
              {f.checks.map((c, i) => {
                const Icon = c.result === "pass" ? CheckCircle2 : c.result === "fail" ? XCircle : Info;
                const tone = c.result === "pass" ? "text-[hsl(var(--tone-ok))]" : c.result === "fail" ? "text-[hsl(var(--tone-bad))]" : "text-[hsl(var(--tone-info))]";
                return (
                  <li key={i} className="grid grid-cols-[64px_1fr] gap-2 py-1.5 text-xs">
                    <span className={cn("inline-flex items-center gap-1 font-medium", tone)}><Icon className="size-3.5" aria-hidden /> {c.result === "pass" ? "Pass" : c.result === "fail" ? "Fail" : "Info"}</span>
                    <span><span className="font-medium">{c.label}</span> <ToolText as="span" className="text-xs text-muted-foreground">{c.detail}</ToolText></span>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <div>
            <Button variant="ghost" size="sm" className="-ml-2" aria-expanded={ruleOpen} onClick={() => setRuleOpen((o) => !o)} data-testid="button-rule-text">
              <ChevronDown className={ruleOpen ? "rotate-180" : ""} aria-hidden /> {ruleOpen ? "Hide rule text" : "Show rule text"}
            </Button>
            {ruleOpen ? <p className="mt-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">{f.ruleText}</p> : null}
          </div>
        </div>
      }
      evidence={
        <div className="space-y-3">
          {f.sourcePages.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="text-no-evidence">No quote was cited for this finding.</p>
          ) : (
            f.sourcePages.map((p) => <SourcePanel key={`${p.documentId}-${p.pageNo}`} p={p} />)
          )}
          {unlocated.length ? (
            <div className="space-y-1 rounded-md border border-[hsl(var(--tone-bad)/0.3)] bg-[hsl(var(--tone-bad-bg))] px-3 py-2" data-testid="block-unlocated">
              <p className="text-xs font-medium text-[hsl(var(--tone-bad))]">Cited but not found in the document text</p>
              {unlocated.map((e) => (
                <ToolText key={e.id} className="text-xs">“{e.quote}” · {e.documentName} p. {e.pageNo} · {EVIDENCE_VERIFICATION_LABELS[evidenceById.get(e.id)!.verified]}</ToolText>
              ))}
            </div>
          ) : null}
        </div>
      }
      action={
        <div className="space-y-4">
          <DecisionForm f={f} onDone={(next) => router.push(next ? `/review/${next}` : "/review")} />
          {f.history.length ? (
            <div className="space-y-2" data-testid="list-history">
              <p className="text-xs font-medium text-muted-foreground">Decision history, newest first</p>
              <ol className="space-y-3">
                {f.history.map((h) => (
                  <li key={h.id} className="space-y-1">
                    <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono">{format(new Date(h.decidedAt), "d MMM yyyy, HH:mm")}</span>
                      <DecisionOutcome d={h} />
                    </p>
                    {h.examinerNote ? <ExaminerNote author={who(h)}>{h.examinerNote}</ExaminerNote> : null}
                    {h.checkedAt ? (
                      <p className="text-xs text-muted-foreground">
                        {h.approvalStatus === "approved" ? "Approved" : "Returned"} by {h.checker?.replace(/\s*<.*>$/, "") ?? "a senior examiner"} · {format(new Date(h.checkedAt), "d MMM yyyy, HH:mm")}{h.checkerNote ? `: ${h.checkerNote}` : ""}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      }
      next={f.nextUndecidedId ? { href: `/review/${f.nextUndecidedId}`, label: "Next undecided finding" } : { href: "/review", label: "Review queue" }}
    />
  );
}
