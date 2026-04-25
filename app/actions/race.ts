"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { requireAthlete } from "@/app/actions/onboarding";
import { advanceFrom } from "@/app/actions/onboarding";
import { appendSnapshot } from "@/lib/training-load/snapshots";
import { vdotFromRace } from "@/lib/training-load/vdot";
import { scheduleRecalculation } from "@/lib/training-load/recalc";

const RACE_INPUT_FEATURE_FLAG_KEY = "ONBOARDING_RACE_INPUT_FLAG";

function raceInputEnabled(): boolean {
  const v = process.env[RACE_INPUT_FEATURE_FLAG_KEY];
  if (!v) return false;
  const lower = v.toLowerCase();
  return lower === "on" || lower === "1" || lower === "true";
}

const RACE_PRESET_DISTANCES_M: Record<string, number> = {
  "5k": 5_000,
  "10k": 10_000,
  half: 21_097.5,
  marathon: 42_195,
};

function resolveDistanceMeters(formData: FormData): number | null {
  const preset = String(formData.get("preset") ?? "").trim().toLowerCase();
  if (preset && RACE_PRESET_DISTANCES_M[preset] != null) {
    return RACE_PRESET_DISTANCES_M[preset];
  }
  const custom = String(formData.get("distance_m") ?? "").trim();
  if (!custom) return null;
  const n = Number(custom);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function parseGoalTime(raw: string): number | null {
  const v = raw.trim();
  if (!v) return null;
  const parts = v.split(":").map((p) => p.trim());
  if (parts.length < 2 || parts.length > 3) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;
  if (parts.length === 3) {
    const [h, m, s] = nums;
    return h * 3600 + m * 60 + s;
  }
  const [m, s] = nums;
  return m * 60 + s;
}

export async function saveGoalRace(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim() || null;
  const raceDateRaw = String(formData.get("race_date") ?? "").trim();
  const goalTimeRaw = String(formData.get("goal_time") ?? "").trim();

  const anyProvided = name || raceDateRaw || goalTimeRaw;
  if (!anyProvided) return advanceFrom("goal-race");

  const { athlete } = await requireAthlete();
  const admin = createAdminClient();

  const race_date = raceDateRaw || null;
  const goal_time_seconds = goalTimeRaw ? parseGoalTime(goalTimeRaw) : null;

  await admin.from("goal_races").insert({
    athlete_id: athlete.id,
    name,
    race_date,
    goal_time_seconds,
    is_active: true,
  });

  await advanceFrom("goal-race");
}

export async function skipGoalRace() {
  await advanceFrom("goal-race");
}

export type SaveRecentRaceResult =
  | { ok: true; vdot: number }
  | { ok: false; reason: "feature_disabled" | "invalid_inputs" };

/**
 * Onboarding race input. Engineering surface only — spec §11 marks the
 * UX (copy, layout, skip framing) as launch-prep work. Behind a feature
 * flag (`ONBOARDING_RACE_INPUT_FLAG`) so the data path can be exercised
 * end-to-end without committing to a surface in this iteration.
 *
 * On submission: derive VDOT from race time, append a high-confidence
 * snapshot dated to the race date, and schedule recalculation for the
 * athlete's full ingested history (their existing runs were on tier-2
 * defaults and now have a real threshold to score against).
 */
export async function saveRecentRace(
  formData: FormData,
): Promise<SaveRecentRaceResult> {
  if (!raceInputEnabled()) {
    return { ok: false, reason: "feature_disabled" };
  }

  const distanceMeters = resolveDistanceMeters(formData);
  const durationSeconds = parseGoalTime(String(formData.get("time") ?? ""));
  if (
    distanceMeters == null ||
    durationSeconds == null ||
    durationSeconds <= 0
  ) {
    return { ok: false, reason: "invalid_inputs" };
  }

  const dateRaw = String(formData.get("race_date") ?? "").trim();
  const snapshotDate =
    dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw)
      ? dateRaw
      : new Date().toISOString().slice(0, 10);

  const { athlete } = await requireAthlete();
  const vdot = vdotFromRace({ distanceMeters, durationSeconds });
  await appendSnapshot({
    athleteId: athlete.id,
    snapshotDate,
    source: "race",
    vdot,
    confidence: "high",
  });
  scheduleRecalculation(
    athlete.id,
    new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
  );
  return { ok: true, vdot };
}
