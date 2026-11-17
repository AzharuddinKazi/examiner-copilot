import { pgTable, serial, integer, text, timestamp, jsonb, date, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { datasetEnum, rulebookVersionStatusEnum, docTypeEnum, severityEnum } from "./enums";

export const banksTable = pgTable("banks", {
  id: serial("id").primaryKey(),
  dataset: datasetEnum("dataset").notNull(),
  nameEn: text("name_en").notNull(),
  nameAr: text("name_ar"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  dataset: datasetEnum("dataset").notNull(),
  bankId: integer("bank_id").notNull().references(() => banksTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  cardTier: text("card_tier"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rulebooksTable = pgTable("rulebooks", {
  id: serial("id").primaryKey(),
  dataset: datasetEnum("dataset").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rulebookVersionsTable = pgTable(
  "rulebook_versions",
  {
    id: serial("id").primaryKey(),
    dataset: datasetEnum("dataset").notNull(),
    rulebookId: integer("rulebook_id").notNull().references(() => rulebooksTable.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    sourceFileKey: text("source_file_key"),
    columnMapping: jsonb("column_mapping"),
    status: rulebookVersionStatusEnum("status").notNull().default("draft"),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("rulebook_versions_rulebook_version_uq").on(t.rulebookId, t.version)],
);

export const rulesTable = pgTable("rules", {
  id: serial("id").primaryKey(),
  dataset: datasetEnum("dataset").notNull(),
  versionId: integer("version_id").notNull().references(() => rulebookVersionsTable.id, { onDelete: "cascade" }),
  rowNo: integer("row_no").notNull().default(0),
  code: text("code").notNull(),
  title: text("title").notNull(),
  text: text("text").notNull(),
  category: text("category"),
  appliesToDocTypes: docTypeEnum("applies_to_doc_types").array().notNull().default([]),
  appliesToProductFilter: jsonb("applies_to_product_filter"),
  checkType: text("check_type").notNull(),
  threshold: jsonb("threshold"),
  severity: severityEnum("severity").notNull().default("medium"),
  /** Extra spreadsheet columns kept with the rule, e.g. evidence to look for and pass criteria. */
  details: jsonb("details").$type<{ label: string; value: string }[]>().notNull().default([]),
});

export const holidayCalendarsTable = pgTable("holiday_calendars", {
  id: serial("id").primaryKey(),
  dataset: datasetEnum("dataset").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const holidaysTable = pgTable(
  "holidays",
  {
    id: serial("id").primaryKey(),
    dataset: datasetEnum("dataset").notNull(),
    calendarId: integer("calendar_id").notNull().references(() => holidayCalendarsTable.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    name: text("name").notNull(),
    editable: boolean("editable").notNull().default(true),
  },
  (t) => [uniqueIndex("holidays_calendar_date_uq").on(t.calendarId, t.date)],
);

export type BankRow = typeof banksTable.$inferSelect;
export type ProductRow = typeof productsTable.$inferSelect;
export type RulebookVersionRow = typeof rulebookVersionsTable.$inferSelect;
export type RuleRow = typeof rulesTable.$inferSelect;
