/**
 * Builds the scorecard of one assessment: each rule's outcome (from the examiner's latest
 * decision, else the proposal), rated with the configured rubric and rolled up to themes and
 * the product. Complaints are shown next to theme ratings and never change a score.
 */
import {
  db,
  assessmentsTable,
  assessmentDocumentsTable,
  complaintsTable,
  complaintThemesTable,
  documentsTable,
  documentPagesTable,
  findingsTable,
  productsTable,
  rulesTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import type { Dataset } from "../dataset";
import { latestDecisions } from "../review";
import { getDocumentRoles, getScoringConfig } from "./settings";
import { rewardSignals, type Role } from "./config";
import { DOC_TYPE_ROLE, ROLE_LABEL, parseRoles, ruleMeta } from "./rule-meta";
import { median, scorePack, type RuleOutcome, type ScoreClass } from "./score";

const norm = (s: string) => s.trim().toLowerCase();

/** Complaint count per theme for one bank, and the median over every bank that has complaint data. */
export async function complaintFigures(dataset: Dataset, bankId: number | null) {
  const [map, rows] = await Promise.all([
    db.select().from(complaintThemesTable).where(eq(complaintThemesTable.dataset, dataset)),
    db.select().from(complaintsTable).where(eq(complaintsTable.dataset, dataset)),
  ]);
  if (!rows.length || bankId === null) return null;
  const themeOf = new Map(map.map((m) => [norm(m.category), m.theme]));
  const perBank = new Map<number, Map<string, number>>();
  for (const r of rows) {
    const theme = themeOf.get(norm(r.category));
    if (!theme) continue;
    const m = perBank.get(r.bankId) ?? new Map<string, number>();
    m.set(theme, (m.get(theme) ?? 0) + r.count);
    perBank.set(r.bankId, m);
  }
  const banksWithData = [...new Set(rows.map((r) => r.bankId))];
  const themes = new Set([...perBank.values()].flatMap((m) => [...m.keys()]));
  const out = new Map<string, { count: number; peerMedian: number | null }>();
  for (const t of themes) {
    const counts = banksWithData.map((b) => perBank.get(b)?.get(t) ?? 0);
    out.set(t, { count: perBank.get(bankId)?.get(t) ?? 0, peerMedian: banksWithData.length > 1 ? median(counts) : null });
  }
  return out;
}

export function outcomeFor(input: {
  status: string | null;
  rejected: boolean;
  decided: boolean;
  verdict: string | null;
  verification: string;
  proposedBy: string;
  scoredUnder: string | null;
}): { outcome: ScoreClass; basis: string } {
  if (input.scoredUnder) return { outcome: "Scored under", basis: `Scored under ${input.scoredUnder}.` };
  if (input.rejected) return { outcome: "Not assessed", basis: "The examiner rejected the proposal; no finding stands." };
  const who = input.decided ? "Examiner decision" : "Proposal";
  switch (input.status) {
    case "compliant":
      return { outcome: "Satisfied", basis: `${who}: Compliant.` };
    case "breach":
      return { outcome: "Not satisfied", basis: `${who}: Breach.` };
    case "not_applicable":
      return { outcome: "Not applicable", basis: `${who}: Not applicable.` };
    case "warning":
      if (input.decided || (input.verdict === "partially" && input.verification === "verified")) return { outcome: "Partially", basis: `${who}: partially satisfied.` };
      return { outcome: "Not assessed", basis: "The proposal is not supported by verified quotes yet; an examiner needs to decide." };
    default:
      if (/applicability/i.test(input.proposedBy)) return { outcome: "Not assessed: document missing", basis: "A document the rule needs was not included." };
      return { outcome: "Not assessed", basis: "Needs review: no outcome yet." };
  }
}

export async function buildScorecard(dataset: Dataset, assessmentId: number) {
  const [a] = await db.select().from(assessmentsTable).where(and(eq(assessmentsTable.dataset, dataset), eq(assessmentsTable.id, assessmentId)));
  if (!a) return null;
  const [cfg, rolesCfg] = await Promise.all([getScoringConfig(dataset), getDocumentRoles(dataset)]);
  const findings = await db.select().from(findingsTable).where(eq(findingsTable.assessmentId, a.id));
  const ruleIds = findings.map((f) => f.ruleId).filter((x): x is number => x !== null);
  const [rules, decisions, product, docLinks] = await Promise.all([
    ruleIds.length ? db.select().from(rulesTable).where(inArray(rulesTable.id, ruleIds)) : Promise.resolve([]),
    latestDecisions(findings.map((f) => f.id)),
    a.productId ? db.select().from(productsTable).where(eq(productsTable.id, a.productId)).then((r) => r[0] ?? null) : Promise.resolve(null),
    db.select().from(assessmentDocumentsTable).where(eq(assessmentDocumentsTable.assessmentId, a.id)),
  ]);
  const ruleById = new Map(rules.map((r) => [r.id, r]));

  const outcomes: RuleOutcome[] = [];
  for (const f of findings) {
    const r = f.ruleId ? ruleById.get(f.ruleId) : undefined;
    if (!r) continue;
    const meta = ruleMeta(r);
    const d = decisions.get(f.id);
    const status = d ? d.finalStatus : f.proposedStatus;
    const { outcome, basis } = outcomeFor({
      status,
      rejected: !!d && d.decision === "reject",
      decided: !!d,
      verdict: f.verdict,
      verification: f.verification,
      proposedBy: f.proposedBy,
      scoredUnder: meta.scoredUnder,
    });
    const contradiction = (f.checks as { label: string; result: string }[]).some((c) => /^contradiction/i.test(c.label) && c.result === "fail");
    outcomes.push({ ruleId: r.id, code: r.code, title: r.title, theme: meta.theme, severity: r.severity, outcome, basis, contradiction, findingId: f.id });
  }

  // Completeness: which required roles are in the pack.
  const docIds = docLinks.map((l) => l.documentId);
  const docs = docIds.length ? await db.select().from(documentsTable).where(inArray(documentsTable.id, docIds)) : [];
  const present = new Set<Role>(docs.filter((d) => d.docType).map((d) => DOC_TYPE_ROLE[d.docType!]));
  const absent = new Set(parseRoles((product?.absentRoles ?? []).join(";")));
  const missing: string[] = [];
  for (const req of cfg.completeness.required_roles) {
    const role = parseRoles(req)[0];
    if (role && !present.has(role) && !absent.has(role)) missing.push(req);
  }
  for (const [req, why] of Object.entries(cfg.completeness.required_if_detected)) {
    const role = parseRoles(req)[0];
    if (!role || present.has(role) || absent.has(role)) continue;
    if (role === "REWARDS" && docIds.length) {
      // Rewards terms can sit inside the card T&C. Required only if the pack talks about cashback, points or miles.
      const pages = await db.select({ text: documentPagesTable.textNormalized, documentId: documentPagesTable.documentId }).from(documentPagesTable).where(inArray(documentPagesTable.documentId, docIds));
      const all = pages.map((p) => p.text.toLowerCase()).join("\n");
      const hits = rewardSignals(rolesCfg).filter((s) => all.includes(s.toLowerCase()));
      const advertised = /cash ?back|reward points|\bmiles\b/.test(all);
      const embedded = hits.length >= 4 && present.has("TC");
      if (advertised && !embedded) missing.push(`${ROLE_LABEL[role]} (${why})`);
    }
  }

  const complaints = await complaintFigures(dataset, a.bankId);
  return { assessmentId: a.id, ...scorePack(cfg, outcomes, { missingRoles: missing, complaints: complaints ?? undefined }), hasComplaintData: !!complaints };
}
