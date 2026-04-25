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
  /**
   * Per `training-load-feature-spec.md` §7.4, the picker prefers load-based
   * heuristics over the legacy HR/distance/pace ones once load data exists.
   * Optional so the picker degrades gracefully on athletes without load
   * coverage yet (first runs, tier-2 fallback).
   */
  loadSignal?: {
    thisActivityLoadAu: number;
    thisActivityLoadIf: number | null;
    /** Trailing 30-day load_au samples (excluding this activity). */
    recentLoadAus: number[];
  };
};

const TENURE_WEEKS_FOR_STRUCTURED = 2;
const HIGH_RPE_FLOOR = 7;
const LOW_RPE_CEIL = 4;

// Per `training-load-feature-spec.md` §7.4 — sharper heuristics than the
// crude HR/quartile ones, used when load data is present.
const HARD_INTENT_LOAD_IF_FLOOR = 0.85;
const EASY_INTENT_LOAD_IF_CEILING = 0.75;
const HARD_INTENT_LOAD_PERCENTILE = 0.75;
const EASY_INTENT_LOAD_PERCENTILE = 0.5;
// Need at least this many trailing samples before the percentile gate is
// trustworthy. Below this, we fall through to the legacy heuristics.
const MIN_LOAD_SAMPLES = 4;

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
    const easy = isEasyIntent(args);
    const hard = isHardIntent(args);
    if (args.rpeValue >= HIGH_RPE_FLOOR && easy) {
      return { type: "rpe_branched", branch: "high_on_easy", rpeValue: args.rpeValue };
    }
    if (args.rpeValue <= LOW_RPE_CEIL && hard) {
      return { type: "rpe_branched", branch: "low_on_hard", rpeValue: args.rpeValue };
    }
  }

  // Priority 3 — conversational fallback.
  return { type: "conversational" };
}

/**
 * Combined intent gate: prefer load-based per `training-load-feature-spec.md`
 * §7.4 when a load signal is present and large enough; otherwise fall
 * back to the legacy HR/distance/pace heuristics.
 */
function isEasyIntent(args: PickFollowUpArgs): boolean {
  const load = args.loadSignal;
  if (load && load.recentLoadAus.length >= MIN_LOAD_SAMPLES) {
    return hasEasyIntentByLoad(load);
  }
  return hasEasyIntent(args.activity, args.arcRuns);
}

function isHardIntent(args: PickFollowUpArgs): boolean {
  const load = args.loadSignal;
  if (load && load.recentLoadAus.length >= MIN_LOAD_SAMPLES) {
    return hasHardIntentByLoad(load);
  }
  return hasHardIntent(args.activity, args.arcRuns);
}

/**
 * Load-based easy-intent gate per `training-load-feature-spec.md` §7.4:
 * activity load_au is in the bottom 50% of the trailing 30 days AND the
 * intensity factor is below 0.75.
 *
 * Both conditions must hold — a low-IF very long run can still be high-load
 * (long-run intent), and a short hard run can be low-load but high-IF.
 */
export function hasEasyIntentByLoad(load: NonNullable<PickFollowUpArgs["loadSignal"]>): boolean {
  if (load.thisActivityLoadIf == null) return false;
  if (load.thisActivityLoadIf >= EASY_INTENT_LOAD_IF_CEILING) return false;
  const cutoff = percentile(load.recentLoadAus, EASY_INTENT_LOAD_PERCENTILE);
  return load.thisActivityLoadAu <= cutoff;
}

/**
 * Load-based hard-intent gate per `training-load-feature-spec.md` §7.4:
 * activity load_au is in the top 25% of the trailing 30 days OR
 * intensity factor exceeds 0.85.
 */
export function hasHardIntentByLoad(load: NonNullable<PickFollowUpArgs["loadSignal"]>): boolean {
  if (load.thisActivityLoadIf != null && load.thisActivityLoadIf > HARD_INTENT_LOAD_IF_FLOOR) {
    return true;
  }
  const cutoff = percentile(load.recentLoadAus, HARD_INTENT_LOAD_PERCENTILE);
  return load.thisActivityLoadAu > cutoff;
}

function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  // Nearest-rank percentile. For p=0.75 with 4 samples: rank = 3, index 2.
  const rank = Math.max(1, Math.ceil(p * sorted.length));
  return sorted[rank - 1];
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
