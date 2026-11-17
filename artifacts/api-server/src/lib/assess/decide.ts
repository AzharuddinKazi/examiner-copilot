/**
 * Deterministic decisions. The model only supplies quotes, values and judgements; this code
 * verifies every quote against the stored page text, does all arithmetic and comparisons,
 * and downgrades anything it cannot verify. Nothing here calls a model.
 */
import type { CheckType, Severity, Threshold } from "../rulebook-import";
import type { DocType } from "../suggest";
import { quoteContainsNumber, readability, verifyQuote, type PageText, type QuoteVerification } from "./text";

export type FindingStatus = "compliant" | "breach" | "warning" | "needs_review" | "not_applicable";

export interface AssessDoc {
  id: number;
  name: string;
  docType: DocType;
  language: "en" | "ar";
  pages: PageText[];
  gapPages: number[];
}

export interface AssessRule {
  id: number;
  code: string;
  title: string;
  text: string;
  checkType: CheckType;
  threshold: Threshold | null;
  severity: Severity;
  appliesToDocTypes: DocType[];
}

export interface CitedQuote {
  documentId: number;
  page: number;
  quote: string;
}

export interface VerifiedQuote {
  documentId: number;
  pageNo: number;
  quote: string;
  verified: QuoteVerification;
  charStart: number | null;
  charEnd: number | null;
}

export interface CodeCheck {
  label: string;
  result: "pass" | "fail" | "info";
  detail: string;
}

export interface Decision {
  ruleId: number;
  status: FindingStatus;
  rationale: string;
  evidence: VerifiedQuote[];
  checks: CodeCheck[];
  proposedBy: string;
}

/** What the Evidence agent reported for one rule in one document. */
export interface RuleEvidence {
  documentId: number;
  ruleCode: string;
  found: boolean;
  value: number | null;
  unit: string | null;
  quotes: { page: number; quote: string }[];
  note: string;
}

export const FACT_FIELDS = [
  "apr",
  "monthly_rate",
  "annual_fee",
  "minimum_payment_percent",
  "minimum_payment_amount",
  "interest_free_days",
  "late_fee",
  "cash_advance_fee_percent",
  "cash_advance_fee_minimum",
  "foreign_transaction_fee",
] as const;
export type FactField = (typeof FACT_FIELDS)[number];

export const FACT_LABELS: Record<FactField, string> = {
  apr: "APR",
  monthly_rate: "Monthly interest rate",
  annual_fee: "Annual fee",
  minimum_payment_percent: "Minimum payment (%)",
  minimum_payment_amount: "Minimum payment (AED)",
  interest_free_days: "Interest-free days",
  late_fee: "Late payment fee",
  cash_advance_fee_percent: "Cash advance fee (%)",
  cash_advance_fee_minimum: "Cash advance fee minimum",
  foreign_transaction_fee: "Foreign transaction fee",
};

export interface Fact {
  documentId: number;
  field: FactField;
  value: number;
  page: number;
  quote: string;
}

export function verify(c: CitedQuote, docs: Map<number, AssessDoc>): VerifiedQuote | null {
  const doc = docs.get(c.documentId);
  if (!doc) return null;
  const v = verifyQuote(c.quote, c.page, doc.pages);
  return { documentId: c.documentId, pageNo: v.pageNo, quote: c.quote.trim(), verified: v.verified, charStart: v.charStart, charEnd: v.charEnd };
}

const isVerified = (q: VerifiedQuote) => q.verified !== "not_found";

function quoteCheck(qs: VerifiedQuote[], docs: Map<number, AssessDoc>): CodeCheck {
  const ok = qs.filter(isVerified).length;
  const moved = qs.filter((q) => q.verified === "normalized").length;
  if (qs.length === 0) return { label: "Quote check", result: "info", detail: "No quote was cited." };
  const bad = qs.filter((q) => !isVerified(q)).map((q) => `${docs.get(q.documentId)?.name ?? "document"}, p. ${q.pageNo}`);
  return {
    label: "Quote check",
    result: ok === qs.length ? "pass" : "fail",
    detail:
      ok === qs.length
        ? `All ${qs.length} quoted passage${qs.length === 1 ? " was" : "s were"} found in the document text${moved ? ` (${moved} after normalising spacing or page)` : ""}.`
        : `${qs.length - ok} of ${qs.length} quotes could not be found on the cited page (${bad.join("; ")}).`,
  };
}

