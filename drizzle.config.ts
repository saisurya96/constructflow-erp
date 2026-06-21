import { defineConfig } from "drizzle-kit";
import "dotenv/config";
import { isLocalPg } from "./src/db/pg-options";

// Supabase (and most managed Postgres) require TLS; local dev does not. Append
// sslmode=require for remote hosts so `drizzle-kit push` connects over the
// session pooler without extra flags.
const raw = process.env.DATABASE_URL!;
const url =
  isLocalPg(raw) || /[?&]sslmode=/.test(raw)
    ? raw
    : `${raw}${raw.includes("?") ? "&" : "?"}sslmode=require`;

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  verbose: true,
  strict: true,
});
