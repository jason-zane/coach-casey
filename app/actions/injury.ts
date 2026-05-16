"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { requireAthlete } from "@/app/actions/onboarding";
import { advanceFrom } from "@/app/actions/onboarding";

export async function saveInjury(formData: FormData) {
  const text = String(formData.get("injury_text") ?? "").trim();
  const tagsRaw = String(formData.get("injury_tags") ?? "").trim();

  if (!text) return advanceFrom("injury");

  const { athlete } = await requireAthlete();
  const admin = createAdminClient();

  const tags = tagsRaw
    ? tagsRaw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  await admin.from("memory_items").insert({
    athlete_id: athlete.id,
    kind: "injury",
    content: text,
    tags,
    source: "onboarding",
  });

  // Check niggle escalation threshold on every injury insert. Onboarding
  // is typically the first mention so this rarely fires here, but keeping
  // the check at every insert path makes the threshold logic consistent.
  try {
    const { maybeFireNiggleEscalation } = await import(
      "@/lib/thread/niggle-counter"
    );
    await maybeFireNiggleEscalation(athlete.id);
  } catch (err) {
    console.warn("niggle escalation check failed", err);
  }

  await advanceFrom("injury");
}

export async function skipInjury() {
  await advanceFrom("injury");
}
