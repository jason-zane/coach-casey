import type {
  DebriefActivity,
  DebriefArcRun,
  DebriefContext,
  DebriefWeekAggregate,
  RpeHistoryEntry,
} from "@/lib/thread/debrief-context";

/**
 * Hand-built debrief fixtures. Each fixture represents a real-shape
 * scenario the prompt is meant to handle: steady run, workout shape,
 * niggle-flagged abort, etc. The eval harness runs each through the
 * generator (mock or real) and asserts on voice + structure.
 *
 * Fixtures intentionally avoid realistic raw_text plans, the LLM's
 * job is to interpret the activity in the context, not to mock the
 * extraction pipeline.
 */

function lap(
  idx: number,
  km: number,
  paceSPerKm: number,
  hr: number | null = null,
): DebriefActivity["laps"][number] {
  return { idx, km, paceSPerKm, hr };
}

function steadyRunFixture(): DebriefContext {
  const activity: DebriefActivity = {
    id: "fixture-activity-steady",
    strava_id: 99001,
    date: "2026-05-05T07:15:00",
    dayOfWeek: "Tue",
    name: "Morning Run",
    activityType: "Run",
    distanceKm: 10.8,
    movingTimeS: 2608,
    paceSPerKm: 241,
    avgHr: 151,
    maxHr: 167,
    elevGainM: 47,
    laps: [
      lap(1, 1.0, 245, 148),
      lap(2, 1.0, 240, 150),
      lap(3, 1.0, 238, 152),
      lap(4, 1.0, 240, 153),
      lap(5, 1.0, 244, 154),
    ],
    hasWorkoutShape: false,
  };
  return {
    athleteId: "fixture-athlete",
    athleteCreatedAt: "2026-04-20T00:00:00Z",
    displayName: "Sam",
    sex: "M",
    weightKg: 72,
    ageYears: 36,
    activity,
    arcWeeks: arcWeeks(),
    arcRuns: arcRuns(),
    activePlanText: null,
    activePlanUploadedAt: null,
    injuries: [],
    lifeContext: [],
    goalRaces: [],
    priorDebriefs: [],
    priorFollowUps: [],
    isFirstDebrief: false,
    rpeHistory: rpeHistory(),
  };
}

function workoutShapeFixture(): DebriefContext {
  const activity: DebriefActivity = {
    id: "fixture-activity-workout",
    strava_id: 99002,
    date: "2026-05-06T17:30:00",
    dayOfWeek: "Wed",
    name: "5x1km @ threshold",
    activityType: "Run",
    distanceKm: 12.4,
    movingTimeS: 3060,
    paceSPerKm: 247,
    avgHr: 158,
    maxHr: 178,
    elevGainM: 52,
    laps: [
      lap(1, 1.5, 320, 132), // warmup
      lap(2, 1.0, 240, 168), // rep 1
      lap(3, 0.4, 360, 140), // jog
      lap(4, 1.0, 238, 172), // rep 2
      lap(5, 0.4, 365, 142),
      lap(6, 1.0, 235, 175), // rep 3
      lap(7, 0.4, 360, 145),
      lap(8, 1.0, 240, 178), // rep 4
      lap(9, 0.4, 360, 145),
      lap(10, 1.0, 245, 174), // rep 5
      lap(11, 1.5, 320, 130), // cooldown
    ],
    hasWorkoutShape: true,
  };
  return {
    athleteId: "fixture-athlete",
    athleteCreatedAt: "2026-04-20T00:00:00Z",
    displayName: "Sam",
    sex: "M",
    weightKg: 72,
    ageYears: 36,
    activity,
    arcWeeks: arcWeeks(),
    arcRuns: arcRuns(),
    activePlanText:
      "## Week of 2026-05-04\n- Mon: easy 8km\n- Tue: easy 10km\n- Wed: 5x1km @ threshold\n- Thu: rest\n- Fri: easy 6km\n- Sat: long run 22km",
    activePlanUploadedAt: "2026-04-25T10:00:00Z",
    injuries: [],
    lifeContext: [
      {
        kind: "context",
        content: "Travel for work next week, expecting compressed sleep",
        tags: ["sleep", "travel"],
        createdAt: "2026-05-03T08:00:00Z",
      },
    ],
    goalRaces: [
      {
        name: "Sydney Marathon",
        raceDate: "2026-09-20",
        goalTimeSeconds: 3 * 3600 + 15 * 60,
      },
    ],
    priorDebriefs: [],
    priorFollowUps: [],
    isFirstDebrief: false,
    rpeHistory: rpeHistory(),
  };
}

function arcWeeks(): DebriefWeekAggregate[] {
  return [
    { weekStart: "2026-04-13", km: 48.2, runCount: 4 },
    { weekStart: "2026-04-20", km: 55.7, runCount: 5 },
    { weekStart: "2026-04-27", km: 52.0, runCount: 5 },
    { weekStart: "2026-05-04", km: 23.2, runCount: 2 },
  ];
}

function arcRuns(): DebriefArcRun[] {
  return [
    { date: "2026-04-22T07:00:00", name: "Easy run", distanceKm: 8.0, paceSPerKm: 320, avgHr: 138, isWorkout: false },
    { date: "2026-04-23T07:00:00", name: "Threshold", distanceKm: 11.5, paceSPerKm: 252, avgHr: 162, isWorkout: true },
    { date: "2026-04-25T07:00:00", name: "Long run", distanceKm: 22.0, paceSPerKm: 305, avgHr: 145, isWorkout: false },
    { date: "2026-04-28T07:00:00", name: "Easy run", distanceKm: 7.5, paceSPerKm: 320, avgHr: 138, isWorkout: false },
  ];
}

function rpeHistory(): RpeHistoryEntry[] {
  return [
    { date: "2026-04-23T07:00:00", distanceKm: 11.5, paceSPerKm: 252, isWorkout: true, rpeValue: 7, inferredIntent: "hard" },
    { date: "2026-04-25T07:00:00", distanceKm: 22.0, paceSPerKm: 305, isWorkout: false, rpeValue: 5, inferredIntent: "easy" },
  ];
}

export type DebriefFixture = {
  label: string;
  context: DebriefContext;
  /** Soft assertions on the generated body. */
  expect?: {
    minLength?: number;
    maxLength?: number;
    /** Substrings (case-insensitive) the body must contain. */
    mustContain?: string[];
    /** Substrings the body must NOT contain. */
    mustNotContain?: string[];
  };
};

export const DEBRIEF_FIXTURES: DebriefFixture[] = [
  {
    label: "debrief.steady-run.no-plan",
    context: steadyRunFixture(),
    expect: {
      minLength: 200,
      maxLength: 1600,
      mustNotContain: ["**", "##", "—"],
    },
  },
  {
    label: "debrief.workout-shape.with-plan",
    context: workoutShapeFixture(),
    expect: {
      minLength: 200,
      maxLength: 1600,
      mustNotContain: ["**", "##", "—"],
    },
  },
];
