"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Nav } from "./nav";
import { DatasetBadge } from "./dataset-badge";
import { RoleSelect } from "./role-select";
import { ThemeToggle } from "./theme-toggle";

function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2" data-testid="link-home">
      <span className="grid size-7 place-items-center rounded-md bg-primary font-mono text-[11px] font-semibold text-primary-foreground" aria-hidden>
        EC
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold tracking-tight">Examiner Co-Pilot</span>
        <span className="block text-[11px] text-muted-foreground">Agents propose, you decide</span>
      </span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-[100dvh]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-[100dvh] w-64 shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar px-3 py-4 lg:flex">
        <div className="mb-6 px-1"><Wordmark /></div>
        <Nav />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:px-6">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8 lg:hidden" aria-label="Open navigation" data-testid="button-open-nav">
                  <Menu aria-hidden />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 overflow-y-auto bg-sidebar p-4">
                <SheetHeader className="mb-4 p-0 text-left">
                  <SheetTitle className="sr-only">Navigation</SheetTitle>
                  <SheetDescription className="sr-only">Pages of the review flow, library and assurance.</SheetDescription>
                  <Wordmark />
                </SheetHeader>
                <Nav onNavigate={() => setOpen(false)} />
              </SheetContent>
            </Sheet>
            <div className="lg:hidden"><Wordmark /></div>
            <DatasetBadge />
            <div className="ml-auto flex items-center gap-2">
              <RoleSelect />
              <ThemeToggle />
            </div>
          </div>
        </header>
        <main id="main" className="flex-1">{children}</main>
        <footer className="border-t border-border px-4 py-4 text-xs text-muted-foreground sm:px-6" data-testid="text-footer-disclaimer">
          <p>
            <strong className="font-semibold text-foreground">Not an official CBUAE system.</strong> Sample rules are not law.
            Public or synthetic documents only. Examiners decide and own any enforcement.{" "}
            <Link href="/assurance/limitations" className="underline underline-offset-2 hover:text-foreground" data-testid="link-footer-limitations">
              Limitations
            </Link>
          </p>
        </footer>
      </div>
    </div>
  );
}
