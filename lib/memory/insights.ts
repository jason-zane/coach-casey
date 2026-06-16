import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import type { Insight, InsightWritePlan } from "./reconcile";
import { renderWorkingRead } from "./render";

/**
 * Data access for the interpreted-memory layer (athlete_insights).
 *
 * Two read shapes:
 *   - fetchHotInsights: the always-loaded working read (small, bounded).
 *   - fetchInsightsForConsolidation: live + closed, so the consolidation
 *     pass can both update live threads and detect recurrence against the
 *     archive.
 *
 * One write shape: applyInsightWrites, which takes the deterministic plan
 * from reconcile.ts and executes it.
 */

type InsightRow = {
  id: string;
  layer: string;
  content: string;
  status: string;
  confidence: string;
  hot: boolean;
  tags: string[] | null;
  evidence: string | null;
  event_at: string | null;
  recorded_at: string;
  last_referenced_at: string;
  recurrence: boolean;
};

function mapRow(row: InsightRow): Insight {
  return {
    id: row.id,
    layer: row.layer as Insight["layer"],
    content: row.content,
    status: row.status as Insight["status"],
    confidence: row.confidence as Insight["confidence"],
    hot: row.hot,
    tags: row.tags ?? [],
    evidence: row.evidence,
    eventAt: row.event_at,
    recordedAt: row.recorded_at,
    lastReferencedAt: row.last_referenced_at,
    recurrence: row.recurrence,
  };
}

const SELECT_COLS =
  "id, layer, content, status, confidence, hot, tags, evidence, event_at, recorded_at, last_referenced_at, recurrence";

/** The hot working read: what Casey carries into every interaction. */
export async function fetchHotInsights(athleteId: string): Promise<Insight[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("athlete_insights")
    .select(SELECT_COLS)
    .eq("athlete_id", athleteId)
    .eq("hot", true)
    .in("status", ["live", "resolving"])
    .order("last_referenced_at", { ascending: false })
    .limit(40);
  if (error) {
    console.warn("[insights] fetchHotInsights failed", { athleteId, error: error.message });
    return [];
  }
  return ((data ?? []) as InsightRow[]).map(mapRow);
}

/**
 * Live + closed insights for the consolidation pass. Closed rows are
 * included so recurrence can be detected against the archive (the
 * year-old-injury case). Superseded rows are excluded; they are history.
 */
export async function fetchInsightsForConsolidation(athleteId: string): Promise<Insight[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("athlete_insights")
    .select(SELECT_COLS)
    .eq("athlete_id", athleteId)
    .in("status", ["live", "resolving", "closed"])
    .order("last_referenced_at", { ascending: false })
    .limit(150);
  if (error) {
    console.warn("[insights] fetchInsightsForConsolidation failed", {
      athleteId,
      error: error.message,
    });
    return [];
  }
  return ((data ?? []) as InsightRow[]).map(mapRow);
}

/**
 * Load and render the working read for a surface prompt. Returns null when
 * the athlete has no hot insights yet (early cohort, pre-consolidation), so
 * the caller omits the section rather than printing an empty heading.
 */
export async function loadWorkingReadText(
  athleteId: string,
  nowIso: string = new Date().toISOString(),
): Promise<string | null> {
  const insights = await fetchHotInsights(athleteId);
  return renderWorkingRead(insights, nowIso);
}

/** Execute a reconciliation plan: inserts then patches. Best-effort logging. */
export async function applyInsightWrites(
  athleteId: string,
  plan: InsightWritePlan,
  nowIso: string = new Date().toISOString(),
): Promise<void> {
  const admin = createAdminClient();

  if (plan.inserts.length > 0) {
    const rows = plan.inserts.map((i) => ({
      athlete_id: athleteId,
      layer: i.layer,
      content: i.content,
      status: i.status,
      confidence: i.confidence,
      hot: i.hot,
      tags: i.tags,
      evidence: i.evidence,
      event_at: i.eventAt,
      recurrence: i.recurrence,
      supersedes: i.supersedes,
      source: i.source,
      recorded_at: nowIso,
      last_referenced_at: nowIso,
    }));
    const { error } = await admin.from("athlete_insights").insert(rows);
    if (error) {
      console.warn("[insights] insert failed", { athleteId, error: error.message });
    }
  }

  for (const patch of plan.patches) {
    const update: Record<string, unknown> = {};
    if (patch.status !== undefined) update.status = patch.status;
    if (patch.content !== undefined) update.content = patch.content;
    if (patch.confidence !== undefined) update.confidence = patch.confidence;
    if (patch.hot !== undefined) update.hot = patch.hot;
    if (patch.tags !== undefined) update.tags = patch.tags;
    if (patch.evidence !== undefined) update.evidence = patch.evidence;
    if (patch.recurrence !== undefined) update.recurrence = patch.recurrence;
    if (patch.lastReferencedAt !== undefined) update.last_referenced_at = patch.lastReferencedAt;
    if (patch.validUntil !== undefined) update.valid_until = patch.validUntil;
    if (Object.keys(update).length === 0) continue;

    const { error } = await admin
      .from("athlete_insights")
      .update(update)
      .eq("id", patch.id)
      .eq("athlete_id", athleteId);
    if (error) {
      console.warn("[insights] patch failed", {
        athleteId,
        id: patch.id,
        error: error.message,
      });
    }
  }
}
