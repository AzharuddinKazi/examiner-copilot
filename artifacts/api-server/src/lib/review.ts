/**
 * Review and decide (M3). The queue holds findings from the latest finished assessment of each
 * product. Decisions are append-only; the latest row per finding wins. Older assessments stay
 * readable but closed to new decisions.
 */
import {
  db,
  assessmentsTable,
  decisionsTable,
  documentPagesTable,
  findingsTable,
  evidenceTable,
  rulesTable,
  banksTable,
  productsTable,
  type AssessmentRow,
} from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Dataset } from "./dataset";
import { appendAudit } from "./audit";
import { detail } from "./assess/queries";
import { normalizeText } from "./pdf";

type Status = "compliant" | "breach" | "warning" | "needs_review" | "not_applicable";
type DecisionKind = "accept" | "reject" | "modify";

const STATUS_ORDER: Status[] = ["breach", "warning", "needs_review", "compliant", "not_applicable"];
const SEVERITY_ORDER = ["high", "medium", "low"];
export const STATUS_LABEL: Record<Status, string> = {
  compliant: "Compliant",
  breach: "Breach",
  warning: "Warning",
  needs_review: "Needs review",
  not_applicable: "Not applicable",
};

export class ReviewError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Latest complete or stopped assessment per product (a running one does not replace it). */
export async function latestFinished(dataset: Dataset): Promise<AssessmentRow[]> {
  const rows = await db
    .select()
    .from(assessmentsTable)
    .where(and(eq(assessmentsTable.dataset, dataset), eq(assessmentsTable.kind, "agentic"), inArray(assessmentsTable.status, ["complete", "stopped"])))
    .orderBy(desc(assessmentsTable.id));
  const seen = new Set<number | null>();
  return rows.filter((r) => {
    if (r.productId === null || seen.has(r.productId)) return false;
    seen.add(r.productId);
    return true;
  });
}

function toDecision(d: typeof decisionsTable.$inferSelect) {
  return { id: d.id, decision: d.decision, finalStatus: d.finalStatus, examinerNote: d.examinerNote, role: d.role, decidedAt: d.decidedAt };
}

async function latestDecisions(findingIds: number[]) {
  const m = new Map<number, ReturnType<typeof toDecision>>();
  if (!findingIds.length) return m;
  const rows = await db.select().from(decisionsTable).where(inArray(decisionsTable.findingId, findingIds)).orderBy(desc(decisionsTable.id));
  for (const r of rows) if (!m.has(r.findingId)) m.set(r.findingId, toDecision(r));
  return m;
}

export async function reviewQueue(dataset: Dataset) {
  const assessments = await latestFinished(dataset);
  const ids = assessments.map((a) => a.id);
  const [findings, banks, products] = await Promise.all([
    db.select().from(findingsTable).where(inArray(findingsTable.assessmentId, ids.length ? ids : [-1])),
    db.select().from(banksTable).where(eq(banksTable.dataset, dataset)),
    db.select().from(productsTable).where(eq(productsTable.dataset, dataset)),
  ]);
  const fIds = findings.map((f) => f.id);
  const ruleIds = findings.map((f) => f.ruleId).filter((x): x is number => x !== null);
  const [rules, evidence, decisions] = await Promise.all([
    db.select().from(rulesTable).where(inArray(rulesTable.id, ruleIds.length ? ruleIds : [-1])),
    db.select({ findingId: evidenceTable.findingId }).from(evidenceTable).where(inArray(evidenceTable.findingId, fIds.length ? fIds : [-1])),
    latestDecisions(fIds),
  ]);
  const byAssessment = new Map(assessments.map((a) => [a.id, a]));
  const items = findings
    .map((f) => {
      const a = byAssessment.get(f.assessmentId)!;
      const r = rules.find((x) => x.id === f.ruleId);
      return {
        findingId: f.id,
        assessmentId: f.assessmentId,
        bankId: a.bankId,
        bankName: banks.find((b) => b.id === a.bankId)?.nameEn ?? null,
        productId: a.productId,
        productName: products.find((p) => p.id === a.productId)?.name ?? null,
        ruleCode: r?.code ?? "(deleted rule)",
        ruleTitle: r?.title ?? "",
        proposedStatus: f.proposedStatus,
        severity: f.severity,
        verification: f.verification,
        rationale: f.rationale,
        evidenceCount: evidence.filter((e) => e.findingId === f.id).length,
        decision: decisions.get(f.id) ?? null,
      };
    })
    .sort(
      (x, y) =>
        Number(x.decision !== null) - Number(y.decision !== null) ||
        STATUS_ORDER.indexOf(x.proposedStatus) - STATUS_ORDER.indexOf(y.proposedStatus) ||
        SEVERITY_ORDER.indexOf(x.severity) - SEVERITY_ORDER.indexOf(y.severity) ||
        (x.productName ?? "").localeCompare(y.productName ?? "") ||
        x.ruleCode.localeCompare(y.ruleCode, undefined, { numeric: true }),
    );
  const productsOut = assessments
    .map((a) => {
      const mine = items.filter((i) => i.assessmentId === a.id);
      return {
        productId: a.productId,
        productName: products.find((p) => p.id === a.productId)?.name ?? null,
        bankName: banks.find((b) => b.id === a.bankId)?.nameEn ?? null,
        assessmentId: a.id,
        finishedAt: a.finishedAt,
        total: mine.length,
        undecided: mine.filter((i) => !i.decision).length,
        bulkAcceptable: mine.filter((i) => !i.decision && bulkEligible(i.proposedStatus, i.verification)).length,
      };
    })
    .sort((x, y) => (x.productName ?? "").localeCompare(y.productName ?? ""));
  const decided = items.filter((i) => i.decision);
  return {
    items,
    products: productsOut,
    counts: {
      total: items.length,
      undecided: items.length - decided.length,
      decided: decided.length,
      accepted: decided.filter((i) => i.decision!.decision === "accept").length,
      modified: decided.filter((i) => i.decision!.decision === "modify").length,
      rejected: decided.filter((i) => i.decision!.decision === "reject").length,
    },
  };
}