/** Applicable documents for a rule; null when the rule's document types are not present. */
export function applicableDocs(rule: AssessRule, docs: AssessDoc[], language: "en" | "ar" | "any" = "en"): AssessDoc[] {
  return docs.filter((d) => rule.appliesToDocTypes.includes(d.docType) && (language === "any" || d.language === language));
}

export function missingDocTypes(rule: AssessRule, docs: AssessDoc[]): DocType[] {
  return rule.appliesToDocTypes.filter((t) => !docs.some((d) => d.docType === t && d.language === "en"));
}

function sameUnit(a: string | null, b: string | null): boolean {
  if (!a || !b) return true;
  const n = (u: string) => {
    const s = u.toLowerCase();
    if (/%|percent/.test(s)) return "%";
    if (/aed|dirham|درهم|د\.إ/.test(s)) return "AED";
    if (/day|يوم/.test(s)) return "days";
    return s;
  };
  return n(a) === n(b);
}

const fmt = (v: number, unit: string | null) => (unit === "%" ? `${v}%` : unit === "AED" ? `AED ${v}` : unit ? `${v} ${unit}` : String(v));

/** Evidence for numeric rules: a value counts only if a verified quote contains that number. */
function supportedValue(e: RuleEvidence, docs: Map<number, AssessDoc>) {
  const quotes = e.quotes.map((q) => verify({ documentId: e.documentId, ...q }, docs)).filter((q): q is VerifiedQuote => q !== null);
  const supporting = e.value === null ? [] : quotes.filter((q) => isVerified(q) && quoteContainsNumber(q.quote, e.value!));
  return { quotes, supporting };
}

// ---------------- max_value / min_value ----------------

export function decideThreshold(rule: AssessRule, evidence: RuleEvidence[], docs: Map<number, AssessDoc>): Decision {
  const t = rule.threshold;
  const base = { ruleId: rule.id, proposedBy: "Evidence agent + code arithmetic" };
  if (!t || t.value === null) {
    return { ...base, status: "needs_review", rationale: "The rule has no numeric threshold, so code cannot compare values.", evidence: [], checks: [] };
  }
  const isMax = rule.checkType === "max_value";
  const checks: CodeCheck[] = [];
  const allQuotes: VerifiedQuote[] = [];
  const results: { doc: AssessDoc; value: number; unit: string | null; pass: boolean; quote: VerifiedQuote }[] = [];
  let unsupported = 0;
  let unitMismatch = 0;
  for (const e of evidence) {
    const doc = docs.get(e.documentId);
    if (!doc) continue;
    const { quotes, supporting } = supportedValue(e, docs);
    allQuotes.push(...(supporting.length ? supporting : quotes));
    if (e.value === null) continue;
    if (!supporting.length) {
      unsupported++;
      checks.push({ label: `Value in ${doc.name}`, result: "fail", detail: `The agent reported ${fmt(e.value, e.unit)}, but no verified quote contains that number.` });
      continue;
    }
    if (!sameUnit(e.unit, t.unit)) {
      unitMismatch++;
      checks.push({ label: `Unit in ${doc.name}`, result: "fail", detail: `Reported unit "${e.unit}" does not match the rule's unit "${t.unit}".` });
      continue;
    }
    const pass = isMax ? e.value <= t.value : e.value >= t.value;
    results.push({ doc, value: e.value, unit: t.unit, pass, quote: supporting[0]! });
    checks.push({
      label: `Threshold arithmetic (${doc.name})`,
      result: pass ? "pass" : "fail",
      detail: `${fmt(e.value, t.unit)} ${pass ? (isMax ? "≤" : "≥") : isMax ? ">" : "<"} ${isMax ? "limit" : "minimum"} ${fmt(t.value, t.unit)}.`,
    });
  }
  checks.unshift(quoteCheck(allQuotes, docs));
  const failing = results.filter((r) => !r.pass);
  if (failing.length) {
    const f = failing[0]!;
    return {
      ...base,
      status: "breach",
      rationale: `${f.doc.name} states ${fmt(f.value, t.unit)}, which is ${isMax ? "above the maximum" : "below the minimum"} of ${fmt(t.value, t.unit)}.`,
      evidence: failing.map((r) => r.quote),
      checks,
    };
  }
  if (results.length && !unsupported && !unitMismatch) {
    return {
      ...base,
      status: "compliant",
      rationale: `Every stated value (${results.map((r) => fmt(r.value, t.unit)).join(", ")}) is within the ${isMax ? "maximum" : "minimum"} of ${fmt(t.value, t.unit)}.`,
      evidence: results.map((r) => r.quote),
      checks,
    };
  }
  if (unsupported) {
    return { ...base, status: "warning", rationale: "A value was reported but could not be traced to an exact quote in the document, so it is not relied on.", evidence: allQuotes, checks };
  }
  return {
    ...base,
    status: "needs_review",
    rationale: unitMismatch ? "The stated value uses a different unit from the rule, so code cannot compare it." : "No value for this rule was found in the documents.",
    evidence: allQuotes,
    checks,
  };
}

