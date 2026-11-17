import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ExaminerNote({
  children, author, className, "data-testid": testId,
}: { children: ReactNode; author?: string; className?: string; "data-testid"?: string }) {
  return (
    <div data-testid={testId ?? "note-examiner"} className={cn("border-l-2 border-pen/60 pl-3", className)}>
      <p className="font-serif text-[15px] italic leading-relaxed text-pen">{children}</p>
      {author ? <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-pen/80">{author}</p> : null}
    </div>
  );
}
