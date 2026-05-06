"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAthlete } from "@/app/actions/onboarding";
import { advanceFrom } from "@/app/actions/onboarding";
import {
  classifyMime,
  extractPlanFromFile,
  isSupportedMime,
  MAX_UPLOAD_BYTES,
  type SupportedMime,
} from "@/lib/plan/extract";

type CoachingMode = "coach" | "self";

function readCoachingMode(formData: FormData | undefined): CoachingMode | null {
  if (!formData) return null;
  const v = String(formData.get("coaching_mode") ?? "").trim();
  return v === "coach" || v === "self" ? v : null;
}

async function writePreferences(
  athleteId: string,
  patch: { plan_follower_status: string; coaching_mode?: CoachingMode | null },
) {
  const admin = createAdminClient();
  const row: Record<string, unknown> = {
    athlete_id: athleteId,
    plan_follower_status: patch.plan_follower_status,
  };
  // Only write coaching_mode when the caller passed one. Leaving it
  // undefined preserves whatever's already on the row, so a deferred
  // athlete who later sets it on the profile page isn't clobbered by an
  // empty selection here.
  if (patch.coaching_mode !== undefined && patch.coaching_mode !== null) {
    row.coaching_mode = patch.coaching_mode;
  }
  await admin.from("preferences").upsert(row, { onConflict: "athlete_id" });
}

/**
 * Deactivate any existing active plan for the athlete. New plan inserts
 * always supersede the previous active plan, history is preserved on the
 * deactivated rows. Caller is the new-plan insert; this just clears the
 * is_active flag on prior rows.
 */
async function deactivatePriorPlans(athleteId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("training_plans")
    .update({ is_active: false })
    .eq("athlete_id", athleteId)
    .eq("is_active", true);
}

type SavePlanOpts = {
  source: "text" | "image" | "pdf";
  rawText: string;
  sourceFilename?: string | null;
  sourceMime?: SupportedMime | null;
  /**
   * True when the athlete reviewed the extracted text. Pasted plans go
   * straight in without an extraction step, so they're saved with
   * confirmedAt unset.
   */
  confirmed: boolean;
};

async function insertPlanRow(athleteId: string, opts: SavePlanOpts): Promise<void> {
  const admin = createAdminClient();
  await deactivatePriorPlans(athleteId);
  await admin.from("training_plans").insert({
    athlete_id: athleteId,
    source: opts.source,
    raw_text: opts.rawText,
    source_filename: opts.sourceFilename ?? null,
    source_mime: opts.sourceMime ?? null,
    confirmed_at: opts.confirmed ? new Date().toISOString() : null,
    is_active: true,
  });
}

export async function savePlanText(formData: FormData) {
  const raw = String(formData.get("plan_text") ?? "").trim();
  if (!raw) return;
  const coachingMode = readCoachingMode(formData);
  const { athlete } = await requireAthlete();

  await insertPlanRow(athlete.id, {
    source: "text",
    rawText: raw,
    confirmed: false,
  });

  await writePreferences(athlete.id, {
    plan_follower_status: "following",
    coaching_mode: coachingMode,
  });

  await advanceFrom("plan");
}

/**
 * Server-action result shape for the upload→extract round trip. The
 * onboarding upload UI calls this, shows the extracted text in an editable
 * textarea, then calls `saveExtractedPlan` once the athlete is happy. The
 * file itself is not stored; only the extracted text round-trips.
 */
export type ExtractPlanFileResult =
  | {
      kind: "ok";
      extractedText: string;
      confidence: "high" | "medium" | "low" | "unknown";
      confidenceNote: string | null;
      sourceMime: SupportedMime;
      sourceFilename: string;
    }
  | {
      kind: "error";
      message: string;
    };