export function bulkEligible(status: Status, verification: string): boolean {
  return (status === "compliant" || status === "not_applicable") && verification === "verified";
}

/** Highlight offsets in the normalized page text. Stored offsets win; otherwise search for the quote. */
export function highlightsFor(text: string, quotes: { id: number; quote: string; charStart: number | null; charEnd: number | null }[]) {
  const out: { start: number; end: number; evidenceId: number }[] = [];
  for (const q of quotes) {
    if (q.charStart !== null && q.charEnd !== null && q.charEnd <= text.length && q.charStart < q.charEnd) {
      out.push({ start: q.charStart, end: q.charEnd, evidenceId: q.id });
      continue;
    }
    const n = normalizeText(q.quote);
    const idx = n ? text.indexOf(n) : -1;
    if (idx >= 0) out.push({ start: idx, end: idx + n.length, evidenceId: q.id });
  }
  return out.sort((a, b) => a.start - b.start);
}

export async function findingDetail(dataset: Dataset, findingId: number) {
  const [f] = await db.select().from(findingsTable).where(and(eq(findingsTable.dataset, dataset), eq(findingsTable.id, findingId)));
  if (!f) return null;
  const [a] = await db.select().from(assessmentsTable).where(eq(assessmentsTable.id, f.assessmentId));
  if (!a) return null;
  const [d, latest, history, queue] = await Promise.all([
    detail(dataset, a),
    latestFinished(dataset),
    db.select().from(decisionsTable).where(eq(decisionsTable.findingId, f.id)).orderBy(desc(decisionsTable.id)),
    reviewQueue(dataset),
  ]);
  const item = d.findings.find((x) => x.id === f.id)!;
  const ev = await db.select().from(evidenceTable).where(eq(evidenceTable.findingId, f.id));
  const pageKeys = [...new Map(ev.map((e) => [`${e.documentId}:${e.pageNo}`, e])).values()];
  const pages = pageKeys.length
    ? await db
        .select()
        .from(documentPagesTable)
        .where(inArray(documentPagesTable.documentId, [...new Set(pageKeys.map((e) => e.documentId))]))
    : [];
  const sourcePages = pageKeys.map((k) => {
    const p = pages.find((x) => x.documentId === k.documentId && x.pageNo === k.pageNo);
    const doc = item.evidence.find((e) => e.documentId === k.documentId);
    const text = p?.textNormalized ?? "";
    return {
      documentId: k.documentId,
      documentName: doc?.documentName ?? "Deleted document",
      docType: doc?.docType ?? null,
      language: doc?.language ?? null,
      pageNo: k.pageNo,
      text,
      isGap: p?.isGap ?? true,
      highlights: highlightsFor(
        text,
        ev.filter((e) => e.documentId === k.documentId && e.pageNo === k.pageNo && e.verified !== "not_found"),
      ),
    };
  });
  const order = queue.items.map((i) => i.findingId);
  const pos = order.indexOf(f.id);
  let nextUndecidedId: number | null = null;
  if (order.length) {
    for (let k = 1; k <= order.length; k++) {
      const cand = queue.items[(Math.max(pos, -1) + k + order.length) % order.length]!;
      if (!cand.decision && cand.findingId !== f.id) {
        nextUndecidedId = cand.findingId;
        break;
      }
    }
  }
  const decisions = history.map(toDecision);
  return {
    ...item,
    assessmentId: a.id,
    assessmentStatus: a.status,
    assessmentFinishedAt: a.finishedAt,
    model: a.model,
    bankName: d.bankName,
    productId: a.productId,
    productName: d.productName,
    isLatest: latest.some((x) => x.id === a.id),
    decision: decisions[0] ?? null,
    history: decisions,
    sourcePages,
    prevId: pos > 0 ? order[pos - 1]! : null,
    nextId: pos >= 0 && pos < order.length - 1 ? order[pos + 1]! : null,
    nextUndecidedId,
  };
}

