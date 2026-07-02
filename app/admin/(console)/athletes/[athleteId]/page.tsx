import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import {
  loadAthleteAdminCore,
  loadRecentActivities,
  loadRecentCaseyMessages,
} from "@/lib/admin/athlete-detail";
import {
  loadAthleteProfile,
  loadGoalRace,
  loadActivePlan,
  loadStravaConnection,
  loadStravaBlurbEnabled,
  loadTrackingItems,
  loadInsightItems,
  loadMemoryProgress,
  formatDistance,
  formatGoalTime,
  ageFromDob,
  formatSex,
  formatWeight,
  formatNiggleHeader,
} from "@/lib/athlete/page-data";
import { TestUserToggle } from "@/app/admin/(console)/_components/test-user-toggle";
import { GenerateWeeklyReviewButton } from "@/app/admin/(console)/_components/generate-weekly-review-button";
import { RegenerateDebriefButton } from "../../_components/regenerate-debrief-button";
import {
  PageHeader,
  Card,
  Field,
  Section,
  Pill,
  shortDate,
  shortDateTime,
  relativeDays,
} from "../../_components/ui";

export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = {
  debrief: "Debrief",
  weekly_review: "Weekly review",
  cross_training_ack: "Cross-training",
  casey_briefing: "Briefing",
};

