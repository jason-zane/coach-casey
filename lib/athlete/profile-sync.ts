/**
 * Backfill missing Strava-sourced profile fields (sex, weight_kg) for an
 * athlete who connected before the callback gained profile-seed logic.
 *
 * Idempotent. Cheap to call on every athlete-page render: returns early
 * when both fields are already populated. Errors are swallowed and logged
 *, the athlete page must never fail because Strava is unreachable.
 */

import { createAdminClient } from "@/lib/supabase/server";
import { fetchAthleteProfile } from "@/lib/strava/client";

export async function backfillStravaProfile(
  athleteId: string,
): Promise<void> {
  const admin = createAdminClient();

  const [{ data: athlete }, { data: conn }] = await Promise.all([
    admin
      .from("athletes")
      .select("sex, weight_kg")
      .eq("id", athleteId)
      .single(),
    admin
      .from("strava_connections")
      .select("athlete_id, is_mock")
      .eq("athlete_id", athleteId)
      .maybeSingle(),
  ]);

  if (!athlete) return;
  if (!conn || conn.is_mock) return;
  if (athlete.sex && athlete.weight_kg != null) return;

  try {
    const profile = await fetchAthleteProfile(athleteId);
    if (!profile) return;

    const update: Record<string, unknown> = {};
    if (
      !athlete.sex &&
      (profile.sex === "M" || profile.sex === "F" || profile.sex === "X")
    ) {
      update.sex = profile.sex;
    }
    if (
      athlete.weight_kg == null &&
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
