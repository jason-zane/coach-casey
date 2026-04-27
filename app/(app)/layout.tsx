import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TimezoneCapture } from "./_components/timezone-capture";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Backfill gate for athletes who completed onboarding before the
  // about-you step existed. DOB is the only field Strava doesn't give us,
  // so it's the cleanest "is the demographic block populated" signal.
  // Sex/weight may legitimately be null for athletes who decline to set
  // them in Strava, so we don't gate on those.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: athlete } = await supabase
      .from("athletes")
      .select("date_of_birth, onboarding_completed_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (
      athlete?.onboarding_completed_at &&
      !(athlete as { date_of_birth: string | null }).date_of_birth
    ) {
      redirect("/onboarding/about-you?backfill=1");
    }
  }

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <TimezoneCapture />
      {children}
    </div>
  );
}
