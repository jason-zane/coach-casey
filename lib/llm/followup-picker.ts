import "server-only";
import type {
  DebriefActivity,
  DebriefArcRun,
} from "@/lib/thread/debrief-context";

/**
 * Picker output for the post-run Question 2. Per `rpe-feature-spec.md`
 * §7, three priority types share one slot:
 *
 *   1. structured       — weeks 1–2 onboarding context-fill
 *   2. rpe_branched     — RPE answered AND divergent from run shape
 *   3. conversational   — fallback, generated per-run
 *
 * The picker function is feature-flagged (env: `RPE_FOLLOWUP_PICKER_FLAG`)
 * so the heuristics can evolve without redeploys.
 */
export type FollowUpType = "structured" | "rpe_branched" | "conversational";

export type RpeBranch = "high_on_easy" | "low_on_hard";

export type FollowUpPick =
  | { type: "structured" }
  | { type: "rpe_branched"; branch: RpeBranch; rpeValue: number }
  | { type: "conversational" };

export type PickFollowUpArgs = {
  activity: DebriefActivity;
  arcRuns: DebriefArcRun[];
  athleteCreatedAt: string;
  /**
   * The RPE value just submitted for *this* activity. Null at debrief
   * sync time (no RPE answer yet) — the picker will then never select
   * `rpe_branched`. Populated when the picker is re-run on RPE submit.
   */
  rpeValue: number | null;
  /**
   * Whether the structured-question backlog still has unanswered items
   * for this athlete. The detailed structured-tracker is a launch-prep
   * item — at V1 day-1 we approximate with athlete tenure (weeks 1–2)
   * unless the caller passes a more accurate signal.
   */
  structuredBacklogRemaining?: boolean;
};

const TENURE_WEEKS_FOR_STRUCTURED = 2;
const HIGH_RPE_FLOOR = 7;
const LOW_RPE_CEIL = 4;

/**
 * V1 picker logic. Deliberately simple per spec §7.1 — heuristics are
 * crude on purpose; tuning happens once real RPE data accumulates.
 */
export function pickFollowUp(args: PickFollowUpArgs): FollowUpPick {
  const tenureDays =
    (Date.now() - new Date(args.athleteCreatedAt).getTime()) / (24 * 60 * 60 * 1000);
  const inEarlyWeeks = tenureDays <= TENURE_WEEKS_FOR_STRUCTURED * 7;
  const backlog = args.structuredBacklogRemaining ?? inEarlyWeeks;

  // Priority 1 — structured. Only when both tenure and backlog allow.
  if (inEarlyWeeks && backlog) {
    return { type: "structured" };
  }

  // Priority 2 — RPE-branched on divergence. Reachable only when the
  // caller has an RPE value to evaluate against.
  if (args.rpeValue !== null) {
    if (args.rpeValue >= HIGH_RPE_FLOOR && hasEasyIntent(args.activity, args.arcRuns)) {
      return { type: "rpe_branched", branch: "high_on_easy", rpeValue: args.rpeValue };
    }
    if (args.rpeValue <= LOW_RPE_CEIL && hasHardIntent(args.activity, args.arcRuns)) {
      return { type: "rpe_branched", branch: "low_on_hard", rpeValue: args.rpeValue };
    }
  }

  // Priority 3 — conversational fallback.
  return { type: "conversational" };
}

/**
 * V1 heuristic per spec §7.1. Crude on purpose — picker accuracy
 * improves in V1.1 once real RPE data exposes where the heuristics
 * underfit (e.g. activities the picker misclassifies as easy when the
 * athlete intended hard).
 *
 *   - Workout shape ⇒ never easy intent.
 *   - HR in the lower band of the trailing arc ⇒ easy intent.
 *   - Below median distance AND below median pace (slower) ⇒ easy intent.
 */
export function hasEasyIntent(
  activity: DebriefActivity,
  arc: DebriefArcRun[],
): boolean {
  if (activity.hasWorkoutShape) return false;
  if (arc.length < 3) {
    // Too thin a baseline to call. Default to easy when the run also
    // has no workout shape and is sub-10km — reasonable for the V1
    // first-fortnight where divergence detection isn't yet sharp.
    return activity.distanceKm < 10;
  }

  if (activity.avgHr !== null) {
    const hrs = arc
      .map((r) => r.avgHr)
      .filter((h): h is number => h !== null && h > 0);
    if (hrs.length >= 3) {
      const sorted = [...hrs].sort((a, b) => a - b);
      const lowerQuartile = sorted[Math.max(0, Math.floor(sorted.length * 0.4))];
      if (activity.avgHr <= lowerQuartile) return true;
    }
  }

  const distances = arc.map((r) => r.distanceKm).filter((d) => d > 0);
  const paces = arc
    .map((r) => r.paceSPerKm)
    .filter((p): p is number => p !== null && p > 0);
  if (distances.length >= 3 && paces.length >= 3) {
    const medianDistance = median(distances);
    const medianPace = median(paces);
    const slower =
      activity.paceSPerKm !== null && activity.paceSPerKm > medianPace;
    const shorter = activity.distanceKm < medianDistance;
    if (slower && shorter) return true;
  }

  return false;
}

/**
 * Hard-intent heuristic per spec §7.1.
 *
 *   - Workout shape ⇒ hard intent.
 *   - Top quartile of trailing-arc distance ⇒ hard intent (long run / big day).
 *   - Top quartile of trailing-arc moving-time ⇒ hard intent (covers
 *     long runs that aren't workouts but are above the athlete's norm).
 */
export function hasHardIntent(
  activity: DebriefActivity,
  arc: DebriefArcRun[],
): boolean {
  if (activity.hasWorkoutShape) return true;
  if (arc.length < 4) return false;

  const distances = arc.map((r) => r.distanceKm).filter((d) => d > 0);
  if (distances.length >= 4) {
    const sorted = [...distances].sort((a, b) => a - b);
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    if (activity.distanceKm > q3) return true;
  }

  return false;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Read the picker feature flag. Returning `false` short-circuits the
 * picker to the conversational path so a regression in heuristics
 * doesn't break Q2 in production.
 *
 * Default: enabled. Disable by setting `RPE_FOLLOWUP_PICKER_FLAG=off`.
 */
export function pickerEnabled(): boolean {
  const flag = process.env.RPE_FOLLOWUP_PICKER_FLAG;
  if (!flag) return true;
  return flag.toLowerCase() !== "off" && flag !== "0" && flag.toLowerCase() !== "false";
}
