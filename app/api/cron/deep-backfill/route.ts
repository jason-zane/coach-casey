import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  announceDeepBackfillComplete,
  runDeepBackfillSliceForAthlete,
} from "@/lib/strava/deep-backfill";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Resume deep backfills queued at paid conversion.
 *
 * Picks up athletes with status='pending' or 'error' (with backoff implicit
 * in the cron cadence), runs one slice each (5 activities), then posts a
 * one-time chat announcement when an athlete's deep backfill lands.
 *
 * Pacing is deliberately gentle. At 5 activities per slice × 24 hourly cron
 * passes = 120 activities/day max per athlete, a typical 2-year history
 * (500-700 runs) completes in ~6 days. This leaves comfortable headroom in
 * Strava's 100-reads-per-15-min / 1000-reads-per-day per-token budget for
 * the foreground 12-week ingest, the chat refresh tool, and the long-history
 * backfill cursor walk.
 *
 * Schedule: every hour at :40 (vercel.json), staggered from the
 * history-backfill cron at :15.
 *
 * Authorization mirrors history-backfill: Bearer CRON_SECRET in production.
 */

const MAX_ATHLETES_PER_PASS = 10;

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
    .select("id, deep_backfill_status")
    .in("deep_backfill_status", ["pending", "error"])
    .order("deep_backfill_started_at", { ascending: true, nullsFirst: true })
    .limit(MAX_ATHLETES_PER_PASS);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const athletes = (queued ?? []) as Array<{
    id: string;
    deep_backfill_status: string;
  }>;

  const results: Array<{
    athleteId: string;
    status: "ok" | "error";
    complete: boolean;
    deepened: number;
    rateLimited?: boolean;
    error?: string;
  }> = [];

  for (const a of athletes) {
    const r = await runDeepBackfillSliceForAthlete(a.id);
    if (r.status === "ok" && r.complete) {
      await announceDeepBackfillComplete(a.id);
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
