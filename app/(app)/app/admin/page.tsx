import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { loadAdminPageData } from "@/lib/admin/page-data";
import { TestUserToggle } from "./_test-user-toggle";
import { GenerateWeeklyReviewButton } from "./_generate-weekly-review-button";
import { RegenerateDebriefButton } from "./_regenerate-debrief-button";

export const dynamic = "force-dynamic";

/**
 * Admin surface. Read-mostly cohort overview, with two write paths:
 *  - toggle is_test_user on any athlete
 *  - manually generate a weekly review for any athlete (force-flag too)
 *
 * Gated by ADMIN_EMAILS env var. Non-admins are sent to /app rather
 * than /app/admin returning a 404, so the existence of the surface
 * isn't a side-channel signal.
 */
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ regen_error?: string }>;
}) {
  const gate = await requireAdmin();
  if (!gate.ok) redirect(gate.redirect);

  const data = await loadAdminPageData();
  const { athletes, stats } = data;
  const sp = await searchParams;
  const regenError = sp.regen_error ?? null;

  return (
    <div className="min-h-svh bg-paper text-ink">
      <div className="mx-auto max-w-[960px] px-5 sm:px-8 py-10 space-y-8">
        <header className="space-y-2">
          <Link
            href="/app"
            className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle hover:text-ink-muted transition-colors duration-150 inline-flex items-center gap-1"
          >
            <span aria-hidden>‹</span>
            <span>Back to thread</span>
          </Link>
          <h1
            className="text-[28px] leading-tight font-medium text-ink"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Admin
          </h1>
          <p className="text-[13px] leading-[1.55] text-ink-muted">
            Cohort overview. Toggle test-user flag, retroactively trigger
            weekly reviews. Use sparingly.
          </p>
        </header>

        {regenError && (
          <pre className="text-[11px] leading-[1.4] font-mono text-red-700 bg-red-50 border border-red-200 rounded-md p-3 whitespace-pre-wrap break-all">
            regen error: {regenError}
          </pre>
        )}

        <section className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Stat label="Athletes" value={stats.totalAthletes} />
          <Stat label="Test users" value={stats.testUsers} />
          <Stat
            label="Active 7d"
            value={stats.activeLast7Days}
            hint="ran or cross-trained in the last 7 days"
          />
          <Stat
            label="Debriefs 7d"
            value={stats.debriefsLast7Days}
          />
          <Stat
            label="Reviews 7d"
            value={stats.weeklyReviewsLast7Days}
            hint="weekly reviews created in the last 7 days"
          />
        </section>

        <section className="space-y-3">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted">
            Athletes
          </h2>
          <div className="overflow-x-auto rounded-md border border-rule">
            <table className="w-full font-sans text-[12px] text-ink">
              <thead className="bg-surface text-ink-muted">
                <tr>
                  <Th>Name / email</Th>
                  <Th>Joined</Th>
                  <Th>Last sign in</Th>
                  <Th>Strava</Th>
                  <Th>Last activity</Th>
                  <Th>Last Casey msg</Th>
                  <Th>Last review</Th>
                  <Th>Test user</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {athletes.map((a) => (
                  <tr key={a.id} className="border-t border-rule">
                    <Td>
                      <div className="text-ink">
                        {a.displayName ?? "–"}
                      </div>
                      <div className="text-ink-subtle">{a.email}</div>
                    </Td>
                    <Td>{shortDate(a.createdAt)}</Td>
                    <Td>{shortDate(a.lastSignInAt)}</Td>
                    <Td>
                      {a.stravaConnected ? (
                        <span className="text-emerald-600">connected</span>
                      ) : (
                        <span className="text-ink-subtle">–</span>
                      )}
                    </Td>
                    <Td>{shortDate(a.lastActivityAt)}</Td>
                    <Td>{shortDate(a.lastCaseyMessageAt)}</Td>
                    <Td>
                      {a.lastWeeklyReviewWeekStart ?? (
                        <span className="text-ink-subtle">–</span>
                      )}
                    </Td>
                    <Td>
                      <TestUserToggle
                        athleteId={a.id}
                        isTestUser={a.isTestUser}
                      />
                    </Td>
                    <Td>
                      <div className="flex flex-col gap-1">
                        <GenerateWeeklyReviewButton athleteId={a.id} />
                        <RegenerateDebriefButton athleteId={a.id} />
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {athletes.length === 0 && (
            <p className="text-[13px] text-ink-muted">
              No athletes yet. They&rsquo;ll appear here once anyone signs up.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div
      className="rounded-md border border-rule bg-surface p-3"
      title={hint}
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle">
        {label}
      </div>
      <div className="mt-1 font-serif text-[24px] text-ink">{value}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.14em] font-medium">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 align-top">{children}</td>;
}

function shortDate(iso: string | null): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}
