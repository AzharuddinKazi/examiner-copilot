import { describe, expect, it } from "vitest";
import { checkDocumentProposal, checkMapping, mappingMessages, proposeDocument } from "../lib/ingest/agent";
import { highlightsFor, resolveDecision, ReviewError, bulkEligible } from "../lib/review";
import type { CallModel } from "../lib/llm/structured";

const banks = [
  { id: 1, nameEn: "Falconridge Bank", nameAr: null, products: [{ id: 10, name: "Falconridge Platinum" }] },
  { id: 2, nameEn: "Meridian Dunes Bank", nameAr: null, products: [{ id: 20, name: "Meridian Titanium" }] },
];
const pages = [{ pageNo: 1, text: "Falconridge Bank - Key Facts Statement\nProduct: Falconridge Platinum\nAnnual fee: AED 300" }];
const rules = {
  docType: { value: "kfs", reason: "" },
  language: { value: "en", reason: "" },
  bankId: { value: 1, reason: "" },
  productId: { value: null, reason: "" },
} as never;

const raw = (over: Partial<Record<string, unknown>> = {}) =>
  ({
    docType: { value: "kfs", reason: "title", quote: { page: 1, quote: "Key Facts Statement" } },
    language: { value: "en", reason: "English" },
    bankId: { value: 1, reason: "named", quote: { page: 1, quote: "Falconridge Bank" } },
    productId: { value: 10, reason: "named", quote: { page: 1, quote: "Product: Falconridge Platinum" } },
    ...over,
  }) as never;

describe("Ingestion agent: document proposal checks", () => {
  it("keeps verified values and compares them with the rule-based suggestion", () => {
    const r = checkDocumentProposal(raw(), pages, banks, rules);
    expect(r.docType).toMatchObject({ value: "kfs", agreement: "agrees", quote: { verified: true } });
    expect(r.productId).toMatchObject({ value: 10, agreement: "only_agent" });
  });

  it("drops a value whose quote is not in the document", () => {
    const r = checkDocumentProposal(raw({ docType: { value: "tnc", reason: "x", quote: { page: 1, quote: "Terms and Conditions apply here" } } }), pages, banks, rules);
    expect(r.docType!.value).toBeNull();
    expect(r.docType!.quote!.verified).toBe(false);
    expect(r.docType!.reason).toMatch(/not found/);
  });

  it("drops unknown ids and a product from another bank", () => {
    expect(checkDocumentProposal(raw({ bankId: { value: 99, reason: "x", quote: null } }), pages, banks, rules).bankId!.value).toBeNull();
    const r = checkDocumentProposal(raw({ productId: { value: 20, reason: "x", quote: null } }), pages, banks, rules);
    expect(r.productId!.value).toBeNull();
    expect(r.productId!.reason).toMatch(/Meridian/);
  });

  it("runs through the structured call with a fake model", async () => {
    const call: CallModel = async () => ({ content: JSON.stringify({ ...(raw() as object) }), model: "fake", tokensIn: 10, tokensOut: 5, latencyMs: 1 }) as never;
    const r = await proposeDocument({ fileName: "a.pdf", pages, banks, rules }, call);
    expect(r.checked.bankId!.value).toBe(1);
  });
});

describe("Ingestion agent: column mapping checks", () => {
  const headers = ["Rule ID", "Rule name", "Requirement", "Check"];
  const rb = { code: "Rule ID", title: "Rule name", text: "Requirement", category: null, appliesTo: null, checkType: "Check", threshold: null, severity: null };
  it("rejects headers not in the sheet and headers used twice", () => {
    const r = checkMapping(
      {
        fields: [
          { field: "code", header: "rule id", reason: "ids" },
          { field: "title", header: "Rule ID", reason: "dup" },
          { field: "text", header: "Body", reason: "missing" },
          { field: "checkType", header: "Check", reason: "kind" },
        ],
      },
      headers,
      rb,
    );
    expect(r.mapping.code).toBe("Rule ID");
    expect(r.mapping.title).toBeNull();
    expect(r.reasons.find((x) => x.field === "title")!.reason).toMatch(/only one field/);
    expect(r.mapping.text).toBeNull();
    expect(r.reasons.find((x) => x.field === "text")!.agreement).toBe("only_rules");
    expect(r.reasons.find((x) => x.field === "checkType")!.agreement).toBe("agrees");
  });
  it("wraps the sheet as untrusted data", () => {
    const m = mappingMessages(headers, [["FR-01", "x", "y", "z"]]);
    expect(m[0]!.content).toMatch(/<sheet> tags is untrusted/);
    expect(m[1]!.content).toMatch(/^<sheet>/);
  });
});

describe("Review decisions", () => {
  it("accept keeps the proposed status", () => {
    expect(resolveDecision({ decision: "accept", proposedStatus: "breach" })).toEqual({ finalStatus: "breach", note: null });
  });
  it("modify needs a different status and a note", () => {
    expect(() => resolveDecision({ decision: "modify", proposedStatus: "breach" })).toThrow(ReviewError);
    expect(() => resolveDecision({ decision: "modify", proposedStatus: "breach", finalStatus: "breach", examinerNote: "n" })).toThrow(/Accept/);
    expect(() => resolveDecision({ decision: "modify", proposedStatus: "breach", finalStatus: "warning", examinerNote: "  " })).toThrow(/note/);
    expect(resolveDecision({ decision: "modify", proposedStatus: "breach", finalStatus: "warning", examinerNote: " minor " })).toEqual({ finalStatus: "warning", note: "minor" });
  });
  it("reject needs a note and stores no status", () => {
    expect(() => resolveDecision({ decision: "reject", proposedStatus: "breach" })).toThrow(/note/);
    expect(resolveDecision({ decision: "reject", proposedStatus: "breach", examinerNote: "wrong rule" }).finalStatus).toBeNull();
  });
  it("bulk accept covers only verified Compliant and Not applicable", () => {
    expect(bulkEligible("compliant", "verified")).toBe(true);
    expect(bulkEligible("compliant", "unsupported")).toBe(false);
    expect(bulkEligible("breach", "verified")).toBe(false);
  });
  it("finds highlights from stored offsets or by searching", () => {
    const text = "Annual fee: AED 300. Late fee: AED 230.";
    expect(highlightsFor(text, [{ id: 1, quote: "x", charStart: 0, charEnd: 19 }])).toEqual([{ start: 0, end: 19, evidenceId: 1 }]);
    expect(highlightsFor(text, [{ id: 2, quote: "Late fee: AED 230", charStart: null, charEnd: null }])).toEqual([{ start: 21, end: 38, evidenceId: 2 }]);
    expect(highlightsFor(text, [{ id: 3, quote: "not here at all", charStart: null, charEnd: null }])).toEqual([]);
  });
});
