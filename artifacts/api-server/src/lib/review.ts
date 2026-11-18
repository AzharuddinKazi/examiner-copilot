import { actorLabel, currentUser } from "./auth";
/**
 * Review and decide (M3). The queue holds findings from the latest finished assessment of each
 * product. Decisions are append-only; the latest row per finding wins. Older assessments stay
 * readable but closed to new decisions.
 */
import {
  db,
  assessmentsTable,
  decisionsTable,
  decisionApprovalsTable,
  documentPagesTable,
  findingsTable,
  evidenceTable,
  rulesTable,
  banksTable,
  productsTable,
  type AssessmentRow,
} from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getMakerCheckerMode, type Dataset, type MakerCheckerMode } from "./dataset";
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

// ---------------- Maker-checker ----------------

export type ApprovalStatus = "not_required" | "awaiting" | "approved" | "returned";
type DecisionRow = typeof decisionsTable.$inferSelect;
type ApprovalRow = typeof decisionApprovalsTable.$inferSelect;

/** A Breach decision, and every Modify or Reject, needs a senior examiner's approval. Routine accepts do not. */
export function needsApproval(decision: DecisionKind, finalStatus: Status | null): boolean {
  return decision !== "accept" || finalStatus === "breach";
}

/** State of one decision from its checker steps (the latest step wins). */
export function approvalStatus(d: Pick<DecisionRow, "needsApproval">, steps: Pick<ApprovalRow, "action">[]): ApprovalStatus {
  if (!d.needsApproval) return "not_required";
  const last = steps[steps.length - 1];
  return !last ? "awaiting" : last.action === "approve" ? "approved" : "returned";
}

export const isFinal = (s: ApprovalStatus) => s === "not_required" || s === "approved";

/**
 * Who may approve or return. Only a senior examiner, and only while it is awaiting approval. In strict
 * mode (the default) never the person who made the decision. In PoC mode (single-user trials only) the
 * maker may check their own decision; the result says so, and the step is stored as self-approved.
 * Enforced on the server; the UI only mirrors it.
 */
export function checkApprover(
  maker: { userId: number | null; actor: string | null },
  checker: { id: number; role: string; actor: string | null } | undefined,
  state: ApprovalStatus,
  mode: MakerCheckerMode = "strict",
): { selfApproved: boolean } {
  if (!checker) throw new ReviewError(401, "Sign in to continue.");
  if (checker.role !== "senior_examiner") throw new ReviewError(403, "Only a senior examiner can approve or return a decision.");
  const same = maker.userId !== null ? maker.userId === checker.id : !!maker.actor && maker.actor === checker.actor;
  if (same && mode !== "poc") throw new ReviewError(403, "You made this decision, so a different senior examiner must check it.");
  if (state !== "awaiting") throw new ReviewError(409, state === "not_required" ? "This decision does not need approval." : `This decision is already ${state}.`);
  return { selfApproved: same };
}

/** Shown wherever a self-approval appears (UI, audit summary, exports). */
export const SELF_APPROVED_LABEL = "Self-approved (PoC mode)";

export interface DecisionView {
  id: number;
  decision: DecisionKind;
  finalStatus: Status | null;
  examinerNote: string | null;
  role: string;
  actor: string | null;
  decidedAt: Date;
  approvalStatus: ApprovalStatus;
  makerIsYou: boolean;
  checker: string | null;
  checkerNote: string | null;
  checkedAt: Date | null;
  /** The latest checker step was by the maker (PoC mode only). */
  selfApproved: boolean;
}

function toDecision(d: DecisionRow, steps: ApprovalRow[]): DecisionView {
  const me = currentUser();
  const last = steps[steps.length - 1];
  return {
    id: d.id,
    decision: d.decision,
    finalStatus: d.finalStatus,
    examinerNote: d.examinerNote,
    role: d.role,
    actor: d.actor,
    decidedAt: d.decidedAt,
    approvalStatus: approvalStatus(d, steps),
    makerIsYou: !!me && (d.makerUserId !== null ? d.makerUserId === me.id : !!d.actor && d.actor === actorLabel(me)),
    checker: last?.actor ?? null,
    checkerNote: last?.note ?? null,
    checkedAt: last?.checkedAt ?? null,
    selfApproved: last?.selfApproved ?? false,
  };
}

/**
 * Per finding: the latest decision (what the queue shows) and the latest final one (what scores,
 * statistics and notices use). A decision awaiting approval or returned never counts as final.
 */
export interface DecisionState {
  latest: DecisionView;
  final: DecisionView | null;
  history: DecisionView[];
}

