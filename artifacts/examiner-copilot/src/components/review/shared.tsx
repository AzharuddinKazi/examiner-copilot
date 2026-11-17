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

/** The examiner's outcome, shown in place of (not mixed with) the agent's proposal. */
export function DecisionOutcome({ d, testId }: { d: Decision; testId?: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-xs text-pen" data-testid={testId}>
      <span className="font-medium">{DECISION_LABELS[d.decision]}</span>
      {d.finalStatus ? <StatusPill variant={d.finalStatus} /> : <span className="text-muted-foreground">no finding stands</span>}
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
