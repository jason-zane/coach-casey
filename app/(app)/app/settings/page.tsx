import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/current";
import { signOut } from "@/app/actions/auth";
import { requestAccountDeletion } from "@/app/actions/account";
import { isAdminEmail } from "@/lib/admin/auth";
import { countUnreadForAthlete } from "@/lib/coach-messages";
import { SkeletonLines } from "../_components/skeleton";
import { Section } from "./_sections/section-shell";
import { StravaSection } from "./_sections/strava-section";
import { DeleteAccountButton } from "./_delete-account-button";

export const dynamic = "force-dynamic";

/**
 * Settings is the closet. Everything that's about the account or the
 * connections rather than the athlete: Strava, data export, sign
 * out, delete, legal, admin. Quiet by design, mono-uppercase
 * eyebrows match the form-chrome register.
 */
export default async function SettingsPage() {
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
  const isAdmin = isAdminEmail(user.email ?? null);
  const coachUnread = await countUnreadForAthlete(athleteId);

  return (
    <div className="min-h-svh bg-paper text-ink overflow-x-hidden">
      <div className="mx-auto max-w-[640px] px-5 sm:px-8 py-10 space-y-12">
        <header className="space-y-2">
          <Link
            href="/app/athlete"
            className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle hover:text-ink-muted transition-colors duration-150 inline-flex items-center gap-1"
          >
            <span aria-hidden>‹</span>
            <span>Back to athlete page</span>
          </Link>
          <h1
            className="text-[26px] leading-tight font-medium text-ink"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Settings
          </h1>
          <p className="text-[14px] leading-[1.55] text-ink-muted">
            Account, data, and connections.
          </p>
        </header>

        <Section title="Messages from Jason">
          <p className="text-[13px] leading-[1.55] text-ink-muted">
            A direct line to Jason, the human who built Coach Casey, not Casey
            itself. Send him anything, or reply to what he sends you.
          </p>
          <div className="pt-2">
            <Link
              href="/app/messages"
              className="inline-flex items-center gap-2 h-9 px-3 rounded-[6px] border border-rule text-ink text-[13px] font-medium hover:bg-rule/40 transition-colors duration-150"
            >
              <span>Open messages</span>
              {coachUnread > 0 && (
                <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 font-mono text-[10px] leading-none text-accent-ink">
                  {coachUnread > 9 ? "9+" : coachUnread}
                </span>
              )}
            </Link>
          </div>
        </Section>

        <Suspense
          fallback={
            <Section title="Strava">
              <SkeletonLines rows={2} />
            </Section>
          }
        >
          <StravaSection athleteId={athleteId} />
        </Suspense>

        <Section title="Data">
          <p className="text-[13px] leading-[1.55] text-ink-muted">
            A copy of everything Coach Casey holds about you. Returned as a
            single JSON file.
          </p>
          <div className="pt-2">
            <a
              href="/api/account/export"
              className="inline-flex items-center h-9 px-3 rounded-[6px] border border-rule text-ink text-[13px] font-medium hover:bg-rule/40 transition-colors duration-150"
            >
              Export my data
            </a>
          </div>
        </Section>

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
                href="/admin"
                className="inline-flex items-center h-9 px-3 rounded-[6px] border border-rule text-ink text-[13px] font-medium hover:bg-rule/40 transition-colors duration-150"
              >
                Open admin
              </Link>
            </div>
          </Section>
        )}

        <Section title="Legal">
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
