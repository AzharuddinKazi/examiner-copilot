import ExcelJS from "exceljs";
import type { DocType } from "./suggest";

export const XLSX_LIMITS = { maxBytes: 5 * 1024 * 1024, maxRows: 500 } as const;

export const RULE_FIELDS = ["code", "title", "text", "category", "appliesTo", "checkType", "threshold", "severity"] as const;
export type RuleField = (typeof RULE_FIELDS)[number];
export const REQUIRED_FIELDS: RuleField[] = ["code", "title", "text", "checkType"];

export type ColumnMapping = Record<RuleField, string | null>;
export type CheckType =
  | "presence"
  | "max_value"
  | "min_value"
  | "cross_document"
  | "bilingual"
  | "readability"
  | "prohibited_language";
export type Severity = "low" | "medium" | "high";

export interface Threshold {
  value: number | null;
  unit: string | null;
  raw: string;
}

export interface RuleDraft {
  row: number;
  code: string;
  title: string;
  text: string;
  category: string | null;
  appliesToDocTypes: DocType[];
  checkType: CheckType;
  threshold: Threshold | null;
  severity: Severity;
}

export interface RowError {
  row: number;
  field: RuleField;
  message: string;
}

export interface ParsedSheet {
  sheetName: string;
  headers: string[];
  rows: { row: number; cells: string[] }[];
}

export class WorkbookError extends Error {}

/** Reads the first worksheet that has a header row and at least one data row. */
export async function parseWorkbook(buf: Buffer): Promise<ParsedSheet> {
  // .xlsx is a zip; check the signature before handing it to the parser.
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
    throw new WorkbookError("This is not an .xlsx file. Save the rulebook as Excel Workbook (.xlsx) and try again.");
  }
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    throw new WorkbookError("The workbook could not be read. It may be damaged or password-protected.");
  }
  for (const ws of wb.worksheets) {
    const all: { row: number; cells: string[] }[] = [];
    ws.eachRow({ includeEmpty: false }, (r, rowNumber) => {
      const cells: string[] = [];
      for (let c = 1; c <= ws.columnCount; c++) cells.push(cellText(r.getCell(c)));
      if (cells.some((v) => v !== "")) all.push({ row: rowNumber, cells });
    });
    if (all.length < 2) continue;
    const [head, ...rest] = all;
    const width = Math.max(...all.map((r) => lastNonEmpty(r.cells) + 1));
    const seen = new Map<string, number>();
    const headers = head!.cells.slice(0, width).map((h, i) => {
      let name = h || `Column ${i + 1}`;
      const n = seen.get(name.toLowerCase()) ?? 0;
      seen.set(name.toLowerCase(), n + 1);
      if (n > 0) name = `${name} (${n + 1})`;
      return name;
    });
    if (rest.length > XLSX_LIMITS.maxRows) {
      throw new WorkbookError(`The sheet has ${rest.length} rule rows; the limit is ${XLSX_LIMITS.maxRows}.`);
    }
    return {
      sheetName: ws.name,
      headers,
      rows: rest.map((r) => ({ row: r.row, cells: headers.map((_, i) => r.cells[i] ?? "") })),
    };
  }
  throw new WorkbookError("No worksheet has a header row and at least one rule row.");
}

function lastNonEmpty(cells: string[]): number {
  for (let i = cells.length - 1; i >= 0; i--) if (cells[i] !== "") return i;
  return -1;
}

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "richText" in v) return v.richText.map((t) => t.text).join("").trim();
  if (typeof v === "object" && "result" in v) return String(v.result ?? "").trim();
  if (typeof v === "object" && "text" in v) return String(v.text).trim();
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

const norm = (s: string) => s.toLowerCase().replace(/[_\-./()]+/g, " ").replace(/\s+/g, " ").trim();

const FIELD_ALIASES: Record<RuleField, string[]> = {
  code: ["code", "rule id", "id", "rule code", "ref", "reference", "rule no", "rule number", "rule ref"],
  title: ["title", "rule name", "name", "heading", "short title", "rule title"],
  text: ["text", "requirement", "rule text", "description", "provision", "rule", "requirement text"],
  category: ["category", "area", "topic", "theme", "section"],
  appliesTo: ["applies to", "document", "documents", "doc type", "document type", "scope", "applicable documents"],
  checkType: ["check", "check type", "test", "type of check", "method", "test type"],
  threshold: ["threshold", "limit", "value", "max", "cap", "threshold value"],
  severity: ["severity", "priority", "risk", "impact", "risk rating"],
};

export const FIELD_LABELS: Record<RuleField, string> = {
  code: "Rule code",
  title: "Title",
  text: "Rule text",
  category: "Category",
  appliesTo: "Applies to",
  checkType: "Check type",
  threshold: "Threshold",
  severity: "Severity",
};

