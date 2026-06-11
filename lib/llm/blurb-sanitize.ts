/**
 * Mechanical cleanup and hard tripwires for the Strava blurb. This text
 * lands on the athlete's *public* Strava feed, so the posture is the
 * inverse of the in-app voice check: rather than log-and-ship, we repair
 * what a regex can repair (em dashes, exclamation marks, stray quotes)
 * and drop the blurb entirely on anything worse. A missed blurb costs
 * nothing; a hype line under Casey's signature is a brand problem.
 *
 * Import-free on purpose so the `node --experimental-strip-types` test
 * runner can load it directly (the `@/...` alias doesn't resolve there,
 * see `lib/strava/rate-limit.ts` for the precedent).
 */

/**
 * Verdict target is 140 chars per prompt spec. Allow some slack for the
 * model occasionally going slightly long; reject anything past this
 * absolute cap rather than posting it to the athlete's public feed.
 */
export const STRAVA_BLURB_MAX_CHARS = 200;

/**
 * Repair the violations that are safe to fix mechanically:
 *  - a single wrapping quote pair (models occasionally add one)
 *  - em dashes and the ASCII ` -- ` surrogate, replaced with a comma
 *    splice, which is the joint Casey's voice actually uses
 *  - exclamation marks, demoted to full stops
 *  - whitespace fallout from the above
 *
 * Anything this can't fix is the tripwire's job.
 */
export function sanitizeStravaBlurb(raw: string): string {
  let text = raw.trim();
  // Strip a single matched wrapping quote pair if present.
  text = text.replace(/^["'“‘]+|["'”’]+$/g, "").trim();
  // Em dash (and doubled-hyphen surrogate) to comma splice.
  text = text.replace(/\s*\u2014\s*/g, ", ");
  text = text.replace(/\s+--\s+/g, ", ");
  // Exclamations become full stops; runs collapse to one.
  text = text.replace(/!+/g, ".");
  // Whitespace fallout: collapse runs, trim comma/space debris at the edges.
  text = text.replace(/[ \t]{2,}/g, " ");
  text = text.replace(/\s+([,.])/g, "$1");
  text = text.replace(/^[,\s]+/, "").replace(/[,\s]+$/, "");
  return text;
}

/**
 * Hard tripwire on failures the prompt shouldn't produce but
 * occasionally will, and that sanitising can't repair. Returns false
 * when the blurb must be dropped (the caller treats that as
 * skip-the-Strava-write; the next debrief gets another shot).
 *
 * Filters: exclamation points (belt-and-braces post-sanitise), hashtags,
 * emoji (Extended_Pictographic), a few canonical hype phrases, and the
 * meta-leak `Verdict:` / `Output:` prefixes that occasionally bleed in
 * from the prompt.
 */
export function passesStravaBlurbVoiceCheck(text: string): boolean {
  if (/[!]/.test(text)) return false;
  if (/#\w/.test(text)) return false;
  if (/^\s*(verdict|output|response)\s*[:\-]/i.test(text)) return false;
  if (/\p{Extended_Pictographic}/u.test(text)) return false;
  if (
    /\b(crushed it|smashed it|killed it|nailed it|let'?s go|great job|amazing|awesome|legend|champion)\b/i.test(
      text,
    )
  ) {
    return false;
  }
  return true;
}
