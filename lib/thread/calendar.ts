import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Returns a set of YYYY-MM-DD strings representing days with either a message
 * in the thread OR a Strava activity attributed to the athlete within the
 * given month. Feeds the calendar picker's visual marking.
 */
export async function datesWithActivity(
  threadId: string,
  athleteId: string,
  year: number,
  month: number,
): Promise<Set<string>> {
  const supabase = await createClient();
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  const [{ data: msgRows }, { data: actRows }] = await Promise.all([
    supabase
      .from("messages")
      .select("created_at")
      .eq("thread_id", threadId)
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString()),
    supabase
      .from("activities")
      .select("start_date_local")
      .eq("athlete_id", athleteId)
      .gte("start_date_local", start.toISOString())
      .lt("start_date_local", end.toISOString()),
  ]);

  const out = new Set<string>();
  for (const row of msgRows ?? []) {
    out.add((row.created_at as string).slice(0, 10));
  }
  for (const row of actRows ?? []) {
    out.add((row.start_date_local as string).slice(0, 10));
  }
  return out;
}

/**
 * Returns the nearest date with activity on or before the target. Used when
 * the athlete taps a date with no activity, we scroll to the nearest prior
 * date with content rather than landing on an empty screen.
 */
export async function nearestDateWithActivityBefore(
  threadId: string,
  athleteId: string,
  isoDate: string,
): Promise<string | null> {
  const supabase = await createClient();
  const end = new Date(isoDate);
  end.setDate(end.getDate() + 1);

  const [{ data: msg }, { data: act }] = await Promise.all([
    supabase
      .from("messages")
      .select("created_at")
      .eq("thread_id", threadId)
      .lt("created_at", end.toISOString())
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("activities")
      .select("start_date_local")
      .eq("athlete_id", athleteId)
      .lt("start_date_local", end.toISOString())
      .order("start_date_local", { ascending: false })
      .limit(1),
  ]);

  const candidates: string[] = [];
  if (msg?.[0]?.created_at) candidates.push(msg[0].created_at as string);
  if (act?.[0]?.start_date_local) candidates.push(act[0].start_date_local as string);
  if (candidates.length === 0) return null;
  candidates.sort().reverse();
  return candidates[0].slice(0, 10);
}
