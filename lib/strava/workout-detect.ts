/**
 * Workout classification from lap data.
 *
 * Strava's `workout_type` flag is rarely set by athletes, so we can't lean on
 * it. Instead we look at the laps themselves and ask: does this look like a
 * structured session, or is it auto-lap noise on an easy run?
 *
 * Output is a `WorkoutClassification` consumed by:
 *   - the chat-context renderer, which inlines lap detail for real workouts
 *     and a one-liner for easy runs;
 *   - the validation + reading screen, which counts how many workouts the
 *     athlete has done in the window.
 */
import type { StravaLap } from "./client";

export type WorkoutKind =
  | "intervals"
  | "tempo"
  | "progression"
  | "race"
  | "long"
  | "easy";

export type LapSummary = {
  index: number;
  name: string | null;
  distance_m: number;
  moving_time_s: number;
  pace_s_per_km: number;
  avg_hr: number | null;
};

export type WorkoutClassification = {
  kind: WorkoutKind;
  /** Confidence we'd say this aloud to the athlete. */
  confidence: "high" | "medium" | "low";
  /** Short human label, e.g. "5 × 1km intervals" or "20-min tempo block". */
  summary: string;
  /** Compacted laps for prompt rendering, null when no usable laps. */
  laps: LapSummary[] | null;
  /** Why we classified this way, useful for logs / debugging. */
  reason: string;
};

type LapInput = Pick<
  StravaLap,
  "lap_index" | "name" | "distance" | "moving_time" | "average_heartrate"
>;

const MIN_LAP_DISTANCE_M = 200;
const AUTO_LAP_DISTANCE_TOLERANCE = 0.05; // ±5%
const AUTO_LAP_PACE_SPREAD_S_PER_KM = 25;
const INTERVAL_FAST_SPREAD_S_PER_KM = 35;
const TEMPO_BLOCK_MIN_LAPS = 3;
const PROGRESSION_MIN_DRIFT_S_PER_KM = 30;

function paceSPerKm(distanceM: number, movingS: number): number | null {
  if (!distanceM || !movingS || distanceM < MIN_LAP_DISTANCE_M) return null;
  return movingS / (distanceM / 1000);
}

function summariseLap(l: LapInput): LapSummary | null {
  const pace = paceSPerKm(l.distance, l.moving_time);
  if (pace == null) return null;
  return {
    index: l.lap_index,
    name: l.name ?? null,
    distance_m: Math.round(l.distance),
    moving_time_s: Math.round(l.moving_time),
    pace_s_per_km: Math.round(pace),
    avg_hr: l.average_heartrate ? Math.round(l.average_heartrate) : null,
  };
}

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function isUniformDistance(laps: LapSummary[]): boolean {
  if (laps.length < 3) return false;
  // Drop the last lap, final lap is often a partial that throws this off.
  const considered = laps.slice(0, -1);
  if (considered.length < 2) return false;
  const med = median(considered.map((l) => l.distance_m));
  return considered.every(
    (l) => Math.abs(l.distance_m - med) / med <= AUTO_LAP_DISTANCE_TOLERANCE,
  );
}

function paceSpread(laps: LapSummary[]): number {
  if (laps.length === 0) return 0;
  const considered = laps.length > 2 ? laps.slice(0, -1) : laps;
  const paces = considered.map((l) => l.pace_s_per_km);
  return Math.max(...paces) - Math.min(...paces);
}

/**
 * Looks for the alternating fast/slow pattern of intervals + recoveries.
 * Returns the laps split into fast/slow buckets when detected.
 */
function detectIntervalBuckets(
  laps: LapSummary[],
): { fast: LapSummary[]; slow: LapSummary[] } | null {
  if (laps.length < 4) return null;
  const med = median(laps.map((l) => l.pace_s_per_km));
  const fast = laps.filter((l) => l.pace_s_per_km <= med - 15);
  const slow = laps.filter((l) => l.pace_s_per_km >= med + 15);
  if (fast.length < 2 || slow.length < 2) return null;
  // Fast bucket should actually be fast, not just "less slow".
  const spread = Math.min(...slow.map((l) => l.pace_s_per_km)) -
    Math.max(...fast.map((l) => l.pace_s_per_km));
  if (spread < INTERVAL_FAST_SPREAD_S_PER_KM) return null;
  return { fast, slow };
}

/**
 * Find the longest run of consecutive laps faster than the activity-average
 * pace by ≥20 s/km, with a tight pace band (within 15 s/km of each other).
 * That's the shape of a tempo or sub-threshold block.
 */
