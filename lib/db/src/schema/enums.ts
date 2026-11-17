import { pgEnum } from "drizzle-orm/pg-core";

/** Every business row belongs to exactly one dataset. Demo and live never mix. */
export const datasetEnum = pgEnum("dataset", ["demo", "live"]);

export const docTypeEnum = pgEnum("doc_type", ["kfs", "tnc", "rewards", "fees", "advert"]);
export const languageEnum = pgEnum("doc_language", ["en", "ar"]);
export const documentStatusEnum = pgEnum("document_status", ["uploaded", "proposed", "confirmed", "rejected"]);
export const rulebookVersionStatusEnum = pgEnum("rulebook_version_status", ["draft", "active", "retired"]);
export const assessmentKindEnum = pgEnum("assessment_kind", ["agentic", "baseline"]);
export const assessmentStatusEnum = pgEnum("assessment_status", ["queued", "running", "complete", "stopped", "failed"]);
export const findingStatusEnum = pgEnum("finding_status", ["compliant", "breach", "warning", "needs_review", "not_applicable"]);
export const severityEnum = pgEnum("severity", ["low", "medium", "high"]);
export const verificationEnum = pgEnum("verification", ["verified", "unsupported"]);
export const decisionEnum = pgEnum("decision", ["accept", "reject", "modify"]);
export const noticeStatusEnum = pgEnum("notice_status", ["draft"]);
