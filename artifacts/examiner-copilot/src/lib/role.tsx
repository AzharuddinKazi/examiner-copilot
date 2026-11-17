"use client";

import { Role, useGetMe, type User } from "@workspace/api-client-react";

export type RoleValue = (typeof Role)[keyof typeof Role];
export const ROLE_LABELS: Record<RoleValue, string> = {
  examiner: "Examiner",
  senior_examiner: "Senior examiner",
  viewer: "Viewer",
};

/** The signed-in person and their assigned role. Treated as Viewer until loaded. */
export function useRole(): { role: RoleValue; me: User | undefined; isLoading: boolean } {
  const me = useGetMe();
  return { role: me.data?.role ?? "viewer", me: me.data, isLoading: me.isLoading };
}
