import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { verifyCronSecret } from "@/lib/auth/cron";
import { recordCronRun } from "@/lib/observability/cron";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Daily account-purge cron. Hard-deletes athletes whose `deleted_at` is
 * older than the 30-day soft-delete window.
 *
 * Mechanism: call `supabase.auth.admin.deleteUser(user_id)`. The
 * auth.users → athletes foreign key is `ON DELETE CASCADE`, and every
 * athlete-owned table cascades from athletes, so removing the auth user
 * removes everything. Documented in the Privacy Policy.
 *
 * Schedule: 03:30 UTC daily (configured in vercel.json).
 *
 * Authorization: Vercel sets `Authorization: Bearer <CRON_SECRET>` on
 * scheduled invocations. We reject anything without it so the route
 * isn't a public side-effect trigger.
 */

const RETENTION_DAYS = 30;
// Safety cap: never hard-delete more than this many accounts in a single run.
// The daily cadence drains a legitimate backlog over a few days while bounding
// the blast radius if deleted_at were ever set en masse by mistake.
const MAX_PURGE_PER_RUN = 50;

export async function GET(request: Request) {
  const denied = verifyCronSecret(request);
  if (denied) return denied;
  return recordCronRun("account-purge", () => handleAccountPurge());
}

async function handleAccountPurge(): Promise<NextResponse> {

  const admin = createAdminClient();
  const cutoff = new Date(
    Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: rows, error } = await admin
    .from("athletes")
    .select("id, user_id, deleted_at")
    .lt("deleted_at", cutoff)
    .order("deleted_at", { ascending: true })
    .limit(MAX_PURGE_PER_RUN);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const candidates = (rows ?? []) as Array<{
    id: string;
    user_id: string;
    deleted_at: string;
  }>;

  let purged = 0;
  const failures: Array<{ user_id: string; error: string }> = [];

  for (const row of candidates) {
    try {
      const { error: delErr } = await admin.auth.admin.deleteUser(row.user_id);
      if (delErr) {
        failures.push({ user_id: row.user_id, error: delErr.message });
        continue;
      }
      purged += 1;
    } catch (err) {
      failures.push({
        user_id: row.user_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const cappedAtLimit = candidates.length === MAX_PURGE_PER_RUN;
  if (cappedAtLimit) {
    console.warn(
      `[account-purge] hit MAX_PURGE_PER_RUN=${MAX_PURGE_PER_RUN}; more accounts remain and will continue on the next run`,
    );
  }

  return NextResponse.json({
    candidates: candidates.length,
    purged,
    failures,
    cappedAtLimit,
    cutoff,
  });
}
