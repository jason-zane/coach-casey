"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { requireAthlete } from "@/app/actions/onboarding";
import { advanceFrom } from "@/app/actions/onboarding";

export async function markInstalledAndAdvance() {
  const { athlete } = await requireAthlete();
  const admin = createAdminClient();

  await admin
    .from("preferences")
    .upsert(
      {
        athlete_id: athlete.id,
        pwa_installed_at: new Date().toISOString(),
        push_enabled: true,
      },
      { onConflict: "athlete_id" },
    );

  await advanceFrom("install");
}

export async function skipInstall() {
  await advanceFrom("install");
}
