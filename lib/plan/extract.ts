import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMessage, MODELS } from "@/lib/llm/anthropic";
import { logModelUsage } from "@/lib/observability/usage";
import { mockMode } from "@/lib/llm/mocks";

/**
 * Plan extraction. Athletes upload a screenshot, photograph, or PDF of their
 * training plan; we run Sonnet vision over it and return the plan as plain
 * markdown text the athlete can review before saving.
 *
 * Why a separate prompt loader. The main `lib/llm/prompts.ts` composes
 * Casey-voiced surfaces (debrief, chat, ...). Extraction is a different
 * category, structured transcription, voice rules don't apply, no posture
 * blocks. Reading the prompt directly from `prompts/plan-extraction.md`
 * keeps the responsibility separation clean.
 */

export type PlanFileKind = "image" | "pdf";

export type SupportedMime =
  | "image/png"
  | "image/jpeg"
  | "image/webp"
  | "image/gif"
  | "application/pdf";

const SUPPORTED_MIMES: SupportedMime[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
];

// Practical upload cap. Large screenshots and PDFs cost token-budget and the
// extraction prompt is shaped for a single-week or single-block view, not a
// whole-season image dump. Reject above this and ask the athlete to crop.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export type ExtractInput = {
  kind: PlanFileKind;
  mime: SupportedMime;
  filename: string;
  bytes: Uint8Array;
};

export type ExtractOutcome =
  | {
      kind: "ok";
      extractedText: string;
      confidence: "high" | "medium" | "low" | "unknown";
      confidenceNote: string | null;
    }
  | {
      kind: "error";
      message: string;
    };

export function isSupportedMime(mime: string): mime is SupportedMime {
  return (SUPPORTED_MIMES as string[]).includes(mime);
}

export function classifyMime(mime: SupportedMime): PlanFileKind {
  return mime === "application/pdf" ? "pdf" : "image";
}

const PROMPTS_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "prompts",
);

let cachedExtractionPrompt: string | null = null;

async function loadExtractionPrompt(): Promise<string> {
  if (cachedExtractionPrompt && process.env.NODE_ENV === "production") {
    return cachedExtractionPrompt;
  }
  const text = await readFile(path.join(PROMPTS_ROOT, "plan-extraction.md"), "utf8");
  cachedExtractionPrompt = text;
  return text;
}

const CONFIDENCE_RE = /<!--\s*confidence:\s*(high|medium|low)\s*(?:[-,]\s*([^-][^>]*?))?\s*-->/i;

function stripConfidenceMarker(extracted: string): {
  body: string;
  confidence: "high" | "medium" | "low" | "unknown";
  confidenceNote: string | null;
} {
  const match = extracted.match(CONFIDENCE_RE);
  if (!match) {
    return { body: extracted.trim(), confidence: "unknown", confidenceNote: null };
  }
  const confidence = match[1].toLowerCase() as "high" | "medium" | "low";
  const note = match[2]?.trim() || null;
  const body = extracted.replace(CONFIDENCE_RE, "").trim();
  return { body, confidence, confidenceNote: note };
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

const MOCK_PLAN_TEXT = `# Plan summary
Mock extraction (LLM_MODE=mock). Block 1 of a generic 16-week marathon plan.

## Week of 2026-05-11
- Mon: easy 8km
- Tue: 6 x 1km @ threshold, 2min jog
- Wed: easy 8km
- Thu: rest
- Fri: easy 6km strides
- Sat: easy 10km
- Sun: long run 22km`;

export async function extractPlanFromFile(
  input: ExtractInput,
): Promise<ExtractOutcome> {
  if (input.bytes.length === 0) {
    return { kind: "error", message: "File is empty." };
  }
  if (input.bytes.length > MAX_UPLOAD_BYTES) {
    return {
      kind: "error",
      message: `File is larger than ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB. Crop to a single block (or single week) and retry.`,
    };
  }

  if (mockMode()) {
    return {
      kind: "ok",
      extractedText: MOCK_PLAN_TEXT,
      confidence: "high",
      confidenceNote: "mock extraction",
    };
  }

  const systemPrompt = await loadExtractionPrompt();
  const dataB64 = bytesToBase64(input.bytes);

  const fileBlock =
    input.kind === "pdf"
      ? {
          type: "document" as const,
          source: {
            type: "base64" as const,
            media_type: "application/pdf" as const,
            data: dataB64,
          },
        }
      : {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: input.mime as
              | "image/png"
              | "image/jpeg"
              | "image/webp"
              | "image/gif",
            data: dataB64,
          },
        };

  try {
    const response = await createMessage({
      model: MODELS.planExtract,
      max_tokens: 3000,
      temperature: 0,
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            fileBlock,
            {
              type: "text",
              text: "Extract the training plan from the attachment using the rules above. Output only the markdown document and the confidence comment, nothing else.",
            },
          ],
        },
      ],
    });

    logModelUsage({
      surface: "plan-extract",
      model: MODELS.planExtract,
      usage: response.usage,
    });

    const text = response.content
      .filter((c): c is { type: "text"; text: string } & (typeof c) => c.type === "text")
      .map((c) => c.text)
      .join("\n")
      .trim();

    if (!text) {
      return {
        kind: "error",
        message: "Extraction returned empty output. Try a clearer image or paste the plan as text.",
      };
    }

    const stripped = stripConfidenceMarker(text);
    if (stripped.body.length < 20) {
      return {
        kind: "error",
        message: "Extraction was too short to be a real plan. Try a clearer image or paste as text.",
      };
    }
    return {
      kind: "ok",
      extractedText: stripped.body,
      confidence: stripped.confidence,
      confidenceNote: stripped.confidenceNote,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed.";
    return { kind: "error", message };
  }
}
