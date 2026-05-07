import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

export type AdminAthleteRow = {
  id: string;
  email: string | null;
  displayName: string | null;
  isTestUser: boolean;
  createdAt: string;
  onboardingCompletedAt: string | null;
  /** Most recent activity start time within the lookback window, null otherwise. */
  lastActivityAt: string | null;
  /** Most recent debrief or weekly_review timestamp within the lookback window. */
  lastCaseyMessageAt: string | null;
  /** Last weekly review's week_start_iso, null when never (within window). */
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
/**
 * Lookback window for the "last activity / last message" derivations on
 * the admin table. Old rows beyond this window display as null in the
 * UI. The pre-V1 path scanned every activity and every message in the
 * system on each render, no time filter, no row cap, which made the
 * admin page steadily slower as the data grew.
 */
const ADMIN_LOOKBACK_DAYS = 90;

export async function loadAdminPageData(): Promise<AdminPageData> {
  const admin = createAdminClient();

  const now = Date.now();
  const sevenDaysAgoIso = new Date(now - 7 * DAY_MS).toISOString();
  const lookbackIso = new Date(
    now - ADMIN_LOOKBACK_DAYS * DAY_MS,
  ).toISOString();

  const [
    athleteRes,
    activitiesRes,
    messagesRes,
    stravaRes,
    debriefs7dRes,
    reviews7dRes,
  ] = await Promise.all([
    // Athletes list with user_id baked in so we can drop the legacy
    // second lookup query.
    admin
      .from("athletes")
      .select(
        "id, user_id, email, display_name, is_test_user, created_at, onboarding_completed_at",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    // Bounded to the lookback window. Last-activity derivations use the
    // newest row per athlete inside the window, "active 7d" is computed
    // from the same fetched set.
    admin
      .from("activities")
      .select("athlete_id, start_date_local")
      .gte("start_date_local", lookbackIso)
      .order("start_date_local", { ascending: false }),
    // Coach-Casey side messages within the window. Covers debrief +
    // weekly_review for the "last Casey message" column and the weekly
    // review meta lookup.
    admin
      .from("messages")
      .select("athlete_id, kind, created_at, meta")
      .in("kind", ["debrief", "cross_training_ack", "weekly_review"])
      .gte("created_at", lookbackIso)
      .order("created_at", { ascending: false }),
    admin.from("strava_connections").select("athlete_id"),
    // Stats counts run as head-only aggregates so they never return rows.
    admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("kind", "debrief")
      .gte("created_at", sevenDaysAgoIso),
    admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("kind", "weekly_review")
      .gte("created_at", sevenDaysAgoIso),
  ]);

  if (athleteRes.error) throw athleteRes.error;

  const athletes = (athleteRes.data ?? []) as Array<{
    id: string;
    user_id: string;
    email: string | null;
    display_name: string | null;
    is_test_user: boolean | null;
    created_at: string;
    onboarding_completed_at: string | null;
  }>;

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
  const lastWeeklyReviewWeekStart = new Map<string, string>();
  for (const row of (messagesRes.data ?? []) as Array<{
    athlete_id: string;
    kind: string;
    created_at: string;
    meta: { week_start_iso?: string } | null;
  }>) {
    if (!lastCaseyMessage.has(row.athlete_id)) {
      lastCaseyMessage.set(row.athlete_id, row.created_at);
    }
    if (
      row.kind === "weekly_review" &&
      !lastWeeklyReviewWeekStart.has(row.athlete_id) &&
      row.meta?.week_start_iso
    ) {
      lastWeeklyReviewWeekStart.set(row.athlete_id, row.meta.week_start_iso);
    }
  }

  const stravaConnected = new Set<string>();
  for (const row of (stravaRes.data ?? []) as Array<{ athlete_id: string }>) {
    stravaConnected.add(row.athlete_id);
  }

  // Auth listing for last_sign_in_at. We already have user_id on each
  // athlete row above, so no second athletes query needed.
  const lastSignIn = new Map<string, string>();
  try {
    const { data: authPage } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    for (const u of authPage?.users ?? []) {
      if (u.last_sign_in_at) {
        lastSignIn.set(u.id, u.last_sign_in_at);
      }
    }
  } catch {
    // Ignore, just leave lastSignInAt as null on every row.
  }

  const sevenDaysAgoMs = now - 7 * DAY_MS;
  const activeAthletes = new Set<string>();
  for (const [athleteId, when] of lastActivity) {
    if (new Date(when).getTime() >= sevenDaysAgoMs) {
      activeAthletes.add(athleteId);
    }
  }

  const rows: AdminAthleteRow[] = athletes.map((a) => ({
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
    lastSignInAt: lastSignIn.get(a.user_id) ?? null,
  }));

  const stats: AdminCohortStats = {
    totalAthletes: rows.length,
    testUsers: rows.filter((r) => r.isTestUser).length,
    activeLast7Days: activeAthletes.size,
    weeklyReviewsLast7Days: reviews7dRes.count ?? 0,
    debriefsLast7Days: debriefs7dRes.count ?? 0,
  };

  return { athletes: rows, stats };
}
