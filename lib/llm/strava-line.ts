import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { createMessage, MODELS } from "./anthropic";
import { logModelUsage } from "@/lib/observability/usage";
import { buildSystemPrompt } from "./prompts";
import { mockMode } from "./mocks";
import { logVoiceFindings } from "./voice-check";
import {
  passesStravaBlurbVoiceCheck,
  sanitizeStravaBlurb,
  STRAVA_BLURB_MAX_CHARS,
} from "./blurb-sanitize";
import { activityKindLabel, fallbackStravaLine } from "@/lib/strava/line-fallback";

/**
 * Strava verdict line for a NON-run activity (ride, swim, gym, walk, ...).
 *
 * The run line lives in `generateStravaBlurb` (lib/llm/debrief.ts) and
 * leans on the rich debrief context. Non-runs don't get a debrief
 * context, so this is a lighter call off the activity's own facts, with a
 * type-aware prompt (`strava-line-nonrun.md`) under the same eavesdropping
 * voice. Same post-processing as the run line: mechanical sanitise, then
 * the shared voice check plus the hard tripwire, plus the length cap.
 * Returns `null` on any failure; the caller substitutes a deterministic
 * fallback so the activity still gets a line.
 */

export type NonRunLineInput = {
  athleteId: string;
  activityType: string | null;
  name: string | null;
  distanceKm: number | null;
  durationMin: number | null;
  avgHr: number | null;
};

type CallWithRetryOpts = { attempts?: number; baseDelayMs?: number };

async function callWithRetry<T>(
  fn: () => Promise<T>,
  { attempts = 3, baseDelayMs = 700 }: CallWithRetryOpts = {},
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const status =
        typeof e === "object" && e && "status" in e
          ? (e as { status: unknown }).status
          : null;
      const retryable = status === 529 || status === 429;
      if (!retryable || i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, i)));
    }
  }
  throw lastErr;
}

function renderNonRunActivity(input: NonRunLineInput): string {
  const lines = [
    `- Activity: ${activityKindLabel(input.activityType)} (Strava type: ${input.activityType ?? "unknown"})`,
    `- Name: ${input.name?.trim() || "(unnamed)"}`,
    input.durationMin != null
      ? `- Duration: about ${Math.round(input.durationMin)} min`
      : "- Duration: not recorded",
    input.distanceKm != null && input.distanceKm > 0
      ? `- Distance: ${input.distanceKm.toFixed(1)} km`
      : "- Distance: not distance-based",
    input.avgHr != null ? `- Average HR: ${input.avgHr} bpm` : "- Average HR: not recorded",
  ];
  return lines.join("\n");
}

export async function generateNonRunStravaLine(
  input: NonRunLineInput,
): Promise<string | null> {
  let raw: string;
  if (mockMode()) {
    // Deterministic in mock/dev: reuse the fallback so local runs without
    // an API key still produce a clean, type-appropriate line.
    raw = fallbackStravaLine({
      activityType: input.activityType,
      seed: input.name?.length ?? 0,
    });
  } else {
    const system = await buildSystemPrompt({
      surface: "strava-line-nonrun.md",
      voice: "eavesdropping",
    });

    const response = await callWithRetry(() =>
      createMessage({
        model: MODELS.stravaBlurb,
        max_tokens: 120,
        temperature: 1.0,
        system,
        messages: [
          {
            role: "user",
            content: `${renderNonRunActivity(input)}\n\n# Task\n\nWrite the one-sentence verdict for this activity. Output the verdict text only, no signature.`,
          },
        ],
      }),
    );
    logModelUsage({
      surface: "strava-line-nonrun",
      model: MODELS.stravaBlurb,
      usage: response.usage,
      athleteId: input.athleteId,
    });

    raw =
      response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim() || "";
  }

  const text = sanitizeStravaBlurb(raw);
  if (!text) return null;
  if (text.length > STRAVA_BLURB_MAX_CHARS) return null;

  const voice = logVoiceFindings(text, {
    surface: "strava-line-nonrun",
    athleteId: input.athleteId,
    profile: "eavesdropping",
  });
  if (!voice.ok) return null;
  if (!passesStravaBlurbVoiceCheck(text)) return null;
  return text;
}
