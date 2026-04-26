import { describe, expect, it } from "vitest";
import { averageGapSecPerKm, type StravaStream } from "./client";

function stream(values: number[]): StravaStream {
  return { type: "grade_adjusted_distance", data: values };
}

describe("averageGapSecPerKm", () => {
  it("computes pace from the cumulative grade-adjusted distance stream", () => {
    // 10 km grade-adjusted in 50 min → 5:00/km = 300 s/km
    const streams = { grade_adjusted_distance: stream([0, 5_000, 10_000]) };
    expect(averageGapSecPerKm(streams, 3_000)).toBe(300);
  });

  it("returns null when the stream is missing", () => {
    expect(averageGapSecPerKm({}, 3_000)).toBeNull();
  });

  it("returns null when moving time is zero", () => {
    const streams = { grade_adjusted_distance: stream([0, 5_000, 10_000]) };
    expect(averageGapSecPerKm(streams, 0)).toBeNull();
  });

  it("returns null when the stream is empty", () => {
    expect(averageGapSecPerKm({ grade_adjusted_distance: stream([]) }, 3_000)).toBeNull();
  });

  it("recognises a flat run (GAP ≈ raw pace)", () => {
    const streams = { grade_adjusted_distance: stream([0, 1_000, 2_000, 5_000]) };
    expect(averageGapSecPerKm(streams, 1_500)).toBe(300);
  });
});
