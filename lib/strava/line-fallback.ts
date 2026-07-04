/**
 * Activity-type buckets and the deterministic, voice-safe fallback line
 * for Casey's Strava verdict.
 *
 * Two jobs:
 *  - `stravaLineKind` / `activityKindLabel`: coarse classification used to
 *    pick a fallback and to tell the non-run prompt what it's looking at.
 *    Finer-grained than `classifyActivityType` (it splits ride/swim/gym/
 *    yoga/walk) because the line wants to speak to the specific activity.
 *  - `fallbackStravaLine`: a safe one-liner used when the model's line
 *    fails the public voice/length check. A missed line is worse than a
 *    plain one now that every activity is supposed to get one, so we drop
 *    to a deterministic line rather than posting nothing.
 *
 * Import-free on purpose so the `node --experimental-strip-types` test
 * runner can load it directly (the `@/...` alias doesn't resolve there,
 * same precedent as `blurb-sanitize.ts` and `blurb-description.ts`). The
 * fallback strings are written to pass `passesStravaBlurbVoiceCheck` and
 * the shared voice check unchanged.
 */

export type StravaLineKind =
  | "run"
  | "ride"
  | "swim"
  | "gym"
  | "yoga"
  | "walk"
  | "other";

/**
 * Bucket a Strava `sport_type`/`type` string. Substring matching so
 * variant names (TrailRun, VirtualRide, EBikeRide, WeightTraining, ...)
 * land in the right bucket without an exhaustive list. Unknown types fall
 * to "other", which gets a generic line rather than failing.
 */
export function stravaLineKind(rawType: string | null | undefined): StravaLineKind {
  const t = (rawType ?? "").toLowerCase();
  if (!t) return "other";
  if (t.includes("run")) return "run";
  if (t.includes("ride") || t.includes("bike") || t.includes("cycl")) return "ride";
  if (t.includes("swim")) return "swim";
  if (t.includes("walk") || t.includes("hike")) return "walk";
  if (t.includes("yoga") || t.includes("pilates")) return "yoga";
  if (
    t.includes("weight") ||
    t.includes("workout") ||
    t.includes("strength") ||
    t.includes("crossfit")
  ) {
    return "gym";
  }
  return "other";
}

/** Human label for the non-run prompt ("a bike ride", "a swim"). */
export function activityKindLabel(rawType: string | null | undefined): string {
  switch (stravaLineKind(rawType)) {
    case "run":
      return "a run";
    case "ride":
      return "a bike ride";
    case "swim":
      return "a swim";
    case "gym":
      return "a strength session";
    case "yoga":
      return "a mobility session";
    case "walk":
      return "a walk";
    default:
      return "a session";
  }
}

/**
 * Deterministic fallback lines per activity kind. A few variants each so
 * a feed of fallbacks (e.g. several commutes) doesn't read as a form
 * letter; the variant is chosen by a stable seed (the activity's Strava
 * id) so the same activity always renders the same line. Each string is
 * dry, second-person-friendly, restates no metrics, and clears the voice
 * rules (no em dash, no exclamation, no hype).
 */
const FALLBACKS: Record<StravaLineKind, readonly string[]> = {
  run: [
    "Logged and in the bank. Not every run needs a headline.",
    "On the board. Some days the work is just showing up.",
    "Done and counted. The quiet ones add up more than they get credit for.",
  ],
  ride: [
    "Time on the bike. Easy on the joints, still real aerobic work.",
    "Saddle time, banked. Work that pays off where you can't see it.",
    "Wheels turning. The legs bank the aerobic work without the pounding.",
  ],
  swim: [
    "Laps in. Different stress, same discipline.",
    "Time in the water. Low impact, real work.",
    "Pool session done. A break from the pounding, not from the effort.",
  ],
  gym: [
    "Strength work done. The part of training that pays off quietly.",
    "Time under tension. The unglamorous work that keeps you running.",
    "Lifted and logged. Durability built one session at a time.",
  ],
  yoga: [
    "Time on the mat. Recovery is training too.",
    "Mobility work in. The maintenance that keeps the engine bolted together.",
    "Easy session, real purpose. The body keeps the receipts.",
  ],
  walk: [
    "Time on feet. Easy movement still counts.",
    "Out for a walk. Low-key, and that's allowed.",
    "Steps in. A recovery day, and it does its job.",
  ],
  other: [
    "Logged. Another one in the bank.",
    "On the board. Movement is movement.",
    "Counted. It doesn't have to be flashy to matter.",
  ],
};

/**
 * Pick the deterministic fallback line for an activity. `seed` (the
 * Strava activity id) selects the variant so the choice is stable across
 * retries; absent/odd seeds fall to the first variant.
 */
export function fallbackStravaLine(input: {
  activityType?: string | null;
  seed?: number | null;
}): string {
  const variants = FALLBACKS[stravaLineKind(input.activityType)];
  const seed = Math.abs(Math.trunc(input.seed ?? 0));
  return variants[seed % variants.length];
}
