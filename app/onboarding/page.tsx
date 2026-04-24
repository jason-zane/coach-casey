import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Middleware usually handles the bare /onboarding case, but keep this as a
// defensive fallback if the route is hit directly.
export default async function OnboardingIndex() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { data: athlete } = await supabase
    .from("athletes")
    .select("onboarding_current_step, onboarding_completed_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (athlete?.onboarding_completed_at) redirect("/app");
  redirect(`/onboarding/${athlete?.onboarding_current_step ?? "strava"}`);
}
