"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { requireAthlete } from "@/app/actions/onboarding";
import { advanceFrom } from "@/app/actions/onboarding";

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
