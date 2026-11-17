import {
  db,
  assessmentsTable,
  assessmentDocumentsTable,
  agentStepsTable,
  findingsTable,
  evidenceTable,
  documentsTable,
  documentPagesTable,
  banksTable,
  productsTable,
  rulesTable,
  rulebookVersionsTable,
  type AssessmentRow,
} from "@workspace/db";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import type { Dataset } from "../dataset";
import type { DocumentSuggestion } from "../suggest";
import { LIMITS, type Alert } from "./run";

const EMPTY_COUNTS = () => ({ compliant: 0, breach: 0, warning: 0, needs_review: 0, not_applicable: 0 });

export async function summaries(dataset: Dataset, rows: AssessmentRow[]) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [banks, products, versions, countRows] = await Promise.all([
    db.select().from(banksTable).where(eq(banksTable.dataset, dataset)),
    db.select().from(productsTable).where(eq(productsTable.dataset, dataset)),
    db.select().from(rulebookVersionsTable).where(eq(rulebookVersionsTable.dataset, dataset)),
    db
      .select({ id: findingsTable.assessmentId, status: findingsTable.proposedStatus, n: count() })
      .from(findingsTable)
      .where(inArray(findingsTable.assessmentId, ids))
      .groupBy(findingsTable.assessmentId, findingsTable.proposedStatus),
  ]);
  return rows.map((a) => {
    const counts = EMPTY_COUNTS();
    for (const c of countRows.filter((x) => x.id === a.id)) counts[c.status] = Number(c.n);
    return {
      id: a.id,
      bankId: a.bankId,
      bankName: banks.find((b) => b.id === a.bankId)?.nameEn ?? null,
      productId: a.productId,
      productName: products.find((p) => p.id === a.productId)?.name ?? null,
      rulebookVersionId: a.rulebookVersionId,
      rulebookVersion: versions.find((v) => v.id === a.rulebookVersionId)?.version ?? null,
      kind: a.kind,
      status: a.status,
      stopReason: a.stopReason,
      progress: a.progress,
      stepsUsed: a.stepsUsed,
      stepLimit: a.stepLimit || LIMITS.stepLimit,
      tokensIn: a.tokensIn,
      tokensOut: a.tokensOut,
      tokenLimit: a.tokenLimit || LIMITS.tokenLimit,
      model: a.model,
      startedAt: a.startedAt,
      finishedAt: a.finishedAt,
      createdAt: a.createdAt,
      counts,
    };
  });
}

export async function listAssessmentRows(dataset: Dataset) {
  return db.select().from(assessmentsTable).where(and(eq(assessmentsTable.dataset, dataset), eq(assessmentsTable.kind, "agentic"))).orderBy(desc(assessmentsTable.id));
}

export async function getAssessmentRow(dataset: Dataset, id: number) {
  const [row] = await db.select().from(assessmentsTable).where(and(eq(assessmentsTable.dataset, dataset), eq(assessmentsTable.id, id)));
  return row ?? null;
}

async function gapMap(docIds: number[]) {
  const m = new Map<number, number[]>();
  if (!docIds.length) return m;
  const rows = await db
    .select({ d: documentPagesTable.documentId, p: documentPagesTable.pageNo })
    .from(documentPagesTable)
    .where(and(inArray(documentPagesTable.documentId, docIds), eq(documentPagesTable.isGap, true)));
  for (const r of rows) m.set(r.d, [...(m.get(r.d) ?? []), r.p]);
  return m;
}

