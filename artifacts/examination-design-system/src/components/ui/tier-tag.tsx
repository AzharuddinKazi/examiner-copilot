import type { HTMLAttributes } from "react";

export const TIER_LABELS = {
  critical: "Critical", medium: "Medium", low: "Low", info: "Info needed", cleared: "Cleared",
} as const;
export type Tier = keyof typeof TIER_LABELS;

/** Source .tag with .t-crit/.t-med/.t-low/.t-mi/.t-ok. Never colour-only. */
export function TierTag({ tier, className = "", ...props }: HTMLAttributes<HTMLSpanElement> & { tier: Tier }) {
  return <span className={`exam-tag exam-tier--${tier} ${className}`} {...props}>{TIER_LABELS[tier]}</span>;
}
