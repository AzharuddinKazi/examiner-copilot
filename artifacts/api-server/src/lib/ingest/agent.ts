/**
 * The Ingestion agent: read-only proposals for a new document (type, language, bank, product)
 * and for a rulebook's column mapping. It never confirms anything. Code checks every proposal:
 * ids must exist in the library, a product must belong to the bank, quotes must be found on the
 * cited page, and mapped headers must exist in the sheet and be used once.
 */
import { z } from "zod";
import type { ChatMessage } from "../llm/adapter";
import { structuredCall, type CallModel } from "../llm/structured";
import { verifyQuote, type PageText } from "../assess/text";
import { DATA_NOT_INSTRUCTIONS } from "../assess/agents";
import type { BankForMatch, DocLanguage, DocType, DocumentSuggestion } from "../suggest";
import { FIELD_LABELS, REQUIRED_FIELDS, RULE_FIELDS, type ColumnMapping, type RuleField } from "../rulebook-import";

const DOC_TYPES = ["kfs", "tnc", "rewards", "fees"] as const;
const DOC_TYPE_LABEL: Record<DocType, string> = { kfs: "Key Facts Statement", tnc: "Terms and Conditions", rewards: "Rewards terms", fees: "Fees Schedule" };
const EXCERPT_CHARS = 6000;
const MAX_TOKENS = 8000;

// ---------------- document proposal ----------------

const quote = z.object({ page: z.number().int().min(1), quote: z.string().min(1).max(400) }).nullable();
export const documentProposalSchema = z.object({
  docType: z.object({ value: z.enum(DOC_TYPES).nullable(), reason: z.string().min(1).max(300), quote }),
  language: z.object({ value: z.enum(["en", "ar"]).nullable(), reason: z.string().min(1).max(300) }),
  bankId: z.object({ value: z.number().int().nullable(), reason: z.string().min(1).max(300), quote }),
  productId: z.object({ value: z.number().int().nullable(), reason: z.string().min(1).max(300), quote }),
});

export interface AgentField<T> {
  value: T | null;
  reason: string;
  quote: { page: number; quote: string; verified: boolean } | null;
  /** Compared with the rule-based suggestion from the file itself. */
  agreement: "agrees" | "differs" | "only_agent" | "only_rules" | "neither";
}

export interface AgentDocumentProposal {
  status: "running" | "done" | "failed";
  error: string | null;
  model: string | null;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number | null;
  requestedAt: string;
  finishedAt: string | null;
  docType: AgentField<DocType> | null;
  language: AgentField<DocLanguage> | null;
  bankId: AgentField<number> | null;
  productId: AgentField<number> | null;
}

