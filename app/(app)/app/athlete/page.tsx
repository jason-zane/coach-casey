import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/current";
import { SkeletonBar, SkeletonLines } from "../_components/skeleton";
import { SectionHeading, Subsection } from "./_sections/section-shell";
import { YouSection } from "./_sections/you-section";
import { GoalsSection } from "./_sections/goals-section";
import { PlanSection } from "./_sections/plan-section";
import { TrainingSection } from "./_sections/training-section";
import { TrackingSection } from "./_sections/tracking-section";
import { InsightsSection } from "./_sections/insights-section";
import { HeroMemoryLine } from "./_hero-memory-line";

export const dynamic = "force-dynamic";

/**
 * The athlete page is the moat made legible. The hero line shows what
 * Casey is holding (time together, runs read, messages, niggles still
 * on the radar). The body groups the editable parts into two areas:
 * what Casey knows about the athlete, and the athlete's training.
 * Everything that's actually settings (sign out, Strava connection,
 * data export, delete, privacy, admin) lives at /app/settings.
 */
export default async function AthletePage() {
  const session = await getCurrentSession();
  if (!session) redirect("/signin");
  const { user, athlete } = session;
  if (!athlete) redirect("/signin");
  if (athlete.deleted_at) {
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/?deleted=1");
  }

  const athleteId = athlete.id;
  const userEmail = user.email ?? "";
  const joinedAt = athlete.created_at;

  return (
    <div className="min-h-svh bg-paper text-ink overflow-x-hidden">
      <div className="mx-auto max-w-[640px] px-5 sm:px-8 py-10 space-y-14">
        <header className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/app"
              className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle hover:text-ink-muted transition-colors duration-150 inline-flex items-center gap-1"
            >
              <span aria-hidden>‹</span>
              <span>Back to thread</span>
            </Link>
            <Link
              href="/app/settings"
              className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle hover:text-ink-muted transition-colors duration-150 inline-flex items-center gap-1"
            >
              <span>Settings</span>
              <span aria-hidden>›</span>
            </Link>
          </div>
          <h1
            className="text-[32px] leading-tight font-medium text-ink"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {athlete.display_name ?? "Your athlete page"}
          </h1>
          <p className="text-[14px] leading-[1.55] text-ink-muted">
            What Coach Casey knows about you.
          </p>
          <Suspense
            fallback={<SkeletonBar className="h-3 mt-1" width="70%" />}
          >
            <HeroMemoryLine athleteId={athleteId} joinedAt={joinedAt} />
          </Suspense>
        </header>

        <section className="space-y-0">
          <Suspense
            fallback={
              <Subsection label="You">
                <SkeletonLines rows={5} />
              </Subsection>
            }
          >
            <YouSection athleteId={athleteId} fallbackEmail={userEmail} />
          </Suspense>
          <Suspense
            fallback={
              <Subsection label="Your goal race">
                <SkeletonLines rows={2} />
              </Subsection>
            }
          >
            <GoalsSection athleteId={athleteId} />
          </Suspense>
          <Suspense
            fallback={
              <>
                <Subsection label="On the radar">
                  <SkeletonLines rows={2} />
                </Subsection>
                <Subsection label="Life context" helper="Last 14 days">
                  <SkeletonLines rows={2} />
                </Subsection>
              </>
            }
          >
            <TrackingSection athleteId={athleteId} />
          </Suspense>
          <Suspense
            fallback={
              <Subsection label="What Casey's picked up">
                <SkeletonLines rows={3} />
              </Subsection>
            }
          >
            <InsightsSection athleteId={athleteId} />
          </Suspense>
        </section>

        <section className="space-y-5">
          <SectionHeading>Your training</SectionHeading>
          <Suspense fallback={<SkeletonBar className="h-3" width="80%" />}>
            <TrainingSection athleteId={athleteId} />
          </Suspense>
          <Suspense
            fallback={
              <Subsection label="Plan">
                <SkeletonLines rows={3} />
              </Subsection>
            }
          >
            <PlanSection athleteId={athleteId} />
          </Suspense>
        </section>
      </div>
    </div>
  );
}
