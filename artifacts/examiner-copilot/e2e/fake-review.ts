import type {
  ApprovalInput, Decision, DecisionInput, DecisionKind, FindingDetail, FindingStatus, MakerCheckerMode, ReviewItem, ReviewQueue, Severity,
} from "@workspace/api-client-react";
import type { Person } from "./fake-api";

/**
 * In-memory stand-in for the API's review endpoints (queue, finding, decisions, approvals). It follows the
 * server rules in lib/review.ts: a Breach, and every Modify or Reject, waits for a senior examiner's approval;
 * in strict mode the checker must be a different person; a return needs a note; viewers cannot change anything.
 * The server rules themselves are unit-tested in the API (maker-checker.test.ts).
 */

export const REVIEW_ASSESSMENT_ID = 52;
const PRODUCT = { id: 9, name: "Platinum Card", bank: "Test Bank", bankId: 3 };
const FINISHED_AT = "2026-11-16T08:00:00.000Z";

const STATUS_ORDER: FindingStatus[] = ["breach", "warning", "needs_review", "compliant", "not_applicable"];
const SEVERITY_ORDER: Severity[] = ["high", "medium", "low"];

interface StoredFinding { id: number; ruleCode: string; ruleTitle: string; proposedStatus: FindingStatus; severity: Severity; rationale: string }
interface StoredStep { action: ApprovalInput["action"]; by: Person; note: string | null; at: string }
interface StoredDecision {
  id: number; findingId: number; decision: DecisionKind; finalStatus: FindingStatus | null; examinerNote: string | null;
  by: Person; decidedAt: string; needsApproval: boolean; steps: StoredStep[];
}

const actor = (p: Person) => `${p.name} <${p.email}>`;
/** Same rule as the server: a Breach, and every change or rejection, needs a senior examiner's approval. */
const needsApproval = (kind: DecisionKind, finalStatus: FindingStatus | null) => kind !== "accept" || finalStatus === "breach";
const approvalStatus = (d: StoredDecision): Decision["approvalStatus"] => {
  if (!d.needsApproval) return "not_required";
  const last = d.steps[d.steps.length - 1];
  return !last ? "awaiting" : last.action === "approve" ? "approved" : "returned";
};
const needsMaker = (d: Decision | null) => !d || d.approvalStatus === "returned";

function baseFindings(): StoredFinding[] {
  return [
    { id: 201, ruleCode: "R-1", ruleTitle: "Annual fee in the fee table", proposedStatus: "breach", severity: "high", rationale: "The annual fee is missing from the fee table." },
    { id: 202, ruleCode: "R-4", ruleTitle: "Cashback cap", proposedStatus: "warning", severity: "medium", rationale: "The cap is mentioned only in a footnote." },
    { id: 203, ruleCode: "R-7", ruleTitle: "Arabic version available", proposedStatus: "compliant", severity: "low", rationale: "Both language versions were supplied." },
  ];
}

export class FakeReview {
  findings = baseFindings();
  decisions: StoredDecision[] = [];
  private nextDecisionId = 500;

  /** Puts a decision straight into the store, e.g. one already made by someone else. */
  seedDecision(opts: { findingId: number; decision: DecisionKind; finalStatus?: FindingStatus | null; note?: string; by: Person; steps?: { action: ApprovalInput["action"]; by: Person; note?: string }[] }): number {
    const f = this.findings.find((x) => x.id === opts.findingId)!;
    const finalStatus = opts.decision === "accept" ? f.proposedStatus : opts.decision === "reject" ? null : opts.finalStatus ?? null;
    const id = this.nextDecisionId++;
    this.decisions.push({
      id, findingId: f.id, decision: opts.decision, finalStatus, examinerNote: opts.note ?? null, by: opts.by,
      decidedAt: new Date().toISOString(), needsApproval: needsApproval(opts.decision, finalStatus),
      steps: (opts.steps ?? []).map((s) => ({ action: s.action, by: s.by, note: s.note ?? null, at: new Date().toISOString() })),
    });
    return id;
  }

