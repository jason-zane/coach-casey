import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { generateWeeklyReviewForAthlete } from "@/app/actions/weekly-review";
import { computePreviousFullWeek } from "@/lib/thread/weekly-review-context";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Weekly review cron. Runs hourly; for each athlete whose local time is
 * "Monday morning" (07:00 - 10:59 athlete-local), produces a review of the
 * previous Monday-to-Sunday window. Idempotent per (athlete, week_start),
 * so a missed firing self-heals on the next hour and a deploy-during-cron
 * doesn't double-send.
 *
 * Why every hour instead of once a day. Athletes span timezones. Picking a
 * single UTC hour either misses some athletes' Monday morning entirely
 * (Sydney UTC+10 vs LA UTC-7 differ by 17 hours) or fires at midnight
 * local for someone. Hourly + per-athlete-tz gate keeps the implementation
 * simple and the timing reasonable for everyone.
 *
 * Why 07:00-10:59 as the local window. Wide enough that one hour of
 * cron missfire (deploy, outage) still lands inside it; narrow enough
 * that the review arrives at coffee/commute time, not 4am.
 */

const PUSH_HOUR_LOCAL_START = 7;
const PUSH_HOUR_LOCAL_END_EXCLUSIVE = 11;

type AthleteRow = {
  id: string;
  timezone: string | null;
  onboarding_completed_at: string | null;
  deleted_at: string | null;
};

/**
 * Returns the athlete-local hour-of-day at `now` for a given timezone.
 * Falls back to UTC when tz is null. Used to gate which athletes the cron
 * touches in this firing.
 */
function localHour(tz: string | null, now: Date): number {
  if (!tz) return now.getUTCHours();
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    hour12: false,
  });
  const part = fmt.formatToParts(now).find((p) => p.type === "hour");
  if (!part) return now.getUTCHours();
  // 24-hour formatter occasionally returns "24" for midnight in some locales;
  // normalise to 0.
  const h = Number(part.value);
  return h === 24 ? 0 : h;
}

/**
 * Returns the athlete-local weekday at `now` for a given timezone.
 * 0 = Monday, ... 6 = Sunday. Matches the shape we use throughout, where
 * "previous full week" starts on Monday.
 */
function localWeekdayMondayZero(tz: string | null, now: Date): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz ?? "UTC",
    weekday: "short",
  });
  const day = fmt.format(now);
  const idx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(day);
  return (idx + 6) % 7;
}

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const got = request.headers.get("authorization");
    if (got !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }

  // Override hooks for development / on-demand fires. ?force=athlete_id
  // generates for that one athlete bypassing the time gate; useful for
  // dev and for retroactive backfills via the admin surface.
  const url = new URL(request.url);
  const forceAthleteId = url.searchParams.get("force");
  const dryRun = url.searchParams.get("dry") === "1";

  const admin = createAdminClient();
  const now = new Date();

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

  const eligible = ((athletes ?? []) as AthleteRow[]).filter((a) => {
    if (forceAthleteId) return true;
    const weekday = localWeekdayMondayZero(a.timezone, now); // 0 = Mon
    if (weekday !== 0) return false;
    const h = localHour(a.timezone, now);
    return h >= PUSH_HOUR_LOCAL_START && h < PUSH_HOUR_LOCAL_END_EXCLUSIVE;
  });

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      now: now.toISOString(),
      eligibleCount: eligible.length,
      eligible: eligible.map((a) => ({
        id: a.id,
        tz: a.timezone,
        localHour: localHour(a.timezone, now),
        localWeekday: localWeekdayMondayZero(a.timezone, now),
        previousWeek: computePreviousFullWeek(a.timezone, now),
      })),
    });
  }

  const stats = { attempted: 0, created: 0, exists: 0, skipped: 0 };
  const errors: Array<{ athleteId: string; error: string }> = [];

  for (const a of eligible) {
    stats.attempted += 1;
    try {
      const result = await generateWeeklyReviewForAthlete(a.id);
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
