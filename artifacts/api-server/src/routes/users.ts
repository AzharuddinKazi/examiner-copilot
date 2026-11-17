import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { asc, eq, sql } from "drizzle-orm";
import { GetMeResponse, ListUsersResponse, SetUserRoleBody, SetUserRoleParams, SetUserRoleResponse } from "@workspace/api-zod";
import type { UserRow } from "@workspace/db";
import { appendAudit } from "../lib/audit";
import { getActiveDataset } from "../lib/dataset";
import { ROLE_LABELS, parseRole, requireSenior } from "../lib/roles";

const router: IRouter = Router();

const toApi = (u: UserRow) => ({
  id: u.id, name: u.name, email: u.email, role: parseRole(u.role) ?? "viewer", createdAt: u.createdAt, lastSeenAt: u.lastSeenAt,
});

router.get("/me", async (req, res): Promise<void> => {
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));
  res.json(GetMeResponse.parse(toApi(u!)));
});

router.get("/users", async (_req, res): Promise<void> => {
  const rows = await db.select().from(usersTable).orderBy(asc(usersTable.createdAt));
  res.json(ListUsersResponse.parse({ items: rows.map(toApi) }));
});

router.patch("/users/:id/role", async (req, res): Promise<void> => {
  const p = SetUserRoleParams.safeParse(req.params);
  const b = SetUserRoleBody.safeParse(req.body);
  if (!p.success || !b.success) {
    res.status(400).json({ error: "Choose a role: examiner, senior_examiner or viewer." });
    return;
  }
  if (!requireSenior(req, res)) return;
  const next = b.data.role;
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('users:roles'))`);
    const [target] = await tx.select().from(usersTable).where(eq(usersTable.id, p.data.id));
    if (!target) return { status: 404 as const, error: "No such person." };
    if (target.role === next) return { status: 200 as const, row: target };
    if (target.role === "senior_examiner") {
      const [{ n }] = (await tx.execute(sql`select count(*)::int as n from ${usersTable} where role = 'senior_examiner'`)).rows as [{ n: number }];
      if (n <= 1) return { status: 409 as const, error: "At least one senior examiner must remain. Promote someone else first." };
    }
    const [row] = await tx.update(usersTable).set({ role: next }).where(eq(usersTable.id, target.id)).returning();
    const who = target.name ?? target.email ?? `User ${target.id}`;
    await appendAudit({
      dataset: await getActiveDataset(),
      role: req.user!.role,
      action: "user.role_changed",
      entityType: "user",
      entityId: String(target.id),
      summary: `Changed ${who}'s role from ${ROLE_LABELS[parseRole(target.role) ?? "viewer"]} to ${ROLE_LABELS[next]}.`,
      before: { role: target.role },
      after: { role: next },
    }, tx);
    return { status: 200 as const, row: row! };
  });
  if ("error" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json(SetUserRoleResponse.parse(toApi(result.row)));
});

export default router;
