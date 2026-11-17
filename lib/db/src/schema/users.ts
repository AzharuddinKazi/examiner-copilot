import { pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * People who can sign in. Identity comes from Clerk; the role is assigned here.
 * The first person to sign in becomes a senior examiner; everyone after starts as viewer.
 */
export const usersTable = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    email: text("email"),
    name: text("name"),
    role: text("role").notNull().default("viewer"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_clerk_user_id_idx").on(t.clerkUserId)],
);

export type UserRow = typeof usersTable.$inferSelect;
