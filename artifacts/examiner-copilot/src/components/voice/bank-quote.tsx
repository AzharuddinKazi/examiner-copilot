import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function BankQuote({
  children, document, page, dir = "ltr", lang, className, "data-testid": testId,
}: {
  children: ReactNode; document: string; page?: number | string | null; dir?: "ltr" | "rtl";
  lang?: string; className?: string; "data-testid"?: string;
}) {
  const rtl = dir === "rtl";
  return (
    <figure
      data-testid={testId ?? "quote-bank"}
      className={cn("rounded-lg border border-paper-border bg-paper px-4 py-3 shadow-[0_1px_0_hsl(var(--paper-border))]", className)}
    >
      <blockquote
        dir={dir}
        lang={lang ?? (rtl ? "ar" : undefined)}
        className={cn("text-[15px] leading-relaxed text-foreground", rtl ? "font-arabic text-right text-base leading-loose" : "font-serif")}
      >
        {children}
      </blockquote>
      <figcaption className="mt-2 border-t border-dashed border-paper-border pt-1.5 font-mono text-[11px] tracking-tight text-muted-foreground">
        {document}
        {page !== undefined && page !== null ? ` · p. ${page}` : ""}
      </figcaption>
    </figure>
  );
}
