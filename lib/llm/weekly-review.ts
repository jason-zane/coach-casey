import "server-only";
import { anthropic, MODELS } from "./anthropic";
import { logModelUsage } from "@/lib/observability/usage";
import { buildSystemPrompt } from "./prompts";
import {
  formatPace,
  renderActivePlanBlock,
  renderAthleteBlock,
  renderGoalRacesBlock,
  renderMemoryItemsBlock,
} from "./context-render";
import { mockMode, mockWeeklyReview } from "./mocks";
import { logVoiceFindings } from "./voice-check";
import type { WeeklyReviewContext } from "@/lib/thread/weekly-review-context";

// v2 (2026-06-15): arc demoted from mandatory beat to earned mention,
// priors reframed from de-dup to continuity, a planning pass added before
// the writer. See prompts/weekly-review.md.
export const WEEKLY_REVIEW_PROMPT_VERSION = "weekly-review@v2";

/**
 * The minimum a "week worth reviewing" looks like. Used by the cron and the
 * generator to skip athletes who literally have no activity inside the
 * window. Below this we'd be inventing depth; better to skip than produce
 * a thin "rest week" review.
 */
export type WeeklyReviewSkipReason =
  | "no_activity"
  | "duplicate"
  | "athlete_inactive";

export type WeeklyReviewOutcome =
  | { kind: "review"; body: string }
  | { kind: "skip"; reason: WeeklyReviewSkipReason };

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function renderWeekRuns(ctx: WeeklyReviewContext): string {
  if (ctx.weekRuns.length === 0) {
    return "No runs this week.";
  }
  const lines = ctx.weekRuns.map((r) => {
    const date = formatDate(r.date);
    const pace = formatPace(r.paceSPerKm);
    const hr = r.avgHr ? `, HR ${r.avgHr}` : "";
    const workout = r.isWorkout ? " [workout shape]" : "";
    return `  - ${date}: ${r.name ?? "Run"}, ${r.distanceKm.toFixed(1)} km, ${pace}${hr}${workout}`;
  });
  return `Runs this week (${ctx.weekRunCount}, ${ctx.weekRunKm.toFixed(1)} km total):\n${lines.join("\n")}`;
}

function renderWeekCrossTraining(ctx: WeeklyReviewContext): string {
  if (ctx.weekCrossTraining.length === 0) {
    return "No cross-training this week.";
  }
  const lines = ctx.weekCrossTraining.map((c) => {
    const date = formatDate(c.date);
    const dist = c.distanceKm ? `, ${c.distanceKm.toFixed(1)} km` : "";
    const dur = `${c.durationMinutes} min`;
    return `  - ${date}: ${c.name ?? c.activityType ?? "Cross-training"}, ${dur}${dist}`;
  });
  return `Cross-training this week:\n${lines.join("\n")}`;
}

function renderArc(ctx: WeeklyReviewContext): string {
  if (ctx.arcWeeks.length === 0) {
    return "(no prior runs on record yet, this is an early week for the athlete)";
  }
  const weekLines = ctx.arcWeeks.map(
    (w) => `  - Week of ${w.weekStart}: ${w.runCount} runs, ${w.km.toFixed(1)} km`,
  );
  return `Weekly volumes leading up to this week:\n${weekLines.join("\n")}`;
}

function renderPriorReviews(ctx: WeeklyReviewContext): string {
  if (ctx.priorWeeklyReviews.length === 0) {
    return "No prior weekly reviews. This is the first one for this athlete.";
  }
  const lines = ctx.priorWeeklyReviews.map((r) => {
    // 900-char cap: enough to carry the thread forward, not just recognise
    // the angle. Continuity needs more of the prior than de-dup did.
    const body = r.body.length > 900 ? `${r.body.slice(0, 900)}…` : r.body;
    return `- [week of ${r.weekStartIso}]\n  ${body.replace(/\n/g, "\n  ")}`;
  });
  return `Prior weekly reviews, most recent first. These are open threads in an ongoing relationship, not a list to avoid. Continue the live ones, close the ones that resolved, answer a question you asked, notice a trajectory across them. Build on them; do not re-pour last week's central image.\n\n${lines.join("\n\n")}`;
}

