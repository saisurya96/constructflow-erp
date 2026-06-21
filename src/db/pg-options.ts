/**
 * Shared postgres-js connection options, derived from the connection URL.
 *
 * No `server-only` here on purpose: this module is imported both by the Next.js
 * runtime (`client.ts`) and by the standalone DB scripts run with tsx
 * (`apply-rls`, `reset`, `seed`) plus `drizzle.config.ts`.
 *
 *  - Local Postgres (localhost / 127.0.0.1): no TLS, a roomy pool for dev.
 *  - Anything else (e.g. the Supabase pooler): TLS required, and a *small* pool —
 *    serverless functions multiply connections, so behind Supabase's transaction
 *    pooler you want ~1 per instance. Override with DB_POOL_MAX.
 *
 * `prepare: false` is mandatory behind the Supabase transaction pooler (it does
 * not support prepared statements) and harmless everywhere else, so it's always
 * on — it's also what `withTenant`'s per-transaction `set_config(..., true)`
 * needs to stay correct under transaction pooling.
 */

export function isLocalPg(url: string | undefined): boolean {
  return /@(localhost|127\.0\.0\.1|\[::1\]|::1)([:/]|$)/.test(url ?? "");
}

export function pgOptions(url: string | undefined) {
  const local = isLocalPg(url);
  const envMax = Number(process.env.DB_POOL_MAX);
  const max = Number.isFinite(envMax) && envMax > 0 ? envMax : local ? 10 : 1;
  return {
    max,
    idle_timeout: 20,
    prepare: false,
    ssl: local ? (false as const) : ("require" as const),
  };
}
