"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAcceptCompliantFindings, useGetReviewQueue, type ReviewItem, type ReviewProduct } from "@workspace/api-client-react";
import { ArrowRight, CheckCircle2, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageFrame } from "@/components/page-frame";
import { EmptyState, QueryError } from "@/components/states";
import { StatusPill } from "@/components/voice";
import { DecisionOutcome, useReviewInvalidate } from "@/components/review/shared";
import { useToast } from "@/hooks/use-toast";
import { parseApiError } from "@/lib/api-errors";
import { SEVERITY_PILL } from "@/lib/labels";
import { useCanWrite, ViewerReason } from "@/lib/write-access";
import { cn } from "@/lib/utils";

type Filter = "undecided" | "to_approve" | "awaiting" | "returned" | "disagrees" | "decided" | "all";

/** Needs work from the maker: no decision yet, or a senior examiner returned it. */
const needsMaker = (i: ReviewItem) => !i.decision || i.decision.approvalStatus === "returned";
const isFinal = (i: ReviewItem) => !!i.decision && (i.decision.approvalStatus === "not_required" || i.decision.approvalStatus === "approved");

function QueueRow({ i }: { i: ReviewItem }) {
  const sev = SEVERITY_PILL[i.severity];
  const serious = i.proposedStatus === "breach" || i.proposedStatus === "warning" || i.proposedStatus === "needs_review";
  return (
    <li data-testid={`row-review-${i.findingId}`}>
      <Link href={`/review/${i.findingId}`}
        className="grid gap-2 px-4 py-3 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[1fr_auto] sm:items-center">
        <span className="min-w-0">
          <span className="block">
            <span className="mr-2 font-mono text-xs text-muted-foreground">{i.ruleCode}</span>
            <span className="font-medium">{i.ruleTitle}</span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {i.productName ?? "Deleted product"}
            {i.verification === "unsupported" ? <span className="text-[hsl(var(--tone-bad))]"> · quote not found in the document</span> : null}
            {i.challengerVerdict === "does_not_support" ? <span className="text-[hsl(var(--tone-warn))]" data-testid={`text-disagrees-${i.findingId}`}> · Challenger disagrees with the Rule agent</span> : null}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-1.5 sm:justify-end">
          {i.decision ? (
            <DecisionOutcome d={i.decision} testId={`outcome-${i.findingId}`} />
          ) : (
            <>
              <span className="text-xs text-muted-foreground">Proposed</span>
              <StatusPill variant={i.proposedStatus} />
              {serious ? <StatusPill variant={sev.variant} label={sev.label} /> : <span className="sr-only">{sev.label} severity</span>}
            </>
          )}
        </span>
      </Link>
    </li>
  );
}

