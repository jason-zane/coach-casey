/**
 * Pure reconciliation logic for the interpreted-memory layer.
 *
 * The consolidation pass (an LLM call) proposes insight operations. This
 * module turns those proposals into a concrete set of database writes,
 * applying the deterministic discipline that keeps the maintained read
 * trustworthy and bounded:
 *
 *   - Promotion threshold: a low-confidence pattern is stored but not
 *     loaded (hot=false) until evidence upgrades it. Never load a belief
 *     formed from a single data point into every prompt.
 *   - Recurrence detection: a new insight whose tags match a prior CLOSED
 *     insight is flagged as a recurrence and forced to high confidence,
 *     because "this is the third time" is the highest-signal thing a coach
 *     can notice.
 *   - Bounded hot set: the always-loaded set is capped per layer. Demotion
 *     (not deletion) makes room by cooling the least-recently-referenced
 *     rows. Pruning the working read never forgets; it archives.
 *
 * No `server-only` import on purpose: this is pure and unit-tested in a
 * plain Node process. The DB and LLM live in insights.ts / consolidate.ts.
 */

export type InsightLayer = "profile" | "pattern" | "block" | "thread";
export type InsightStatus = "live" | "resolving" | "closed" | "superseded";
export type Confidence = "low" | "medium" | "high";

/** A stored insight, as read back from the database. */
export type Insight = {
  id: string;
  layer: InsightLayer;
  content: string;
  status: InsightStatus;
  confidence: Confidence;
  hot: boolean;
  tags: string[];
  evidence: string | null;
  eventAt: string | null;
  recordedAt: string;
  lastReferencedAt: string;
  recurrence: boolean;
};

/** One operation proposed by the consolidation LLM call. */
export type ProposedInsight = {
  op: "add" | "update" | "close" | "supersede";
  /** Existing insight id, required for update / close / supersede. */
  id?: string | null;
  layer: InsightLayer;
  content: string;
  status?: InsightStatus;
  confidence?: Confidence;
  tags?: string[];
  evidence?: string | null;
  /** ISO date when this was true / happened. */
  eventAt?: string | null;
};

/** A row to insert. ids are assigned by the database. */
export type InsightInsert = {
  layer: InsightLayer;
  content: string;
  status: InsightStatus;
  confidence: Confidence;
  hot: boolean;
  tags: string[];
  evidence: string | null;
  eventAt: string | null;
  recurrence: boolean;
  /** Set when this insert replaces a superseded row. */
  supersedes: string | null;
  source: string;
};

/** A patch to an existing row, addressed by id. */
export type InsightPatch = {
  id: string;
  status?: InsightStatus;
  content?: string;
  confidence?: Confidence;
  hot?: boolean;
  tags?: string[];
  evidence?: string | null;
  recurrence?: boolean;
  /** Bumped whenever an insight is touched, so demotion can cool the coldest. */
  lastReferencedAt?: string;
  /** Set when a row is superseded. */
  validUntil?: string | null;
};

export type InsightWritePlan = {
  inserts: InsightInsert[];
  patches: InsightPatch[];
};

/**
 * How many insights per layer may sit in the always-loaded working read.
 * Tight on purpose: the read is a coach's carried mental model, not a
 * filing cabinet. Cold rows remain in the archive and are retrievable by
 * tag.
 */
export const HOT_CAPS: Record<InsightLayer, number> = {
  profile: 6,
  pattern: 8,
  block: 3,
  thread: 6,
};

const CONFIDENCE_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

function normalizeTags(tags: string[] | undefined | null): string[] {
  if (!tags) return [];
  return tags.map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0);
}

/**
 * Whether a freshly-formed insight should enter the working read.
 *   - patterns: only at medium+ confidence (the promotion threshold).
 *   - threads:  while live or resolving (an open thread is hot).
 *   - profile / block: hot by default (small, slow-changing, always
 *     relevant), bounded by HOT_CAPS.
 */
function hotEligible(
  layer: InsightLayer,
  status: InsightStatus,
  confidence: Confidence,
): boolean {
  if (status === "closed" || status === "superseded") return false;
  if (layer === "pattern") return CONFIDENCE_RANK[confidence] >= CONFIDENCE_RANK.medium;
  if (layer === "thread") return status === "live" || status === "resolving";
  return true;
}

/**
 * A new insight is a recurrence if it shares a tag with an existing CLOSED
 * insight in the same layer. Returns the prior insight when found.
 */
export function findRecurrence(
  proposedTags: string[],
  layer: InsightLayer,
  existing: Insight[],
): Insight | null {
  const tags = new Set(normalizeTags(proposedTags));
  if (tags.size === 0) return null;
  for (const e of existing) {
    if (e.layer !== layer) continue;
    if (e.status !== "closed") continue;
    if (normalizeTags(e.tags).some((t) => tags.has(t))) return e;
  }
  return null;
}

