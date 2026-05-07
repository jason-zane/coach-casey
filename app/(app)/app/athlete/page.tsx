import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/current";
import { signOut } from "@/app/actions/auth";
import { requestAccountDeletion } from "@/app/actions/account";
import { DeleteAccountButton } from "./_delete-account-button";
import { isAdminEmail } from "@/lib/admin/auth";
import { SkeletonSection } from "../_components/skeleton";
import { Section } from "./_sections/section-shell";
import { YouSection } from "./_sections/you-section";
import { GoalsSection } from "./_sections/goals-section";
import { PlanSection } from "./_sections/plan-section";
import { TrainingSection } from "./_sections/training-section";
import { TrackingSection } from "./_sections/tracking-section";
import { MemorySection } from "./_sections/memory-section";
import { StravaSection } from "./_sections/strava-section";

export const dynamic = "force-dynamic";

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
  const isAdmin = isAdminEmail(user.email ?? null);

  return (
    <div className="min-h-svh bg-paper text-ink overflow-x-hidden">
      <div className="mx-auto max-w-[640px] px-5 sm:px-8 py-10 space-y-12">
        <header className="space-y-2">
          <Link
            href="/app"
            className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle hover:text-ink-muted transition-colors duration-150 inline-flex items-center gap-1"
          >
            <span aria-hidden>‹</span>
            <span>Back to thread</span>
          </Link>
          <h1
            className="text-[32px] leading-tight font-medium text-ink"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {athlete.display_name ?? "Your athlete page"}
          </h1>
          <p className="text-[14px] leading-[1.55] text-ink-muted">
            What Coach Casey knows about you.
          </p>
        </header>

        <Suspense fallback={<SkeletonSection title="You" rows={4} />}>
          <YouSection athleteId={athleteId} fallbackEmail={userEmail} />
        </Suspense>

        <Suspense fallback={<SkeletonSection title="Goals" rows={2} />}>
          <GoalsSection athleteId={athleteId} />
        </Suspense>

        <Suspense fallback={<SkeletonSection title="Training plan" rows={3} />}>
          <PlanSection athleteId={athleteId} />
        </Suspense>

        <Suspense fallback={<SkeletonSection title="Training" rows={1} />}>
          <TrainingSection athleteId={athleteId} />
        </Suspense>

        <Suspense
          fallback={<SkeletonSection title="What Casey is tracking" rows={3} />}
        >
          <TrackingSection athleteId={athleteId} />
        </Suspense>

        <Suspense fallback={<SkeletonSection title="Memory" rows={1} />}>
          <MemorySection athleteId={athleteId} />
        </Suspense>

        <Suspense
          fallback={<SkeletonSection title="Strava connection" rows={2} />}
        >
          <StravaSection athleteId={athleteId} />
        </Suspense>

        <Section title="Account">
          <p className="text-[13px] leading-[1.55] text-ink-muted">
            Sign out of this device. Your data and Strava connection stay
            intact.
          </p>
          <form action={signOut} className="pt-2">
            <button
              type="submit"
              className="inline-flex items-center h-9 px-3 rounded-[6px] border border-rule text-ink text-[13px] font-medium hover:bg-rule/40 transition-colors duration-150"
            >
              Sign out
            </button>
          </form>

          <div className="border-t border-rule/60 pt-5 mt-3 space-y-2">
            <p className="text-[13px] leading-[1.55] text-ink-muted">
              Download a copy of everything Coach Casey holds about you, your
              account, plan, activities, conversations, and notes. Returned as
              a single JSON file.
            </p>
            <div className="pt-2">
              <a
                href="/api/account/export"
                className="inline-flex items-center h-9 px-3 rounded-[6px] border border-rule text-ink text-[13px] font-medium hover:bg-rule/40 transition-colors duration-150"
              >
                Export my data
              </a>
            </div>
          </div>

          <div className="border-t border-rule/60 pt-5 mt-3 space-y-2">
            <p className="text-[13px] leading-[1.55] text-ink-muted">
              Permanently delete your account and all your data. We&apos;ll
              soft-delete immediately and hard-delete within 30 days. Strava
              is disconnected as part of this.
            </p>
            <div className="pt-1">
              <DeleteAccountButton action={requestAccountDeletion} />
            </div>
          </div>
        </Section>

        {isAdmin && (
          <Section title="Admin">
            <p className="text-[13px] leading-[1.55] text-ink-muted">
              Cohort overview and admin controls. Only visible to addresses
              listed in ADMIN_EMAILS.
            </p>
            <div className="pt-2">
              <Link
                href="/app/admin"
                className="inline-flex items-center h-9 px-3 rounded-[6px] border border-rule text-ink text-[13px] font-medium hover:bg-rule/40 transition-colors duration-150"
              >
                Open admin
              </Link>
            </div>
          </Section>
        )}

        <Section title="Privacy">
          <p className="text-[13px] leading-[1.55] text-ink-muted">
            See how Coach Casey handles your data, or read the terms of
            service.
          </p>
          <div className="flex gap-4 pt-1 text-[13px]">
            <Link
              href="/privacy"
              className="text-ink underline underline-offset-2 decoration-ink/30 hover:decoration-ink transition-colors"
            >
              Privacy policy
            </Link>
            <Link
              href="/terms"
              className="text-ink underline underline-offset-2 decoration-ink/30 hover:decoration-ink transition-colors"
            >
              Terms of service
            </Link>
          </div>
        </Section>
      </div>
    </div>
  );
}
