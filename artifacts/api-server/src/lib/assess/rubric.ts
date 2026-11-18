/**
 * Turns the Rule agent's per-document rubric verdicts into one verdict per rule. Code applies the
 * rule's combine method (worst / best / best of terms then worse of advert), flags contradictions,
 * verifies every quote, and maps the verdict onto a finding status. The model never sets the
 * final verdict on its own.
 */
import type { RuleJudgementOut } from "./agents";
import { decideJudgement, type AssessDoc, type AssessRule, type CodeCheck, type Decision } from "./decide";
import { DOC_TYPE_ROLE, ROLE_LABEL, type RuleMeta } from "../scoring/rule-meta";
import type { Role } from "../scoring/config";

export type Verdict = "satisfied" | "partially" | "not_satisfied";
const RANK: Record<Verdict, number> = { satisfied: 1, partially: 2, not_satisfied: 3 };
const byRank = (n: number) => (Object.keys(RANK) as Verdict[]).find((k) => RANK[k] === n)!;
const LABEL: Record<Verdict, string> = { satisfied: "Satisfied", partially: "Partially", not_satisfied: "Not satisfied" };

export interface Combined {
  verdict: Verdict | null;
  perRole: { role: Role; verdict: Verdict }[];
  contradiction: { satisfiedIn: Role; failedIn: Role } | null;
}

/**
 * One role can be spread across several files (general banking T&C plus the card agreement), so
 * within a role the best document counts. Across roles the rule's combine method decides.
 */
export function combineVerdicts(meta: Pick<RuleMeta, "combine" | "runsOnRoles">, perDoc: { role: Role; verdict: Verdict | "not_relevant" }[]): Combined {
  const roleBest = new Map<Role, number>();
  const roleWorst = new Map<Role, number>();
  for (const d of perDoc) {
    if (d.verdict === "not_relevant") continue;
    // Rewards terms can live in the T&C: a T&C document judged on a rewards rule speaks for REWARDS when no rewards file exists.
    const role = meta.runsOnRoles.includes(d.role) ? d.role : d.role === "TC" && meta.runsOnRoles.includes("REWARDS") ? "REWARDS" : null;
    if (!role) continue;
    roleBest.set(role, Math.min(roleBest.get(role) ?? 9, RANK[d.verdict]));
    roleWorst.set(role, Math.max(roleWorst.get(role) ?? 0, RANK[d.verdict]));
  }
  const perRole = [...roleBest.entries()].map(([role, r]) => ({ role, verdict: byRank(r) }));
  if (!perRole.length) return { verdict: null, perRole, contradiction: null };
  const ranks = perRole.map((p) => RANK[p.verdict]);
  let rank: number;
  if (meta.combine === "worst") rank = Math.max(...ranks);
  else if (meta.combine === "best") rank = Math.min(...ranks);
  else {
    const terms = perRole.filter((p) => p.role !== "ADVERT").map((p) => RANK[p.verdict]);
    const advert = perRole.find((p) => p.role === "ADVERT");
    rank = terms.length ? Math.min(...terms) : 3;
    if (advert) rank = Math.max(rank, RANK[advert.verdict]);
  }
  let contradiction: Combined["contradiction"] = null;
  if (meta.combine !== "worst" && rank === 1) {
    // Satisfied in one terms document while another terms document has a clause that fails it.
    const ok = perRole.find((p) => p.verdict === "satisfied" && p.role !== "ADVERT");
    const failed = [...roleWorst.entries()].find(([role, r]) => role !== "ADVERT" && r === 3);
    if (ok && failed) contradiction = { satisfiedIn: ok.role, failedIn: failed[0] };
  }
  return { verdict: byRank(rank), perRole, contradiction };
}

const STATUS: Record<Verdict, "compliant" | "warning" | "breach"> = { satisfied: "compliant", partially: "warning", not_satisfied: "breach" };

export interface RubricDecision extends Decision {
  verdict: "satisfied" | "partially" | "not_satisfied" | "not_applicable" | null;
}

export function decideRubric(rule: AssessRule, meta: RuleMeta, j: RuleJudgementOut | undefined, docs: AssessDoc[]): RubricDecision {
  if (!j) return { ...decideJudgement(rule, undefined, docs), verdict: null };
  const byId = new Map(docs.map((d) => [d.id, d]));
  const quotes = j.documents.flatMap((d) => d.quotes.map((q) => ({ documentId: d.documentId, ...q })));
  const checks: CodeCheck[] = [];

  if (!j.applicable || j.verdict === "not_applicable") {
    const d = decideJudgement(rule, { ruleCode: j.ruleCode, status: "not_applicable", rationale: j.applicabilityNote || j.rationale, quotes }, docs);
    return { ...d, verdict: "not_applicable" };
  }
  if (j.verdict === "cannot_determine") {
    const d = decideJudgement(rule, { ruleCode: j.ruleCode, status: "needs_review", rationale: j.rationale, quotes }, docs);
    d.checks.push({ label: "Rubric verdict", result: "info", detail: `The agent could not determine a verdict (confidence ${j.confidence}).` });
    return { ...d, verdict: null };
  }

  const perDoc = j.documents
    .filter((d) => byId.has(d.documentId))
    .map((d) => ({ role: DOC_TYPE_ROLE[byId.get(d.documentId)!.docType], verdict: d.verdict, name: byId.get(d.documentId)!.name, note: d.note }));
  const combined = combineVerdicts(meta, perDoc);
  const verdict: Verdict = combined.verdict ?? (j.verdict as Verdict);
  if (perDoc.length) {
    checks.push({
      label: `Per document (combine: ${meta.combine.replace(/_/g, " ")})`,
      result: "info",
      detail: perDoc.map((d) => `${d.name} [${ROLE_LABEL[d.role]}]: ${d.verdict === "not_relevant" ? "not relevant" : LABEL[d.verdict]}${d.note ? ` (${d.note})` : ""}`).join("; "),
    });
  }
  if (combined.verdict && combined.verdict !== j.verdict) {
    checks.push({ label: "Combine recomputed by code", result: "info", detail: `The agent's overall verdict was ${j.verdict.replace("_", " ")}; combining its per-document verdicts with "${meta.combine.replace(/_/g, " ")}" gives ${LABEL[combined.verdict]}.` });
  }
  if (combined.contradiction) {
    checks.push({
      label: "Contradiction",
      result: "fail",
      detail: `Satisfied in the ${ROLE_LABEL[combined.contradiction.satisfiedIn]}, but a clause in the ${ROLE_LABEL[combined.contradiction.failedIn]} fails the rule. Shown for examiner review; it does not change the score.`,
    });
  }
  checks.push({ label: "Agent confidence", result: "info", detail: j.confidence });

  const d = decideJudgement(rule, { ruleCode: j.ruleCode, status: STATUS[verdict], rationale: j.rationale, quotes }, docs);
  const verified = d.evidence.filter((e) => e.verified !== "not_found").length;
  // Partially needs at least one verified quote; otherwise it is an unsupported proposal like any other.
  const finalVerdict: RubricDecision["verdict"] =
    d.status === "compliant" ? "satisfied" : d.status === "breach" ? "not_satisfied" : d.status === "warning" && verdict === "partially" && verified > 0 ? "partially" : null;
  if (d.status === "warning" && verdict === "partially" && verified > 0) d.rationale = j.rationale;
  return { ...d, checks: [...d.checks, ...checks], verdict: finalVerdict };
}
