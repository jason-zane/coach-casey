import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { recordAuditEvent } from "@/lib/audit/log";

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
 * Strava OAuth tokens are deliberately excluded, the athlete already has
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

  const { data: athlete, error: athleteError } = await admin
    .from("athletes")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (athleteError) {
    console.error("account export athlete lookup failed", athleteError);
    return NextResponse.json({ error: "export failed" }, { status: 500 });
  }

  if (!athlete) {
    return NextResponse.json({ error: "athlete not found" }, { status: 404 });
  }

  const athleteId = (athlete as { id: string }).id;

  type AnyRow = Record<string, unknown>;

  const fetchAll = async (table: string, columns = "*", order?: string) => {
    let q = admin.from(table).select(columns).eq("athlete_id", athleteId);
    if (order) q = q.order(order, { ascending: true });
    const { data, error } = await q;
    if (error) throw new Error(`export ${table} failed: ${error.message}`);
    return (data as unknown as AnyRow[] | null) ?? [];
  };

  let payload: Record<string, unknown>;
  try {
    // Strava connection, strip secrets.
    const { data: stravaConnRaw, error: stravaError } = await admin
      .from("strava_connections")
      .select("athlete_id, strava_athlete_id, scope, is_mock, connected_at, created_at, updated_at")
      .eq("athlete_id", athleteId)
      .maybeSingle();
    if (stravaError) throw new Error(`export strava connection failed: ${stravaError.message}`);

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
      fetchAll("activity_laps", "*", "lap_index"),
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
        .then(({ data, error }) => {
          if (error) throw new Error(`export preferences failed: ${error.message}`);
          return data ? [data] : [];
        }),
      fetchAll(
        "push_subscriptions",
        "endpoint, created_at, last_used_at, last_error_at, last_error_code",
      ),
      fetchAll("trials", "*", "started_at"),
    ]);

    payload = {
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
  } catch (err) {
    console.error("account export failed", err);
    return NextResponse.json({ error: "export failed" }, { status: 500 });
  }

  await recordAuditEvent({
    actorType: "athlete",
    actorId: athleteId,
    action: "account.export",
    targetAthleteId: athleteId,
  });

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
