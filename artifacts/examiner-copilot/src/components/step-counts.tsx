import type { StepProgress } from "@workspace/api-client-react";
import { StatusPill } from "@/components/voice";

export function StepCounts({ step }: { step: StepProgress }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      <StatusPill variant={step.state} data-testid={`status-step-${step.key}`} />
      {step.counts.map((c) => (
        <span key={c.label} className="text-xs text-muted-foreground" data-testid={`text-count-${step.key}-${c.label.replace(/\s+/g, "-").toLowerCase()}`}>
          <span className="font-mono text-sm font-medium text-foreground">{c.value}</span> {c.label}
        </span>
      ))}
    </div>
  );
}