  private history(findingId: number) {
    return this.decisions.filter((d) => d.findingId === findingId).sort((a, b) => b.id - a.id);
  }

  private view(d: StoredDecision, me: Person): Decision {
    const last = d.steps[d.steps.length - 1];
    return {
      id: d.id, decision: d.decision, finalStatus: d.finalStatus, examinerNote: d.examinerNote, role: d.by.role, actor: actor(d.by),
      decidedAt: d.decidedAt, approvalStatus: approvalStatus(d), makerIsYou: d.by.id === me.id,
      checker: last ? actor(last.by) : null, checkerNote: last?.note ?? null, checkedAt: last?.at ?? null,
      selfApproved: !!last && last.action === "approve" && last.by.id === d.by.id,
    };
  }

  queue(me: Person): ReviewQueue {
    const items: (ReviewItem & { final: Decision | null })[] = this.findings.map((f) => {
      const hist = this.history(f.id).map((d) => this.view(d, me));
      return {
        findingId: f.id, assessmentId: REVIEW_ASSESSMENT_ID, bankId: PRODUCT.bankId, bankName: PRODUCT.bank, productId: PRODUCT.id, productName: PRODUCT.name,
        ruleCode: f.ruleCode, ruleTitle: f.ruleTitle, proposedStatus: f.proposedStatus, severity: f.severity, verification: "verified",
        rationale: f.rationale, evidenceCount: 0, decision: hist[0] ?? null, challengerVerdict: null,
        final: hist.find((d) => d.approvalStatus === "not_required" || d.approvalStatus === "approved") ?? null,
      };
    });
    items.sort((x, y) =>
      Number(!needsMaker(x.decision)) - Number(!needsMaker(y.decision)) ||
      STATUS_ORDER.indexOf(x.proposedStatus) - STATUS_ORDER.indexOf(y.proposedStatus) ||
      SEVERITY_ORDER.indexOf(x.severity) - SEVERITY_ORDER.indexOf(y.severity));
    const decided = items.filter((i) => i.final && !needsMaker(i.decision) && i.decision?.approvalStatus !== "awaiting");
    return {
      items: items.map(({ final: _f, ...i }) => i),
      products: [{
        productId: PRODUCT.id, productName: PRODUCT.name, bankName: PRODUCT.bank, assessmentId: REVIEW_ASSESSMENT_ID, finishedAt: FINISHED_AT,
        total: items.length, undecided: items.filter((i) => needsMaker(i.decision)).length,
        bulkAcceptable: items.filter((i) => !i.decision && (i.proposedStatus === "compliant" || i.proposedStatus === "not_applicable")).length,
      }],
      counts: {
        total: items.length,
        undecided: items.filter((i) => needsMaker(i.decision)).length,
        decided: decided.length,
        accepted: decided.filter((i) => i.final!.decision === "accept").length,
        modified: decided.filter((i) => i.final!.decision === "modify").length,
        rejected: decided.filter((i) => i.final!.decision === "reject").length,
        awaitingApproval: items.filter((i) => i.decision?.approvalStatus === "awaiting").length,
        returned: items.filter((i) => i.decision?.approvalStatus === "returned").length,
        disagreements: 0,
      },
    };
  }

