"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, LayoutGrid, Settings } from "lucide-react";
import { useGetWorkspaceProgress } from "@workspace/api-client-react";
import { FLOW, GROUPS } from "@/lib/nav";
import { cn } from "@/lib/utils";

function itemCls(active: boolean) {
  return cn(
    "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
    active ? "bg-card font-medium text-foreground shadow-sm ring-1 ring-border" : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-foreground",
  );
}

export function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const { data } = useGetWorkspaceProgress();
  const isActive = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  const exact = (href: string) => path === href;

  return (
    <nav aria-label="Main" className="flex flex-col gap-6 text-sm">
      <div>
        <Link href="/" onClick={onNavigate} className={itemCls(isActive("/"))} aria-current={isActive("/") ? "page" : undefined} data-testid="link-nav-overview">
          <LayoutGrid className="size-4" aria-hidden /> Overview
        </Link>
      </div>
      <div>
        <p className="mb-1.5 px-2.5 text-xs font-medium text-muted-foreground">Review flow</p>
        <ol className="space-y-0.5">
          {FLOW.map((s) => {
            const step = data?.steps.find((x) => x.key === s.key);
            const state = step?.state ?? "not_started";
            const primaryCount = step?.counts[0]?.value;
            const active = isActive(s.href);
            return (
              <li key={s.key}>
                <Link href={s.href} onClick={onNavigate} className={itemCls(active)} aria-current={active ? "page" : undefined} data-testid={`link-nav-${s.key}`}>
                  <span
                    className={cn(
                      "grid size-5 shrink-0 place-items-center rounded-full border font-mono text-[11px]",
                      state === "done" && "border-[hsl(var(--tone-ok))] bg-[hsl(var(--tone-ok))] text-card",
                      state === "in_progress" && "border-[hsl(var(--tone-info))] text-[hsl(var(--tone-info))]",
                      state === "not_started" && "border-border text-muted-foreground",
                    )}
                    aria-hidden
                  >
                    {state === "done" ? <Check className="size-3" /> : s.number}
                  </span>
                  <span className="flex-1 truncate">{s.label}</span>
                  <span className="sr-only">
                    {state === "done" ? "done" : state === "in_progress" ? "in progress" : "not started"}
                  </span>
                  {primaryCount !== undefined && primaryCount > 0 ? (
                    <span className="font-mono text-[11px] text-muted-foreground" data-testid={`text-nav-count-${s.key}`}>{primaryCount}</span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
      {GROUPS.map((g) => (
        <div key={g.title}>
          <p className="mb-1.5 px-2.5 text-xs font-medium text-muted-foreground">{g.title}</p>
          <ul className="space-y-0.5">
            {g.items.map((it) => (
              <li key={it.href}>
                <Link href={it.href} onClick={onNavigate} className={itemCls(exact(it.href))} aria-current={exact(it.href) ? "page" : undefined}
                  data-testid={`link-nav-${it.href.replace(/\//g, "-").slice(1)}`}>
                  <span className="pl-[30px]">{it.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="border-t border-sidebar-border pt-3">
        <Link href="/settings" onClick={onNavigate} className={itemCls(exact("/settings"))} aria-current={exact("/settings") ? "page" : undefined} data-testid="link-nav-settings">
          <Settings className="size-4" aria-hidden /> Settings
        </Link>
      </div>
    </nav>
  );
}
