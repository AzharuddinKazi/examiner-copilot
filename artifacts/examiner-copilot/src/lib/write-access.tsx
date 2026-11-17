"use client";

import { useCallback } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { getGetWorkspaceProgressQueryKey, getListAuditEventsQueryKey } from "@workspace/api-client-react";
import { useRole } from "@/lib/role";
import { cn } from "@/lib/utils";

export const VIEWER_REASON = "Viewer can look but not change anything (role is self-selected, not verified)";

export function useCanWrite() {
  const { role } = useRole();
  return { role, canWrite: role !== "viewer" };
}

export function ViewerReason({ className, testId = "text-viewer-reason" }: { className?: string; testId?: string }) {
  const { canWrite } = useCanWrite();
  if (canWrite) return null;
  return (
    <p data-testid={testId} className={cn("flex items-start gap-1.5 text-xs text-muted-foreground", className)}>
      <Lock className="mt-0.5 size-3 shrink-0" aria-hidden /> {VIEWER_REASON}
    </p>
  );
}

/** Invalidate the given keys plus workspace progress and the audit log. */
export function useInvalidate() {
  const qc = useQueryClient();
  return useCallback(
    (keys: QueryKey[]) => {
      for (const k of keys) qc.invalidateQueries({ queryKey: k });
      qc.invalidateQueries({ queryKey: getGetWorkspaceProgressQueryKey() });
      qc.invalidateQueries({ queryKey: getListAuditEventsQueryKey() });
    },
    [qc],
  );
}
