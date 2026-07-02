"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { signupsOpen } from "@/lib/auth/invite";
import {
  type OnboardingStep,
  nextStep,
  stepIsAhead,
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
    .select(
      "id, onboarding_current_step, onboarding_completed_at, date_of_birth, deleted_at, signup_authorized_at",
    )
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
  // Invite gate: accounts minted around it (see lib/auth/invite.ts) are
  // blocked at the proxy on every request; mirror it here so a leftover
  // session can't drive server actions directly while signups are closed.
  if (!athlete.signup_authorized_at && !signupsOpen()) {
    await supabase.auth.signOut();
    redirect("/signin?error=invite_required");
  }
  return { supabase, user, athlete };
}

export async function advanceFrom(current: OnboardingStep) {
  const { athlete } = await requireAthlete();
  const admin = createAdminClient();
  const ua = (await headers()).get("user-agent");
  const order = stepOrderFor(ua);

  // Step completion is positional (current → current + 1), so `current` must
  // never be a step the athlete hasn't reached: accepting it would mark every
  // step in between done without them ever rendering. The middleware gates
  // page loads the same way; this covers direct action invocation.
  const cursor = (athlete.onboarding_current_step ?? "strava") as OnboardingStep;
  if (stepIsAhead(current, cursor, order)) {
    redirect(`/onboarding/${cursor}`);
  }

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

  // Completion invariant: an athlete with onboarding_completed_at set but no
  // date_of_birth is locked out of /app by the DOB-backfill hold, so never
  // mint that state — park them back on about-you instead.
  if (!athlete.date_of_birth) {
    await admin
      .from("athletes")
      .update({ onboarding_current_step: "about-you" })
      .eq("id", athlete.id);
    revalidatePath("/onboarding", "layout");
    redirect("/onboarding/about-you");
  }

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
