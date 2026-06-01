import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { getPostHogClient } from "@/lib/posthog-server";

export type ErrorSource =
  | "route"
  | "cron"
  | "webhook"
  | "action"
  | "pipeline"
  | "client";

export type CaptureContext = {
  source: ErrorSource;
  /** Request path or handler name, e.g. "/api/chat" or "strava-poll". */
  route?: string | null;
  athleteId?: string | null;
  level?: "error" | "warn" | "fatal";
  /** Next.js error digest, for correlating a client boundary with the server. */
  digest?: string | null;
  context?: Record<string, unknown>;
};

type NormalizedError = { name: string; message: string; stack?: string };

/**
 * Best-effort error capture. Writes a row to error_events (read by the admin
 * observability dashboard) and mirrors to PostHog as an $exception. This
 * NEVER throws: observability must not be able to take down the path it is
 * observing. Each sink is isolated so one failing does not skip the other.
 */
export async function captureError(
  err: unknown,
  ctx: CaptureContext,
): Promise<void> {
  const e = normalizeError(err);

  try {
    const admin = createAdminClient();
    await admin.from("error_events").insert({
      level: ctx.level ?? "error",
      source: ctx.source,
      name: e.name,
      message: e.message.slice(0, 8000),
      stack: e.stack ?? null,
      digest: ctx.digest ?? null,
      route: ctx.route ?? null,
      athlete_id: ctx.athleteId ?? null,
      context: ctx.context ?? {},
    });
  } catch (insertErr) {
    console.error("[observability] error_events insert failed", insertErr);
  }

  try {
    getPostHogClient().capture({
      distinctId: ctx.athleteId ?? "system",
      event: "$exception",
      properties: {
        $exception_message: e.message,
        $exception_type: e.name,
        source: ctx.source,
        route: ctx.route ?? undefined,
        ...ctx.context,
      },
    });
  } catch {
    // PostHog mirror is a bonus; never let it surface.
  }
}

function normalizeError(err: unknown): NormalizedError {
  if (err instanceof Error) {
    return {
      name: err.name || "Error",
      message: err.message || "Unknown error",
      stack: err.stack,
    };
  }
  if (typeof err === "string") return { name: "Error", message: err };
  return { name: "NonError", message: safeStringify(err) };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
