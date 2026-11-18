import type { Page, Route } from "@playwright/test";
import { FakeReview } from "./fake-review";
import type {
  ApprovalInput, MakerCheckerMode, WorkspaceStatus, Notice, NoticeCreateInput, NoticeFinding, NoticeList, NoticeState, NoticeStep, NoticeUpdateInput, User, WorkspaceProgress,
} from "@workspace/api-client-react";

/**
 * In-memory stand-in for the API's report (notice) endpoints. It follows the same rules as the server
 * (lib/notices/report.ts): only draft or returned reports can change, viewers cannot change anything, and
 * only a senior examiner other than the sender can approve or return. The server rules themselves are
 * unit-tested in the API; this lets the browser tests sign in as different people without Clerk.
 */

export type Person = Pick<User, "id" | "name" | "email" | "role">;

export const PEOPLE = {
  maker: { id: 2, name: "Maya Examiner", email: "maya@example.test", role: "examiner" },
  senior: { id: 1, name: "Sara Senior", email: "sara@example.test", role: "senior_examiner" },
  otherSenior: { id: 3, name: "Omar Senior", email: "omar@example.test", role: "senior_examiner" },
  viewer: { id: 4, name: "Vic Viewer", email: "vic@example.test", role: "viewer" },
} satisfies Record<string, Person>;

export const ASSESSMENT_ID = 41;
const PRODUCT = "Cashback Card";
const BANK = "Test Bank";
const RESPONSE_DAYS = 14;
/** Default business days to fix a finding, by severity (as on the server). */
const FIX_DAYS = { high: 20, medium: 40, low: 60 } as const;
/** Today in the UAE, the server's default reference date for a new report. */
export const todayInDubai = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

const actor = (p: Person) => `${p.name} <${p.email}>`;
const iso = () => new Date().toISOString();

/** Day 1 is the next business day; Saturday and Sunday are off (same as the server, without holidays). */
export function addBusinessDays(from: string, days: number): string {
  const d = new Date(`${from}T00:00:00Z`);
  let left = days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d.toISOString().slice(0, 10);
}

interface StoredStep { action: NoticeStep["action"]; by: Person; note: string | null; at: string }
interface StoredNotice {
  id: number;
  referenceDate: string | null;
  body: string;
  findings: NoticeFinding[];
  history: StoredStep[];
  createdAt: string;
  updatedAt: string;
}

function baseFindings(): NoticeFinding[] {
  return [
    {
      findingId: 101, ruleCode: "R-1", ruleTitle: "Annual fee in the fee table", ruleText: "Show every fee in the Key Facts Statement.",
      sourceRef: "Standards 2.3", theme: "Fees and charges", status: "breach", severity: "high",
      rationale: "The annual fee is missing from the fee table.", examinerNote: null, decidedBy: actor(PEOPLE.maker), approvedBy: actor(PEOPLE.senior),
      evidence: [{ documentName: "kfs.pdf", docType: "kfs", pageNo: 2, quote: "Fees: see schedule", verified: true }],
      action: "Correct the disclosure so that it meets R-1.", dueDate: null, included: true, stillEligible: true, selfApproved: false,
    },
    {
      findingId: 102, ruleCode: "R-4", ruleTitle: "Cashback cap", ruleText: "State any cap on cashback.",
      sourceRef: null, theme: "Rewards", status: "warning", severity: "medium",
      rationale: "The cap is mentioned only in a footnote.", examinerNote: null, decidedBy: actor(PEOPLE.maker), approvedBy: null,
      evidence: [], action: "Clarify the cashback cap in the main text.", dueDate: null, included: true, stillEligible: true, selfApproved: false,
    },
  ];
}

const stateOf = (h: StoredStep[]): NoticeState => {
  const last = h[h.length - 1];
  if (!last) return "draft";
  return last.action === "submit" ? "awaiting" : last.action === "approve" ? "approved" : "returned";
};
const editableState = (s: NoticeState) => s === "draft" || s === "returned";

export class FakeApi {
  me: Person = PEOPLE.maker;
  /** The workspace maker-checker mode the page sees (strict unless a test turns PoC mode on). */
  makerCheckerMode: MakerCheckerMode = "strict";
  /** The review queue, findings and decisions (see fake-review.ts). */
  review = new FakeReview();
  notices = new Map<number, StoredNotice>();
  /** Every write the page sent, in order, for asserting payloads. */
  writes: { method: string; path: string; body: unknown; as: Person["role"]; status: number }[] = [];
  /** Any /api call the fake does not know; a test fails if this is not empty. */
  unknown: string[] = [];
  private nextId = 7;

