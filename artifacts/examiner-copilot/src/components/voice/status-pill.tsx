import {
  AlertCircle, AlertTriangle, CheckCircle2, Circle, CircleDot, Eye, FilePen, MinusCircle, XOctagon, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type StatusVariant =
  | "compliant" | "breach" | "warning" | "needs_review" | "not_applicable"
  | "not_started" | "in_progress" | "done" | "draft" | "error";

const TONES = {
  ok: "text-[hsl(var(--tone-ok))] bg-[hsl(var(--tone-ok-bg))] border-[hsl(var(--tone-ok)/0.25)]",
  bad: "text-[hsl(var(--tone-bad))] bg-[hsl(var(--tone-bad-bg))] border-[hsl(var(--tone-bad)/0.25)]",
  warn: "text-[hsl(var(--tone-warn))] bg-[hsl(var(--tone-warn-bg))] border-[hsl(var(--tone-warn)/0.25)]",
  info: "text-[hsl(var(--tone-info))] bg-[hsl(var(--tone-info-bg))] border-[hsl(var(--tone-info)/0.25)]",
  neutral: "text-[hsl(var(--tone-neutral))] bg-[hsl(var(--tone-neutral-bg))] border-[hsl(var(--tone-neutral)/0.25)]",
} as const;

const MAP: Record<StatusVariant, { icon: LucideIcon; label: string; tone: keyof typeof TONES }> = {
  compliant: { icon: CheckCircle2, label: "Compliant", tone: "ok" },
  breach: { icon: XOctagon, label: "Breach", tone: "bad" },
  warning: { icon: AlertTriangle, label: "Warning", tone: "warn" },
  needs_review: { icon: Eye, label: "Needs review", tone: "info" },
  not_applicable: { icon: MinusCircle, label: "Not applicable", tone: "neutral" },
  not_started: { icon: Circle, label: "Not started", tone: "neutral" },
  in_progress: { icon: CircleDot, label: "In progress", tone: "info" },
  done: { icon: CheckCircle2, label: "Done", tone: "ok" },
  draft: { icon: FilePen, label: "Draft", tone: "neutral" },
  error: { icon: AlertCircle, label: "Error", tone: "bad" },
};

export function StatusPill({
  variant, label, className, "data-testid": testId,
}: { variant: StatusVariant; label?: string; className?: string; "data-testid"?: string }) {
  const m = MAP[variant];
  const Icon = m.icon;
  return (
    <span
      data-testid={testId ?? `status-${variant}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TONES[m.tone], className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {label ?? m.label}
    </span>
  );
}
