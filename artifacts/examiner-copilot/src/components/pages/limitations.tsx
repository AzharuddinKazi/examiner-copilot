import Link from "next/link";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageFrame } from "@/components/page-frame";
import { BankQuote, ExaminerNote, StatusPill, ToolText, type StatusVariant } from "@/components/voice";

const LIMITS: { title: string; body: string }[] = [
  { title: "Not an official CBUAE system", body: "This is an independent workbench. It has no standing with the Central Bank of the UAE or any regulator." },
  { title: "Rules are examiner-supplied", body: "The tool applies the active rulebook as written. You interpret the rules; the tool does not." },
  { title: "Agents are read-only and only propose", body: "They cannot edit documents, rules, findings or decisions." },
  { title: "Examiners decide and own enforcement", body: "Approval of findings and any action against a bank rest with you." },
  { title: "Notices are drafts and never sent", body: "The tool has no channel to contact a bank." },
  { title: "Roles are set inside the app", body: "Sign-in confirms who someone is. What they may do (Examiner, Senior examiner, Viewer) is assigned by a senior examiner in Settings, not by your organisation's directory." },
  { title: "PoC maker-checker mode is for single-user trials only", body: "In PoC mode one senior examiner can both decide and approve; those approvals are marked Self-approved (PoC mode). Production requires a different senior examiner as checker, so keep the mode on Strict." },
  { title: "Document text is data, never instructions", body: "Anything written inside an uploaded document is analysed, not obeyed." },
  { title: "No OCR for scanned pages", body: "Pages without extractable text are flagged as extraction gaps and are not read." },
  { title: "Arabic extraction can be imperfect", body: "Right-to-left text, ligatures and mixed scripts may extract out of order. Check against the original." },
  { title: "Small peer groups make statistics weak", body: "Market comparisons across a handful of banks are indicative at best." },
  { title: "AI output can be wrong", body: "Every finding must cite an exact quote and page that code verifies; otherwise it becomes a Warning." },
];

const PILLS: StatusVariant[] = ["compliant", "breach", "warning", "needs_review", "not_applicable", "not_started", "in_progress", "done", "draft", "error"];

export function Limitations() {
  return (
    <PageFrame
      eyebrow="Assurance · Limitations"
      question="What can this tool not do?"
      primaryAction={
        <Button asChild data-testid="button-open-rulebook">
          <Link href="/library/rulebook"><BookOpen aria-hidden /> See the rules we apply</Link>
        </Button>
      }
      answer={
        <p className="max-w-prose text-[15px] leading-relaxed">
          It cannot decide anything. It reads disclosures, compares them with rules you supply and proposes findings with quotes.
          Judgement, approval and enforcement stay with examiners.
        </p>
      }
      reason={
        <ol className="grid gap-2 md:grid-cols-2" data-testid="list-limitations">
          {LIMITS.map((l, i) => (
            <li key={l.title} className="flex gap-3 rounded-lg border border-card-border bg-card p-3.5" data-testid={`item-limitation-${i}`}>
              <div>
                <p className="text-sm font-medium">{l.title}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{l.body}</p>
              </div>
            </li>
          ))}
        </ol>
      }
      evidence={
        <div className="space-y-4 rounded-lg border border-card-border bg-card p-4 sm:p-5" data-testid="section-voices-legend">
          <p className="text-sm font-medium">Voices: three kinds of text, never mixed</p>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">The bank's words</p>
              <BankQuote document="Key Facts Statement" page={2} data-testid="legend-bank-quote">
                A late payment fee of AED 241.50 applies if the minimum amount due is not received by the due date.
              </BankQuote>
              <BankQuote document="بيان الحقائق الرئيسية" page={2} dir="rtl" data-testid="legend-bank-quote-ar">
                تُفرض رسوم تأخير في السداد إذا لم يتم استلام الحد الأدنى المستحق بحلول تاريخ الاستحقاق.
              </BankQuote>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">The tool's analysis</p>
              <div className="rounded-lg border border-border bg-muted/50 p-3">
                <ToolText data-testid="legend-tool-text">
                  Proposed: fee stated in KFS p.2 matches Fees Schedule p.4. Quote verified against extracted text.
                </ToolText>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">The examiner's judgement</p>
              <ExaminerNote author="Examiner name (role)" data-testid="legend-examiner-note">
                Agree the fee is disclosed, but it is not shown next to the minimum payment. Raise with the bank.
              </ExaminerNote>
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Status: always icon and word</p>
            <div className="flex flex-wrap gap-2">
              {PILLS.map((p) => <StatusPill key={p} variant={p} data-testid={`legend-status-${p}`} />)}
            </div>
          </div>
        </div>
      }
      next={{ href: "/settings", label: "Settings" }}
    />
  );
}
