import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";
import { disconnectStrava } from "@/app/actions/strava";
import { requestAccountDeletion } from "@/app/actions/account";
import { DisconnectStravaButton } from "./_disconnect-button";
import { DeleteAccountButton } from "./_delete-account-button";
import { GoalRaceEditor } from "./_goal-race-editor";
import { MemoryListEditor } from "./_memory-list-editor";
import { YouEditor } from "./_you-editor";
import {
  formatDistance,
  formatNiggleHeader,
  loadAthletePageData,
} from "@/lib/athlete/page-data";

export const dynamic = "force-dynamic";

type StravaConnection = {
  connected_at: string | null;
  scope: string | null;
  is_mock: boolean | null;
  strava_athlete_id: number | null;
};

export default async function AthletePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { data: athlete } = await supabase
    .from("athletes")
    .select("id, deleted_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!athlete) redirect("/signin");
  if (athlete.deleted_at) {
    await supabase.auth.signOut();
    redirect("/?deleted=1");
  }

  const data = await loadAthletePageData(athlete.id as string);
  const { profile, goalRace, weekly, niggles, lifeContext, memory } = data;

  const { data: conn } = await supabase
    .from("strava_connections")
    .select("connected_at, scope, is_mock, strava_athlete_id")
    .eq("athlete_id", athlete.id as string)
    .maybeSingle<StravaConnection>();

  const isStravaConnected = Boolean(conn);
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
            {profile.displayName ?? "Your athlete page"}
          </h1>
          <p className="text-[14px] leading-[1.55] text-ink-muted">
            What Coach Casey knows about you.
          </p>
        </header>

        <Section title="You">
          <YouEditor
            initial={{
              displayName: profile.displayName,
              units: profile.units,
              dateOfBirth: profile.dateOfBirth,
              weightKg: profile.weightKg,
              sex: profile.sex,
            }}
          />
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[14px] pt-2">
            <span className="text-ink-subtle font-mono text-[11px] uppercase tracking-[0.14em] min-w-[64px]">
              Email
            </span>
            <span className="text-ink">{profile.email ?? user.email}</span>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[14px]">
            <span className="text-ink-subtle font-mono text-[11px] uppercase tracking-[0.14em] min-w-[64px]">
              Timezone
            </span>
            <span className={profile.timezone ? "text-ink" : "text-ink-subtle"}>
              {profile.timezone ?? "—"}
            </span>
          </div>
        </Section>

        <Section title="Goals">
          <GoalRaceEditor
            initial={
              goalRace
                ? {
                    name: goalRace.name,
                    raceDate: goalRace.raceDate,
                    goalTimeSeconds: goalRace.goalTimeSeconds,
                  }
                : null
            }
          />
        </Section>

        {weekly.hasAnyRuns && (
          <Section title="Training">
            <p className="text-[14px] leading-[1.6] text-ink">
              You&rsquo;re averaging{" "}
              <span className="font-medium">
                {formatDistance(weekly.fourWeekAvgRunMetres, profile.units)}
              </span>{" "}
              a week over the last four weeks.{" "}
              {weekly.thisWeekRunMetres > 0 ? (
                <>
                  This week so far:{" "}
                  <span className="font-medium">
                    {formatDistance(weekly.thisWeekRunMetres, profile.units)}
                  </span>
                  .
                </>
              ) : (
                <>Nothing logged this week yet.</>
              )}
            </p>
          </Section>
        )}

        <Section title="What Casey is tracking">
          <div className="space-y-3">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle">
              Niggles
            </h3>
            <MemoryListEditor
              kind="injury"
              addLabel={niggles.length > 0 ? "Add another" : "Add a niggle"}
              contentPlaceholder="What's going on, when did it start, when does it flare?"
              showTags={true}
              items={niggles.map((n) => ({
                id: n.id,
                content: n.content,
                tags: n.tags,
                dateLabel: `First mentioned ${new Date(
                  n.firstMentionedAt,
                ).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}`,
                header: formatNiggleHeader(n),
              }))}
            />
          </div>

          <div className="space-y-3 pt-4">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle">
              Life context (last 14 days)
            </h3>
            <MemoryListEditor
              kind="context"
              addLabel={
                lifeContext.length > 0
                  ? "Add another"
                  : "Add some life context"
              }
              contentPlaceholder="Travel, sleep, work pressure, anything Casey should hold for the next two weeks."
              showTags={false}
              items={lifeContext.map((c) => ({
                id: c.id,
                content: c.content,
                tags: c.tags,
                dateLabel: new Date(c.recordedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                }),
                header: null,
              }))}
            />
          </div>
        </Section>

        <Section title="Memory">
          <p className="text-[14px] leading-[1.6] text-ink">
            Casey knows{" "}
            <span className="font-medium">
              {memory.runs} {memory.runs === 1 ? "run" : "runs"}
            </span>
            ,{" "}
            <span className="font-medium">
              {memory.crossTraining} cross-training{" "}
              {memory.crossTraining === 1 ? "session" : "sessions"}
            </span>
            , and you&rsquo;ve traded{" "}
            <span className="font-medium">
              {memory.caseyMessages}{" "}
              {memory.caseyMessages === 1 ? "message" : "messages"}
            </span>
            .
          </p>
        </Section>

        <Section title="Strava connection">
          {isStravaConnected ? (
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
                    {new Date(conn.connected_at).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </span>
                </Field>
              )}
              <p className="text-[13px] leading-[1.55] text-ink-muted pt-2">
                Coach Casey reads your runs from Strava and writes a verdict
                line back to each activity description. Disconnect at any
                time.
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
