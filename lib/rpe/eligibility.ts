import "server-only";
import { MIN_ACTIVITY_SECONDS } from "./types";

/**
 * Activity types we capture RPE for. Per spec §10, RPE is valid for any
 * aerobic activity — runs, rides, swims. The current product only ingests
 * runs from Strava, but the gate is permissive so the same surface works
 * if/when ride/swim ingest comes online.
 */
const ELIGIBLE_TYPE_TOKENS = ["run", "ride", "cycle", "swim"];

export type EligibilityActivity = {
  activityType: string | null;
  movingTimeS: number | null;
};

/**
 * Pure activity-shape eligibility. Does not consider per-athlete pause —
 * that check sits in the server action / fetcher path so it can read
 * fresh state from the athletes row.
 */
export function isEligibleActivity(a: EligibilityActivity): boolean {
  if (!a.movingTimeS || a.movingTimeS < MIN_ACTIVITY_SECONDS) return false;
  const type = (a.activityType ?? "").toLowerCase();
  if (!type) return true; // Manual / no-type activities still get prompted.
  return ELIGIBLE_TYPE_TOKENS.some((t) => type.includes(t));
}