/** Matches spreadsheet headers to rule fields by name. Exact names win over partial ones. */
export function proposeMapping(headers: string[]): {
  mapping: ColumnMapping;
  reasons: { field: RuleField; required: boolean; header: string | null; reason: string }[];
} {
  const mapping = Object.fromEntries(RULE_FIELDS.map((f) => [f, null])) as ColumnMapping;
  const how: Partial<Record<RuleField, string>> = {};
  const used = new Set<string>();
  const normed = headers.map((h) => ({ h, n: norm(h) }));

  for (const f of RULE_FIELDS) {
    const hit = normed.find((x) => !used.has(x.h) && FIELD_ALIASES[f].includes(x.n));
    if (hit) {
      mapping[f] = hit.h;
      used.add(hit.h);
      how[f] = `Header "${hit.h}" is a common name for ${FIELD_LABELS[f].toLowerCase()}.`;
    }
  }
  for (const f of RULE_FIELDS) {
    if (mapping[f]) continue;
    const hit = normed.find(
      (x) => !used.has(x.h) && FIELD_ALIASES[f].some((a) => a.length > 2 && new RegExp(`\\b${a}\\b`).test(x.n)),
    );
    if (hit) {
      mapping[f] = hit.h;
      used.add(hit.h);
      how[f] = `Header "${hit.h}" contains a word used for ${FIELD_LABELS[f].toLowerCase()}. Check it.`;
    }
  }
  const reasons = RULE_FIELDS.map((f) => {
    const required = REQUIRED_FIELDS.includes(f);
    return {
      field: f,
      required,
      header: mapping[f],
      reason:
        how[f] ??
        (required
          ? `No header looks like ${FIELD_LABELS[f].toLowerCase()}. Choose the column; it is required.`
          : `No header looks like ${FIELD_LABELS[f].toLowerCase()}. Optional; ${optionalDefault(f)}`),
    };
  });
  return { mapping, reasons };
}

function optionalDefault(f: RuleField): string {
  switch (f) {
    case "appliesTo":
      return "if not mapped, each rule applies to all four document types.";
    case "severity":
      return "if not mapped, each rule is Medium severity.";
    default:
      return "leave it unmapped if the sheet has no such column.";
  }
}

const CHECK_ALIASES: Record<CheckType, string[]> = {
  presence: ["presence", "present", "must be stated", "disclosure", "disclosed", "must disclose", "stated"],
  max_value: ["max value", "max", "maximum", "must not exceed", "cap", "ceiling", "upper limit"],
  min_value: ["min value", "min", "minimum", "must be at least", "at least", "floor", "lower limit"],
  cross_document: ["cross document", "consistency", "must match", "match across documents", "cross check"],
  bilingual: ["bilingual", "english arabic", "language consistency", "arabic english", "translation"],
  readability: ["readability", "readable", "plain language", "must be readable"],
  prohibited_language: ["prohibited language", "prohibited", "must not contain", "banned wording", "prohibited wording"],
};

const DOC_ALIASES: Record<DocType, string[]> = {
  kfs: ["kfs", "key facts", "key facts statement", "key fact statement"],
  tnc: ["t&c", "tnc", "t & c", "terms", "terms and conditions", "terms & conditions", "t c"],
  rewards: ["rewards", "reward", "rewards terms", "reward terms", "rewards programme", "rewards program"],
  fees: ["fees", "fees schedule", "fee schedule", "schedule of fees", "schedule of charges", "fees and charges"],
};
const ALL_DOC_TYPES: DocType[] = ["kfs", "tnc", "rewards", "fees"];

const SEVERITY_ALIASES: Record<Severity, string[]> = {
  low: ["low", "l", "minor"],
  medium: ["medium", "m", "med", "moderate"],
  high: ["high", "h", "major", "critical"],
};

function matchAlias<T extends string>(value: string, table: Record<T, string[]>): T | null {
  const n = norm(value);
  for (const [k, aliases] of Object.entries(table) as [T, string[]][]) if (aliases.includes(n)) return k;
  return null;
}

export function parseAppliesTo(raw: string): { types: DocType[]; unknown: string[] } {
  if (!raw.trim() || /^all( documents)?$/i.test(raw.trim())) return { types: [...ALL_DOC_TYPES], unknown: [] };
  // "Terms and Conditions" contains "and"; protect known multi-word names before splitting.
  const protectedRaw = raw.replace(/terms\s+and\s+conditions/gi, "terms & conditions").replace(/fees\s+and\s+charges/gi, "fees & charges");
  const tokens = protectedRaw
    .split(/[,;/|\n]+|\s+and\s+/i)
    .map((t) => t.trim())
    .filter(Boolean);
  const types = new Set<DocType>();
  const unknown: string[] = [];
  for (const t of tokens) {
    const n = t.toLowerCase().replace(/\s+/g, " ");
    const hit = (Object.entries(DOC_ALIASES) as [DocType, string[]][]).find(([, a]) => a.includes(n));
    if (hit) types.add(hit[0]);
    else unknown.push(t);
  }
  return { types: ALL_DOC_TYPES.filter((d) => types.has(d)), unknown };
}