// ---------------- cross_document ----------------

export interface Conflict {
  key: string;
  ruleCode: string;
  label: string;
  a: { documentId: number; value: number; quote: VerifiedQuote };
  b: { documentId: number; value: number; quote: VerifiedQuote };
}

export function decideCrossDocument(rule: AssessRule, evidence: RuleEvidence[], docs: Map<number, AssessDoc>): { decision: Decision; conflict: Conflict | null } {
  const base = { ruleId: rule.id, proposedBy: "Evidence agent + code comparison" };
  const values: { doc: AssessDoc; value: number; quote: VerifiedQuote }[] = [];
  const allQuotes: VerifiedQuote[] = [];
  const checks: CodeCheck[] = [];
  for (const e of evidence) {
    const doc = docs.get(e.documentId);
    if (!doc || e.value === null) continue;
    const { quotes, supporting } = supportedValue(e, docs);
    allQuotes.push(...(supporting.length ? supporting : quotes));
    if (supporting.length) values.push({ doc, value: e.value, quote: supporting[0]! });
    else checks.push({ label: `Value in ${doc.name}`, result: "fail", detail: `Reported ${e.value}, but no verified quote contains it.` });
  }
  checks.unshift(quoteCheck(allQuotes, docs));
  const types = new Set(values.map((v) => v.doc.docType));
  if (types.size < 2) {
    return {
      decision: {
        ...base,
        status: checks.some((c) => c.result === "fail") ? "warning" : "needs_review",
        rationale: `A verified value was found in ${values.length === 0 ? "none" : "only one"} of the documents this rule compares, so code cannot compare them.`,
        evidence: allQuotes,
        checks,
      },
      conflict: null,
    };
  }
  const first = values[0]!;
  const other = values.find((v) => Math.abs(v.value - first.value) > 1e-9);
  checks.push({
    label: "Cross-document comparison",
    result: other ? "fail" : "pass",
    detail: values.map((v) => `${v.doc.name}: ${v.value}`).join("; "),
  });
  if (!other) {
    return {
      decision: { ...base, status: "compliant", rationale: `All documents state the same value (${first.value}).`, evidence: values.map((v) => v.quote), checks },
      conflict: null,
    };
  }
  return {
    decision: {
      ...base,
      status: "breach",
      rationale: `${first.doc.name} states ${first.value} but ${other.doc.name} states ${other.value}.`,
      evidence: [first.quote, other.quote],
      checks,
    },
    conflict: {
      key: rule.code,
      ruleCode: rule.code,
      label: rule.title,
      a: { documentId: first.doc.id, value: first.value, quote: first.quote },
      b: { documentId: other.doc.id, value: other.value, quote: other.quote },
    },
  };
}

// ---------------- bilingual ----------------

