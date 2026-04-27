import "server-only";
import { classifyActivityType } from "@/lib/strava/activity-types";
import { MIN_ACTIVITY_SECONDS } from "./types";

export type EligibilityActivity = {
  activityType: string | null;
  movingTimeS: number | null;
};

/**
 * Pure activity-shape eligibility. Does not consider per-athlete pause —
 * that check sits in the server action / fetcher path so it can read
 * fresh state from the athletes row.
 *
 * RPE fires on any activity the product generates a thread message for —
 * runs (debrief pipeline), cross-training (ack pipeline), and the
 * catch-all path. Ambient-only activities (walks) are excluded: they
 * generate no thread message, so there's nothing to attach an RPE
 * picker to. See docs/post-run-debrief-moment.md §4 and §7.
 */
export function isEligibleActivity(a: EligibilityActivity): boolean {
  if (!a.movingTimeS || a.movingTimeS < MIN_ACTIVITY_SECONDS) return false;
  const cls = classifyActivityType(a.activityType);
  return cls === "run" || cls === "cross_training" || cls === "catch_all";
}
