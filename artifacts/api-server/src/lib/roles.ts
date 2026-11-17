import type { Request, Response } from "express";

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

/** Write access comes from the signed-in person's assigned role. Returns the role, or sends the error. */
export function requireWriter(req: Request, res: Response): Role | null {
  const role = req.user?.role;
  if (!role) {
    res.status(401).json({ error: "Sign in to continue." });
    return null;
  }
  if (role === "viewer") {
    res.status(403).json({ error: "Your account has view-only access. Ask a senior examiner to change your role." });
    return null;
  }
  return role;
}

/** Managing people is limited to senior examiners. */
export function requireSenior(req: Request, res: Response): boolean {
  if (req.user?.role === "senior_examiner") return true;
  res.status(403).json({ error: "Only a senior examiner can change roles." });
  return false;
}
