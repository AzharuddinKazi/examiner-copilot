import { pgTable, serial, integer, text, timestamp, date, primaryKey } from "drizzle-orm/pg-core";
import { datasetEnum, noticeStatusEnum } from "./enums";
import { banksTable, holidayCalendarsTable } from "./library";
import { findingsTable } from "./assessments";

/** Notices are drafts only. There is no "sent" status by design. */
export const noticesTable = pgTable("notices", {
  id: serial("id").primaryKey(),
  dataset: datasetEnum("dataset").notNull(),
  bankId: integer("bank_id").references(() => banksTable.id, { onDelete: "set null" }),
  status: noticeStatusEnum("status").notNull().default("draft"),
  body: text("body").notNull().default(""),
  referenceDate: date("reference_date", { mode: "string" }),
  responseDueDate: date("response_due_date", { mode: "string" }),
  calendarId: integer("calendar_id").references(() => holidayCalendarsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const noticeFindingsTable = pgTable(
  "notice_findings",
  {
    noticeId: integer("notice_id").notNull().references(() => noticesTable.id, { onDelete: "cascade" }),
    findingId: integer("finding_id").notNull().references(() => findingsTable.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.noticeId, t.findingId] })],
);
