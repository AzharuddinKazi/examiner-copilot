import type { CheckType, DocType, DocLanguage, DocumentStatus, RuleField, Severity } from "@workspace/api-client-react";
import type { StatusVariant } from "@/components/voice";

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  kfs: "Key Facts Statement",
  tnc: "Terms and Conditions",
  rewards: "Rewards terms",
  fees: "Fees Schedule",
};
export const DOC_TYPE_SHORT: Record<DocType, string> = { kfs: "KFS", tnc: "T&C", rewards: "Rewards", fees: "Fees" };
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
export const REQUIRED_RULE_FIELDS: RuleField[] = ["code", "title", "text", "checkType"];

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
