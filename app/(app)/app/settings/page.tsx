import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";
import { disconnectStrava } from "@/app/actions/strava";
import { requestAccountDeletion } from "@/app/actions/account";
import { DisconnectStravaButton } from "./_disconnect-button";
import { DeleteAccountButton } from "./_delete-account-button";

export const dynamic = "force-dynamic";

type StravaConnection = {
  connected_at: string | null;
  scope: string | null;
  is_mock: boolean | null;
  strava_athlete_id: number | null;
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { data: athlete } = await supabase
    .from("athletes")
    .select("id, display_name, email, deleted_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!athlete) redirect("/signin");
  if (athlete.deleted_at) {
    await supabase.auth.signOut();
    redirect("/?deleted=1");
  }

  const { data: conn } = await supabase
    .from("strava_connections")
    .select("connected_at, scope, is_mock, strava_athlete_id")
    .eq("athlete_id", athlete.id as string)
    .maybeSingle<StravaConnection>();

  const isConnected = Boolean(conn);
  const isMock = conn?.is_mock ?? false;

  return (
    <div className="min-h-svh bg-paper text-ink">
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
            Settings
          </h1>
        </header>

        <Section title="Athlete">
          <Field label="Email">
            <span className="text-ink">{athlete.email ?? user.email}</span>
          </Field>
          {athlete.display_name && (
            <Field label="Name">
              <span className="text-ink">{athlete.display_name}</span>
            </Field>
          )}
        </Section>

        <Section title="Strava connection">
          {isConnected ? (
            <>
              <Field label="Status">
                <span className="inline-flex items-center gap-2 text-ink">
                  <span
                    aria-hidden
                    className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500"
                  />
                  Connected{isMock ? " (mock)" : ""}
                </span>
              </Field>
              {conn?.connected_at && (
                <Field label="Since">
                  <span className="text-ink">
                    {new Date(conn.connected_at).toLocaleDateString(
                      undefined,
                      { year: "numeric", month: "long", day: "numeric" },
                    )}
                  </span>
                </Field>
              )}
              <p className="text-[13px] leading-[1.55] text-ink-muted pt-2">
                Coach Casey reads your runs from Strava in read-only mode.
                Disconnect at any time. Your existing thread and debriefs
                stay; new activities will stop syncing.
              </p>
              <div className="pt-3">
                <DisconnectStravaButton action={disconnectStrava} />
              </div>
              <p className="text-[12px] leading-[1.5] text-ink-subtle pt-1">
                You can also revoke access from{" "}
                <a
                  className="underline underline-offset-2 hover:text-ink-muted"
                  href="https://www.strava.com/settings/apps"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Strava&apos;s authorised apps page
                </a>
                .
              </p>
            </>
          ) : (
            <>
              <Field label="Status">
                <span className="text-ink-muted">Not connected</span>
              </Field>
              <p className="text-[13px] leading-[1.55] text-ink-muted pt-2">
                Connect Strava to let Coach Casey read your runs and write
                debriefs.
              </p>
              <div className="pt-3">
                <Link
                  href="/onboarding/strava"
                  className="inline-flex items-center h-9 px-3 rounded-[6px] border border-rule text-ink text-[13px] font-medium hover:bg-rule/40 transition-colors duration-150"
                >
                  Connect Strava
                </Link>
              </div>
            </>
          )}
        </Section>

        <Section title="Your data">
          <p className="text-[13px] leading-[1.55] text-ink-muted">
            Download a copy of everything Coach Casey holds about you — your
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted">
        {title}
      </h2>
      <div className="space-y-2 border-t border-rule/60 pt-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[14px]">
      <span className="text-ink-subtle font-mono text-[11px] uppercase tracking-[0.14em] min-w-[64px]">
        {label}
      </span>
      <span>{children}</span>
    </div>
  );
}