function renderPriorDebriefs(ctx: WeeklyReviewContext): string {
  if (ctx.priorDebriefBodies.length === 0) {
    return "No prior debriefs in window.";
  }
  const lines = ctx.priorDebriefBodies.map((body) => {
    const trimmed = body.length > 500 ? `${body.slice(0, 500)}…` : body;
    return `- ${trimmed.replace(/\n/g, " ")}`;
  });
  return `Recent debriefs, most recent first. What you have already said to this athlete this week. Carry the thread forward; do not repeat the same central image.\n${lines.join("\n")}`;
}

function renderStableContext(ctx: WeeklyReviewContext): string {
  const parts: string[] = [
    renderAthleteBlock({
      displayName: ctx.displayName,
      sex: ctx.sex,
      ageYears: ctx.ageYears,
      weightKg: ctx.weightKg,
    }),
  ];
  if (ctx.workingReadText) parts.push(ctx.workingReadText);
  if (ctx.coachingMode === "coach") {
    parts.push(
      "# Coaching mode\nThe athlete is coach-led. Defer to plan intent; help the athlete read what is happening inside the plan rather than rewriting it.",
    );
  } else if (ctx.coachingMode === "self") {
    parts.push(
      "# Coaching mode\nThe athlete is self-directed. Engage with workout choices honestly; you are not deferring to a coach's prior intent.",
    );
  }
  const goalBlock = renderGoalRacesBlock(ctx.goalRaces);
  if (goalBlock) parts.push(goalBlock);
  const planBlock = renderActivePlanBlock(ctx.activePlanText, {
    fallback: "omit",
    uploadedAt: ctx.activePlanUploadedAt,
  });
  if (planBlock) parts.push(planBlock);
  const injuriesBlock = renderMemoryItemsBlock("Known injuries and niggles", ctx.injuries, {
    limit: 20,
    withNoted: true,
    emptyFallback: "none-on-file",
  });
  if (injuriesBlock) parts.push(injuriesBlock);
  return parts.join("\n\n");
}

function renderVolatileContext(ctx: WeeklyReviewContext): string {
  const parts: string[] = [
    `# Week being reviewed\nMonday ${ctx.weekStartIso} through Sunday ${ctx.weekEndIso}.`,
    `# This week's runs\n${renderWeekRuns(ctx)}`,
    `# This week's cross-training\n${renderWeekCrossTraining(ctx)}`,
    `# Recent weekly volumes (trailing four weeks)\n${renderArc(ctx)}`,
  ];
  const lifeBlock = renderMemoryItemsBlock(
    ctx.lifeContext.length > 0 ? "Recent life context (last 14 days)" : "Recent life context",
    ctx.lifeContext,
    { limit: 15, dateLeading: true, emptyFallback: "none-logged" },
  );
  if (lifeBlock) parts.push(lifeBlock);
  parts.push(`# Recent debriefs\n${renderPriorDebriefs(ctx)}`);
  parts.push(`# Recent weekly reviews\n${renderPriorReviews(ctx)}`);
  return parts.join("\n\n");
}

/**
 * Pre-flight gate. Skip review when the week is empty (no runs and no
 * cross-training); a "rest week" review for someone who didn't even open
 * the app or sync activity adds noise rather than signal. Returns null
 * when generation should proceed.
 */
export function weeklyReviewGate(
  ctx: WeeklyReviewContext,
): WeeklyReviewSkipReason | null {
  if (ctx.weekRuns.length === 0 && ctx.weekCrossTraining.length === 0) {
    return "no_activity";
  }
  return null;
}

