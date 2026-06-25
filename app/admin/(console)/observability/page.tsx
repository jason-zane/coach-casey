import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { loadObservabilityData } from "@/lib/admin/observability-data";
import {
  PageHeader,
  StatTile,
  Section,
  TableShell,
  Th,
  Td,
  shortDateTime,
} from "../_components/ui";

export const dynamic = "force-dynamic";

/**
 * Errors, background-job health, and the audit trail — the single health
 * surface, fed from error_events, cron_runs, and audit_log (all service-role).
 */
export default async function ObservabilityPage() {
  const gate = await requireAdmin();
  if (!gate.ok) redirect("/admin/login");

  const data = await loadObservabilityData();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Console"
        title="Observability"
        lede="Errors, background-job health, and the audit trail. Errors and cron runs feed from the last few hundred records."
      />

      {data.degraded && (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 font-mono text-[12px] leading-[1.4] text-amber-800">
          Some observability tables were unreachable. If you just deployed, apply
          the migrations (error_events, cron_runs, audit_log) and reload.
        </p>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile
          label="Errors 24h"
          value={data.errorCount24h}
          tone={data.errorCount24h > 0 ? "alert" : "default"}
        />
        {data.errorCountBySource24h.slice(0, 4).map((s) => (
          <StatTile key={s.source} label={`${s.source} 24h`} value={s.count} />
        ))}
      </section>

      <Section title="Cron health">
        <TableShell>
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
                    : "—"}
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
        </TableShell>
      </Section>

      <Section title="Recent errors">
        <TableShell>
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
                    {e.route ?? "—"}
                  </span>
                </Td>
                <Td>
                  <span className="text-ink">
                    {e.name ? `${e.name}: ` : ""}
                    {truncate(e.message, 160)}
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
        {data.recentErrors.length === 0 && (
          <p className="text-[13px] text-ink-muted">
            No errors recorded. That is the good outcome.
          </p>
        )}
      </Section>

      <Section title="Audit trail">
        <TableShell>
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
                  {a.targetAthleteId ? (
                    <Link
                      href={`/admin/athletes/${a.targetAthleteId}`}
                      className="font-mono text-[11px] text-ink-subtle underline-offset-2 hover:text-ink hover:underline"
                    >
                      {a.targetAthleteId.slice(0, 8)}
                    </Link>
                  ) : (
                    <span className="font-mono text-[11px] text-ink-subtle">—</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
        {data.recentAudit.length === 0 && (
          <p className="text-[13px] text-ink-muted">No audit entries yet.</p>
        )}
      </Section>
    </div>
  );
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
