import { describe, expect, it } from "vitest";
import { addBusinessDays, isBusinessDay, isValidDate } from "../lib/notices/business-days";
import { canEditState, checkNoticeApprover, defaultAction, noticeState } from "../lib/notices/report";
import { pdfSafe, renderNoticePdf } from "../lib/notices/export-pdf";
import { renderNoticeDocx } from "../lib/notices/export-docx";
import { ReviewError, noticeEligible, type DecisionState, type DecisionView } from "../lib/review";
import type { NoticeView } from "../lib/notices/report";

describe("business days (Saturday and Sunday off)", () => {
  it("skips the weekend", () => {
    // 2026-11-19 is a Thursday.
    expect(addBusinessDays("2026-11-19", 1)).toBe("2026-11-20");
    expect(addBusinessDays("2026-11-19", 2)).toBe("2026-11-23");
    expect(addBusinessDays("2026-11-21", 1)).toBe("2026-11-23"); // from a Saturday
    expect(isBusinessDay("2026-11-22")).toBe(false);
  });
  it("gives 14 business days as two working weeks plus skips holidays", () => {
    expect(addBusinessDays("2026-11-18", 14)).toBe("2026-12-08");
    expect(addBusinessDays("2026-11-18", 14, new Set(["2026-12-02", "2026-12-03"]))).toBe("2026-12-10");
  });
  it("rejects impossible dates", () => {
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("2026-02-28")).toBe(true);
    expect(() => addBusinessDays("18/11/2026", 1)).toThrow();
  });
});

const dv = (over: Partial<DecisionView>): DecisionView => ({
  id: 1, decision: "accept", finalStatus: "breach", examinerNote: null, role: "examiner", actor: "M", decidedAt: new Date(),
  approvalStatus: "approved", makerIsYou: false, checker: "C", checkerNote: null, checkedAt: new Date(), ...over,
});
const st = (d: DecisionView): DecisionState => ({ latest: d, final: d.approvalStatus === "approved" || d.approvalStatus === "not_required" ? d : null, history: [d] });

describe("what goes into a report", () => {
  it("only approved breaches and warnings", () => {
    const items = [
      { id: 1, decision: st(dv({})) },
      { id: 2, decision: st(dv({ finalStatus: "warning", approvalStatus: "not_required" })) },
      { id: 3, decision: st(dv({ approvalStatus: "awaiting" })) },
      { id: 4, decision: st(dv({ approvalStatus: "returned" })) },
      { id: 5, decision: st(dv({ finalStatus: "compliant" })) },
      { id: 6, decision: null },
    ];
    expect(noticeEligible(items).map((i) => i.id)).toEqual([1, 2]);
  });
  it("writes a next step from the rule's 'satisfied' wording when it exists", () => {
    const rule = { code: "R-1", title: "Fee table", details: [{ label: "satisfied", value: "Every fee is shown in AED." }] };
    expect(defaultAction(rule, "breach")).toMatch(/^Correct the disclosure so that it meets R-1: Every fee is shown in AED\./);
    expect(defaultAction({ ...rule, details: [] }, "warning")).toMatch(/^Clarify .* R-1 \(Fee table\)/);
  });
});

describe("report approval", () => {
  const sender = { userId: 7, actor: "Maker" };
  it("reads the state from the latest step", () => {
    expect(noticeState([])).toBe("draft");
    expect(noticeState([{ action: "submit" }])).toBe("awaiting");
    expect(noticeState([{ action: "submit" }, { action: "return" }])).toBe("returned");
    expect(noticeState([{ action: "submit" }, { action: "return" }, { action: "submit" }, { action: "approve" }])).toBe("approved");
    expect(canEditState("returned")).toBe(true);
    expect(canEditState("awaiting")).toBe(false);
    expect(canEditState("approved")).toBe(false);
  });
  it("blocks the sender, examiners and viewers", () => {
    const status = (f: () => void) => { try { f(); } catch (e) { return (e as ReviewError).status; } return 0; };
    expect(status(() => checkNoticeApprover(sender, { id: 7, role: "senior_examiner", actor: "Maker" }, "awaiting"))).toBe(403);
    expect(status(() => checkNoticeApprover(sender, { id: 9, role: "examiner", actor: "X" }, "awaiting"))).toBe(403);
    expect(status(() => checkNoticeApprover(sender, { id: 9, role: "viewer", actor: "X" }, "awaiting"))).toBe(403);
    expect(status(() => checkNoticeApprover(sender, { id: 9, role: "senior_examiner", actor: "X" }, "approved"))).toBe(409);
    expect(status(() => checkNoticeApprover(sender, { id: 9, role: "senior_examiner", actor: "X" }, "awaiting"))).toBe(0);
    // An included finding that is no longer an approved breach or warning blocks approval.
    expect(status(() => checkNoticeApprover(sender, { id: 9, role: "senior_examiner", actor: "X" }, "awaiting", 1))).toBe(409);
  });
});

const view = (state: NoticeView["state"]): NoticeView => ({
  id: 1, assessmentId: 1, productName: "Cashback Card", bankName: "Test Bank", state,
  referenceDate: "2026-11-18", responseDueDate: "2026-12-08", responseDays: 14, body: "Please respond in writing.",
  overall: { rating: 3, label: "Needs improvement", provisional: false },
  themes: [{ theme: "Fees and charges", rating: 4, label: "Weak", breaches: 1, warnings: 0, complaints: 12, peerMedian: 8 }],
  findings: [{
    findingId: 1, ruleCode: "R-1", ruleTitle: "Fee table", ruleText: "Show all fees.", sourceRef: "Standards 2.3", theme: "Fees and charges",
    status: "breach", severity: "high", rationale: "The annual fee is missing.", examinerNote: null, decidedBy: "M", approvedBy: "C",
    evidence: [{ documentName: "kfs.pdf", docType: "kfs", pageNo: 2, quote: "رسوم سنوية Annual fee", verified: true }],
    action: "Add the annual fee.", dueDate: "2026-12-16", included: true, stillEligible: true,
  }],
  newlyEligible: 0, outdated: false, newer: null, history: [], submittedBy: "M", submittedByYou: false, checker: "C", checkerNote: null, checkedAt: new Date(),
  canEdit: false, canSubmit: false, canApprove: false, createdAt: new Date(), updatedAt: new Date(),
});

describe("exports", () => {
  it("replaces Arabic in the PDF with a pointer to the Word file", () => {
    expect(pdfSafe("Fee رسوم سنوية here")).toBe("Fee [Arabic text: see the Word file] here");
    expect(pdfSafe("“quoted” – fine")).toBe("“quoted” – fine");
  });
  it("renders a PDF and a Word file", async () => {
    const pdf = await renderNoticePdf(view("draft"));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const docx = await renderNoticeDocx(view("approved"));
    expect(docx.subarray(0, 2).toString()).toBe("PK");
  });
});
