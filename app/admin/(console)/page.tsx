import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { loadAdminPageData } from "@/lib/admin/page-data";
import { loadObservabilityData } from "@/lib/admin/observability-data";
import { listAccessRequests } from "@/lib/admin/access-requests";
import { countAdminUnread } from "@/lib/coach-messages";
import {
  PageHeader,
  StatTile,
  Section,
  TableShell,
  Th,
  Td,
  Pill,
  shortDate,
  shortDateTime,
} from "./_components/ui";

export const dynamic = "force-dynamic";

/**
 * Console home: a command-centre roll-up of every signal the other sections
 * own — cohort size and activity, things waiting on the admin (access
 * requests, unread replies), and system health (errors, failing crons).
 */
export default async function OverviewPage() {
  const gate = await requireAdmin();
  if (!gate.ok) redirect("/admin/login");

  const [data, obs, requests, unread] = await Promise.all([
    loadAdminPageData(),
    loadObservabilityData(),
    listAccessRequests(),
    countAdminUnread(),
  ]);

  const { athletes, stats } = data;
  const pendingAccess = requests.filter((r) => r.status === "pending").length;
  const failingCrons = obs.cronHealth.filter((c) => c.failuresLast24h > 0);
  const recentSignups = athletes.slice(0, 6);

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Console"
        title="Overview"
        lede="Everything the cohort is doing, and everything waiting on you, in one place."
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Athletes" value={stats.totalAthletes} href="/admin/athletes" />
        <StatTile
          label="Active 7d"
          value={stats.activeLast7Days}
          hint="ran or cross-trained in the last 7 days"
        />
        <StatTile label="Test users" value={stats.testUsers} />
        <StatTile label="Debriefs 7d" value={stats.debriefsLast7Days} />
        <StatTile
          label="Reviews 7d"
          value={stats.weeklyReviewsLast7Days}
          hint="weekly reviews created in the last 7 days"
        />
      </section>

      <Section title="Needs attention">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            label="Pending access"
            value={pendingAccess}
            href="/admin/access"
            tone={pendingAccess > 0 ? "alert" : "default"}
          />
          <StatTile
            label="Unread replies"
            value={unread}
            href="/admin/messages"
            tone={unread > 0 ? "alert" : "default"}
          />
          <StatTile
            label="Errors 24h"
            value={obs.errorCount24h}
            href="/admin/observability"
            tone={obs.errorCount24h > 0 ? "alert" : "default"}
          />
          <StatTile
            label="Cron failures 24h"
            value={failingCrons.reduce((n, c) => n + c.failuresLast24h, 0)}
            href="/admin/observability"
            tone={failingCrons.length > 0 ? "alert" : "default"}
          />
        </div>
      </Section>

      {(failingCrons.length > 0 || obs.recentErrors.length > 0) && (
        <Section
          title="System health"
          right={
            <Link
              href="/admin/observability"
              className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-subtle hover:text-ink"
            >
              full view ›
            </Link>
          }
        >
          {failingCrons.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {failingCrons.map((c) => (
                <Pill key={c.job} tone="bad">
                  {c.job}: {c.failuresLast24h} fail
                </Pill>
              ))}
            </div>
          )}
          {obs.recentErrors.length > 0 && (
            <TableShell>
              <thead className="bg-surface text-ink-muted">
                <tr>
                  <Th>When</Th>
                  <Th>Source</Th>
                  <Th>Message</Th>
                </tr>
              </thead>
              <tbody>
                {obs.recentErrors.slice(0, 5).map((e) => (
                  <tr key={e.id} className="border-t border-rule">
                    <Td>{shortDateTime(e.createdAt)}</Td>
                    <Td>
                      <span className="font-mono text-[11px]">{e.source}</span>
                    </Td>
                    <Td>
                      <span className="text-ink">
                        {e.name ? `${e.name}: ` : ""}
                        {e.message.length > 120
                          ? `${e.message.slice(0, 120)}…`
                          : e.message}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </Section>
      )}

      <Section
        title="Recent signups"
        right={
          <Link
            href="/admin/athletes"
            className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-subtle hover:text-ink"
          >
            all athletes ›
          </Link>
        }
      >
        <TableShell>
          <thead className="bg-surface text-ink-muted">
            <tr>
              <Th>Name / email</Th>
              <Th>Joined</Th>
              <Th>Onboarded</Th>
              <Th>Test</Th>
            </tr>
          </thead>
          <tbody>
            {recentSignups.map((a) => (
              <tr key={a.id} className="border-t border-rule">
                <Td>
                  <Link
                    href={`/admin/athletes/${a.id}`}
                    className="text-ink underline-offset-2 hover:underline"
                  >
                    {a.displayName ?? a.email ?? "—"}
                  </Link>
                  {a.displayName && (
                    <div className="text-ink-subtle">{a.email}</div>
                  )}
                </Td>
                <Td>{shortDate(a.createdAt)}</Td>
                <Td>
                  {a.onboardingCompletedAt ? (
                    <Pill tone="good">done</Pill>
                  ) : (
                    <Pill tone="warn">in progress</Pill>
                  )}
                </Td>
                <Td>{a.isTestUser ? <Pill tone="accent">test</Pill> : "—"}</Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
        {recentSignups.length === 0 && (
          <p className="text-[13px] text-ink-muted">No athletes yet.</p>
        )}
      </Section>
    </div>
  );
}
