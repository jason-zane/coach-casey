import { describe, expect, it } from "vitest";
import {
  CROSS_TRAINING_IF,
  DEFAULT_TIER_2_IF,
  IF_CLAMP_MAX,
  IF_CLAMP_MIN,
  calculateLoad,
} from "./load";

const RUN = "Run";
const THRESHOLD_PACE = 270; // 4:30/km

describe("calculateLoad — tier 1 (pace_rtss)", () => {
  it("anchors 1 hour at threshold to ≈ 100 AU", () => {
    const result = calculateLoad(
      {
        activityType: RUN,
        movingTimeS: 3_600,
        avgPaceSPerKm: THRESHOLD_PACE,
        gapSecPerKm: THRESHOLD_PACE,
      },
      { thresholdPaceSecPerKm: THRESHOLD_PACE },
    );
    expect(result?.loadMethod).toBe("pace_rtss");
    expect(result?.loadIf).toBe(1);
    expect(result?.loadAu).toBeCloseTo(100, 0);
  });

  it("uses GAP when present, falling back to raw pace otherwise", () => {
    const withGap = calculateLoad(
      {
        activityType: RUN,
        movingTimeS: 3_600,
        avgPaceSPerKm: 360,
        gapSecPerKm: 300,
      },
      { thresholdPaceSecPerKm: THRESHOLD_PACE },
    );
    const withoutGap = calculateLoad(
      {
        activityType: RUN,
        movingTimeS: 3_600,
        avgPaceSPerKm: 360,
      },
      { thresholdPaceSecPerKm: THRESHOLD_PACE },
    );
    expect(withGap?.loadMethod).toBe("pace_rtss");
    expect(withoutGap?.loadMethod).toBe("pace_rtss");
    expect(withGap?.loadIf).toBeGreaterThan(withoutGap?.loadIf as number);
  });

  it("clamps a very slow GAP to the IF floor (0.4)", () => {
    const result = calculateLoad(
      {
        activityType: RUN,
        movingTimeS: 3_600,
        avgPaceSPerKm: 1_200,
        gapSecPerKm: 1_200,
      },
      { thresholdPaceSecPerKm: THRESHOLD_PACE },
    );
    expect(result?.loadIf).toBe(IF_CLAMP_MIN);
  });

  it("clamps a very fast GAP to the IF ceiling (1.5)", () => {
    const result = calculateLoad(
      {
        activityType: RUN,
        movingTimeS: 600,
        avgPaceSPerKm: 150,
        gapSecPerKm: 150,
      },
      { thresholdPaceSecPerKm: THRESHOLD_PACE },
    );
    expect(result?.loadIf).toBe(IF_CLAMP_MAX);
  });

  it("yields a higher load for the same duration at higher intensity", () => {
    const easy = calculateLoad(
      {
        activityType: RUN,
        movingTimeS: 3_600,
        avgPaceSPerKm: 360,
        gapSecPerKm: 360,
      },
      { thresholdPaceSecPerKm: THRESHOLD_PACE },
    );
    const tempo = calculateLoad(
      {
        activityType: RUN,
        movingTimeS: 3_600,
        avgPaceSPerKm: 280,
        gapSecPerKm: 280,
      },
      { thresholdPaceSecPerKm: THRESHOLD_PACE },
    );
    expect(tempo?.loadAu).toBeGreaterThan(easy?.loadAu as number);
  });

  it("treats virtual/trail runs as runs", () => {
    for (const t of ["VirtualRun", "TrailRun"]) {
      const r = calculateLoad(
        {
          activityType: t,
          movingTimeS: 3_600,
          avgPaceSPerKm: THRESHOLD_PACE,
          gapSecPerKm: THRESHOLD_PACE,
        },
        { thresholdPaceSecPerKm: THRESHOLD_PACE },
      );
      expect(r?.loadMethod).toBe("pace_rtss");
    }
  });
});

