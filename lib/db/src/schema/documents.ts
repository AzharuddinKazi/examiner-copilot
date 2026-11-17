import { pgTable, serial, integer, text, timestamp, jsonb, real, primaryKey, boolean } from "drizzle-orm/pg-core";
import { datasetEnum, docTypeEnum, languageEnum, documentStatusEnum } from "./enums";
import { banksTable, productsTable } from "./library";

export const documentsTable = pgTable("documents", {
  id: serial("id").primaryKey(),
  dataset: datasetEnum("dataset").notNull(),
  bankId: integer("bank_id").references(() => banksTable.id, { onDelete: "set null" }),
  productId: integer("product_id").references(() => productsTable.id, { onDelete: "set null" }),
  docType: docTypeEnum("doc_type"),
  language: languageEnum("language"),
  versionLabel: text("version_label"),
  originalName: text("original_name").notNull(),
  sha256: text("sha256").notNull(),
  fileKey: text("file_key").notNull(),
  mime: text("mime").notNull(),
  pageCount: integer("page_count").notNull().default(0),
  status: documentStatusEnum("status").notNull().default("uploaded"),
  ingestionProposal: jsonb("ingestion_proposal"),
  /** Ingestion agent proposal (LLM), checked by code; separate from the rule-based suggestion. */
  agentProposal: jsonb("agent_proposal"),
  extractionQuality: real("extraction_quality"),
  sizeBytes: integer("size_bytes").notNull().default(0),
  rejectedReason: text("rejected_reason"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  confirmedByRole: text("confirmed_by_role"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const documentPagesTable = pgTable(
  "document_pages",
  {
    documentId: integer("document_id").notNull().references(() => documentsTable.id, { onDelete: "cascade" }),
    pageNo: integer("page_no").notNull(),
    textRaw: text("text_raw").notNull(),
    textNormalized: text("text_normalized").notNull(),
    extractionMethod: text("extraction_method").notNull(),
    charCount: integer("char_count").notNull(),
    isGap: boolean("is_gap").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.documentId, t.pageNo] })],
);

export type DocumentRow = typeof documentsTable.$inferSelect;
export type DocumentPageRow = typeof documentPagesTable.$inferSelect;
