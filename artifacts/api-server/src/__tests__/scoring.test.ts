import { describe, expect, it } from "vitest";
import { SETTINGS, scoringConfigSchema, type ScoringConfig } from "../lib/scoring/config";
import { band, isNearCutoff, median, percentage, ruleRating, scorePack, type RuleOutcome } from "../lib/scoring/score";
import { combineVerdicts } from "../lib/assess/rubric";
import { parseRoles, ruleMeta } from "../lib/scoring/rule-meta";

const cfg = scoringConfigSchema.parse(SETTINGS.scoring.defaults) as ScoringConfig;

const rule = (o: Partial<RuleOutcome>): RuleOutcome => ({
  ruleId: 1,
  code: "R-1",
  title: "t",
  theme: cfg.themes[0]!,
  severity: "medium",
  outcome: "Satisfied",
  basis: "",
  contradiction: false,
  findingId: null,
  ...o,
});

describe("scoring rubric", () => {
  it("loads the bundled rubric", () => {
    expect(cfg.cutoffs).toEqual([1.5, 2.5, 3.5]);
    expect(cfg.themes.length).toBeGreaterThan(5);
  });

  it("bands means, with a mean on a cutoff going to the weaker rating", () => {
    expect(band(cfg, 1.0)).toBe(1);
    expect(band(cfg, 1.5)).toBe(2);
    expect(band(cfg, 2.49)).toBe(2);
    expect(band(cfg, 3.5)).toBe(4);
    expect(isNearCutoff(cfg, 2.4)).toBe(true);
    expect(isNearCutoff(cfg, 2.0)).toBe(false);
  });

  it("rates rules from the matrix and ignores unassessed ones", () => {
    expect(ruleRating(cfg, "Satisfied", "high")).toBe(cfg.rating_matrix.Satisfied.High);
    expect(ruleRating(cfg, "Not satisfied", "high")).toBe(cfg.rating_matrix["Not satisfied"].High);
    expect(ruleRating(cfg, "Not applicable", "high")).toBeNull();
    expect(ruleRating(cfg, "Not assessed: document missing", "low")).toBeNull();
    expect(percentage(1)).toBe(100);
    expect(percentage(4)).toBe(25);
  });

  it("caps a theme and the product when a rule hits the trigger rating", () => {
    const outs = [
      ...Array.from({ length: 6 }, (_, i) => rule({ ruleId: i, outcome: "Satisfied", severity: "low" })),
      rule({ ruleId: 99, outcome: "Not satisfied", severity: "high" }),
    ];
    const card = scorePack(cfg, outs, { missingRoles: [] });
    const t = card.themes.find((x) => x.theme === cfg.themes[0])!;
    expect(cfg.rating_matrix["Not satisfied"].High).toBe(cfg.caps.trigger_rating);
    expect(t.rating).toBeGreaterThanOrEqual(cfg.caps.any_rule_at_trigger_floor);
    expect(t.rulesAt4).toBe(1);
    expect(card.rating).toBeGreaterThanOrEqual(cfg.caps.any_rule_at_trigger_floor);
  });

  it("marks the product provisional when a required document is missing and counts coverage", () => {
    const card = scorePack(cfg, [rule({}), rule({ ruleId: 2, outcome: "Not assessed: document missing" }), rule({ ruleId: 3, outcome: "Not applicable" })], { missingRoles: ["KFS"] });
    expect(card.provisional).toBe(true);
    expect(card.provisionalLabel).toBeTruthy();
    expect(card.coverage).toEqual({ assessed: 1, notAssessed: 0, documentMissing: 1, ratio: 0.5 });
  });

  it("shows complaints as corroboration only, never changing the rating", () => {
    const outs = [rule({ outcome: "Not satisfied", severity: "high" })];
    const without = scorePack(cfg, outs, { missingRoles: [] });
    const withC = scorePack(cfg, outs, { missingRoles: [], complaints: new Map([[cfg.themes[0]!, { count: 40, peerMedian: 10 }]]) });
    expect(withC.rating).toBe(without.rating);
    expect(withC.themes[0]!.complaints).toEqual({ count: 40, peerMedian: 10, corroborated: true });
    expect(median([1, 5, 3, 9])).toBe(4);
  });
});

