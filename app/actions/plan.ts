"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { requireAthlete } from "@/app/actions/onboarding";
import { advanceFrom } from "@/app/actions/onboarding";

type CoachingMode = "coach" | "self";

function readCoachingMode(formData: FormData | undefined): CoachingMode | null {
  if (!formData) return null;
  const v = String(formData.get("coaching_mode") ?? "").trim();
  return v === "coach" || v === "self" ? v : null;
}

async function writePreferences(
  athleteId: string,
  patch: { plan_follower_status: string; coaching_mode?: CoachingMode | null },
) {
  const admin = createAdminClient();
  const row: Record<string, unknown> = {
    athlete_id: athleteId,
    plan_follower_status: patch.plan_follower_status,
  };
  // Only write coaching_mode when the caller passed one. Leaving it
  // undefined preserves whatever's already on the row, so a deferred
  // athlete who later sets it on the profile page isn't clobbered by an
  // empty selection here.
  if (patch.coaching_mode !== undefined && patch.coaching_mode !== null) {
    row.coaching_mode = patch.coaching_mode;
  }
  await admin.from("preferences").upsert(row, { onConflict: "athlete_id" });
}

export async function savePlanText(formData: FormData) {
  const raw = String(formData.get("plan_text") ?? "").trim();
  if (!raw) return;
  const coachingMode = readCoachingMode(formData);
  const { athlete } = await requireAthlete();
  const admin = createAdminClient();

  await admin.from("training_plans").insert({
    athlete_id: athlete.id,
    source: "text",
    raw_text: raw,
    is_active: true,
  });

  await writePreferences(athlete.id, {
    plan_follower_status: "following",
    coaching_mode: coachingMode,
  });

  await advanceFrom("plan");
}

export async function deferPlan(formData?: FormData) {
  const coachingMode = readCoachingMode(formData);
  const { athlete } = await requireAthlete();

  await writePreferences(athlete.id, {
    plan_follower_status: "deferred",
    coaching_mode: coachingMode,
  });

  await advanceFrom("plan");
}

export async function optOutOfPlan() {
  const { athlete } = await requireAthlete();

  await writePreferences(athlete.id, {
    plan_follower_status: "none",
    // Self-directed by definition when there's no plan.
    coaching_mode: "self",
  });

  await advanceFrom("plan");
}
