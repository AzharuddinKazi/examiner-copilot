import type { AgentName, AssessmentStatus, CheckType, DocType, DocLanguage, DocumentStatus, EvidenceVerification, FindingStatus, RuleField, Severity } from "@workspace/api-client-react";
import type { StatusVariant } from "@/components/voice";

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  kfs: "Key Facts Statement",
  tnc: "Terms and Conditions",
  rewards: "Rewards terms",
  fees: "Fees Schedule",
  advert: "Advertisement",
};
export const DOC_TYPE_SHORT: Record<DocType, string> = { kfs: "KFS", tnc: "T&C", rewards: "Rewards", fees: "Fees", advert: "Advert" };
export const DOC_TYPES = Object.keys(DOC_TYPE_LABELS) as DocType[];

export const LANGUAGE_LABELS: Record<DocLanguage, string> = { en: "English", ar: "Arabic" };
export const LANGUAGES = Object.keys(LANGUAGE_LABELS) as DocLanguage[];

export const CHECK_TYPE_LABELS: Record<CheckType, string> = {
  presence: "Must be stated",
  max_value: "Must not exceed",
  min_value: "Must be at least",
  cross_document: "Must match across documents",
  bilingual: "English and Arabic must match",
  readability: "Must be readable",
  prohibited_language: "Must not contain",
  binary: "Met or not met",
  subjective: "Examiner judgement",
  calculation: "Calculation",
};

export const RULE_FIELD_LABELS: Record<RuleField, string> = {
  code: "Rule code",
  title: "Title",
  text: "Rule text",
  category: "Category",
  appliesTo: "Applies to",
  checkType: "Check type",
  threshold: "Threshold",
  severity: "Severity",
};
export const RULE_FIELDS = Object.keys(RULE_FIELD_LABELS) as RuleField[];
export const REQUIRED_RULE_FIELDS: RuleField[] = ["code", "text", "checkType"];

export const SEVERITY_PILL: Record<Severity, { variant: StatusVariant; label: string }> = {
  high: { variant: "breach", label: "High" },
  medium: { variant: "warning", label: "Medium" },
  low: { variant: "not_applicable", label: "Low" },
};

export function docStatusPill(status: DocumentStatus): { variant: StatusVariant; label: string } {
  if (status === "confirmed") return { variant: "compliant", label: "Confirmed" };
  if (status === "rejected") return { variant: "breach", label: "Rejected" };
  return { variant: "needs_review", label: "Awaiting confirmation" };
}

export function gapText(n: number) {
  return `${n} ${n === 1 ? "page" : "pages"} without text — no OCR`;
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const FINDING_STATUS_ORDER: FindingStatus[] = ["breach", "warning", "needs_review", "compliant", "not_applicable"];
export const FINDING_STATUS_LABELS: Record<FindingStatus, string> = {
  breach: "Breach", warning: "Warning", needs_review: "Needs review", compliant: "Compliant", not_applicable: "Not applicable",
};
export const FINDING_STATUS_PLURAL: Record<FindingStatus, [string, string]> = {
  breach: ["breach", "breaches"], warning: ["warning", "warnings"], needs_review: ["needs review", "need review"],
  compliant: ["compliant", "compliant"], not_applicable: ["not applicable", "not applicable"],
};
export const AGENT_LABELS: Record<AgentName, string> = {
  coordinator: "Coordinator", evidence: "Evidence", consistency: "Consistency", rule: "Rule", challenger: "Challenger", code: "Code check",
};
export const EVIDENCE_VERIFICATION_LABELS: Record<EvidenceVerification, string> = {
  exact: "Exact match", normalized: "Normalized match", not_found: "Not found on page",
};
export function assessmentStatusPill(status: AssessmentStatus): { variant: StatusVariant; label: string } {
  switch (status) {
    case "queued": return { variant: "in_progress", label: "Queued" };
    case "running": return { variant: "in_progress", label: "Running" };
    case "complete": return { variant: "done", label: "Complete" };
    case "stopped": return { variant: "warning", label: "Stopped" };
    default: return { variant: "error", label: "Failed" };
  }
}
export function formatDuration(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const s = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}
export function formatCount(n: number) { return n.toLocaleString(); }
