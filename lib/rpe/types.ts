/**
 * Public RPE state shape, surfaced to the UI on every debrief message
 * that's RPE-eligible. The client uses this to render either the picker,
 * the post-answer "answered" state, or the post-skip blank.
 */
export type RpeState =
  | { kind: "unanswered" }
  | { kind: "answered"; value: number; answeredAt: string }
  | { kind: "skipped"; skippedAt: string };

/**
 * Per-message RPE flag attached to debriefs in the thread payload.
 * `eligible: false` means the client renders no prompt at all (very short
 * activity, paused athlete, non-eligible activity type). The state field
 * is meaningful only when eligible.
 */
export type DebriefRpeMeta = {
  eligible: boolean;
  state: RpeState;
};

/**
 * Skip-count and pause bucket. Two values for V1, finer granularity
 * deferred to V1.1 with dogfood evidence (see
 * docs/post-run-debrief-moment.md §6).
 */
export type RpeBucket = "run" | "xtrain";

/**
 * Derive the bucket from an activity type. Runs (anything containing
 * "run", including VirtualRun and TrailRun) are the run bucket;
 * everything else is cross-training. The classification is set once at
 * activity_notes insert time and never changes, same activity, same
 * bucket forever.
 */
export function bucketFromActivityType(activityType: string | null): RpeBucket {
  return (activityType ?? "").toLowerCase().includes("run") ? "run" : "xtrain";
}

export const RPE_MIN = 1;
export const RPE_MAX = 10;
export const PAUSE_THRESHOLD_SKIPS = 5;
export const PAUSE_DURATION_MS = 21 * 24 * 60 * 60 * 1000;
/** Activities shorter than this are not eligible (spec §10). */
export const MIN_ACTIVITY_SECONDS = 10 * 60;
