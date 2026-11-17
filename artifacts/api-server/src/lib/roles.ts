import type { Response } from "express";

export const ROLES = ["examiner", "senior_examiner", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  examiner: "Examiner",
  senior_examiner: "Senior examiner",
  viewer: "Viewer",
};

export function parseRole(value: unknown): Role | null {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value) ? (value as Role) : null;
}

/**
 * Roles are self-selected and unverified. This guard only stops accidental changes
 * from the Viewer role; it is not access control. Returns the role, or sends the error.
 */
export function requireWriter(value: unknown, res: Response): Role | null {
  const role = parseRole(value);
  if (!role) {
    res.status(400).json({ error: "A role is required (examiner, senior_examiner or viewer)." });
    return null;
  }
  if (role === "viewer") {
    res.status(403).json({
      error: "Viewer can look but not change anything. Change your role at the bottom of the sidebar (self-selected, not verified).",
    });
    return null;
  }
  return role;
}