const WEEKLY_REVIEW_PLAN_SYSTEM = `You are the planning step for Coach Casey's weekly review. You do not write the review. You decide what it should be about, so the writer leads with the sharpest thing and builds on what Casey has already said.

You are given this week's training, the trailing weeks, the plan and memory, and Casey's recent prior reviews and debriefs.

Output exactly four short lines, plain text, no markdown, no preamble:
LEAD: the single most important thing this week, the one observation the review should open on. One sentence.
THREADS: open threads from the prior reviews or debriefs worth continuing or closing this week (a niggle that did or did not recur, a question Casey asked, a pattern building across weeks). A few words each, or "none live".
ARC: whether the multi-week trajectory changes how this week reads. If yes, name what is changing (the legs, the paces, the appetite for hard work), not just the volume direction. If it adds nothing this week, write "skip".
AVOID: the central image or claim from last week's review and recent debriefs that this review must not repeat. A few words.

Be specific to the data in front of you. If a line has nothing real, say so plainly rather than inventing.`;

/**
 * Planning pass. Reads the same week + priors the writer
 * gets and returns a short "read": what to lead on, which threads to
 * carry, whether the multi-week arc earns a mention this week, and what
 * not to repeat. This is the intelligence step that runs before the prose
 * so the Sonnet writer is choosing an angle rather than filling a
 * template under one-shot pressure.
 *
 * Best-effort: any failure returns null and the review is written without
 * it. The planner can never block or fail a review.
 */
async function planWeeklyReview(
  stable: string,
  volatile: string,
): Promise<string | null> {
  try {
    const response = await anthropic().messages.create({
      model: MODELS.weeklyReviewPlan,
      max_tokens: 400,
      temperature: 0.4,
      system: WEEKLY_REVIEW_PLAN_SYSTEM,
      messages: [
        {
          role: "user",
          content: `${stable}\n\n${volatile}\n\n# Task\n\nPlan the weekly review for the week described above.`,
        },
      ],
    });
    logModelUsage({
      surface: "weekly-review-plan",
      model: MODELS.weeklyReviewPlan,
      usage: response.usage,
    });
    const text = response.content
      .filter((c): c is { type: "text"; text: string } & (typeof c) => c.type === "text")
      .map((c) => c.text)
      .join("\n")
      .trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

export async function generateWeeklyReview(
  ctx: WeeklyReviewContext,
): Promise<WeeklyReviewOutcome> {
  const gate = weeklyReviewGate(ctx);
  if (gate) return { kind: "skip", reason: gate };

  if (mockMode()) {
    const body = mockWeeklyReview(ctx);
    logVoiceFindings(body, {
      athleteName: ctx.displayName,
      surface: "weekly-review",
    });
    return { kind: "review", body };
  }

  const stable = renderStableContext(ctx);
  const volatile = renderVolatileContext(ctx);

  // Reasoning pass before the prose: pick the lead angle and the threads
  // to carry. Best-effort; null when it fails or is skipped.
  const plan = await planWeeklyReview(stable, volatile);
  const planBlock = plan
    ? `# Your read before writing\nUse this to choose what to lead on and what to carry forward. Do not quote it; write the review in your own voice.\n${plan}\n\n`
    : "";

  const system = await buildSystemPrompt({
    surface: "weekly-review.md",
    posture: "interpretive",
    shared: ["heartRate", "demographics"],
    context: stable,
  });

  const response = await anthropic().messages.create({
    model: MODELS.weeklyReview,
    max_tokens: 1100,
    temperature: 1.0,
    system,
    messages: [
      {
        role: "user",
        content: `${volatile}\n\n${planBlock}# Task\n\nWrite the weekly review for the week described above. Output the review body only as plain prose, no header, no sign-off.`,
      },
    ],
  });

  logModelUsage({
    surface: "weekly-review",
    model: MODELS.weeklyReview,
    usage: response.usage,
  });

  const body = response.content
    .filter((c): c is { type: "text"; text: string } & (typeof c) => c.type === "text")
    .map((c) => c.text)
    .join("\n")
    .trim();

  if (!body) {
    return { kind: "skip", reason: "no_activity" };
  }

  logVoiceFindings(body, {
    athleteName: ctx.displayName,
    surface: "weekly-review",
  });

  return { kind: "review", body };
}
