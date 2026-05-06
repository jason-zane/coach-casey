import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

export type AdminAthleteRow = {
  id: string;
  email: string | null;
  displayName: string | null;
  isTestUser: boolean;
  createdAt: string;
  onboardingCompletedAt: string | null;
  /** Most recent activity start time, null when no activities. */
  lastActivityAt: string | null;
  /** Most recent debrief or weekly_review timestamp, null when none. */
  lastCaseyMessageAt: string | null;
  /** Last weekly review's week_start_iso, null when never. */
  lastWeeklyReviewWeekStart: string | null;
  /** Whether Strava is connected, ignoring tokens (just presence). */
  stravaConnected: boolean;
  /** Last login from Supabase auth, null when never (or unavailable). */
  lastSignInAt: string | null;
};

export type AdminCohortStats = {
  totalAthletes: number;
  testUsers: number;
  activeLast7Days: number;
  weeklyReviewsLast7Days: number;
  debriefsLast7Days: number;
};

export type AdminPageData = {
  athletes: AdminAthleteRow[];
  stats: AdminCohortStats;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export async function loadAdminPageData(): Promise<AdminPageData> {
  const admin = createAdminClient();

  const [
    athleteRes,
    activitiesRes,
    messagesRes,
    weeklyReviewsRes,
    stravaRes,
  ] = await Promise.all([
    admin
      .from("athletes")
      .select(
        "id, email, display_name, is_test_user, created_at, onboarding_completed_at, deleted_at",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    admin
      .from("activities")
      .select("athlete_id, start_date_local")
      .order("start_date_local", { ascending: false }),
    admin
      .from("messages")
      .select("athlete_id, kind, created_at, meta")
      .in("kind", ["debrief", "cross_training_ack", "weekly_review"])
      .order("created_at", { ascending: false }),
    admin
      .from("messages")
      .select("athlete_id, meta, created_at")
      .eq("kind", "weekly_review")
      .order("created_at", { ascending: false }),
    admin.from("strava_connections").select("athlete_id"),
  ]);

  if (athleteRes.error) throw athleteRes.error;

  const athletes = (athleteRes.data ?? []) as Array<{
    id: string;
    email: string | null;
    display_name: string | null;
    is_test_user: boolean | null;
    created_at: string;
    onboarding_completed_at: string | null;
  }>;

  // Per-athlete derivations. Build maps once, then assemble.
  const lastActivity = new Map<string, string>();
  for (const row of (activitiesRes.data ?? []) as Array<{
    athlete_id: string;
    start_date_local: string;
  }>) {
    if (!lastActivity.has(row.athlete_id)) {
      lastActivity.set(row.athlete_id, row.start_date_local);
    }
  }

  const lastCaseyMessage = new Map<string, string>();
  const debriefDates: string[] = [];
  const weeklyReviewDates: string[] = [];
  for (const row of (messagesRes.data ?? []) as Array<{
    athlete_id: string;
    kind: string;
    created_at: string;
  }>) {
    if (!lastCaseyMessage.has(row.athlete_id)) {
      lastCaseyMessage.set(row.athlete_id, row.created_at);
    }
    if (row.kind === "debrief") debriefDates.push(row.created_at);
    if (row.kind === "weekly_review") weeklyReviewDates.push(row.created_at);
  }

  const lastWeeklyReviewWeekStart = new Map<string, string>();
  for (const row of (weeklyReviewsRes.data ?? []) as Array<{
    athlete_id: string;
    meta: { week_start_iso?: string } | null;
    created_at: string;
  }>) {
    if (!lastWeeklyReviewWeekStart.has(row.athlete_id) && row.meta?.week_start_iso) {
      lastWeeklyReviewWeekStart.set(row.athlete_id, row.meta.week_start_iso);
    }
  }

  const stravaConnected = new Set<string>();
  for (const row of (stravaRes.data ?? []) as Array<{ athlete_id: string }>) {
    stravaConnected.add(row.athlete_id);
  }

  // Pull last_sign_in_at from auth.users via admin auth API. One call,
  // small set, fine to slot in here. Skipped silently if it errors.
  const lastSignIn = new Map<string, string>();
  try {
    const { data: authPage } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    for (const u of authPage?.users ?? []) {
      if (u.last_sign_in_at) {
        // The `athletes.user_id` foreign key resolves to `auth.users.id`,
        // not `email`. We don't have user_id on the rows fetched above,
        // so re-fetch a lookup table athlete-id by user_id. Cheaper: have
        // already-fetched athletes carry user_id.
        lastSignIn.set(u.id, u.last_sign_in_at);
      }
    }
  } catch {
    // ignore, just leave lastSignInAt as null
  }

  // Re-fetch the user_id for each athlete so we can match against the
  // auth-listing lookups. Single cheap query.
  const userIdRes = await admin
    .from("athletes")
    .select("id, user_id")
    .is("deleted_at", null);
  const athleteUserId = new Map<string, string>();
  for (const row of (userIdRes.data ?? []) as Array<{
    id: string;
    user_id: string;
  }>) {
    athleteUserId.set(row.id, row.user_id);
  }

  const rows: AdminAthleteRow[] = athletes.map((a) => {
    const userId = athleteUserId.get(a.id);
    return {
      id: a.id,
      email: a.email,
      displayName: a.display_name,
      isTestUser: a.is_test_user === true,
      createdAt: a.created_at,
      onboardingCompletedAt: a.onboarding_completed_at,
      lastActivityAt: lastActivity.get(a.id) ?? null,
      lastCaseyMessageAt: lastCaseyMessage.get(a.id) ?? null,
      lastWeeklyReviewWeekStart: lastWeeklyReviewWeekStart.get(a.id) ?? null,
      stravaConnected: stravaConnected.has(a.id),
      lastSignInAt: userId ? (lastSignIn.get(userId) ?? null) : null,
    };
  });

  const sevenDaysAgo = Date.now() - 7 * DAY_MS;
  const stats: AdminCohortStats = {
    totalAthletes: rows.length,
    testUsers: rows.filter((r) => r.isTestUser).length,
    activeLast7Days: rows.filter(
      (r) =>
        r.lastActivityAt &&
        new Date(r.lastActivityAt).getTime() >= sevenDaysAgo,
    ).length,
    weeklyReviewsLast7Days: weeklyReviewDates.filter(
      (d) => new Date(d).getTime() >= sevenDaysAgo,
    ).length,
    debriefsLast7Days: debriefDates.filter(
      (d) => new Date(d).getTime() >= sevenDaysAgo,
    ).length,
  };

  return { athletes: rows, stats };
}