export async function extractPlanFile(formData: FormData): Promise<ExtractPlanFileResult> {
  // Reject before any work for a clearer error than the LLM call's.
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { kind: "error", message: "No file received." };
  }
  if (!isSupportedMime(file.type)) {
    return {
      kind: "error",
      message: `Unsupported file type (${file.type || "unknown"}). Use PNG, JPG, WebP, GIF, or PDF.`,
    };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      kind: "error",
      message: `File is larger than ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB. Crop to a single block (or single week) and retry.`,
    };
  }

  await requireAthlete(); // auth gate; throws-redirects on signed-out

  const bytes = new Uint8Array(await file.arrayBuffer());
  const outcome = await extractPlanFromFile({
    kind: classifyMime(file.type),
    mime: file.type,
    filename: file.name || "plan",
    bytes,
  });
  if (outcome.kind === "error") return outcome;
  return {
    kind: "ok",
    extractedText: outcome.extractedText,
    confidence: outcome.confidence,
    confidenceNote: outcome.confidenceNote,
    sourceMime: file.type,
    sourceFilename: file.name || "plan",
  };
}

/**
 * Persist an extracted-and-edited plan. Distinct from savePlanText so we
 * record source as image/pdf and mark confirmed_at, indicating the athlete
 * reviewed the extraction (vs the pasted-text path which has no review
 * step).
 *
 * Called both from onboarding (advances onboarding step on save) and from
 * the athlete page's re-upload surface (no advance, just persist + redirect
 * back to athlete page).
 */
export async function saveExtractedPlan(formData: FormData) {
  const raw = String(formData.get("plan_text") ?? "").trim();
  if (!raw) return;
  const sourceMimeRaw = String(formData.get("source_mime") ?? "");
  const sourceFilename = String(formData.get("source_filename") ?? "").trim() || null;
  const fromOnboarding = formData.get("from_onboarding") === "1";
  if (!isSupportedMime(sourceMimeRaw)) {
    throw new Error(`unsupported source_mime: ${sourceMimeRaw}`);
  }
  const coachingMode = readCoachingMode(formData);
  const { athlete } = await requireAthlete();

  await insertPlanRow(athlete.id, {
    source: classifyMime(sourceMimeRaw) === "pdf" ? "pdf" : "image",
    rawText: raw,
    sourceFilename,
    sourceMime: sourceMimeRaw,
    confirmed: true,
  });

  await writePreferences(athlete.id, {
    plan_follower_status: "following",
    coaching_mode: coachingMode,
  });

  if (fromOnboarding) {
    await advanceFrom("plan");
  } else {
    revalidatePath("/app/athlete");
    revalidatePath("/app/athlete/plan");
    redirect("/app/athlete?plan=saved");
  }
}

/**
 * Used from the athlete page re-upload flow (not onboarding). Persists a
 * pasted plan as a re-upload, deactivating the prior active plan.
 */
export async function saveTextPlanFromAthletePage(formData: FormData) {
  const raw = String(formData.get("plan_text") ?? "").trim();
  if (!raw) return;
  const coachingMode = readCoachingMode(formData);
  const { athlete } = await requireAthlete();

  await insertPlanRow(athlete.id, {
    source: "text",
    rawText: raw,
    confirmed: false,
  });

  await writePreferences(athlete.id, {
    plan_follower_status: "following",
    coaching_mode: coachingMode,
  });

  revalidatePath("/app/athlete");
  revalidatePath("/app/athlete/plan");
  redirect("/app/athlete?plan=saved");
}

export async function deferPlan(formData?: FormData) {
  const coachingMode = readCoachingMode(formData);
  const { athlete } = await requireAthlete();

  await writePreferences(athlete.id, {
    plan_follower_status: "deferred",
    coaching_mode: coachingMode,
  });

  await advanceFrom("plan");
}

export async function optOutOfPlan() {
  const { athlete } = await requireAthlete();

  await writePreferences(athlete.id, {
    plan_follower_status: "none",
    // Self-directed by definition when there's no plan.
    coaching_mode: "self",
  });

  await advanceFrom("plan");
}