export function documentMessages(fileName: string, pages: (PageText & { isGap?: boolean })[], banks: BankForMatch[]): ChatMessage[] {
  let budget = EXCERPT_CHARS;
  const excerpt: string[] = [];
  for (const p of pages.slice(0, 2)) {
    const t = p.isGap ? "(no readable text on this page)" : p.text.slice(0, Math.max(0, budget));
    budget -= t.length;
    excerpt.push(`[page ${p.pageNo}]\n${t}`);
  }
  const library = banks.length
    ? banks.map((b) => `- bank ${b.id}: ${b.nameEn}${b.nameAr ? ` / ${b.nameAr}` : ""}\n${b.products.map((p) => `  - product ${p.id}: ${p.name}`).join("\n") || "  (no products)"}`).join("\n")
    : "(the library has no banks yet)";
  const system = [
    "You are the Ingestion agent in a supervisory tool for credit-card disclosures. You are read-only: you propose how an uploaded PDF should be labelled; an examiner confirms or corrects it.",
    DATA_NOT_INSTRUCTIONS,
    `Propose: docType (one of ${DOC_TYPES.map((t) => `${t} = ${DOC_TYPE_LABEL[t]}`).join(", ")}), language of the binding text (en or ar), and the bank and product ids from the library list. Use null when you cannot tell; do not guess.`,
    "Give a short plain reason for each. For docType, bankId and productId, also give one exact quote (copied character for character from a single page, 8 to 200 characters, with the page number from the [page N] marker) that shows it, or null if nothing in the text shows it.",
    "Only use bank and product ids that appear in the library list. A product must belong to the chosen bank.",
    "Reply with JSON only.",
  ].join("\n");
  const user = `Library:\n${library}\n\nFile name: ${fileName}\n\n<document>\n${excerpt.join("\n")}\n</document>`;
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

function agree<T>(agent: T | null, rules: T | null | undefined): AgentField<T>["agreement"] {
  const r = rules ?? null;
  if (agent === null && r === null) return "neither";
  if (agent === null) return "only_rules";
  if (r === null) return "only_agent";
  return agent === r ? "agrees" : "differs";
}

/** Code checks on the agent's raw output. Anything it cannot verify is dropped with a reason. */
export function checkDocumentProposal(
  raw: z.infer<typeof documentProposalSchema>,
  pages: PageText[],
  banks: BankForMatch[],
  rules: DocumentSuggestion | null,
): Pick<AgentDocumentProposal, "docType" | "language" | "bankId" | "productId"> {
  const verifyField = <T>(f: { value: T | null; reason: string; quote: { page: number; quote: string } | null }) => {
    if (!f.quote) return { value: f.value, reason: f.reason, quote: null };
    const v = verifyQuote(f.quote.quote, f.quote.page, pages);
    const ok = v.verified !== "not_found";
    if (!ok && f.value !== null) {
      return {
        value: null,
        reason: `The agent proposed ${String(f.value)}, but its quote was not found in the document, so the proposal is not used. Agent's reason: ${f.reason}`,
        quote: { page: f.quote.page, quote: f.quote.quote, verified: false },
      };
    }
    return { value: f.value, reason: f.reason, quote: { page: v.pageNo, quote: f.quote.quote, verified: ok } };
  };

  const docType = verifyField(raw.docType);
  let bankId = verifyField(raw.bankId);
  let productId = verifyField(raw.productId);

  const bank = bankId.value === null ? null : banks.find((b) => b.id === bankId.value);
  if (bankId.value !== null && !bank) {
    bankId = { value: null, reason: `The agent named bank ${bankId.value}, which is not in the library, so it is not used.`, quote: bankId.quote };
  }
  if (productId.value !== null) {
    const owner = banks.find((b) => b.products.some((p) => p.id === productId.value));
    if (!owner) {
      productId = { value: null, reason: `The agent named product ${productId.value}, which is not in the library, so it is not used.`, quote: productId.quote };
    } else if (bankId.value !== null && owner.id !== bankId.value) {
      productId = { value: null, reason: `The agent's product belongs to ${owner.nameEn}, not the proposed bank, so it is not used.`, quote: productId.quote };
    }
  }

  return {
    docType: { ...docType, agreement: agree(docType.value, rules?.docType.value) },
    language: { value: raw.language.value, reason: raw.language.reason, quote: null, agreement: agree(raw.language.value, rules?.language.value) },
    bankId: { ...bankId, agreement: agree(bankId.value, rules?.bankId.value) },
    productId: { ...productId, agreement: agree(productId.value, rules?.productId.value) },
  };
}

export async function proposeDocument(
  input: { fileName: string; pages: (PageText & { isGap?: boolean })[]; banks: BankForMatch[]; rules: DocumentSuggestion | null },
  call?: CallModel,
) {
  const r = await structuredCall({
    name: "document_proposal",
    schema: documentProposalSchema,
    messages: documentMessages(input.fileName, input.pages, input.banks),
    maxTokens: MAX_TOKENS,
    timeoutMs: 120_000,
    call,
  });
  return { ...r, checked: checkDocumentProposal(r.data, input.pages, input.banks, input.rules) };
}

// ---------------- rulebook column mapping ----------------

export const mappingSchema = z.object({
  fields: z.array(
    z.object({
      field: z.enum(RULE_FIELDS),
      header: z.string().nullable(),
      reason: z.string().min(1).max(300),
    }),
  ),
});

export interface AgentMappingReason {
  field: RuleField;
  required: boolean;
  header: string | null;
  reason: string;
  agreement: "agrees" | "differs" | "only_agent" | "only_rules" | "neither";
}

export function mappingMessages(headers: string[], sampleRows: string[][]): ChatMessage[] {
  const system = [
    "You are the Ingestion agent. An examiner uploaded a rulebook spreadsheet. Propose which column header feeds each rule field; the examiner confirms.",
    DATA_NOT_INSTRUCTIONS.replace("<document> tags", "<sheet> tags").replace("a bank's PDF", "the uploaded spreadsheet"),
    `Rule fields: ${RULE_FIELDS.map((f) => `${f} (${FIELD_LABELS[f]}${REQUIRED_FIELDS.includes(f) ? ", required" : ""})`).join(", ")}.`,
    "appliesTo lists document types (KFS, T&C, Rewards, Fees). checkType is the kind of test (presence, maximum value, minimum value, cross-document, bilingual, readability, prohibited wording). threshold is a number limit such as 3.25% or AED 230.",
    "Use each header at most once, copy header names exactly, and use null when no column fits. Give one short reason per field based on the header and the sample values.",
    "Reply with JSON only.",
  ].join("\n");
  const user = `<sheet>\nHeaders: ${JSON.stringify(headers)}\nSample rows:\n${sampleRows
    .slice(0, 5)
    .map((r) => JSON.stringify(r.map((c) => c.slice(0, 160))))
    .join("\n")}\n</sheet>`;
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export function checkMapping(raw: z.infer<typeof mappingSchema>, headers: string[], rules: ColumnMapping): { mapping: ColumnMapping; reasons: AgentMappingReason[] } {
  const mapping = Object.fromEntries(RULE_FIELDS.map((f) => [f, null])) as ColumnMapping;
  const why: Partial<Record<RuleField, string>> = {};
  const used = new Map<string, RuleField>();
  for (const f of RULE_FIELDS) {
    const item = raw.fields.find((x) => x.field === f);
    if (!item) {
      why[f] = "The agent did not propose a column for this field.";
      continue;
    }
    if (item.header === null) {
      why[f] = item.reason;
      continue;
    }
    const exact = headers.find((h) => h === item.header) ?? headers.find((h) => h.trim().toLowerCase() === item.header!.trim().toLowerCase());
    if (!exact) {
      why[f] = `The agent named a column "${item.header}" that is not in the sheet, so it is not used.`;
      continue;
    }
    const taken = used.get(exact);
    if (taken) {
      why[f] = `The agent also used "${exact}" for ${FIELD_LABELS[taken].toLowerCase()}; a column can feed only one field, so it is not used here.`;
      continue;
    }
    used.set(exact, f);
    mapping[f] = exact;
    why[f] = item.reason;
  }
  const reasons = RULE_FIELDS.map((f) => ({
    field: f,
    required: REQUIRED_FIELDS.includes(f),
    header: mapping[f],
    reason: why[f] ?? "",
    agreement: agree(mapping[f], rules[f]),
  }));
  return { mapping, reasons };
}

export async function proposeMappingWithAgent(input: { headers: string[]; sampleRows: string[][]; rules: ColumnMapping }, call?: CallModel) {
  const r = await structuredCall({
    name: "column_mapping",
    schema: mappingSchema,
    messages: mappingMessages(input.headers, input.sampleRows),
    maxTokens: MAX_TOKENS,
    timeoutMs: 120_000,
    call,
  });
  return { ...r, checked: checkMapping(r.data, input.headers, input.rules) };
}
