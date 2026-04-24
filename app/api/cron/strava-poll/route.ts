import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { ingestLiveActivitiesForAthlete } from "@/lib/strava/ingest";
import { generateDebriefForActivity } from "@/app/actions/debrief";

export const runtime = "nodejs";
export const maxDuration = 300; // give a full 5 minutes for the whole sweep

/**
 * Safety-net cron. The primary trigger for debriefs is the Strava webhook;
 * this endpoint exists so a missed webhook (outage, dropped retry, our
 * deploy bounced) doesn't mean the athlete never gets a debrief.
 *
 * Schedule: every 30 minutes (configured in `vercel.json`). For each
 * athlete with a live Strava connection, pulls the last 2 days of
 * activities and triggers `generateDebriefForActivity` for each. The
 * server action is idempotent, so already-debriefed activities are a
 * no-op.
 *
 * Authorization: Vercel sets `Authorization: Bearer <CRON_SECRET>` on
 * scheduled invocations. We reject anything without it so the route
 * isn't a public side-effect trigger.
 */

type Connection = {
  athlete_id: string;
  is_mock: boolean;
  access_token: string | null;
};

type ActivityLite = {
  id: string;
};

const POLL_WEEKS = 1; // look back 7 days per sweep
const PER_ATHLETE_SLEEP_MS = 500; // gentle pacing across athletes

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
  const { data: conns, error } = await admin
    .from("strava_connections")
    .select("athlete_id, is_mock, access_token")
    .eq("is_mock", false)
    .not("access_token", "is", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const connections = (conns ?? []) as Connection[];

  let activitiesIngested = 0;
  let debriefsAttempted = 0;
  let debriefsCreated = 0;
  let debriefsSkipped = 0;
  let debriefsExisted = 0;
  const athleteErrors: Array<{ athleteId: string; error: string }> = [];

  for (const conn of connections) {
    try {
      const n = await ingestLiveActivitiesForAthlete(conn.athlete_id, POLL_WEEKS);
      activitiesIngested += n ?? 0;

      const since = new Date();
      since.setDate(since.getDate() - POLL_WEEKS * 7);
      const { data: recent } = await admin
        .from("activities")
        .select("id")
        .eq("athlete_id", conn.athlete_id)
        .gte("start_date_local", since.toISOString())
        .order("start_date_local", { ascending: true });

      for (const a of (recent ?? []) as ActivityLite[]) {
        debriefsAttempted += 1;
        try {
          const result = await generateDebriefForActivity(conn.athlete_id, a.id);
          if (result.kind === "created") debriefsCreated += 1;
          else if (result.kind === "exists") debriefsExisted += 1;
          else debriefsSkipped += 1;
        } catch (e) {
          athleteErrors.push({
            athleteId: conn.athlete_id,
            error: `debrief ${a.id}: ${e instanceof Error ? e.message : String(e)}`,
          });
        }
      }
    } catch (e) {
      athleteErrors.push({
        athleteId: conn.athlete_id,
        error: `ingest: ${e instanceof Error ? e.message : String(e)}`,
      });
    }

    await new Promise((r) => setTimeout(r, PER_ATHLETE_SLEEP_MS));
  }

  return NextResponse.json({
    ok: true,
    athletesChecked: connections.length,
    activitiesIngested,
    debriefsAttempted,
    debriefsCreated,
    debriefsExisted,
    debriefsSkipped,
    athleteErrors,
  });
}
