import { pgTable, serial, integer, text, timestamp, customType, index } from "drizzle-orm/pg-core";
import { datasetEnum } from "./enums";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/**
 * Uploaded file bytes (PDF disclosures, .xlsx rulebooks). Kept in Postgres so demo/live
 * separation and the one-way demo purge stay a single transaction. Files are small
 * (size-capped at upload).
 */
export const storedFilesTable = pgTable(
  "stored_files",
  {
    id: serial("id").primaryKey(),
    dataset: datasetEnum("dataset").notNull(),
    purpose: text("purpose").notNull(),
    originalName: text("original_name").notNull(),
    mime: text("mime").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    data: bytea("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("stored_files_dataset_sha_idx").on(t.dataset, t.sha256)],
);

export type StoredFile = typeof storedFilesTable.$inferSelect;
