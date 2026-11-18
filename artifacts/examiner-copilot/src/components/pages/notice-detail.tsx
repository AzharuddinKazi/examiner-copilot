"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getGetNoticeQueryKey, useApproveNotice, useCreateNotice, useDeleteNotice, useGetNotice, useSubmitNotice, useSyncNotice, useUpdateNotice,
  type Notice, type NoticeFinding, type NoticeUpdateInput,
} from "@workspace/api-client-react";
import { AlertTriangle, ArrowRight, ChevronDown, Download, FilePen, Info, Lock, RefreshCw, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageFrame } from "@/components/page-frame";
import { QueryError } from "@/components/states";
import { BankQuote, ExaminerNote, StatusPill, ToolText } from "@/components/voice";
import {
  DraftsOnlyNotice, NoticeStateTag, exportUrl, formatDay, formatStamp, hasArabic, personName, useNoticeRefresh,
} from "@/components/notices/shared";
import { useToast } from "@/hooks/use-toast";
import { parseApiError } from "@/lib/api-errors";
import { SEVERITY_PILL } from "@/lib/labels";
import { useCanWrite, useInvalidate, ViewerReason } from "@/lib/write-access";
import { cn } from "@/lib/utils";

type MarkDirty = (key: string, dirty: boolean) => void;
const ARABIC_CHAR = /[\u0600-\u06FF]/;

/** Saves a partial change and puts the returned report in the cache. */
function useSave(n: Notice) {
  const update = useUpdateNotice();
  const refresh = useNoticeRefresh();
  const { toast } = useToast();
  const save = (data: NoticeUpdateInput, what: string, onDone?: () => void) =>
    update.mutate({ id: n.id, data }, {
      onSuccess: (r) => { refresh(r); toast({ title: `Saved: ${what}`, description: "Recorded in the audit log." }); onDone?.(); },
      onError: (e) => toast({ title: `Could not save the ${what}`, description: parseApiError(e).message, variant: "destructive" }),
    });
  return { save, pending: update.isPending };
}

