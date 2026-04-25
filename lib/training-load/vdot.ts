/**
 * Daniels–Gilbert VDOT calculation and pace-zone derivation.
 *
 * Pure, deterministic. No service calls, no LLM. The whole feature
 * downstream (load calculator, threshold snapshots, debrief context)
 * depends on these numbers being right; tests live alongside.
 *
 * References:
 *   - Daniels' Running Formula, Jack Daniels (3rd ed.)
 *   - The Daniels–Gilbert oxygen-cost equation
 *
 * All paces in this module are seconds per kilometre (s/km), distances
 * in metres, durations in seconds. Velocities for the equation are in
 * metres per minute (m/min) — Daniels' original units, kept intact so
 * the polynomial coefficients stay readable against the source.
 */

export type RaceInput = {
  distanceMeters: number;
  durationSeconds: number;
};

export type PaceZones = {
  thresholdPaceSecPerKm: number;
  easyPaceSecPerKmLow: number;
  easyPaceSecPerKmHigh: number;
  marathonPaceSecPerKm: number;
  intervalPaceSecPerKm: number;
  repetitionPaceSecPerKm: number;
};

export type VdotProfile = {
  vdot: number;
  zones: PaceZones;
};

const COEF_A = -4.6;
const COEF_B = 0.182258;
const COEF_C = 0.000104;

/**
 * Daniels–Gilbert oxygen cost as a function of velocity (m/min).
 * Returns VO2 in ml/kg/min at the given pace.
 */
function oxygenCost(vMetersPerMin: number): number {
  return COEF_A + COEF_B * vMetersPerMin + COEF_C * vMetersPerMin * vMetersPerMin;
}

/**
 * Sustainable percentage of VO2max for a race of `durationMinutes`. Drops
 * from ~1.0 at very short efforts toward ~0.8 for marathon-length efforts.
 */
function sustainablePct(durationMinutes: number): number {
  return (
    0.8 +
    0.1894393 * Math.exp(-0.012778 * durationMinutes) +
    0.2989558 * Math.exp(-0.1932605 * durationMinutes)
  );
}

/**
 * Solve the Daniels–Gilbert oxygen-cost quadratic for velocity given a
 * target VO2. Returns the positive root (the only physically meaningful
 * solution in the relevant velocity range).
 */
function velocityForOxygen(targetVo2: number): number {
  // c v^2 + b v + (a - target) = 0
  const a = COEF_C;
  const b = COEF_B;
  const c = COEF_A - targetVo2;
  const disc = b * b - 4 * a * c;
  if (disc < 0) {
    throw new Error(
      `velocityForOxygen: no real solution for VO2=${targetVo2} (disc=${disc})`,
    );
  }
  return (-b + Math.sqrt(disc)) / (2 * a);
}

function metersPerMinToSecondsPerKm(vMetersPerMin: number): number {
  if (vMetersPerMin <= 0) {
    throw new Error(`metersPerMinToSecondsPerKm: non-positive velocity ${vMetersPerMin}`);
  }
  return 60_000 / vMetersPerMin;
}

/**
 * Compute VDOT from a race time. The race must be long enough to be
 * aerobic — Daniels' equation is calibrated for efforts roughly between
 * 1500m / 4-ish minutes and a marathon. The caller is expected to gate
 * on race-grade detection upstream; this function trusts its input.
 */
export function vdotFromRace(race: RaceInput): number {
  if (!Number.isFinite(race.distanceMeters) || race.distanceMeters <= 0) {
    throw new Error("vdotFromRace: distanceMeters must be positive");
  }
  if (!Number.isFinite(race.durationSeconds) || race.durationSeconds <= 0) {
    throw new Error("vdotFromRace: durationSeconds must be positive");
  }
  const durationMinutes = race.durationSeconds / 60;
  const v = race.distanceMeters / durationMinutes;
  const vo2AtRacePace = oxygenCost(v);
  const pct = sustainablePct(durationMinutes);
  return vo2AtRacePace / pct;
}

// Daniels pace-zone targets as fractions of vVO2max. The threshold zone
// in this table is the *upper* edge; spec §5.1 chooses 88% as the stored
// threshold pace because it matches velocity at lactate threshold and
// gives the cleanest IF calculation.
const ZONE_PCT = {
  easyLow: 0.65,
  easyHigh: 0.79,
  marathon: 0.84,
  threshold: 0.88,
  interval: 1.0,
  repetition: 1.1,
} as const;

function paceForPct(vdot: number, pct: number): number {
  const v = velocityForOxygen(pct * vdot);
  return Math.round(metersPerMinToSecondsPerKm(v));
}

/**
 * Derive Daniels pace zones from a VDOT value. Output paces are
 * rounded to the nearest second per km — sub-second precision is
 * physiologically meaningless and noisy in storage.
 */
export function paceZonesFromVdot(vdot: number): PaceZones {
  if (!Number.isFinite(vdot) || vdot <= 0) {
    throw new Error("paceZonesFromVdot: vdot must be positive");
  }
  return {
    // Easy is a band, not a point. Lower % = slower pace = larger s/km
    // value. Order the output low/high by *speed* so easy_low is the
    // slow end (slowest pace value) and easy_high is the fast end.
    easyPaceSecPerKmLow: paceForPct(vdot, ZONE_PCT.easyLow),
    easyPaceSecPerKmHigh: paceForPct(vdot, ZONE_PCT.easyHigh),
    marathonPaceSecPerKm: paceForPct(vdot, ZONE_PCT.marathon),
    thresholdPaceSecPerKm: paceForPct(vdot, ZONE_PCT.threshold),
    intervalPaceSecPerKm: paceForPct(vdot, ZONE_PCT.interval),
    repetitionPaceSecPerKm: paceForPct(vdot, ZONE_PCT.repetition),
  };
}

/**
 * Convenience: race → full snapshot-ready profile.
 */
export function profileFromRace(race: RaceInput): VdotProfile {
  const vdot = vdotFromRace(race);
  const zones = paceZonesFromVdot(vdot);
  return { vdot, zones };
}
