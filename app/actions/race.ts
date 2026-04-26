"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAthlete } from "@/app/actions/onboarding";
import { advanceFrom } from "@/app/actions/onboarding";
import {
  appendSnapshot,
  confirmPendingSnapshot,
  rejectPendingSnapshot,
} from "@/lib/training-load/snapshots";
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
 * Append a snapshot from a race-time input. Pure data-path; no advance.
 * Used by both API consumers and the onboarding form below.
 */
async function persistRecentRace(
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

/**
 * Onboarding race input action. Engineering surface only — spec §11 marks
 * the UX (copy, layout, skip framing) as launch-prep work. Behind a
 * feature flag (`ONBOARDING_RACE_INPUT_FLAG`); the form submits to this
 * action which persists the snapshot and advances onboarding regardless
 * of whether the inputs were valid (to keep the athlete moving — invalid
 * input is logged but doesn't block the flow).
 */
export async function saveRecentRace(formData: FormData): Promise<void> {
  const result = await persistRecentRace(formData);
  if (!result.ok && result.reason === "invalid_inputs") {
    console.warn("recent-race onboarding: invalid_inputs", {
      preset: formData.get("preset"),
      time: formData.get("time"),
    });
  }
  await advanceFrom("recent-race");
}

export async function skipRecentRace(): Promise<void> {
  await advanceFrom("recent-race");
}

/**
 * API-shaped variant for callers that want the result back rather than
 * an onboarding redirect. Used by tests and any future settings surface.
 */
export async function saveRecentRaceApi(
  formData: FormData,
): Promise<SaveRecentRaceResult> {
  return persistRecentRace(formData);
}

/**
 * Confirm a pending-review snapshot — flips pending_review off and
 * triggers a recalc since the snapshot date. Per spec §11 the
 * athlete-facing surface is launch-prep work; this action is the
 * data-path the placeholder banner submits to.
 */
export async function confirmRaceSnapshot(formData: FormData): Promise<void> {
  const snapshotId = String(formData.get("snapshot_id") ?? "").trim();
  if (!snapshotId) return;
  const { athlete } = await requireAthlete();
  const activated = await confirmPendingSnapshot(athlete.id, snapshotId);
  scheduleRecalculation(athlete.id, activated.snapshotDate);
  revalidatePath("/app");
}

/**
 * Reject a pending-review snapshot — deletes it outright. The race was
 * a blow-up; the existing snapshot stays active.
 */
export async function rejectRaceSnapshot(formData: FormData): Promise<void> {
  const snapshotId = String(formData.get("snapshot_id") ?? "").trim();
  if (!snapshotId) return;
  const { athlete } = await requireAthlete();
  await rejectPendingSnapshot(athlete.id, snapshotId);
  revalidatePath("/app");
}