function DownloadButtons({ n }: { n: Notice }) {
  const { toast } = useToast();
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState<"pdf" | "docx" | null>(null);
  const download = async (fmt: "pdf" | "docx") => {
    setBusy(fmt);
    try {
      const res = await fetch(exportUrl(n.id, fmt), { credentials: "include" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `The server answered ${res.status}.`);
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const m = /filename\*=UTF-8''([^;]+)/i.exec(cd);
      const name = m ? decodeURIComponent(m[1]!) : `Findings report ${n.id}.${fmt}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      invalidate([]);
    } catch (e) {
      toast({ title: `Could not download the ${fmt === "pdf" ? "PDF" : "Word file"}`, description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" className="bg-card" onClick={() => download("pdf")} disabled={busy !== null} data-testid="button-download-pdf">
        <Download aria-hidden /> {busy === "pdf" ? "Preparing…" : "Download PDF"}
      </Button>
      <Button variant="outline" className="bg-card" onClick={() => download("docx")} disabled={busy !== null} data-testid="button-download-docx">
        <Download aria-hidden /> {busy === "docx" ? "Preparing…" : "Download Word"}
      </Button>
    </div>
  );
}

/** Send for approval, or the senior examiner's approve / return step, or who must act. */
function ApprovalBlock({ n, dirty }: { n: Notice; dirty: boolean }) {
  const { role, canWrite } = useCanWrite();
  const submit = useSubmitNotice();
  const approve = useApproveNotice();
  const refresh = useNoticeRefresh();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setNote(""); setError(null); }, [n.state]);

  const included = n.findings.filter((f) => f.included);
  const stale = included.filter((f) => !f.stillEligible).length;

  if (n.state === "approved") {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-[hsl(var(--tone-ok)/0.35)] bg-[hsl(var(--tone-ok-bg))] p-4 text-sm" data-testid="text-approved">
        <Lock className="mt-0.5 size-4 shrink-0 text-[hsl(var(--tone-ok))]" aria-hidden />
        <span>Approved by <strong className="font-semibold">{personName(n.checker, "a senior examiner")}</strong>{n.checkedAt ? ` on ${formatStamp(n.checkedAt)}` : ""}; prepared by {personName(n.submittedBy)}. The report is locked and kept for the record.</span>
      </p>
    );
  }

  if (n.state === "awaiting") {
    const sent = <>Sent for approval by <strong className="font-semibold">{personName(n.submittedBy)}</strong>. It cannot change until a senior examiner approves or returns it.</>;
    if (n.canApprove) {
      const send = (action: "approve" | "return") => {
        if (action === "return" && !note.trim()) { setError("Write a note telling the examiner what to change."); return; }
        setError(null);
        approve.mutate({ id: n.id, data: { action, note: note.trim() || null } }, {
          onSuccess: (r) => { refresh(r); toast({ title: action === "approve" ? "Report approved" : "Report returned", description: "Recorded in the audit log." }); },
          onError: (e) => setError(parseApiError(e).message),
        });
      };
      return (
        <div className="space-y-3 rounded-lg border border-[hsl(var(--tone-warn)/0.35)] bg-card p-4" data-testid="form-notice-approval">
          <p className="text-sm">{sent} You can approve it or return it.</p>
          <div className="space-y-2 border-t border-dashed border-border pt-3">
            <Label htmlFor="n-note">Checker note <span className="font-normal text-muted-foreground">(required to return)</span></Label>
            <Textarea id="n-note" rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What should change, or why you approve"
              className="font-serif text-[15px] italic text-pen placeholder:not-italic" data-testid="input-checker-note" />
            {error ? <p role="alert" className="text-sm text-[hsl(var(--tone-bad))]" data-testid="text-approval-error">{error}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => send("approve")} disabled={approve.isPending} data-testid="button-approve">Approve report</Button>
              <Button size="sm" variant="outline" className="bg-card" onClick={() => send("return")} disabled={approve.isPending} data-testid="button-return">Return to examiner</Button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-1 rounded-lg border border-[hsl(var(--tone-warn)/0.35)] bg-[hsl(var(--tone-warn-bg))] p-4 text-sm" data-testid="text-awaiting">
        <p>{sent}</p>
        <p className="text-xs text-muted-foreground" data-testid="text-who-approves">
          {n.submittedByYou
            ? "You sent this report, so a different senior examiner must approve it."
            : role === "senior_examiner"
              ? "You cannot approve this report."
              : `A senior examiner other than ${personName(n.submittedBy)} must approve it.`}
        </p>
      </div>
    );
  }

  // Draft or returned.
  const blocker = !included.length
    ? "Include at least one finding before sending the report for approval."
    : !n.referenceDate
      ? "Set a reference date first."
      : stale
        ? "Some findings are no longer approved breaches or warnings. Update the report from current decisions first."
        : dirty
          ? "Save or discard your unsaved changes first."
          : null;
  const go = () =>
    submit.mutate({ id: n.id }, {
      onSuccess: (r) => { refresh(r); toast({ title: "Sent for approval", description: "A different senior examiner must approve it. Recorded in the audit log." }); },
      onError: (e) => setError(parseApiError(e).message),
    });
  return (
    <div className="space-y-3">
      {n.state === "returned" ? (
        <div className="space-y-2 rounded-lg border border-[hsl(var(--tone-bad)/0.3)] bg-[hsl(var(--tone-bad-bg))] p-4" data-testid="block-returned">
          <p className="text-sm font-semibold text-[hsl(var(--tone-bad))]">
            Returned by {personName(n.checker, "a senior examiner")}{n.checkedAt ? ` on ${formatStamp(n.checkedAt)}` : ""}
          </p>
          {n.checkerNote ? <ExaminerNote author={personName(n.checker, "Senior examiner")} data-testid="text-checker-note">{n.checkerNote}</ExaminerNote> : null}
          <p className="text-xs text-muted-foreground">Make the changes, then send it for approval again.</p>
        </div>
      ) : null}
      {canWrite ? (
        <div className="space-y-2 rounded-lg border border-card-border bg-card p-4" data-testid="form-submit-notice">
          <p className="text-sm">When the report is ready, send it for approval. A senior examiner other than you must approve it before it is final; until then it cannot change.</p>
          {error ? <p role="alert" className="text-sm text-[hsl(var(--tone-bad))]" data-testid="text-submit-error">{error}</p> : null}
          {blocker ? <p className="text-xs text-muted-foreground" data-testid="text-submit-blocker">{blocker}</p> : null}
          <Button onClick={go} disabled={!n.canSubmit || !!blocker || submit.isPending} data-testid="button-submit-notice">
            <Send aria-hidden /> {submit.isPending ? "Sending…" : "Send for approval"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ThemesTable({ n }: { n: Notice }) {
  if (!n.themes.length) return <p className="text-sm text-muted-foreground" data-testid="text-no-themes">No theme ratings for this assessment.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-card-border bg-card">
      <table className="w-full text-sm" data-testid="table-themes">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="px-4 py-2 font-medium">Theme</th>
            <th className="px-3 py-2 font-medium">Rating</th>
            <th className="px-3 py-2 font-medium">In this report</th>
            <th className="px-4 py-2 font-medium">Complaints (median across banks)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {n.themes.map((t) => (
            <tr key={t.theme} data-testid={`row-theme-${t.theme}`}>
              <td className="px-4 py-2">{t.theme}</td>
              <td className={cn("whitespace-nowrap px-3 py-2 font-mono", (t.rating ?? 0) >= 3 && "text-[hsl(var(--tone-bad))]")}>{t.rating} {t.label}</td>
              <td className="whitespace-nowrap px-3 py-2 font-mono">{t.breaches} B · {t.warnings} W</td>
              <td className="whitespace-nowrap px-4 py-2 font-mono text-muted-foreground">{t.complaints === null ? "–" : `${t.complaints}${t.peerMedian !== null ? ` (${t.peerMedian})` : ""}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FindingCard({ f, idx, n, markDirty }: { f: NoticeFinding; idx: number; n: Notice; markDirty: MarkDirty }) {
  const { save, pending } = useSave(n);
  const [action, setAction] = useState(f.action);
  const [due, setDue] = useState(f.dueDate ?? "");
  const [ruleOpen, setRuleOpen] = useState(false);
  useEffect(() => setAction(f.action), [f.action]);
  useEffect(() => setDue(f.dueDate ?? ""), [f.dueDate]);
  const dirty = n.canEdit && (action !== f.action || due !== (f.dueDate ?? ""));
  const key = `finding-${f.findingId}`;
  useEffect(() => { markDirty(key, dirty); return () => markDirty(key, false); }, [key, dirty, markDirty]);
  const sev = SEVERITY_PILL[f.severity];

  const toggle = (included: boolean) => save({ findings: [{ findingId: f.findingId, included }] }, included ? `included ${f.ruleCode}` : `left out ${f.ruleCode}`);
  const saveAction = () => {
    if (!action.trim()) return;
    save({ findings: [{ findingId: f.findingId, action: action.trim(), dueDate: due || null }] }, `action for ${f.ruleCode}`);
  };

  return (
    <li className={cn("space-y-3 px-4 py-4", !f.included && "bg-muted/30")} data-testid={`card-finding-${f.findingId}`}>
      <div className="flex flex-wrap items-start gap-3">
        {n.canEdit ? (
          <Checkbox id={`inc-${f.findingId}`} checked={f.included} onCheckedChange={(v) => toggle(v === true)} disabled={pending} className="mt-1"
            aria-label={`Include ${f.ruleCode} in the report`} data-testid={`checkbox-include-${f.findingId}`} />
        ) : null}
        <div className="min-w-0 flex-1">
          <p>
            <span className="mr-2 font-mono text-xs text-muted-foreground">{f.included ? `${idx}.` : "Left out ·"} {f.ruleCode}</span>
            <span className={cn("font-medium", !f.included && "text-muted-foreground")}>{f.ruleTitle}</span>
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <StatusPill variant={f.status} />
            <StatusPill variant={sev.variant} label={`${sev.label} severity`} />
            <span>{f.theme}</span>
            <span>·</span>
            <Link href={`/review/${f.findingId}`} className="underline underline-offset-2">open finding</Link>
          </p>
        </div>
      </div>
      {!f.stillEligible ? (
        <p className="flex items-start gap-2 text-xs text-[hsl(var(--tone-warn))]" data-testid={`text-not-eligible-${f.findingId}`}>
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> This finding is no longer an approved breach or warning. Update the report from current decisions to remove it.
        </p>
      ) : null}
      {f.included ? (
        <>
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">What we found</p>
            <ToolText>{f.rationale}</ToolText>
            {f.examinerNote ? <ExaminerNote author={f.decidedBy ? `${personName(f.decidedBy)}${f.approvedBy ? `, approved by ${personName(f.approvedBy)}` : ""}` : undefined}>{f.examinerNote}</ExaminerNote> : null}
          </div>
          {f.evidence.length ? (
            <div className="space-y-2">
              {f.evidence.map((e, i) => {
                const rtl = ARABIC_CHAR.test(e.quote);
                return (
                  <BankQuote key={i} document={`${e.documentName}${e.verified ? "" : " · quote not found in the document"}`} page={e.pageNo} dir={rtl ? "rtl" : "ltr"}
                    data-testid={`quote-${f.findingId}-${i}`}>
                    {e.quote}
                  </BankQuote>
                );
              })}
            </div>
          ) : <p className="text-xs text-muted-foreground">No quote was cited for this finding.</p>}
          <div>
            <Button variant="ghost" size="sm" className="-ml-2" aria-expanded={ruleOpen} onClick={() => setRuleOpen((o) => !o)} data-testid={`button-rule-${f.findingId}`}>
              <ChevronDown className={ruleOpen ? "rotate-180" : ""} aria-hidden /> {ruleOpen ? "Hide rule text" : "Show rule text"}
            </Button>
            {ruleOpen ? <p className="mt-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">{f.ruleText}{f.sourceRef ? <span className="block font-mono text-xs text-muted-foreground">Source: {f.sourceRef}</span> : null}</p> : null}
          </div>
          {n.canEdit ? (
            <div className="space-y-2 rounded-md border border-dashed border-border p-3" data-testid={`form-action-${f.findingId}`}>
              <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
                <div>
                  <Label htmlFor={`act-${f.findingId}`}>What the bank must do</Label>
                  <Textarea id={`act-${f.findingId}`} rows={3} maxLength={4000} value={action} onChange={(e) => setAction(e.target.value)} className="mt-1.5"
                    data-testid={`input-action-${f.findingId}`} />
                  {!action.trim() ? <p className="mt-1 text-xs text-[hsl(var(--tone-bad))]">Write what the bank must do.</p> : null}
                </div>
                <div>
                  <Label htmlFor={`due-${f.findingId}`}>Fix by</Label>
                  <Input id={`due-${f.findingId}`} type="date" value={due} onChange={(e) => setDue(e.target.value)} className="mt-1.5" data-testid={`input-due-${f.findingId}`} />
                </div>
              </div>
              {dirty ? (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={saveAction} disabled={pending || !action.trim()} data-testid={`button-save-action-${f.findingId}`}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setAction(f.action); setDue(f.dueDate ?? ""); }} data-testid={`button-discard-action-${f.findingId}`}>Discard</Button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-1 rounded-md border border-border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground">What the bank must do</p>
              <p className="text-sm" data-testid={`text-action-${f.findingId}`}>{f.action}</p>
              <p className="text-sm font-medium" data-testid={`text-due-${f.findingId}`}>Fix by {formatDay(f.dueDate)}</p>
            </div>
          )}
        </>
      ) : null}
    </li>
  );
}

function OutdatedBanner({ n }: { n: Notice }) {
  const create = useCreateNotice();
  const refresh = useNoticeRefresh();
  const router = useRouter();
  const { toast } = useToast();
  const { canWrite } = useCanWrite();
  if (!n.outdated) return null;
  const a = n.newer;
  const draft = (assessmentId: number) => create.mutate({ data: { assessmentId } }, {
    onSuccess: (r) => {
      refresh(r);
      toast({ title: `Drafted a report for ${r.productName}`, description: "Recorded in the audit log." });
      router.push(`/notices/${r.id}`);
    },
    onError: (e) => toast({ title: "Could not draft the report", description: parseApiError(e).message, variant: "destructive" }),
  });
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[hsl(var(--tone-warn)/0.35)] bg-[hsl(var(--tone-warn-bg))] px-4 py-3 text-sm" role="status" data-testid="banner-outdated">
      <p className="flex min-w-0 flex-1 items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[hsl(var(--tone-warn))]" aria-hidden />
        <span>
          {a ? (
            <>A newer assessment of this card exists (<Link href={`/assess/${a.assessmentId}`} className="font-mono underline underline-offset-2" data-testid="link-newer-assessment">assessment #{a.assessmentId}</Link>). This report is based on assessment #{n.assessmentId} and may no longer reflect the card.</>
          ) : (
            <>A newer assessment of this card exists. This report is based on assessment #{n.assessmentId} and may no longer reflect the card.</>
          )}
          {a && !a.noticeId && !a.approvedFindings ? " The newer assessment has no approved breach or warning yet, so a report cannot be drafted for it." : null}
        </span>
      </p>
      {a?.noticeId ? (
        <Button asChild size="sm" variant="outline" className="bg-card" data-testid="button-open-newer-report">
          <Link href={`/notices/${a.noticeId}`}>Open the newer report <ArrowRight aria-hidden /></Link>
        </Button>
      ) : a && a.approvedFindings > 0 ? (
        <Button size="sm" onClick={() => draft(a.assessmentId)} disabled={!canWrite || create.isPending} data-testid="button-draft-newer-report">
          <FilePen aria-hidden /> {create.isPending ? "Drafting…" : "Draft a report for the newer assessment"}
        </Button>
      ) : a ? (
        <Button asChild size="sm" variant="outline" className="bg-card" data-testid="button-review-newer">
          <Link href="/review">Go to Review <ArrowRight aria-hidden /></Link>
        </Button>
      ) : null}
    </div>
  );
}

function SyncBar({ n }: { n: Notice }) {
  const sync = useSyncNotice();
  const refresh = useNoticeRefresh();
  const { toast } = useToast();
  const stale = n.findings.filter((f) => !f.stillEligible).length;
  if (!n.canEdit) return null;
  const msg = [
    n.newlyEligible ? `${n.newlyEligible} newly approved finding${n.newlyEligible === 1 ? " is" : "s are"} not in the report yet` : null,
    stale ? `${stale} finding${stale === 1 ? " is" : "s are"} no longer approved and will be removed` : null,
  ].filter(Boolean).join("; ");
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3 text-sm",
      msg ? "border-[hsl(var(--tone-warn)/0.35)] bg-[hsl(var(--tone-warn-bg))]" : "border-card-border bg-card")} data-testid="bar-sync">
      <span>{msg ? `${msg}.` : "The report matches the current approved decisions."}</span>
      <Button size="sm" variant="outline" className="bg-card" disabled={sync.isPending}
        onClick={() => sync.mutate({ id: n.id }, {
          onSuccess: (r) => { refresh(r); toast({ title: "Report updated from current decisions", description: "Recorded in the audit log." }); },
          onError: (e) => toast({ title: "Could not update the report", description: parseApiError(e).message, variant: "destructive" }),
        })}
        data-testid="button-sync-notice">
        <RefreshCw className={cn(sync.isPending && "animate-spin")} aria-hidden /> Update from current decisions
      </Button>
    </div>
  );
}

function DatesAndBody({ n, markDirty }: { n: Notice; markDirty: MarkDirty }) {
  const { save, pending } = useSave(n);
  const [ref, setRef] = useState(n.referenceDate ?? "");
  const [body, setBody] = useState(n.body);
  useEffect(() => setRef(n.referenceDate ?? ""), [n.referenceDate]);
  useEffect(() => setBody(n.body), [n.body]);
  const refDirty = n.canEdit && ref !== (n.referenceDate ?? "");
  const bodyDirty = n.canEdit && body !== n.body;
  useEffect(() => { markDirty("ref", refDirty); return () => markDirty("ref", false); }, [refDirty, markDirty]);
  useEffect(() => { markDirty("body", bodyDirty); return () => markDirty("body", false); }, [bodyDirty, markDirty]);
  const bodyRtl = ARABIC_CHAR.test(body);

  return (
    <div className="space-y-4">
      <dl className="grid gap-3 rounded-lg border border-card-border bg-card p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Reference date</dt>
          <dd className="mt-1">
            {n.canEdit ? (
              <div className="flex flex-wrap items-center gap-2">
                <Input type="date" value={ref} onChange={(e) => setRef(e.target.value)} className="w-44" aria-label="Reference date" data-testid="input-reference-date" />
                {refDirty && ref ? (
                  <>
                    <Button size="sm" onClick={() => save({ referenceDate: ref }, "reference date")} disabled={pending} data-testid="button-save-reference-date">Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setRef(n.referenceDate ?? "")}>Discard</Button>
                  </>
                ) : null}
              </div>
            ) : <span className="font-mono" data-testid="text-reference-date">{formatDay(n.referenceDate)}</span>}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Bank to respond by</dt>
          <dd className="mt-1" data-testid="text-response-due">
            <span className="font-mono">{formatDay(n.responseDueDate)}</span>
            <span className="block text-xs text-muted-foreground">{n.responseDays} business days after the reference date</span>
          </dd>
        </div>
      </dl>
      <div className="space-y-2">
        <Label htmlFor="n-body">Cover note</Label>
        {n.canEdit ? (
          <>
            <Textarea id="n-body" rows={8} maxLength={20000} value={body} onChange={(e) => setBody(e.target.value)} dir={bodyRtl ? "rtl" : "ltr"}
              placeholder="Opening text of the report: context, scope, and what you ask the bank to do overall" className={cn(bodyRtl && "font-arabic")} data-testid="input-body" />
            {bodyDirty ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => save({ body }, "cover note")} disabled={pending} data-testid="button-save-body">Save cover note</Button>
                <Button size="sm" variant="ghost" onClick={() => setBody(n.body)}>Discard</Button>
              </div>
            ) : null}
          </>
        ) : n.body.trim() ? (
          <p dir={bodyRtl ? "rtl" : "ltr"} className={cn("whitespace-pre-wrap rounded-lg border border-card-border bg-card p-4 text-sm", bodyRtl && "font-arabic text-right")} data-testid="text-body">{n.body}</p>
        ) : <p className="text-sm text-muted-foreground" data-testid="text-body-empty">No cover note.</p>}
      </div>
    </div>
  );
}

