/**
 * Business-day arithmetic for notice deadlines. UAE weekend: Saturday and Sunday.
 * Dates are plain "YYYY-MM-DD" strings and computed in UTC so the server time zone never shifts a day.
 */
const WEEKEND = new Set([0, 6]); // Sunday, Saturday

const parse = (d: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`Not a date: ${d}`);
  const t = new Date(`${d}T00:00:00Z`);
  if (Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== d) throw new Error(`Not a date: ${d}`);
  return t;
};
const fmt = (t: Date) => t.toISOString().slice(0, 10);

export const isValidDate = (d: string) => {
  try {
    parse(d);
    return true;
  } catch {
    return false;
  }
};

export function isBusinessDay(d: string, holidays: ReadonlySet<string> = new Set()): boolean {
  return !WEEKEND.has(parse(d).getUTCDay()) && !holidays.has(d);
}

/** The date `n` business days after `from` (the reference date itself is never counted). */
export function addBusinessDays(from: string, n: number, holidays: ReadonlySet<string> = new Set()): string {
  const t = parse(from);
  let left = Math.max(0, Math.floor(n));
  while (left > 0) {
    t.setUTCDate(t.getUTCDate() + 1);
    if (!WEEKEND.has(t.getUTCDay()) && !holidays.has(fmt(t))) left--;
  }
  return fmt(t);
}

/** Business days the bank gets to respond to the notice as a whole. */
export const RESPONSE_DAYS = 14;
/** Default time to fix each finding, by severity. Examiners can change any due date. */
export const FIX_DAYS: Record<"high" | "medium" | "low", number> = { high: 20, medium: 40, low: 60 };

export function todayIn(tz = "Asia/Dubai"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function formatLong(d: string | null): string {
  if (!d) return "not set";
  return parse(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