  signInAs(p: Person) { this.me = p; }

  /**
   * Puts a report straight into the store, e.g. one already sent for approval by someone. Like the server's
   * createNotice, a reference date gives each finding a default due date by severity; `referenceDate: null`
   * seeds the unusual case of a report without one.
   */
  seed(opts: { referenceDate?: string | null; steps?: { action: NoticeStep["action"]; by: Person; note?: string }[] } = {}): number {
    const id = this.nextId++;
    const now = iso();
    const referenceDate = opts.referenceDate === undefined ? "2026-11-19" : opts.referenceDate;
    const findings = baseFindings().map((f) => ({ ...f, dueDate: referenceDate ? addBusinessDays(referenceDate, FIX_DAYS[f.severity]) : null }));
    this.notices.set(id, {
      id, referenceDate, body: "Please respond in writing.",
      findings, createdAt: now, updatedAt: now,
      history: (opts.steps ?? []).map((s) => ({ action: s.action, by: s.by, note: s.note ?? null, at: now })),
    });
    return id;
  }

  view(n: StoredNotice): Notice {
    const me = this.me;
    const state = stateOf(n.history);
    const lastSubmit = [...n.history].reverse().find((s) => s.action === "submit") ?? null;
    const last = n.history[n.history.length - 1];
    const lastCheck = last && last.action !== "submit" ? last : null;
    const included = n.findings.filter((f) => f.included);
    const editable = editableState(state) && me.role !== "viewer";
    return {
      id: n.id, assessmentId: ASSESSMENT_ID, productName: PRODUCT, bankName: BANK, state, selfApproved: false,
      referenceDate: n.referenceDate, responseDueDate: n.referenceDate ? addBusinessDays(n.referenceDate, RESPONSE_DAYS) : null, responseDays: RESPONSE_DAYS,
      body: n.body, overall: { rating: 3, label: "Needs improvement", provisional: false },
      themes: [{ theme: "Fees and charges", rating: 4, label: "Weak", breaches: 1, warnings: 0, complaints: 12, peerMedian: 8 }],
      findings: n.findings.map((f) => ({ ...f })), newlyEligible: 0, outdated: false, newer: null,
      history: n.history.map((h) => ({ action: h.action, actor: actor(h.by), note: h.note, at: h.at, selfApproved: false })),
      submittedBy: lastSubmit ? actor(lastSubmit.by) : null,
      submittedByYou: !!lastSubmit && lastSubmit.by.id === me.id,
      checker: lastCheck ? actor(lastCheck.by) : null, checkerNote: lastCheck?.note ?? null, checkedAt: lastCheck?.at ?? null,
      canEdit: editable, canSubmit: editable && included.length > 0 && !!n.referenceDate,
      canApprove: state === "awaiting" && me.role === "senior_examiner" && lastSubmit?.by.id !== me.id,
      createdAt: n.createdAt, updatedAt: n.updatedAt,
    };
  }

  list(): NoticeList {
    const notices = [...this.notices.values()].sort((a, b) => b.id - a.id);
    const forAssessment = notices[0];
    return {
      ready: [{ assessmentId: ASSESSMENT_ID, productName: PRODUCT, bankName: BANK, breaches: 1, warnings: 1, noticeId: forAssessment?.id ?? null }],
      notices: notices.map((n) => {
        const v = this.view(n);
        return {
          id: n.id, assessmentId: ASSESSMENT_ID, productName: PRODUCT, bankName: BANK, state: v.state,
          findings: v.findings.filter((f) => f.included).length, responseDueDate: v.responseDueDate, updatedAt: n.updatedAt, outdated: false,
        };
      }),
    };
  }

