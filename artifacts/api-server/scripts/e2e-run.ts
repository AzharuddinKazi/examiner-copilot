// One-off end-to-end run of the real assessment pipeline for a product (dev database). Usage: tsx scripts/e2e-run.ts <productId>
import { db, assessmentsTable, assessmentDocumentsTable, documentsTable, productsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { getActiveDataset } from "../src/lib/dataset";
import { appendAudit } from "../src/lib/audit";
import { readLlmConfig } from "../src/lib/llm/config";
import { activeVersionId } from "../src/lib/rulebooks";
import { LIMITS, runAssessment } from "../src/lib/assess/run";

const productId = Number(process.argv[2]);
const dataset = await getActiveDataset();
const [product] = await db.select().from(productsTable).where(and(eq(productsTable.dataset, dataset), eq(productsTable.id, productId)));
if (!product) throw new Error("product not found");
const c = readLlmConfig();
const versionId = await activeVersionId(dataset);
const docs = await db.select({ id: documentsTable.id }).from(documentsTable)
  .where(and(eq(documentsTable.dataset, dataset), eq(documentsTable.productId, productId), eq(documentsTable.status, "confirmed")));
const [row] = await db.insert(assessmentsTable).values({
  dataset, bankId: product.bankId, productId, rulebookVersionId: versionId!, kind: "agentic", status: "queued",
  model: c.model, stepLimit: LIMITS.stepLimit, tokenLimit: LIMITS.tokenLimit, progress: "Queued",
}).returning();
await db.insert(assessmentDocumentsTable).values(docs.map((d) => ({ assessmentId: row!.id, documentId: d.id })));
await appendAudit({ dataset, role: "senior_examiner", action: "assessment.start", entityType: "assessment", entityId: String(row!.id),
  summary: `Started assessment ${row!.id} of ${product.name} (${docs.length} documents) for an end-to-end test.`, after: { productId, model: c.model } });
console.log(`assessment ${row!.id} started with ${c.model}`);
const t0 = Date.now();
await runAssessment(dataset, row!.id, "senior_examiner");
console.log(`done in ${Math.round((Date.now() - t0) / 1000)}s`);
process.exit(0);