describe("combining per-document verdicts", () => {
  it("worst: the weakest role decides", () => {
    const r = combineVerdicts({ combine: "worst", runsOnRoles: ["KFS", "TC"] }, [
      { role: "KFS", verdict: "satisfied" },
      { role: "TC", verdict: "partially" },
    ]);
    expect(r.verdict).toBe("partially");
  });

  it("best: met once across terms is enough, and a failing clause elsewhere is a contradiction", () => {
    const r = combineVerdicts({ combine: "best", runsOnRoles: ["KFS", "TC"] }, [
      { role: "KFS", verdict: "satisfied" },
      { role: "TC", verdict: "not_satisfied" },
    ]);
    expect(r.verdict).toBe("satisfied");
    expect(r.contradiction).toEqual({ satisfiedIn: "KFS", failedIn: "TC" });
  });

  it("within one role the best document counts", () => {
    const r = combineVerdicts({ combine: "worst", runsOnRoles: ["TC"] }, [
      { role: "TC", verdict: "not_satisfied" },
      { role: "TC", verdict: "satisfied" },
    ]);
    expect(r.verdict).toBe("satisfied");
  });

  it("best terms then worse of advert", () => {
    const r = combineVerdicts({ combine: "best_terms_then_worse_of_advert", runsOnRoles: ["KFS", "TC", "ADVERT"] }, [
      { role: "KFS", verdict: "satisfied" },
      { role: "TC", verdict: "partially" },
      { role: "ADVERT", verdict: "not_satisfied" },
    ]);
    expect(r.verdict).toBe("not_satisfied");
  });

  it("a T&C speaks for REWARDS when the rewards terms sit inside it", () => {
    const r = combineVerdicts({ combine: "worst", runsOnRoles: ["REWARDS"] }, [{ role: "TC", verdict: "partially" }]);
    expect(r.verdict).toBe("partially");
  });
});

describe("rule rubric fields", () => {
  it("reads rubric columns by label and parses roles", () => {
    const m = ruleMeta({
      category: "Fees and charges",
      appliesToDocTypes: ["kfs", "tnc"],
      details: [
        { label: "Combine", value: "best" },
        { label: "Scored under", value: "null" },
        { label: "Partially satisfied", value: "Fee shown without the VAT note" },
        { label: "Relevance", value: "Islamic cards only" },
        { label: "Compares with roles", value: "SOFC; Advert" },
      ],
    });
    expect(m.combine).toBe("best");
    expect(m.scoredUnder).toBeNull();
    expect(m.partially).toMatch(/VAT/);
    expect(m.islamicOnly).toBe(true);
    expect(m.comparesWithRoles).toEqual(["SOFC", "ADVERT"]);
    expect(parseRoles("T&C, Key Facts Statement")).toEqual(["TC", "KFS"]);
  });
});

describe("case-level complaint files", () => {
  it("counts credit-card complaints per bank, category and quarter without keeping personal details", async () => {
    const { aggregateCaseRows, isCaseLevel } = await import("../lib/scoring/complaints-import");
    const rows = [
      { lfiname: "FAB", consumername: "A", product: "Credit Card", category: "Fees & Charges", complaintcreationdate: "2026-01-04" },
      { lfiname: "FAB", consumername: "B", product: "Credit Card", category: "Fees & Charges", complaintcreationdate: "2026-03-30" },
      { lfiname: "FAB", consumername: "C", product: "Personal Loan", category: "Fees & Charges", complaintcreationdate: "2026-02-01" },
      { lfiname: "ADCB", consumername: "D", product: "Credit Card", category: "Documentation", complaintcreationdate: "2026-05-01" },
    ];
    expect(isCaseLevel(rows[0]!)).toBe(true);
    const r = aggregateCaseRows(rows);
    expect(r.credit).toBe(3);
    expect(r.items).toEqual([
      { bank: "FAB", product: null, category: "Fees & Charges", period: "2026-Q1", count: 2 },
      { bank: "ADCB", product: null, category: "Documentation", period: "2026-Q2", count: 1 },
    ]);
    expect(JSON.stringify(r.items)).not.toMatch(/consumer|"A"/);
  });
});
