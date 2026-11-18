import type { AgentField, Bank, DocLanguage, DocType, DocumentSummary, Product, SuggestionItem } from "@workspace/api-client-react";

export type Source = "confirmed" | "suggested" | "agent" | "none";

export interface Resolved<T> {
  value: T | null;
  source: Source;
  /** Why the tool suggested it (empty when confirmed or unknown). */
  reason: string;
  /** The Ingestion agent disagrees with the rule-based suggestion. */
  agentDiffers: boolean;
}

export interface ResolvedDoc {
  doc: DocumentSummary;
  bank: Resolved<Bank>;
  product: Resolved<Product>;
  docType: Resolved<DocType>;
  language: Resolved<DocLanguage>;
  /** All four values are known (confirmed or suggested), so the document can be confirmed in one click. */
  complete: boolean;
}

function pick<T>(
  confirmed: T | null,
  isConfirmed: boolean,
  rule: SuggestionItem | undefined,
  agent: AgentField | null | undefined,
  lookup: (v: string | number) => T | null,
): Resolved<T> {
  const agentDiffers = agent?.agreement === "differs";
  if (isConfirmed && confirmed !== null) return { value: confirmed, source: "confirmed", reason: "", agentDiffers: false };
  if (rule && rule.value !== null && rule.value !== undefined) {
    const v = lookup(rule.value);
    if (v !== null) return { value: v, source: "suggested", reason: rule.reason, agentDiffers };
  }
  if (agent && agent.value !== null && agent.value !== undefined) {
    const v = lookup(agent.value);
    if (v !== null) return { value: v, source: "agent", reason: `Agent: ${agent.reason}`, agentDiffers: false };
  }
  return { value: null, source: "none", reason: rule?.reason ?? "", agentDiffers: false };
}

/** The bank, product, type and language for a document: what the examiner confirmed, else what the tool suggests. */
export function resolveDoc(doc: DocumentSummary, banks: Bank[]): ResolvedDoc {
  const confirmed = doc.status === "confirmed";
  const s = doc.suggestion;
  const ap = doc.agentProposal?.status === "done" ? doc.agentProposal : null;
  const bankById = (v: string | number) => banks.find((b) => b.id === Number(v)) ?? null;
  const bank = pick(bankById(doc.bankId ?? -1), confirmed, s?.bankId, ap?.bankId, bankById);
  const productById = (v: string | number) => {
    const list = bank.value ? bank.value.products : banks.flatMap((b) => b.products);
    return list.find((p) => p.id === Number(v)) ?? null;
  };
  const product = pick(doc.productId ? productById(doc.productId) : null, confirmed, s?.productId, ap?.productId, productById);
  const docType = pick(doc.docType, confirmed, s?.docType, ap?.docType, (v) => String(v) as DocType);
  const language = pick(doc.language, confirmed, s?.language, ap?.language, (v) => String(v) as DocLanguage);
  return { doc, bank, product, docType, language, complete: !!(bank.value && product.value && docType.value && language.value) };
}

export interface ProductGroup {
  key: string;
  bank: Bank | null;
  product: Product | null;
  docs: ResolvedDoc[];
}

/** Groups documents by the card product they belong to (confirmed or suggested). Unmatched documents come last. */
export function groupByProduct(docs: DocumentSummary[], banks: Bank[]): ProductGroup[] {
  const groups = new Map<string, ProductGroup>();
  for (const d of docs) {
    const r = resolveDoc(d, banks);
    const key = r.product.value ? `p${r.product.value.id}` : r.bank.value ? `b${r.bank.value.id}` : "none";
    const g = groups.get(key) ?? { key, bank: r.bank.value, product: r.product.value, docs: [] };
    g.docs.push(r);
    groups.set(key, g);
  }
  const order = (g: ProductGroup) => (g.key === "none" ? 2 : g.product ? 0 : 1);
  return [...groups.values()].sort(
    (a, b) => order(a) - order(b) || (a.bank?.nameEn ?? "").localeCompare(b.bank?.nameEn ?? "") || (a.product?.name ?? "").localeCompare(b.product?.name ?? ""),
  );
}
