import type {
  WeeklyReviewContext,
} from "@/lib/thread/weekly-review-context";

function planFollowingWeek(): WeeklyReviewContext {
  return {
    athleteId: "fixture-athlete",
    displayName: "Sam",
    sex: "M",
    weightKg: 72,
    ageYears: 36,
    weekStartIso: "2026-04-27",
    weekEndIso: "2026-05-03",
    coachingMode: "self",
    weekRuns: [
      { date: "2026-04-27T06:30:00", name: "Easy run", distanceKm: 8.0, paceSPerKm: 320, avgHr: 138, isWorkout: false },
      { date: "2026-04-28T17:30:00", name: "5x1km @ threshold", distanceKm: 12.4, paceSPerKm: 247, avgHr: 158, isWorkout: true },
      { date: "2026-04-30T06:30:00", name: "Easy run", distanceKm: 8.0, paceSPerKm: 320, avgHr: 138, isWorkout: false },
      { date: "2026-05-02T08:00:00", name: "Long run", distanceKm: 24.0, paceSPerKm: 305, avgHr: 145, isWorkout: false },
      { date: "2026-05-03T07:30:00", name: "Easy recovery", distanceKm: 6.0, paceSPerKm: 340, avgHr: 130, isWorkout: false },
    ],
    weekCrossTraining: [
      { date: "2026-04-29T06:00:00", name: "Morning Ride", activityType: "Ride", durationMinutes: 75, distanceKm: 32.5 },
    ],
    weekRunCount: 5,
    weekRunKm: 58.4,
    arcWeeks: [
      { weekStart: "2026-03-30", km: 42.0, runCount: 4 },
      { weekStart: "2026-04-06", km: 50.5, runCount: 5 },
      { weekStart: "2026-04-13", km: 53.2, runCount: 5 },
      { weekStart: "2026-04-20", km: 55.7, runCount: 5 },
    ],
    arcRuns: [],
    activePlanText:
      "## Week of 2026-04-27\n- Mon: easy 8km\n- Tue: 5x1km @ threshold\n- Wed: cross-train\n- Thu: easy 8km\n- Fri: rest\n- Sat: long run 24km\n- Sun: easy recovery 6km",
    activePlanUploadedAt: "2026-04-15T10:00:00Z",
    injuries: [
      {
        kind: "injury",
        content: "Right calf, flares on faster work",
        tags: ["calf"],
        createdAt: "2026-04-10T10:00:00Z",
      },
    ],
    lifeContext: [],
    goalRaces: [
      {
        name: "Sydney Marathon",
        raceDate: "2026-09-20",
        goalTimeSeconds: 3 * 3600 + 15 * 60,
      },
    ],
    priorWeeklyReviews: [],
    priorDebriefBodies: [],
  };
}

function emptyWeek(): WeeklyReviewContext {
  return {
    athleteId: "fixture-athlete",
    displayName: "Sam",
    sex: "M",
    weightKg: 72,
    ageYears: 36,
    weekStartIso: "2026-04-27",
    weekEndIso: "2026-05-03",
    coachingMode: null,
    weekRuns: [],
    weekCrossTraining: [],
    weekRunCount: 0,
    weekRunKm: 0,
    arcWeeks: [
      { weekStart: "2026-04-06", km: 50.5, runCount: 5 },
      { weekStart: "2026-04-13", km: 53.2, runCount: 5 },
      { weekStart: "2026-04-20", km: 55.7, runCount: 5 },
    ],
    arcRuns: [],
    activePlanText: null,
    activePlanUploadedAt: null,
    injuries: [],
    lifeContext: [],
    goalRaces: [],
    priorWeeklyReviews: [],
    priorDebriefBodies: [],
  };
}

export type WeeklyReviewFixture = {
  label: string;
  context: WeeklyReviewContext;
  /** When set, the gate is expected to skip with this reason. */
  expectSkip?: string;
  /** Soft assertions when generation runs. */
  expect?: {
    minLength?: number;
    maxLength?: number;
    mustContain?: string[];
    mustNotContain?: string[];
  };
};

export const WEEKLY_REVIEW_FIXTURES: WeeklyReviewFixture[] = [
  {
    label: "weekly-review.plan-following-week",
    context: planFollowingWeek(),
    expect: {
      minLength: 200,
      maxLength: 2400,
      mustNotContain: ["**", "##", "—"],
    },
  },
  {
    label: "weekly-review.empty-week",
    context: emptyWeek(),
    expectSkip: "no_activity",
  },
];
