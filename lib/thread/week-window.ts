/**
 * Athlete-local week and time-of-day math for the weekly-review pipeline.
 *
 * Pure functions only: no Supabase, no "server-only" marker, so the cron
 * gate and week selection stay unit-testable in plain Node
 * (tests/week-window.test.ts) while the cron route and server actions
 * import the exact code the tests pin.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type WeekWindow = {
  /** "YYYY-MM-DD" of the Monday the review covers. The idempotency key. */
  weekStartIso: string;
  /** "YYYY-MM-DD" of the last covered day, inclusive (normally a Sunday). */
  weekEndIso: string;
};

/**
 * Weekly review send windows, athlete-local. The default slot is Sunday
 * evening, so the review lands as the week wraps up rather than the
 * morning after. Each window is three hours wide: the cron fires hourly,
 * so one missed fire (deploy, outage) still leaves two chances to land
 * inside the window, and idempotency makes the extra fires no-ops.
 *
 * Athletes with preferences.weekly_review_day = 1 keep the original
 * Monday morning slot instead.
 */
export const SUNDAY_REVIEW_WINDOW = {
  startHour: 18,
  endHourExclusive: 21,
} as const;
export const MONDAY_REVIEW_WINDOW = {
  startHour: 7,
  endHourExclusive: 11,
} as const;

/**
 * Returns the athlete-local hour-of-day at `now` for a given timezone.
 * Falls back to UTC when tz is null.
 */
export function localHour(tz: string | null, now: Date): number {
  if (!tz) return now.getUTCHours();
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    hour12: false,
  });
  const part = fmt.formatToParts(now).find((p) => p.type === "hour");
  if (!part) return now.getUTCHours();
  // 24-hour formatter occasionally returns "24" for midnight in some
  // locales; normalise to 0.
  const h = Number(part.value);
  return h === 24 ? 0 : h;
}

/**
 * The athlete-local calendar date at `now`, materialised as a Date at
 * 00:00:00Z of that local day. Anchoring day arithmetic to UTC midnights
 * keeps it immune to DST (local days are not always 24 hours, UTC days
 * are) and lets getUTCDay() answer "what weekday is it for the athlete"
 * without parsing locale weekday strings.
 */
function localMidnightUtc(tz: string | null, now: Date): Date {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz ?? "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(now).map((p) => [p.type, p.value]),
  ) as { year: string; month: string; day: string };
  return new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`);
}

/**
 * Returns the athlete-local weekday at `now`. 0 = Monday, ... 6 = Sunday,
 * matching the Monday-start week convention used across the review
 * surfaces.
 */
export function localWeekdayMondayZero(tz: string | null, now: Date): number {
  return (localMidnightUtc(tz, now).getUTCDay() + 6) % 7;
}

/**
 * Monday-to-Sunday of the most recently *completed* week in the athlete's
 * local timezone, as "YYYY-MM-DD" strings. If today is Monday, that is
 * the week that ended yesterday; if Wednesday, the same week (the
 * in-progress one does not count).
 */
export function computePreviousFullWeek(
  tz: string | null,
  now: Date = new Date(),
): WeekWindow {
  const todayLocal = localMidnightUtc(tz, now);
  const mondayOffset = (todayLocal.getUTCDay() + 6) % 7;
  const lastMonday = new Date(
    todayLocal.getTime() - (mondayOffset + 7) * DAY_MS,
  );
  const lastSunday = new Date(lastMonday.getTime() + 6 * DAY_MS);
  return {
    weekStartIso: lastMonday.toISOString().slice(0, 10),
    weekEndIso: lastSunday.toISOString().slice(0, 10),
  };
}

/**
 * Monday of the athlete's current local week through *today*, inclusive.
 * On a Sunday this is the full Monday-to-Sunday week ending today, which
 * is exactly what a Sunday-evening review covers. Mid-week it is a
 * partial week; the cron only calls this inside the Sunday gate.
 */
export function computeCurrentWeek(
  tz: string | null,
  now: Date = new Date(),
): WeekWindow {
  const todayLocal = localMidnightUtc(tz, now);
  const mondayOffset = (todayLocal.getUTCDay() + 6) % 7;
  const thisMonday = new Date(todayLocal.getTime() - mondayOffset * DAY_MS);
  return {
    weekStartIso: thisMonday.toISOString().slice(0, 10),
    weekEndIso: todayLocal.toISOString().slice(0, 10),
  };
}

/**
 * The week a review generated right now should cover: the week ending at
 * the most recent athlete-local Sunday, today included. On Sunday that is
 * the current week (the one the Sunday-evening send reviews); Monday
 * through Saturday it is the previous full week. Both resolve to the same
 * Monday key for the same calendar week, so a manual admin fire and the
 * cron can never produce duplicate reviews for one week.
 */
export function computeReviewWeek(
  tz: string | null,
  now: Date = new Date(),
): WeekWindow {
  return localWeekdayMondayZero(tz, now) === 6
    ? computeCurrentWeek(tz, now)
    : computePreviousFullWeek(tz, now);
}

/**
 * Cron gate and week selection in one step. Returns the week to review
 * when the athlete is inside their send window at `now`, null otherwise.
 *
 * Default (weekly_review_day 0, missing, or unrecognised): Sunday
 * 18:00-20:59 local, reviewing the current week (Monday through today).
 * Runs logged after the send are missed by design; they surface in
 * Monday's debrief and in next week's arc instead.
 *
 * weekly_review_day = 1: Monday 07:00-10:59 local, reviewing the previous
 * full week. That is the same calendar week the Sunday send would have
 * covered the evening before, so an athlete flipping the preference in
 * either direction gets neither a duplicate nor a gap (idempotency is
 * keyed on the week's Monday in both cases).
 */
export function weeklyReviewSlot(
  weeklyReviewDay: number | null | undefined,
  tz: string | null,
  now: Date,
): WeekWindow | null {
  const weekday = localWeekdayMondayZero(tz, now);
  const hour = localHour(tz, now);
  if (weeklyReviewDay === 1) {
    if (weekday !== 0) return null;
    if (
      hour < MONDAY_REVIEW_WINDOW.startHour ||
      hour >= MONDAY_REVIEW_WINDOW.endHourExclusive
    ) {
      return null;
    }
    return computePreviousFullWeek(tz, now);
  }
  if (weekday !== 6) return null;
  if (
    hour < SUNDAY_REVIEW_WINDOW.startHour ||
    hour >= SUNDAY_REVIEW_WINDOW.endHourExclusive
  ) {
    return null;
  }
  return computeCurrentWeek(tz, now);
}
