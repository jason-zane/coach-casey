/**
 * Mechanical voice validator. Catches the kinds of voice violations a
 * regex can see: em-dashes, exclamation marks, banned hype words,
 * sycophancy patterns, clinical phrases, hedge words, the athlete's
 * first name in third-person constructions, and Markdown formatting.
 *
 * Use as a post-hoc check on generated text:
 *
 *   const result = checkVoice(text, { profile: "default", athleteName });
 *   if (!result.ok) {
 *     // log warnings; do not block the response
 *   }
 *
 * Findings are warnings, not errors. We log them and ship the response;
 * we don't want a regex glitch to block a debrief. The eval harness is
 * the place where findings turn into pass/fail.
 */

export type VoiceProfile = "default" | "eavesdropping";

export type VoiceFinding = {
  rule: string;
  match: string;
  /** 0-based character offset in the input text. */
  offset: number;
};

export type VoiceCheckResult = {
  ok: boolean;
  findings: VoiceFinding[];
};

export type VoiceCheckOptions = {
  /** Voice profile that produced this text. Default: "default". */
  profile?: VoiceProfile;
  /**
   * Athlete's display name (or first name). When set, the validator
   * flags occurrences of the name as a third-person violation. Pass
   * `null` to skip the name check (e.g. when the athlete is unnamed).
   */
  athleteName?: string | null;
  /**
   * Skip specific rule ids. Mostly for tests; production usage should
   * not need this.
   */
  skip?: string[];
};

const HYPE_WORDS = [
  "crush",
  "crushed",
  "crushing",
  "smash",
  "smashed",
  "smashing",
  "let's go",
  "lets go",
  "fire",
  "on fire",
  "killing it",
  "killed it",
  "amazing",
  "awesome",
  "epic",
];

const SYCOPHANCY_PHRASES = [
  "great job",
  "great work",
  "great session",
  "great run",
  "nice work",
  "nice running",
  "nice job",
  "solid effort",
  "solid work",
  "well done",
  "good job",
  "good work",
  "keep it up",
  "you've got this",
  "strong work",
  "strong effort",
  "great consistency",
];

const CLINICAL_PHRASES = [
  "data suggests",
  "data shows",
  "data indicates",
  "hr indicates",
  "metrics show",
  "metrics indicate",
  "analysis shows",
  "analysis suggests",
  "based on the data",
  "based on your data",
];

const HEDGE_WORDS = [
  "basically",
  "essentially",
  "arguably",
  "kind of",
  "sort of",
];

// Emoji range, broad. Catches the common BMP and astral-plane emoji
// blocks. False positives on box-drawing or CJK punctuation are unlikely
// in Casey's prose register.
const EMOJI_REGEX =
  /[\u{1F300}-\u{1FAFF}\u{1F600}-\u{1F64F}\u{2600}-\u{27BF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}]/u;

function findAll(text: string, needle: string): number[] {
  const out: number[] = [];
  const lc = text.toLowerCase();
  const lcNeedle = needle.toLowerCase();
  let from = 0;
  while (true) {
    const idx = lc.indexOf(lcNeedle, from);
    if (idx === -1) break;
    out.push(idx);
    from = idx + lcNeedle.length;
  }
  return out;
}

function preview(text: string, offset: number, length: number): string {
  const start = Math.max(0, offset - 12);
  const end = Math.min(text.length, offset + length + 12);
  const slice = text.slice(start, end).replace(/\n/g, " ");
  return `…${slice}…`;
}

/**
 * Run the validator. Returns `ok: true` when no findings; otherwise
 * returns the list of findings. Cheap (synchronous regex passes) and
 * safe to call inline after every generation.
 */
