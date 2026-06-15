import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { readSessionContext, type AuthContext } from "./session";
import { withTenant, type Tx } from "@/db/client";
import { can, type Capability } from "@/lib/rbac";

/** Deduped per-request read of the authenticated user. */
export const getCurrentUser = cache(
  async (): Promise<AuthContext | null> => readSessionContext(),
);

export async function requireUser(): Promise<AuthContext> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireCapability(
  capability: Capability,
): Promise<AuthContext> {
  const user = await requireUser();
  if (!can(user.role, capability)) redirect("/forbidden");
  return user;
}

/**
 * Run a tenant-scoped, transactional query block. RLS pins every statement to
 * the current company. Use for all reads and writes of tenant data.
 *
 *   const projects = await db((tx) => tx.select().from(projectsTable));
 */
export async function db<T>(
  fn: (tx: Tx, ctx: AuthContext) => Promise<T>,
): Promise<T> {
  const ctx = await requireUser();
  return withTenant(ctx, (tx) => fn(tx, ctx));
}

export type { AuthContext };
