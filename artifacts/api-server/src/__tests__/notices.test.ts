import { describe, expect, it } from "vitest";
import { addBusinessDays, isBusinessDay, isValidDate } from "../lib/notices/business-days";
import { canEditState, checkNoticeApprover, defaultAction, noticeState } from "../lib/notices/report";
import { pdfSafe, renderNoticePdf } from "../lib/notices/export-pdf";
import { renderNoticeDocx } from "../lib/notices/export-docx";
import { ReviewError, noticeEligible, type DecisionState, type DecisionView } from "../lib/review";
import type { NoticeView } from "../lib/notices/report";
import { inflateRawSync, inflateSync } from "node:zlib";

/** All text drawn in a PDF: inflates each content stream (pdf-lib writes text as hex strings). */
function pdfText(buf: Buffer): string {
  const raw = buf.toString("latin1");
  let out = "";
  for (const m of raw.matchAll(/stream\r?\n/g)) {
    const start = m.index! + m[0].length;
    const end = raw.indexOf("endstream", start);
    let body: string;
    try { body = inflateSync(buf.subarray(start, end)).toString("latin1"); } catch { body = raw.slice(start, end); }
    for (const h of body.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) out += Buffer.from(h[1]!, "hex").toString("latin1") + "\n";
  }
  return out;
}

/** One file from a DOCX (zip) without a zip library: reads the local file header and inflates it. */
function docxPart(buf: Buffer, name: string): string {
  const at = buf.indexOf(Buffer.from(name));
  const hdr = at - 30;
  const method = buf.readUInt16LE(hdr + 8), size = buf.readUInt32LE(hdr + 18), nameLen = buf.readUInt16LE(hdr + 26), extra = buf.readUInt16LE(hdr + 28);
  const data = buf.subarray(hdr + 30 + nameLen + extra, size ? hdr + 30 + nameLen + extra + size : undefined);
  return (method === 8 ? inflateRawSync(data) : data).toString("utf8");
}

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
  approvalStatus: "approved", makerIsYou: false, checker: "C", checkerNote: null, checkedAt: new Date(), selfApproved: false, ...over,
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
  const status = (f: () => void) => { try { f(); } catch (e) { return (e as ReviewError).status; } return 0; };
  it("blocks the sender, examiners and viewers", () => {
    expect(status(() => checkNoticeApprover(sender, { id: 7, role: "senior_examiner", actor: "Maker" }, "awaiting"))).toBe(403);
    expect(status(() => checkNoticeApprover(sender, { id: 9, role: "examiner", actor: "X" }, "awaiting"))).toBe(403);
    expect(status(() => checkNoticeApprover(sender, { id: 9, role: "viewer", actor: "X" }, "awaiting"))).toBe(403);
    expect(status(() => checkNoticeApprover(sender, { id: 9, role: "senior_examiner", actor: "X" }, "approved"))).toBe(409);
    expect(status(() => checkNoticeApprover(sender, { id: 9, role: "senior_examiner", actor: "X" }, "awaiting"))).toBe(0);
    // An included finding that is no longer an approved breach or warning blocks approval.
    expect(status(() => checkNoticeApprover(sender, { id: 9, role: "senior_examiner", actor: "X" }, "awaiting", 1))).toBe(409);
  });
  it("strict mode (the default) blocks the sender from approving their own report", () => {
    expect(status(() => checkNoticeApprover(sender, { id: 7, role: "senior_examiner", actor: "Maker" }, "awaiting", 0, "strict"))).toBe(403);
    expect(status(() => checkNoticeApprover({ userId: null, actor: "Maker" }, { id: 3, role: "senior_examiner", actor: "Maker" }, "awaiting", 0, "strict"))).toBe(403);
  });
  it("PoC mode lets the senior examiner who sent it approve, and flags it as self-approved", () => {
    expect(checkNoticeApprover(sender, { id: 7, role: "senior_examiner", actor: "Maker" }, "awaiting", 0, "poc")).toEqual({ selfApproved: true });
    expect(checkNoticeApprover(sender, { id: 9, role: "senior_examiner", actor: "X" }, "awaiting", 0, "poc")).toEqual({ selfApproved: false });
    expect(checkNoticeApprover(sender, { id: 9, role: "senior_examiner", actor: "X" }, "awaiting", 0, "strict")).toEqual({ selfApproved: false });
  });
  it("PoC mode keeps every other check: state and stale findings", () => {
    expect(status(() => checkNoticeApprover(sender, { id: 7, role: "senior_examiner", actor: "Maker" }, "approved", 0, "poc"))).toBe(409);
    expect(status(() => checkNoticeApprover(sender, { id: 7, role: "senior_examiner", actor: "Maker" }, "draft", 0, "poc"))).toBe(409);
    expect(status(() => checkNoticeApprover(sender, { id: 7, role: "senior_examiner", actor: "Maker" }, "awaiting", 1, "poc"))).toBe(409);
  });
  it("a viewer or an examiner cannot approve in either mode, even their own report", () => {
    for (const mode of ["strict", "poc"] as const) {
      for (const role of ["viewer", "examiner"]) {
        expect(status(() => checkNoticeApprover(sender, { id: 9, role, actor: "X" }, "awaiting", 0, mode))).toBe(403);
        expect(status(() => checkNoticeApprover(sender, { id: 7, role, actor: "Maker" }, "awaiting", 0, mode))).toBe(403);
      }
      expect(status(() => checkNoticeApprover(sender, undefined, "awaiting", 0, mode))).toBe(401);
    }
  });
});

