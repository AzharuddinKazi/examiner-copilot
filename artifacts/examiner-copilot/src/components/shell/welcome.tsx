"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

/** What a signed-out visitor sees: what the tool is, and how to get in. */
export function Welcome() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header className="flex items-center gap-2 px-5 py-4">
        <span className="grid size-6 place-items-center rounded-md bg-primary font-mono text-[10px] font-semibold text-primary-foreground" aria-hidden>EC</span>
        <span className="text-sm font-semibold tracking-tight">Examiner Co-Pilot</span>
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-5 pb-24">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl" data-testid="text-welcome-title">Check card disclosures against your rulebook.</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Upload a bank&apos;s Key Facts Statement, terms and fee schedule. Agents propose a status for every rule, with quotes from the documents. Examiners decide, and every step is recorded.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild data-testid="button-welcome-sign-in"><Link href="/sign-in">Sign in</Link></Button>
          <Button asChild variant="outline" data-testid="button-welcome-sign-up"><Link href="/sign-up">Create account</Link></Button>
        </div>
      </main>
    </div>
  );
}
