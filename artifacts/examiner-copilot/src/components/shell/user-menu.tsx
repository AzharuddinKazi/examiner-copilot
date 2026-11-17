"use client";

import Link from "next/link";
import { ChevronsUpDown, LogOut, Settings } from "lucide-react";
import { useClerk, useUser } from "@clerk/react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { basePath } from "@/lib/auth";
import { ROLE_LABELS, useRole } from "@/lib/role";

function initials(name: string) {
  const parts = name.trim().split(/\s+|@/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[1]![0] : "")).toUpperCase() || "?";
}

/** Signed-in person at the bottom of the sidebar, with sign out. */
export function UserMenu({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { role, me } = useRole();
  const email = me?.email ?? user?.primaryEmailAddress?.emailAddress ?? "";
  const name = me?.name ?? user?.fullName ?? email;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        data-testid="button-user-menu"
      >
        {user?.imageUrl && user.hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.imageUrl} alt="" className="size-7 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground" aria-hidden>
            {initials(name || "?")}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium leading-tight" data-testid="text-user-name">{name}</span>
          <span className="block truncate text-[11px] leading-tight text-muted-foreground" data-testid="text-user-role">{ROLE_LABELS[role]}</span>
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-medium">{name}</span>
          {email && email !== name ? <span className="block truncate text-xs text-muted-foreground">{email}</span> : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings" onClick={onNavigate} data-testid="link-menu-settings"><Settings aria-hidden /> Settings</Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => signOut({ redirectUrl: basePath || "/" })} data-testid="button-sign-out">
          <LogOut aria-hidden /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
