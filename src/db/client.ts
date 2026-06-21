import "server-only";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import * as schema from "./schema";
import { pgOptions } from "./pg-options";

/**
 * Two database connections, two trust levels:
 *
 *  - `appPg`  → role `constructflow` (NOT superuser, NO bypassrls). Subject to
 *               Row-Level Security. Every tenant query runs through `withTenant`,
 *               which opens a transaction and pins `app.current_company_id`.
 *  - `authPg` → role `constructflow_auth` (BYPASSRLS). Used ONLY for pre-tenant
 *               operations: signup, login lookup, session validation.
 */

const globalForDb = globalThis as unknown as {
  __appPg?: ReturnType<typeof postgres>;
  __authPg?: ReturnType<typeof postgres>;
};

function makeClient(url: string) {
  return postgres(url, pgOptions(url));
}

const appPg =
  globalForDb.__appPg ?? (globalForDb.__appPg = makeClient(process.env.DATABASE_URL!));
const authPg =
  globalForDb.__authPg ??
  (globalForDb.__authPg = makeClient(process.env.AUTH_DATABASE_URL!));

/** RLS-subject Drizzle instance (use only via `withTenant`). */
export const appDb = drizzle(appPg, { schema });
/** BYPASSRLS Drizzle instance for auth flows only. */
export const authDb = drizzle(authPg, { schema });

export type TenantContext = {
  companyId: string;
  userId: string;
  role: schema.UserRole;
};

export type Tx = Parameters<Parameters<typeof appDb.transaction>[0]>[0];

/**
 * Run `fn` inside a transaction with the tenant context pinned via session GUCs,
 * so every statement is filtered by RLS to this company. Also gives atomicity.
 */
export async function withTenant<T>(
  ctx: TenantContext,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return appDb.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.current_company_id', ${ctx.companyId}, true)`,
    );
    await tx.execute(
      sql`select set_config('app.current_user_id', ${ctx.userId}, true)`,
    );
    await tx.execute(sql`select set_config('app.current_role', ${ctx.role}, true)`);
    return fn(tx);
  });
}

export { schema };
