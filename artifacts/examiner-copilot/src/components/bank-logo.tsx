import { basePath } from "@/lib/auth";
import { cn } from "@/lib/utils";

/** The bank's official logo on a white tile (logos are drawn for white), or its initials. */
export function BankLogo({ bank, className }: { bank: { id: number; nameEn: string; logoUrl: string | null }; className?: string }) {
  const tile = "flex h-12 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-white";
  if (bank.logoUrl) {
    return (
      <span className={cn(tile, "p-1", className)} data-testid={`img-bank-logo-${bank.id}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${basePath}/${bank.logoUrl}`} alt={`${bank.nameEn} logo`} className="block max-h-full max-w-full object-contain" loading="lazy" />
      </span>
    );
  }
  const initials = bank.nameEn.split(/\s+/).map((w) => w[0]).join("").slice(0, 4).toUpperCase();
  return (
    <span className={cn(tile, "font-mono text-xs font-semibold text-neutral-600", className)} aria-hidden data-testid={`img-bank-logo-${bank.id}`}>
      {initials}
    </span>
  );
}
