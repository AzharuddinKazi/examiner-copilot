"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCreateNotice, useListNotices, type NoticeReadyCard, type NoticeSummary } from "@workspace/api-client-react";
import { ArrowRight, FilePen, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageFrame } from "@/components/page-frame";
import { EmptyState, QueryError } from "@/components/states";
import { DraftsOnlyNotice, NoticeStateTag, formatDay, formatStamp, useNoticeRefresh } from "@/components/notices/shared";
import { useToast } from "@/hooks/use-toast";
import { parseApiError } from "@/lib/api-errors";
import { useCanWrite, ViewerReason } from "@/lib/write-access";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function ReportRow({ n }: { n: NoticeSummary }) {
  return (
    <li data-testid={`row-notice-${n.id}`}>
      <Link href={`/notices/${n.id}`}
        className="grid gap-2 px-4 py-3 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[1fr_auto] sm:items-center">
        <span className="min-w-0">
          <span className="block truncate font-medium">{n.productName}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {n.bankName} · {plural(n.findings, "finding", "findings")} · bank to respond by {formatDay(n.responseDueDate)}
            {n.outdated ? <span className="text-[hsl(var(--tone-warn))]" data-testid={`text-outdated-${n.id}`}> · a newer assessment exists</span> : null}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-2 sm:justify-end">
          <span className="font-mono text-[11px] text-muted-foreground">updated {formatStamp(n.updatedAt)}</span>
          <NoticeStateTag state={n.state} testId={`state-notice-${n.id}`} />
        </span>
      </Link>
    </li>
  );
}

function ReadyRow({ r, onDraft, pending }: { r: NoticeReadyCard; onDraft: (r: NoticeReadyCard) => void; pending: boolean }) {
  const { canWrite } = useCanWrite();
  const count = r.breaches + r.warnings;
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center" data-testid={`row-ready-${r.assessmentId}`}>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{r.productName}</p>
        <p className="text-xs text-muted-foreground">
          {r.bankName} · <Link href={`/assess/${r.assessmentId}`} className="underline underline-offset-2">assessment #{r.assessmentId}</Link>
          {" · "}
          <span className="font-mono">{r.breaches} B · {r.warnings} W</span> approved
        </p>
      </div>
      {r.noticeId ? (
        <Button asChild size="sm" variant="outline" className="bg-card" data-testid={`button-open-${r.assessmentId}`}>
          <Link href={`/notices/${r.noticeId}`}>Open report</Link>
        </Button>
      ) : count > 0 ? (
        <Button size="sm" onClick={() => onDraft(r)} disabled={!canWrite || pending} data-testid={`button-draft-${r.assessmentId}`}>
          <FilePen aria-hidden /> Draft report
        </Button>
      ) : (
        <span className="text-xs text-muted-foreground" data-testid={`text-not-ready-${r.assessmentId}`}>No approved breach or warning yet</span>
      )}
    </li>
  );
}

export function NoticesView() {
  const q = useListNotices();
  const create = useCreateNotice();
  const refresh = useNoticeRefresh();
  const router = useRouter();
  const { toast } = useToast();
  const { canWrite } = useCanWrite();
  const [draftingFor, setDraftingFor] = useState<number | null>(null);
  const d = q.data;

  if (q.isLoading) {
    return <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-10 sm:px-6 lg:px-10"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }
  if (q.isError || !d) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-10">
        <QueryError title="Could not load the reports" error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} testId="error-notices" />
      </div>
    );
  }

  const draft = (r: NoticeReadyCard) => {
    setDraftingFor(r.assessmentId);
    create.mutate({ data: { assessmentId: r.assessmentId } }, {
      onSuccess: (n) => {
        refresh(n);
        toast({ title: `Drafted a report for ${n.productName}`, description: "Recorded in the audit log." });
        router.push(`/notices/${n.id}`);
      },
      onError: (e) => { toast({ title: "Could not draft the report", description: parseApiError(e).message, variant: "destructive" }); setDraftingFor(null); },
    });
  };

  const draftable = d.ready.filter((r) => !r.noticeId && r.breaches + r.warnings > 0);
  const by = (s: NoticeSummary["state"]) => d.notices.filter((n) => n.state === s).length;
  const counts = { draft: by("draft"), awaiting: by("awaiting"), approved: by("approved"), returned: by("returned") };
  const parts = [
    counts.awaiting && `${counts.awaiting} awaiting a senior examiner's approval`,
    counts.returned && `${counts.returned} returned with a note`,
    counts.draft && `${plural(counts.draft, "draft", "drafts")} in progress`,
    counts.approved && `${counts.approved} approved`,
  ].filter(Boolean);
  const answer = d.notices.length
    ? `${plural(d.notices.length, "report", "reports")}: ${parts.join(", ")}.${draftable.length ? ` ${plural(draftable.length, "card is", "cards are")} ready for a new report.` : ""}`
    : draftable.length
      ? `No reports yet. ${plural(draftable.length, "card has", "cards have")} approved breaches or warnings ready to report.`
      : "No reports yet, and no card has an approved breach or warning to report.";

  const first = draftable[0];
  return (
    <PageFrame
      eyebrow="Step 4 of 4 · Notices (draft only)"
      question="What would we ask the bank to fix?"
      primaryAction={
        first ? (
          <Button onClick={() => draft(first)} disabled={!canWrite || create.isPending} data-testid="button-primary">
            <FilePen aria-hidden /> {create.isPending ? "Drafting…" : `Draft report: ${first.productName}`}
          </Button>
        ) : d.notices[0] ? (
          <Button asChild variant="outline" className="bg-card" data-testid="button-primary">
            <Link href={`/notices/${d.notices[0].id}`}>Open latest report <ArrowRight aria-hidden /></Link>
          </Button>
        ) : (
          <Button disabled data-testid="button-primary">Nothing ready to report</Button>
        )
      }
      answer={
        <div className="space-y-4">
          <p className="text-[15px]" data-testid="text-answer">{answer}</p>
          <DraftsOnlyNotice />
          {d.notices.length ? (
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-card-border bg-card" data-testid="list-notices">
              {d.notices.map((n) => <ReportRow key={n.id} n={n} />)}
            </ul>
          ) : (
            <EmptyState icon={FileText} title="No reports yet" testId="empty-notices"
              action={<Button asChild variant="outline" className="bg-card"><Link href="/review">Go to Review</Link></Button>}>
              A report is drafted from the approved breaches and warnings of one assessment.
            </EmptyState>
          )}
          <ViewerReason />
        </div>
      }
      reason={
        <ul className="max-w-prose list-disc space-y-1 pl-5 text-sm text-muted-foreground marker:text-border">
          <li>A report holds only findings an examiner decided as Breach or Warning and a senior examiner approved.</li>
          <li>Every requested fix cites the rule, the bank&apos;s own words and the page.</li>
          <li>A different senior examiner must approve the report before it is final. Downloads of unapproved reports are marked as such.</li>
        </ul>
      }
      labels={{ evidence: "Ready for a report" }}
      evidence={
        d.ready.length ? (
          <ul className="divide-y divide-border rounded-lg border border-card-border bg-card" data-testid="list-ready">
            {d.ready.map((r) => <ReadyRow key={r.assessmentId} r={r} onDraft={draft} pending={create.isPending && draftingFor === r.assessmentId} />)}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="text-no-ready">No finished assessment yet. Run one in Assess, then decide its findings in Review.</p>
        )
      }
      next={{ href: "/market", label: "Market view" }}
    />
  );
}
