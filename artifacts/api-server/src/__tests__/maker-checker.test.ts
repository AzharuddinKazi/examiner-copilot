import { describe, expect, it } from "vitest";
import {
  ReviewError,
  approvalStatus,
  checkApprover,
  decisionState,
  needsApproval,
  needsMaker,
  noticeEligible,
  type DecisionView,
} from "../lib/review";
import { outcomeFor } from "../lib/scoring/scorecard";

const view = (over: Partial<DecisionView>): DecisionView => ({
  id: 1,
  decision: "accept",
  finalStatus: "breach",
  examinerNote: null,
  role: "examiner",
  actor: "Maker <maker@x.ae>",
  decidedAt: new Date(),
  approvalStatus: "awaiting",
  makerIsYou: false,
  checker: null,
  checkerNote: null,
  checkedAt: null,
  ...over,
});
const maker = { userId: 7, actor: "Maker <maker@x.ae>" };
const senior = { id: 9, role: "senior_examiner", actor: "Checker <checker@x.ae>" };

describe("which decisions need approval", () => {
  it("needs approval for a Breach and for every Modify or Reject, not for routine accepts", () => {
    expect(needsApproval("accept", "breach")).toBe(true);
    expect(needsApproval("modify", "compliant")).toBe(true);
    expect(needsApproval("reject", null)).toBe(true);
    expect(needsApproval("accept", "compliant")).toBe(false);
    expect(needsApproval("accept", "not_applicable")).toBe(false);
  });
  it("reads the state from the latest checker step", () => {
    expect(approvalStatus({ needsApproval: false }, [])).toBe("not_required");
    expect(approvalStatus({ needsApproval: true }, [])).toBe("awaiting");
    expect(approvalStatus({ needsApproval: true }, [{ action: "approve" }])).toBe("approved");
    expect(approvalStatus({ needsApproval: true }, [{ action: "return" }])).toBe("returned");
  });
});

describe("who may approve", () => {
  it("blocks self-approval with 403", () => {
    const e = (() => { try { checkApprover(maker, { id: 7, role: "senior_examiner", actor: maker.actor }, "awaiting"); } catch (x) { return x; } return null; })();
    expect(e).toBeInstanceOf(ReviewError);
    expect((e as ReviewError).status).toBe(403);
  });
  it("blocks self-approval on older rows that only have the actor name", () => {
    expect(() => checkApprover({ userId: null, actor: maker.actor }, { id: 3, role: "senior_examiner", actor: maker.actor }, "awaiting")).toThrow(/different senior examiner/);
  });
  it("does not let a viewer or an examiner approve", () => {
    for (const role of ["viewer", "examiner"]) {
      const e = (() => { try { checkApprover(maker, { ...senior, role }, "awaiting"); } catch (x) { return x; } return null; })();
      expect((e as ReviewError).status).toBe(403);
    }
  });
  it("lets a different senior examiner approve only while it is awaiting", () => {
    expect(() => checkApprover(maker, senior, "awaiting")).not.toThrow();
    expect(() => checkApprover(maker, senior, "approved")).toThrow(ReviewError);
    expect(() => checkApprover(maker, senior, "not_required")).toThrow(ReviewError);
  });
});

describe("returned decisions", () => {
  it("go back to the maker: the finding needs a new decision and nothing counts as final", () => {
    const returned = view({ approvalStatus: "returned", checker: senior.actor, checkerNote: "Quote the fee table." });
    const st = decisionState([returned])!;
    expect(needsMaker(st.latest)).toBe(true);
    expect(st.final).toBeNull();
    expect(needsMaker(view({ approvalStatus: "awaiting" }))).toBe(false);
  });
  it("an earlier approved decision stays final while a newer one awaits approval", () => {
    const st = decisionState([view({ id: 2, approvalStatus: "awaiting", decision: "modify", finalStatus: "warning" }), view({ id: 1, approvalStatus: "approved" })])!;
    expect(st.latest.id).toBe(2);
    expect(st.final?.id).toBe(1);
  });
});

describe("unapproved decisions are excluded", () => {
  const scoreInput = { status: "breach", rejected: false, decided: false, verdict: "not_satisfied", verification: "verified", proposedBy: "Rule agent", scoredUnder: null };
  it("an unapproved breach is not scored", () => {
    expect(outcomeFor({ ...scoreInput, pending: true }).outcome).toBe("Not assessed");
    expect(outcomeFor({ ...scoreInput, decided: true }).outcome).toBe("Not satisfied");
  });
  it("an unapproved breach never reaches a notice", () => {
    const items = [
      { id: "awaiting", decision: decisionState([view({ approvalStatus: "awaiting" })]) },
      { id: "returned", decision: decisionState([view({ approvalStatus: "returned" })]) },
      { id: "approved", decision: decisionState([view({ approvalStatus: "approved" })]) },
      { id: "undecided", decision: null },
    ];
    expect(noticeEligible(items).map((i) => i.id)).toEqual(["approved"]);
  });
});