describe("calculateLoad — tier 2 (duration_default)", () => {
  it("falls back to a fixed IF of 0.7 when no threshold is known", () => {
    const result = calculateLoad(
      {
        activityType: RUN,
        movingTimeS: 3_600,
        avgPaceSPerKm: 300,
      },
      { thresholdPaceSecPerKm: null },
    );
    expect(result?.loadMethod).toBe("duration_default");
    expect(result?.loadIf).toBe(DEFAULT_TIER_2_IF);
    // 3600 * 0.49 / 36 = 49
    expect(result?.loadAu).toBeCloseTo(49, 0);
  });

  it("falls back to tier 2 when the threshold is known but pace is missing", () => {
    const result = calculateLoad(
      {
        activityType: RUN,
        movingTimeS: 3_600,
        avgPaceSPerKm: null,
      },
      { thresholdPaceSecPerKm: THRESHOLD_PACE },
    );
    expect(result?.loadMethod).toBe("duration_default");
  });
});

describe("calculateLoad — tier 3 (cross_training)", () => {
  const cases: Array<[string, number]> = [
    ["Ride", CROSS_TRAINING_IF.Ride],
    ["VirtualRide", CROSS_TRAINING_IF.VirtualRide],
    ["Swim", CROSS_TRAINING_IF.Swim],
    ["WeightTraining", CROSS_TRAINING_IF.WeightTraining],
    ["Yoga", CROSS_TRAINING_IF.Yoga],
    ["Pilates", CROSS_TRAINING_IF.Pilates],
    ["Walk", CROSS_TRAINING_IF.Walk],
    ["Hike", CROSS_TRAINING_IF.Hike],
    ["Rowing", CROSS_TRAINING_IF.Rowing],
  ];

  for (const [type, expectedIf] of cases) {
    it(`scores 1 hour of ${type} at minutes × ${expectedIf}`, () => {
      const r = calculateLoad(
        { activityType: type, movingTimeS: 3_600, avgPaceSPerKm: null },
        { thresholdPaceSecPerKm: THRESHOLD_PACE },
      );
      expect(r?.loadMethod).toBe("cross_training");
      expect(r?.loadIf).toBeNull();
      expect(r?.loadAu).toBeCloseTo(60 * expectedIf, 1);
    });
  }

  it("uses the catch-all IF for an unknown activity type", () => {
    const r = calculateLoad(
      {
        activityType: "BackcountrySki",
        movingTimeS: 3_600,
        avgPaceSPerKm: null,
      },
      { thresholdPaceSecPerKm: THRESHOLD_PACE },
    );
    expect(r?.loadMethod).toBe("cross_training");
    expect(r?.loadAu).toBeCloseTo(60 * CROSS_TRAINING_IF.Other, 1);
  });

  it("treats workout_type=4 (multi-sport) as cross-training", () => {
    const r = calculateLoad(
      {
        activityType: "Run",
        movingTimeS: 3_600,
        avgPaceSPerKm: 240,
        gapSecPerKm: 240,
        stravaWorkoutType: 4,
      },
      { thresholdPaceSecPerKm: THRESHOLD_PACE },
    );
    expect(r?.loadMethod).toBe("cross_training");
    expect(r?.loadIf).toBeNull();
  });
});

describe("calculateLoad — edge cases", () => {
  it("returns null on missing duration", () => {
    expect(
      calculateLoad(
        { activityType: RUN, movingTimeS: null, avgPaceSPerKm: 300 },
        { thresholdPaceSecPerKm: THRESHOLD_PACE },
      ),
    ).toBeNull();
    expect(
      calculateLoad(
        { activityType: RUN, movingTimeS: 0, avgPaceSPerKm: 300 },
        { thresholdPaceSecPerKm: THRESHOLD_PACE },
      ),
    ).toBeNull();
  });

  it("calculates load for short runs (no minimum-duration gate)", () => {
    const result = calculateLoad(
      {
        activityType: RUN,
        movingTimeS: 360, // 6 min
        avgPaceSPerKm: THRESHOLD_PACE,
        gapSecPerKm: THRESHOLD_PACE,
      },
      { thresholdPaceSecPerKm: THRESHOLD_PACE },
    );
    expect(result).not.toBeNull();
    expect(result?.loadAu).toBeGreaterThan(0);
  });

  it("is deterministic on repeated calls (idempotent calculation)", () => {
    const args = {
      activity: {
        activityType: RUN,
        movingTimeS: 2_400,
        avgPaceSPerKm: 290,
        gapSecPerKm: 285,
      },
      threshold: { thresholdPaceSecPerKm: THRESHOLD_PACE },
    };
    const a = calculateLoad(args.activity, args.threshold);
    const b = calculateLoad(args.activity, args.threshold);
    expect(a).toEqual(b);
  });
});