export function parseThreshold(raw: string): Threshold | null {
  const s = raw.trim();
  if (!s) return null;
  const m = s.replace(/,(?=\d{3}\b)/g, "").match(/-?\d+(?:\.\d+)?/);
  const value = m ? Number(m[0]) : null;
  let unit: string | null = null;
  if (/%|percent/i.test(s)) unit = "%";
  else if (/\baed\b|dirham|د\.إ/i.test(s)) unit = "AED";
  else if (/business days?/i.test(s)) unit = "business days";
  else if (/days?/i.test(s)) unit = "days";
  else if (/words?/i.test(s)) unit = "words";
  return { value, unit, raw: s };
}

/** Turns mapped rows into rule drafts. Every problem is reported against its spreadsheet row. */
export function buildRules(sheet: ParsedSheet, mapping: ColumnMapping): { rules: RuleDraft[]; rowErrors: RowError[] } {
  const rowErrors: RowError[] = [];
  const idx = {} as Record<RuleField, number>;
  for (const f of RULE_FIELDS) {
    const h = mapping[f];
    idx[f] = h ? sheet.headers.indexOf(h) : -1;
    if (h && idx[f] < 0) rowErrors.push({ row: 1, field: f, message: `Column "${h}" is not in the sheet.` });
  }
  for (const f of REQUIRED_FIELDS) {
    if (!mapping[f]) rowErrors.push({ row: 1, field: f, message: `${FIELD_LABELS[f]} must be mapped to a column.` });
  }
  const mapped = Object.values(mapping).filter((v): v is string => !!v);
  const dup = mapped.find((h, i) => mapped.indexOf(h) !== i);
  if (dup) rowErrors.push({ row: 1, field: RULE_FIELDS.find((f) => mapping[f] === dup)!, message: `Column "${dup}" is mapped to more than one field.` });
  if (rowErrors.length) return { rules: [], rowErrors };

  const get = (cells: string[], f: RuleField) => (idx[f] >= 0 ? (cells[idx[f]] ?? "").trim() : "");
  const seenCodes = new Map<string, number>();
  const rules: RuleDraft[] = [];

  for (const { row, cells } of sheet.rows) {
    const errs: RowError[] = [];
    const code = get(cells, "code");
    const title = get(cells, "title");
    const text = get(cells, "text");
    if (!code) errs.push({ row, field: "code", message: "Rule code is empty." });
    else if (code.length > 40) errs.push({ row, field: "code", message: "Rule code is longer than 40 characters." });
    else if (seenCodes.has(code.toLowerCase())) {
      errs.push({ row, field: "code", message: `Rule code "${code}" is also used on row ${seenCodes.get(code.toLowerCase())}.` });
    } else seenCodes.set(code.toLowerCase(), row);
    if (!title) errs.push({ row, field: "title", message: "Title is empty." });
    else if (title.length > 300) errs.push({ row, field: "title", message: "Title is longer than 300 characters." });
    if (!text) errs.push({ row, field: "text", message: "Rule text is empty." });

    const checkRaw = get(cells, "checkType");
    const checkType = checkRaw ? matchAlias(checkRaw, CHECK_ALIASES) : null;
    if (!checkRaw) errs.push({ row, field: "checkType", message: "Check type is empty." });
    else if (!checkType) {
      errs.push({
        row,
        field: "checkType",
        message: `"${checkRaw}" is not a known check type. Use one of: presence, max value, min value, cross document, bilingual, readability, prohibited language.`,
      });
    }

    const applies = parseAppliesTo(get(cells, "appliesTo"));
    if (applies.unknown.length) {
      errs.push({
        row,
        field: "appliesTo",
        message: `Unknown document type: ${applies.unknown.map((u) => `"${u}"`).join(", ")}. Use KFS, T&C, Rewards, Fees or All.`,
      });
    }

    const threshold = parseThreshold(get(cells, "threshold"));
    if ((checkType === "max_value" || checkType === "min_value") && (threshold === null || threshold.value === null)) {
      errs.push({ row, field: "threshold", message: "This check compares a number, so the threshold needs a number (for example 3.25% or AED 230)." });
    }

    const sevRaw = get(cells, "severity");
    const severity = sevRaw ? matchAlias(sevRaw, SEVERITY_ALIASES) : "medium";
    if (!severity) errs.push({ row, field: "severity", message: `"${sevRaw}" is not a severity. Use Low, Medium or High.` });

    if (errs.length) {
      rowErrors.push(...errs);
      continue;
    }
    rules.push({
      row,
      code,
      title,
      text,
      category: get(cells, "category") || null,
      appliesToDocTypes: applies.types,
      checkType: checkType!,
      threshold,
      severity: severity!,
    });
  }
  if (sheet.rows.length === 0) rowErrors.push({ row: 2, field: "code", message: "The sheet has no rule rows." });
  return { rules, rowErrors };
}
