import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  fireRaceWeekBriefing,
  fireFuelingPrerun,
  fireMidBlockFlatness,
} from "@/app/actions/proactive-surfaces";
import { detectFlatnessPattern } from "@/lib/thread/flatness-detector";
import { detectTomorrowLongRun } from "@/lib/thread/long-run-detector";
import {
  renderRecentRunsSummary,
  renderRecentLifeContext,
} from "@/lib/thread/proactive-context";
import type { RaceWeekDayMarker } from "@/lib/llm/mocks";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Unified hourly cron for the three time-driven proactive surfaces
 * added in the 2026-05-16 Casey refresh:
 *
 *   - Race-week briefing (per goal_race, scaled by tier)
 *   - Fuelling pre-run nudge (~24h ahead of a known long run)
 *   - Mid-block flatness check-in (pattern across recent weeks)
 *
 * Runs hourly; for each athlete, only fires at their local 07:00–10:59
 * window. Same shape as the weekly-review cron (per-athlete timezone
 * gate, idempotent generation per surface).
 *
 * Niggle escalation is event-driven (fires from the memory-item insert
 * path), not cron-driven, so it's not handled here.
 *
 * Fuelling retrospective is event-driven (fires after a long run
 * syncs), not cron-driven either.
 */

const PUSH_HOUR_LOCAL_START = 7;
const PUSH_HOUR_LOCAL_END_EXCLUSIVE = 11;

type AthleteRow = {
  id: string;
  display_name: string | null;
  timezone: string | null;
  onboarding_completed_at: string | null;
  deleted_at: string | null;
};

function localHour(tz: string | null, now: Date): number {
  if (!tz) return now.getUTCHours();
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    hour12: false,
  });
  const part = fmt.formatToParts(now).find((p) => p.type === "hour");
  if (!part) return now.getUTCHours();
  const h = Number(part.value);
  return h === 24 ? 0 : h;
}

function localDateIso(tz: string | null, now: Date): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz ?? "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(now);
}

function localWeekday(tz: string | null, now: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz ?? "UTC",
    weekday: "long",
  }).format(now);
}

/**
 * Map (daysUntilRace, tier) → the marker the briefing should fire for,
 * or null if today isn't a scheduled briefing day for this tier.
 */
