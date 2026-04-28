"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  type OnboardingStep,
  nextStep,
  stepOrderFor,
} from "@/lib/onboarding/steps";
import { kickOffHistoryBackfill } from "@/lib/strava/backfill";

export async function requireAthlete() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { data: athlete } = await supabase
    .from("athletes")
    .select("id, onboarding_current_step, onboarding_completed_at, deleted_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!athlete) redirect("/signin");
  // Soft-deleted accounts are signed out and cannot sign back in. The row
  // hangs around for the 30-day window before /api/cron/account-purge
  // calls auth.admin.deleteUser and the cascade removes everything.
  if (athlete.deleted_at) {
    await supabase.auth.signOut();
    redirect("/?deleted=1");
  }
  return { supabase, user, athlete };
}

export async function advanceFrom(current: OnboardingStep) {
  const { athlete } = await requireAthlete();
  const admin = createAdminClient();
  const ua = (await headers()).get("user-agent");
  const order = stepOrderFor(ua);
  const next = nextStep(current, order);

  if (next === "done") {
    return completeOnboarding();
  }

  await admin
    .from("athletes")
    .update({ onboarding_current_step: next })
    .eq("id", athlete.id);
  revalidatePath("/onboarding", "layout");
  redirect(`/onboarding/${next}`);
}

export async function completeOnboarding() {
  const { athlete } = await requireAthlete();
  const admin = createAdminClient();

  const trialDays = 14;
  const endsAt = new Date();
  endsAt.setDate(endsAt.getDate() + trialDays);

  await admin
    .from("athletes")
    .update({
      onboarding_completed_at: new Date().toISOString(),
      onboarding_current_step: "injury",
    })
    .eq("id", athlete.id);

  await admin
    .from("trials")
    .insert({ athlete_id: athlete.id, ends_at: endsAt.toISOString() });

  // Queue the long-history backfill. Cron picks it up and pulls up to two
  // years of activity summaries asynchronously, so onboarding completes
  // immediately and the deeper picture builds in the background. Mock
  // connections (preview mode) skip, there's no live Strava to call.
  const { data: conn } = await admin
    .from("strava_connections")
    .select("is_mock")
    .eq("athlete_id", athlete.id)
    .maybeSingle();
  if (conn && !(conn as { is_mock: boolean }).is_mock) {
    await kickOffHistoryBackfill(athlete.id, "two_years");
  }

  revalidatePath("/", "layout");
  redirect("/app");
}
