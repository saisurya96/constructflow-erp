/**
 * Drop and recreate the public schema (full local reset).
 * Run with: npm run db:reset  (→ reset + push + rls + seed)
 */
import "dotenv/config";
import postgres from "postgres";
import { isLocalPg, pgOptions } from "./pg-options";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  // db:reset drops `schema public CASCADE` — catastrophic against a managed cloud
  // DB (Supabase keeps managed objects in public). Only allow it locally.
  if (!isLocalPg(url) && process.env.ALLOW_REMOTE_RESET !== "true") {
    throw new Error(
      "Refusing db:reset against a non-local database (it drops schema public CASCADE). " +
        "On Supabase, provision with `db:push` + `db:rls` instead. " +
        "Set ALLOW_REMOTE_RESET=true only if you truly mean it.",
    );
  }

  const sql = postgres(url, { ...pgOptions(url), max: 1 });
  await sql.unsafe(`
    drop schema if exists public cascade;
    create schema public;
    grant all on schema public to constructflow;
    grant all on schema public to constructflow_auth;
  `);
  await sql.end();
  console.log("✓ schema reset");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
