import { Router, type IRouter } from "express";
import {
  CreateBankBody,
  CreateProductBody,
  CreateProductParams,
  CommitRulebookImportBody,
  GetRulebookVersionParams,
  ActivateRulebookVersionParams,
  ActivateRulebookVersionBody,
  ListBanksResponse,
  CreateBankResponse,
  CreateProductResponse,
  ListRulebooksResponse,
  PreviewRulebookImportResponse,
  CommitRulebookImportResponse,
  GetRulebookVersionResponse,
  ActivateRulebookVersionResponse,
  RequestRulebookAgentMappingParams,
  RequestRulebookAgentMappingResponse,
} from "@workspace/api-zod";
import {
  db,
  banksTable,
  productsTable,
  documentsTable,
  rulebooksTable,
  rulebookVersionsTable,
  rulesTable,
} from "@workspace/db";
import { and, asc, eq, sql } from "drizzle-orm";
import { getActiveDataset } from "../lib/dataset";
import { appendAudit } from "../lib/audit";
import { requireWriter } from "../lib/roles";
import { receiveFile } from "../lib/upload";
import { getFile, storeFile } from "../lib/files";
import { XLSX_LIMITS, WorkbookError, parseWorkbook, proposeMapping, buildRules } from "../lib/rulebook-import";
import { activateVersion, createRulebookVersion, versionSummaries } from "../lib/rulebooks";
import { proposeMappingWithAgent } from "../lib/ingest/agent";
import { llmReady } from "../lib/ingest/run";
import { LlmError } from "../lib/llm/adapter";
import { renderSampleRulebook } from "../lib/demo/generate";
import { DEMO_RULEBOOK_FILE } from "../lib/demo/content";

const router: IRouter = Router();

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// ---------------- Banks and products ----------------

router.get("/banks", async (_req, res): Promise<void> => {
  const dataset = await getActiveDataset();
  const banks = await db.select().from(banksTable).where(eq(banksTable.dataset, dataset)).orderBy(asc(banksTable.nameEn));
  const products = await db.select().from(productsTable).where(eq(productsTable.dataset, dataset)).orderBy(asc(productsTable.name));
  const docCounts = await db
    .select({ bankId: documentsTable.bankId, productId: documentsTable.productId, n: sql<number>`count(*)::int` })
    .from(documentsTable)
    .where(and(eq(documentsTable.dataset, dataset), sql`${documentsTable.status} <> 'rejected'`))
    .groupBy(documentsTable.bankId, documentsTable.productId);
  const items = banks.map((b) => ({
    id: b.id,
    nameEn: b.nameEn,
    nameAr: b.nameAr,
    documentCount: docCounts.filter((d) => d.bankId === b.id).reduce((s, d) => s + d.n, 0),
    products: products
      .filter((p) => p.bankId === b.id)
      .map((p) => ({
        id: p.id,
        bankId: p.bankId,
        name: p.name,
        cardTier: p.cardTier,
        documentCount: docCounts.filter((d) => d.productId === p.id).reduce((s, d) => s + d.n, 0),
      })),
  }));
  res.json(ListBanksResponse.parse({ items }));
});

router.post("/banks", async (req, res): Promise<void> => {
  const role = requireWriter(req.body?.role, res);
  if (!role) return;
  const parsed = CreateBankBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter an English bank name of 2 to 120 characters." });
    return;
  }
  const dataset = await getActiveDataset();
  const nameEn = parsed.data.nameEn.trim();
  const nameAr = parsed.data.nameAr?.trim() || null;
  const existing = await db.select().from(banksTable).where(eq(banksTable.dataset, dataset));
  if (existing.some((b) => sameName(b.nameEn, nameEn))) {
    res.status(409).json({ error: `A bank named "${nameEn}" already exists.` });
    return;
  }
  const bank = await db.transaction(async (tx) => {
    const [b] = await tx.insert(banksTable).values({ dataset, nameEn, nameAr }).returning();
    await appendAudit(
      { dataset, role, action: "bank.created", entityType: "bank", entityId: String(b!.id), summary: `Added bank ${nameEn}.`, after: { nameEn, nameAr } },
      tx,
    );
    return b!;
  });
  res.status(201).json(CreateBankResponse.parse({ ...bank, products: [], documentCount: 0 }));
});

