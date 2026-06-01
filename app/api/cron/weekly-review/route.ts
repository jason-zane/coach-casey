import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { verifyCronSecret } from "@/lib/auth/cron";
import { recordCronRun } from "@/lib/observability/cron";
import { generateWeeklyReviewForAthlete } from "@/app/actions/weekly-review";
import {
  computeReviewWeek,
  localHour,
  localWeekdayMondayZero,
  weeklyReviewSlot,
  type WeekWindow,
} from "@/lib/thread/week-window";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Weekly review cron. Runs hourly; for each athlete whose local time is
 * inside their send window, produces the review of the week ending that
 * weekend. The default window is Sunday evening (18:00 - 20:59
 * athlete-local), covering the *current* Monday-to-Sunday week as it
 * closes. Athletes with preferences.weekly_review_day = 1 keep the
 * original Monday morning window (07:00 - 10:59), covering the week that
 * ended the day before. Both paths review the same calendar week and are
 * idempotent per (athlete, week_start), so a missed firing self-heals on
 * the next hour and a deploy-during-cron doesn't double-send.
 *
 * Runs logged after a Sunday-evening send are missed by design: they
 * show up in Monday's debrief and in next week's arc instead.
 *
 * Why every hour instead of once a day. Athletes span timezones. Picking
 * a single UTC hour either misses some athletes' window entirely (Sydney
 * UTC+10 vs LA UTC-7 differ by 17 hours) or fires at midnight local for
 * someone. Hourly + per-athlete-tz gate keeps the implementation simple
 * and the timing reasonable for everyone.
 *
 * Why a three-hour local window. Wide enough that one missed cron fire
 * (deploy, outage) still lands inside it; narrow enough that the review
 * arrives as the week wraps up, not mid-afternoon or at midnight.
 */

type AthleteRow = {
  id: string;
  timezone: string | null;
  onboarding_completed_at: string | null;
  deleted_at: string | null;
};

type PreferenceRow = {
  athlete_id: string;
  weekly_review_day: number | null;
};

export async function GET(request: Request) {
  const denied = verifyCronSecret(request);
  if (denied) return denied;
  return recordCronRun("weekly-review", () => handleWeeklyReview(request));
}

async function handleWeeklyReview(request: Request): Promise<NextResponse> {

  // Override hooks for development / on-demand fires. ?force=athlete_id
  // generates for that one athlete bypassing the time gate (the week
  // defaults to the latest review week); useful for dev and for
  // retroactive backfills via the admin surface.
  const url = new URL(request.url);
  const forceAthleteId = url.searchParams.get("force");
  const dryRun = url.searchParams.get("dry") === "1";

  // In dry-run mode, ?at=<ISO timestamp> evaluates the gate as if the
  // cron had fired at that instant, so the window math can be verified
  // from prod without waiting for a real Sunday (e.g. ?dry=1&at=
  // 2026-06-14T08:00:00Z shows Sydney athletes eligible). Ignored
  // outside dry-run so a typo can never time-travel a real send.
  const atParam = dryRun ? url.searchParams.get("at") : null;
  const now = atParam ? new Date(atParam) : new Date();
  if (Number.isNaN(now.getTime())) {
    return NextResponse.json(
      { error: `unparseable at=${atParam}` },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const baseQuery = admin
    .from("athletes")
    .select("id, timezone, onboarding_completed_at, deleted_at")
    .is("deleted_at", null)
    .not("onboarding_completed_at", "is", null);
  const { data: athletes, error } = forceAthleteId
    ? await baseQuery.eq("id", forceAthleteId)
    : await baseQuery;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Per-athlete send-day preference. One fetch for the whole cohort;
  // athletes without a preferences row fall back to the column default
  // (0 = Sunday evening).
  const prefQuery = admin
    .from("preferences")
    .select("athlete_id, weekly_review_day");
  const { data: prefRows, error: prefError } = forceAthleteId
    ? await prefQuery.eq("athlete_id", forceAthleteId)
    : await prefQuery;
  if (prefError) {
    return NextResponse.json({ error: prefError.message }, { status: 500 });
  }
  const reviewDayByAthlete = new Map(
    ((prefRows ?? []) as PreferenceRow[]).map((p) => [
      p.athlete_id,
      p.weekly_review_day,
    ]),
  );

  const slots = new Map<string, WeekWindow>();
  const eligible = ((athletes ?? []) as AthleteRow[]).filter((a) => {
    if (forceAthleteId) return true;
    const slot = weeklyReviewSlot(
      reviewDayByAthlete.get(a.id) ?? 0,
      a.timezone,
      now,
    );
    if (!slot) return false;
    slots.set(a.id, slot);
    return true;
  });

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      now: now.toISOString(),
      eligibleCount: eligible.length,
      eligible: eligible.map((a) => ({
        id: a.id,
        tz: a.timezone,
        weeklyReviewDay: reviewDayByAthlete.get(a.id) ?? 0,
        localHour: localHour(a.timezone, now),
        localWeekday: localWeekdayMondayZero(a.timezone, now),
        reviewWeek: slots.get(a.id) ?? computeReviewWeek(a.timezone, now),
      })),
    });
  }

  const stats = { attempted: 0, created: 0, exists: 0, skipped: 0 };
  const errors: Array<{ athleteId: string; error: string }> = [];

  for (const a of eligible) {
    stats.attempted += 1;
    try {
      const week = slots.get(a.id);
      const result = await generateWeeklyReviewForAthlete(
        a.id,
        week
          ? { weekStartIso: week.weekStartIso, weekEndIso: week.weekEndIso }
          : {},
      );
      if (result.kind === "created") stats.created += 1;
      else if (result.kind === "exists") stats.exists += 1;
      else stats.skipped += 1;
    } catch (e) {
      errors.push({
        athleteId: a.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({ ok: true, ...stats, errors });
}
