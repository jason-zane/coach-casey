import { describe, expect, it } from "vitest";
import { isRaceCandidate } from "./race-detect";

describe("isRaceCandidate", () => {
  it("trusts the explicit Strava race tag (workout_type=1)", () => {
    expect(
      isRaceCandidate({
        name: "Random outing",
        movingTimeS: 1_800,
        distanceM: 5_000,
        stravaWorkoutType: 1,
      }),
    ).toBe(true);
  });

  it("recognises common race-keyword titles in the plausible duration window", () => {
    const titles = [
      "Sydney Marathon 2026",
      "Adelaide half marathon",
      "Bridge to Brisbane 10K",
      "Park 5K time trial",
      "parkrun #1234",
      "Race day!",
    ];
    for (const name of titles) {
      expect(
        isRaceCandidate({
          name,
          movingTimeS: 30 * 60,
          distanceM: 10_000,
          stravaWorkoutType: null,
        }),
      ).toBe(true);
    }
  });

  it("rejects activities below the 15-minute floor", () => {
    expect(
      isRaceCandidate({
        name: "5K race tune-up",
        movingTimeS: 14 * 60,
        distanceM: 3_000,
        stravaWorkoutType: null,
      }),
    ).toBe(false);
  });

  it("rejects ultras above the 6-hour ceiling", () => {
    expect(
      isRaceCandidate({
        name: "12hr ultra",
        movingTimeS: 12 * 60 * 60,
        distanceM: 100_000,
        stravaWorkoutType: 1,
      }),
    ).toBe(false);
  });

  it("rejects activities with no matching keyword and no Strava flag", () => {
    expect(
      isRaceCandidate({
        name: "Sunday long run",
        movingTimeS: 60 * 60,
        distanceM: 20_000,
        stravaWorkoutType: null,
      }),
    ).toBe(false);
  });

  it("matches case-insensitively", () => {
    expect(
      isRaceCandidate({
        name: "PARKRUN PB",
        movingTimeS: 22 * 60,
        distanceM: 5_000,
        stravaWorkoutType: null,
      }),
    ).toBe(true);
  });

  it("rejects when distance or duration is missing", () => {
    expect(
      isRaceCandidate({
        name: "Marathon",
        movingTimeS: null,
        distanceM: 42_195,
        stravaWorkoutType: 1,
      }),
    ).toBe(false);
    expect(
      isRaceCandidate({
        name: "Marathon",
        movingTimeS: 10_800,
        distanceM: null,
        stravaWorkoutType: 1,
      }),
    ).toBe(false);
  });
});
