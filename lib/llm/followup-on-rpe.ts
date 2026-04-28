import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { buildDebriefContext } from "@/lib/thread/debrief-context";
import { generateFollowUp } from "./debrief";
import { pickerEnabled } from "./followup-picker";

/**
 * Triggered from the RPE submit server action. If the picker, re-run
 * with the just-submitted RPE value, selects an `rpe_branched`
 * follow-up, replace the existing sync-time Question 2 with the new
 * branched one. Otherwise leave the existing follow-up alone.
 *
 * Replacement (delete + insert) is the simplest path that satisfies the
 * spec's "one Q2 per run" rule. The new follow-up appears on the next
 * thread refresh, the existing app pattern for new messages.
 */
export async function regenerateFollowUpForRpeAnswer(
  athleteId: string,
  activityId: string,
  rpeValue: number,
): Promise<{ replaced: boolean; reason?: string }> {
  if (!pickerEnabled()) return { replaced: false, reason: "picker_disabled" };

  const ctx = await buildDebriefContext(athleteId, activityId);
  const result = await generateFollowUp(ctx, ctx.athleteCreatedAt, rpeValue);
  if (result.pick.type !== "rpe_branched" || !result.text) {
    return { replaced: false, reason: "no_divergence" };
  }

  const admin = createAdminClient();

  // Find the parent debrief for this activity. If the debrief hasn't
  // been written yet (RPE answer somehow beat the debrief generation 
  // unusual) we have nothing to attach a replacement to; bail.
  const { data: debriefRow } = await admin
    .from("messages")
    .select("id, thread_id")
    .eq("athlete_id", athleteId)
    .eq("kind", "debrief")
    .filter("meta->>activity_id", "eq", activityId)
    .maybeSingle();
  if (!debriefRow) return { replaced: false, reason: "no_parent_debrief" };
  const debriefId = (debriefRow as { id: string }).id;
  const threadId = (debriefRow as { thread_id: string }).thread_id;

  // Delete the existing follow-up (if any) tied to this debrief, then
  // insert the branched one. Doing it in this order means a failure
  // mid-flight leaves the athlete with no follow-up rather than a
  // duplicate, a kinder degradation than two competing questions.
  await admin
    .from("messages")
    .delete()
    .eq("athlete_id", athleteId)
    .eq("kind", "follow_up")
    .filter("meta->>parent_id", "eq", debriefId);

  const { error: insertErr } = await admin.from("messages").insert({
    thread_id: threadId,
    athlete_id: athleteId,
    kind: "follow_up",
    body: result.text,
    meta: {
      activity_id: activityId,
      parent_id: debriefId,
      followup_type: "rpe_branched",
      rpe_branch: result.pick.branch,
      rpe_value: rpeValue,
    },
  });
  if (insertErr) {
    console.warn("rpe-branched follow-up insert failed", insertErr);
    return { replaced: false, reason: "insert_failed" };
  }

  return { replaced: true };
}