export function checkVoice(text: string, opts: VoiceCheckOptions = {}): VoiceCheckResult {
  const skip = new Set(opts.skip ?? []);
  const findings: VoiceFinding[] = [];

  const add = (rule: string, match: string, offset: number) => {
    if (skip.has(rule)) return;
    findings.push({ rule, match, offset });
  };

  // Em dashes — both the literal character and the doubled hyphen
  // surrogate that some models emit.
  for (const idx of findAll(text, "—")) add("em-dash", "—", idx);
  // ASCII double-hyphen used as em-dash. Heuristic: bounded by spaces.
  for (const m of text.matchAll(/\s--\s/g)) {
    add("em-dash-ascii", preview(text, m.index ?? 0, 4), m.index ?? 0);
  }

  // Exclamation marks. Hard ban across both profiles.
  for (const m of text.matchAll(/!/g)) {
    add("exclamation", "!", m.index ?? 0);
  }

  // Emoji.
  const emojiMatch = text.match(EMOJI_REGEX);
  if (emojiMatch && emojiMatch.index != null) {
    add("emoji", emojiMatch[0], emojiMatch.index);
  }

  // Hype words. Allowed in eavesdropping voice? No — even
  // eavesdropping bans hype; what it allows is wry humour and amused
  // tone, not "let's go".
  for (const word of HYPE_WORDS) {
    for (const idx of findAll(text, word)) add("hype", word, idx);
  }

  // Sycophancy.
  for (const phrase of SYCOPHANCY_PHRASES) {
    for (const idx of findAll(text, phrase)) add("sycophancy", phrase, idx);
  }

  // Clinical register.
  for (const phrase of CLINICAL_PHRASES) {
    for (const idx of findAll(text, phrase)) add("clinical", phrase, idx);
  }

  // Hedge words.
  for (const word of HEDGE_WORDS) {
    // Word-boundary so "kindly" doesn't match "kind of".
    const re = new RegExp(`\\b${word.replace(/ /g, " ")}\\b`, "gi");
    for (const m of text.matchAll(re)) {
      add("hedge", word, m.index ?? 0);
    }
  }

  // Markdown markers. Bold, italic, headings, fenced blocks, bullets.
  for (const m of text.matchAll(/\*\*[^*]+\*\*/g)) {
    add("markdown-bold", m[0], m.index ?? 0);
  }
  for (const m of text.matchAll(/^#{1,6}\s/gm)) {
    add("markdown-heading", m[0], m.index ?? 0);
  }
  for (const m of text.matchAll(/```/g)) {
    add("markdown-codefence", "```", m.index ?? 0);
  }
  // Bullet detection is noisy because real prose can start a line with a
  // hyphen. Only flag when multiple consecutive lines start with `- ` or
  // `* `, which is the actual list pattern.
  const bulletRe = /(?:^[-*]\s.*\n){2,}/gm;
  for (const m of text.matchAll(bulletRe)) {
    add("markdown-bullets", "(list)", m.index ?? 0);
  }

  // Athlete name in third person. Only meaningful when the name is set
  // and is not "Casey" (would clash with self-reference). Skip the
  // check when the name is a single character or appears inside a
  // quoted string (rare, but possible if Casey is quoting the
  // athlete's own words).
  const name = opts.athleteName?.trim();
  if (name && name.length > 1 && name.toLowerCase() !== "casey") {
    const first = name.split(/\s+/)[0];
    const re = new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    for (const m of text.matchAll(re)) {
      add("athlete-name-third-person", first, m.index ?? 0);
    }
  }

  return { ok: findings.length === 0, findings };
}

/**
 * Convenience wrapper used by callers right after extracting text from
 * an Anthropic response. Logs warnings to the console and returns the
 * text unchanged. Treats voice-check as a non-blocking observation, see
 * the module docstring for rationale.
 */
export function logVoiceFindings(
  text: string,
  context: { surface: string; athleteId?: string | null; profile?: VoiceProfile; athleteName?: string | null },
): VoiceCheckResult {
  const result = checkVoice(text, {
    profile: context.profile,
    athleteName: context.athleteName,
  });
  if (!result.ok) {
    console.warn("[voice-check] findings", {
      surface: context.surface,
      athleteId: context.athleteId,
      findings: result.findings.slice(0, 10),
    });
  }
  return result;
}
