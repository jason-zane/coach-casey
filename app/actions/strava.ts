"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAthlete } from "@/app/actions/onboarding";
import { isDevMode, isLiveMode } from "@/lib/strava/client";

/**
 * Strava connect entry point. Writes the connection record quickly, then
 * redirects to /onboarding/reading which runs the activity pull behind a
 * designed loading moment. Ingest is NOT run here so the athlete sees the
 * reading-state surface instead of a blank page during the 10-20s pull.
 */
export async function connectStrava() {
  if (isLiveMode()) {
    redirect("/api/strava/authorize");
  }
  if (isDevMode()) {
    return connectStravaDev();
  }
  return connectStravaMock();
}

async function connectStravaDev() {
  const { athlete } = await requireAthlete();
  const admin = createAdminClient();

  const accessToken = process.env.STRAVA_DEV_ACCESS_TOKEN!;
  const refreshToken = process.env.STRAVA_DEV_REFRESH_TOKEN!;
  const expiresAtSec = Number(process.env.STRAVA_DEV_EXPIRES_AT ?? 0);
  const expiresAt =
    expiresAtSec > 0
      ? new Date(expiresAtSec * 1000).toISOString()
      : new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();

  await admin.from("strava_connections").upsert(
    {
      athlete_id: athlete.id,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt,
      scope: "read,activity:read_all,profile:read_all",
      is_mock: false,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "athlete_id" },
  );

  revalidatePath("/onboarding", "layout");
  redirect("/onboarding/reading");
}

async function connectStravaMock() {
  const { athlete } = await requireAthlete();
  const admin = createAdminClient();

  await admin.from("strava_connections").upsert(
    {
      athlete_id: athlete.id,
      is_mock: true,
      scope: "read_all,profile:read_all",
      connected_at: new Date().toISOString(),
    },
    { onConflict: "athlete_id" },
  );

  revalidatePath("/onboarding", "layout");
  redirect("/onboarding/reading");
}
