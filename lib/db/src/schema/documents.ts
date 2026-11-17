import { pgTable, serial, integer, text, timestamp, jsonb, real, primaryKey } from "drizzle-orm/pg-core";
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
  extractionQuality: real("extraction_quality"),
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
  },
  (t) => [primaryKey({ columns: [t.documentId, t.pageNo] })],
);
