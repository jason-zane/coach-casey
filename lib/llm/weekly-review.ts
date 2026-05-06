import "server-only";
import { anthropic, SONNET_MODEL } from "./anthropic";
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

export const WEEKLY_REVIEW_PROMPT_VERSION = "weekly-review@v1";

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
    return "(no prior runs in the four-week arc, this is an early week for the athlete)";
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
    // 600-char cap, only need enough to recognise the angle, not re-read.
    const body = r.body.length > 600 ? `${r.body.slice(0, 600)}…` : r.body;
    return `- [week of ${r.weekStartIso}]\n  ${body.replace(/\n/g, "\n  ")}`;
  });
  return `Recent prior weekly reviews (do not repeat the angle or central image):\n${lines.join("\n\n")}`;
}

function renderPriorDebriefs(ctx: WeeklyReviewContext): string {
  if (ctx.priorDebriefBodies.length === 0) {
    return "No prior debriefs in window.";
  }
  const lines = ctx.priorDebriefBodies.map((body) => {
    const trimmed = body.length > 400 ? `${body.slice(0, 400)}…` : body;
    return `- ${trimmed.replace(/\n/g, " ")}`;
  });
  return `Recent debriefs (avoid restating themes):\n${lines.join("\n")}`;
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
    `# Four-week arc\n${renderArc(ctx)}`,
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
  const system = await buildSystemPrompt({
    surface: "weekly-review.md",
    posture: "interpretive",
    shared: ["heartRate", "demographics"],
    context: stable,
  });

  const response = await anthropic().messages.create({
    model: SONNET_MODEL,
    max_tokens: 1100,
    temperature: 1.0,
    system,
    messages: [
      {
        role: "user",
        content: `${volatile}\n\n# Task\n\nWrite the weekly review for the week described above. Output the review body only as plain prose, no header, no sign-off.`,
      },
    ],
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
