import { db, appStateTable, type AppState } from "@workspace/db";
import { eq } from "drizzle-orm";

export type Dataset = "demo" | "live";

/**
 * Reads the singleton workspace state, creating it in demo mode on first use.
 * Every repository call takes the dataset returned here; there is no unscoped query path.
 */
export async function getAppState(): Promise<AppState> {
  const rows = await db.select().from(appStateTable).where(eq(appStateTable.id, 1));
  if (rows[0]) return rows[0];
  const inserted = await db
    .insert(appStateTable)
    .values({ id: 1, mode: "demo" })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return inserted[0];
  const again = await db.select().from(appStateTable).where(eq(appStateTable.id, 1));
  if (!again[0]) throw new Error("Workspace state could not be initialised");
  return again[0];
}

export async function getActiveDataset(): Promise<Dataset> {
  return (await getAppState()).mode;
}
