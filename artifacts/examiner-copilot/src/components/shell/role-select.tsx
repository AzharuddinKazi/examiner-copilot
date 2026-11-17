"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLE_LABELS, useRole, type RoleValue } from "@/lib/role";

export function RoleSelect() {
  const { role, setRole, pending } = useRole();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="role-select" className="sr-only">Working as (self-selected role)</label>
      <Select value={role} onValueChange={(v) => setRole(v as RoleValue)} disabled={pending}>
        <SelectTrigger id="role-select" className="h-8 w-[150px] bg-card text-xs" data-testid="select-role">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(ROLE_LABELS) as RoleValue[]).map((r) => (
            <SelectItem key={r} value={r} data-testid={`option-role-${r}`}>{ROLE_LABELS[r]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="font-mono text-[11px] leading-tight text-muted-foreground" data-testid="text-role-unverified">
        Self-selected · not verified
      </span>
    </div>
  );
}
