"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { requireAthlete } from "@/app/actions/onboarding";
import { advanceFrom } from "@/app/actions/onboarding";

export async function markInstalledAndAdvance() {
  const { athlete } = await requireAthlete();
  const admin = createAdminClient();

  // push_enabled is left untouched here. The notifications step that runs
  // immediately after install is what actually flips it (if the athlete
  // grants permission and we successfully store a push subscription).
  await admin
    .from("preferences")
    .upsert(
      {
        athlete_id: athlete.id,
        pwa_installed_at: new Date().toISOString(),
      },
      { onConflict: "athlete_id" },
    );

  await advanceFrom("install");
}

export async function skipInstall() {
  await advanceFrom("install");
}
