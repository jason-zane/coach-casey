"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requireAthlete } from "@/app/actions/onboarding";
import { generateNextObservation } from "@/lib/llm/validation";

export type Observation = {
  id: string;
  sequence_idx: number;
  observation_text: string;
  response_chip: string | null;
  response_text: string | null;
};

export async function loadValidationState() {
  const supabase = await createClient();
  const { athlete } = await requireAthlete();

  const { data } = await supabase
    .from("validation_observations")
    .select("id, sequence_idx, observation_text, response_chip, response_text")
    .eq("athlete_id", athlete.id)
    .order("sequence_idx", { ascending: true });

  return { athleteId: athlete.id, observations: (data ?? []) as Observation[] };
}

export async function generateNextValidationObservation(): Promise<{
  text: string;
  done: boolean;
  sequenceIdx: number;
} | null> {
  const { athlete } = await requireAthlete();
  const admin = createAdminClient();

  const { data: prior } = await admin
    .from("validation_observations")
    .select("observation_text, response_chip, response_text, sequence_idx")
    .eq("athlete_id", athlete.id)
    .order("sequence_idx", { ascending: true });

  const priorList = (prior ?? []).map((p) => ({
    observation: p.observation_text as string,
    chip: p.response_chip as string | null,
    response: p.response_text as string | null,
  }));

  const { text, done } = await generateNextObservation(athlete.id, priorList);
  if (done) return { text: "", done: true, sequenceIdx: priorList.length };

  const nextIdx = priorList.length;
  const { data: inserted, error } = await admin
    .from("validation_observations")
    .insert({
      athlete_id: athlete.id,
      sequence_idx: nextIdx,
      observation_text: text,
    })
    .select("id")
    .single();
  if (error) throw error;

  return { text, done: false, sequenceIdx: nextIdx };
}

export async function recordValidationResponse(
  sequenceIdx: number,
  chip: string | null,
  responseText: string | null,
) {
  const { athlete } = await requireAthlete();
  const admin = createAdminClient();

  await admin
    .from("validation_observations")
    .update({
      response_chip: chip,
      response_text: responseText,
    })
    .eq("athlete_id", athlete.id)
    .eq("sequence_idx", sequenceIdx);
}

export async function finishValidation() {
  const { athlete } = await requireAthlete();
  const admin = createAdminClient();

  await admin
    .from("athletes")
    .update({ onboarding_current_step: "plan" })
    .eq("id", athlete.id);

  revalidatePath("/onboarding", "layout");
  redirect("/onboarding/plan");
}
