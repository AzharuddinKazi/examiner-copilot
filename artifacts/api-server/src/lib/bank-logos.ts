/**
 * Official logos for banks we know, matched by name so a bank added later as
 * "ADCB" or "Abu Dhabi Commercial Bank" gets the same logo. Files live in the
 * web app's public/banks folder; the URL is relative to the web app's base path.
 */
const LOGOS: { file: string; names: string[] }[] = [
  { file: "banks/adcb.svg", names: ["adcb", "abu dhabi commercial bank", "بنك أبوظبي التجاري"] },
  { file: "banks/adib.svg", names: ["adib", "abu dhabi islamic bank", "مصرف أبوظبي الإسلامي"] },
  { file: "banks/cbd.svg", names: ["cbd", "commercial bank of dubai", "بنك دبي التجاري"] },
  { file: "banks/mashreq.png", names: ["mashreq", "mashreqbank", "mashreq bank", "المشرق"] },
];

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ").replace(/\s*(pjsc|psc)\.?$/, "");

export function bankLogoUrl(nameEn: string, nameAr?: string | null): string | null {
  const keys = [norm(nameEn), nameAr ? norm(nameAr) : ""].filter(Boolean);
  return LOGOS.find((l) => l.names.some((n) => keys.includes(n)))?.file ?? null;
}
