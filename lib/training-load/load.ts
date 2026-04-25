/**
 * Per-activity training load calculation.
 *
 * Three tiers, in priority order (spec §4):
 *   1. pace_rtss          — run with a known threshold pace from the current
 *                            profile_snapshots row.
 *   2. duration_default   — run with no threshold yet; fixed-IF placeholder.
 *   3. cross_training     — non-run aerobic/strength activity; minutes ×
 *                            type-specific IF constant.
 *
 * Pure: no DB access, no side effects. The repository layer
 * (`snapshots.ts`, `recalc.ts`) supplies the activity row and the
 * applicable snapshot, then writes the result back to activity_notes.
 */

import { classifyActivityType } from "@/lib/strava/activity-types";

export type LoadMethod = "pace_rtss" | "duration_default" | "cross_training";

export type LoadResult = {
  loadAu: number;
  loadMethod: LoadMethod;
  /** IF used in the calculation, clamped per spec §4.1. Null for cross-training. */
  loadIf: number | null;
};

export type LoadActivityInput = {
  activityType: string | null;
  movingTimeS: number | null;
  /** Average pace in seconds per km (raw, not GAP). */
  avgPaceSPerKm: number | null;
  /** Grade-adjusted pace in s/km. Null when unavailable; raw pace is the fallback. */
  gapSecPerKm?: number | null;
  /**
   * Strava workout_type: 1=race, 2=long, 3=workout. Used to flag multi-sport
   * activities (treated as cross-training with a generic IF).
   */
  stravaWorkoutType?: number | null;
};

export type ThresholdInput = {
  thresholdPaceSecPerKm: number | null;
};

// LAUNCH_PREP_PLACEHOLDER — tier-2 default IF. See spec §4.2 + §11.
export const DEFAULT_TIER_2_IF = 0.7;

// LAUNCH_PREP_PLACEHOLDER — cross-training IF defaults. Reasoned guesses
// only; coaching review at launch-prep. See spec §4.3 + §11.
export const CROSS_TRAINING_IF: Record<string, number> = {
  Ride: 0.55,
  VirtualRide: 0.55,
  EBikeRide: 0.45,
  Swim: 0.55,
  WeightTraining: 0.45,
  Workout: 0.45,
  Yoga: 0.3,
  Pilates: 0.35,
  Walk: 0.2,
  Hike: 0.4,
  Rowing: 0.55,
  // LAUNCH_PREP_PLACEHOLDER — generic fallback for any unknown / catch-all
  // activity type. Conservative middle of the road.
  Other: 0.4,
};

export const IF_CLAMP_MIN = 0.4;
export const IF_CLAMP_MAX = 1.5;

function clampIf(raw: number): number {
  if (raw < IF_CLAMP_MIN) return IF_CLAMP_MIN;
  if (raw > IF_CLAMP_MAX) return IF_CLAMP_MAX;
  return raw;
}

function lookupCrossTrainingIf(activityType: string | null): number {
  if (!activityType) return CROSS_TRAINING_IF.Other;
  // Match Strava's casing first so the table reads cleanly.
  if (CROSS_TRAINING_IF[activityType] != null) {
    return CROSS_TRAINING_IF[activityType];
  }
  // Case-insensitive fallback for Strava variants that drift in capitalisation.
  const key = Object.keys(CROSS_TRAINING_IF).find(
    (k) => k.toLowerCase() === activityType.toLowerCase(),
  );
  return key ? CROSS_TRAINING_IF[key] : CROSS_TRAINING_IF.Other;
}

/**
 * Run the load calculator. Returns null when the activity has no usable
 * inputs (no duration, no pace, etc.) — the caller writes nulls into
 * activity_notes in that case rather than failing loud (spec §4.6).
 */
export function calculateLoad(
  activity: LoadActivityInput,
  threshold: ThresholdInput,
): LoadResult | null {
  const duration = activity.movingTimeS;
  if (!duration || duration <= 0) return null;

  // Multi-sport flag (Strava workout_type doesn't actually carry triathlon
  // info today, but the spec's edge case anticipates a future field).
  // Treated as cross-training with a generic IF per §4.6.
  if (activity.stravaWorkoutType === 4) {
    const minutes = duration / 60;
    return {
      loadAu: round1(minutes * 0.55),
      loadMethod: "cross_training",
      loadIf: null,
    };
  }

  const cls = classifyActivityType(activity.activityType);

  if (cls === "run") {
    return calculateRunLoad(duration, activity, threshold);
  }

  // cross_training, ambient, catch_all → all flow through the cross-training
  // tier. Walks ("ambient") still get a load number so weekly volume is
  // honest; the debrief gate is a separate concern.
  const minutes = duration / 60;
  const activityIf = lookupCrossTrainingIf(activity.activityType);
  return {
    loadAu: round1(minutes * activityIf),
    loadMethod: "cross_training",
    loadIf: null,
  };
}

function calculateRunLoad(
  durationS: number,
  activity: LoadActivityInput,
  threshold: ThresholdInput,
): LoadResult | null {
  // Tier 2 — no threshold. Fixed-IF placeholder per spec §4.2.
  if (
    threshold.thresholdPaceSecPerKm == null ||
    !Number.isFinite(threshold.thresholdPaceSecPerKm) ||
    threshold.thresholdPaceSecPerKm <= 0
  ) {
    return {
      loadAu: round1((durationS * DEFAULT_TIER_2_IF * DEFAULT_TIER_2_IF) / 36),
      loadMethod: "duration_default",
      loadIf: DEFAULT_TIER_2_IF,
    };
  }

  // Tier 1 — pace-based rTSS.
  const gap = pickPace(activity);
  if (gap == null) {
    // No usable pace — fall back to tier 2 rather than emit nothing. The
    // run still happened; tier 2 gives a defensible number.
    return {
      loadAu: round1((durationS * DEFAULT_TIER_2_IF * DEFAULT_TIER_2_IF) / 36),
      loadMethod: "duration_default",
      loadIf: DEFAULT_TIER_2_IF,
    };
  }

  const rawIf = threshold.thresholdPaceSecPerKm / gap;
  const intensity = clampIf(rawIf);
  const loadAu = (durationS * intensity * intensity) / 36;
  return {
    loadAu: round1(loadAu),
    loadMethod: "pace_rtss",
    loadIf: round3(intensity),
  };
}

function pickPace(activity: LoadActivityInput): number | null {
  if (activity.gapSecPerKm != null && Number.isFinite(activity.gapSecPerKm) && activity.gapSecPerKm > 0) {
    return activity.gapSecPerKm;
  }
  if (
    activity.avgPaceSPerKm != null &&
    Number.isFinite(activity.avgPaceSPerKm) &&
    activity.avgPaceSPerKm > 0
  ) {
    return activity.avgPaceSPerKm;
  }
  return null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
