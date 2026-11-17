"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@clerk/react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Nav } from "./nav";
import { UserMenu } from "./user-menu";
import { Welcome } from "./welcome";
import { ThemeToggle } from "./theme-toggle";

function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2" data-testid="link-home">
      <span className="grid size-6 place-items-center rounded-md bg-primary font-mono text-[10px] font-semibold text-primary-foreground" aria-hidden>
        EC
      </span>
      <span className="text-sm font-semibold tracking-tight">Examiner Co-Pilot</span>
    </Link>
  );
}

/** Who is working: pinned to the bottom of the sidebar. */
function SignedInAs({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="mt-auto flex items-center gap-1 border-t border-sidebar-border pt-2" data-testid="block-signed-in">
      <UserMenu onNavigate={onNavigate} />
      <ThemeToggle />
    </div>
  );
}

const AUTH_PAGES = /^\/(sign-in|sign-up)(\/|$)/;

/** Sign-in pages render on their own; everything else needs a signed-in person. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { isLoaded, isSignedIn } = useAuth();
  if (AUTH_PAGES.test(pathname)) return <>{children}</>;
  if (!isLoaded) return <div className="min-h-[100dvh] bg-background" aria-busy="true" />;
  if (!isSignedIn) return <Welcome />;
  return <SignedInShell>{children}</SignedInShell>;
}

function SignedInShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-[100dvh]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-[100dvh] w-56 shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar px-2.5 py-3 lg:flex">
        <div className="mb-4 px-1.5"><Wordmark /></div>
        <Nav />
        <SignedInAs />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-background/90 px-3 py-2 backdrop-blur lg:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" aria-label="Open navigation" data-testid="button-open-nav">
                <Menu aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex w-64 flex-col overflow-y-auto bg-sidebar p-3">
              <SheetHeader className="mb-3 p-0 text-left">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <SheetDescription className="sr-only">Pages of the review flow, library and assurance.</SheetDescription>
                <Wordmark />
              </SheetHeader>
              <Nav onNavigate={() => setOpen(false)} />
              <SignedInAs onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <Wordmark />
        </header>
        <main id="main" className="flex-1">{children}</main>
      </div>
    </div>
  );
}
