/**
 * Pure helpers for composing the Strava activity description Casey
 * writes back after a debrief. The block we append is:
 *
 *   ${verdict}\n\n${signature}
 *
 * joined to any athlete-written description with a blank line. These
 * functions decide WHAT the description should become; the API call
 * itself lives in `client.ts`.
 *
 * Lives in its own file (rather than `client.ts`) for the same reason
 * as `rate-limit.ts`: the unit-test runner (`node --experimental-strip-types`)
 * can't resolve the `@/...` path alias that `client.ts` uses, so keeping
 * these import-free makes them testable.
 */

export type ComposeDescriptionResult =
  | { kind: "write"; next: string }
  | { kind: "skip"; reason: "already_current" | "athlete_edited" };

/**
 * True when a stored `strava_connections.scope` string (comma-separated,
 * e.g. "read,activity:read_all,activity:write,profile:read_all") grants
 * description writes. Exact-token match so a hypothetical future scope
 * that merely contains the substring doesn't pass.
 */
export function scopeHasActivityWrite(scope: string | null | undefined): boolean {
  if (!scope) return false;
  return scope
    .split(",")
    .map((s) => s.trim())
    .includes("activity:write");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Derive the stable marker we anchor on when looking for a previously
 * appended Casey block. Anchoring on the "Coach Casey ..." stem (rather
 * than the full signature) lets us still recognise blocks posted under
 * older signature variants whose lead-in or leading punctuation has since
 * changed, e.g. the earlier "coached by Coach Casey" and a leading em
 * dash. The strip regex's `[^\n]*` before the marker eats whatever lead
 * verb precedes the name, so both old and new blocks are replaced rather
 * than stacked.
 */
function signatureMarker(signature: string): string {
  const markerMatch = signature.match(/Coach Casey[^\n]*$/);
  return markerMatch ? markerMatch[0] : signature.trim();
}

/**
 * Strip a previously-appended Casey block from the tail of a description.
 *
 * Match shape, anchored to end of string:
 *   (^|\n\n) [non-newline verdict] \n\n [optional lead-in]SIGNATURE \s*$
 *
 * If the athlete added content *after* the signature (manual edit), the
 * regex won't match and the description comes back unchanged, they
 * wanted that content there. `composeDescriptionWithBlurb` detects that
 * case and skips the write entirely rather than stacking a second block.
 */
export function stripPriorCaseyBlock(
  description: string,
  signature: string,
): string {
  const marker = signatureMarker(signature);
  const re = new RegExp(
    `(?:\\n\\n|^)[^\\n]+\\n\\n[^\\n]*${escapeRegex(marker)}\\s*$`,
  );
  return description.replace(re, "").replace(/\s+$/, "");
}

/**
 * Compute the next description for an activity given what's currently
 * there and the block we want appended.
 *
 * Safety rules, in order:
 *  1. Athlete text is never replaced. Whatever survives the prior-block
 *     strip is kept verbatim, with the new block appended below a blank
 *     line.
 *  2. If the signature is still present after stripping (the athlete
 *     edited around our block, e.g. added their own text after it),
 *     skip: re-appending would stack two Casey blocks, and their edit
 *     signals they've taken ownership of the layout.
 *  3. If the description already reads exactly as we'd write it, skip
 *     the PUT (webhook retries, equivalent regenerations).
 *
 * `blurbBlock` is the full appended unit, verdict + blank line +
 * signature, already assembled by the caller.
 */
export function composeDescriptionWithBlurb(
  existing: string,
  blurbBlock: string,
  signature: string,
): ComposeDescriptionResult {
  const athleteText = stripPriorCaseyBlock(existing, signature);
  if (athleteText.includes(signatureMarker(signature))) {
    return { kind: "skip", reason: "athlete_edited" };
  }
  const next =
    athleteText.length > 0 ? `${athleteText}\n\n${blurbBlock}` : blurbBlock;
  if (existing === next) return { kind: "skip", reason: "already_current" };
  return { kind: "write", next };
}