/** Validates a decision and returns the status to store (null for reject). Pure, for tests. */
export function resolveDecision(input: {
  decision: DecisionKind;
  proposedStatus: Status;
  finalStatus?: Status | null;
  examinerNote?: string | null;
}): { finalStatus: Status | null; note: string | null } {
  const note = input.examinerNote?.trim() || null;
  switch (input.decision) {
    case "accept":
      return { finalStatus: input.proposedStatus, note };
    case "modify":
      if (!input.finalStatus) throw new ReviewError(400, "Choose the status you are setting.");
      if (input.finalStatus === input.proposedStatus) throw new ReviewError(400, "That is the proposed status. Use Accept instead.");
      if (!note) throw new ReviewError(400, "Write a note explaining why you changed the status.");
      return { finalStatus: input.finalStatus, note };
    case "reject":
      if (!note) throw new ReviewError(400, "Write a note explaining why you rejected the proposal.");
      return { finalStatus: null, note };
  }
}

export async function recordDecision(
  dataset: Dataset,
  findingId: number,
  role: string,
  input: { decision: DecisionKind; finalStatus?: Status | null; examinerNote?: string | null },
) {
  const [f] = await db.select().from(findingsTable).where(and(eq(findingsTable.dataset, dataset), eq(findingsTable.id, findingId)));
  if (!f) throw new ReviewError(404, "Finding not found.");
  const latest = await latestFinished(dataset);
  if (!latest.some((a) => a.id === f.assessmentId)) {
    throw new ReviewError(409, "A newer assessment of this product exists. Decide on its findings instead; this one is kept for the record.");
  }
  const { finalStatus, note } = resolveDecision({ ...input, proposedStatus: f.proposedStatus });
  const [rule] = f.ruleId ? await db.select().from(rulesTable).where(eq(rulesTable.id, f.ruleId)) : [];
  const [prev] = await db.select().from(decisionsTable).where(eq(decisionsTable.findingId, f.id)).orderBy(desc(decisionsTable.id)).limit(1);
  const code = rule?.code ?? `finding ${f.id}`;
  const summary =
    input.decision === "accept"
      ? `Accepted ${STATUS_LABEL[f.proposedStatus]} for ${code}.`
      : input.decision === "modify"
        ? `Changed ${code} from ${STATUS_LABEL[f.proposedStatus]} to ${STATUS_LABEL[finalStatus!]}.`
        : `Rejected the proposed ${STATUS_LABEL[f.proposedStatus]} for ${code}.`;
  await db.transaction(async (tx) => {
    await tx.insert(decisionsTable).values({ dataset, findingId: f.id, decision: input.decision, finalStatus, examinerNote: note, role });
    await appendAudit(
      {
        dataset,
        role,
        action: prev ? "finding.decision_changed" : "finding.decided",
        entityType: "finding",
        entityId: String(f.id),
        summary: prev ? `${summary} (replaces an earlier ${prev.decision})` : summary,
        before: prev ? { decision: prev.decision, finalStatus: prev.finalStatus } : null,
        after: { decision: input.decision, proposedStatus: f.proposedStatus, finalStatus, note },
      },
      tx,
    );
  });
}

export async function bulkAccept(dataset: Dataset, assessmentId: number, role: string, examinerNote: string | null) {
  const latest = await latestFinished(dataset);
  const a = latest.find((x) => x.id === assessmentId);
  if (!a) {
    const [exists] = await db.select({ id: assessmentsTable.id }).from(assessmentsTable).where(and(eq(assessmentsTable.dataset, dataset), eq(assessmentsTable.id, assessmentId)));
    throw exists ? new ReviewError(409, "This is not the latest finished assessment for its product.") : new ReviewError(404, "Assessment not found.");
  }
  const findings = await db.select().from(findingsTable).where(eq(findingsTable.assessmentId, a.id));
  const decided = await latestDecisions(findings.map((f) => f.id));
  const eligible = findings.filter((f) => !decided.has(f.id) && bulkEligible(f.proposedStatus, f.verification));
  if (!eligible.length) return 0;
  const note = examinerNote?.trim() || null;
  const [product] = a.productId ? await db.select().from(productsTable).where(eq(productsTable.id, a.productId)) : [];
  await db.transaction(async (tx) => {
    await tx.insert(decisionsTable).values(eligible.map((f) => ({ dataset, findingId: f.id, decision: "accept" as const, finalStatus: f.proposedStatus, examinerNote: note, role })));
    await appendAudit(
      {
        dataset,
        role,
        action: "finding.bulk_accepted",
        entityType: "assessment",
        entityId: String(a.id),
        summary: `Accepted ${eligible.length} quote-verified Compliant or Not applicable proposal${eligible.length === 1 ? "" : "s"} for ${product?.name ?? "a product"} in one step.`,
        after: { findingIds: eligible.map((f) => f.id), note },
      },
      tx,
    );
  });
  return eligible.length;
}