function detectTempoBlock(
  laps: LapSummary[],
  avgPace: number,
): LapSummary[] | null {
  let best: LapSummary[] = [];
  let cur: LapSummary[] = [];
  for (const l of laps) {
    const fastEnough = l.pace_s_per_km <= avgPace - 20;
    const tight = cur.length === 0
      ? true
      : Math.abs(l.pace_s_per_km - cur[0].pace_s_per_km) <= 15;
    if (fastEnough && tight) {
      cur.push(l);
      if (cur.length > best.length) best = [...cur];
    } else {
      cur = fastEnough ? [l] : [];
    }
  }
  return best.length >= TEMPO_BLOCK_MIN_LAPS ? best : null;
}

function detectProgression(laps: LapSummary[]): boolean {
  if (laps.length < 4) return false;
  const considered = laps.slice(0, -1);
  // Compare the first third's median pace to the last third's. A real
  // progression run drops by ≥30 s/km across the run.
  const third = Math.max(1, Math.floor(considered.length / 3));
  const firstThird = considered.slice(0, third);
  const lastThird = considered.slice(-third);
  const drop =
    median(firstThird.map((l) => l.pace_s_per_km)) -
    median(lastThird.map((l) => l.pace_s_per_km));
  return drop >= PROGRESSION_MIN_DRIFT_S_PER_KM;
}

function formatPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDistance(meters: number): string {
  if (meters >= 950) return `${(meters / 1000).toFixed(meters % 1000 < 50 ? 0 : 1)}km`;
  return `${meters}m`;
}

type ClassifyInput = {
  laps: LapInput[] | null | undefined;
  /** seconds per km for the whole activity, when available */
  avgPaceSPerKm: number | null | undefined;
  /** total distance in meters */
  distanceM: number | null | undefined;
  /** total moving time in seconds */
  movingTimeS: number | null | undefined;
  /** Strava's workout_type field, when set: 1=race, 2=long, 3=workout */
  stravaWorkoutType?: number | null;
};