  /** Answers one request: [status, body]. */
  handle(method: string, path: string, body: unknown): [number, unknown] {
    const me = this.me;
    const fail = (status: number, error: string): [number, unknown] => [status, { error }];
    const writer = () => (me.role === "viewer" ? fail(403, "Your account has view-only access. Ask a senior examiner to change your role.") : null);

    if (method === "GET" && path === "/me") return [200, { ...me, createdAt: "2026-11-01T09:00:00.000Z", lastSeenAt: iso() } satisfies User];
    if (method === "GET" && path === "/workspace/progress") {
      return [200, { dataset: "live", steps: [], nextStepKey: "notices", library: { banks: 1, products: 1, rulebookVersions: 1, activeRules: 12 } } satisfies WorkspaceProgress];
    }
    if (method === "GET" && path === "/workspace/status") {
      return [200, { mode: "live", switchedAt: null, switchedByRole: null, oneWay: true, makerCheckerMode: this.makerCheckerMode } satisfies WorkspaceStatus];
    }
    const reviewAnswer = this.review.handle(method, path, body, me, this.makerCheckerMode);
    if (reviewAnswer) return reviewAnswer;
    if (method === "GET" && path === "/notices") return [200, this.list()];
    if (method === "POST" && path === "/notices") {
      const denied = writer();
      if (denied) return denied;
      const b = body as NoticeCreateInput;
      if (b.assessmentId !== ASSESSMENT_ID) return fail(404, "Assessment not found.");
      if ([...this.notices.values()].length) return fail(409, "A report already exists for this assessment.");
      const id = this.seed({ referenceDate: b.referenceDate ?? todayInDubai() });
      return [200, this.view(this.notices.get(id)!)];
    }

    const m = /^\/notices\/(\d+)(?:\/(submit|approval|sync))?$/.exec(path);
    const n = m ? this.notices.get(Number(m[1])) : undefined;
    if (m && !n) return fail(404, "Report not found.");
    if (!m || !n) return [404, { error: `The test fake does not answer ${method} ${path}.` }];
    const state = stateOf(n.history);
    const touch = () => { n.updatedAt = iso(); };

    if (method === "GET" && !m[2]) return [200, this.view(n)];
    if (method === "PATCH" && !m[2]) {
      const denied = writer();
      if (denied) return denied;
      if (!editableState(state)) return fail(409, "This report is waiting for approval; it cannot change until it is approved or returned.");
      const b = body as NoticeUpdateInput;
      if (b.body !== undefined) n.body = b.body;
      if (b.referenceDate !== undefined) n.referenceDate = b.referenceDate;
      for (const u of b.findings ?? []) {
        const f = n.findings.find((x) => x.findingId === u.findingId);
        if (!f) return fail(404, "That finding is not in this report.");
        if (u.action !== undefined) f.action = u.action;
        if (u.dueDate !== undefined) f.dueDate = u.dueDate;
        if (u.included !== undefined) f.included = u.included;
      }
      touch();
      return [200, this.view(n)];
    }
    if (method === "POST" && m[2] === "submit") {
      const denied = writer();
      if (denied) return denied;
      if (!editableState(state)) return fail(409, "This report is already waiting for approval.");
      if (!n.referenceDate) return fail(409, "Set a reference date first.");
      n.history.push({ action: "submit", by: me, note: null, at: iso() });
      touch();
      return [200, this.view(n)];
    }
    if (method === "POST" && m[2] === "approval") {
      const b = body as ApprovalInput;
      const lastSubmit = [...n.history].reverse().find((s) => s.action === "submit");
      if (me.role !== "senior_examiner") return fail(403, "Only a senior examiner can approve or return a report.");
      if (lastSubmit?.by.id === me.id) return fail(403, "You sent this report for approval, so a different senior examiner must check it.");
      if (state !== "awaiting") return fail(409, "This report is not waiting for approval.");
      if (b.action === "return" && !b.note?.trim()) return fail(400, "Write a note telling the examiner what to change.");
      n.history.push({ action: b.action, by: me, note: b.note?.trim() || null, at: iso() });
      touch();
      return [200, this.view(n)];
    }
    return [404, { error: `The test fake does not answer ${method} ${path}.` }];
  }

  /** Routes every /api request of the page to this fake. */
  async attach(page: Page) {
    await page.route(/\/api\//, async (route: Route) => {
      const req = route.request();
      const url = new URL(req.url());
      const path = url.pathname.replace(/^.*?\/api(?=\/)/, "");
      const method = req.method();
      let body: unknown = undefined;
      try { body = req.postDataJSON(); } catch { body = req.postData(); }
      const [status, json] = this.handle(method, path, body);
      if (status === 404 && typeof json === "object" && json && String((json as { error: string }).error).startsWith("The test fake")) {
        this.unknown.push(`${method} ${path}`);
      }
      if (method !== "GET") this.writes.push({ method, path, body, as: this.me.role, status });
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(json) });
    });
  }
}