  detail(id: number, me: Person): FindingDetail | null {
    const f = this.findings.find((x) => x.id === id);
    if (!f) return null;
    const q = this.queue(me);
    const order = q.items.map((i) => i.findingId);
    const pos = order.indexOf(id);
    let nextUndecidedId: number | null = null;
    for (let k = 1; k <= order.length; k++) {
      const cand = q.items[(pos + k) % order.length]!;
      if (needsMaker(cand.decision) && cand.findingId !== id) { nextUndecidedId = cand.findingId; break; }
    }
    const history = this.history(id).map((d) => this.view(d, me));
    return {
      id: f.id, ruleId: f.id, ruleCode: f.ruleCode, ruleTitle: f.ruleTitle, ruleText: `The rule text of ${f.ruleCode}.`, checkType: "presence",
      threshold: null, proposedStatus: f.proposedStatus, severity: f.severity, rationale: f.rationale, verification: "verified",
      proposedBy: "Rule agent", verdict: null, evidence: [], checks: [], challenger: null,
      assessmentId: REVIEW_ASSESSMENT_ID, assessmentStatus: "complete", assessmentFinishedAt: FINISHED_AT, model: "test-model",
      bankName: PRODUCT.bank, productId: PRODUCT.id, productName: PRODUCT.name, isLatest: true,
      decision: history[0] ?? null, history, sourcePages: [],
      prevId: pos > 0 ? order[pos - 1]! : null, nextId: pos < order.length - 1 ? order[pos + 1]! : null, nextUndecidedId,
    };
  }

  /** Answers a review request, or null when the path is not a review endpoint. */
  handle(method: string, path: string, body: unknown, me: Person, mode: MakerCheckerMode): [number, unknown] | null {
    const fail = (status: number, error: string): [number, unknown] => [status, { error }];
    if (method === "GET" && path === "/review/queue") return [200, this.queue(me)];

    let m = /^\/findings\/(\d+)(\/decisions)?$/.exec(path);
    if (m) {
      const id = Number(m[1]);
      const f = this.findings.find((x) => x.id === id);
      if (!f) return fail(404, "Finding not found.");
      if (method === "GET" && !m[2]) return [200, this.detail(id, me)];
      if (method === "POST" && m[2]) {
        if (me.role === "viewer") return fail(403, "Your account has view-only access. Ask a senior examiner to change your role.");
        const b = body as DecisionInput;
        const note = b.examinerNote?.trim() || null;
        let finalStatus: FindingStatus | null;
        if (b.decision === "accept") finalStatus = f.proposedStatus;
        else if (b.decision === "modify") {
          if (!b.finalStatus) return fail(400, "Choose the status you are setting.");
          if (b.finalStatus === f.proposedStatus) return fail(400, "That is the proposed status. Use Accept instead.");
          if (!note) return fail(400, "Write a note explaining why you changed the status.");
          finalStatus = b.finalStatus;
        } else {
          if (!note) return fail(400, "Write a note explaining why you rejected the proposal.");
          finalStatus = null;
        }
        this.decisions.push({
          id: this.nextDecisionId++, findingId: id, decision: b.decision, finalStatus, examinerNote: note, by: me,
          decidedAt: new Date().toISOString(), needsApproval: needsApproval(b.decision, finalStatus), steps: [],
        });
        return [201, this.detail(id, me)];
      }
      return null;
    }

    m = /^\/decisions\/(\d+)\/approval$/.exec(path);
    if (m && method === "POST") {
      const d = this.decisions.find((x) => x.id === Number(m![1]));
      if (!d) return fail(404, "Decision not found.");
      if (this.history(d.findingId)[0]!.id !== d.id) return fail(409, "A newer decision on this finding replaced this one. Check that one instead.");
      if (me.role !== "senior_examiner") return fail(403, "Only a senior examiner can approve or return a decision.");
      const same = d.by.id === me.id;
      if (same && mode !== "poc") return fail(403, "You made this decision, so a different senior examiner must check it.");
      const state = approvalStatus(d);
      if (state !== "awaiting") return fail(409, state === "not_required" ? "This decision does not need approval." : `This decision is already ${state}.`);
      const b = body as ApprovalInput;
      const note = b.note?.trim() || null;
      if (b.action === "return" && !note) return fail(400, "Write a note telling the examiner what to change.");
      d.steps.push({ action: b.action, by: me, note, at: new Date().toISOString() });
      return [200, this.detail(d.findingId, me)];
    }
    return null;
  }
}