export function classifyWorkout(input: ClassifyInput): WorkoutClassification {
  const lapsRaw = (input.laps ?? [])
    .map(summariseLap)
    .filter((l): l is LapSummary => l !== null);

  const avgPace =
    input.avgPaceSPerKm ??
    (input.distanceM && input.movingTimeS
      ? Math.round(input.movingTimeS / (input.distanceM / 1000))
      : null);

  // Strava workout_type: 1 race, 2 long, 3 workout. Trust 1 unconditionally 
  // the athlete explicitly tagged it. For 3 we use it as a hint but still
  // run the lap analysis below to pick the *kind* of workout.
  if (input.stravaWorkoutType === 1) {
    return {
      kind: "race",
      confidence: "high",
      summary: "Race effort",
      laps: lapsRaw.length > 0 ? lapsRaw : null,
      reason: "strava workout_type=race",
    };
  }

  if (lapsRaw.length < 3) {
    // Not enough lap structure to call. Fall back on Strava workout_type=2
    // (long) when set, otherwise call it easy.
    if (input.stravaWorkoutType === 2) {
      return {
        kind: "long",
        confidence: "medium",
        summary: "Long run",
        laps: lapsRaw.length > 0 ? lapsRaw : null,
        reason: "strava workout_type=long",
      };
    }
    return {
      kind: "easy",
      confidence: "medium",
      summary: "Easy run",
      laps: null,
      reason: "fewer than 3 usable laps",
    };
  }

  if (avgPace == null) {
    return {
      kind: "easy",
      confidence: "low",
      summary: "Easy run",
      laps: null,
      reason: "no avg pace available",
    };
  }

  // Auto-lap rejection: uniform distances + tight pace spread = auto-lap on
  // an easy run, regardless of how many laps Strava recorded.
  const uniformDist = isUniformDistance(lapsRaw);
  const spread = paceSpread(lapsRaw);
  if (uniformDist && spread < AUTO_LAP_PACE_SPREAD_S_PER_KM) {
    return {
      kind: "easy",
      confidence: "high",
      summary: "Easy run",
      laps: null,
      reason: `auto-lap: uniform distances (~${Math.round(median(lapsRaw.map((l) => l.distance_m)))}m), pace spread ${Math.round(spread)}s`,
    };
  }

  // Race: small lap count and notably faster than typical avg pace, even
  // without an explicit workout_type=1. (E.g. parkrun: 5km, fast.)
  if (
    input.stravaWorkoutType !== 3 &&
    lapsRaw.length <= 6 &&
    input.distanceM != null &&
    input.distanceM <= 25_000 &&
    avgPace > 0
  ) {
    // Without per-athlete easy baseline we can't be definitive. Conservative:
    // require the activity itself to read as workout-fast (avg pace tighter
    // than typical easy, lap spread small). We mark medium confidence so the
    // renderer still shows lap detail.
    if (spread < INTERVAL_FAST_SPREAD_S_PER_KM && avgPace < 280) {
      return {
        kind: "race",
        confidence: "medium",
        summary: `Race-pace effort (${formatPace(avgPace)}/km)`,
        laps: lapsRaw,
        reason: "short distance, fast & even pace",
      };
    }
  }

  // Intervals: alternating fast/slow buckets.
  const buckets = detectIntervalBuckets(lapsRaw);
  if (buckets) {
    const reps = buckets.fast.length;
    const repDist = median(buckets.fast.map((l) => l.distance_m));
    const repPace = median(buckets.fast.map((l) => l.pace_s_per_km));
    return {
      kind: "intervals",
      confidence: "high",
      summary: `${reps} × ${formatDistance(repDist)} @ ${formatPace(repPace)}/km`,
      laps: lapsRaw,
      reason: `${buckets.fast.length} fast laps clustered, ${buckets.slow.length} recovery laps`,
    };
  }

  // Tempo / sub-threshold block.
  const tempo = detectTempoBlock(lapsRaw, avgPace);
  if (tempo) {
    const blockDist = tempo.reduce((s, l) => s + l.distance_m, 0);
    const blockPace = median(tempo.map((l) => l.pace_s_per_km));
    return {
      kind: "tempo",
      confidence: "high",
      summary: `${formatDistance(blockDist)} tempo block @ ${formatPace(blockPace)}/km`,
      laps: lapsRaw,
      reason: `${tempo.length}-lap tempo block, ≥20 s/km faster than activity avg`,
    };
  }

  // Progression: pace drifts down across the run.
  if (detectProgression(lapsRaw)) {
    const considered = lapsRaw.slice(0, -1);
    const third = Math.max(1, Math.floor(considered.length / 3));
    const startPace = median(
      considered.slice(0, third).map((l) => l.pace_s_per_km),
    );
    const endPace = median(
      considered.slice(-third).map((l) => l.pace_s_per_km),
    );
    return {
      kind: "progression",
      confidence: "high",
      summary: `Progression: ${formatPace(startPace)} → ${formatPace(endPace)}/km`,
      laps: lapsRaw,
      reason: `pace dropped ${Math.round(startPace - endPace)}s/km from first to last third`,
    };
  }

  // Strava said it was a workout but we couldn't see structure, surface
  // the laps anyway so the athlete can ask about them.
  if (input.stravaWorkoutType === 3) {
    return {
      kind: "tempo",
      confidence: "low",
      summary: "Workout (Strava-tagged)",
      laps: lapsRaw,
      reason: "strava workout_type=3, no clear lap pattern detected",
    };
  }

  // Long-ish, no structure, surface as long when distance fits.
  if (input.stravaWorkoutType === 2 || (input.distanceM ?? 0) >= 20_000) {
    return {
      kind: "long",
      confidence: "medium",
      summary: "Long run",
      laps: null,
      reason: input.stravaWorkoutType === 2 ? "strava workout_type=long" : "distance ≥ 20km",
    };
  }

  return {
    kind: "easy",
    confidence: "medium",
    summary: "Easy run",
    laps: null,
    reason: "lap pattern did not match intervals/tempo/progression/race",
  };
}

/** Convenience: just the boolean. Kept for call sites that count workouts. */
export function isStructuredWorkout(input: ClassifyInput): boolean {
  const c = classifyWorkout(input);
  return c.kind === "intervals" || c.kind === "tempo" || c.kind === "progression";
}

/** Render the lap breakdown the way Casey reads it. Compact, prompt-ready. */
export function renderLapBreakdown(laps: LapSummary[]): string {
  return laps
    .map((l) => {
      const dist = formatDistance(l.distance_m);
      const pace = formatPace(l.pace_s_per_km);
      const hr = l.avg_hr ? ` HR ${l.avg_hr}` : "";
      const name = l.name ? ` "${l.name}"` : "";
      return `  L${l.index}: ${dist} @ ${pace}/km${hr}${name}`;
    })
    .join("\n");
}
