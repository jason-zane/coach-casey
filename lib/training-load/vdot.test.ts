import { describe, expect, it } from "vitest";
import {
  paceZonesFromVdot,
  profileFromRace,
  vdotFromRace,
} from "./vdot";

// Reference points from Daniels' Running Formula tables. Tolerances are
// generous (±1 VDOT, ±5 s/km) — the equation is an approximation; the
// tables themselves carry rounding.
function expectClose(actual: number, expected: number, tolerance: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

describe("vdotFromRace", () => {
  it("matches a 20:00 5K (≈ VDOT 50)", () => {
    const v = vdotFromRace({ distanceMeters: 5_000, durationSeconds: 1_200 });
    expectClose(v, 50, 1);
  });

  it("matches a 40:00 10K (≈ VDOT 50)", () => {
    const v = vdotFromRace({ distanceMeters: 10_000, durationSeconds: 2_400 });
    expectClose(v, 51, 2);
  });

  it("matches a 1:30:00 half marathon (≈ VDOT 51)", () => {
    const v = vdotFromRace({
      distanceMeters: 21_097.5,
      durationSeconds: 5_400,
    });
    expectClose(v, 51, 2);
  });

  it("matches a 3:00:00 marathon (≈ VDOT 53.5)", () => {
    const v = vdotFromRace({ distanceMeters: 42_195, durationSeconds: 10_800 });
    expectClose(v, 53.5, 1);
  });

  it("handles a fast 5K (18:00 ≈ VDOT 56)", () => {
    const v = vdotFromRace({ distanceMeters: 5_000, durationSeconds: 1_080 });
    expectClose(v, 56, 1.5);
  });

  it("handles a slower 10K (50:00 ≈ VDOT 39–40)", () => {
    const v = vdotFromRace({ distanceMeters: 10_000, durationSeconds: 3_000 });
    expectClose(v, 40, 1.5);
  });

  it("rejects non-positive distance", () => {
    expect(() =>
      vdotFromRace({ distanceMeters: 0, durationSeconds: 1_200 }),
    ).toThrow();
    expect(() =>
      vdotFromRace({ distanceMeters: -1, durationSeconds: 1_200 }),
    ).toThrow();
  });

  it("rejects non-positive duration", () => {
    expect(() =>
      vdotFromRace({ distanceMeters: 5_000, durationSeconds: 0 }),
    ).toThrow();
  });

  it("produces a higher VDOT for a faster time at the same distance", () => {
    const slow = vdotFromRace({ distanceMeters: 5_000, durationSeconds: 1_500 });
    const fast = vdotFromRace({ distanceMeters: 5_000, durationSeconds: 1_080 });
    expect(fast).toBeGreaterThan(slow);
  });

  it("produces a higher VDOT for a longer race at proportional pace", () => {
    // Same average pace (4:00/km) at different distances; longer race
    // implies a higher sustained percentage of VO2max → higher VDOT.
    const tenK = vdotFromRace({ distanceMeters: 10_000, durationSeconds: 2_400 });
    const halfM = vdotFromRace({
      distanceMeters: 21_097.5,
      durationSeconds: 5_063,
    });
    expect(halfM).toBeGreaterThan(tenK);
  });
});

describe("paceZonesFromVdot", () => {
  it("produces an ordered set of zones for a fit athlete", () => {
    const zones = paceZonesFromVdot(53.5);
    // Faster paces (higher %vVO2max) translate to lower s/km.
    expect(zones.repetitionPaceSecPerKm).toBeLessThan(zones.intervalPaceSecPerKm);
    expect(zones.intervalPaceSecPerKm).toBeLessThan(zones.thresholdPaceSecPerKm);
    expect(zones.thresholdPaceSecPerKm).toBeLessThan(zones.marathonPaceSecPerKm);
    // Easy is a band: low (slowest) > high (fastest).
    expect(zones.easyPaceSecPerKmLow).toBeGreaterThan(zones.easyPaceSecPerKmHigh);
    // Easy fast end is still slower than marathon pace.
    expect(zones.easyPaceSecPerKmHigh).toBeGreaterThan(zones.marathonPaceSecPerKm);
  });

  it("yields a threshold pace near 4:00/km for a sub-3:00 marathoner", () => {
    const zones = paceZonesFromVdot(53.5);
    expectClose(zones.thresholdPaceSecPerKm, 240, 10);
  });

  it("rejects a non-positive vdot", () => {
    expect(() => paceZonesFromVdot(0)).toThrow();
    expect(() => paceZonesFromVdot(-10)).toThrow();
  });
});

describe("profileFromRace", () => {
  it("returns a snapshot-ready profile", () => {
    const profile = profileFromRace({
      distanceMeters: 10_000,
      durationSeconds: 2_400,
    });
    expect(profile.vdot).toBeGreaterThan(0);
    expect(profile.zones.thresholdPaceSecPerKm).toBeGreaterThan(0);
    expect(profile.zones.thresholdPaceSecPerKm).toBeLessThan(
      profile.zones.marathonPaceSecPerKm,
    );
  });
});
