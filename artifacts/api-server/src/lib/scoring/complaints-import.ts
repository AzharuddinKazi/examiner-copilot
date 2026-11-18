/**
 * Complaint files come in two shapes:
 * - summary: one row per bank and category with a count (bank, category, count, optional product, period);
 * - case level: one row per complaint, as in the regulatory complaints register (LFI Name, Product,
 *   Category, Complaint Creation Date, plus consumer details).
 * Case-level rows are counted per bank, category and quarter, credit-card complaints only. Consumer
 * names, IDs, passport numbers and other personal details are never stored.
 */

export interface ComplaintAggregate {
  bank: string;
  product: string | null;
  category: string;
  period: string | null;
  count: number;
}

/** Header keys are lower-case letters only (e.g. "LFI Name" → "lfiname"). */
export function isCaseLevel(header: Record<string, string>): boolean {
  return "lfiname" in header && "category" in header && !["count", "complaints", "volume", "number"].some((k) => k in header);
}

export function quarterOf(date: string | undefined): string | null {
  const m = date?.match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  return `${m[1]}-Q${Math.ceil(Number(m[2]) / 3)}`;
}

export function aggregateCaseRows(rows: Record<string, string>[]): { items: ComplaintAggregate[]; total: number; credit: number; skipped: string[] } {
  const by = new Map<string, ComplaintAggregate>();
  const skipped: string[] = [];
  let credit = 0;
  for (const [i, r] of rows.entries()) {
    if (!/credit\s*card/i.test(r.product ?? "")) continue;
    const bank = (r.lfiname ?? "").trim();
    const category = (r.category ?? "").trim();
    if (!bank || !category) {
      skipped.push(`Row ${i + 2}: no bank or category.`);
      continue;
    }
    credit++;
    const period = quarterOf(r.complaintcreationdate);
    const key = `${bank.toLowerCase()}|${category.toLowerCase()}|${period}`;
    const cur = by.get(key) ?? { bank, product: null, category, period, count: 0 };
    cur.count++;
    by.set(key, cur);
  }
  return { items: [...by.values()], total: rows.length, credit, skipped };
}