const STEP_LABEL = { submit: "Sent for approval", approve: "Approved", return: "Returned" } as const;

function History({ n }: { n: Notice }) {
  if (!n.history.length) return <p className="text-sm text-muted-foreground" data-testid="text-no-history">Not sent for approval yet. Drafted {formatStamp(n.createdAt)}.</p>;
  return (
    <ol className="space-y-3" data-testid="list-notice-history">
      {[...n.history].reverse().map((h, i) => (
        <li key={i} className="space-y-1">
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">{formatStamp(h.at)}</span>
            <span className={cn("font-medium", h.action === "approve" ? "text-[hsl(var(--tone-ok))]" : h.action === "return" ? "text-[hsl(var(--tone-bad))]" : "text-foreground")}>{STEP_LABEL[h.action]}</span>
            <span>by {personName(h.actor, "unknown")}</span>
          </p>
          {h.note ? <ExaminerNote>{h.note}</ExaminerNote> : null}
        </li>
      ))}
    </ol>
  );
}

function DeleteDraft({ n }: { n: Notice }) {
  const del = useDeleteNotice();
  const refresh = useNoticeRefresh();
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  if (!n.canEdit) return null;
  return (
    <>
      <Button variant="ghost" size="sm" className="text-[hsl(var(--tone-bad))]" onClick={() => setOpen(true)} data-testid="button-delete-notice">
        <Trash2 aria-hidden /> Delete this draft
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent data-testid="dialog-delete-notice">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this draft report?</AlertDialogTitle>
            <AlertDialogDescription>
              The report for {n.productName} ({n.bankName}) and its edits are removed. The findings and decisions stay; you can draft a new report later. The deletion is recorded in the audit log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-delete-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={del.isPending} data-testid="button-delete-confirm"
              onClick={() => del.mutate({ id: n.id }, {
                onSuccess: () => { refresh(undefined, n.id); toast({ title: "Draft report deleted" }); router.push("/notices"); },
                onError: (e) => toast({ title: "Could not delete", description: parseApiError(e).message, variant: "destructive" }),
              })}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function NoticeDetailView({ id }: { id: number }) {
  const q = useGetNotice(id, { query: { enabled: Number.isFinite(id), queryKey: getGetNoticeQueryKey(id) } });
  const [dirtyKeys, setDirtyKeys] = useState<Record<string, boolean>>({});
  const markDirty = useCallback<MarkDirty>((k, v) => setDirtyKeys((p) => (!!p[k] === v ? p : { ...p, [k]: v })), []);
  const n = q.data;

  if (q.isLoading) {
    return <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-10 sm:px-6 lg:px-10"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }
  if (q.isError || !n) {
    const pe = parseApiError(q.error);
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-10 sm:px-6 lg:px-10">
        <QueryError title={pe.status === 404 ? "Report not found" : "Could not load this report"} error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} testId="error-notice" />
        <Link href="/notices" className="text-sm underline underline-offset-2">Back to Notices</Link>
      </div>
    );
  }

  const dirty = Object.values(dirtyKeys).some(Boolean);
  const included = n.findings.filter((f) => f.included);
  const breaches = included.filter((f) => f.status === "breach").length;
  const warnings = included.length - breaches;
  const left = n.findings.length - included.length;
  const arabic = hasArabic(n);
  let i = 0;

  return (
    <PageFrame
      eyebrow={`Step 4 of 4 · Notices · Report #${n.id}`}
      question={`What would we ask ${n.bankName} to fix on ${n.productName}?`}
      meta={
        <>
          <NoticeStateTag state={n.state} testId="state-notice" />
          {n.assessmentId ? <Link href={`/assess/${n.assessmentId}`} className="font-mono text-xs text-muted-foreground underline underline-offset-2">assessment #{n.assessmentId}</Link> : <span className="text-xs text-muted-foreground">assessment deleted</span>}
          <span className="font-mono text-xs text-muted-foreground">updated {formatStamp(n.updatedAt)}</span>
        </>
      }
      primaryAction={<DownloadButtons n={n} />}
      answer={
        <div className="space-y-4">
          <p className="text-[15px]" data-testid="text-answer">
            {included.length
              ? `${breaches} breach${breaches === 1 ? "" : "es"} and ${warnings} warning${warnings === 1 ? "" : "s"} to fix; the bank responds by ${formatDay(n.responseDueDate)}.`
              : "No finding is included yet, so the report asks the bank for nothing."}
            {left ? ` ${left} left out.` : ""}
            {" "}Overall rating: <span className="font-mono">{n.overall.rating !== null ? `${n.overall.rating} ${n.overall.label ?? ""}${n.overall.provisional ? " (provisional)" : ""}` : "not rated"}</span>.
          </p>
          <OutdatedBanner n={n} />
          <DraftsOnlyNotice />
          {n.state !== "approved" ? (
            <p className="flex items-start gap-2 text-xs text-muted-foreground" data-testid="text-not-approved">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Not approved yet: downloads are marked “not approved” and are an internal working copy.
            </p>
          ) : null}
          {arabic ? (
            <p className="flex items-start gap-2 text-xs text-muted-foreground" data-testid="text-arabic-word">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> This report contains Arabic text. The PDF cannot show it; use Download Word for the full text.
            </p>
          ) : null}
          <ApprovalBlock n={n} dirty={dirty} />
          <ViewerReason />
        </div>
      }
      labels={{ reason: "Ratings by theme", evidence: "Findings and what the bank must do", action: "Dates, cover note and history" }}
      reason={
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Rating 1 Strong to 4 Weak. Complaint counts are context only and never change a rating.</p>
          <ThemesTable n={n} />
        </div>
      }
      evidence={
        <div className="space-y-3">
          <SyncBar n={n} />
          {n.findings.length ? (
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-card-border bg-card" data-testid="list-notice-findings">
              {n.findings.map((f) => <FindingCard key={f.findingId} f={f} idx={f.included ? ++i : 0} n={n} markDirty={markDirty} />)}
            </ul>
          ) : <p className="text-sm text-muted-foreground" data-testid="text-no-findings">No findings in this report.</p>}
        </div>
      }
      action={
        <div className="space-y-6">
          <DatesAndBody n={n} markDirty={markDirty} />
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Approval history, newest first</p>
            <History n={n} />
          </div>
          <DeleteDraft n={n} />
        </div>
      }
      next={{ href: "/notices", label: "All reports" }}
    />
  );
}
