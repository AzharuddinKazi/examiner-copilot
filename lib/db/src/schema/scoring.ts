import { pgTable, serial, integer, text, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { datasetEnum } from "./enums";
import { banksTable, productsTable } from "./library";

/** Editable JSON settings: the scoring rubric ("scoring") and the document roles ("document_roles"). */
export const scoringSettingsTable = pgTable(
  "scoring_settings",
  {
    id: serial("id").primaryKey(),
    dataset: datasetEnum("dataset").notNull(),
    kind: text("kind").notNull(),
    content: jsonb("content").notNull(),
    updatedBy: text("updated_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("scoring_settings_dataset_kind_uq").on(t.dataset, t.kind)],
);

/** Maps a complaint category from the bank's complaint data to one of the scoring themes. */
export const complaintThemesTable = pgTable(
  "complaint_themes",
  {
    id: serial("id").primaryKey(),
    dataset: datasetEnum("dataset").notNull(),
    category: text("category").notNull(),
    theme: text("theme").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("complaint_themes_dataset_category_uq").on(t.dataset, t.category)],
);

/** Complaint counts per bank (optionally per card product) and category. Display only; never changes a score. */
export const complaintsTable = pgTable("complaints", {
  id: serial("id").primaryKey(),
  dataset: datasetEnum("dataset").notNull(),
  bankId: integer("bank_id").notNull().references(() => banksTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => productsTable.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  count: integer("count").notNull(),
  period: text("period"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ComplaintRow = typeof complaintsTable.$inferSelect;
export type ComplaintThemeRow = typeof complaintThemesTable.$inferSelect;
