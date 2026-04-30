import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * Composes a Casey system prompt out of a voice profile, optional
 * shared blocks (heart rate, demographics), an optional posture block,
 * the surface-specific prompt, and an optional rendered context block.
 *
 * Returns the array shape Anthropic's `system` field expects, with
 * cache_control on each block. Order of blocks matters for prefix
 * caching, see TIERS in the README of this folder.
 *
 * The voice block is loaded automatically (default voice unless the
 * surface declares a different profile). Surface prompts must not
 * restate em-dash, hype, sycophancy, second-person, or Markdown rules,
 * the voice block is the source of truth.
 */

const VOICE_PROFILES = {
  default: "_shared/voice/default.md",
  /**
   * Public-facing voice for surfaces where strangers read over the
   * athlete's shoulder (currently strava-blurb). Inherits the default
   * voice's universal bans and adds wry-humour and amused-tone
   * allowances.
   */
  eavesdropping: "_shared/voice/eavesdropping.md",
} as const;

const SHARED_BLOCKS = {
  heartRate: "_shared/heart-rate.md",
  demographics: "_shared/demographics.md",
} as const;

const POSTURE_BLOCKS = {
  /** Used by debrief and the three follow-up prompts. */
  interpretive: "_shared/posture/interpretive.md",
} as const;

export type VoiceProfile = keyof typeof VOICE_PROFILES;
export type SharedBlock = keyof typeof SHARED_BLOCKS;
export type PostureBlock = keyof typeof POSTURE_BLOCKS;

/**
 * Resolve the prompts directory relative to this source file rather
 * than `process.cwd()`. This keeps the loader correct regardless of
 * where the process was started (test runner in a sub-package, scripts
 * invoked from elsewhere, etc.).
 */
const PROMPTS_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "prompts",
);

const fileCache = new Map<string, string>();

async function loadFile(rel: string): Promise<string> {
  // In development always re-read so prompt edits land on the next turn
  // without a server restart. In production the file is immutable for
  // the lifetime of the build and the cache is safe.
  if (process.env.NODE_ENV !== "production") {
    return readFile(path.join(PROMPTS_ROOT, rel), "utf8");
  }
  const cached = fileCache.get(rel);
  if (cached) return cached;
  const text = await readFile(path.join(PROMPTS_ROOT, rel), "utf8");
  fileCache.set(rel, text);
  return text;
}

export async function buildSystemPrompt(opts: {
  /** Surface-specific prompt path relative to `prompts/` (e.g. `post-run-debrief.md`). */
  surface: string;
  /** Voice profile. Defaults to `"default"`. */
  voice?: VoiceProfile;
  /** Opt-in shared blocks (heart-rate, demographics). */
  shared?: SharedBlock[];
  /** Opt-in posture block (interpretive). */
  posture?: PostureBlock;
  /** Pre-rendered athlete context block (athlete + plan + memory + ...). */
  context?: string;
}): Promise<Anthropic.TextBlockParam[]> {
  const blocks: Anthropic.TextBlockParam[] = [];

  // 1. Voice. Always first; identical across every call on the same
  //    profile so the prefix cache hits hardest here.
  const voicePath = VOICE_PROFILES[opts.voice ?? "default"];
  blocks.push({
    type: "text",
    text: await loadFile(voicePath),
    cache_control: { type: "ephemeral" },
  });

  // 2. Opt-in shared blocks (HR, demographics) in declaration order.
  for (const key of opts.shared ?? []) {
    blocks.push({
      type: "text",
      text: await loadFile(SHARED_BLOCKS[key]),
      cache_control: { type: "ephemeral" },
    });
  }

  // 3. Opt-in posture block (interpretive, ...) when present.
  if (opts.posture) {
    blocks.push({
      type: "text",
      text: await loadFile(POSTURE_BLOCKS[opts.posture]),
      cache_control: { type: "ephemeral" },
    });
  }

  // 4. Surface-specific prompt.
  blocks.push({
    type: "text",
    text: await loadFile(opts.surface),
    cache_control: { type: "ephemeral" },
  });

  // 5. Per-call rendered context, if any.
  if (opts.context) {
    blocks.push({
      type: "text",
      text: opts.context,
      cache_control: { type: "ephemeral" },
    });
  }

  return blocks;
}

/**
 * Verify that every prompt file referenced by `buildSystemPrompt` is
 * readable and non-empty. Run at boot (or in a dedicated test) so a
 * missing file surfaces at startup rather than on the first user
 * request. Throws on the first missing/empty file with the path
 * embedded in the message.
 */
export async function validatePrompts(extras: { surfaces?: string[] } = {}): Promise<void> {
  const required: string[] = [
    ...Object.values(VOICE_PROFILES),
    ...Object.values(SHARED_BLOCKS),
    ...Object.values(POSTURE_BLOCKS),
    ...(extras.surfaces ?? []),
  ];
  for (const rel of required) {
    const text = await readFile(path.join(PROMPTS_ROOT, rel), "utf8").catch(
      (e) => {
        throw new Error(`Prompt file unreadable: ${rel} (${(e as Error).message})`);
      },
    );
    if (!text.trim()) {
      throw new Error(`Prompt file empty: ${rel}`);
    }
  }
}

/**
 * Test-only: clear the in-memory cache. Production code should not
 * call this; the cache is safe within a deployment because prompt
 * files are immutable per build.
 */
export function _clearPromptCache(): void {
  fileCache.clear();
}
