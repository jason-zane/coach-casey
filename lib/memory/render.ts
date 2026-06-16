/**
 * Renders the working read (the hot subset of athlete_insights) into the
 * context block every Casey surface loads. Pure and testable: takes
 * insights + a reference time, returns a string or null.
 *
 * The block is deliberately compact. It is a coach's carried mental model,
 * not a data dump, and it is framed as belief (verifiable against raw data)
 * rather than fact, so Casey never asserts a stale read as gospel.
 */

import type { Insight, InsightLayer } from "./reconcile";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Relative age of an ISO timestamp, in a coach's casual register. */
export function formatAge(iso: string | null, nowIso: string): string | null {
  if (!iso) return null;
  const ms = new Date(nowIso).getTime() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  const days = Math.floor(ms / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "about a week ago";
  if (days < 31) return `about ${Math.round(days / 7)} weeks ago`;
  if (days < 60) return "about a month ago";
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  const years = (days / 365).toFixed(days < 550 ? 0 : 1).replace(/\.0$/, "");
  return `${years} ${Number(years) === 1 ? "year" : "years"} ago`;
}

const LAYER_ORDER: InsightLayer[] = ["profile", "block", "pattern", "thread"];
const LAYER_HEADINGS: Record<InsightLayer, string> = {
  profile: "Who this runner is",
  block: "Current block",
  pattern: "Learned patterns",
  thread: "Open threads",
};

function renderLine(insight: Insight, nowIso: string): string {
  const annotations: string[] = [];

  if (insight.layer === "pattern" && insight.confidence !== "medium") {
    annotations.push(insight.confidence);
  }
  if (insight.recurrence) {
    annotations.push("recurring");
  }
  if (insight.status === "resolving") {
    annotations.push("resolving");
  }

  // Profile / block lean on event-or-validity age ("as of"); threads lean
  // on when they last mattered.
  const ageIso =
    insight.layer === "thread"
      ? insight.lastReferencedAt
      : insight.eventAt ?? insight.recordedAt;
  const age = formatAge(ageIso, nowIso);
  if (age && age !== "today") {
    annotations.push(insight.layer === "thread" ? `last touched ${age}` : `as of ${age}`);
  }

  const suffix = annotations.length ? ` (${annotations.join(", ")})` : "";
  return `- ${insight.content}${suffix}`;
}

/**
 * Render the hot insight set. Returns null when there is nothing to show
 * (early athletes, before consolidation has run), so the caller can omit
 * the section entirely rather than print an empty heading.
 */
export function renderWorkingRead(insights: Insight[], nowIso: string): string | null {
  const hot = insights.filter(
    (i) => i.hot && i.status !== "closed" && i.status !== "superseded",
  );
  if (hot.length === 0) return null;

  const sections: string[] = [];
  for (const layer of LAYER_ORDER) {
    const rows = hot
      .filter((i) => i.layer === layer)
      .sort((a, b) => (a.lastReferencedAt < b.lastReferencedAt ? 1 : -1));
    if (rows.length === 0) continue;
    const lines = rows.map((r) => renderLine(r, nowIso)).join("\n");
    sections.push(`${LAYER_HEADINGS[layer]}:\n${lines}`);
  }
  if (sections.length === 0) return null;

  const preamble =
    "This is your maintained read of this athlete: what you already know and have concluded, carried forward across interactions. Build on it rather than re-deriving from scratch. It is your belief, not raw fact; when something turns on it, check it against the data.";

  return `# Casey's read of this athlete\n${preamble}\n\n${sections.join("\n\n")}`;
}
