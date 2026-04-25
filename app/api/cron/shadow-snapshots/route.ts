import { NextResponse } from "next/server";
import { refreshShadowSnapshotsForAllEligible } from "@/lib/training-load/shadow";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Weekly shadow-threshold refresh per `docs/training-load-feature-spec.md` §5.4.
 *
 * Scans every athlete and, for those whose current snapshot isn't a race-
 * derived one, derives a low-confidence threshold from their hardest
 * sustained 20-minute effort in the last 60 days. Athletes with a race
 * snapshot are skipped — race-derived thresholds remain authoritative.
 *
 * Schedule: weekly (configured in `vercel.json`). Authorisation matches
 * the strava-poll route — Vercel sets `Authorization: Bearer <CRON_SECRET>`
 * on scheduled invocations.
 */

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

  try {
    const result = await refreshShadowSnapshotsForAllEligible();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
