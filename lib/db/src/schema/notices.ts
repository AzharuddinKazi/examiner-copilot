import { pgTable, serial, integer, text, timestamp, date, primaryKey, boolean } from "drizzle-orm/pg-core";
import { datasetEnum, noticeStatusEnum } from "./enums";
import { banksTable, holidayCalendarsTable, productsTable } from "./library";
import { assessmentsTable, findingsTable } from "./assessments";
import { usersTable } from "./users";

/**
 * Notices (the final report per card) are drafts only. There is no "sent" status by design.
 * Approval state is derived from the append-only `notice_approvals` rows (submit, approve, return).
 */
export const noticesTable = pgTable("notices", {
  id: serial("id").primaryKey(),
  dataset: datasetEnum("dataset").notNull(),
  bankId: integer("bank_id").references(() => banksTable.id, { onDelete: "set null" }),
  productId: integer("product_id").references(() => productsTable.id, { onDelete: "set null" }),
  assessmentId: integer("assessment_id").references(() => assessmentsTable.id, { onDelete: "set null" }),
  status: noticeStatusEnum("status").notNull().default("draft"),
  body: text("body").notNull().default(""),
  referenceDate: date("reference_date", { mode: "string" }),
  responseDueDate: date("response_due_date", { mode: "string" }),
  calendarId: integer("calendar_id").references(() => holidayCalendarsTable.id, { onDelete: "set null" }),
  makerUserId: integer("maker_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  makerActor: text("maker_actor"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const noticeFindingsTable = pgTable(
  "notice_findings",
  {
    noticeId: integer("notice_id").notNull().references(() => noticesTable.id, { onDelete: "cascade" }),
    findingId: integer("finding_id").notNull().references(() => findingsTable.id, { onDelete: "cascade" }),
    /** What the bank must do: the next step for this finding. */
    action: text("action").notNull().default(""),
    dueDate: date("due_date", { mode: "string" }),
    included: boolean("included").notNull().default(true),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.noticeId, t.findingId] })],
);

/** Steps on a notice: the maker submits, a senior examiner approves or returns. Append-only; the latest row wins. */
export const noticeApprovalsTable = pgTable("notice_approvals", {
  id: serial("id").primaryKey(),
  dataset: datasetEnum("dataset").notNull(),
  noticeId: integer("notice_id").notNull().references(() => noticesTable.id, { onDelete: "cascade" }),
  action: text("action", { enum: ["submit", "approve", "return"] }).notNull(),
  note: text("note"),
  role: text("role").notNull(),
  actor: text("actor"),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  /** True when the person who sent the report also checked it (only possible in PoC maker-checker mode). */
  selfApproved: boolean("self_approved").notNull().default(false),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});
