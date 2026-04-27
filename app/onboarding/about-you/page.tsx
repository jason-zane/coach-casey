import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { StepHeader } from "@/app/onboarding/_components/form";
import { AboutYouForm } from "./_about-you-form";

function normalizeSex(s: string | null | undefined): "M" | "F" | "X" | null {
  if (!s) return null;
  const u = s.toUpperCase();
  return u === "M" || u === "F" || u === "X" ? u : null;
}

export default async function AboutYouPage({
  searchParams,
}: {
  searchParams: Promise<{ backfill?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const backfill = sp.backfill === "1";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const admin = createAdminClient();
  const { data: athlete } = await admin
    .from("athletes")
    .select("sex, weight_kg, date_of_birth")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <div className="space-y-10">
      <StepHeader
        eyebrow={backfill ? "One quick thing" : "About you"}
        title={
          backfill ? "I need a couple more details" : "A few details about you"
        }
        description={
          <>
            Coaching that ignores age, sex, and bodyweight is coaching that
            ignores you. These shape heart-rate ranges, fueling, and how I read
            your easy days. Strava gives me some of this, but not your birthday.
          </>
        }
      />

      <AboutYouForm
        initialSex={normalizeSex(athlete?.sex as string | null | undefined)}
        initialWeightKg={(athlete?.weight_kg as number | null) ?? null}
        initialDob={(athlete?.date_of_birth as string | null) ?? null}
        backfill={backfill}
        error={sp.error ?? null}
      />
    </div>
  );
}
