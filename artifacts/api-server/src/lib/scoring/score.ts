/**
 * Turns rule outcomes into ratings with the configured rubric. Pure functions; no database,
 * no model. Ratings run 1 (Strong) to 4 (Weak): a higher number means a higher risk.
 */
import type { ScoringConfig } from "./config";

export type ScoreClass =
  | "Satisfied"
  | "Partially"
  | "Not satisfied"
  | "Not applicable"
  | "Scored under"
  | "Not assessed"
  | "Not assessed: document missing";

export const ASSESSED: ScoreClass[] = ["Satisfied", "Partially", "Not satisfied"];

export interface RuleOutcome {
  ruleId: number;
  code: string;
  title: string;
  theme: string | null;
  severity: "low" | "medium" | "high";
  outcome: ScoreClass;
  /** Why the rule got this class, in plain words. */
  basis: string;
  contradiction: boolean;
  findingId: number | null;
}

export interface ScoredRule extends RuleOutcome {
  rating: number | null;
}

export interface ComplaintFigure {
  count: number;
  peerMedian: number | null;
  corroborated: boolean;
}

export interface ThemeScore {
  theme: string;
  mean: number | null;
  rating: number | null;
  label: string | null;
  percentage: number | null;
  capped: boolean;
  nearCutoff: boolean;
  assessed: number;
  notApplicable: number;
  notAssessed: number;
  documentMissing: number;
  scoredUnder: number;
  rulesAt4: number;
  complaints: ComplaintFigure | null;
}

export interface Scorecard {
  rating: number | null;
  label: string | null;
  mean: number | null;
  percentage: number | null;
  nearCutoff: boolean;
  capReasons: string[];
  coverage: { assessed: number; notAssessed: number; documentMissing: number; ratio: number | null };
  provisional: boolean;
  provisionalLabel: string | null;
  missingRoles: string[];
  themes: ThemeScore[];
  rules: ScoredRule[];
  contradictions: number;
  configVersion: string;
}

const SEV = { low: "Low", medium: "Medium", high: "High" } as const;

export function ruleRating(cfg: ScoringConfig, outcome: ScoreClass, severity: RuleOutcome["severity"]): number | null {
  if (outcome !== "Satisfied" && outcome !== "Partially" && outcome !== "Not satisfied") return null;
  return cfg.rating_matrix[outcome][SEV[severity]];
}

/** Maps a mean to a rating band. A mean exactly on a cutoff goes to the weaker (higher) rating unless configured otherwise. */
export function band(cfg: ScoringConfig, mean: number): number {
  const weaker = cfg.on_cutoff_goes_to !== "stronger rating";
  return 1 + cfg.cutoffs.filter((c) => (weaker ? mean >= c : mean > c)).length;
}

export const isNearCutoff = (cfg: ScoringConfig, mean: number) => cfg.cutoffs.some((c) => Math.abs(mean - c) <= cfg.near_cutoff_margin + 1e-9);
export const percentage = (rating: number) => 125 - 25 * rating;
const round2 = (n: number) => Math.round(n * 100) / 100;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function scorePack(
  cfg: ScoringConfig,
  outcomes: RuleOutcome[],
  opts: { missingRoles: string[]; complaints?: Map<string, { count: number; peerMedian: number | null }> },
): Scorecard {
  const trigger = cfg.caps.trigger_rating;
  const rules: ScoredRule[] = outcomes.map((o) => ({ ...o, rating: ruleRating(cfg, o.outcome, o.severity) }));
  const known = new Set(cfg.themes);
  const themeNames = [...cfg.themes, ...[...new Set(rules.map((r) => r.theme ?? "No theme"))].filter((t) => !known.has(t))];

  const themes: ThemeScore[] = themeNames.map((theme) => {
    const rs = rules.filter((r) => (r.theme ?? "No theme") === theme);
    const ratings = rs.map((r) => r.rating).filter((x): x is number => x !== null);
    const m = mean(ratings);
    let rating = m === null ? null : band(cfg, m);
    const rulesAt4 = ratings.filter((x) => x >= trigger).length;
    let capped = false;
    // Theme cap: any rule in the theme at the trigger rating keeps the theme at least at the rule floor.
    if (rating !== null && rulesAt4 && rating < cfg.caps.any_rule_at_trigger_floor) {
      rating = cfg.caps.any_rule_at_trigger_floor;
      capped = true;
    }
    const c = opts.complaints?.get(theme);
    return {
      theme,
      mean: m === null ? null : round2(m),
      rating,
      label: rating === null ? null : cfg.scale[String(rating) as "1"],
      percentage: rating === null ? null : percentage(rating),
      capped,
      nearCutoff: m !== null && isNearCutoff(cfg, m),
      assessed: ratings.length,
      notApplicable: rs.filter((r) => r.outcome === "Not applicable").length,
      notAssessed: rs.filter((r) => r.outcome === "Not assessed").length,
      documentMissing: rs.filter((r) => r.outcome === "Not assessed: document missing").length,
      scoredUnder: rs.filter((r) => r.outcome === "Scored under").length,
      rulesAt4,
      complaints: c
        ? { count: c.count, peerMedian: c.peerMedian, corroborated: rating !== null && rating >= 3 && c.peerMedian !== null && c.count > c.peerMedian }
        : null,
    };
  });

  const rated = themes.filter((t) => t.rating !== null);
  const pm = mean(rated.map((t) => t.rating!));
  let rating = pm === null ? null : band(cfg, pm);
  const capReasons: string[] = [];
  if (rating !== null) {
    const anyRule = rules.some((r) => r.rating !== null && r.rating >= trigger);
    const anyTheme = themes.some((t) => t.rating !== null && t.rating >= trigger);
    if (anyTheme && rating < cfg.caps.any_theme_at_trigger_floor) {
      rating = cfg.caps.any_theme_at_trigger_floor;
      capReasons.push(`A theme is rated ${trigger}, so the product is at least ${cfg.caps.any_theme_at_trigger_floor}.`);
    } else if (anyRule && rating < cfg.caps.any_rule_at_trigger_floor) {
      rating = cfg.caps.any_rule_at_trigger_floor;
      capReasons.push(`A rule is rated ${trigger}, so the product is at least ${cfg.caps.any_rule_at_trigger_floor}.`);
    }
  }
  const assessed = rules.filter((r) => ASSESSED.includes(r.outcome)).length;
  const notAssessed = rules.filter((r) => r.outcome === "Not assessed").length;
  const documentMissing = rules.filter((r) => r.outcome === "Not assessed: document missing").length;
  const denom = assessed + notAssessed + documentMissing;
  const provisional = opts.missingRoles.length > 0;
  return {
    rating,
    label: rating === null ? null : cfg.scale[String(rating) as "1"],
    mean: pm === null ? null : round2(pm),
    percentage: rating === null ? null : percentage(rating),
    nearCutoff: pm !== null && isNearCutoff(cfg, pm),
    capReasons,
    coverage: { assessed, notAssessed, documentMissing, ratio: denom ? round2(assessed / denom) : null },
    provisional,
    provisionalLabel: provisional ? cfg.completeness.label_if_incomplete : null,
    missingRoles: opts.missingRoles,
    themes,
    rules,
    contradictions: rules.filter((r) => r.contradiction).length,
    configVersion: cfg.version,
  };
}
