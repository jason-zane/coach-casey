/**
 * Classification of Strava activity types for routing downstream pipelines.
 *
 * Strava's `sport_type` and legacy `type` fields are free-form strings with
 * known values. We classify into four buckets:
 *
 *   run           , flows into the post-run debrief pipeline
 *   cross_training, flows into the cross-training acknowledgement pipeline
 *   ambient       , stored as activity rows, no thread message generated
 *   catch_all     , unknown type; routed to cross-training with the
 *                    catch-all interpretation pattern (see
 *                    docs/cross-training.md §5.7)
 *
 * Matching is case-insensitive and tolerant of Strava's variant names
 * (VirtualRide vs Ride, Workout vs WeightTraining, etc.).
 */

export const RUN_TYPES = ["Run", "VirtualRun", "TrailRun"] as const;

export const CROSS_TRAINING_TYPES = [
  "Ride",
  "VirtualRide",
  "EBikeRide",
  "Swim",
  "Workout",
  "WeightTraining",
  "Yoga",
  "Pilates",
] as const;

export const AMBIENT_ONLY_TYPES = ["Walk"] as const;

export type ActivityClass = "run" | "cross_training" | "ambient" | "catch_all";

function normaliseType(raw: string | null | undefined): string {
  return (raw ?? "").trim();
}

/**
 * Returns the pipeline classification for a Strava activity type. Falls
 * back to the catch-all bucket when the type is unknown, Strava adds
 * activity types occasionally (e.g. "HighIntensityIntervalTraining" was a
 * relatively recent addition) and the cross-training prompt is instructed
 * to handle unknowns honestly rather than fail closed.
 */
export function classifyActivityType(raw: string | null | undefined): ActivityClass {
  const type = normaliseType(raw);
  if (!type) return "catch_all";

  // Any type containing "Run" is treated as a run, covers Run, TrailRun,
  // VirtualRun, and any future run variants. The debrief gate itself
  // applies further filtering (distance, abort tokens).
  if (/run/i.test(type)) return "run";

  if ((CROSS_TRAINING_TYPES as readonly string[]).includes(type)) {
    return "cross_training";
  }

  if ((AMBIENT_ONLY_TYPES as readonly string[]).includes(type)) {
    return "ambient";
  }

  return "catch_all";
}

/**
 * Convenience boolean. The webhook path already has a loose run check; this
 * helper formalises it so both the webhook and the cron poll use the same
 * classifier.
 */
export function isRunType(raw: string | null | undefined): boolean {
  return classifyActivityType(raw) === "run";
}

/**
 * True when the activity should produce a cross-training acknowledgement
 * message (including catch-all types). Excludes runs and ambient-only types.
 */
export function shouldGenerateCrossTrainingAck(raw: string | null | undefined): boolean {
  const cls = classifyActivityType(raw);
  return cls === "cross_training" || cls === "catch_all";
}
