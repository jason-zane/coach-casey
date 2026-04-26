import { describe, expect, it } from "vitest";
import { calculateLoad } from "./load";
import { paceZonesFromVdot } from "./vdot";
import {
  aggregateDailyLoad,
  computeAtl,
  computeCtl,
  computeTrend,
} from "./ewma";
import {
  ALL_FIXTURES,
  freshAthlete,
  mixedDisciplineAthlete,
  richHistoryRunner,
  shadowOnlyRunner,
  type FixtureActivity,
  type FixtureAthlete,
} from "./fixtures";

const REFERENCE = new Date("2026-04-26T12:00:00Z");

function snapshotThresholdAtDate(
  athlete: FixtureAthlete,
  daysAgo: number,
): number | null {
  // Mirrors `getSnapshotAtDate` in the production path: pick the most
  // recent snapshot at or before the given offset. Tests rely on this
  // staying in sync with the spec's "active threshold at activity date"
  // semantic.
  const candidates = athlete.snapshots
    .filter((s) => s.snapshotDateOffsetDays >= -Math.abs(daysAgo) - 365)
    .filter((s) => s.snapshotDateOffsetDays <= -daysAgo)
    .sort((a, b) => b.snapshotDateOffsetDays - a.snapshotDateOffsetDays);
  if (candidates.length === 0) return null;
  return paceZonesFromVdot(candidates[0].vdot).thresholdPaceSecPerKm;
}

function loadForActivity(
  athlete: FixtureAthlete,
  activity: FixtureActivity,
): { au: number | null; method: string | null; day: string } {
  const threshold = snapshotThresholdAtDate(
    athlete,
    Math.abs(activity.startDateOffsetDays),
  );
  const result = calculateLoad(activity, { thresholdPaceSecPerKm: threshold });
  const day = new Date(REFERENCE);
  day.setUTCDate(day.getUTCDate() + activity.startDateOffsetDays);
  return {
    au: result?.loadAu ?? null,
    method: result?.loadMethod ?? null,
    day: day.toISOString().slice(0, 10),
  };
}

function loadPictureFor(athlete: FixtureAthlete) {
  const rows = athlete.activities
    .map((a) => loadForActivity(athlete, a))
    .filter((r): r is { au: number; method: string; day: string } => r.au != null && r.method != null)
    .map((r) => ({ day: r.day, load_au: r.au }));
  const daily = aggregateDailyLoad(rows);
  return {
    atl: computeAtl(daily, REFERENCE),
    ctl: computeCtl(daily, REFERENCE),
    trend: computeTrend(daily, REFERENCE),
    rows: daily,
  };
}

describe("fixture: richHistoryRunner", () => {
  it("scores recent runs (post-race) via tier-1 (pace_rtss)", () => {
    const raceOffset = richHistoryRunner.snapshots[0]!.snapshotDateOffsetDays;
    const recent = richHistoryRunner.activities.filter(
      (a) => a.startDateOffsetDays >= raceOffset,
    );
    expect(recent.length).toBeGreaterThan(0);
    for (const a of recent) {
      const r = loadForActivity(richHistoryRunner, a);
      expect(r.method).toBe("pace_rtss");
      expect(r.au).toBeGreaterThan(0);
    }
  });

  it("scores pre-race history via tier-2 (the threshold wasn't active yet)", () => {
    const raceOffset = richHistoryRunner.snapshots[0]!.snapshotDateOffsetDays;
    const old = richHistoryRunner.activities.filter(
      (a) => a.startDateOffsetDays < raceOffset,
    );
    expect(old.length).toBeGreaterThan(0);
    for (const a of old) {
      const r = loadForActivity(richHistoryRunner, a);
      expect(r.method).toBe("duration_default");
    }
  });

  it("yields a meaningful chronic baseline", () => {
    const pic = loadPictureFor(richHistoryRunner);
    expect(pic.atl).toBeGreaterThan(0);
    expect(pic.ctl).toBeGreaterThan(0);
    // 12 weeks of steady volume should not flag as a sharp ramp.
    expect(pic.trend).toBe("stable");
  });
});

describe("fixture: shadowOnlyRunner", () => {
  it("marks the snapshot as low confidence", () => {
    expect(shadowOnlyRunner.snapshots[0]?.confidence).toBe("low");
  });

  it("scores runs via tier-1 (the shadow snapshot is still a valid threshold)", () => {
    for (const a of shadowOnlyRunner.activities) {
      const r = loadForActivity(shadowOnlyRunner, a);
      expect(r.method).toBe("pace_rtss");
    }
  });
});

describe("fixture: freshAthlete", () => {
  it("scores every run via tier-2 (duration_default)", () => {
    for (const a of freshAthlete.activities) {
      const r = loadForActivity(freshAthlete, a);
      expect(r.method).toBe("duration_default");
    }
  });

  it("has no chronic baseline (CTL = 0) yet", () => {
    const pic = loadPictureFor(freshAthlete);
    expect(pic.ctl).toBe(0);
    // ATL is non-zero when activities exist within the last 13 days.
    expect(pic.atl).toBeGreaterThan(0);
  });
});

describe("fixture: mixedDisciplineAthlete", () => {
  it("uses tier-3 for non-run activities", () => {
    const nonRuns = mixedDisciplineAthlete.activities.filter(
      (a) => a.activityType !== "Run",
    );
    expect(nonRuns.length).toBeGreaterThan(0);
    for (const a of nonRuns) {
      const r = loadForActivity(mixedDisciplineAthlete, a);
      expect(r.method).toBe("cross_training");
    }
  });

  it("uses tier-1 for runs", () => {
    const runs = mixedDisciplineAthlete.activities.filter(
      (a) => a.activityType === "Run",
    );
    for (const a of runs) {
      const r = loadForActivity(mixedDisciplineAthlete, a);
      expect(r.method).toBe("pace_rtss");
    }
  });
});

describe("fixtures", () => {
  it("exposes all four required profiles", () => {
    expect(ALL_FIXTURES).toHaveLength(4);
    const ids = new Set(ALL_FIXTURES.map((f) => f.id));
    expect(ids.size).toBe(4);
  });
});
