/**
 * Race-grade detection for activities. Used by the snapshot pipeline to
 * decide whether to derive a fresh VDOT from a synced activity.
 *
 * Two signals (spec §5.3):
 *   1. `workout_type === 1` (Strava's explicit race tag) — trusted.
 *   2. Title contains a race-indicating keyword AND duration is in the
 *      plausible range (15min–6hr).
 *
 * Pure / no I/O so it can be exercised by tests and called from both the
 * webhook ingest path and any backfill we run.
 */

const RACE_KEYWORDS = [
  /\bmarathon\b/i,
  /\bhalf[\s-]?marathon\b/i,
  /\bhalf\b/i,
  /\b10\s*k\b/i,
  /\b5\s*k\b/i,
  /\bparkrun\b/i,
  /\brace\b/i,
  /\bracing\b/i,
];

const MIN_RACE_SECONDS = 15 * 60;
const MAX_RACE_SECONDS = 6 * 60 * 60;

export type RaceCandidate = {
  name: string | null;
  movingTimeS: number | null;
  distanceM: number | null;
  stravaWorkoutType: number | null;
};

export function isRaceCandidate(c: RaceCandidate): boolean {
  if (
    c.movingTimeS == null ||
    c.distanceM == null ||
    c.movingTimeS < MIN_RACE_SECONDS ||
    c.movingTimeS > MAX_RACE_SECONDS ||
    c.distanceM <= 0
  ) {
    return false;
  }
  if (c.stravaWorkoutType === 1) return true;
  const name = c.name ?? "";
  return RACE_KEYWORDS.some((re) => re.test(name));
}