export async function candidates(dataset: Dataset) {
  const [banks, products, docs, assessments] = await Promise.all([
    db.select().from(banksTable).where(eq(banksTable.dataset, dataset)),
    db.select().from(productsTable).where(eq(productsTable.dataset, dataset)).orderBy(asc(productsTable.id)),
    db.select().from(documentsTable).where(eq(documentsTable.dataset, dataset)),
    listAssessmentRows(dataset),
  ]);
  const confirmed = docs.filter((d) => d.status === "confirmed" && d.docType && d.language);
  const gaps = await gapMap(confirmed.map((d) => d.id));
  const lastSummaries = await summaries(
    dataset,
    products.map((p) => assessments.find((a) => a.productId === p.id)).filter((a): a is AssessmentRow => Boolean(a)),
  );
  return products.map((p) => {
    const mine = confirmed.filter((d) => d.productId === p.id);
    const awaiting = docs.filter(
      (d) => (d.status === "uploaded" || d.status === "proposed") && (d.productId === p.id || (d.ingestionProposal as DocumentSuggestion | null)?.productId?.value === p.id),
    ).length;
    const missing = (["kfs", "tnc", "rewards", "fees"] as const).filter((t) => !mine.some((d) => d.docType === t && d.language === "en"));
    return {
      bankId: p.bankId,
      bankName: banks.find((b) => b.id === p.bankId)?.nameEn ?? "",
      productId: p.id,
      productName: p.name,
      documents: mine
        .sort((a, b) => a.id - b.id)
        .map((d) => ({ id: d.id, originalName: d.originalName, docType: d.docType!, language: d.language!, gapPages: gaps.get(d.id) ?? [] })),
      missingDocTypes: missing,
      awaitingCount: awaiting,
      ready: mine.length > 0,
      notReadyReason: mine.length ? null : "No confirmed documents for this product yet. Confirm them in Upload documents.",
      lastAssessment: lastSummaries.find((s) => s.productId === p.id) ?? null,
    };
  });
}

export async function detail(dataset: Dataset, a: AssessmentRow) {
  const [summary] = await summaries(dataset, [a]);
  const docIds = (await db.select().from(assessmentDocumentsTable).where(eq(assessmentDocumentsTable.assessmentId, a.id))).map((r) => r.documentId);
  const [docs, steps, findings, gaps] = await Promise.all([
    db.select().from(documentsTable).where(inArray(documentsTable.id, docIds.length ? docIds : [-1])),
    db.select().from(agentStepsTable).where(eq(agentStepsTable.assessmentId, a.id)).orderBy(asc(agentStepsTable.stepNo)),
    db.select().from(findingsTable).where(eq(findingsTable.assessmentId, a.id)),
    gapMap(docIds),
  ]);
  const ruleIds = findings.map((f) => f.ruleId).filter((x): x is number => x !== null);
  const [rules, evidence] = await Promise.all([
    db.select().from(rulesTable).where(inArray(rulesTable.id, ruleIds.length ? ruleIds : [-1])),
    db.select().from(evidenceTable).where(inArray(evidenceTable.findingId, findings.length ? findings.map((f) => f.id) : [-1])).orderBy(asc(evidenceTable.id)),
  ]);
  const docById = new Map(docs.map((d) => [d.id, d]));
  const order = ["breach", "warning", "needs_review", "compliant", "not_applicable"];
  const items = findings
    .map((f) => {
      const r = rules.find((x) => x.id === f.ruleId);
      return {
        id: f.id,
        ruleId: f.ruleId,
        ruleCode: r?.code ?? "(deleted rule)",
        ruleTitle: r?.title ?? "",
        ruleText: r?.text ?? "",
        checkType: r?.checkType ?? "presence",
        threshold: (r?.threshold as { value: number | null; unit: string | null; raw: string } | null) ?? null,
        proposedStatus: f.proposedStatus,
        severity: f.severity,
        rationale: f.rationale,
        verification: f.verification,
        proposedBy: f.proposedBy,
        evidence: evidence
          .filter((e) => e.findingId === f.id)
          .map((e) => {
            const d = docById.get(e.documentId);
            return {
              id: e.id,
              documentId: e.documentId,
              documentName: d?.originalName ?? "Deleted document",
              docType: d?.docType ?? null,
              language: d?.language ?? null,
              pageNo: e.pageNo,
              quote: e.quote,
              verified: e.verified,
            };
          }),
        checks: (f.checks as { label: string; result: string; detail: string }[]) ?? [],
      };
    })
    .sort((x, y) => order.indexOf(x.proposedStatus) - order.indexOf(y.proposedStatus) || x.ruleCode.localeCompare(y.ruleCode, undefined, { numeric: true }));
  return {
    ...summary!,
    documents: docs
      .sort((x, y) => x.id - y.id)
      .map((d) => ({ id: d.id, originalName: d.originalName, docType: d.docType!, language: d.language!, gapPages: gaps.get(d.id) ?? [] })),
    steps: steps.map((s) => ({
      id: s.id,
      agent: s.agent,
      stepNo: s.stepNo,
      tool: s.tool,
      summary: s.summary,
      tokensIn: s.tokensIn,
      tokensOut: s.tokensOut,
      latencyMs: s.latencyMs,
      error: s.error,
      createdAt: s.createdAt,
    })),
    findings: items,
    alerts: (a.alerts as Alert[]) ?? [],
  };
}
