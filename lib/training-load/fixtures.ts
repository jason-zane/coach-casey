/**
 * Eval fixtures per `docs/training-load-feature-spec.md` §10.
 *
 * Four athlete profiles covering the load-coverage matrix the prompt
 * + recalc paths need to handle:
 *
 *   1. `richHistoryRunner`     — high-confidence threshold, deep load
 *                                  history (12 weeks of structured runs).
 *   2. `shadowOnlyRunner`      — no race; threshold derived from a hard
 *                                  20-min effort. Low confidence.
 *   3. `freshAthlete`          — no threshold; runs land on tier-2 fallback.
 *   4. `mixedDisciplineAthlete`— runs + cross-training + walks; load
 *                                  picture should integrate all sources.
 *
 * Pure data — no DB writes. Consumed by tests and dev seeders.
 */

import type { LoadActivityInput } from "./load";

export type FixtureSnapshot = {
  source: "race" | "shadow" | "manual";
  snapshotDateOffsetDays: number; // negative = past
  vdot: number;
  confidence: "high" | "medium" | "low";
  pendingReview?: boolean;
};

export type FixtureActivity = LoadActivityInput & {
  startDateOffsetDays: number; // negative = past, 0 = today
  name: string;
  distanceM: number;
};

export type FixtureAthlete = {
  id: string;
  description: string;
  snapshots: FixtureSnapshot[];
  activities: FixtureActivity[];
};

const RUN = "Run";
const RIDE = "Ride";
const SWIM = "Swim";
const WALK = "Walk";
const WEIGHTS = "WeightTraining";

/**
 * Athlete with a recent half-marathon race and 12 weeks of mixed runs.
 * Load picture should land in a healthy ATL/CTL band with a `stable` or
 * gently `rising` trend.
 */
export const richHistoryRunner: FixtureAthlete = {
  id: "fixture-rich-history",
  description: "High-confidence threshold + 12 weeks of structured runs",
  snapshots: [
    {
      source: "race",
      snapshotDateOffsetDays: -45,
      vdot: 51,
      confidence: "high",
    },
  ],
  activities: (() => {
    const acts: FixtureActivity[] = [];
    // 12 weeks: easy/long/tempo/recovery cadence.
    for (let week = 0; week < 12; week++) {
      const weekStart = -week * 7 - 1; // start at yesterday and walk back
      acts.push(
        {
          startDateOffsetDays: weekStart - 0,
          name: "Long run",
          activityType: RUN,
          movingTimeS: 6_300,
          avgPaceSPerKm: 320,
          gapSecPerKm: 320,
          distanceM: 19_000,
        },
        {
          startDateOffsetDays: weekStart - 2,
          name: "Threshold reps",
          activityType: RUN,
          movingTimeS: 3_000,
          avgPaceSPerKm: 280,
          gapSecPerKm: 270,
          distanceM: 10_500,
        },
        {
          startDateOffsetDays: weekStart - 4,
          name: "Easy",
          activityType: RUN,
          movingTimeS: 2_400,
          avgPaceSPerKm: 320,
          gapSecPerKm: 320,
          distanceM: 7_500,
        },
        {
          startDateOffsetDays: weekStart - 6,
          name: "Recovery",
          activityType: RUN,
          movingTimeS: 1_800,
          avgPaceSPerKm: 340,
          gapSecPerKm: 340,
          distanceM: 5_300,
        },
      );
    }
    return acts;
  })(),
};

/**
 * Athlete with no race history. Their hardest 20-min effort is a Saturday
 * group run that the shadow job has crowned.
 */