export default async function AthleteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ athleteId: string }>;
  searchParams: Promise<{ regen_error?: string }>;
}) {
  const gate = await requireAdmin();
  if (!gate.ok) redirect("/admin/login");

  const { athleteId } = await params;
  const core = await loadAthleteAdminCore(athleteId);
  if (!core) redirect("/admin/athletes");

  const [
    profile,
    goalRace,
    plan,
    strava,
    blurbEnabled,
    tracking,
    insights,
    progress,
    activities,
    caseyMessages,
    sp,
  ] = await Promise.all([
    loadAthleteProfile(athleteId),
    loadGoalRace(athleteId),
    loadActivePlan(athleteId),
    loadStravaConnection(athleteId),
    loadStravaBlurbEnabled(athleteId),
    loadTrackingItems(athleteId),
    loadInsightItems(athleteId),
    loadMemoryProgress(athleteId),
    loadRecentActivities(athleteId),
    loadRecentCaseyMessages(athleteId),
    searchParams,
  ]);

  const name = core.displayName ?? core.email ?? "Athlete";
  const age = ageFromDob(profile.dateOfBirth);
  const units = profile.units;
  const regenError = sp.regen_error ?? null;

  return (
    <div className="space-y-8">
      <PageHeader
        backHref="/admin/athletes"
        backLabel="All athletes"
        eyebrow={core.displayName ? (core.email ?? undefined) : undefined}
        title={name}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <TestUserToggle athleteId={core.id} isTestUser={core.isTestUser} />
            <GenerateWeeklyReviewButton athleteId={core.id} />
            <RegenerateDebriefButton
              athleteId={core.id}
              returnTo={`/admin/athletes/${core.id}`}
            />
            <Link
              href={`/admin/athletes/${core.id}/thread`}
              className="rounded-md bg-accent px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-accent-ink transition-opacity hover:opacity-90"
            >
              conversation
            </Link>
            <Link
              href={`/admin/messages/${core.id}`}
              className="rounded-md border border-rule px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle transition-colors hover:border-rule-strong hover:text-ink"
            >
              message
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        {core.isTestUser && <Pill tone="accent">test user</Pill>}
        {core.deletedAt && <Pill tone="bad">deleted {shortDate(core.deletedAt)}</Pill>}
        {core.onboardingCompletedAt ? (
          <Pill tone="good">onboarded</Pill>
        ) : (
          <Pill tone="warn">onboarding · {core.onboardingCurrentStep ?? "?"}</Pill>
        )}
        {profile.coachingMode && (
          <Pill>
            {profile.coachingMode === "coach" ? "coached" : "self-directed"}
          </Pill>
        )}
        {strava.isConnected ? (
          <Pill tone="good">strava{strava.isMock ? " (mock)" : ""}</Pill>
        ) : (
          <Pill tone="warn">no strava</Pill>
        )}
      </div>

      {regenError && (
        <pre className="whitespace-pre-wrap break-all rounded-md border border-red-200 bg-red-50 p-3 font-mono text-[11px] leading-[1.4] text-red-700">
          regen error: {regenError}
        </pre>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        {/* Left rail: profile + setup */}
        <div className="space-y-5">
          <Card title="Profile">
            <dl>
              <Field label="Email">{core.email ?? "—"}</Field>
              <Field label="Joined">{shortDate(core.createdAt)}</Field>
              <Field label="Last sign-in">
                {core.lastSignInAt ? shortDateTime(core.lastSignInAt) : "—"}
              </Field>
              <Field label="Age">{age != null ? `${age}` : "—"}</Field>
              <Field label="Sex">{formatSex(profile.sex) ?? "—"}</Field>
              <Field label="Weight">
                {formatWeight(profile.weightKg, units) ?? "—"}
              </Field>
              <Field label="Units">{units}</Field>
              <Field label="Timezone">{profile.timezone ?? "—"}</Field>
            </dl>
          </Card>

          <Card title="Strava">
            <dl>
              <Field label="Connected">
                {strava.isConnected ? shortDate(strava.connectedAt) : "—"}
              </Field>
              <Field label="Mock">{strava.isMock ? "yes" : "no"}</Field>
              <Field label="Scope">
                <span className="font-mono text-[11px] text-ink-muted">
                  {strava.scope ?? "—"}
                </span>
              </Field>
              <Field label="Verdict blurb">{blurbEnabled ? "on" : "off"}</Field>
            </dl>
          </Card>

          <Card title="Goal race">
            {goalRace ? (
              <dl>
                <Field label="Race">{goalRace.name ?? "—"}</Field>
                <Field label="Date">{shortDate(goalRace.raceDate)}</Field>
                <Field label="Goal time">
                  {formatGoalTime(goalRace.goalTimeSeconds) ?? "—"}
                </Field>
                <Field label="Tier">{goalRace.tier ?? "—"}</Field>
              </dl>
            ) : (
              <p className="text-[13px] text-ink-muted">No active goal race.</p>
            )}
          </Card>

          <Card title="Training plan">
            {plan ? (
              <div className="space-y-3">
                <dl>
                  <Field label="Source">{plan.source}</Field>
                  <Field label="Uploaded">
                    {shortDate(plan.uploadedAt)} · {plan.ageDays}d old
                  </Field>
                  <Field label="Confirmed">{plan.confirmed ? "yes" : "no"}</Field>
                </dl>
                <p className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded border border-rule bg-paper p-2.5 font-sans text-[12px] leading-[1.5] text-ink-muted">
                  {plan.rawText.slice(0, 600)}
                  {plan.rawText.length > 600 ? "…" : ""}
                </p>
              </div>
            ) : (
              <p className="text-[13px] text-ink-muted">No plan on file.</p>
            )}
          </Card>

          <Card title="Memory volume">
            <div className="grid grid-cols-3 gap-3 text-center">
              <Counter label="Runs" value={progress.runs} />
              <Counter label="X-train" value={progress.crossTraining} />
              <Counter label="Casey msgs" value={progress.caseyMessages} />
            </div>
          </Card>
        </div>

        {/* Right column: activity + memory */}
        <div className="space-y-8">
          <Section title="Recent activities">
            {activities.length > 0 ? (
              <div className="overflow-x-auto rounded-md border border-rule">
                <table className="w-full font-sans text-[12px] text-ink">
                  <thead className="bg-surface text-ink-muted">
                    <tr>
                      <th className="px-3 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-[0.14em]">
                        When
                      </th>
                      <th className="px-3 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-[0.14em]">
                        Activity
                      </th>
                      <th className="px-3 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-[0.14em]">
                        Distance
                      </th>
                      <th className="px-3 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-[0.14em]">
                        Time
                      </th>
                      <th className="px-3 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-[0.14em]">
                        Pace
                      </th>
                      <th className="px-3 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-[0.14em]">
                        HR
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {activities.map((a) => (
                      <tr key={a.id} className="border-t border-rule">
                        <td className="px-3 py-2 align-top">
                          {shortDate(a.startDateLocal)}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="text-ink">{a.name ?? "—"}</div>
                          <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-subtle">
                            {a.activityType ?? "—"}
                          </div>
                        </td>
                        <td className="px-3 py-2 align-top">
                          {a.distanceM != null
                            ? formatDistance(a.distanceM, units)
                            : "—"}
                        </td>
                        <td className="px-3 py-2 align-top">
                          {formatDuration(a.movingTimeS)}
                        </td>
                        <td className="px-3 py-2 align-top">
                          {formatPace(a.avgPaceSPerKm, units)}
                        </td>
                        <td className="px-3 py-2 align-top">
                          {a.avgHr != null ? `${a.avgHr}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-[13px] text-ink-muted">No activities yet.</p>
            )}
          </Section>

          <Section
            title="Recent Casey output"
            right={
              <Link
                href={`/admin/athletes/${core.id}/thread`}
                className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-subtle transition-colors hover:text-ink"
              >
                full thread ›
              </Link>
            }
          >
            {caseyMessages.length > 0 ? (
              <div className="space-y-2.5">
                {caseyMessages.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-md border border-rule bg-surface p-3.5"
                  >
                    <div className="mb-1.5 flex items-center justify-between">
                      <Pill tone="accent">{KIND_LABELS[m.kind] ?? m.kind}</Pill>
                      <span className="font-mono text-[10px] text-ink-subtle">
                        {shortDateTime(m.createdAt)}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-[13px] leading-[1.55] text-ink-muted">
                      {m.body.length > 480 ? `${m.body.slice(0, 480)}…` : m.body}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-ink-muted">
                Casey hasn&rsquo;t written anything for this athlete yet.
              </p>
            )}
          </Section>

          <Section title="What Casey knows">
            {insights.length > 0 ? (
              <ul className="space-y-2">
                {insights.map((i) => (
                  <li
                    key={i.id}
                    className="rounded-md border border-rule bg-surface p-3"
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-subtle">
                        {i.layerLabel}
                      </span>
                      {i.recurring && <Pill tone="warn">recurring</Pill>}
                      {i.ageLabel && (
                        <span className="font-mono text-[10px] text-ink-subtle">
                          {i.ageLabel}
                        </span>
                      )}
                    </div>
                    <p className="text-[13px] leading-[1.5] text-ink">
                      {i.content}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-ink-muted">No insights recorded.</p>
            )}
          </Section>

          <Section title="Niggles & life context">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <h3 className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-subtle">
                  Niggles
                </h3>
                {tracking.niggles.length > 0 ? (
                  tracking.niggles.map((n) => (
                    <div
                      key={n.id}
                      className="rounded-md border border-rule bg-surface p-3"
                    >
                      <div className="text-[12px] font-medium text-ink">
                        {formatNiggleHeader(n)}
                      </div>
                      <p className="mt-0.5 text-[12.5px] leading-[1.5] text-ink-muted">
                        {n.content}
                      </p>
                      <span className="mt-1 block font-mono text-[10px] text-ink-subtle">
                        first noted {relativeDays(n.firstMentionedAt)}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-[13px] text-ink-muted">None tracked.</p>
                )}
              </div>
              <div className="space-y-2">
                <h3 className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-subtle">
                  Life context (14d)
                </h3>
                {tracking.lifeContext.length > 0 ? (
                  tracking.lifeContext.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-md border border-rule bg-surface p-3"
                    >
                      <p className="text-[12.5px] leading-[1.5] text-ink-muted">
                        {c.content}
                      </p>
                      <span className="mt-1 block font-mono text-[10px] text-ink-subtle">
                        {relativeDays(c.recordedAt)}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-[13px] text-ink-muted">Nothing recent.</p>
                )}
              </div>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="font-serif text-[22px] text-ink">{value}</div>
      <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-subtle">
        {label}
      </div>
    </div>
  );
}

function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatPace(
  secPerKm: number | null,
  units: "metric" | "imperial",
): string {
  if (secPerKm == null || secPerKm <= 0) return "—";
  const perUnit = units === "imperial" ? secPerKm * 1.609344 : secPerKm;
  const m = Math.floor(perUnit / 60);
  const s = Math.round(perUnit % 60);
  const unit = units === "imperial" ? "/mi" : "/km";
  return `${m}:${String(s).padStart(2, "0")}${unit}`;
}
