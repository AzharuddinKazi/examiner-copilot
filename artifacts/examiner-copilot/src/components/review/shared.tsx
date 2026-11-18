"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import {
  getGetFindingQueryKey, getGetReviewQueueQueryKey, getGetWorkspaceProgressQueryKey, getListAuditEventsQueryKey,
  type Decision,
} from "@workspace/api-client-react";
import { StatusPill } from "@/components/voice";

export const DECISION_LABELS: Record<Decision["decision"], string> = {
  accept: "Accepted",
  modify: "Changed",
  reject: "Rejected",
};

export const APPROVAL_LABELS: Record<Decision["approvalStatus"], string> = {
  not_required: "Final",
  awaiting: "Awaiting approval",
  approved: "Approved",
  returned: "Returned",
};

/** Small tag for the maker-checker state. Nothing is shown for routine accepts that need no approval. */
export function ApprovalTag({ d }: { d: Decision }) {
  if (d.approvalStatus === "not_required") return null;
  const tone =
    d.approvalStatus === "approved"
      ? "border-[hsl(var(--tone-ok)/0.35)] bg-[hsl(var(--tone-ok-bg))] text-[hsl(var(--tone-ok))]"
      : d.approvalStatus === "returned"
        ? "border-[hsl(var(--tone-bad)/0.35)] bg-[hsl(var(--tone-bad-bg))] text-[hsl(var(--tone-bad))]"
        : "border-[hsl(var(--tone-warn)/0.35)] bg-[hsl(var(--tone-warn-bg))] text-[hsl(var(--tone-warn))]";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone}`} data-testid={`tag-approval-${d.approvalStatus}`}>
      {APPROVAL_LABELS[d.approvalStatus]}
    </span>
  );
}

/** The examiner's outcome, shown in place of (not mixed with) the agent's proposal. */
export function DecisionOutcome({ d, testId }: { d: Decision; testId?: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-xs text-pen" data-testid={testId}>
      <span className="font-medium">{DECISION_LABELS[d.decision]}</span>
      {d.finalStatus ? <StatusPill variant={d.finalStatus} /> : <span className="text-muted-foreground">no finding stands</span>}
      <ApprovalTag d={d} />
    </span>
  );
}

export function useReviewInvalidate() {
  const qc = useQueryClient();
  return useCallback(
    (findingId?: number) => {
      qc.invalidateQueries({ queryKey: getGetReviewQueueQueryKey() });
      if (findingId) qc.invalidateQueries({ queryKey: getGetFindingQueryKey(findingId) });
      else qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0] ?? "").startsWith("/api/findings/") });
      qc.invalidateQueries({ queryKey: getGetWorkspaceProgressQueryKey() });
      qc.invalidateQueries({ queryKey: getListAuditEventsQueryKey() });
    },
    [qc],
  );
}
