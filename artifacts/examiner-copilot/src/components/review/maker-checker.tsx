"use client";

import { ShieldAlert } from "lucide-react";
import { useGetWorkspaceStatus, type MakerCheckerMode } from "@workspace/api-client-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export const SELF_APPROVED_LABEL = "Self-approved (PoC mode)";
export const POC_BANNER_TEXT = "PoC mode: one person can both decide and approve. Production requires a different senior examiner.";

export const MAKER_CHECKER_LABELS: Record<MakerCheckerMode, string> = {
  strict: "Strict",
  poc: "Single-user PoC mode",
};

/** The workspace maker-checker mode. Strict until the status has loaded, so nothing is unlocked early. */
export function useMakerCheckerMode() {
  const s = useGetWorkspaceStatus();
  const mode: MakerCheckerMode = s.data?.makerCheckerMode ?? "strict";
  return { mode, poc: mode === "poc", query: s };
}

/** Shown on Review and Notices while PoC mode is on. */
export function PocModeBanner({ className }: { className?: string }) {
  const { poc } = useMakerCheckerMode();
  if (!poc) return null;
  return (
    <Alert
      className={cn("border-[hsl(var(--tone-warn)/0.35)] bg-[hsl(var(--tone-warn-bg))] text-[hsl(var(--tone-warn))] [&>svg]:text-[hsl(var(--tone-warn))]", className)}
      data-testid="banner-poc-mode"
    >
      <ShieldAlert className="size-4" aria-hidden />
      <AlertDescription className="font-medium">{POC_BANNER_TEXT}</AlertDescription>
    </Alert>
  );
}

/** Small tag marking an approval made by the maker themselves (PoC mode only). */
export function SelfApprovedTag({ testId = "tag-self-approved" }: { testId?: string }) {
  return (
    <span className="rounded-full border border-[hsl(var(--tone-warn)/0.35)] bg-[hsl(var(--tone-warn-bg))] px-2 py-0.5 text-[11px] font-medium text-[hsl(var(--tone-warn))]" data-testid={testId}>
      {SELF_APPROVED_LABEL}
    </span>
  );
}
