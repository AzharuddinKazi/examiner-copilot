import { pgTable, serial, integer, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { datasetEnum } from "./enums";

/** Singleton row (id = 1). Mode moves demo -> live once and never back. */
export const appStateTable = pgTable("app_state", {
  id: integer("id").primaryKey().default(1),
  mode: datasetEnum("mode").notNull().default("demo"),
  switchedAt: timestamp("switched_at", { withTimezone: true }),
  switchedByRole: text("switched_by_role"),
  /**
   * Maker-checker mode. "strict" (default, production): a different senior examiner must approve.
   * "poc": single-user trials only; a senior examiner may approve their own work (flagged self_approved).
   */
  makerCheckerMode: text("maker_checker_mode", { enum: ["strict", "poc"] }).notNull().default("strict"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AppState = typeof appStateTable.$inferSelect;

/**
 * Append-only audit log. Each dataset has its own hash chain:
 * hash = sha256(prevHash + canonical event payload). Code never updates or deletes rows,
 * except the one-way demo purge, which removes the whole demo chain at once.
 */
export const auditLogTable = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    dataset: datasetEnum("dataset").notNull(),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    role: text("role"),
    /** Signed-in person (name and email) who caused the event; null for system events. */
    actor: text("actor"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    summary: text("summary").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    prevHash: text("prev_hash"),
    hash: text("hash").notNull(),
  },
  (t) => [index("audit_log_dataset_id_idx").on(t.dataset, t.id)],
);

export type AuditLogRow = typeof auditLogTable.$inferSelect;
