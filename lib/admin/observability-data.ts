import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

export type ErrorEventRow = {
  id: string;
  createdAt: string;
  level: string;
  source: string;
  name: string | null;
  message: string;
  route: string | null;
  athleteId: string | null;
};

export type CronJobHealth = {
  job: string;
  lastRunAt: string | null;
  lastOk: boolean | null;
  lastDurationMs: number | null;
  runsLast24h: number;
  failuresLast24h: number;
};

export type AuditEntryRow = {
  id: string;
  createdAt: string;
  actorType: string;
  actorEmail: string | null;
  action: string;
  targetAthleteId: string | null;
};

export type ObservabilityData = {
  errorCount24h: number;
  errorCountBySource24h: Array<{ source: string; count: number }>;
  recentErrors: ErrorEventRow[];
  cronHealth: CronJobHealth[];
  recentAudit: AuditEntryRow[];
  /** True when the observability tables are not reachable (e.g. migrations not applied yet). */
  degraded: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

// Known cron jobs so the health table shows a row even for a job that has not
// run yet (or whose history aged out of the fetch window).
const KNOWN_CRON_JOBS = [
  "strava-poll",
  "weekly-review",
  "proactive-surfaces",
  "history-backfill",
  "deep-backfill",
  "account-purge",
];

/**
 * Loads the admin observability view. Every section is resilient: if a table
 * is missing or a query fails, that section degrades to empty rather than
 * taking down the whole dashboard. This keeps the page usable before the
 * observability migrations have been applied.
 */
export async function loadObservabilityData(): Promise<ObservabilityData> {
  const admin = createAdminClient();
  const dayAgoIso = new Date(Date.now() - DAY_MS).toISOString();

  let degraded = false;

  const recentErrors: ErrorEventRow[] = [];
  try {
    const { data, error } = await admin
      .from("error_events")
      .select("id, created_at, level, source, name, message, route, athlete_id")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      recentErrors.push({
        id: r.id as string,
        createdAt: r.created_at as string,
        level: r.level as string,
        source: r.source as string,
        name: (r.name as string | null) ?? null,
        message: r.message as string,
        route: (r.route as string | null) ?? null,
        athleteId: (r.athlete_id as string | null) ?? null,
      });
    }
  } catch {
    degraded = true;
  }

  const errorCountBySource24h: Array<{ source: string; count: number }> = [];
  let errorCount24h = 0;
  try {
    const { data, error } = await admin
      .from("error_events")
      .select("source")
      .gte("created_at", dayAgoIso)
      .limit(2000);
    if (error) throw error;
    const counts = new Map<string, number>();
    for (const r of (data ?? []) as Array<{ source: string }>) {
      counts.set(r.source, (counts.get(r.source) ?? 0) + 1);
      errorCount24h += 1;
    }
    for (const [source, count] of [...counts.entries()].sort(
      (a, b) => b[1] - a[1],
    )) {
      errorCountBySource24h.push({ source, count });
    }
  } catch {
    degraded = true;
  }

  const cronHealth: CronJobHealth[] = [];
  try {
    const { data, error } = await admin
      .from("cron_runs")
      .select("job, started_at, ok, duration_ms")
      .order("started_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    const rows = (data ?? []) as Array<{
      job: string;
      started_at: string;
      ok: boolean | null;
      duration_ms: number | null;
    }>;
    const byJob = new Map<string, typeof rows>();
    for (const r of rows) {
      const list = byJob.get(r.job) ?? [];
      list.push(r);
      byJob.set(r.job, list);
    }
    const jobs = new Set<string>([...KNOWN_CRON_JOBS, ...byJob.keys()]);
    for (const job of jobs) {
      const list = byJob.get(job) ?? [];
      const last = list[0] ?? null;
      const within24h = list.filter(
        (r) => new Date(r.started_at).getTime() >= Date.now() - DAY_MS,
      );
      cronHealth.push({
        job,
        lastRunAt: last?.started_at ?? null,
        lastOk: last ? last.ok : null,
        lastDurationMs: last?.duration_ms ?? null,
        runsLast24h: within24h.length,
        failuresLast24h: within24h.filter((r) => r.ok === false).length,
      });
    }
    cronHealth.sort((a, b) => a.job.localeCompare(b.job));
  } catch {
    degraded = true;
  }

  const recentAudit: AuditEntryRow[] = [];
  try {
    const { data, error } = await admin
      .from("audit_log")
      .select("id, created_at, actor_type, actor_email, action, target_athlete_id")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      recentAudit.push({
        id: r.id as string,
        createdAt: r.created_at as string,
        actorType: r.actor_type as string,
        actorEmail: (r.actor_email as string | null) ?? null,
        action: r.action as string,
        targetAthleteId: (r.target_athlete_id as string | null) ?? null,
      });
    }
  } catch {
    degraded = true;
  }

  return {
    errorCount24h,
    errorCountBySource24h,
    recentErrors,
    cronHealth,
    recentAudit,
    degraded,
  };
}
