import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

function Section({ label, children, id }: { label: string; children: ReactNode; id: string }) {
  return (
    <section aria-labelledby={`sec-${id}`} className="rise space-y-2" data-testid={`section-${id}`}>
      <h2 id={`sec-${id}`} className="text-sm font-medium text-muted-foreground">
        {label}
      </h2>
      {children}
    </section>
  );
}

/**
 * Every page: one question as title, one primary action, then
 * answer -> reason -> evidence -> action, and a Next step link.
 */
export function PageFrame({
  eyebrow, question, primaryAction, meta, answer, reason, evidence, action, next, labels,
}: {
  eyebrow: string;
  question: string;
  primaryAction: ReactNode;
  meta?: ReactNode;
  answer: ReactNode;
  reason?: ReactNode;
  evidence?: ReactNode;
  action?: ReactNode;
  next: { href: string; label: string };
  /** Override section headings where the default four do not fit (e.g. the overview). */
  labels?: Partial<Record<"answer" | "reason" | "evidence" | "action", string>>;
}) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <header className="rise mb-5 flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="mb-1 text-xs text-muted-foreground" data-testid="text-eyebrow">{eyebrow}</p>
          <h1 className="min-w-0 text-xl font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-2xl" data-testid="text-page-question">
            {question}
          </h1>
          {meta ? <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div> : null}
        </div>
        <div className="shrink-0">{primaryAction}</div>
      </header>
      <div className="space-y-6">
        <Section label={labels?.answer ?? "Answer"} id="answer">{answer}</Section>
        {reason ? <Section label={labels?.reason ?? "Why"} id="reason">{reason}</Section> : null}
        {evidence ? <Section label={labels?.evidence ?? "Evidence"} id="evidence">{evidence}</Section> : null}
        {action ? <Section label={labels?.action ?? "What you can do"} id="action">{action}</Section> : null}
      </div>
      <nav aria-label="Next step" className="mt-8 flex justify-end border-t border-border pt-4">
        <Button asChild variant="outline" className="bg-card" data-testid="link-next-step">
          <Link href={next.href}>
            Next step: {next.label} <ArrowRight aria-hidden />
          </Link>
        </Button>
      </nav>
    </div>
  );
}
