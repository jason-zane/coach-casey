import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { generateCrossTrainingAckForActivity } from "@/app/actions/cross-training";

/**
 * Dev trigger for the cross-training acknowledgement pipeline. Mirrors
 * `/api/dev/debrief` — webhooks cannot reach localhost so this is the
 * path for exercising the pipeline end-to-end during development and
 * prompt iteration.
 *
 * Modes:
 *   GET /api/dev/cross-training?activity_id=<uuid>     — ack that activity
 *   GET /api/dev/cross-training?strava_id=<int>        — resolve by strava id
 *   GET /api/dev/cross-training?latest_non_run=1       — ack the most recent
 *                                                        non-run activity
 *   GET /api/dev/cross-training?...&force=1            — regenerate even if
 *                                                        one already exists
 *
 * Disabled in production.
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not available in production" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: athlete } = await supabase
    .from("athletes")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!athlete) {
    return NextResponse.json({ error: "no athlete" }, { status: 400 });
  }
  const athleteId = athlete.id as string;

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  let activityId = url.searchParams.get("activity_id");
  const stravaId = url.searchParams.get("strava_id");
  const latestNonRun = url.searchParams.get("latest_non_run");

  const admin = createAdminClient();

  if (!activityId && stravaId) {
    const { data } = await admin
      .from("activities")
      .select("id")
      .eq("athlete_id", athleteId)
      .eq("strava_id", Number(stravaId))
      .maybeSingle();
    activityId = (data as { id: string } | null)?.id ?? null;
    if (!activityId) {
      return NextResponse.json(
        { error: `no activity with strava_id=${stravaId} for this athlete` },
        { status: 404 },
      );
    }
  }

  if (!activityId && latestNonRun) {
    // Picks the most recent activity whose type does NOT contain "run".
    // Postgres ILIKE handles the case-insensitive match cheaply and the
    // athlete-scoped index keeps the scan tight.
    const { data } = await admin
      .from("activities")
      .select("id")
      .eq("athlete_id", athleteId)
      .not("activity_type", "ilike", "%run%")
      .order("start_date_local", { ascending: false })
      .limit(1)
      .maybeSingle();
    activityId = (data as { id: string } | null)?.id ?? null;
    if (!activityId) {
      return NextResponse.json(
        { error: "no non-run activities ingested for this athlete yet" },
        { status: 404 },
      );
    }
  }

  if (!activityId) {
    return NextResponse.json(
      {
        error:
          "Pass ?activity_id=<uuid>, ?strava_id=<int>, or ?latest_non_run=1. Use ?force=1 to regenerate.",
      },
      { status: 400 },
    );
  }

  try {
    const result = await generateCrossTrainingAckForActivity(athleteId, activityId, {
      force,
    });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
