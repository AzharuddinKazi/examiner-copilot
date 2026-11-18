/**
 * Reads the rubric fields of a rule. Rulebooks keep extra spreadsheet columns as labelled
 * details, so the rubric is found by column name (case, spaces and punctuation ignored).
 */
import type { DocType } from "../suggest";
import type { Role } from "./config";

export type Combine = "worst" | "best" | "best_terms_then_worse_of_advert";

export interface RuleMeta {
  theme: string | null;
  relevance: string | null;
  islamicOnly: boolean;
  applicability: string | null;
  runsOnRoles: Role[];
  comparesWithRoles: Role[];
  evaluationLevel: string | null;
  combine: Combine;
  scoredUnder: string | null;
  dataNeeded: string | null;
  evidenceToLookFor: string | null;
  satisfied: string | null;
  partially: string | null;
  notSatisfied: string | null;
  compliantExample: string | null;
  nonCompliantExample: string | null;
  sourceRef: string | null;
}

export const DOC_TYPE_ROLE: Record<DocType, Role> = { tnc: "TC", rewards: "REWARDS", kfs: "KFS", fees: "SOFC", advert: "ADVERT" };
export const ROLE_DOC_TYPE: Record<Role, DocType> = { TC: "tnc", REWARDS: "rewards", KFS: "kfs", SOFC: "fees", ADVERT: "advert" };
export const ROLE_LABEL: Record<Role, string> = { TC: "T&C", REWARDS: "Rewards terms", KFS: "KFS", SOFC: "Schedule of charges", ADVERT: "Advert" };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

const ALIASES: Record<string, string[]> = {
  relevance: ["relevance"],
  applicability: ["applicabilitycondition", "applicability", "appliesif"],
  compares: ["compareswithroles", "compareswith", "compareto"],
  level: ["evaluationlevel", "level"],
  combine: ["combine", "combinerule"],
  scoredUnder: ["scoredunder"],
  dataNeeded: ["dataneeded"],
  evidence: ["evidencetolookfor", "evidence"],
  satisfied: ["satisfied", "satisfiedif"],
  partially: ["partiallysatisfied", "partially"],
  notSatisfied: ["notsatisfied", "notsatisfiedif"],
  compliantExample: ["compliantexample"],
  nonCompliantExample: ["noncompliantexample"],
  sourceRef: ["sourceref", "reference"],
};

export function parseRoles(raw: string | null | undefined): Role[] {
  if (!raw) return [];
  const out: Role[] = [];
  for (const part of raw.split(/[;,|/]+/)) {
    const p = norm(part);
    const r: Role | null = p === "tc" || p.startsWith("terms") ? "TC" : p.startsWith("reward") ? "REWARDS" : p === "kfs" || p.startsWith("keyfact") ? "KFS"
      : p === "sofc" || p.startsWith("schedule") || p.startsWith("fee") ? "SOFC" : p.startsWith("advert") || p === "ad" ? "ADVERT" : null;
    if (r && !out.includes(r)) out.push(r);
  }
  return out;
}

export function ruleMeta(rule: { category: string | null; appliesToDocTypes: DocType[]; details?: { label: string; value: string }[] | null }): RuleMeta {
  const map = new Map((rule.details ?? []).map((d) => [norm(d.label), d.value.trim()]));
  const get = (k: keyof typeof ALIASES) => {
    for (const a of ALIASES[k]!) {
      const v = map.get(a);
      if (v && !/^(null|none|n\/a|-)$/i.test(v)) return v;
    }
    return null;
  };
  const relevance = get("relevance");
  const combineRaw = (get("combine") ?? "").toLowerCase().replace(/\s+/g, "_");
  const combine: Combine = combineRaw === "best" ? "best" : combineRaw.startsWith("best_terms") ? "best_terms_then_worse_of_advert" : "worst";
  return {
    theme: rule.category?.trim() || null,
    relevance,
    islamicOnly: !!relevance && /islamic/i.test(relevance),
    applicability: get("applicability"),
    runsOnRoles: rule.appliesToDocTypes.map((t) => DOC_TYPE_ROLE[t]),
    comparesWithRoles: parseRoles(get("compares")),
    evaluationLevel: get("level"),
    combine,
    scoredUnder: get("scoredUnder"),
    dataNeeded: get("dataNeeded"),
    evidenceToLookFor: get("evidence"),
    satisfied: get("satisfied"),
    partially: get("partially"),
    notSatisfied: get("notSatisfied"),
    compliantExample: get("compliantExample"),
    nonCompliantExample: get("nonCompliantExample"),
    sourceRef: get("sourceRef"),
  };
}

/** Rubric columns already shown to the agent in structured form; the rest are passed as plain details. */
export const STRUCTURED_DETAIL_KEYS = new Set(Object.values(ALIASES).flat());
export const isStructuredDetail = (label: string) => STRUCTURED_DETAIL_KEYS.has(norm(label)) || ["source", "status", "runsonroles"].includes(norm(label));