function ProductRow({ p, onBulk, canWrite }: { p: ReviewProduct; onBulk: (p: ReviewProduct) => void; canWrite: boolean }) {
  const done = p.total - p.undecided;
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center" data-testid={`row-product-${p.productId}`}>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{p.productName ?? "Deleted product"}</p>
        <p className="text-xs text-muted-foreground">
          {p.bankName} · <Link href={`/assess/${p.assessmentId}`} className="underline underline-offset-2">assessment #{p.assessmentId}</Link>
        </p>
      </div>
      <div className="flex items-center gap-3">
        <div className="w-28">
          <div className="flex justify-between font-mono text-[11px] text-muted-foreground"><span>decided</span><span className="text-foreground">{done}/{p.total}</span></div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${p.productName} decided`} aria-valuenow={done} aria-valuemin={0} aria-valuemax={p.total}>
            <div className="h-full origin-left rounded-full bg-pen" style={{ transform: `scaleX(${p.total ? done / p.total : 0})` }} />
          </div>
        </div>
        {p.bulkAcceptable > 0 ? (
          <Button size="sm" variant="outline" className="bg-card" onClick={() => onBulk(p)} disabled={!canWrite} data-testid={`button-bulk-${p.assessmentId}`}>
            Accept {p.bulkAcceptable} compliant
          </Button>
        ) : null}
      </div>
    </li>
  );
}

export function ReviewView() {
  const { canWrite } = useCanWrite();
  const q = useGetReviewQueue();
  const bulk = useAcceptCompliantFindings();
  const invalidate = useReviewInvalidate();
  const { toast } = useToast();
  const isSenior = useCanWrite().role === "senior_examiner";
  const [filter, setFilter] = useState<Filter>("undecided");
  const [bulkFor, setBulkFor] = useState<ReviewProduct | null>(null);
  const d = q.data;

  const shown = useMemo(() => {
    if (!d) return [];
    return d.items.filter((i) => {
      switch (filter) {
        case "all": return true;
        case "decided": return isFinal(i);
        case "awaiting": return i.decision?.approvalStatus === "awaiting";
        case "to_approve": return i.decision?.approvalStatus === "awaiting" && !i.decision.makerIsYou;
        case "returned": return i.decision?.approvalStatus === "returned";
        case "disagrees": return i.challengerVerdict === "does_not_support";
        default: return needsMaker(i);
      }
    });
  }, [d, filter]);

  if (q.isLoading) {
    return <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-10 sm:px-6 lg:px-10"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }
  if (q.isError || !d) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-10">
        <QueryError title="Could not load the review queue" error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} testId="error-review" />
      </div>
    );
  }

  const firstUndecided = d.items.find(needsMaker);
  const c = d.counts;
  const serious = d.items.filter((i) => needsMaker(i) && (i.proposedStatus === "breach" || i.proposedStatus === "warning" || i.proposedStatus === "needs_review")).length;
  const toApprove = d.items.filter((i) => i.decision?.approvalStatus === "awaiting" && !i.decision.makerIsYou);
  const filters: [Filter, string][] = [
    ["undecided", `To decide (${c.undecided})`],
    ...(isSenior ? ([["to_approve", `To approve (${toApprove.length})`]] as [Filter, string][]) : []),
    ["awaiting", `Awaiting approval (${c.awaitingApproval})`],
    ["returned", `Returned (${c.returned})`],
    ["disagrees", `Disagrees with Rule agent (${c.disagreements})`],
    ["decided", `Decided (${c.decided})`],
    ["all", `All (${c.total})`],
  ];

  const runBulk = () => {
    if (!bulkFor) return;
    bulk.mutate({ data: { assessmentId: bulkFor.assessmentId } }, {
      onSuccess: (r) => {
        invalidate();
        toast({ title: `Accepted ${r.accepted} proposal${r.accepted === 1 ? "" : "s"}`, description: `${bulkFor.productName}. Each is recorded in the audit log.` });
        setBulkFor(null);
      },
      onError: (e) => { toast({ title: "Could not accept", description: parseApiError(e).message, variant: "destructive" }); setBulkFor(null); },
    });
  };

  return (
    <>
      <PageFrame
        eyebrow="Step 3 of 4 · Review and decide"
        question="Do you agree with these findings?"
        primaryAction={
          firstUndecided ? (
            <Button asChild data-testid="button-start-review">
              <Link href={`/review/${firstUndecided.findingId}`}>{c.decided ? "Continue review" : "Start review"} <ArrowRight aria-hidden /></Link>
            </Button>
          ) : (
            <Button disabled data-testid="button-start-review">{c.total ? "All decided" : "Nothing to review"}</Button>
          )
        }
        answer={
          c.total === 0 ? (
            <EmptyState icon={Inbox} title="Nothing to review" testId="empty-review"
              action={<Button asChild variant="outline" className="bg-card"><Link href="/assess">Go to Assess</Link></Button>}>
              Findings appear here after an assessment finishes.
            </EmptyState>
          ) : (
            <div className="space-y-3">
              <p className="text-[15px]" data-testid="text-answer">
                {c.undecided === 0
                  ? c.awaitingApproval
                    ? `Every finding has a decision; ${c.awaitingApproval} await a senior examiner's approval before they count.`
                    : `All ${c.total} findings have a final decision: ${c.accepted} accepted, ${c.modified} changed, ${c.rejected} rejected.`
                  : `${c.undecided} of ${c.total} findings await your decision${serious ? `, ${serious} of them breach, warning or needs review` : ""}${c.returned ? `; ${c.returned} were returned with a note` : ""}.`}
              </p>
              {isSenior && toApprove.length ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[hsl(var(--tone-warn)/0.35)] bg-[hsl(var(--tone-warn-bg))] px-4 py-3 text-sm" data-testid="banner-to-approve">
                  <span><strong className="font-semibold">{toApprove.length} decision{toApprove.length === 1 ? "" : "s"} to approve.</strong> Made by another examiner; they do not count until you approve them.</span>
                  <Button size="sm" variant="outline" className="bg-card" onClick={() => setFilter("to_approve")} data-testid="button-show-to-approve">Show them</Button>
                </div>
              ) : null}
              <ul className="divide-y divide-border rounded-lg border border-card-border bg-card" data-testid="list-review-products">
                {d.products.map((p) => <ProductRow key={p.assessmentId} p={p} onBulk={setBulkFor} canWrite={canWrite} />)}
              </ul>
              <ViewerReason />
            </div>
          )
        }
        reason={
          c.total ? (
            <p className="text-sm text-muted-foreground">
              The queue holds findings from the latest finished assessment of each product, most serious first. The agents proposed them; nothing is final until you decide. A Breach, or any change or rejection, also needs a different senior examiner to approve it; until then it does not count in scores or notices. Decisions are added to the record, never overwritten.
            </p>
          ) : undefined
        }
        evidence={
          c.total ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1" role="group" aria-label="Show findings">
                {filters.map(([k, label]) => (
                  <Button key={k} size="sm" variant={filter === k ? "secondary" : "ghost"} aria-pressed={filter === k} onClick={() => setFilter(k)} data-testid={`filter-review-${k}`}>{label}</Button>
                ))}
              </div>
              {shown.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="text-filter-empty">
                  {filter === "undecided" ? <><CheckCircle2 className="size-4" aria-hidden /> Every finding has a decision.</> : filter === "to_approve" ? "Nothing waiting for your approval." : "Nothing here."}
                </p>
              ) : (
                <ul className={cn("divide-y divide-border overflow-hidden rounded-lg border border-card-border bg-card")} data-testid="list-review">
                  {shown.map((i) => <QueueRow key={i.findingId} i={i} />)}
                </ul>
              )}
            </div>
          ) : undefined
        }
        next={{ href: "/notices", label: "Notices" }}
      />
      <AlertDialog open={!!bulkFor} onOpenChange={(o) => !o && setBulkFor(null)}>
        <AlertDialogContent data-testid="dialog-bulk-accept">
          <AlertDialogHeader>
            <AlertDialogTitle>Accept {bulkFor?.bulkAcceptable} compliant proposals?</AlertDialogTitle>
            <AlertDialogDescription>
              For {bulkFor?.productName}: every undecided Compliant or Not applicable proposal whose quotes were found in the documents. Breaches, warnings and needs-review findings are not included. You can change any of them later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-bulk-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runBulk} disabled={bulk.isPending} data-testid="button-bulk-confirm">Accept</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
