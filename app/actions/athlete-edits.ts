"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAthlete } from "@/app/actions/onboarding";

// --- Goal race -------------------------------------------------------------

export type GoalRaceInput = {
  name: string;
  raceDate: string | null; // YYYY-MM-DD
  goalTimeSeconds: number | null;
};

/**
 * Upsert the athlete's single active goal race. There's at most one active
 * row per athlete; existing actives are deactivated rather than deleted so
 * historical races stay queryable for retrospective context.
 */
export async function saveGoalRace(input: GoalRaceInput): Promise<void> {
  const { athlete } = await requireAthlete();
  const admin = createAdminClient();

  const name = input.name.trim();
  if (!name) throw new Error("Goal race name is required");

  // Deactivate any prior active rows. We don't update-in-place because the
  // historical row is a different intent than "the current goal" — keeping
  // them separate preserves "races Casey has known about" for later use.
  await admin
    .from("goal_races")
    .update({ is_active: false })
    .eq("athlete_id", athlete.id)
    .eq("is_active", true);

  await admin.from("goal_races").insert({
    athlete_id: athlete.id,
    name,
    race_date: input.raceDate,
    goal_time_seconds: input.goalTimeSeconds,
    is_active: true,
  });

  revalidatePath("/app/athlete");
}

export async function clearGoalRace(): Promise<void> {
  const { athlete } = await requireAthlete();
  const admin = createAdminClient();

  await admin
    .from("goal_races")
    .update({ is_active: false })
    .eq("athlete_id", athlete.id)
    .eq("is_active", true);

  revalidatePath("/app/athlete");
}

// --- Athlete profile (You section) -----------------------------------------

export type AthleteProfileInput = {
  displayName?: string | null;
  units?: "metric" | "imperial";
  dateOfBirth?: string | null; // YYYY-MM-DD
  weightKg?: number | null;
  sex?: "M" | "F" | "X" | null;
};

/**
 * Update editable athlete profile fields. Each field is optional so the
 * caller can submit partial updates (e.g. just toggling units). null
 * clears a field; undefined leaves it untouched.
 */
export async function updateAthleteProfile(
  input: AthleteProfileInput,
): Promise<void> {
  const { athlete } = await requireAthlete();
  const admin = createAdminClient();

  const update: Record<string, unknown> = {};

  if (Object.prototype.hasOwnProperty.call(input, "displayName")) {
    const trimmed = input.displayName?.trim();
    update.display_name = trimmed && trimmed.length > 0 ? trimmed : null;
  }

  if (input.units !== undefined) {
    if (input.units !== "metric" && input.units !== "imperial") {
      throw new Error("Units must be metric or imperial");
    }
    update.units = input.units;
  }

  if (Object.prototype.hasOwnProperty.call(input, "dateOfBirth")) {
    if (input.dateOfBirth == null || input.dateOfBirth === "") {
      update.date_of_birth = null;
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dateOfBirth)) {
      throw new Error("Date of birth must be YYYY-MM-DD");
    } else {
      update.date_of_birth = input.dateOfBirth;
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "weightKg")) {
    if (input.weightKg == null) {
      update.weight_kg = null;
    } else if (
      typeof input.weightKg !== "number" ||
      !Number.isFinite(input.weightKg) ||
      input.weightKg < 20 ||
      input.weightKg > 250
    ) {
      throw new Error("Weight must be between 20 and 250 kg");
    } else {
      update.weight_kg = input.weightKg;
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "sex")) {
    if (input.sex == null) {
      update.sex = null;
    } else if (input.sex !== "M" && input.sex !== "F" && input.sex !== "X") {
      throw new Error("Invalid sex value");
    } else {
      update.sex = input.sex;
    }
  }

  if (Object.keys(update).length === 0) return;

  await admin.from("athletes").update(update).eq("id", athlete.id);
  revalidatePath("/app/athlete");
}

// --- Memory items (niggles + life context) ---------------------------------

type MemoryKind = "injury" | "context";

export type MemoryItemInput = {
  kind: MemoryKind;
  content: string;
  tags: string[];
};

/**
 * Insert a niggle or life-context note. Source is tagged 'manual' so the
 * downstream prompt logic can tell at a glance these are athlete-authored,
 * not extracted from chat.
 */
export async function addMemoryItem(input: MemoryItemInput): Promise<void> {
  const { athlete } = await requireAthlete();
  const admin = createAdminClient();

  const content = input.content.trim();
  if (!content) throw new Error("Content is required");
  if (input.kind !== "injury" && input.kind !== "context") {
    throw new Error("Invalid memory item kind");
  }

  const tags = input.tags
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0)
    .slice(0, 8);

  await admin.from("memory_items").insert({
    athlete_id: athlete.id,
    kind: input.kind,
    content,
    tags,
    source: "manual",
  });

  revalidatePath("/app/athlete");
}

export async function updateMemoryItem(
  id: string,
  input: { content: string; tags: string[] },
): Promise<void> {
  const { athlete } = await requireAthlete();
  const admin = createAdminClient();

  const content = input.content.trim();
  if (!content) throw new Error("Content is required");

  const tags = input.tags
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0)
    .slice(0, 8);

  // Scope the update to the athlete's own rows. RLS would catch this on the
  // anon client but we're using admin — the explicit eq is the guard.
  await admin
    .from("memory_items")
    .update({ content, tags })
    .eq("id", id)
    .eq("athlete_id", athlete.id);

  revalidatePath("/app/athlete");
}

export async function deleteMemoryItem(id: string): Promise<void> {
  const { athlete } = await requireAthlete();
  const admin = createAdminClient();

  await admin
    .from("memory_items")
    .delete()
    .eq("id", id)
    .eq("athlete_id", athlete.id);

  revalidatePath("/app/athlete");
}
