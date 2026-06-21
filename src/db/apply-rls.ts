/**
 * (Re)apply Row-Level Security policies. Idempotent.
 * Runs after `drizzle-kit push` has created/updated the tables.
 * Run with: npm run db:rls   (or as part of db:setup)
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { pgOptions } from "./pg-options";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const sql = postgres(url, { ...pgOptions(url), max: 1 });
  const rls = fs.readFileSync(path.join(process.cwd(), "src/db/rls.sql"), "utf8");
  await sql.unsafe(rls);
  await sql.end();
  console.log("✓ RLS policies applied");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
