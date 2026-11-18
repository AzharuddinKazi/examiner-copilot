"use client";

import { ShieldCheck } from "lucide-react";
import {
  getGetWorkspaceStatusQueryKey, useSetMakerCheckerMode, type MakerCheckerMode,
} from "@workspace/api-client-react";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryError, errorMessage } from "@/components/states";
import { StatusPill } from "@/components/voice";
import { MAKER_CHECKER_LABELS, POC_BANNER_TEXT, useMakerCheckerMode } from "@/components/review/maker-checker";
import { useToast } from "@/hooks/use-toast";
import { useRole } from "@/lib/role";
import { useInvalidate } from "@/lib/write-access";

const OPTIONS: { value: MakerCheckerMode; hint: string }[] = [
  { value: "strict", hint: "A different senior examiner must approve each Breach, Modify or Reject decision and each report. Use this in production." },
  { value: "poc", hint: "For single-user trials only. A senior examiner may approve their own decisions and reports; each is marked Self-approved (PoC mode)." },
];

/** Workspace maker-checker mode. Senior examiners change it (audited); everyone else sees it read-only. */
export function MakerCheckerModeCard() {
  const { role } = useRole();
  const { mode, query } = useMakerCheckerMode();
  const set = useSetMakerCheckerMode();
  const invalidate = useInvalidate();
  const { toast } = useToast();
  const canManage = role === "senior_examiner";

  const change = (next: MakerCheckerMode) => {
    if (next === mode) return;
    set.mutate({ data: { mode: next } }, {
      onSuccess: () => {
        invalidate([getGetWorkspaceStatusQueryKey()]);
        toast({ title: `Maker-checker mode: ${MAKER_CHECKER_LABELS[next]}`, description: "Recorded in the audit log." });
      },
      onError: (e) => toast({ title: "Mode not changed", description: errorMessage(e), variant: "destructive" }),
    });
  };

  return (
    <section className="rounded-lg border border-card-border bg-card p-4" data-testid="card-maker-checker-mode">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ShieldCheck className="size-4 text-muted-foreground" aria-hidden />
        <h3 className="text-sm font-medium">Maker-checker mode</h3>
        {query.data ? (
          <StatusPill className="ml-auto" variant={mode === "strict" ? "done" : "warning"} label={MAKER_CHECKER_LABELS[mode]} data-testid="status-maker-checker-mode" />
        ) : null}
      </div>
      {query.isLoading ? <Skeleton className="h-20 w-full" /> : query.isError || !query.data ? (
        <QueryError title="Could not read the maker-checker mode" error={query.error} onRetry={() => query.refetch()} retrying={query.isFetching} testId="error-maker-checker-mode" />
      ) : (
        <div className="space-y-3">
          <RadioGroup value={mode} onValueChange={(v) => change(v as MakerCheckerMode)} disabled={!canManage || set.isPending} aria-label="Maker-checker mode" className="gap-3">
            {OPTIONS.map((o) => (
              <div key={o.value} className="flex items-start gap-2.5">
                <RadioGroupItem value={o.value} id={`mcm-${o.value}`} className="mt-0.5" data-testid={`radio-maker-checker-${o.value}`} />
                <Label htmlFor={`mcm-${o.value}`} className="space-y-0.5 font-normal">
                  <span className="block text-sm font-medium">{MAKER_CHECKER_LABELS[o.value]}{o.value === "strict" ? " (default)" : ""}</span>
                  <span className="block text-xs text-muted-foreground">{o.hint}</span>
                </Label>
              </div>
            ))}
          </RadioGroup>
          {mode === "poc" ? <p className="text-xs font-medium text-[hsl(var(--tone-warn))]" data-testid="text-poc-warning">{POC_BANNER_TEXT}</p> : null}
          <p className="text-xs text-muted-foreground" data-testid="text-maker-checker-access">
            {canManage ? "Each change is recorded in the audit log with the old and new mode." : "Only a senior examiner can change this."}
          </p>
        </div>
      )}
    </section>
  );
}
