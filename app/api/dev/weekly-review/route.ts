import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateWeeklyReviewForAthlete } from "@/app/actions/weekly-review";

/**
 * Dev trigger for the weekly-review pipeline. Cron-driven in production,
 * but local dev rarely lines up with Monday morning local-time, so this
 * route lets us exercise the full path on demand.
 *
 *   GET /api/dev/weekly-review                                  , previous week
 *   GET /api/dev/weekly-review?week_start=2026-04-27&week_end=2026-05-03
 *   GET /api/dev/weekly-review?force=1                          , bypass exists check
 *
 * Auth follows the dev pattern: signed-in user resolves to athlete; no
 * admin escape hatch. Disabled in production.
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not available in production" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { data: athlete } = await supabase
    .from("athletes")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!athlete) {
    return NextResponse.json({ error: "no athlete" }, { status: 400 });
  }
  const athleteId = (athlete as { id: string }).id;

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  const weekStart = url.searchParams.get("week_start");
  const weekEnd = url.searchParams.get("week_end");
  const result = await generateWeeklyReviewForAthlete(athleteId, {
    force,
    weekStartIso: weekStart ?? undefined,
    weekEndIso: weekEnd ?? undefined,
  });

  return NextResponse.json({ ok: true, ...result });
}
