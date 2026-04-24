"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAthlete } from "@/app/actions/onboarding";
import { advanceFrom } from "@/app/actions/onboarding";

export async function savePlanText(formData: FormData) {
  const raw = String(formData.get("plan_text") ?? "").trim();
  if (!raw) return;
  const { athlete } = await requireAthlete();
  const admin = createAdminClient();

  await admin.from("training_plans").insert({
    athlete_id: athlete.id,
    source: "text",
    raw_text: raw,
    is_active: true,
  });

  await admin
    .from("preferences")
    .upsert(
      { athlete_id: athlete.id, plan_follower_status: "following" },
      { onConflict: "athlete_id" },
    );

  await advanceFrom("plan");
}

export async function deferPlan() {
  const { athlete } = await requireAthlete();
  const admin = createAdminClient();

  await admin
    .from("preferences")
    .upsert(
      { athlete_id: athlete.id, plan_follower_status: "deferred" },
      { onConflict: "athlete_id" },
    );

  await advanceFrom("plan");
}

export async function optOutOfPlan() {
  const { athlete } = await requireAthlete();
  const admin = createAdminClient();

  await admin
    .from("preferences")
    .upsert(
      { athlete_id: athlete.id, plan_follower_status: "none" },
      { onConflict: "athlete_id" },
    );

  await advanceFrom("plan");
}
