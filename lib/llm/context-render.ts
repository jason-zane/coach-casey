import "server-only";

/**
 * Shared formatters for the system-prompt context blocks. Every Casey
 * surface (debrief, chat, cross-training, validation, follow-ups) reads
 * the same underlying fields, so the rendering of those fields lives
 * here. Surface-specific blocks (recent arc, RPE history, tool
 * availability lines, etc.) stay in their respective callers.
 *
 * Block headers always start with `# `, matching the convention the
 * prompts already use ("# Athlete", "# Goal races", etc.).
 */

// ---------------------------------------------------------------------------
// Pure formatters

export function formatPace(secPerKm: number | null | undefined): string {
  if (!secPerKm) return "n/a";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

/**
 * Render a goal-time integer (seconds) as h:mm:ss / m:ss. Returns null
 * for null input so callers can decide whether to omit the trailing
 * ", goal …" segment.
 */
export function formatGoalTime(seconds: number | null | undefined): string | null {
  if (seconds == null) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

// ---------------------------------------------------------------------------
// Athlete block

export type AthleteBlockInput = {
  displayName: string | null;
  sex?: "M" | "F" | null;
  ageYears?: number | null;
  weightKg?: number | null;
  /**
   * Optional coaching-mode line that appears at the bottom of the
   * Athlete block. Used by chat to give Casey context about whether a
   * human coach owns the plan or the athlete is self-directed; other
   * surfaces leave this null.
   */
  coachingMode?: "coach" | "self" | null;
};

const COACHING_LINES = {
  coach:
    "Coaching: a human coach is writing this athlete's training. Defer to the coach's intent. Help the athlete read what is happening inside the plan rather than offering alternative sessions.",
  self: "Coaching: self-directed or following a public plan. You can engage more directly with workout choices when the athlete asks for input.",
} as const;

export function renderAthleteBlock(input: AthleteBlockInput): string {
  const lines: string[] = [];
  lines.push(`Name: ${input.displayName ?? "(unnamed)"}`);
  if (input.sex) lines.push(`Sex: ${input.sex === "M" ? "Male" : "Female"}`);
  if (input.ageYears != null) lines.push(`Age: ${input.ageYears}`);
  if (input.weightKg != null) lines.push(`Weight: ${input.weightKg} kg`);
  if (input.coachingMode === "coach") lines.push(COACHING_LINES.coach);
  else if (input.coachingMode === "self") lines.push(COACHING_LINES.self);
  return `# Athlete\n${lines.join("\n")}`;
}

// ---------------------------------------------------------------------------
// Goal races block

export type GoalRaceInput = {
  name: string | null;
  raceDate: string | null;
  goalTimeSeconds: number | null;
};

/**
 * Returns null when there are no goal races. Callers concat with
 * \n\n so an omitted section just disappears from the prompt.
 */
export function renderGoalRacesBlock(races: GoalRaceInput[]): string | null {
  if (races.length === 0) return null;
  const lines = races.map((r) => {
    const name = r.name ?? "(unnamed race)";
    const date = r.raceDate ?? "date TBD";
    const goal = formatGoalTime(r.goalTimeSeconds);
    return `- ${name} on ${date}${goal ? `, goal ${goal}` : ""}`;
  });
  return `# Goal races\n${lines.join("\n")}`;
}

// ---------------------------------------------------------------------------
// Active training plan block

export function renderActivePlanBlock(
  planText: string | null,
  opts: { fallback?: "omit" | "say-none" } = {},
): string | null {
  const { fallback = "omit" } = opts;
  if (planText && planText.trim().length > 0) {
    return `# Active training plan\n${planText.trim()}`;
  }
  if (fallback === "say-none") {
    return "# Active training plan\nNo plan uploaded.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Memory-items block (injuries, life context, etc.)

export type MemoryItemInput = {
  kind?: string;
  content: string;
  tags: string[];
  /** Required when `dateLeading` or `withNoted` is set; ignored otherwise. */
  createdAt?: string;
};

export type MemoryBlockOptions = {
  /** Limit on how many items to include. Default: no limit. */
  limit?: number;
  /**
   * Whether to render `[noted YYYY-MM-DD]` after each line. Default:
   * false. Debrief turns this on for injuries; life-context items lead
   * with the date instead.
   */
  withNoted?: boolean;
  /**
   * Whether to lead each line with `[YYYY-MM-DD]` (date-leading shape).
   * Default: false. Used by life-context blocks where chronology is
   * the most useful framing.
   */
  dateLeading?: boolean;
  /**
   * Whether to lead each line with `[kind]` (kind-leading shape). Used
   * by chat's catch-all `# Memory items` block. Mutually exclusive with
   * dateLeading.
   */
  kindLeading?: boolean;
  /**
   * What to render when the list is empty. `"omit"` returns null;
   * `"none-on-file"` returns "None on file."; `"none-logged"` returns
   * "Nothing logged in the last 14 days."; `"none-yet"` returns
   * "None yet. Any question is fair game." (used for prior follow-ups).
   * Default: "omit".
   */
  emptyFallback?: "omit" | "none-on-file" | "none-logged" | "none-yet";
};

const EMPTY_FALLBACKS = {
  "none-on-file": "None on file.",
  "none-logged": "Nothing logged in the last 14 days.",
  "none-yet": "None yet. Any question is fair game.",
} as const;

export function renderMemoryItemsBlock(
  header: string,
  items: MemoryItemInput[],
  opts: MemoryBlockOptions = {},
): string | null {
  const limited = opts.limit != null ? items.slice(0, opts.limit) : items;
  if (limited.length === 0) {
    if (!opts.emptyFallback || opts.emptyFallback === "omit") return null;
    return `# ${header}\n${EMPTY_FALLBACKS[opts.emptyFallback]}`;
  }
  const lines = limited.map((m) => {
    const tagSuffix = m.tags.length ? ` (${m.tags.join(", ")})` : "";
    const dateStr = m.createdAt ? m.createdAt.slice(0, 10) : "unknown";
    const datePrefix = opts.dateLeading ? `[${dateStr}] ` : "";
    const kindPrefix = opts.kindLeading && m.kind ? `[${m.kind}] ` : "";
    const noted = opts.withNoted ? ` [noted ${dateStr}]` : "";
    return `- ${datePrefix}${kindPrefix}${m.content}${tagSuffix}${noted}`;
  });
  return `# ${header}\n${lines.join("\n")}`;
}

// ---------------------------------------------------------------------------
// Helpers for composing several blocks into one section string

/**
 * Joins block strings with the standard double-newline separator,
 * dropping any nulls (from omit-when-empty fallbacks). Useful at the
 * top of a `renderStableContext` to avoid manual `if (block) parts.push`
 * scaffolding.
 */
export function joinBlocks(blocks: (string | null)[]): string {
  return blocks.filter((b): b is string => b != null).join("\n\n");
}
