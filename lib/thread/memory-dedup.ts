/**
 * Pure de-duplication logic for chat-extracted memory items (niggles and life
 * context), kept free of server-only deps so it can be unit-tested. A
 * remembered thing is one thing, not a log of every time Casey re-mentions it
 * in a conversation: re-mentions the same day refresh the existing row instead
 * of stacking duplicates. Separate days still create separate rows, which for
 * niggles is the genuine recurrence signal the escalation counter reads.
 *
 * Niggles key on the (normalised) body part; context keys on its tag set.
 * Tagless context has no safe identity, so it never de-dups.
 */

/**
 * Normalise a niggle body-part tag. Light enough to roll up common variants
 * ("left calf", "right calf", "calf tight" → "calf") without invent-merging
 * unrelated parts. Shared with the escalation counter so the page, the
 * de-dup, and the escalation all agree on what "the same niggle" means.
 */
export function normaliseBodyPart(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const lower = raw.trim().toLowerCase();
  if (!lower) return null;
  const stripped = lower
    .replace(/^(left|right)\s+/, "")
    .replace(/[^a-z\s]/g, "")
    .trim();
  return stripped || null;
}

/** A cleaned remember_injury call: content + its (already-cleaned) body-part tag. */
export type NiggleCall = { content: string; tag: string };

/** An existing injury row for the athlete, today. */
export type ExistingNiggle = { id: string; tags: string[] };

export type NigglePlan = {
  /** Existing same-body-part niggles to refresh in place. */
  updates: Array<{ id: string; content: string }>;
  /** New niggles to insert. */
  inserts: Array<{ content: string; tag: string }>;
};

/**
 * Decide how a turn's remember_injury calls land against the niggles already
 * logged today. Collapses the turn by normalised body part (latest content
 * wins), then folds each part into an existing same-part niggle from today
 * (update) or a new row (insert).
 *
 * `existingToday` must be newest-first so the most recent same-part niggle is
 * the one refreshed.
 */
export function planNiggleWrites(
  calls: NiggleCall[],
  existingToday: ExistingNiggle[],
): NigglePlan {
  const byPart = new Map<string, { content: string; tag: string }>();
  for (const call of calls) {
    const content = call.content.trim();
    const tag = call.tag.trim();
    if (!content || !tag) continue;
    const part = normaliseBodyPart(tag) ?? tag;
    byPart.set(part, { content, tag });
  }

  const existingIdByPart = new Map<string, string>();
  for (const row of existingToday) {
    for (const tg of row.tags ?? []) {
      const part = normaliseBodyPart(tg);
      if (part && !existingIdByPart.has(part)) existingIdByPart.set(part, row.id);
    }
  }

  const updates: NigglePlan["updates"] = [];
  const inserts: NigglePlan["inserts"] = [];
  for (const [part, { content, tag }] of byPart) {
    const existingId = existingIdByPart.get(part);
    if (existingId) updates.push({ id: existingId, content });
    else inserts.push({ content, tag });
  }
  return { updates, inserts };
}

/** A cleaned remember_context call: content + its (already-cleaned) tags. */
export type ContextCall = { content: string; tags: string[] };

/** An existing context row for the athlete, today. */
export type ExistingContext = { id: string; tags: string[] };

export type ContextPlan = {
  updates: Array<{ id: string; content: string }>;
  inserts: Array<{ content: string; tags: string[] }>;
};

/**
 * Identity for a context note: its normalised tag set (lowercased, de-duped,
 * sorted). Notes with the same set of tags ('work', or 'sleep'+'work') are the
 * same standing note and get refreshed; different tag sets stay separate.
 * Returns null for a tagless note, which has no safe identity to merge on.
 */
function contextKey(tags: string[]): string | null {
  const norm = Array.from(
    new Set(tags.map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0)),
  ).sort();
  return norm.length > 0 ? norm.join("|") : null;
}

/**
 * Decide how a turn's remember_context calls land against the context notes
 * already logged today. Collapses the turn by tag set (latest content wins),
 * folds each into an existing same-tag-set note from today (update) or a new
 * row (insert). Tagless notes always insert and never merge with anything,
 * since their free-form content carries no reliable identity.
 *
 * `existingToday` must be newest-first so the most recent same-tag-set note is
 * the one refreshed.
 */
export function planContextWrites(
  calls: ContextCall[],
  existingToday: ExistingContext[],
): ContextPlan {
  const byKey = new Map<string, { content: string; tags: string[] }>();
  const inserts: ContextPlan["inserts"] = [];
  for (const call of calls) {
    const content = call.content.trim();
    if (!content) continue;
    const tags = Array.from(
      new Set(call.tags.map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0)),
    );
    const key = contextKey(tags);
    if (key === null) inserts.push({ content, tags });
    else byKey.set(key, { content, tags });
  }

  const existingIdByKey = new Map<string, string>();
  for (const row of existingToday) {
    const key = contextKey(row.tags ?? []);
    if (key && !existingIdByKey.has(key)) existingIdByKey.set(key, row.id);
  }

  const updates: ContextPlan["updates"] = [];
  for (const [key, { content, tags }] of byKey) {
    const existingId = existingIdByKey.get(key);
    if (existingId) updates.push({ id: existingId, content });
    else inserts.push({ content, tags });
  }
  return { updates, inserts };
}
