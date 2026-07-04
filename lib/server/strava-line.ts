import "server-only";

import { createAdminClient } from "@/lib/supabase/server";
import { buildDebriefContext } from "@/lib/thread/debrief-context";
import { generateStravaBlurb, STRAVA_BLURB_SIGNATURE } from "@/lib/llm/debrief";
import { generateNonRunStravaLine } from "@/lib/llm/strava-line";
import { updateActivityDescriptionAppend } from "@/lib/strava/client";
import { scopeHasActivityWrite } from "@/lib/strava/blurb-description";
import { fallbackStravaLine, stravaLineKind } from "@/lib/strava/line-fallback";
import { isRateLimited } from "@/lib/strava/rate-limit";

/**
 * Write Casey's one-line verdict to an activity's Strava description.
 *
 * This is the single owner of the Strava line. It runs for EVERY activity
 * class, independent of whether the activity produced an in-app debrief or
 * cross-training ack, so runs, rides, swims, gym sessions, and walks all
 * get a line. Called from the webhook (create + update) and the
 * safety-net cron.
 *
 * Idempotent via `activities.strava_line_written_at`: once a line is
 * resolved for an activity (written, already current, or deliberately
 * deferred to an athlete edit) the marker is set and subsequent calls
 * short-circuit, so webhook retries and the 30-minute poll never
 * regenerate or double-post. A hard write failure leaves the marker unset
 * so the next sweep retries.
 *
 * Gated on the athlete's `strava_blurb_enabled` preference and the
 * connection holding `activity:write`, the same opt-out and scope rules
 * the line has always respected; this never overrides an athlete who
 * turned it off. Never throws for generation/Strava failures, those are
 * caught and returned, so callers can fire-and-forget.
 *
 * Server-only: uses the service-role client and triggers LLM/Strava side
 * effects.
 */

export type EnsureStravaLineResult =
  | { kind: "written" }
  | {
      kind: "skipped";
      reason:
        | "no_strava_id"
        | "already_written"
        | "opted_out"
        | "not_writable"
        | "write_failed";
    };

type ActivityRow = {
  id: string;
  athlete_id: string;
  activity_type: string | null;
  name: string | null;
  distance_m: number | null;
  moving_time_s: number | null;
  avg_hr: number | null;
  strava_id: number | null;
  strava_line_written_at: string | null;
};

export async function ensureStravaLine(
  athleteId: string,
  activityId: string,
  { force = false }: { force?: boolean } = {},
): Promise<EnsureStravaLineResult> {
  const admin = createAdminClient();

  const { data: row } = await admin
    .from("activities")
    .select(
      "id, athlete_id, activity_type, name, distance_m, moving_time_s, avg_hr, strava_id, strava_line_written_at",
    )
    .eq("id", activityId)
    .maybeSingle<ActivityRow>();
  if (!row || row.athlete_id !== athleteId) {
    throw new Error(`activity ${activityId} not owned by athlete ${athleteId}`);
  }

  // Can't write to Strava without a Strava id (manual/non-synced activity).
  if (row.strava_id == null) return { kind: "skipped", reason: "no_strava_id" };

  // Idempotency: already resolved, don't pay for generation again.
  if (!force && row.strava_line_written_at != null) {
    return { kind: "skipped", reason: "already_written" };
  }

  // Opt-out and write-scope gates. Checked here (before generation) so an
  // opted-out or read-only athlete never costs an LLM call.
  const [{ data: prefs }, { data: conn }] = await Promise.all([
    admin
      .from("preferences")
      .select("strava_blurb_enabled")
      .eq("athlete_id", athleteId)
      .maybeSingle(),
    admin
      .from("strava_connections")
      .select("scope, is_mock")
      .eq("athlete_id", athleteId)
      .maybeSingle(),
  ]);
  const blurbOn =
    (prefs as { strava_blurb_enabled?: boolean } | null)?.strava_blurb_enabled ?? true;
  const connRow = conn as { scope: string | null; is_mock: boolean | null } | null;
  const connWritable =
    connRow != null && !connRow.is_mock && scopeHasActivityWrite(connRow.scope);
  if (!blurbOn) return { kind: "skipped", reason: "opted_out" };
  if (!connWritable) return { kind: "skipped", reason: "not_writable" };

  // Generate the line. Runs get the rich, tuned verdict off the debrief
  // context; everything else gets the lighter type-aware line. Either path
  // can return null (failed the public voice/length check); we substitute
  // a deterministic fallback so the activity always gets something.
  let line: string | null = null;
  try {
    if (stravaLineKind(row.activity_type) === "run") {
      const ctx = await buildDebriefContext(athleteId, activityId);
      line = await generateStravaBlurb(ctx);
    } else {
      line = await generateNonRunStravaLine({
        athleteId,
        activityType: row.activity_type,
        name: row.name,
        distanceKm: row.distance_m != null ? row.distance_m / 1000 : null,
        durationMin: row.moving_time_s != null ? row.moving_time_s / 60 : null,
        avgHr: row.avg_hr,
      });
    }
  } catch (err) {
    console.warn(`strava line generation failed for activity ${activityId}`, err);
    line = null;
  }
  if (!line) {
    line = fallbackStravaLine({ activityType: row.activity_type, seed: row.strava_id });
  }

  const appended = `${line}\n\n${STRAVA_BLURB_SIGNATURE}`;
  try {
    const result = await updateActivityDescriptionAppend(
      athleteId,
      row.strava_id,
      appended,
      STRAVA_BLURB_SIGNATURE,
    );
    if (result.kind === "error") {
      console.warn(
        `strava line writeback failed for activity ${activityId}: ${result.message}`,
        { status: result.status },
      );
      return { kind: "skipped", reason: "write_failed" };
    }
    // A line exists on Strava now when we wrote one (`ok`, which also
    // covers an already-current description) or when the athlete edited
    // around our existing block (`athlete_edited`). Other skips
    // (mock/no_connection/missing_scope) mean nothing landed; leave the
    // marker unset so a later reconnect/scope grant retries.
    const lineExists =
      result.kind === "ok" ||
      (result.kind === "skip" && result.reason === "athlete_edited");
    if (!lineExists) return { kind: "skipped", reason: "not_writable" };
  } catch (err) {
    if (isRateLimited(err)) {
      console.warn(
        `strava line writeback rate-limited for activity ${activityId}; next sweep retries`,
      );
    } else {
      console.warn(`strava line writeback threw for activity ${activityId}`, err);
    }
    return { kind: "skipped", reason: "write_failed" };
  }

  await admin
    .from("activities")
    .update({ strava_line_written_at: new Date().toISOString() })
    .eq("id", activityId);

  return { kind: "written" };
}
