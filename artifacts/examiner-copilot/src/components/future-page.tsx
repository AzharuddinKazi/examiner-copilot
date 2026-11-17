"use client";

import type { ReactNode } from "react";
import { Lock, BarChart3, BookOpen, Bot, FilePen, FileUp, FlaskConical, Gauge, Landmark, Scale, type LucideIcon } from "lucide-react";

const ICONS = { BarChart3, BookOpen, Bot, FilePen, FileUp, FlaskConical, Gauge, Landmark, Scale } satisfies Record<string, LucideIcon>;
export type FuturePageIcon = keyof typeof ICONS;
import { useGetWorkspaceProgress, type StepProgressKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
        <span className="inline-block rounded-md" data-testid="wrap-primary-disabled">
          <Button disabled data-testid="button-primary" aria-describedby="unavailable-reason">
            <Lock aria-hidden /> {primaryLabel}
          </Button>
        </span>
      }
      meta={<span id="unavailable-reason" className="text-sm text-muted-foreground" data-testid="text-unavailable-reason">{unavailableReason}</span>}
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
        <ul className="max-w-prose list-disc space-y-1 pl-5 text-sm text-muted-foreground marker:text-border">
          {willDo.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      }
      next={next}
    />
  );
}