function dayMarkerForTier(
  daysUntil: number,
  tier: "A" | "B" | "C",
): RaceWeekDayMarker | null {
  if (daysUntil === 0) return "T-0";
  if (daysUntil === 1) return "T-1";
  if (tier === "C") return null;
  if (daysUntil === 3) return "T-3";
  if (tier === "B") {
    if (daysUntil === 10) return "T-10";
    return null;
  }
  // A
  if (daysUntil === 2) return "T-2";
  if (daysUntil === 7) return "T-7";
  if (daysUntil === 14) return "T-14";
  return null;
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

  const url = new URL(request.url);
  const forceAthleteId = url.searchParams.get("force");
  const dryRun = url.searchParams.get("dry") === "1";

  const admin = createAdminClient();
  const now = new Date();

  const baseQuery = admin
    .from("athletes")
    .select("id, display_name, timezone, onboarding_completed_at, deleted_at")
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
        localDate: localDateIso(a.timezone, now),
      })),
    });
  }

  const stats = {
    attempted: 0,
    raceWeek: { created: 0, exists: 0, skipped: 0 },
    fuelingPrerun: { created: 0, exists: 0, skipped: 0 },
    flatness: { created: 0, exists: 0, skipped: 0 },
  };
  const errors: Array<{ athleteId: string; surface: string; error: string }> = [];

  for (const a of eligible) {
    stats.attempted += 1;

    // ----- Coach status (for posture) -----
    const { data: prefs } = await admin
      .from("preferences")
      .select("coaching_mode")
      .eq("athlete_id", a.id)
      .maybeSingle();
    const hasCoach =
      (prefs as { coaching_mode?: "coach" | "self" | null } | null)
        ?.coaching_mode === "coach";

    // ----- Race-week briefings (per active goal race) -----
    try {
      const { data: races } = await admin
        .from("goal_races")
        .select("id, name, race_date, tier")
        .eq("athlete_id", a.id)
        .eq("is_active", true)
        .not("race_date", "is", null);

      const todayLocal = localDateIso(a.timezone, now);
      for (const r of ((races ?? []) as Array<{
        id: string;
        name: string | null;
        race_date: string;
        tier: "A" | "B" | "C";
      }>)) {
        const raceDate = r.race_date;
        const daysUntil = Math.round(
          (new Date(raceDate).getTime() - new Date(todayLocal).getTime()) /
            86400_000,
        );
        if (daysUntil < 0) continue;
        const marker = dayMarkerForTier(daysUntil, r.tier);
        if (!marker) continue;

        const [recentRunsSummary, recentLifeContext] = await Promise.all([
          renderRecentRunsSummary(a.id, 14),
          renderRecentLifeContext(a.id, 14),
        ]);

        const result = await fireRaceWeekBriefing({
          athleteId: a.id,
          displayName: a.display_name,
          raceId: r.id,
          raceName: r.name,
          raceDate: r.race_date,
          daysUntil,
          dayMarker: marker,
          tier: r.tier,
          recentRunsSummary,
          recentLifeContext,
          hasCoach,
        });
        stats.raceWeek[result.kind] += 1;
      }
    } catch (e) {
      errors.push({
        athleteId: a.id,
        surface: "race-week-briefing",
        error: e instanceof Error ? e.message : String(e),
      });
    }

    // ----- Fuelling pre-run nudge -----
    try {
      const planned = await detectTomorrowLongRun(a.id, a.timezone, now);
      if (planned) {
        const { data: races } = await admin
          .from("goal_races")
          .select("race_date")
          .eq("athlete_id", a.id)
          .eq("is_active", true)
          .not("race_date", "is", null)
          .order("race_date", { ascending: true })
          .limit(1);
        const firstRace = (races ?? [])[0] as { race_date: string } | undefined;
        const goalRaceDaysAway = firstRace
          ? Math.round(
              (new Date(firstRace.race_date).getTime() -
                new Date(localDateIso(a.timezone, now)).getTime()) /
                86400_000,
            )
          : null;

        const result = await fireFuelingPrerun({
          athleteId: a.id,
          displayName: a.display_name,
          plannedRunDay: localWeekday(a.timezone, new Date(now.getTime() + 86400_000)),
          plannedDurationMinutes: planned.estimatedDurationMinutes,
          plannedRunVariant: planned.variant,
          knownFuelingPattern: planned.knownFuelingPattern,
          goalRaceDaysAway,
          hasCoach,
          plannedRunKey: planned.key,
        });
        stats.fuelingPrerun[result.kind] += 1;
      }
    } catch (e) {
      errors.push({
        athleteId: a.id,
        surface: "fueling-prerun",
        error: e instanceof Error ? e.message : String(e),
      });
    }

    // ----- Mid-block flatness check-in -----
    try {
      const pattern = await detectFlatnessPattern(a.id);
      if (pattern) {
        const { data: races } = await admin
          .from("goal_races")
          .select("race_date")
          .eq("athlete_id", a.id)
          .eq("is_active", true)
          .not("race_date", "is", null)
          .order("race_date", { ascending: true })
          .limit(1);
        const firstRace = (races ?? [])[0] as { race_date: string } | undefined;
        const goalRaceDaysAway = firstRace
          ? Math.round(
              (new Date(firstRace.race_date).getTime() -
                new Date(localDateIso(a.timezone, now)).getTime()) /
                86400_000,
            )
          : null;

        const result = await fireMidBlockFlatness({
          athleteId: a.id,
          displayName: a.display_name,
          patternDescription: pattern.description,
          recentLifeContext: pattern.recentLifeContext,
          goalRaceDaysAway,
          hasCoach,
        });
        stats.flatness[result.kind] += 1;
      }
    } catch (e) {
      errors.push({
        athleteId: a.id,
        surface: "mid-block-flatness",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({ ok: true, ...stats, errors });
}
