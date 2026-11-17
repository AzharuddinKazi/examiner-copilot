import { AsyncLocalStorage } from "node:async_hooks";
import type { NextFunction, Request, Response } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { db, usersTable, type UserRow } from "@workspace/db";
import { asc, eq, sql } from "drizzle-orm";
import { parseRole, type Role } from "./roles";

export interface CurrentUser {
  id: number;
  name: string | null;
  email: string | null;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: CurrentUser;
    }
  }
}

/** The signed-in person for the current request (and any work it starts). */
const store = new AsyncLocalStorage<CurrentUser>();
export const currentUser = (): CurrentUser | undefined => store.getStore();

/** "Name <email>", or whichever part is known. Used for the audit log and decisions. */
export function actorLabel(u: CurrentUser | undefined | null): string | null {
  if (!u) return null;
  if (u.name && u.email) return `${u.name} <${u.email}>`;
  return u.name ?? u.email ?? `User ${u.id}`;
}

function toCurrent(row: UserRow): CurrentUser {
  return { id: row.id, name: row.name, email: row.email, role: parseRole(row.role) ?? "viewer" };
}

/**
 * Finds the local user for a Clerk id, creating it on first sign-in.
 * The very first user becomes a senior examiner so someone can assign roles.
 */
async function ensureUser(clerkUserId: string): Promise<UserRow> {
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, clerkUserId));
  if (existing) {
    if (Date.now() - existing.lastSeenAt.getTime() > 5 * 60_000) {
      await db.update(usersTable).set({ lastSeenAt: new Date() }).where(eq(usersTable.id, existing.id));
    }
    return existing;
  }
  const cu = await clerkClient.users.getUser(clerkUserId);
  const email = cu.primaryEmailAddress?.emailAddress ?? cu.emailAddresses[0]?.emailAddress ?? null;
  const name = [cu.firstName, cu.lastName].filter(Boolean).join(" ").trim() || cu.username || null;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('users:first'))`);
    const [again] = await tx.select().from(usersTable).where(eq(usersTable.clerkUserId, clerkUserId));
    if (again) return again;
    const [{ n }] = (await tx.execute(sql`select count(*)::int as n from ${usersTable}`)).rows as [{ n: number }];
    const [row] = await tx.insert(usersTable)
      .values({ clerkUserId, email, name, role: n === 0 ? "senior_examiner" : "viewer" })
      .returning();
    return row!;
  });
}

/**
 * Development preview only: with no Clerk session, act as the workspace owner
 * (the earliest senior examiner) so the preview does not ask for sign-in on every
 * reload. Never active in production (NODE_ENV=production there).
 */
export const PREVIEW_AUTO_SIGNIN = process.env.NODE_ENV === "development" && process.env.PREVIEW_AUTO_SIGNIN !== "false";

async function previewOwner(): Promise<UserRow | undefined> {
  const [owner] = await db.select().from(usersTable).where(eq(usersTable.role, "senior_examiner")).orderBy(asc(usersTable.id)).limit(1);
  return owner;
}

/** Every /api route except the health check needs a signed-in user. */
export async function requireUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = getAuth(req);
  const clerkUserId = (auth?.sessionClaims?.userId as string | undefined) || auth?.userId;
  let row: UserRow | undefined;
  if (clerkUserId) row = await ensureUser(clerkUserId);
  else if (PREVIEW_AUTO_SIGNIN) row = await previewOwner();
  if (!row) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  const user = toCurrent(row);
  req.user = user;
  store.run(user, () => next());
}
