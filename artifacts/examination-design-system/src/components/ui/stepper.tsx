import { Fragment } from "react";

export interface StepItem { id: string; label: string; disabled?: boolean }
export interface StepperProps {
  steps: StepItem[];
  current: string;
  completed?: string[];
  onStepChange: (id: string) => void;
}

/** Controlled navigation. Stage gating stays in the app, as in the supplied prototype. */
export function Stepper({ steps, current, completed = [], onStepChange }: StepperProps) {
  return <nav className="exam-steps" aria-label="Examination stages">
    {steps.map((s, i) => <Fragment key={s.id}>
      {i > 0 && <span className="exam-step-separator" aria-hidden />}
      <button type="button" disabled={s.disabled} aria-current={s.id === current ? "step" : undefined}
        className={completed.includes(s.id) ? "is-done" : ""}
        onClick={() => onStepChange(s.id)}>
        <span className="exam-step-number" aria-hidden>{completed.includes(s.id) ? "✓" : i + 1}</span>
        <span>{s.label}</span>
      </button>
    </Fragment>)}
  </nav>;
}
