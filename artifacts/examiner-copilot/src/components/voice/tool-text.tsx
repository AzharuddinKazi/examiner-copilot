import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ToolText({
  children, className, as: As = "p", "data-testid": testId,
}: { children: ReactNode; className?: string; as?: "p" | "span" | "div"; "data-testid"?: string }) {
  return (
    <As data-testid={testId} className={cn("font-mono text-[13px] leading-relaxed text-foreground/85", className)}>
      {children}
    </As>
  );
}
