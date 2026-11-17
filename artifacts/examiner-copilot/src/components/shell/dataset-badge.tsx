"use client";

import { Database, FlaskConical } from "lucide-react";
import { useGetWorkspaceStatus } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";

export function DatasetBadge() {
  const { data, isLoading, isError, refetch } = useGetWorkspaceStatus();
  if (isLoading) return <Skeleton className="h-6 w-24 rounded-full" />;
  if (isError || !data)
    return (
      <button type="button" onClick={() => refetch()} data-testid="badge-dataset-error"
        className="rounded-full border border-dashed border-[hsl(var(--tone-bad)/0.5)] px-2.5 py-0.5 text-xs font-medium text-[hsl(var(--tone-bad))]">
        Dataset unknown · retry
      </button>
    );
  const live = data.mode === "live";
  return (
    <span data-testid="badge-dataset"
      className={
        live
          ? "inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground"
          : "inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--tone-warn)/0.4)] bg-[hsl(var(--tone-warn-bg))] px-2.5 py-0.5 text-xs font-semibold text-[hsl(var(--tone-warn))]"
      }>
      {live ? <Database className="size-3.5" aria-hidden /> : <FlaskConical className="size-3.5" aria-hidden />}
      {live ? "Live data" : "Demo data"}
    </span>
  );
}
