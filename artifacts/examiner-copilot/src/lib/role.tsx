"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Role,
  useRecordRoleChange,
  getListAuditEventsQueryKey,
  getVerifyAuditChainQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

export type RoleValue = (typeof Role)[keyof typeof Role];
export const ROLE_LABELS: Record<RoleValue, string> = {
  examiner: "Examiner",
  senior_examiner: "Senior examiner",
  viewer: "Viewer",
};
const KEY = "examiner-copilot.role";

type Ctx = { role: RoleValue; setRole: (r: RoleValue) => void; pending: boolean };
const RoleContext = createContext<Ctx | null>(null);

function isRole(v: unknown): v is RoleValue {
  return v === "examiner" || v === "senior_examiner" || v === "viewer";
}

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<RoleValue>("examiner");
  const qc = useQueryClient();
  const { toast } = useToast();
  const record = useRecordRoleChange();

  useEffect(() => {
    const stored = window.localStorage.getItem(KEY);
    if (isRole(stored)) setRoleState(stored);
  }, []);

  const mutate = record.mutate;
  const setRole = useCallback(
    (next: RoleValue) => {
      setRoleState((prev) => {
        if (prev === next) return prev;
        window.localStorage.setItem(KEY, next);
        mutate(
          { data: { role: next, previousRole: prev } },
          {
            onSuccess: () => {
              qc.invalidateQueries({ queryKey: getListAuditEventsQueryKey() });
              qc.invalidateQueries({ queryKey: getVerifyAuditChainQueryKey() });
            },
            onError: () =>
              toast({
                title: "Role changed locally only",
                description: "The audit log could not record this change. Check the API connection.",
                variant: "destructive",
              }),
          },
        );
        return next;
      });
    },
    [mutate, qc, toast],
  );

  return <RoleContext.Provider value={{ role, setRole, pending: record.isPending }}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used inside RoleProvider");
  return ctx;
}
