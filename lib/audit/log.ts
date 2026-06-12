import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

export type AuditActorType = "athlete" | "admin" | "system";

export type AuditEntry = {
  actorType: AuditActorType;
  /** Athlete id or admin auth user id; null for system/cron. */
  actorId?: string | null;
  /** Captured for admin actions so the log reads without a join. */
  actorEmail?: string | null;
  /** Dotted key, e.g. "account.delete", "strava.connect". */
  action: string;
  targetAthleteId?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Append an audit-log entry. Best-effort: a logging failure must not break the
 * action being audited, so this never throws.
 */
export async function recordAuditEvent(entry: AuditEntry): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      actor_type: entry.actorType,
      actor_id: entry.actorId ?? null,
      actor_email: entry.actorEmail ?? null,
      action: entry.action,
      target_athlete_id: entry.targetAthleteId ?? null,
      metadata: entry.metadata ?? {},
    });
  } catch (e) {
    console.error("[audit] failed to record", entry.action, e);
  }
}