export const shadowOnlyRunner: FixtureAthlete = {
  id: "fixture-shadow-only",
  description: "Shadow-only threshold; no race",
  snapshots: [
    {
      source: "shadow",
      snapshotDateOffsetDays: -20,
      vdot: 45,
      confidence: "low",
    },
  ],
  activities: [
    {
      startDateOffsetDays: -1,
      name: "Easy",
      activityType: RUN,
      movingTimeS: 2_700,
      avgPaceSPerKm: 330,
      gapSecPerKm: 330,
      distanceM: 8_200,
    },
    {
      startDateOffsetDays: -3,
      name: "Saturday group run",
      activityType: RUN,
      movingTimeS: 3_300,
      avgPaceSPerKm: 290,
      gapSecPerKm: 290,
      distanceM: 11_400,
    },
    {
      startDateOffsetDays: -7,
      name: "Easy",
      activityType: RUN,
      movingTimeS: 2_400,
      avgPaceSPerKm: 335,
      gapSecPerKm: 335,
      distanceM: 7_200,
    },
    {
      startDateOffsetDays: -14,
      name: "Long",
      activityType: RUN,
      movingTimeS: 4_800,
      avgPaceSPerKm: 320,
      gapSecPerKm: 320,
      distanceM: 15_000,
    },
  ],
};

/**
 * First-week athlete with three runs and no threshold. Every activity
 * scores via the duration_default tier.
 */
export const freshAthlete: FixtureAthlete = {
  id: "fixture-fresh",
  description: "No threshold yet; tier-2 fallback applies to every run",
  snapshots: [],
  activities: [
    {
      startDateOffsetDays: -1,
      name: "First run with Casey",
      activityType: RUN,
      movingTimeS: 2_100,
      avgPaceSPerKm: 360,
      distanceM: 5_800,
    },
    {
      startDateOffsetDays: -3,
      name: "Easy",
      activityType: RUN,
      movingTimeS: 1_800,
      avgPaceSPerKm: 370,
      distanceM: 4_900,
    },
  ],
};

/**
 * Athlete who runs three times a week but also rides, lifts, and walks
 * the dog. Load picture should weight runs primarily but cross-training
 * still contributes.
 */
export const mixedDisciplineAthlete: FixtureAthlete = {
  id: "fixture-mixed-discipline",
  description: "Runs + cross-training + walks",
  snapshots: [
    {
      source: "race",
      snapshotDateOffsetDays: -90,
      vdot: 48,
      confidence: "high",
    },
  ],
  activities: [
    {
      startDateOffsetDays: -1,
      name: "Tempo run",
      activityType: RUN,
      movingTimeS: 2_400,
      avgPaceSPerKm: 295,
      gapSecPerKm: 290,
      distanceM: 8_100,
    },
    {
      startDateOffsetDays: -2,
      name: "Zwift ride",
      activityType: RIDE,
      movingTimeS: 3_600,
      avgPaceSPerKm: null,
      distanceM: 30_000,
    },
    {
      startDateOffsetDays: -3,
      name: "Easy run",
      activityType: RUN,
      movingTimeS: 2_700,
      avgPaceSPerKm: 335,
      gapSecPerKm: 335,
      distanceM: 8_000,
    },
    {
      startDateOffsetDays: -4,
      name: "Strength session",
      activityType: WEIGHTS,
      movingTimeS: 2_400,
      avgPaceSPerKm: null,
      distanceM: 0,
    },
    {
      startDateOffsetDays: -5,
      name: "Pool",
      activityType: SWIM,
      movingTimeS: 1_800,
      avgPaceSPerKm: null,
      distanceM: 1_500,
    },
    {
      startDateOffsetDays: -5,
      name: "Dog walk",
      activityType: WALK,
      movingTimeS: 2_400,
      avgPaceSPerKm: null,
      distanceM: 3_000,
    },
    {
      startDateOffsetDays: -7,
      name: "Long run",
      activityType: RUN,
      movingTimeS: 5_400,
      avgPaceSPerKm: 320,
      gapSecPerKm: 320,
      distanceM: 17_000,
    },
  ],
};

export const ALL_FIXTURES: FixtureAthlete[] = [
  richHistoryRunner,
  shadowOnlyRunner,
  freshAthlete,
  mixedDisciplineAthlete,
];