export function decideBilingual(rule: AssessRule, facts: Fact[], docs: AssessDoc[]): { decision: Decision; conflicts: Conflict[] } {
  const byId = new Map(docs.map((d) => [d.id, d]));
  const base = { ruleId: rule.id, proposedBy: "Evidence agent + code comparison" };
  const en = docs.find((d) => d.language === "en" && rule.appliesToDocTypes.includes(d.docType));
  const ar = docs.find((d) => d.language === "ar" && rule.appliesToDocTypes.includes(d.docType));
  if (!en || !ar) {
    return {
      decision: {
        ...base,
        status: "needs_review",
        rationale: `No confirmed ${!ar ? "Arabic" : "English"} version of the document is included, so the two languages cannot be compared.`,
        evidence: [],
        checks: [{ label: "Documents present", result: "fail", detail: `English: ${en ? en.name : "none"}. Arabic: ${ar ? ar.name : "none"}.` }],
      },
      conflicts: [],
    };
  }
  const pick = (docId: number) => {
    const m = new Map<FactField, { value: number; quote: VerifiedQuote }>();
    for (const f of facts.filter((x) => x.documentId === docId)) {
      const q = verify({ documentId: docId, page: f.page, quote: f.quote }, byId);
      if (q && isVerified(q) && quoteContainsNumber(q.quote, f.value) && !m.has(f.field)) m.set(f.field, { value: f.value, quote: q });
    }
    return m;
  };
  const e = pick(en.id);
  const a = pick(ar.id);
  const compared: { field: FactField; en: number; ar: number }[] = [];
  const conflicts: Conflict[] = [];
  const orderArtefacts: string[] = [];
  for (const field of FACT_FIELDS) {
    const x = e.get(field);
    const y = a.get(field);
    if (!x || !y) continue;
    compared.push({ field, en: x.value, ar: y.value });
    if (Math.abs(x.value - y.value) > 1e-9 && quoteContainsNumber(y.quote.quote, x.value)) {
      // Arabic text extracted from PDFs is often out of order; if the English figure is in the
      // same Arabic passage, the "difference" may be a pairing error, not a real one.
      orderArtefacts.push(`${FACT_LABELS[field]}: the Arabic passage also contains ${x.value}, so the figures may only have been paired out of order`);
      continue;
    }
    if (Math.abs(x.value - y.value) > 1e-9) {
      conflicts.push({
        key: `${rule.code}:${field}`,
        ruleCode: rule.code,
        label: FACT_LABELS[field],
        a: { documentId: en.id, value: x.value, quote: x.quote },
        b: { documentId: ar.id, value: y.value, quote: y.quote },
      });
    }
  }
  const checks: CodeCheck[] = [
    {
      label: "English/Arabic comparison",
      result: conflicts.length ? "fail" : compared.length ? "pass" : "info",
      detail: compared.length
        ? compared.map((c) => `${FACT_LABELS[c.field]}: ${c.en} / ${c.ar}${c.en === c.ar ? "" : " (differs)"}`).join("; ")
        : "No figure was verified in both versions.",
    },
    ...(orderArtefacts.length ? [{ label: "Possible text-order issue", result: "info" as const, detail: `${orderArtefacts.join("; ")}. Not counted as a difference.` }] : []),
  ];
  if (conflicts.length) {
    return {
      decision: {
        ...base,
        status: "breach",
        rationale: conflicts.map((c) => `${c.label}: English ${c.a.value}, Arabic ${c.b.value}`).join("; ") + ".",
        evidence: conflicts.flatMap((c) => [c.a.quote, c.b.quote]),
        checks,
      },
      conflicts,
    };
  }
  if (compared.length - orderArtefacts.length >= 3) {
    return {
      decision: {
        ...base,
        status: "compliant",
        rationale: `${compared.length - orderArtefacts.length} figures were verified in both versions and match.${orderArtefacts.length ? ` ${orderArtefacts.length} could not be paired reliably (see checks).` : ""}`,
        evidence: compared.filter((c) => c.en === c.ar).slice(0, 2).flatMap((c) => [e.get(c.field)!.quote, a.get(c.field)!.quote]),
        checks,
      },
      conflicts: [],
    };
  }
  return {
    decision: {
      ...base,
      status: "needs_review",
      rationale: compared.length
        ? `Only ${compared.length} figure(s) could be verified in both versions; too few to conclude.`
        : "No figure could be verified in both the English and Arabic versions, so they could not be compared.",
      evidence: [],
      checks,
    },
    conflicts: [],
  };
}

// ---------------- readability ----------------