/** Newest first in, state out. Pure, for tests. */
export function decisionState(history: DecisionView[]): DecisionState | null {
  if (!history.length) return null;
  return { latest: history[0]!, final: history.find((d) => isFinal(d.approvalStatus)) ?? null, history };
}

async function loadHistories(findingIds: number[]): Promise<Map<number, DecisionView[]>> {
  const m = new Map<number, DecisionView[]>();
  if (!findingIds.length) return m;
  const rows = await db.select().from(decisionsTable).where(inArray(decisionsTable.findingId, findingIds)).orderBy(desc(decisionsTable.id));
  const steps = rows.length
    ? await db.select().from(decisionApprovalsTable).where(inArray(decisionApprovalsTable.decisionId, rows.map((r) => r.id))).orderBy(decisionApprovalsTable.id)
    : [];
  for (const r of rows) {
    const list = m.get(r.findingId) ?? [];
    list.push(toDecision(r, steps.filter((s) => s.decisionId === r.id)));
    m.set(r.findingId, list);
  }
  return m;
}

export async function decisionStates(findingIds: number[]): Promise<Map<number, DecisionState>> {
  const out = new Map<number, DecisionState>();
  for (const [id, h] of await loadHistories(findingIds)) out.set(id, decisionState(h)!);
  return out;
}

/** The latest decision per finding (pending or not), as shown in the queue. */
export async function latestDecisions(findingIds: number[]) {
  const m = new Map<number, DecisionView>();
  for (const [id, s] of await decisionStates(findingIds)) m.set(id, s.latest);
  return m;
}

/**
 * Findings a draft notice may cite: an approved (or no-approval-needed) Breach or Warning. An unapproved
 * Breach never reaches a notice. Pure, for tests and for the notices step.
 */
export function noticeEligible<T extends { decision: DecisionState | null }>(items: T[]): T[] {
  return items.filter((i) => {
    const s = i.decision?.final?.finalStatus;
    return s === "breach" || s === "warning";
  });
}

