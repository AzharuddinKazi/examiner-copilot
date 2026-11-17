"use client";

import type { ReactNode } from "react";
import { AlertCircle, RotateCw, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string")
    return (err as { message: string }).message;
  return "The server did not respond as expected.";
}

export function QueryError({
  title, error, onRetry, retrying, testId = "error-query",
}: { title: string; error?: unknown; onRetry: () => void; retrying?: boolean; testId?: string }) {
  return (
    <div role="alert" data-testid={testId}
      className="flex flex-col gap-3 rounded-lg border border-[hsl(var(--tone-bad)/0.3)] bg-[hsl(var(--tone-bad-bg))] p-4 sm:flex-row sm:items-center">
      <AlertCircle className="size-5 shrink-0 text-[hsl(var(--tone-bad))]" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[hsl(var(--tone-bad))]">{title}</p>
        <p className="font-mono text-xs text-foreground/75 break-words">{errorMessage(error)}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry} disabled={retrying} data-testid={`${testId}-retry`} className="bg-card">
        <RotateCw className={cn(retrying && "animate-spin")} aria-hidden /> Try again
      </Button>
    </div>
  );
}

export function EmptyState({
  icon: Icon, title, children, action, testId = "empty-state", className,
}: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode; testId?: string; className?: string }) {
  return (
    <div data-testid={testId}
      className={cn("rounded-lg border border-dashed border-border bg-card/60 px-6 py-8 text-center", className)}>
      <Icon className="mx-auto mb-2 size-5 text-muted-foreground" aria-hidden />
      <p className="font-medium">{title}</p>
      {children ? <div className="mx-auto mt-1.5 max-w-prose text-sm text-muted-foreground">{children}</div> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
