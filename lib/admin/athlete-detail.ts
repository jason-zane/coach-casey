import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Admin-only reads for a single athlete's detail page. Each loader is
 * resilient (returns empty/null on error) so one missing slice never takes
 * down the whole page. Service-role throughout, behind requireAdmin.
 */

export type AthleteAdminCore = {
  id: string;
  userId: string;
  email: string | null;
  displayName: string | null;
  isTestUser: boolean;
  createdAt: string;
  onboardingCompletedAt: string | null;
  onboardingCurrentStep: string | null;
  deletedAt: string | null;
  lastSignInAt: string | null;
};

export async function loadAthleteAdminCore(
  athleteId: string,
): Promise<AthleteAdminCore | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("athletes")
    .select(
      "id, user_id, email, display_name, is_test_user, created_at, onboarding_completed_at, onboarding_current_step, deleted_at",
    )
    .eq("id", athleteId)
    .maybeSingle<{
      id: string;
      user_id: string;
      email: string | null;
      display_name: string | null;
      is_test_user: boolean | null;
      created_at: string;
      onboarding_completed_at: string | null;
      onboarding_current_step: string | null;
      deleted_at: string | null;
    }>();
  if (error || !data) return null;

  // last_sign_in lives on the auth user, not the athlete row. Best-effort.
  let lastSignInAt: string | null = null;
  try {
    const { data: userRes } = await admin.auth.admin.getUserById(data.user_id);
    lastSignInAt = userRes.user?.last_sign_in_at ?? null;
  } catch {
    /* auth admin unavailable — show "—" rather than failing the page */
  }

  return {
    id: data.id,
    userId: data.user_id,
    email: data.email,
    displayName: data.display_name,
    isTestUser: data.is_test_user === true,
    createdAt: data.created_at,
    onboardingCompletedAt: data.onboarding_completed_at,
    onboardingCurrentStep: data.onboarding_current_step,
    deletedAt: data.deleted_at,
    lastSignInAt,
  };
}

export type AdminActivityRow = {
  id: string;
  startDateLocal: string;
  name: string | null;
  activityType: string | null;
  distanceM: number | null;
  movingTimeS: number | null;
  avgHr: number | null;
  avgPaceSPerKm: number | null;
};

export async function loadRecentActivities(
  athleteId: string,
  limit = 15,
): Promise<AdminActivityRow[]> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("activities")
      .select(
        "id, start_date_local, name, activity_type, distance_m, moving_time_s, avg_hr, avg_pace_s_per_km",
      )
      .eq("athlete_id", athleteId)
      .order("start_date_local", { ascending: false })
      .limit(limit);
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      startDateLocal: r.start_date_local as string,
      name: (r.name as string | null) ?? null,
      activityType: (r.activity_type as string | null) ?? null,
      distanceM: (r.distance_m as number | null) ?? null,
      movingTimeS: (r.moving_time_s as number | null) ?? null,
      avgHr: (r.avg_hr as number | null) ?? null,
      avgPaceSPerKm: (r.avg_pace_s_per_km as number | null) ?? null,
    }));
  } catch {
    return [];
  }
}

export type AdminCaseyMessage = {
  id: string;
  kind: string;
  body: string;
  createdAt: string;
};

/** Casey-authored output (debriefs, weekly reviews, cross-training acks). */
export async function loadRecentCaseyMessages(
  athleteId: string,
  limit = 12,
): Promise<AdminCaseyMessage[]> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("messages")
      .select("id, kind, body, created_at")
      .eq("athlete_id", athleteId)
      .in("kind", ["debrief", "weekly_review", "cross_training_ack"])
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      kind: r.kind as string,
      body: (r.body as string | null) ?? "",
      createdAt: r.created_at as string,
    }));
  } catch {
    return [];
  }
}