router.post("/banks/:id/products", async (req, res): Promise<void> => {
  const role = requireWriter(req.body?.role, res);
  if (!role) return;
  const params = CreateProductParams.safeParse(req.params);
  const body = CreateProductBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Enter a product name of 2 to 120 characters." });
    return;
  }
  const dataset = await getActiveDataset();
  const [bank] = await db
    .select()
    .from(banksTable)
    .where(and(eq(banksTable.dataset, dataset), eq(banksTable.id, params.data.id)));
  if (!bank) {
    res.status(404).json({ error: "Bank not found." });
    return;
  }
  const name = body.data.name.trim();
  const cardTier = body.data.cardTier?.trim() || null;
  const siblings = await db.select().from(productsTable).where(eq(productsTable.bankId, bank.id));
  if (siblings.some((p) => sameName(p.name, name))) {
    res.status(409).json({ error: `${bank.nameEn} already has a product named "${name}".` });
    return;
  }
  const product = await db.transaction(async (tx) => {
    const [p] = await tx.insert(productsTable).values({ dataset, bankId: bank.id, name, cardTier }).returning();
    await appendAudit(
      {
        dataset,
        role,
        action: "product.created",
        entityType: "product",
        entityId: String(p!.id),
        summary: `Added product ${name} to ${bank.nameEn}.`,
        after: { bankId: bank.id, name, cardTier },
      },
      tx,
    );
    return p!;
  });
  res.status(201).json(CreateProductResponse.parse({ ...product, documentCount: 0 }));
});

// ---------------- Rulebooks ----------------

router.get("/rulebooks", async (_req, res): Promise<void> => {
  const dataset = await getActiveDataset();
  const rulebooks = await db.select().from(rulebooksTable).where(eq(rulebooksTable.dataset, dataset)).orderBy(asc(rulebooksTable.id));
  const versions = await versionSummaries(dataset);
  const active = versions.find((v) => v.status === "active");
  res.json(
    ListRulebooksResponse.parse({
      items: rulebooks.map((rb) => ({ id: rb.id, name: rb.name, versions: versions.filter((v) => v.rulebookId === rb.id) })),
      activeVersionId: active?.id ?? null,
    }),
  );
});

router.get("/rulebooks/sample.xlsx", async (_req, res): Promise<void> => {
  const buf = await renderSampleRulebook();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${DEMO_RULEBOOK_FILE}"`);
  res.send(buf);
});

