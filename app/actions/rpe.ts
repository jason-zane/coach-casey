"use server";

import { createClient } from "@/lib/supabase/server";
import { getPostHogClient } from "@/lib/posthog-server";
import {
  markRpePrompted as markRpePromptedRepo,
  skipRpe as skipRpeRepo,
  submitRpe as submitRpeRepo,
  type RpeSkipResult,
  type RpeSubmitResult,
} from "@/lib/rpe/repository";
import { regenerateFollowUpForRpeAnswer } from "@/lib/llm/followup-on-rpe";

async function requireAthlete(): Promise<{ athleteId: string; userId: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthorized");

  const { data: athlete } = await supabase
    .from("athletes")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!athlete) throw new Error("no athlete");
  return { athleteId: athlete.id as string, userId: user.id };
}

function safeCapture(distinctId: string, event: string, props: Record<string, unknown>) {
  // PostHog capture is best-effort observability — never let an analytics
  // failure break the user-visible action.
  try {
    getPostHogClient().capture({ distinctId, event, properties: props });
  } catch (e) {
    console.warn(`posthog capture failed: ${event}`, e);
  }
}

/**
 * Idempotent. Called from the client when the picker first becomes
 * visible. The DB layer no-ops if `rpe_prompted_at` is already set.
 */
export async function markRpePromptShown(activityId: string): Promise<void> {
  const { athleteId, userId } = await requireAthlete();
  await markRpePromptedRepo(athleteId, activityId);
  safeCapture(userId, "rpe_prompt_shown", { activity_id: activityId });
}

export async function submitRpeValue(
  activityId: string,
  value: number,
): Promise<RpeSubmitResult> {
  const { athleteId, userId } = await requireAthlete();
  const result = await submitRpeRepo(athleteId, activityId, value);
  safeCapture(userId, "rpe_answered", { activity_id: activityId, rpe_value: value });

  // Same-session RPE-aware Question 2 (spec §6/§7). Only regenerate on a
  // fresh answer — if the row was already in a terminal state, the
  // submit was a no-op and there's nothing to revisit. Errors here are
  // logged but never surfaced; the RPE answer itself has already been
  // persisted, which is the contract this action commits to.
  if (result.state.kind === "answered" && result.state.value === value) {
    try {
      const followup = await regenerateFollowUpForRpeAnswer(
        athleteId,
        activityId,
        value,
      );
      if (followup.replaced) {
        safeCapture(userId, "rpe_branched_followup_fired", {
          activity_id: activityId,
          rpe_value: value,
        });
      }
    } catch (e) {
      console.warn("rpe-branched follow-up regen failed", e);
    }
  }

  return result;
}

export async function skipRpePrompt(activityId: string): Promise<RpeSkipResult> {
  const { athleteId, userId } = await requireAthlete();
  const result = await skipRpeRepo(athleteId, activityId);
  safeCapture(userId, "rpe_skipped", {
    activity_id: activityId,
    triggered_pause: result.paused,
  });
  return result;
}
