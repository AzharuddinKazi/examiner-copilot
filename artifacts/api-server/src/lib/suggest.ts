/**
 * Rule-based suggestions for a newly uploaded document, computed from the file name and
 * extracted text. These are proposals for the examiner to confirm or correct; nothing is
 * decided here. Document text is treated as data only.
 */
export type DocType = "kfs" | "tnc" | "rewards" | "fees" | "advert";
export type DocLanguage = "en" | "ar";

export interface SuggestionItem<T> {
  value: T | null;
  reason: string;
}

export interface DocumentSuggestion {
  docType: SuggestionItem<DocType>;
  language: SuggestionItem<DocLanguage>;
  bankId: SuggestionItem<number>;
  productId: SuggestionItem<number>;
  source: "rules";
}

export interface BankForMatch {
  id: number;
  nameEn: string;
  nameAr: string | null;
  products: { id: number; name: string }[];
}

const DOC_TYPE_LABEL: Record<DocType, string> = {
  kfs: "Key Facts Statement",
  tnc: "Terms and Conditions",
  rewards: "Rewards terms",
  fees: "Fees Schedule",
  advert: "Advertisement",
};

const DOC_TYPE_PATTERNS: Record<DocType, RegExp[]> = {
  kfs: [/key\s*facts?(\s*statement)?/i, /\bkfs\b/i, /بيان\s*الحقائق\s*الأساسية/, /الحقائق\s*الأساسية/],
  tnc: [/terms\s*(and|&)\s*conditions/i, /\bt\s*&\s*c\b/i, /\btnc\b/i, /الشروط\s*والأحكام/],
  rewards: [/rewards?\s*(programme|program|terms)/i, /\brewards?\b/i, /المكافآت/],
  fees: [/schedule\s*of\s*(fees|charges)/i, /fees?\s*(schedule|and\s*charges)/i, /جدول\s*الرسوم/, /الرسوم\s*والتكاليف/],
  advert: [/\badvert(isement)?s?\b/i, /\bmarketing\b/i, /\bpromo(tion(al)?)?\b/i, /\bbrochure\b/i, /\bleaflet\b/i, /إعلان/],
};

function countMatches(text: string, patterns: RegExp[]): number {
  let n = 0;
  for (const p of patterns) {
    const g = new RegExp(p.source, p.flags.includes("g") ? p.flags : p.flags + "g");
    n += (text.match(g) ?? []).length;
  }
  return n;
}

export function suggestDocType(fileName: string, firstPagesText: string): SuggestionItem<DocType> {
  const name = fileName.replace(/[_\-.]+/g, " ");
  const scores = (Object.keys(DOC_TYPE_PATTERNS) as DocType[]).map((t) => {
    const inName = countMatches(name, DOC_TYPE_PATTERNS[t]);
    const inText = countMatches(firstPagesText.slice(0, 4000), DOC_TYPE_PATTERNS[t]);
    return { t, inName, inText, score: inName * 3 + inText };
  });
  scores.sort((a, b) => b.score - a.score);
  const [best, second] = scores;
  if (!best || best.score === 0) {
    return { value: null, reason: "No document-type heading found in the file name or the first pages." };
  }
  if (second && second.score === best.score) {
    return {
      value: null,
      reason: `Ambiguous: headings for both ${DOC_TYPE_LABEL[best.t]} and ${DOC_TYPE_LABEL[second.t]} were found equally often.`,
    };
  }
  const where = [best.inName ? "the file name" : null, best.inText ? `${best.inText} heading match(es) in the first pages` : null]
    .filter(Boolean)
    .join(" and ");
  return { value: best.t, reason: `Matched "${DOC_TYPE_LABEL[best.t]}" wording in ${where}.` };
}

export function suggestLanguage(text: string): SuggestionItem<DocLanguage> {
  const arabic = (text.match(/[\u0600-\u06ff\u0750-\u077f\ufb50-\ufdff\ufe70-\ufeff]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  const total = arabic + latin;
  if (total < 20) return { value: null, reason: "Too little text to tell the language." };
  const share = arabic / total;
  const pct = Math.round(share * 100);
  if (share >= 0.4) return { value: "ar", reason: `${pct}% of letters are Arabic script.` };
  if (share <= 0.15) return { value: "en", reason: `${100 - pct}% of letters are Latin script.` };
  return { value: null, reason: `Mixed script (${pct}% Arabic). Choose the language of the binding text.` };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function occurrences(text: string, needle: string): number {
  if (needle.trim().length < 3) return 0;
  const pattern = escapeRe(needle.trim()).replace(/\s+/g, "\\s+");
  return (text.match(new RegExp(pattern, "gi")) ?? []).length;
}

export function suggestBankAndProduct(
  fileName: string,
  text: string,
  banks: BankForMatch[],
): { bankId: SuggestionItem<number>; productId: SuggestionItem<number> } {
  const haystack = `${fileName.replace(/[_\-.]+/g, " ")}\n${text}`;
  const scored = banks
    .map((b) => ({ b, n: occurrences(haystack, b.nameEn) + (b.nameAr ? occurrences(haystack, b.nameAr) : 0) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);

  if (banks.length === 0) {
    const none = { value: null, reason: "No banks in the library yet. Add banks under Library first." };
    return { bankId: none, productId: { value: null, reason: "No products in the library yet." } };
  }
  if (scored.length === 0) {
    return {
      bankId: { value: null, reason: "No bank name from the library appears in the document." },
      productId: { value: null, reason: "Choose a bank first." },
    };
  }
  if (scored.length > 1 && scored[0]!.n === scored[1]!.n) {
    return {
      bankId: { value: null, reason: `Both ${scored[0]!.b.nameEn} and ${scored[1]!.b.nameEn} are named equally often.` },
      productId: { value: null, reason: "Choose a bank first." },
    };
  }
  const bank = scored[0]!.b;
  const bankId = { value: bank.id, reason: `"${bank.nameEn}" appears ${scored[0]!.n} time(s) in the document.` };

  const products = bank.products
    .map((p) => ({ p, n: occurrences(haystack, p.name) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || b.p.name.length - a.p.name.length);
  if (products.length === 0) {
    if (bank.products.length === 1) {
      const only = bank.products[0]!;
      return {
        bankId,
        productId: { value: only.id, reason: `Not named in the document; ${bank.nameEn} has one product in the library.` },
      };
    }
    return { bankId, productId: { value: null, reason: `None of ${bank.nameEn}'s product names appear in the document.` } };
  }
  const best = products[0]!;
  return { bankId, productId: { value: best.p.id, reason: `"${best.p.name}" appears ${best.n} time(s) in the document.` } };
}

export function suggestDocument(fileName: string, pagesText: string[], banks: BankForMatch[]): DocumentSuggestion {
  const all = pagesText.join("\n");
  const first = pagesText.slice(0, 2).join("\n");
  const { bankId, productId } = suggestBankAndProduct(fileName, all, banks);
  return {
    docType: suggestDocType(fileName, first),
    language: suggestLanguage(all),
    bankId,
    productId,
    source: "rules",
  };
}