export function decideReadability(rule: AssessRule, docs: AssessDoc[]): Decision {
  const limit = rule.threshold?.value ?? 25;
  const base = { ruleId: rule.id, proposedBy: "Code (sentence length)" };
  const targets = applicableDocs(rule, docs, "en");
  if (!targets.length) {
    return { ...base, status: "needs_review", rationale: "No confirmed English document of the type this rule covers is included.", evidence: [], checks: [] };
  }
  const checks: CodeCheck[] = [];
  const evidence: VerifiedQuote[] = [];
  let worst: { doc: AssessDoc; avg: number } | null = null;
  for (const d of targets) {
    const r = readability(d.pages, limit);
    const pass = r.averageWords <= limit;
    checks.push({
      label: `Average sentence length (${d.name})`,
      result: pass ? "pass" : "fail",
      detail: `${r.averageWords} words over ${r.sentences} sentences; limit ${limit}. ${r.overLimit} sentence(s) exceed the limit.`,
    });
    if (r.longest) {
      const q = verifyQuote(r.longest.text, r.longest.pageNo, d.pages);
      if (!pass) evidence.push({ documentId: d.id, pageNo: q.pageNo, quote: r.longest.text, verified: q.verified, charStart: q.charStart, charEnd: q.charEnd });
    }
    if (!pass && (!worst || r.averageWords > worst.avg)) worst = { doc: d, avg: r.averageWords };
  }
  if (worst) {
    return { ...base, status: "breach", rationale: `${worst.doc.name} averages ${worst.avg} words per sentence, above the limit of ${limit}. The longest sentence is quoted.`, evidence, checks };
  }
  return { ...base, status: "compliant", rationale: `Average sentence length is within ${limit} words in every document checked.`, evidence, checks };
}

// ---------------- presence / prohibited wording (model judgement, code-verified) ----------------

export interface Judgement {
  ruleCode: string;
  status: "compliant" | "breach" | "needs_review" | "not_applicable";
  rationale: string;
  quotes: CitedQuote[];
}

export function decideJudgement(rule: AssessRule, j: Judgement | undefined, docs: AssessDoc[]): Decision {
  const byId = new Map(docs.map((d) => [d.id, d]));
  const base = { ruleId: rule.id, proposedBy: "Rule agent, quotes verified by code" };
  if (!j) {
    return { ...base, status: "needs_review", rationale: "The Rule agent did not return a judgement for this rule.", evidence: [], checks: [] };
  }
  const evidence = j.quotes.map((q) => verify(q, byId)).filter((q): q is VerifiedQuote => q !== null);
  const verified = evidence.filter(isVerified);
  const checks: CodeCheck[] = [quoteCheck(evidence, byId)];
  const targets = applicableDocs(rule, docs, "en");
  const gaps = targets.filter((d) => d.gapPages.length);
  if (j.status === "breach" && rule.checkType === "presence" && verified.length === 0) {
    // An absence finding has nothing to quote. It is only reliable if every page was readable.
    checks.push({
      label: "Whole document readable",
      result: gaps.length ? "fail" : "pass",
      detail: gaps.length
        ? `Unreadable pages: ${gaps.map((d) => `${d.name} p. ${d.gapPages.join(", ")}`).join("; ")}. The missing wording may be on those pages.`
        : `Every page of ${targets.map((d) => d.name).join(", ")} had a text layer, so the absence is not caused by an extraction gap.`,
    });
    if (gaps.length) {
      return { ...base, status: "needs_review", rationale: `${j.rationale} However, some pages could not be read, so absence cannot be confirmed.`, evidence, checks };
    }
    return { ...base, status: "breach", rationale: j.rationale, evidence, checks };
  }
  if ((j.status === "compliant" || j.status === "breach") && verified.length === 0) {
    return {
      ...base,
      status: "warning",
      rationale: `The agent proposed ${j.status === "compliant" ? "Compliant" : "Breach"}, but none of its quotes could be found in the document. Unsupported proposals are not relied on. Agent's reason: ${j.rationale}`,
      evidence,
      checks,
    };
  }
  return { ...base, status: j.status, rationale: j.rationale, evidence: verified.length ? verified : evidence, checks };
}

export const STATUS_ORDER: FindingStatus[] = ["breach", "warning", "needs_review", "compliant", "not_applicable"];
