/**
 * Adds ADCB, ADIB, CBD and Mashreq to the live library if they are missing.
 * Safe to run more than once. Each addition is written to the audit log.
 * Run: pnpm --filter @workspace/api-server exec tsx src/scripts/add-uae-banks.ts
 */
import { db, banksTable, pool } from "@workspace/db";
import { eq } from "drizzle-orm";
import { appendAudit } from "../lib/audit";
import { getActiveDataset } from "../lib/dataset";

const BANKS = [
  { nameEn: "ADCB", nameAr: "بنك أبوظبي التجاري" },
  { nameEn: "ADIB", nameAr: "مصرف أبوظبي الإسلامي" },
  { nameEn: "CBD", nameAr: "بنك دبي التجاري" },
  { nameEn: "Mashreq", nameAr: "المشرق" },
];

async function main() {
  const dataset = await getActiveDataset();
  const existing = await db.select().from(banksTable).where(eq(banksTable.dataset, dataset));
  for (const { nameEn, nameAr } of BANKS) {
    if (existing.some((b) => b.nameEn.trim().toLowerCase() === nameEn.toLowerCase())) {
      console.log(`skip ${nameEn}: already in the library`);
      continue;
    }
    await db.transaction(async (tx) => {
      const [b] = await tx.insert(banksTable).values({ dataset, nameEn, nameAr }).returning();
      await appendAudit(
        { dataset, role: null, actor: "Setup script", action: "bank.created", entityType: "bank", entityId: String(b!.id), summary: `Added bank ${nameEn}.`, after: { nameEn, nameAr } },
        tx,
      );
    });
    console.log(`added ${nameEn}`);
  }
}

main().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
