"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAthlete } from "@/app/actions/onboarding";
import { fetchHotInsights } from "@/lib/memory/insights";
import type { Insight } from "@/lib/memory/reconcile";

/**
 * Legibility and correctability for the maintained read. Casey's beliefs
 * about an athlete are visible to them and editable: dismiss one that is
 * wrong, or correct its wording. A wrongly-held belief that loads into
 * every interaction is the worst failure mode of the memory layer, so the
 * athlete always has a one-tap override. All writes are scoped to the
 * caller's own athlete id.
 */

export async function listMyInsights(): Promise<Insight[]> {
  const { athlete } = await requireAthlete();
  return fetchHotInsights(athlete.id);
}

export async function dismissInsight(id: string): Promise<{ ok: boolean }> {
  const { athlete } = await requireAthlete();
  const admin = createAdminClient();
  const { error } = await admin
    .from("athlete_insights")
    .update({ status: "closed", hot: false })
    .eq("id", id)
    .eq("athlete_id", athlete.id);
  if (error) {
    console.warn("[insights] dismiss failed", { id, error: error.message });
    return { ok: false };
  }
  revalidatePath("/app/athlete");
  return { ok: true };
}

export async function correctInsight(
  id: string,
  content: string,
): Promise<{ ok: boolean }> {
  const trimmed = content.trim();
  if (!trimmed) return { ok: false };
  const { athlete } = await requireAthlete();
  const admin = createAdminClient();
  const { error } = await admin
    .from("athlete_insights")
    .update({ content: trimmed, source: "manual" })
    .eq("id", id)
    .eq("athlete_id", athlete.id);
  if (error) {
    console.warn("[insights] correct failed", { id, error: error.message });
    return { ok: false };
  }
  revalidatePath("/app/athlete");
  return { ok: true };
}
