import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

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

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const got = request.headers.get("authorization");
    if (got !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }

  const admin = createAdminClient();
  const cutoff = new Date(
    Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: rows, error } = await admin
    .from("athletes")
    .select("id, user_id, deleted_at")
    .lt("deleted_at", cutoff);
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

  return NextResponse.json({
    candidates: candidates.length,
    purged,
    failures,
    cutoff,
  });
}
