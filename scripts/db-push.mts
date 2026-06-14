// One-command migration push to the Supabase database.
//
//   pnpm db:push          apply pending migrations in supabase/migrations
//   pnpm db:push:dry      show what would be applied, change nothing
//
// Resolves the direct (non-pooling) Postgres connection string, then runs the
// Supabase CLI against it. Resolution order:
//   1. $SUPABASE_DB_URL
//   2. $POSTGRES_URL_NON_POOLING
//   3. POSTGRES_URL_NON_POOLING in .env.production.local  (from `vercel env pull`)
//   4. POSTGRES_URL_NON_POOLING in .env.local
//
// The connection string is never printed; only the target host is shown. Run
// it from the checkout that has .env.production.local (the main checkout, not a
// worktree), or pass SUPABASE_DB_URL explicitly.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

function fromEnvFile(path: string, key: string): string | undefined {
  if (!existsSync(path)) return undefined;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[1] === key) {
      return m[2].replace(/^["']|["']$/g, "").trim();
    }
  }
  return undefined;
}

function resolveDbUrl(): string | undefined {
  return (
    process.env.SUPABASE_DB_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    fromEnvFile(".env.production.local", "POSTGRES_URL_NON_POOLING") ||
    fromEnvFile(".env.local", "POSTGRES_URL_NON_POOLING") ||
    undefined
  );
}

const dryRun = process.argv.includes("--dry-run");
const url = resolveDbUrl();

if (!url) {
  console.error(
    [
      "No database URL found.",
      "",
      "Run this from the checkout that has .env.production.local (so",
      "POSTGRES_URL_NON_POOLING is available), or set SUPABASE_DB_URL to the",
      "direct/non-pooling connection string and retry.",
    ].join("\n"),
  );
  process.exit(1);
}

let host = "(unknown host)";
try {
  host = new URL(url).host;
} catch {
  /* leave host label as-is; the CLI will surface a bad URL */
}
console.log(`Pushing migrations to ${host}${dryRun ? " (dry run)" : ""}`);

const args = ["db", "push", "--db-url", url];
if (dryRun) args.push("--dry-run");

const res = spawnSync("supabase", args, { stdio: "inherit" });
if (res.error) {
  console.error(
    "Could not run the Supabase CLI. Install it: https://supabase.com/docs/guides/cli",
  );
  process.exit(1);
}
process.exit(res.status ?? 1);
