/**
 * Drop and recreate the public schema (full local reset).
 * Run with: npm run db:reset  (→ reset + push + rls + seed)
 */
import "dotenv/config";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const sql = postgres(url, { max: 1 });
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