const view = (state: NoticeView["state"]): NoticeView => ({
  id: 1, assessmentId: 1, productName: "Cashback Card", bankName: "Test Bank", state,
  referenceDate: "2026-11-18", responseDueDate: "2026-12-08", responseDays: 14, body: "Please respond in writing.",
  overall: { rating: 3, label: "Needs improvement", provisional: false },
  themes: [{ theme: "Fees and charges", rating: 4, label: "Weak", breaches: 1, warnings: 0, complaints: 12, peerMedian: 8 }],
  findings: [{
    findingId: 1, ruleCode: "R-1", ruleTitle: "Fee table", ruleText: "Show all fees.", sourceRef: "Standards 2.3", theme: "Fees and charges",
    status: "breach", severity: "high", rationale: "The annual fee is missing.", examinerNote: null, decidedBy: "M", approvedBy: "C", selfApproved: false,
    evidence: [{ documentName: "kfs.pdf", docType: "kfs", pageNo: 2, quote: "رسوم سنوية Annual fee", verified: true }],
    action: "Add the annual fee.", dueDate: "2026-12-16", included: true, stillEligible: true,
  }],
  newlyEligible: 0, outdated: false, newer: null, history: [], submittedBy: "M", submittedByYou: false, checker: "C", checkerNote: null, checkedAt: new Date(), selfApproved: false,
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
  it("labels a self-approved report and finding in the PDF and the Word file", async () => {
    const v = view("approved");
    v.selfApproved = true;
    v.checker = "M";
    v.findings[0]!.selfApproved = true;
    const text = pdfText(await renderNoticePdf(v));
    expect(text).toContain("Self-approved (PoC mode)");
    expect(text).toContain("approved by C, Self-approved (PoC mode)");
    const xml = docxPart(await renderNoticeDocx(v), "word/document.xml");
    expect(xml.match(/Self-approved \(PoC mode\)/g)?.length).toBe(2);
    // Not labelled when a different senior examiner approved.
    expect(pdfText(await renderNoticePdf(view("approved")))).not.toContain("Self-approved");
    expect(docxPart(await renderNoticeDocx(view("approved")), "word/document.xml")).not.toContain("Self-approved");
  });
});
