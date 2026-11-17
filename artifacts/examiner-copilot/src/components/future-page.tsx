"use client";

import type { ReactNode } from "react";
import { Lock, BarChart3, BookOpen, Bot, FilePen, FileUp, FlaskConical, Gauge, Landmark, Scale, type LucideIcon } from "lucide-react";

const ICONS = { BarChart3, BookOpen, Bot, FilePen, FileUp, FlaskConical, Gauge, Landmark, Scale } satisfies Record<string, LucideIcon>;
export type FuturePageIcon = keyof typeof ICONS;
import { useGetWorkspaceProgress, type StepProgressKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PageFrame } from "@/components/page-frame";
import { EmptyState, QueryError } from "@/components/states";
import { StepCounts } from "@/components/step-counts";
import { ToolText } from "@/components/voice";

export function FuturePage({
  eyebrow, question, stepKey, primaryLabel, unavailableReason, icon, emptyTitle, emptyBody, willDo, notice, next,
}: {
  eyebrow: string; question: string; stepKey?: StepProgressKey; primaryLabel: string; unavailableReason: string;
  icon: FuturePageIcon; emptyTitle: string; emptyBody: ReactNode; willDo: string[]; notice?: ReactNode;
  next: { href: string; label: string };
}) {
  const progress = useGetWorkspaceProgress();
  const step = stepKey ? progress.data?.steps.find((s) => s.key === stepKey) : undefined;

  return (
    <PageFrame
      eyebrow={eyebrow}
      question={question}
      primaryAction={
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="inline-block rounded-md" data-testid="wrap-primary-disabled">
              <Button disabled data-testid="button-primary">
                <Lock aria-hidden /> {primaryLabel}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>{unavailableReason}</TooltipContent>
        </Tooltip>
      }
      meta={<span className="text-xs text-muted-foreground" data-testid="text-unavailable-reason">{unavailableReason}</span>}
      answer={
        <div className="space-y-4">
          {notice}
          {stepKey ? (
            progress.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : progress.isError ? (
              <QueryError title="Could not load this step's progress" error={progress.error}
                onRetry={() => progress.refetch()} retrying={progress.isFetching} />
            ) : step ? (
              <div className="rounded-lg border border-card-border bg-card p-4" data-testid={`card-step-${step.key}`}>
                <StepCounts step={step} />
                <ToolText className="mt-3" data-testid="text-step-summary">{step.summary}</ToolText>
              </div>
            ) : null
          ) : null}
          <EmptyState icon={ICONS[icon]} title={emptyTitle}>{emptyBody}</EmptyState>
        </div>
      }
      reason={
        <ul className="grid gap-2 sm:grid-cols-2">
          {willDo.map((w, i) => (
            <li key={i} className="flex gap-3 rounded-lg border border-card-border bg-card p-3 text-sm">
              <span className="font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
              <span>{w}</span>
            </li>
          ))}
        </ul>
      }
      next={next}
    />
  );
}
