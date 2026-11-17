import { pgTable, serial, integer, text, timestamp, jsonb, primaryKey, boolean } from "drizzle-orm/pg-core";
import {
  datasetEnum, assessmentKindEnum, assessmentStatusEnum, findingStatusEnum, severityEnum, verificationEnum, decisionEnum,
} from "./enums";
import { banksTable, productsTable, rulebookVersionsTable, rulesTable } from "./library";
import { documentsTable } from "./documents";

export const assessmentsTable = pgTable("assessments", {
  id: serial("id").primaryKey(),
  dataset: datasetEnum("dataset").notNull(),
  bankId: integer("bank_id").references(() => banksTable.id, { onDelete: "set null" }),
  productId: integer("product_id").references(() => productsTable.id, { onDelete: "set null" }),
  rulebookVersionId: integer("rulebook_version_id").references(() => rulebookVersionsTable.id, { onDelete: "set null" }),
  kind: assessmentKindEnum("kind").notNull().default("agentic"),
  status: assessmentStatusEnum("status").notNull().default("queued"),
  stopReason: text("stop_reason"),
  progress: text("progress"),
  stopRequested: boolean("stop_requested").notNull().default(false),
  alerts: jsonb("alerts").notNull().default([]),
  stepsUsed: integer("steps_used").notNull().default(0),
  stepLimit: integer("step_limit").notNull().default(0),
  tokenLimit: integer("token_limit").notNull().default(0),
  tokensIn: integer("tokens_in").notNull().default(0),
  tokensOut: integer("tokens_out").notNull().default(0),
  model: text("model"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const assessmentDocumentsTable = pgTable(
  "assessment_documents",
  {
    assessmentId: integer("assessment_id").notNull().references(() => assessmentsTable.id, { onDelete: "cascade" }),
    documentId: integer("document_id").notNull().references(() => documentsTable.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.assessmentId, t.documentId] })],
);

export const agentStepsTable = pgTable("agent_steps", {
  id: serial("id").primaryKey(),
  assessmentId: integer("assessment_id").notNull().references(() => assessmentsTable.id, { onDelete: "cascade" }),
  agent: text("agent").notNull(),
  stepNo: integer("step_no").notNull(),
  tool: text("tool"),
  summary: text("summary").notNull().default(""),
  input: jsonb("input"),
  output: jsonb("output"),
  tokensIn: integer("tokens_in").notNull().default(0),
  tokensOut: integer("tokens_out").notNull().default(0),
  latencyMs: integer("latency_ms"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const findingsTable = pgTable("findings", {
  id: serial("id").primaryKey(),
  dataset: datasetEnum("dataset").notNull(),
  assessmentId: integer("assessment_id").notNull().references(() => assessmentsTable.id, { onDelete: "cascade" }),
  ruleId: integer("rule_id").references(() => rulesTable.id, { onDelete: "set null" }),
  proposedStatus: findingStatusEnum("proposed_status").notNull(),
  severity: severityEnum("severity").notNull(),
  rationale: text("rationale").notNull(),
  verification: verificationEnum("verification").notNull(),
  proposedBy: text("proposed_by").notNull(),
  checks: jsonb("checks").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const evidenceTable = pgTable("evidence", {
  id: serial("id").primaryKey(),
  findingId: integer("finding_id").notNull().references(() => findingsTable.id, { onDelete: "cascade" }),
  documentId: integer("document_id").notNull().references(() => documentsTable.id, { onDelete: "cascade" }),
  pageNo: integer("page_no").notNull(),
  quote: text("quote").notNull(),
  charStart: integer("char_start"),
  charEnd: integer("char_end"),
  verified: text("verified").notNull(),
});

/** Append-only: the latest decision per finding wins. */
export const decisionsTable = pgTable("decisions", {
  id: serial("id").primaryKey(),
  dataset: datasetEnum("dataset").notNull(),
  findingId: integer("finding_id").notNull().references(() => findingsTable.id, { onDelete: "cascade" }),
  decision: decisionEnum("decision").notNull(),
  /** null when the examiner rejects the proposal: no finding stands for this rule. */
  finalStatus: findingStatusEnum("final_status"),
  examinerNote: text("examiner_note"),
  role: text("role").notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AssessmentRow = typeof assessmentsTable.$inferSelect;
export type FindingRow = typeof findingsTable.$inferSelect;
export type EvidenceRow = typeof evidenceTable.$inferSelect;
export type AgentStepRow = typeof agentStepsTable.$inferSelect;
