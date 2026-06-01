import "server-only";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { captureError } from "./capture";

type CronRunHandle = { id: string | null; job: string; startedAt: number };

async function startCronRun(job: string): Promise<CronRunHandle> {
  const startedAt = Date.now();
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("cron_runs")
      .insert({ job })
      .select("id")
      .maybeSingle();
    return { id: (data as { id: string } | null)?.id ?? null, job, startedAt };
  } catch (e) {
    console.error("[observability] cron_runs insert failed", e);
    return { id: null, job, startedAt };
  }
}

async function finishCronRun(
  handle: CronRunHandle,
  outcome: { ok: boolean; stats?: unknown; error?: string | null },
): Promise<void> {
  if (!handle.id) return;
  try {
    const admin = createAdminClient();
    await admin
      .from("cron_runs")
      .update({
        finished_at: new Date().toISOString(),
        ok: outcome.ok,
        duration_ms: Date.now() - handle.startedAt,
        stats: outcome.stats ?? null,
        error: outcome.error ?? null,
      })
      .eq("id", handle.id);
  } catch (e) {
    console.error("[observability] cron_runs update failed", e);
  }
}

/**
 * Wraps a cron handler so every invocation is recorded in cron_runs (for the
 * admin health view) and any thrown error is captured. The handler returns the
 * NextResponse it would normally return; a non-2xx status or a thrown error
 * marks the run as failed. Recording is best-effort and never masks the
 * handler's own result.
 */
export async function recordCronRun(
  job: string,
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> {
  const handle = await startCronRun(job);
  try {
    const res = await handler();
    let ok = res.status < 400;
    let stats: unknown = { status: res.status };
    try {
      const body = await res.clone().json();
      stats = body;
      const hasItemErrors =
        Array.isArray((body as { errors?: unknown[] }).errors) &&
        (body as { errors: unknown[] }).errors.length > 0;
      if ((body as { ok?: boolean }).ok === false || hasItemErrors) ok = false;
    } catch {
      // non-JSON body; fall back to status-based ok
    }
    await finishCronRun(handle, { ok, stats });
    return res;
  } catch (err) {
    await finishCronRun(handle, {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
    await captureError(err, { source: "cron", route: job });
    return NextResponse.json(
      { ok: false, error: "cron handler threw" },
      { status: 500 },
    );
  }
}
