import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/current";
import { loadAthletePageData } from "@/lib/athlete/page-data";
import { PlanReuploadClient } from "./_plan-reupload-client";

export const dynamic = "force-dynamic";

export default async function PlanReuploadPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/signin");
  const { athlete } = session;
  if (!athlete) redirect("/signin");
  if (athlete.deleted_at) {
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/?deleted=1");
  }

  const data = await loadAthletePageData(athlete.id);
  const { activePlan, profile } = data;

  return (
    <div className="min-h-svh bg-paper text-ink">
      <div className="mx-auto max-w-[640px] px-5 sm:px-8 py-10 space-y-8">
        <header className="space-y-2">
          <Link
            href="/app/athlete"
            className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle hover:text-ink-muted transition-colors duration-150 inline-flex items-center gap-1"
          >
            <span aria-hidden>‹</span>
            <span>Back to athlete page</span>
          </Link>
          <h1
            className="text-[28px] leading-tight font-medium text-ink"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {activePlan ? "Update training plan" : "Add a training plan"}
          </h1>
          <p className="text-[14px] leading-[1.55] text-ink-muted">
            {activePlan
              ? "Uploading replaces your current plan. The old one stays in your history; only the latest is used for interpretation."
              : "I&rsquo;ll read screenshots, PDFs, or pasted text. You confirm what I read before I save it."}
          </p>
        </header>

        <PlanReuploadClient
          coachingMode={profile.coachingMode}
          hasExistingPlan={Boolean(activePlan)}
        />
      </div>
    </div>
  );
}
