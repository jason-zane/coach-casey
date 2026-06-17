/**
 * Pure niggle de-duplication logic, kept free of server-only deps so it can
 * be unit-tested. A niggle is one thing per body part, not a log of every
 * time Casey re-mentions it: a single conversation about the calf should land
 * as one niggle, and a second mention the same day should refresh that niggle
 * rather than stack a duplicate. Separate days still create separate rows,
 * which is the genuine recurrence signal the escalation counter reads.
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