router.post("/rulebooks/import/preview", async (req, res): Promise<void> => {
  if (!(await receiveFile(req, res, XLSX_LIMITS.maxBytes, ".xlsx rulebook"))) return;
  const role = requireWriter(req.body?.role, res);
  if (!role) return;
  const file = req.file!;
  if (!/\.xlsx$/i.test(file.originalname)) {
    res.status(400).json({ error: "Only .xlsx rulebooks are accepted. Save the file as Excel Workbook (.xlsx)." });
    return;
  }
  let sheet;
  try {
    sheet = await parseWorkbook(file.buffer);
  } catch (err) {
    if (err instanceof WorkbookError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
  const dataset = await getActiveDataset();
  const stored = await storeFile({
    dataset,
    purpose: "rulebook",
    originalName: file.originalname,
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    data: file.buffer,
  });
  const { mapping, reasons } = proposeMapping(sheet.headers);
  res.json(
    PreviewRulebookImportResponse.parse({
      importId: stored.id,
      fileName: stored.originalName,
      sheetName: sheet.sheetName,
      headers: sheet.headers,
      sampleRows: sheet.rows.slice(0, 5).map((r) => r.cells),
      rowCount: sheet.rows.length,
      proposedMapping: mapping,
      mappingReasons: reasons,
    }),
  );
});

router.post("/rulebooks/import/:importId/agent-mapping", async (req, res): Promise<void> => {
  const role = requireWriter(req.body?.role, res);
  if (!role) return;
  const params = RequestRulebookAgentMappingParams.safeParse(req.params);
  const dataset = await getActiveDataset();
  const file = params.success ? await getFile(dataset, params.data.importId) : null;
  if (!file || file.purpose !== "rulebook") {
    res.status(404).json({ error: "This import was not found. Upload the workbook again." });
    return;
  }
  if (!llmReady()) {
    res.status(503).json({ error: "The model provider is not configured. Use the rule-based mapping or map the columns yourself." });
    return;
  }
  const sheet = await parseWorkbook(file.data);
  const rules = proposeMapping(sheet.headers).mapping;
  try {
    const r = await proposeMappingWithAgent({ headers: sheet.headers, sampleRows: sheet.rows.slice(0, 5).map((x) => x.cells), rules });
    const differs = r.checked.reasons.filter((x) => x.agreement === "differs").map((x) => x.field);
    await appendAudit({
      dataset,
      role,
      action: "rulebook.agent_mapping_proposed",
      entityType: "rulebook_import",
      entityId: String(file.id),
      summary: `Ingestion agent proposed a column mapping for ${file.originalName}${differs.length ? `; differs from the rule-based mapping on ${differs.join(", ")}` : ""}.`,
      after: { mapping: r.checked.mapping, model: r.model, tokens: r.tokensIn + r.tokensOut },
    });
    res.json(
      RequestRulebookAgentMappingResponse.parse({
        mapping: r.checked.mapping,
        reasons: r.checked.reasons,
        model: r.model,
        tokensIn: r.tokensIn,
        tokensOut: r.tokensOut,
        latencyMs: r.latencyMs,
      }),
    );
  } catch (err) {
    if (err instanceof LlmError) {
      res.status(502).json({ error: `${err.message} The rule-based mapping is unchanged.` });
      return;
    }
    throw err;
  }
});

router.post("/rulebooks/import/commit", async (req, res): Promise<void> => {
  const role = requireWriter(req.body?.role, res);
  if (!role) return;
  const body = CommitRulebookImportBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "The import request is incomplete. Start the import again." });
    return;
  }
  const dataset = await getActiveDataset();
  const file = await getFile(dataset, body.data.importId);
  if (!file || file.purpose !== "rulebook") {
    res.status(404).json({ error: "This import was not found. Upload the workbook again." });
    return;
  }
  const sheet = await parseWorkbook(file.data);
  const { rules, rowErrors } = buildRules(sheet, body.data.mapping);
  const valid = rowErrors.length === 0 && rules.length > 0;
  const base = { dryRun: body.data.dryRun, valid, rules, rowErrors, versionId: null, rulebookId: null, version: null };
  if (body.data.dryRun || !valid) {
    res.json(CommitRulebookImportResponse.parse(base));
    return;
  }

  let rulebookId = body.data.rulebookId ?? null;
  const rulebookName = body.data.rulebookName?.trim() || null;
  if (rulebookId !== null) {
    const [rb] = await db
      .select()
      .from(rulebooksTable)
      .where(and(eq(rulebooksTable.dataset, dataset), eq(rulebooksTable.id, rulebookId)));
    if (!rb) {
      res.status(404).json({ error: "That rulebook was not found." });
      return;
    }
  } else if (!rulebookName) {
    res.status(400).json({ error: "Name the new rulebook, or choose an existing one to add a version to." });
    return;
  }

  const created = await db.transaction(async (tx) => {
    const out = await createRulebookVersion(tx, {
      dataset,
      rulebookId,
      rulebookName,
      sourceFileId: file.id,
      mapping: body.data.mapping,
      rules,
    });
    await appendAudit(
      {
        dataset,
        role,
        action: "rulebook.version_imported",
        entityType: "rulebook_version",
        entityId: String(out.version.id),
        summary: `Imported ${rules.length} rules from ${file.originalName} as version ${out.version.version} (draft).`,
        after: { rulebookId: out.rulebookId, version: out.version.version, mapping: body.data.mapping, ruleCodes: rules.map((r) => r.code) },
      },
      tx,
    );
    return out;
  });
  rulebookId = created.rulebookId;
  res.json(
    CommitRulebookImportResponse.parse({ ...base, versionId: created.version.id, rulebookId, version: created.version.version }),
  );
});

