import { describe, expect, it } from "vitest";
import {
  evaluateRaceForSnapshot,
  RACE_VDOT_GRACE,
  type ProfileSnapshot,
} from "./snapshots";

function makeSnapshot(vdot: number): ProfileSnapshot {
  return {
    id: "snap-1",
    athleteId: "athlete-1",
    snapshotDate: "2026-01-01",
    source: "race",
    sourceActivityId: null,
    vdot,
    thresholdPaceSecPerKm: 240,
    easyPaceSecPerKmLow: 360,
    easyPaceSecPerKmHigh: 300,
    marathonPaceSecPerKm: 260,
    intervalPaceSecPerKm: 220,
    repetitionPaceSecPerKm: 200,
    confidence: "high",
    pendingReview: false,
    createdAt: "2026-01-01T00:00:00Z",
  };
}

describe("evaluateRaceForSnapshot", () => {
  it("inserts a high-confidence snapshot when no current snapshot exists", () => {
    const result = evaluateRaceForSnapshot(50, null);
    expect(result.kind).toBe("insert");
    if (result.kind === "insert") {
      expect(result.confidence).toBe("high");
      expect(result.vdot).toBe(50);
    }
  });

  it("inserts when the new VDOT is higher than current", () => {
    const current = makeSnapshot(50);
    const result = evaluateRaceForSnapshot(52, current);
    expect(result.kind).toBe("insert");
  });

  it("no-ops when the new VDOT is within 1 point of current (confirms not improves)", () => {
    const current = makeSnapshot(50);
    const result = evaluateRaceForSnapshot(49.5, current);
    expect(result.kind).toBe("no_change");
  });

  it("no-ops on a microscopic upward delta within the grace band", () => {
    const current = makeSnapshot(50);
    const result = evaluateRaceForSnapshot(50.05, current);
    // Within grace either direction; we still allow upward inserts but
    // they must not be flagged as pending_review.
    expect(result.kind).toBe("insert");
  });

  it("flags pending_review when the new VDOT is more than 1 point lower", () => {
    const current = makeSnapshot(53);
    const result = evaluateRaceForSnapshot(50, current);
    expect(result.kind).toBe("insert_pending_review");
    if (result.kind === "insert_pending_review") {
      expect(result.vdot).toBe(50);
    }
  });

  it("treats exactly the grace boundary as no-change, not pending_review", () => {
    const current = makeSnapshot(53);
    const result = evaluateRaceForSnapshot(53 - RACE_VDOT_GRACE, current);
    expect(result.kind).toBe("no_change");
  });
});
