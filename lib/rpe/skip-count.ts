import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Count consecutive active skips (spec §8.1) for an athlete, working
 * backwards from the most recent prompted activity. Stops at the first
 * non-skip — answer or non-engagement — per the rule "only active skips
 * count toward the threshold."
 *
 * Optionally anchored on a timestamp: when the athlete is recovering
 * from a previous pause, `rpe_skip_count_anchor_at` is set, and only
 * prompts after that anchor are considered. This gives the post-pause
 * re-prompt a fresh threshold (spec §8.4) rather than re-counting the
 * skips that caused the prior pause.
 */
export async function countConsecutiveSkips(
  athleteId: string,
  anchorAt: string | null,
): Promise<number> {
  const admin = createAdminClient();
  let q = admin
    .from("activity_notes")
    .select("rpe_value, rpe_answered_at, rpe_skipped_at, rpe_prompted_at")
    .eq("athlete_id", athleteId)
    .not("rpe_prompted_at", "is", null)
    .order("rpe_prompted_at", { ascending: false })
    .limit(20);
  if (anchorAt) q = q.gt("rpe_prompted_at", anchorAt);

  const { data, error } = await q;
  if (error) throw error;

  type Row = {
    rpe_value: number | null;
    rpe_answered_at: string | null;
    rpe_skipped_at: string | null;
    rpe_prompted_at: string | null;
  };
  const rows = (data ?? []) as Row[];

  let consecutive = 0;
  for (const r of rows) {
    if (r.rpe_value !== null || r.rpe_answered_at !== null) break; // answer
    if (r.rpe_skipped_at === null) break; // non-engagement
    consecutive += 1;
  }
  return consecutive;
}
