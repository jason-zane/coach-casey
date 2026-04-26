import { describe, expect, it } from "vitest";
import {
  hasEasyIntentByLoad,
  hasHardIntentByLoad,
  pickFollowUp,
} from "./followup-picker";
import type {
  DebriefActivity,
  DebriefArcRun,
} from "@/lib/thread/debrief-context";

const ATHLETE_CREATED_AT = new Date(
  Date.now() - 365 * 24 * 60 * 60 * 1000,
).toISOString();

function makeActivity(
  overrides: Partial<DebriefActivity> = {},
): DebriefActivity {
  return {
    id: "act-1",
    strava_id: 1,
    date: new Date().toISOString(),
    dayOfWeek: "Tue",
    name: "Easy run",
    activityType: "Run",
    distanceKm: 8,
    movingTimeS: 2_400,
    paceSPerKm: 300,
    avgHr: 145,
    maxHr: 160,
    elevGainM: 0,
    laps: [],
    hasWorkoutShape: false,
    ...overrides,
  };
}

function arc(n: number): DebriefArcRun[] {
  return Array.from({ length: n }, (_, i) => ({
    date: new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000).toISOString(),
    name: "run",
    distanceKm: 8,
    paceSPerKm: 300,
    avgHr: 145,
    isWorkout: false,
  }));
}

describe("hasHardIntentByLoad", () => {
  it("flags hard when load is in the top 25% of trailing samples", () => {
    expect(
      hasHardIntentByLoad({
        thisActivityLoadAu: 100,
        thisActivityLoadIf: 0.75,
        recentLoadAus: [10, 20, 30, 40, 50, 60, 70, 80],
      }),
    ).toBe(true);
  });

  it("flags hard when IF is above 0.85 even on a low absolute load", () => {
    expect(
      hasHardIntentByLoad({
        thisActivityLoadAu: 15,
        thisActivityLoadIf: 0.9,
        recentLoadAus: [50, 60, 70, 80],
      }),
    ).toBe(true);
  });

  it("does not flag hard when load is mid-pack and IF is moderate", () => {
    expect(
      hasHardIntentByLoad({
        thisActivityLoadAu: 50,
        thisActivityLoadIf: 0.7,
        recentLoadAus: [10, 30, 50, 70, 90, 110],
      }),
    ).toBe(false);
  });
});

describe("hasEasyIntentByLoad", () => {
  it("flags easy when load is below median AND IF is below 0.75", () => {
    expect(
      hasEasyIntentByLoad({
        thisActivityLoadAu: 20,
        thisActivityLoadIf: 0.65,
        recentLoadAus: [40, 60, 80, 100, 120],
      }),
    ).toBe(true);
  });

  it("does not flag easy when IF is high even with low load", () => {
    expect(
      hasEasyIntentByLoad({
        thisActivityLoadAu: 20,
        thisActivityLoadIf: 0.95,
        recentLoadAus: [40, 60, 80, 100, 120],
      }),
    ).toBe(false);
  });

  it("does not flag easy when load is above median", () => {
    expect(
      hasEasyIntentByLoad({
        thisActivityLoadAu: 90,
        thisActivityLoadIf: 0.7,
        recentLoadAus: [40, 60, 80, 100, 120],
      }),
    ).toBe(false);
  });

  it("returns false when IF is null (cross-training)", () => {
    expect(
      hasEasyIntentByLoad({
        thisActivityLoadAu: 20,
        thisActivityLoadIf: null,
        recentLoadAus: [40, 60, 80, 100, 120],
      }),
    ).toBe(false);
  });
});

describe("pickFollowUp", () => {
  it("falls back to conversational when no RPE answer", () => {
    const pick = pickFollowUp({
      activity: makeActivity(),
      arcRuns: arc(10),
      athleteCreatedAt: ATHLETE_CREATED_AT,
      rpeValue: null,
    });
    expect(pick.type).toBe("conversational");
  });

  it("picks rpe_branched high_on_easy when RPE is 8 on a load-flagged easy run", () => {
    const pick = pickFollowUp({
      activity: makeActivity(),
      arcRuns: arc(10),
      athleteCreatedAt: ATHLETE_CREATED_AT,
      rpeValue: 8,
      loadSignal: {
        thisActivityLoadAu: 25,
        thisActivityLoadIf: 0.6,
        recentLoadAus: [40, 50, 60, 80, 100],
      },
    });
    expect(pick.type).toBe("rpe_branched");
    if (pick.type === "rpe_branched") {
      expect(pick.branch).toBe("high_on_easy");
    }
  });

  it("picks rpe_branched low_on_hard when RPE is 3 on a tempo effort", () => {
    const pick = pickFollowUp({
      activity: makeActivity(),
      arcRuns: arc(10),
      athleteCreatedAt: ATHLETE_CREATED_AT,
      rpeValue: 3,
      loadSignal: {
        thisActivityLoadAu: 80,
        thisActivityLoadIf: 0.92,
        recentLoadAus: [20, 40, 60, 70],
      },
    });
    expect(pick.type).toBe("rpe_branched");
    if (pick.type === "rpe_branched") {
      expect(pick.branch).toBe("low_on_hard");
    }
  });

  it("falls through to conversational on a mid-RPE answer with no divergence", () => {
    const pick = pickFollowUp({
      activity: makeActivity(),
      arcRuns: arc(10),
      athleteCreatedAt: ATHLETE_CREATED_AT,
      rpeValue: 5,
      loadSignal: {
        thisActivityLoadAu: 50,
        thisActivityLoadIf: 0.7,
        recentLoadAus: [40, 50, 60, 70],
      },
    });
    expect(pick.type).toBe("conversational");
  });

  it("falls back to legacy heuristics when load samples are sparse", () => {
    const pick = pickFollowUp({
      activity: makeActivity({ hasWorkoutShape: true }),
      arcRuns: arc(10),
      athleteCreatedAt: ATHLETE_CREATED_AT,
      rpeValue: 3,
      loadSignal: {
        thisActivityLoadAu: 80,
        thisActivityLoadIf: 0.6,
        recentLoadAus: [40], // below MIN_LOAD_SAMPLES
      },
    });
    // legacy hasHardIntent returns true on workout shape
    expect(pick.type).toBe("rpe_branched");
  });
});
