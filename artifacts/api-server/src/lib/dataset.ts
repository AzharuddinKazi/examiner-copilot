import {
  db, appStateTable, auditLogTable, banksTable, productsTable, rulebooksTable, rulebookVersionsTable, rulesTable,
  documentsTable, assessmentsTable, findingsTable, decisionsTable, noticesTable, holidayCalendarsTable, storedFilesTable,
  type AppState,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";

export type Dataset = "demo" | "live";
export type AppStateRow = AppState;

/**
 * Reads the singleton workspace state, creating it in live mode on first use.
 * Every repository call takes the dataset returned here; there is no unscoped query path.
 */
export async function getAppState(): Promise<AppState> {
  const rows = await db.select().from(appStateTable).where(eq(appStateTable.id, 1));
  if (rows[0]) return rows[0];
  const inserted = await db
    .insert(appStateTable)
    .values({ id: 1, mode: "live", switchedAt: new Date(), switchedByRole: "system" })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return inserted[0];
  const again = await db.select().from(appStateTable).where(eq(appStateTable.id, 1));
  if (!again[0]) throw new Error("Workspace state could not be initialised");
  return again[0];
}

export type MakerCheckerMode = "strict" | "poc";

/** Strict (default): a different senior examiner must check. PoC: single-user trials only. */
export async function getMakerCheckerMode(): Promise<MakerCheckerMode> {
  return (await getAppState()).makerCheckerMode;
}

export async function getActiveDataset(): Promise<Dataset> {
  return (await getAppState()).mode;
}

/**
 * The workspace holds production data only. On startup, any leftover demo dataset
 * (from earlier builds) is deleted in one transaction and the workspace is set to live.
 * Idempotent: does nothing once the workspace is live and no demo rows remain.
 */
export async function removeDemoData(): Promise<{ removed: boolean }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('demo-purge'))`);
    const [state] = await tx.select().from(appStateTable).where(eq(appStateTable.id, 1));
    const demo = "demo" as const;
    const [left] = (await tx.execute(sql`
      select (select count(*) from ${banksTable} where dataset = 'demo')
           + (select count(*) from ${documentsTable} where dataset = 'demo')
           + (select count(*) from ${rulebooksTable} where dataset = 'demo')
           + (select count(*) from ${auditLogTable} where dataset = 'demo')
           + (select count(*) from ${storedFilesTable} where dataset = 'demo') as n`)).rows as [{ n: string }];
    if (state?.mode === "live" && Number(left?.n ?? 0) === 0) return { removed: false };

    await tx.delete(noticesTable).where(eq(noticesTable.dataset, demo));
    await tx.delete(decisionsTable).where(eq(decisionsTable.dataset, demo));
    await tx.delete(findingsTable).where(eq(findingsTable.dataset, demo));
    await tx.delete(assessmentsTable).where(eq(assessmentsTable.dataset, demo));
    await tx.delete(documentsTable).where(eq(documentsTable.dataset, demo));
    await tx.delete(rulesTable).where(eq(rulesTable.dataset, demo));
    await tx.delete(rulebookVersionsTable).where(eq(rulebookVersionsTable.dataset, demo));
    await tx.delete(rulebooksTable).where(eq(rulebooksTable.dataset, demo));
    await tx.delete(productsTable).where(eq(productsTable.dataset, demo));
    await tx.delete(banksTable).where(eq(banksTable.dataset, demo));
    await tx.delete(holidayCalendarsTable).where(eq(holidayCalendarsTable.dataset, demo));
    await tx.delete(storedFilesTable).where(eq(storedFilesTable.dataset, demo));
    await tx.delete(auditLogTable).where(eq(auditLogTable.dataset, demo));

    if (state) {
      if (state.mode !== "live") {
        await tx.update(appStateTable)
          .set({ mode: "live", switchedAt: new Date(), switchedByRole: "system", updatedAt: new Date() })
          .where(eq(appStateTable.id, 1));
      }
    } else {
      await tx.insert(appStateTable).values({ id: 1, mode: "live", switchedAt: new Date(), switchedByRole: "system" }).onConflictDoNothing();
    }
    return { removed: true };
  });
}
