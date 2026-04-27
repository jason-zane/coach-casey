import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Athlete data export. Returns a JSON dump of every row Coach Casey holds
 * about the requesting athlete. Required by Privacy Policy commitments
 * and by GDPR / UK GDPR / CCPA / Privacy Act portability rights.
 *
 * Auth: Supabase session cookie. Admin client is used to read the full
 * set; we still scope every query by the resolved athlete_id so we can
 * never accidentally return another athlete's data.
 *
 * Strava OAuth tokens are deliberately excluded — the athlete already has
 * their data on Strava and exposing the access token serves no
 * portability purpose.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: athlete } = await admin
    .from("athletes")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!athlete) {
    return NextResponse.json({ error: "athlete not found" }, { status: 404 });
  }

  const athleteId = (athlete as { id: string }).id;

  type AnyRow = Record<string, unknown>;

  const fetchAll = async (table: string, columns = "*", order?: string) => {
    let q = admin.from(table).select(columns).eq("athlete_id", athleteId);
    if (order) q = q.order(order, { ascending: true });
    const { data } = await q;
    return (data as AnyRow[] | null) ?? [];
  };

  // Strava connection — strip secrets.
  const { data: stravaConnRaw } = await admin
    .from("strava_connections")
    .select("athlete_id, strava_athlete_id, scope, is_mock, connected_at, created_at, updated_at")
    .eq("athlete_id", athleteId)
    .maybeSingle();

  const [
    activities,
    activityLaps,
    messages,
    memoryItems,
    validationObservations,
    trainingPlans,
    goalRaces,
    preferences,
    pushSubscriptions,
    trials,
  ] = await Promise.all([
    fetchAll("activities", "*", "start_date_local"),
    fetchAll("activity_laps", "*", "lap_index").catch(() => []),
    fetchAll("messages", "*", "created_at"),
    fetchAll("memory_items", "*", "created_at"),
    fetchAll("validation_observations", "*", "sequence_idx"),
    fetchAll("training_plans", "*", "created_at"),
    fetchAll("goal_races", "*", "race_date"),
    admin
      .from("preferences")
      .select("*")
      .eq("athlete_id", athleteId)
      .maybeSingle()
      .then((r) => (r.data ? [r.data] : [])),
    fetchAll("push_subscriptions", "endpoint, created_at, last_success_at, last_failure_at").catch(
      () => [],
    ),
    fetchAll("trials", "*", "started_at"),
  ]);

  const payload = {
    export_metadata: {
      generated_at: new Date().toISOString(),
      coach_casey_export_version: 1,
      athlete_id: athleteId,
      notes:
        "Full athlete-owned data export. Strava OAuth tokens are excluded. " +
        "See Privacy Policy at /privacy for context on retention and deletion.",
    },
    athlete,
    strava_connection: stravaConnRaw ?? null,
    activities,
    activity_laps: activityLaps,
    messages,
    memory_items: memoryItems,
    validation_observations: validationObservations,
    training_plans: trainingPlans,
    goal_races: goalRaces,
    preferences: preferences[0] ?? null,
    push_subscriptions: pushSubscriptions,
    trials,
  };

  const filename = `coach-casey-export-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
