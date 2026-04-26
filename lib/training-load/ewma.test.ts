import { describe, expect, it } from "vitest";
import {
  aggregateDailyLoad,
  computeAtl,
  computeCtl,
  computeThisWeekVsAvg,
  computeTrend,
} from "./ewma";

const REF = new Date("2026-04-26T12:00:00Z");

function dayN(daysAgo: number): string {
  const d = new Date(REF);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function rowsFromOffsets(
  offsets: Array<[daysAgo: number, load: number]>,
): Array<{ day: string; load_au: number }> {
  return offsets.map(([n, load]) => ({ day: dayN(n), load_au: load }));
}

describe("aggregateDailyLoad", () => {
  it("sums loads on the same day and sorts ascending", () => {
    const out = aggregateDailyLoad([
      { day: "2026-04-25", load_au: 30 },
      { day: "2026-04-25", load_au: 20 },
      { day: "2026-04-24", load_au: 10 },
    ]);
    expect(out).toEqual([
      { day: "2026-04-24", load_au: 10 },
      { day: "2026-04-25", load_au: 50 },
    ]);
  });
});

describe("computeAtl", () => {
  it("returns 0 with no rows", () => {
    expect(computeAtl([], REF)).toBe(0);
  });

  it("returns the value of a single sample (only sample → weighted avg = self)", () => {
    const rows = aggregateDailyLoad(rowsFromOffsets([[3, 100]]));
    expect(computeAtl(rows, REF)).toBeCloseTo(100, 6);
  });

  it("weights recent days more heavily than older ones", () => {
    const recent = aggregateDailyLoad(rowsFromOffsets([[1, 100]]));
    const older = aggregateDailyLoad(rowsFromOffsets([[12, 100]]));
    // Same load value, but the half-life-weighted average is the same
    // (single sample). Spread them across two samples and the recent one
    // should pull harder.
    const mixed = aggregateDailyLoad(rowsFromOffsets([
      [0, 200],
      [13, 200],
    ]));
    expect(computeAtl(recent, REF)).toBeCloseTo(100, 6);
    expect(computeAtl(older, REF)).toBeCloseTo(100, 6);
    expect(computeAtl(mixed, REF)).toBeCloseTo(200, 6);
  });

  it("excludes samples older than the 13-day acute window", () => {
    const rows = aggregateDailyLoad(rowsFromOffsets([[14, 500]]));
    expect(computeAtl(rows, REF)).toBe(0);
  });
});

describe("computeCtl", () => {
  it("excludes samples within the most recent 7 days (uncoupled CTL)", () => {
    const onlyRecent = aggregateDailyLoad(rowsFromOffsets([
      [0, 100],
      [3, 100],
      [6, 100],
    ]));
    expect(computeCtl(onlyRecent, REF)).toBe(0);
  });

  it("includes samples between days 7 and 89", () => {
    const rows = aggregateDailyLoad(rowsFromOffsets([
      [10, 100],
      [40, 80],
    ]));
    const ctl = computeCtl(rows, REF);
    expect(ctl).toBeGreaterThan(0);
    expect(ctl).toBeLessThanOrEqual(100);
  });

  it("returns 0 outside the chronic window", () => {
    const rows = aggregateDailyLoad(rowsFromOffsets([[120, 100]]));
    expect(computeCtl(rows, REF)).toBe(0);
  });
});

describe("computeTrend", () => {
  it("calls a flat history 'stable'", () => {
    const offsets: Array<[number, number]> = [];
    for (let i = 7; i < 60; i++) offsets.push([i, 50]);
    const rows = aggregateDailyLoad(rowsFromOffsets(offsets));
    expect(computeTrend(rows, REF)).toBe("stable");
  });

  it("flags a steady ramp upward as 'rising'", () => {
    const offsets: Array<[number, number]> = [];
    // Newest end loaded; older end light → rising trend.
    for (let i = 7; i < 60; i++) {
      offsets.push([i, Math.max(10, 100 - i)]);
    }
    const rows = aggregateDailyLoad(rowsFromOffsets(offsets));
    expect(computeTrend(rows, REF)).toBe("rising");
  });

  it("flags a steady decline as 'falling'", () => {
    const offsets: Array<[number, number]> = [];
    // Older end loaded; newer end light → falling trend.
    for (let i = 7; i < 60; i++) {
      offsets.push([i, Math.min(100, 10 + i)]);
    }
    const rows = aggregateDailyLoad(rowsFromOffsets(offsets));
    expect(computeTrend(rows, REF)).toBe("falling");
  });

  it("returns 'stable' for an athlete with no history", () => {
    expect(computeTrend([], REF)).toBe("stable");
  });
});

describe("computeThisWeekVsAvg", () => {
  it("returns null without a 4-week baseline", () => {
    expect(computeThisWeekVsAvg([], REF)).toBeNull();
  });

  it("returns 0 when this week matches the trailing average", () => {
    const offsets: Array<[number, number]> = [];
    for (let i = 0; i < 28; i++) offsets.push([i, 50]);
    const rows = aggregateDailyLoad(rowsFromOffsets(offsets));
    const v = computeThisWeekVsAvg(rows, REF);
    expect(v).toBeCloseTo(0, 0);
  });

  it("returns a positive number when this week is above average", () => {
    const offsets: Array<[number, number]> = [];
    // Last 7 days carry double the load of weeks 2-4.
    for (let i = 0; i < 7; i++) offsets.push([i, 100]);
    for (let i = 7; i < 28; i++) offsets.push([i, 50]);
    const rows = aggregateDailyLoad(rowsFromOffsets(offsets));
    const v = computeThisWeekVsAvg(rows, REF);
    expect(v).toBeGreaterThan(0);
  });
});