/**
 * Turn the LLM's proposed operations into a concrete write plan, applying
 * the promotion threshold, recurrence detection, and hot-set bound.
 */
export function planInsightWrites(
  existing: Insight[],
  proposed: ProposedInsight[],
  nowIso: string,
  source: string,
): InsightWritePlan {
  const inserts: InsightInsert[] = [];
  const patches: InsightPatch[] = [];
  const patchById = new Map<string, InsightPatch>();
  const byId = new Map(existing.map((e) => [e.id, e]));

  const upsertPatch = (id: string, patch: Omit<InsightPatch, "id">) => {
    const prev = patchById.get(id) ?? { id };
    const next = { ...prev, ...patch, id };
    patchById.set(id, next);
  };

  for (const p of proposed) {
    const status: InsightStatus = p.status ?? (p.op === "close" ? "closed" : "live");
    const confidence: Confidence = p.confidence ?? "medium";
    const tags = normalizeTags(p.tags);

    if (p.op === "close" && p.id && byId.has(p.id)) {
      upsertPatch(p.id, { status: "closed", hot: false, lastReferencedAt: nowIso });
      continue;
    }

    if (p.op === "update" && p.id && byId.has(p.id)) {
      const cur = byId.get(p.id)!;
      const eligible = hotEligible(cur.layer, status, confidence);
      upsertPatch(p.id, {
        content: p.content,
        status,
        confidence,
        tags: tags.length ? tags : cur.tags,
        evidence: p.evidence ?? cur.evidence,
        hot: eligible ? true : cur.hot && eligible,
        lastReferencedAt: nowIso,
      });
      continue;
    }

    // add / supersede both insert a new row. supersede also closes the old.
    if (p.op === "supersede" && p.id && byId.has(p.id)) {
      upsertPatch(p.id, { status: "superseded", hot: false, validUntil: nowIso });
    }

    const recurrenceOf = findRecurrence(tags, p.layer, existing);
    const effectiveConfidence: Confidence = recurrenceOf ? "high" : confidence;
    const eligible = hotEligible(p.layer, status, effectiveConfidence);
    inserts.push({
      layer: p.layer,
      content: p.content,
      status,
      confidence: effectiveConfidence,
      hot: eligible,
      tags,
      evidence: p.evidence ?? null,
      eventAt: p.eventAt ?? null,
      recurrence: recurrenceOf != null,
      supersedes: p.op === "supersede" ? (p.id ?? null) : null,
      source,
    });

    // Reviving a recurrence: the prior closed row gets re-touched so the
    // archive reflects that it came back, without re-loading the old text.
    if (recurrenceOf) {
      upsertPatch(recurrenceOf.id, { recurrence: true, lastReferencedAt: nowIso });
    }
  }

  // Enforce the bounded hot set per layer. Count what would be hot after
  // applying the plan, and cool the least-recently-referenced existing rows
  // beyond the cap. New inserts are freshest (referenced now), so they stay.
  for (const layer of Object.keys(HOT_CAPS) as InsightLayer[]) {
    const cap = HOT_CAPS[layer];

    const newHot = inserts.filter((i) => i.layer === layer && i.hot);

    // Existing rows that remain hot after patches, with their effective
    // last-referenced time.
    const existingHot = existing
      .filter((e) => e.layer === layer)
      .map((e) => {
        const patch = patchById.get(e.id);
        const hot = patch?.hot ?? e.hot;
        const lastRef = patch?.lastReferencedAt ?? e.lastReferencedAt;
        return { id: e.id, hot, lastRef };
      })
      .filter((e) => e.hot);

    let overBy = newHot.length + existingHot.length - cap;
    if (overBy <= 0) continue;

    // Cool the coldest existing rows first (oldest last-referenced); the new
    // inserts are all freshly referenced, so they outrank them.
    existingHot.sort((a, b) => (a.lastRef < b.lastRef ? -1 : 1));
    for (let i = 0; i < existingHot.length && overBy > 0; i++) {
      upsertPatch(existingHot[i].id, { hot: false });
      overBy--;
    }

    // If a single consolidation proposed more hot inserts than the cap, the
    // inserts themselves still exceed it once existing rows are exhausted (a
    // first or broad consolidation). Demote the trailing inserts so the
    // bounded-read invariant holds. They share the same reference time, so
    // trailing order is as fair as any.
    for (let i = newHot.length - 1; i >= 0 && overBy > 0; i--) {
      newHot[i].hot = false;
      overBy--;
    }
  }

  patches.push(...patchById.values());
  return { inserts, patches };
}
