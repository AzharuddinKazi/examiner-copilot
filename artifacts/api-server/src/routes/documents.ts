import { Router, type IRouter } from "express";
import {
  GetDocumentParams,
  ConfirmDocumentParams,
  ConfirmDocumentBody,
  RejectDocumentParams,
  RejectDocumentBody,
  ListDocumentsResponse,
  UploadDocumentResponse,
  GetDocumentResponse,
  ConfirmDocumentResponse,
  RejectDocumentResponse,
  RequestDocumentAgentProposalParams,
  RequestDocumentAgentProposalResponse,
} from "@workspace/api-zod";
import { db, documentsTable, productsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { getActiveDataset } from "../lib/dataset";
import { appendAudit } from "../lib/audit";
import { requireWriter } from "../lib/roles";
import { receiveFile } from "../lib/upload";
import { getFile } from "../lib/files";
import { PDF_LIMITS, PdfValidationError } from "../lib/pdf";
import { llmReady, queueDocumentProposal } from "../lib/ingest/run";
import {
  findDuplicate,
  getDocumentRow,
  getPages,
  insertPreparedDocument,
  listDocumentRows,
  loadBanksForMatch,
  prepareDocument,
  summarize,
} from "../lib/documents";

const router: IRouter = Router();

const DOC_TYPE_LABEL = { kfs: "Key Facts Statement", tnc: "Terms and Conditions", rewards: "Rewards terms", fees: "Fees Schedule", advert: "Advertisement" } as const;

router.get("/documents", async (_req, res): Promise<void> => {
  const dataset = await getActiveDataset();
  const rows = await listDocumentRows(dataset);
  const items = await summarize(dataset, rows);
  const counts = {
    total: items.length,
    awaiting: items.filter((d) => d.status === "uploaded" || d.status === "proposed").length,
    confirmed: items.filter((d) => d.status === "confirmed").length,
    rejected: items.filter((d) => d.status === "rejected").length,
    withGaps: items.filter((d) => d.gapPages.length > 0).length,
  };
  res.json(ListDocumentsResponse.parse({ items, counts, limits: PDF_LIMITS }));
});

router.post("/documents", async (req, res): Promise<void> => {
  if (!(await receiveFile(req, res, PDF_LIMITS.maxBytes, "PDF"))) return;
  const role = requireWriter(req, res);
  if (!role) return;
  const file = req.file!;
  const dataset = await getActiveDataset();
  let prepared;
  try {
    prepared = await prepareDocument(file.buffer, file.originalname, await loadBanksForMatch(dataset));
  } catch (err) {
    if (err instanceof PdfValidationError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
  const existingId = await findDuplicate(dataset, prepared.sha256);
  if (existingId !== null) {
    res.status(409).json({ error: "This exact file is already uploaded.", existingId });
    return;
  }
  const row = await db.transaction(async (tx) => {
    const r = await insertPreparedDocument(tx, dataset, prepared);
    const gaps = prepared.extraction.gapPages;
    await appendAudit(
      {
        dataset,
        role,
        action: "document.uploaded",
        entityType: "document",
        entityId: String(r.id),
        summary:
          `Uploaded ${r.originalName} (${r.pageCount} page${r.pageCount === 1 ? "" : "s"}).` +
          (gaps.length ? ` No text on page ${gaps.join(", ")}.` : ""),
        after: { sha256: r.sha256, pageCount: r.pageCount, gapPages: gaps, suggestion: prepared.suggestion },
      },
      tx,
    );
    return r;
  });
  // The Ingestion agent's proposal arrives in the background; the rule-based suggestion is immediate.
  if (llmReady()) await queueDocumentProposal(dataset, row.id, role);
  const [summary] = await summarize(dataset, [(await getDocumentRow(dataset, row.id)) ?? row]);
  res.status(201).json(UploadDocumentResponse.parse(summary));
});

router.get("/documents/:id", async (req, res): Promise<void> => {
  const params = GetDocumentParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: "Document not found." });
    return;
  }
  const dataset = await getActiveDataset();
  const row = await getDocumentRow(dataset, params.data.id);
  if (!row) {
    res.status(404).json({ error: "Document not found." });
    return;
  }
  const [summary] = await summarize(dataset, [row]);
  const pages = await getPages(row.id);
  res.json(
    GetDocumentResponse.parse({
      ...summary,
      pages: pages.map((p) => ({
        pageNo: p.pageNo,
        text: p.textNormalized,
        charCount: p.charCount,
        isGap: p.isGap,
        extractionMethod: p.extractionMethod,
      })),
    }),
  );
});

