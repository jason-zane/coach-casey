import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { loadObservabilityData } from "@/lib/admin/observability-data";

export const dynamic = "force-dynamic";

/**
 * Admin observability view. Reads error_events, cron_runs, and audit_log
 * (all service-role-only) to give a single health surface: recent errors,
 * cron success/failure, and a trail of sensitive actions. Gated by
 * requireAdmin, same as the cohort page.
 */
export default async function ObservabilityPage() {
  const gate = await requireAdmin();
  if (!gate.ok) redirect(gate.redirect);

  const data = await loadObservabilityData();

  return (
    <div className="min-h-svh bg-paper text-ink">
      <div className="mx-auto max-w-[960px] px-5 sm:px-8 py-10 space-y-8">
        <header className="space-y-2">
          <Link
            href="/app/admin"
            className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle hover:text-ink-muted transition-colors duration-150 inline-flex items-center gap-1"
          >
            <span aria-hidden>‹</span>
            <span>Back to admin</span>
          </Link>
          <h1
            className="text-[28px] leading-tight font-medium text-ink"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Observability
          </h1>
          <p className="text-[13px] leading-[1.55] text-ink-muted">
            Errors, background-job health, and the audit trail. Errors and cron
            runs feed from the last few hundred records.
          </p>
        </header>

        {data.degraded && (
          <p className="text-[12px] leading-[1.4] font-mono text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3">
            Some observability tables were unreachable. If you just deployed,
            apply the migrations (error_events, cron_runs, audit_log) and
            reload.
          </p>
        )}

        <section className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Stat label="Errors 24h" value={data.errorCount24h} />
          {data.errorCountBySource24h.slice(0, 4).map((s) => (
            <Stat key={s.source} label={`${s.source} 24h`} value={s.count} />
          ))}
        </section>

        <section className="space-y-3">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted">
            Cron health
          </h2>
          <div className="overflow-x-auto rounded-md border border-rule">
            <table className="w-full font-sans text-[12px] text-ink">
              <thead className="bg-surface text-ink-muted">
                <tr>
                  <Th>Job</Th>
                  <Th>Last run</Th>
                  <Th>Status</Th>
                  <Th>Duration</Th>
                  <Th>Runs 24h</Th>
                  <Th>Failures 24h</Th>
                </tr>
              </thead>
              <tbody>
                {data.cronHealth.map((c) => (
                  <tr key={c.job} className="border-t border-rule">
                    <Td>
                      <span className="font-mono text-[11px]">{c.job}</span>
                    </Td>
                    <Td>{shortDateTime(c.lastRunAt)}</Td>
                    <Td>
                      {c.lastOk === null ? (
                        <span className="text-ink-subtle">never</span>
                      ) : c.lastOk ? (
                        <span className="text-emerald-600">ok</span>
                      ) : (
                        <span className="text-red-700">failed</span>
                      )}
                    </Td>
                    <Td>
                      {c.lastDurationMs != null
                        ? `${(c.lastDurationMs / 1000).toFixed(1)}s`
                        : "-"}
                    </Td>
                    <Td>{c.runsLast24h}</Td>
                    <Td>
                      {c.failuresLast24h > 0 ? (
                        <span className="text-red-700">{c.failuresLast24h}</span>
                      ) : (
                        "0"
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted">
            Recent errors
          </h2>
          <div className="overflow-x-auto rounded-md border border-rule">
            <table className="w-full font-sans text-[12px] text-ink">
              <thead className="bg-surface text-ink-muted">
                <tr>
                  <Th>When</Th>
                  <Th>Source</Th>
                  <Th>Route</Th>
                  <Th>Message</Th>
                </tr>
              </thead>
              <tbody>
                {data.recentErrors.map((e) => (
                  <tr key={e.id} className="border-t border-rule">
                    <Td>{shortDateTime(e.createdAt)}</Td>
                    <Td>
                      <span className="font-mono text-[11px]">{e.source}</span>
                    </Td>
                    <Td>
                      <span className="font-mono text-[11px] text-ink-muted">
                        {e.route ?? "-"}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-ink">
                        {e.name ? `${e.name}: ` : ""}
                        {truncate(e.message, 140)}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.recentErrors.length === 0 && (
            <p className="text-[13px] text-ink-muted">
              No errors recorded. That is the good outcome.
            </p>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted">
            Audit trail
          </h2>
          <div className="overflow-x-auto rounded-md border border-rule">
            <table className="w-full font-sans text-[12px] text-ink">
              <thead className="bg-surface text-ink-muted">
                <tr>
                  <Th>When</Th>
                  <Th>Actor</Th>
                  <Th>Action</Th>
                  <Th>Target athlete</Th>
                </tr>
              </thead>
              <tbody>
                {data.recentAudit.map((a) => (
                  <tr key={a.id} className="border-t border-rule">
                    <Td>{shortDateTime(a.createdAt)}</Td>
                    <Td>
                      <span className="text-ink">{a.actorType}</span>
                      {a.actorEmail && (
                        <span className="text-ink-subtle"> {a.actorEmail}</span>
                      )}
                    </Td>
                    <Td>
                      <span className="font-mono text-[11px]">{a.action}</span>
                    </Td>
                    <Td>
                      <span className="font-mono text-[11px] text-ink-subtle">
                        {a.targetAthleteId
                          ? a.targetAthleteId.slice(0, 8)
                          : "-"}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.recentAudit.length === 0 && (
            <p className="text-[13px] text-ink-muted">
              No audit entries yet.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-rule bg-surface p-3">
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

function shortDateTime(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}
