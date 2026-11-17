/**
 * Deterministic text checks used by the assessment. No model is involved here.
 * Document text is only ever searched and measured, never executed or obeyed.
 */
import { normalizeText } from "../pdf";

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN = "۰۱۲۳۴۵۶۷۸۹";

export function westernDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (d) => String(ARABIC_INDIC.includes(d) ? ARABIC_INDIC.indexOf(d) : PERSIAN.indexOf(d)));
}

/** Loose form for matching: no whitespace, no tatweel or Arabic diacritics, unified punctuation, lower case. */
export function looseForm(s: string): string {
  return westernDigits(normalizeText(s))
    .replace(/[\u0640\u064b-\u065f\u0670]/g, "")
    .replace(/[\u2018\u2019\u201b\u2032`´]/g, "'")
    .replace(/[\u201c\u201d\u201e\u2033]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[٫]/g, ".")
    .replace(/[،]/g, ",")
    .replace(/\s+/g, "")
    .toLowerCase();
}

export type QuoteVerification = "exact" | "normalized" | "not_found";

export interface PageText {
  pageNo: number;
  text: string; // normalized page text
}

export interface QuoteCheck {
  verified: QuoteVerification;
  /** The page the quote was actually found on (may differ from the cited page). */
  pageNo: number;
  citedPage: number;
  charStart: number | null;
  charEnd: number | null;
}

const MIN_QUOTE_CHARS = 8;

/**
 * Checks a quote against the cited page. If it is not there but is on another page of the same
 * document, the page is corrected and the result is "normalized" so the examiner can see it moved.
 */
export function verifyQuote(quote: string, citedPage: number, pages: PageText[]): QuoteCheck {
  const q = normalizeText(quote);
  const none: QuoteCheck = { verified: "not_found", pageNo: citedPage, citedPage, charStart: null, charEnd: null };
  if (looseForm(q).length < MIN_QUOTE_CHARS) return none;
  const ordered = [...pages].sort((a, b) => (a.pageNo === citedPage ? -1 : b.pageNo === citedPage ? 1 : a.pageNo - b.pageNo));
  for (const p of ordered) {
    const idx = p.text.indexOf(q);
    if (idx >= 0) {
      return { verified: p.pageNo === citedPage ? "exact" : "normalized", pageNo: p.pageNo, citedPage, charStart: idx, charEnd: idx + q.length };
    }
    if (looseForm(p.text).includes(looseForm(q))) {
      return { verified: "normalized", pageNo: p.pageNo, citedPage, charStart: null, charEnd: null };
    }
  }
  return none;
}

/** All numbers in a string, with Arabic-Indic digits and thousands separators handled. */
export function numbersIn(s: string): number[] {
  const t = westernDigits(s).replace(/٫/g, ".").replace(/(\d),(?=\d{3}\b)/g, "$1");
  return (t.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
}

export function quoteContainsNumber(quote: string, value: number): boolean {
  return numbersIn(quote).some((n) => Math.abs(n - value) < 1e-9);
}

// ---------------- Readability ----------------

export interface ReadabilityResult {
  sentences: number;
  averageWords: number;
  longest: { text: string; words: number; pageNo: number } | null;
  overLimit: number;
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?؟])\s+(?=\S)/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 3);
}

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

export function readability(pages: PageText[], limit: number): ReadabilityResult {
  let total = 0;
  let count = 0;
  let over = 0;
  let longest: ReadabilityResult["longest"] = null;
  for (const p of pages) {
    for (const s of splitSentences(p.text)) {
      const w = wordCount(s);
      total += w;
      count++;
      if (w > limit) over++;
      if (!longest || w > longest.words) longest = { text: s, words: w, pageNo: p.pageNo };
    }
  }
  return { sentences: count, averageWords: count ? Math.round((total / count) * 10) / 10 : 0, longest, overLimit: over };
}

// ---------------- Prompt-injection detection ----------------

const INJECTION_PATTERNS: RegExp[] = [
  /ignore (all |any )?(the )?(previous|prior|above|earlier) (instructions|prompts|rules)/i,
  /disregard (all |any )?(the )?(previous|prior|above|your) (instructions|rules|rulebook)/i,
  /\b(system|developer) (note|prompt|message|instruction)s?\b.{0,40}\b(ai|model|assistant|reviewer)\b/i,
  /\b(to|for) (any|the) (ai|llm|language model|assistant|reviewer)\b/i,
  /\byou are (now )?(an? )?(ai|assistant|language model|chatbot)\b/i,
  /\bmark (every|all|each) (rule|finding|item)s? .{0,40}\b(compliant|pass)/i,
  /\bdo not report (any )?(findings|issues|breaches)\b/i,
  /تجاهل (جميع |كل )?(التعليمات|الأوامر) السابقة/,
];

export interface InjectionHit {
  pageNo: number;
  quote: string;
}

/** Finds sentences that address an AI system. They are reported, and stay inert data. */
export function detectInjection(pages: PageText[]): InjectionHit[] {
  const hits: InjectionHit[] = [];
  for (const p of pages) {
    for (const s of p.text.split(/(?<=[.!?؟])\s+/)) {
      if (INJECTION_PATTERNS.some((re) => re.test(s))) hits.push({ pageNo: p.pageNo, quote: s.trim().slice(0, 400) });
    }
  }
  return hits;
}
