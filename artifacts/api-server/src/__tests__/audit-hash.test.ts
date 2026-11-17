import { describe, it, expect } from "vitest";
import { canonicalJson, computeAuditHash } from "../lib/audit";

const base = {
  dataset: "demo",
  ts: new Date("2026-11-17T08:00:00.000Z"),
  role: "examiner",
  action: "role.selected",
  entityType: "session",
  entityId: null,
  summary: "Role self-selected as Examiner. Unverified.",
  before: null,
  after: { role: "examiner" },
};

describe("canonicalJson", () => {
  it("sorts keys recursively so equal objects serialise identically", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 1, e: 0 }] } })).toBe(
      canonicalJson({ a: { c: [3, { e: 0, f: 1 }], d: 2 }, b: 1 }),
    );
  });
});

describe("computeAuditHash", () => {
  it("is deterministic", () => {
    expect(computeAuditHash(null, base)).toBe(computeAuditHash(null, { ...base }));
  });

  it("changes when any field changes", () => {
    const h = computeAuditHash(null, base);
    expect(computeAuditHash(null, { ...base, summary: base.summary + " " })).not.toBe(h);
    expect(computeAuditHash(null, { ...base, role: "viewer" })).not.toBe(h);
    expect(computeAuditHash(null, { ...base, after: { role: "viewer" } })).not.toBe(h);
    expect(computeAuditHash(null, { ...base, ts: new Date("2026-11-17T08:00:00.001Z") })).not.toBe(h);
  });

  it("links to the previous hash so reordering or removal breaks the chain", () => {
    const first = computeAuditHash(null, base);
    expect(computeAuditHash(first, base)).not.toBe(computeAuditHash(null, base));
  });
});
