import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { generateDebriefForActivity } from "@/app/actions/debrief";
import { generateCrossTrainingAckForActivity } from "@/app/actions/cross-training";
import { classifyActivityType } from "@/lib/strava/activity-types";

export const runtime = "nodejs";
export const maxDuration = 300; // give a full 5 minutes for the whole sweep

/**
 * Safety-net cron. The primary trigger for debriefs is the Strava webhook;
 * this endpoint catches debriefs the webhook missed — outage, dropped
 * retry, deploy bounced. It does NOT re-ingest activities: the webhook is
 * the single source of truth for ingest, and a missed ingest self-heals
 * on the next webhook event or when the user next opens the app.
 *
 * Schedule: every 30 minutes (configured in `vercel.json`). Scans
 * activities from the last 48h that don't yet have a `debrief` message
 * and triggers generation for each. Steady-state cost: zero Strava API
 * calls; only DB reads + an LLM call when a debrief is genuinely missing.
 *
 * Authorization: Vercel sets `Authorization: Bearer <CRON_SECRET>` on
 * scheduled invocations. We reject anything without it so the route
 * isn't a public side-effect trigger.
 */

const LOOKBACK_HOURS = 48;

type ActivityRow = {
  id: string;
  athlete_id: string;
  activity_type: string | null;
};

type MessageMetaRow = {
  meta: { activity_id?: string } | null;
};

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const got = request.headers.get("authorization");
    if (got !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    // Fail closed in production if no secret is configured — better to
    // surface "not configured" than to expose a trigger.
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }

  const admin = createAdminClient();
  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000);

  const { data: activities, error: actErr } = await admin
    .from("activities")
    .select("id, athlete_id, activity_type")
    .gte("start_date_local", since.toISOString())
    .order("start_date_local", { ascending: true });
  if (actErr) {
    return NextResponse.json({ error: actErr.message }, { status: 500 });
  }

  const recent = (activities ?? []) as ActivityRow[];
  if (recent.length === 0) {
    return NextResponse.json({
      ok: true,
      activitiesScanned: 0,
      runDebriefs: { attempted: 0, created: 0, skipped: 0 },
      crossTrainingAcks: { attempted: 0, created: 0, skipped: 0 },
      errors: [],
    });
  }

  // Find which of these activities already have a Casey-authored message
  // (debrief or cross-training ack). The partial unique indexes catch any
  // race; this filter is the optimisation that avoids paying for context
  // assembly when the work is already done.
  const { data: existing, error: existingErr } = await admin
    .from("messages")
    .select("meta")
    .in("kind", ["debrief", "cross_training_ack", "cross_training_substitution"])
    .gte("created_at", since.toISOString());
  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }

  const activityIds = new Set(recent.map((a) => a.id));
  const handled = new Set<string>();
  for (const row of (existing ?? []) as MessageMetaRow[]) {
    const id = row.meta?.activity_id;
    if (typeof id === "string" && activityIds.has(id)) {
      handled.add(id);
    }
  }
  const missing = recent.filter((a) => !handled.has(a.id));

  const runStats = { attempted: 0, created: 0, skipped: 0 };
  const ctStats = { attempted: 0, created: 0, skipped: 0 };
  const errors: Array<{ activityId: string; error: string }> = [];

  for (const a of missing) {
    const cls = classifyActivityType(a.activity_type);
    try {
      if (cls === "run") {
        runStats.attempted += 1;
        const result = await generateDebriefForActivity(a.athlete_id, a.id);
        if (result.kind === "created") runStats.created += 1;
        else runStats.skipped += 1;
      } else if (cls === "cross_training" || cls === "catch_all") {
        ctStats.attempted += 1;
        const result = await generateCrossTrainingAckForActivity(a.athlete_id, a.id);
        if (result.kind === "created") ctStats.created += 1;
        else ctStats.skipped += 1;
      }
      // ambient: no thread message; nothing for the cron to do.
    } catch (e) {
      errors.push({
        activityId: a.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    activitiesScanned: recent.length,
    runDebriefs: runStats,
    crossTrainingAcks: ctStats,
    errors,
  });
}
