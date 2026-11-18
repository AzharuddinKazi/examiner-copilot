import type { ButtonHTMLAttributes } from "react";
import { TierTag, type Tier } from "./tier-tag";

export interface FindingCardProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  findingId: string;
  question: string;
  tier: Tier;
  found?: string;
  expected?: string;
  stamp?: "Approved" | "Adjusted" | "Rejected" | "Info requested";
  dimmed?: boolean;
}

/** Source .fcard, .fnd/.exp and .mst. Whole row remains a native button. */
export function FindingCard({ findingId, question, tier, found, expected, stamp, dimmed,
  className = "", ...props }: FindingCardProps) {
  return <button type="button" className={`exam-finding ${dimmed ? "is-dimmed" : ""} ${className}`} {...props}>
    <TierTag tier={tier} />
    <span className="exam-finding-text">
      <strong title={question}>{question}</strong>
      {(found || expected) && <span className="exam-finding-values">
        {found && <span className={`exam-value exam-tier--${tier}`}>Found: {found}</span>}
        {expected && <span className="exam-value exam-tier--cleared">Expected: {expected}</span>}
      </span>}
    </span>
    <span className="exam-finding-end">
      {stamp && <span className={`exam-mini-stamp ${stamp === "Rejected" ? "is-rejected" : ""}`}>{stamp}</span>}
      <span className="exam-finding-id">{findingId}</span><span className="exam-chevron" aria-hidden>›</span>
    </span>
  </button>;
}
