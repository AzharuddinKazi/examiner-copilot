import { Router, type IRouter } from "express";
import {
  ListAssessmentCandidatesResponse,
  ListAssessmentsResponse,
  StartAssessmentBody,
  GetAssessmentParams,
  GetAssessmentResponse,
  StopAssessmentParams,
  StopAssessmentBody,
  StopAssessmentResponse,
} from "@workspace/api-zod";
import { db, assessmentsTable, assessmentDocumentsTable, documentsTable, productsTable, rulesTable } from "@workspace/db";
import { and, count, eq } from "drizzle-orm";
import { getActiveDataset } from "../lib/dataset";
import { appendAudit } from "../lib/audit";
import { requireWriter } from "../lib/roles";
import { readLlmConfig, describeConfig } from "../lib/llm/config";
import { activeVersionId } from "../lib/rulebooks";
import { LIMITS, currentRun, runAssessment } from "../lib/assess/run";
import { candidates, detail, getAssessmentRow, listAssessmentRows, summaries } from "../lib/assess/queries";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/assessments/candidates", async (_req, res): Promise<void> => {
  const dataset = await getActiveDataset();
  const versionId = await activeVersionId(dataset);
  const [ruleCount] = versionId ? await db.select({ n: count() }).from(rulesTable).where(eq(rulesTable.versionId, versionId)) : [{ n: 0 }];
  const c = readLlmConfig();
  res.json(
    ListAssessmentCandidatesResponse.parse({
      items: await candidates(dataset),
      activeRulebookVersionId: versionId,
      activeRuleCount: Number(ruleCount?.n ?? 0),
      llmConfigured: Boolean(c.apiKey && c.model),
      llmMessage: describeConfig(c),
      runningId: currentRun(),
      limits: { stepLimit: LIMITS.stepLimit, tokenLimit: LIMITS.tokenLimit },
    }),
  );
});

router.get("/assessments", async (_req, res): Promise<void> => {
  const dataset = await getActiveDataset();
  const rows = await listAssessmentRows(dataset);
  res.json(ListAssessmentsResponse.parse({ items: await summaries(dataset, rows), runningId: currentRun() }));
});

router.post("/assessments", async (req, res): Promise<void> => {
  const parsed = StartAssessmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A role and productId are required." });
    return;
  }
  const role = requireWriter(parsed.data.role, res);
  if (!role) return;
  const dataset = await getActiveDataset();
  const [product] = await db.select().from(productsTable).where(and(eq(productsTable.dataset, dataset), eq(productsTable.id, parsed.data.productId)));
  if (!product) {
    res.status(404).json({ error: "Product not found." });
    return;
  }
  const c = readLlmConfig();
  if (!c.apiKey || !c.model) {
    res.status(503).json({ error: describeConfig(c) });
    return;
  }
  if (currentRun() !== null) {
    res.status(409).json({ error: "Another assessment is running. Wait for it to finish or stop it first." });
    return;
  }
  const versionId = await activeVersionId(dataset);
  if (!versionId) {
    res.status(400).json({ error: "No active rulebook version. Import and activate a rulebook in Library first." });
    return;
  }
  const docs = await db
    .select({ id: documentsTable.id })
    .from(documentsTable)
    .where(and(eq(documentsTable.dataset, dataset), eq(documentsTable.productId, product.id), eq(documentsTable.status, "confirmed")));
  if (!docs.length) {
    res.status(400).json({ error: "This product has no confirmed documents. Confirm them in Upload documents first." });
    return;
  }
  const [row] = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(assessmentsTable)
      .values({
        dataset,
        bankId: product.bankId,
        productId: product.id,
        rulebookVersionId: versionId,
        kind: "agentic",
        status: "queued",
        model: c.model,
        stepLimit: LIMITS.stepLimit,
        tokenLimit: LIMITS.tokenLimit,
        progress: "Queued",
      })
      .returning();
    await tx.insert(assessmentDocumentsTable).values(docs.map((d) => ({ assessmentId: inserted[0]!.id, documentId: d.id })));
    return inserted;
  });
  await appendAudit({
    dataset,
    role,
    action: "assessment.start",
    entityType: "assessment",
    entityId: String(row!.id),
    summary: `Started assessment ${row!.id} of ${product.name} (${docs.length} documents) against rulebook version id ${versionId}.`,
    after: { productId: product.id, documents: docs.map((d) => d.id), rulebookVersionId: versionId, model: c.model },
  });
  void runAssessment(dataset, row!.id, role).catch((err) => logger.error({ err }, "assessment crashed"));
  const [summary] = await summaries(dataset, [row!]);
  res.status(202).json(summary);
});

router.get("/assessments/:id", async (req, res): Promise<void> => {
  const p = GetAssessmentParams.safeParse(req.params);
  if (!p.success) {
    res.status(404).json({ error: "Assessment not found." });
    return;
  }
  const dataset = await getActiveDataset();
  const row = await getAssessmentRow(dataset, p.data.id);
  if (!row) {
    res.status(404).json({ error: "Assessment not found." });
    return;
  }
  res.json(GetAssessmentResponse.parse(await detail(dataset, row)));
});

router.post("/assessments/:id/stop", async (req, res): Promise<void> => {
  const p = StopAssessmentParams.safeParse(req.params);
  const b = StopAssessmentBody.safeParse(req.body);
  if (!p.success || !b.success) {
    res.status(400).json({ error: "A role is required." });
    return;
  }
  const role = requireWriter(b.data.role, res);
  if (!role) return;
  const dataset = await getActiveDataset();
  const row = await getAssessmentRow(dataset, p.data.id);
  if (!row) {
    res.status(404).json({ error: "Assessment not found." });
    return;
  }
  if (row.status === "queued" || row.status === "running") {
    await db.update(assessmentsTable).set({ stopRequested: true, progress: "Stopping after the current step" }).where(eq(assessmentsTable.id, row.id));
    await appendAudit({ dataset, role, action: "assessment.stop_requested", entityType: "assessment", entityId: String(row.id), summary: `Stop requested for assessment ${row.id}.` });
  }
  const fresh = (await getAssessmentRow(dataset, row.id))!;
  res.json(StopAssessmentResponse.parse((await summaries(dataset, [fresh]))[0]));
});

export default router;