/** An item still needs work from the maker when it has no decision or its latest one was returned. */
export const needsMaker = (d: DecisionView | null) => !d || d.approvalStatus === "returned";

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
  const [rules, evidence, states] = await Promise.all([
    db.select().from(rulesTable).where(inArray(rulesTable.id, ruleIds.length ? ruleIds : [-1])),
    db.select({ findingId: evidenceTable.findingId }).from(evidenceTable).where(inArray(evidenceTable.findingId, fIds.length ? fIds : [-1])),
    decisionStates(fIds),
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
        decision: states.get(f.id)?.latest ?? null,
        finalDecision: states.get(f.id)?.final ?? null,
        challengerVerdict: (f.challenger as { verdict?: "supports" | "does_not_support" | "unclear" } | null)?.verdict ?? null,
      };
    })
    .sort(
      (x, y) =>
        Number(!needsMaker(x.decision)) - Number(!needsMaker(y.decision)) ||
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
        undecided: mine.filter((i) => needsMaker(i.decision)).length,
        bulkAcceptable: mine.filter((i) => !i.decision && bulkEligible(i.proposedStatus, i.verification)).length,
      };
    })
    .sort((x, y) => (x.productName ?? "").localeCompare(y.productName ?? ""));
  // Decided = a final decision stands (approved, or a routine accept). Pending ones are counted apart.
  const decided = items.filter((i) => i.finalDecision && !needsMaker(i.decision) && i.decision?.approvalStatus !== "awaiting");
  return {
    items: items.map(({ finalDecision: _f, ...i }) => i),
    products: productsOut,
    counts: {
      total: items.length,
      undecided: items.filter((i) => needsMaker(i.decision)).length,
      decided: decided.length,
      accepted: decided.filter((i) => i.finalDecision!.decision === "accept").length,
      modified: decided.filter((i) => i.finalDecision!.decision === "modify").length,
      rejected: decided.filter((i) => i.finalDecision!.decision === "reject").length,
      awaitingApproval: items.filter((i) => i.decision?.approvalStatus === "awaiting").length,
      returned: items.filter((i) => i.decision?.approvalStatus === "returned").length,
      disagreements: items.filter((i) => i.challengerVerdict === "does_not_support").length,
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
  const [d, latest, histories, queue] = await Promise.all([detail(dataset, a), latestFinished(dataset), loadHistories([f.id]), reviewQueue(dataset)]);
  const decisions = histories.get(f.id) ?? [];
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
      if (needsMaker(cand.decision) && cand.findingId !== f.id) {
        nextUndecidedId = cand.findingId;
        break;
      }
    }
  }
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
  const approval = needsApproval(input.decision, finalStatus);
  const me = currentUser();
  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(decisionsTable)
      .values({ dataset, findingId: f.id, decision: input.decision, finalStatus, examinerNote: note, role, actor: actorLabel(me), makerUserId: me?.id ?? null, needsApproval: approval })
      .returning();
    const text = `${summary}${approval ? " Awaiting approval by a senior examiner." : ""}`;
    await appendAudit(
      {
        dataset,
        role,
        action: prev ? "finding.decision_changed" : "finding.decided",
        entityType: "finding",
        entityId: String(f.id),
        summary: prev ? `${text} (replaces an earlier ${prev.decision})` : text,
        before: prev ? { decision: prev.decision, finalStatus: prev.finalStatus } : null,
        after: { decisionId: row!.id, decision: input.decision, proposedStatus: f.proposedStatus, finalStatus, note, approval: approval ? "awaiting" : "not_required" },
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
    const me = currentUser();
    // Routine Compliant / Not applicable accepts: final at once, no approval step.
    await tx.insert(decisionsTable).values(eligible.map((f) => ({ dataset, findingId: f.id, decision: "accept" as const, finalStatus: f.proposedStatus, examinerNote: note, role, actor: actorLabel(me), makerUserId: me?.id ?? null, needsApproval: false })));
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

/** The checker step: a senior examiner (not the maker) approves or returns a decision awaiting approval. */
export async function reviewDecision(dataset: Dataset, decisionId: number, input: { action: "approve" | "return"; note?: string | null }) {
  const [d] = await db.select().from(decisionsTable).where(and(eq(decisionsTable.dataset, dataset), eq(decisionsTable.id, decisionId)));
  if (!d) throw new ReviewError(404, "Decision not found.");
  const [newest] = await db.select({ id: decisionsTable.id }).from(decisionsTable).where(eq(decisionsTable.findingId, d.findingId)).orderBy(desc(decisionsTable.id)).limit(1);
  if (newest && newest.id !== d.id) throw new ReviewError(409, "A newer decision on this finding replaced this one. Check that one instead.");
  const steps = await db.select().from(decisionApprovalsTable).where(eq(decisionApprovalsTable.decisionId, d.id)).orderBy(decisionApprovalsTable.id);
  const me = currentUser();
  const mode = await getMakerCheckerMode();
  const { selfApproved } = checkApprover({ userId: d.makerUserId, actor: d.actor }, me ? { id: me.id, role: me.role, actor: actorLabel(me) } : undefined, approvalStatus(d, steps), mode);
  const note = input.note?.trim() || null;
  if (input.action === "return" && !note) throw new ReviewError(400, "Write a note telling the examiner what to change.");
  const [f] = await db.select().from(findingsTable).where(eq(findingsTable.id, d.findingId));
  const latest = await latestFinished(dataset);
  if (!f || !latest.some((a) => a.id === f.assessmentId)) throw new ReviewError(409, "A newer assessment of this product exists; this decision is kept for the record.");
  const [rule] = f.ruleId ? await db.select().from(rulesTable).where(eq(rulesTable.id, f.ruleId)) : [];
  const code = rule?.code ?? `finding ${f.id}`;
  const what = d.decision === "reject" ? `rejection of ${STATUS_LABEL[f.proposedStatus]}` : `${d.decision} as ${STATUS_LABEL[d.finalStatus!]}`;
  await db.transaction(async (tx) => {
    await tx.insert(decisionApprovalsTable).values({ dataset, decisionId: d.id, action: input.action, note, role: me!.role, actor: actorLabel(me), checkerUserId: me!.id, selfApproved });
    await appendAudit(
      {
        dataset,
        role: me!.role,
        action: input.action === "approve" ? "finding.decision_approved" : "finding.decision_returned",
        entityType: "finding",
        entityId: String(f.id),
        summary:
          input.action === "approve"
            ? selfApproved
              ? `${SELF_APPROVED_LABEL}: approved own ${what} for ${code}.`
              : `Approved the ${what} for ${code} made by ${d.actor ?? "an examiner"}.`
            : selfApproved
              ? `Returned own ${what} for ${code} (PoC mode): ${note}`
              : `Returned the ${what} for ${code} to ${d.actor ?? "the examiner"}: ${note}`,
        before: { decisionId: d.id, approval: "awaiting", maker: d.actor },
        after: { decisionId: d.id, approval: input.action === "approve" ? "approved" : "returned", note, ...(selfApproved ? { self_approved: true, makerCheckerMode: mode } : {}) },
      },
      tx,
    );
  });
  return f.id;
}
