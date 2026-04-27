import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  announceBackfillComplete,
  runHistoryBackfillForAthlete,
} from "@/lib/strava/backfill";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Resume long-history Strava backfills queued at onboarding completion.
 *
 * Picks up athletes with status='pending' or 'error' (with backoff implicit
 * in the cron cadence), runs one slice each, then posts a one-time chat
 * announcement when a backfill lands. We bound the per-pass athlete count
 * so a sudden onboarding spike doesn't blow our 5-minute function budget.
 *
 * Schedule: every hour (vercel.json). Most backfills complete in a single
 * pass since the list-only Strava endpoint is cheap (1 call per 100
 * activities), so this is light traffic.
 *
 * Authorization mirrors strava-poll: Bearer CRON_SECRET in production.
 */

const MAX_ATHLETES_PER_PASS = 25;

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
  const { data: queued, error } = await admin
    .from("athletes")
    .select("id, history_backfill_status")
    .in("history_backfill_status", ["pending", "error"])
    .order("history_backfill_started_at", { ascending: true, nullsFirst: true })
    .limit(MAX_ATHLETES_PER_PASS);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const athletes = (queued ?? []) as Array<{
    id: string;
    history_backfill_status: string;
  }>;

  const results: Array<{
    athleteId: string;
    status: "ok" | "error";
    complete: boolean;
    rowsUpserted: number;
    error?: string;
  }> = [];

  for (const a of athletes) {
    const r = await runHistoryBackfillForAthlete(a.id);
    // Only announce when the full backfill finishes — partial slices that
    // hit the page cap continue across cron passes and shouldn't trigger
    // the "I've now read…" message until everything is in.
    if (r.status === "ok" && r.complete) {
      await announceBackfillComplete(a.id, r.rowsUpserted);
    }
    results.push({ athleteId: a.id, ...r });
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    succeeded: results.filter((r) => r.status === "ok" && r.complete).length,
    progressed: results.filter((r) => r.status === "ok" && !r.complete).length,
    failed: results.filter((r) => r.status === "error").length,
    results,
  });
}
