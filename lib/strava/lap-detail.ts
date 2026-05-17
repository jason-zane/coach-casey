import { createAdminClient } from "@/lib/supabase/server";
import { fetchActivityDetail } from "./client";
import { mapStravaActivity } from "./ingest";

/**
 * Lazily fetch full detail for an activity that was pulled by the long-history
 * backfill (summaries only). The 2-year backfill deliberately skips the per-
 * activity detail endpoint to stay inside Strava's 100-reads-per-15-min
 * budget, fine for surface-level reasoning about volume and frequency,
 * but lap structure, splits, and best-efforts are needed when Casey is asked
 * something specific ("what was the workout pacing on March 14, 2024?").
 *
 * This function is the on-demand wiring point: callers (chat tool calls,
 * debrief regeneration on old activities, the paywall deep-backfill, anything
 * that needs lap-level detail for an old run) hand it the activity row id; it
 * checks the DB, fetches detail if absent, persists through `mapStravaActivity`
 * in `deep` mode (laps + splits + best_efforts, with the run-vs-ride trim
 * applied), and returns the laps.
 *
 * Idempotent: a row that already has a non-empty laps array short-circuits.
 * Errors are surfaced (returning ok:false with a logged warning) rather than
 * thrown, the caller usually wants to degrade to summary-only reasoning,
 * not crash.
 */
export async function ensureActivityLapDetail(
  activityId: string,
): Promise<{ ok: true; laps: unknown[] } | { ok: false; reason: string }> {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("activities")
    .select("id, athlete_id, strava_id, laps")
    .eq("id", activityId)
    .maybeSingle();
  if (!row) return { ok: false, reason: "not_found" };

  const a = row as {
    id: string;
    athlete_id: string;
    strava_id: number;
    laps: unknown;
  };

  if (Array.isArray(a.laps) && a.laps.length > 0) {
    return { ok: true, laps: a.laps };
  }

  try {
    const detail = await fetchActivityDetail(a.athlete_id, a.strava_id);
    // Route through the standard mapper in 'deep' mode so the same trim
    // rules apply (raw-blob whitelist, run-vs-ride column gating, split /
    // best-effort sub-field trim). Update the row in place rather than
    // upserting on (athlete_id, strava_id) so we keep the existing UUID
    // stable for downstream references (RPE answers, debrief messages).
    // athlete_id and strava_id round-trip to their existing values, which
    // is a no-op write.
    const row = mapStravaActivity(detail, a.athlete_id, detail.laps ?? null, "deep");

    await admin
      .from("activities")
      .update(row)
      .eq("id", activityId);

    const laps = Array.isArray(row.laps) ? (row.laps as unknown[]) : [];
    return { ok: true, laps };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch_failed";
    console.warn("ensureActivityLapDetail failed", activityId, msg);
    return { ok: false, reason: msg };
  }
}