router.get("/documents/:id/file", async (req, res): Promise<void> => {
  const params = GetDocumentParams.safeParse(req.params);
  const dataset = await getActiveDataset();
  const row = params.success ? await getDocumentRow(dataset, params.data.id) : null;
  const file = row ? await getFile(dataset, Number(row.fileKey)) : null;
  if (!row || !file) {
    res.status(404).json({ error: "Document not found." });
    return;
  }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(row.originalName)}`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "sandbox");
  res.send(file.data);
});

router.post("/documents/:id/confirm", async (req, res): Promise<void> => {
  const role = requireWriter(req, res);
  if (!role) return;
  const params = ConfirmDocumentParams.safeParse(req.params);
  const body = ConfirmDocumentBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Choose a bank, product, document type and language." });
    return;
  }
  const dataset = await getActiveDataset();
  const row = await getDocumentRow(dataset, params.data.id);
  if (!row) {
    res.status(404).json({ error: "Document not found." });
    return;
  }
  const [product] = await db
    .select()
    .from(productsTable)
    .where(and(eq(productsTable.dataset, dataset), eq(productsTable.id, body.data.productId)));
  if (!product || product.bankId !== body.data.bankId) {
    res.status(400).json({ error: "The product does not belong to the chosen bank." });
    return;
  }
  const versionLabel = body.data.versionLabel?.trim() || null;
  const before = { status: row.status, bankId: row.bankId, productId: row.productId, docType: row.docType, language: row.language, versionLabel: row.versionLabel };
  const after = { status: "confirmed" as const, bankId: body.data.bankId, productId: body.data.productId, docType: body.data.docType, language: body.data.language, versionLabel };
  const updated = await db.transaction(async (tx) => {
    const [u] = await tx
      .update(documentsTable)
      .set({ ...after, rejectedReason: null, confirmedAt: new Date(), confirmedByRole: role })
      .where(and(eq(documentsTable.dataset, dataset), eq(documentsTable.id, row.id)))
      .returning();
    await appendAudit(
      {
        dataset,
        role,
        action: row.status === "confirmed" ? "document.details_changed" : "document.confirmed",
        entityType: "document",
        entityId: String(row.id),
        summary: `${row.status === "confirmed" ? "Changed details of" : "Confirmed"} ${row.originalName} as ${DOC_TYPE_LABEL[body.data.docType]} (${body.data.language === "ar" ? "Arabic" : "English"}) for ${product.name}.`,
        before,
        after,
      },
      tx,
    );
    return u!;
  });
  const [summary] = await summarize(dataset, [updated]);
  res.json(ConfirmDocumentResponse.parse(summary));
});

router.post("/documents/:id/agent-proposal", async (req, res): Promise<void> => {
  const role = requireWriter(req, res);
  if (!role) return;
  const params = RequestDocumentAgentProposalParams.safeParse(req.params);
  const dataset = await getActiveDataset();
  const row = params.success ? await getDocumentRow(dataset, params.data.id) : null;
  if (!row) {
    res.status(404).json({ error: "Document not found." });
    return;
  }
  if (!llmReady()) {
    res.status(503).json({ error: "The model provider is not configured. Add the OpenRouter key in Secrets; the rule-based suggestion still works." });
    return;
  }
  if ((row.agentProposal as { status?: string } | null)?.status !== "running") await queueDocumentProposal(dataset, row.id, role);
  const [summary] = await summarize(dataset, [(await getDocumentRow(dataset, row.id))!]);
  res.status(202).json(RequestDocumentAgentProposalResponse.parse(summary));
});

router.post("/documents/:id/reject", async (req, res): Promise<void> => {
  const role = requireWriter(req, res);
  if (!role) return;
  const params = RejectDocumentParams.safeParse(req.params);
  const body = RejectDocumentBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Give a reason of at least 3 characters." });
    return;
  }
  const dataset = await getActiveDataset();
  const row = await getDocumentRow(dataset, params.data.id);
  if (!row) {
    res.status(404).json({ error: "Document not found." });
    return;
  }
  const reason = body.data.reason.trim();
  const updated = await db.transaction(async (tx) => {
    const [u] = await tx
      .update(documentsTable)
      .set({ status: "rejected", rejectedReason: reason })
      .where(and(eq(documentsTable.dataset, dataset), eq(documentsTable.id, row.id)))
      .returning();
    await appendAudit(
      {
        dataset,
        role,
        action: "document.rejected",
        entityType: "document",
        entityId: String(row.id),
        summary: `Excluded ${row.originalName} from assessment: ${reason}`,
        before: { status: row.status },
        after: { status: "rejected", reason },
      },
      tx,
    );
    return u!;
  });
  const [summary] = await summarize(dataset, [updated]);
  res.json(RejectDocumentResponse.parse(summary));
});

export default router;
