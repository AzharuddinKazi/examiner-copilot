import { db, banksTable, productsTable, documentsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import type { Dataset } from "../dataset";
import { appendAudit } from "../audit";
import { storeFile } from "../files";
import { parseWorkbook, proposeMapping, buildRules } from "../rulebook-import";
import { activateVersion, createRulebookVersion } from "../rulebooks";
import { insertPreparedDocument, prepareDocument } from "../documents";
import type { BankForMatch } from "../suggest";
import { DEMO_BANKS, DEMO_DOCUMENTS, DEMO_RULEBOOK_FILE, DEMO_RULEBOOK_NAME } from "./content";
import { renderDemoPdf, renderSampleRulebook } from "./generate";

export class DemoLoadError extends Error {
  constructor(
    message: string,
    readonly status: 403 | 409,
  ) {
    super(message);
  }
}

/**
 * Loads the fictional demo library and documents in one transaction. Runs only in demo
 * mode and only when the demo library is empty. Everything goes through the same
 * validation, extraction and import code as real uploads.
 */
export async function loadDemoData(dataset: Dataset, role: string) {
  if (dataset !== "demo") throw new DemoLoadError("Demo data can only be loaded in demo mode.", 403);

  // Prepare everything outside the transaction (PDF rendering and extraction are CPU work).
  const rulebookBuf = await renderSampleRulebook();
  const sheet = await parseWorkbook(rulebookBuf);
  const { mapping } = proposeMapping(sheet.headers);
  const { rules, rowErrors } = buildRules(sheet, mapping);
  if (rowErrors.length) throw new Error(`Demo rulebook failed validation: ${JSON.stringify(rowErrors[0])}`);
  const pdfs = await Promise.all(DEMO_DOCUMENTS.map(async (d) => ({ d, buf: await renderDemoPdf(d) })));

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('demo-load'))`);
    const [{ n }] = (await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(banksTable)
      .where(eq(banksTable.dataset, dataset))) as [{ n: number }];
    const [{ d }] = (await tx
      .select({ d: sql<number>`count(*)::int` })
      .from(documentsTable)
      .where(eq(documentsTable.dataset, dataset))) as [{ d: number }];
    if (n > 0 || d > 0) throw new DemoLoadError("Demo data can only be loaded into an empty workspace.", 409);

    const bankIds = new Map<string, { bankId: number; productId: number }>();
    const forMatch: BankForMatch[] = [];
    for (const b of DEMO_BANKS) {
      const [bank] = await tx.insert(banksTable).values({ dataset, nameEn: b.nameEn, nameAr: b.nameAr }).returning();
      const [product] = await tx
        .insert(productsTable)
        .values({ dataset, bankId: bank!.id, name: b.product.name, cardTier: b.product.cardTier })
        .returning();
      bankIds.set(b.key, { bankId: bank!.id, productId: product!.id });
      forMatch.push({ id: bank!.id, nameEn: bank!.nameEn, nameAr: bank!.nameAr, products: [{ id: product!.id, name: product!.name }] });
    }

    const file = await storeFile(
      { dataset, purpose: "rulebook", originalName: DEMO_RULEBOOK_FILE, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", data: rulebookBuf },
      tx,
    );
    const { version } = await createRulebookVersion(tx, {
      dataset,
      rulebookId: null,
      rulebookName: DEMO_RULEBOOK_NAME,
      sourceFileId: file.id,
      mapping,
      rules,
    });
    await activateVersion(tx, dataset, version.id);

    let unconfirmed = 0;
    for (const { d, buf } of pdfs) {
      const prepared = await prepareDocument(buf, d.fileName, forMatch);
      const ids = bankIds.get(d.bank)!;
      if (d.leaveUnconfirmed) unconfirmed++;
      await insertPreparedDocument(
        tx,
        dataset,
        prepared,
        d.leaveUnconfirmed ? undefined : { bankId: ids.bankId, productId: ids.productId, docType: d.docType, language: d.language ?? "en", role },
      );
    }

    const result = {
      banks: DEMO_BANKS.length,
      products: DEMO_BANKS.length,
      rules: rules.length,
      documents: pdfs.length,
      message: `Loaded 3 fictional banks, a ${rules.length}-rule sample rulebook (active) and ${pdfs.length} synthetic PDFs (2 in Arabic). ${unconfirmed} documents are left for you to confirm.`,
    };
    await appendAudit(
      { dataset, role, action: "demo.loaded", entityType: "workspace", entityId: null, summary: result.message, after: result },
      tx,
    );
    return result;
  });
}
