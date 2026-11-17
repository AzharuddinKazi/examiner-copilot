"use client";

import { UserRound } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLE_LABELS, useRole, type RoleValue } from "@/lib/role";

export function RoleSelect() {
  const { role, setRole, pending } = useRole();
  return (
    <div className="min-w-0 flex-1">
      <label htmlFor="role-select" className="sr-only">Signed in as (self-selected role, not verified)</label>
      <Select value={role} onValueChange={(v) => setRole(v as RoleValue)} disabled={pending}>
        <SelectTrigger id="role-select" className="h-8 w-full gap-1.5 bg-card text-xs" title="Self-selected role, not verified" data-testid="select-role">
          <UserRound className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="flex-1 truncate text-left"><SelectValue /></span>
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(ROLE_LABELS) as RoleValue[]).map((r) => (
            <SelectItem key={r} value={r} data-testid={`option-role-${r}`}>{ROLE_LABELS[r]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
