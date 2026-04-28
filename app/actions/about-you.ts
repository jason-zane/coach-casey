"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAthlete, advanceFrom } from "@/app/actions/onboarding";

/**
 * Persist the about-you form: DOB (required), sex (required), weight (optional).
 *
 * Sex and weight may already be seeded from Strava in the OAuth callback;
 * this action overwrites with whatever the athlete confirms in the form,
 * since their on-screen edit is the most authoritative source.
 *
 * `backfill` indicates the athlete is hitting this step after onboarding
 * was already completed (gated by the (app) layout when DOB is missing).
 * In that case we don't advance the onboarding cursor, we just save and
 * send them to /app.
 */
export async function saveAboutYou(formData: FormData) {
  const displayName = String(formData.get("display_name") ?? "").trim();
  const dob = String(formData.get("date_of_birth") ?? "").trim();
  const sex = String(formData.get("sex") ?? "").trim();
  const weightRaw = String(formData.get("weight_kg") ?? "").trim();
  const backfill = String(formData.get("backfill") ?? "") === "1";

  // Name: at least one non-whitespace character. Capped at 60 chars to match
  // the form's maxLength. Empty rejects with a field error.
  if (displayName.length === 0 || displayName.length > 60) {
    redirect(
      `/onboarding/about-you?error=name${backfill ? "&backfill=1" : ""}`,
    );
  }

  // DOB validation: ISO yyyy-mm-dd, plausible age window. We don't show
  // field-level errors in the form yet, bad input falls through to a
  // server-side reject by re-rendering the page (handled by the redirect
  // back to itself with an `?error` flag).
  const dobOk = /^\d{4}-\d{2}-\d{2}$/.test(dob);
  const dobDate = dobOk ? new Date(dob) : null;
  const now = new Date();
  const minDob = new Date();
  minDob.setFullYear(now.getFullYear() - 100);
  const maxDob = new Date();
  maxDob.setFullYear(now.getFullYear() - 12);
  if (!dobDate || dobDate < minDob || dobDate > maxDob) {
    redirect(
      `/onboarding/about-you?error=dob${backfill ? "&backfill=1" : ""}`,
    );
  }

  // Sex matches Strava's enum: 'M' | 'F' | 'X'. We don't gate-block on sex
  // for coaching purposes, 'X' falls through to sex-agnostic prompt
  // calibration, but we still require the athlete to make an explicit
  // choice rather than leaving it null at onboarding time.
  if (sex !== "M" && sex !== "F" && sex !== "X") {
    redirect(
      `/onboarding/about-you?error=sex${backfill ? "&backfill=1" : ""}`,
    );
  }

  let weight_kg: number | null = null;
  if (weightRaw) {
    const w = Number(weightRaw);
    if (!Number.isFinite(w) || w <= 20 || w >= 250) {
      redirect(
        `/onboarding/about-you?error=weight${backfill ? "&backfill=1" : ""}`,
      );
    }
    weight_kg = Math.round(w * 10) / 10;
  }

  const { athlete } = await requireAthlete();
  const admin = createAdminClient();

  await admin
    .from("athletes")
    .update({
      display_name: displayName,
      date_of_birth: dob,
      sex,
      weight_kg,
    })
    .eq("id", athlete.id);

  if (backfill) {
    revalidatePath("/", "layout");
    redirect("/app");
  }

  await advanceFrom("about-you");
}
