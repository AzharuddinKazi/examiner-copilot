import { db, banksTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { appendAudit } from "./audit";
import { getActiveDataset } from "./dataset";

/** The banks in scope for this workbench (credit card product documents only). */
export const SCOPE_BANKS = [
  { nameEn: "ADCB", nameAr: "بنك أبوظبي التجاري" },
  { nameEn: "ADIB", nameAr: "مصرف أبوظبي الإسلامي" },
  { nameEn: "CBD", nameAr: "بنك دبي التجاري" },
  { nameEn: "Mashreq", nameAr: "المشرق" },
];

/**
 * Adds the in-scope banks to an empty library (each audited as "Setup script").
 * Runs on startup so every environment, including the published app, has them.
 * Once any bank exists it does nothing, so banks the team edits are left alone.
 */
export async function ensureScopeBanks(): Promise<string[]> {
  const dataset = await getActiveDataset();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('scope-banks'))`);
    const existing = await tx.select({ id: banksTable.id }).from(banksTable).where(eq(banksTable.dataset, dataset)).limit(1);
    if (existing.length) return [];
    const added: string[] = [];
    for (const { nameEn, nameAr } of SCOPE_BANKS) {
      const [b] = await tx.insert(banksTable).values({ dataset, nameEn, nameAr }).returning();
      await appendAudit(
        { dataset, role: null, actor: "Setup script", action: "bank.created", entityType: "bank", entityId: String(b!.id), summary: `Added bank ${nameEn}.`, after: { nameEn, nameAr } },
        tx,
      );
      added.push(nameEn);
    }
    return added;
  });
}
