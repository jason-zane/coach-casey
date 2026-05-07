/**
 * Backfill missing Strava-sourced profile fields (sex, weight_kg) for an
 * athlete who connected before the callback gained profile-seed logic.
 *
 * Idempotent. Cheap to call on every athlete-page render: when the caller
 * already knows sex/weight_kg from a query they ran for other reasons, the
 * function returns without any database round trips at all. Only the rare
 * "needs backfill" path runs the conn lookup and the Strava fetch. Errors
 * are swallowed and logged, the athlete page must never fail because
 * Strava is unreachable.
 */

import { createAdminClient } from "@/lib/supabase/server";
import { fetchAthleteProfile } from "@/lib/strava/client";

export type ProfileSnapshot = {
  sex: string | null;
  weight_kg: number | null;
};

export async function backfillStravaProfile(
  athleteId: string,
  snapshot: ProfileSnapshot,
): Promise<void> {
  // Hot path: both fields populated. Bail with zero queries.
  if (snapshot.sex && snapshot.weight_kg != null) return;

  const admin = createAdminClient();

  const { data: conn } = await admin
    .from("strava_connections")
    .select("athlete_id, is_mock")
    .eq("athlete_id", athleteId)
    .maybeSingle<{ athlete_id: string; is_mock: boolean | null }>();

  if (!conn || conn.is_mock) return;

  try {
    const profile = await fetchAthleteProfile(athleteId);
    if (!profile) return;

    const update: Record<string, unknown> = {};
    if (
      !snapshot.sex &&
      (profile.sex === "M" || profile.sex === "F" || profile.sex === "X")
    ) {
      update.sex = profile.sex;
    }
    if (
      snapshot.weight_kg == null &&
      typeof profile.weight === "number" &&
      profile.weight > 20 &&
      profile.weight < 250
    ) {
      update.weight_kg = profile.weight;
    }
    if (Object.keys(update).length > 0) {
      await admin.from("athletes").update(update).eq("id", athleteId);
    }
  } catch (e) {
    console.warn(
      `[athlete-profile-sync] backfill failed for ${athleteId}`,
      e,
    );
  }
}
