import { db, scoringSettingsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import type { Dataset } from "../dataset";
import { SETTINGS, type DocumentRolesConfig, type ScoringConfig, type SettingsKind } from "./config";

export interface StoredSettings<T> {
  content: T;
  isDefault: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

/** The saved settings, or the bundled file when nothing has been saved. A saved copy that no longer validates falls back too. */
export async function getSettings<K extends SettingsKind>(dataset: Dataset, kind: K): Promise<StoredSettings<K extends "scoring" ? ScoringConfig : DocumentRolesConfig>> {
  const [row] = await db.select().from(scoringSettingsTable).where(and(eq(scoringSettingsTable.dataset, dataset), eq(scoringSettingsTable.kind, kind)));
  const def = SETTINGS[kind];
  if (row) {
    const parsed = def.schema.safeParse(row.content);
    if (parsed.success) {
      return { content: parsed.data as never, isDefault: false, updatedAt: row.updatedAt.toISOString(), updatedBy: row.updatedBy };
    }
  }
  return { content: def.schema.parse(def.defaults) as never, isDefault: true, updatedAt: null, updatedBy: null };
}

export const getScoringConfig = async (dataset: Dataset) => (await getSettings(dataset, "scoring")).content as ScoringConfig;
export const getDocumentRoles = async (dataset: Dataset) => (await getSettings(dataset, "document_roles")).content as DocumentRolesConfig;