router.get("/rulebook-versions/:id", async (req, res): Promise<void> => {
  const params = GetRulebookVersionParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: "Rulebook version not found." });
    return;
  }
  const dataset = await getActiveDataset();
  const [summary] = await versionSummaries(dataset, [params.data.id]);
  if (!summary) {
    res.status(404).json({ error: "Rulebook version not found." });
    return;
  }
  const [version] = await db.select().from(rulebookVersionsTable).where(eq(rulebookVersionsTable.id, summary.id));
  const [rb] = await db.select().from(rulebooksTable).where(eq(rulebooksTable.id, summary.rulebookId));
  const rules = await db.select().from(rulesTable).where(eq(rulesTable.versionId, summary.id)).orderBy(asc(rulesTable.rowNo), asc(rulesTable.id));
  res.json(
    GetRulebookVersionResponse.parse({
      ...summary,
      rulebookName: rb?.name ?? "Rulebook",
      columnMapping: version?.columnMapping ?? null,
      rules: rules.map((r) => ({
        id: r.id,
        code: r.code,
        title: r.title,
        text: r.text,
        category: r.category,
        appliesToDocTypes: r.appliesToDocTypes,
        checkType: r.checkType,
        threshold: r.threshold ?? null,
        severity: r.severity,
      })),
    }),
  );
});

router.post("/rulebook-versions/:id/activate", async (req, res): Promise<void> => {
  const role = requireWriter(req.body?.role, res);
  if (!role) return;
  const params = ActivateRulebookVersionParams.safeParse(req.params);
  if (!params.success || !ActivateRulebookVersionBody.safeParse(req.body).success) {
    res.status(404).json({ error: "Rulebook version not found." });
    return;
  }
  const dataset = await getActiveDataset();
  const [summary] = await versionSummaries(dataset, [params.data.id]);
  if (!summary) {
    res.status(404).json({ error: "Rulebook version not found." });
    return;
  }
  if (summary.status === "active") {
    res.json(ActivateRulebookVersionResponse.parse(summary));
    return;
  }
  if (summary.status === "retired") {
    res.status(409).json({ error: "Retired versions cannot be made active again. Import the rules as a new version." });
    return;
  }
  if (summary.ruleCount === 0) {
    res.status(409).json({ error: "This version has no rules." });
    return;
  }
  await db.transaction(async (tx) => {
    const { retired } = await activateVersion(tx, dataset, summary.id);
    await appendAudit(
      {
        dataset,
        role,
        action: "rulebook.version_activated",
        entityType: "rulebook_version",
        entityId: String(summary.id),
        summary:
          `Made version ${summary.version} active (${summary.ruleCount} rules).` +
          (retired.length ? ` Retired version ${retired.map((r) => r.version).join(", ")}.` : ""),
        before: { activeVersionIds: retired.map((r) => r.id) },
        after: { activeVersionId: summary.id },
      },
      tx,
    );
  });
  const [after] = await versionSummaries(dataset, [summary.id]);
  res.json(ActivateRulebookVersionResponse.parse(after));
});

export default router;
