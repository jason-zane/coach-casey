import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, SONNET_MODEL } from "./anthropic";
import type { DebriefContext } from "@/lib/thread/debrief-context";
import type { RpeBranch } from "./followup-picker";

let cachedPrompt: string | null = null;

async function loadPrompt(): Promise<string> {
  if (!cachedPrompt) {
    const p = path.join(process.cwd(), "prompts/post-run-followup-rpe-branched.md");
    cachedPrompt = await readFile(p, "utf8");
  }
  return cachedPrompt;
}

function mockMode(): boolean {
  if (process.env.LLM_MODE === "mock") return true;
  if (process.env.LLM_MODE === "real") return false;
  return !process.env.ANTHROPIC_API_KEY;
}

/**
 * Mock copy that satisfies voice rules — no em-dashes, no exclamation
 * marks. Lets dev iteration on the picker/UI proceed without burning
 * dev credits or requiring an API key.
 */
function mockBranched(branch: RpeBranch, rpeValue: number): string {
  if (branch === "high_on_easy") {
    return `Came in higher than the shape of the run suggests, ${rpeValue} on something easy. What was going on?`;
  }
  return `Softer number than I'd have expected for that one. Conservative, or feeling sharp?`;
}

/**
 * Render the same volatile + stable context the debrief saw, plus a
 * small task block naming the branch and the RPE value. The prompt's
 * job is to read the divergence specifically — naming it inline keeps
 * the prompt's branch logic out of code.
 */
export async function generateRpeBranchedFollowUp(
  ctx: DebriefContext,
  branch: RpeBranch,
  rpeValue: number,
): Promise<string | null> {
  if (mockMode()) return mockBranched(branch, rpeValue);

  const system = await loadPrompt();
  // Reuse the debrief context renderers indirectly by passing the
  // pre-built activity description. Keeping this prompt scoped to the
  // branch + value reduces the surface for prompt regressions.
  const a = ctx.activity;
  const stable = `# Athlete\n${ctx.displayName ?? "(unnamed)"}`;
  const volatile = [
    `# The run`,
    `Date: ${a.date.slice(0, 10)} (${a.dayOfWeek})`,
    `Distance: ${a.distanceKm.toFixed(2)} km`,
    `Moving time (s): ${a.movingTimeS}`,
    `Pace (s/km): ${a.paceSPerKm ?? "n/a"}`,
    `Avg HR: ${a.avgHr ?? "n/a"}`,
    `Has workout shape: ${a.hasWorkoutShape}`,
    `Name: ${a.name ?? "(unnamed)"}`,
    "",
    `# Athlete-rated RPE for this run`,
    `${rpeValue} / 10`,
    "",
    `# Recent life context (last 14 days)`,
    ctx.lifeContext.length > 0
      ? ctx.lifeContext
          .slice(0, 10)
          .map((m) => `- [${m.createdAt.slice(0, 10)}] ${m.content}`)
          .join("\n")
      : "Nothing logged.",
    "",
    `# Known injuries / niggles`,
    ctx.injuries.length > 0
      ? ctx.injuries
          .slice(0, 8)
          .map((m) => `- ${m.content}${m.tags.length ? ` (${m.tags.join(", ")})` : ""}`)
          .join("\n")
      : "None on file.",
  ].join("\n");

  const response = await anthropic().messages.create({
    model: SONNET_MODEL,
    max_tokens: 160,
    temperature: 0.85,
    system: [
      { type: "text", text: system, cache_control: { type: "ephemeral" } },
      { type: "text", text: stable, cache_control: { type: "ephemeral" } },
    ],
    messages: [
      {
        role: "user",
        content: `${volatile}\n\n# Task\n\nThis is the **${branch}** branch. The athlete rated this run RPE ${rpeValue}, which the picker classified as divergent from the run's shape. Produce one follow-up question that reads the divergence and invites context. Output the question text only.`,
      },
    ],
  });

  const text =
    response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim() || "";
  return text || null;
}
