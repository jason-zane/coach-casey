import "server-only";

const DEFAULT_CAP = 140;

/**
 * Extract the opening sentence of a generated body for use as a push
 * notification body. Per docs/post-run-debrief-moment.md §8, the push
 * body is the verbatim opening sentence of the debrief or cross-training
 * acknowledgement — the notification IS the opening of the moment, not
 * a teaser. Truncation, when it fires, lands at a clause or word
 * boundary; never appends an ellipsis (an ellipsis reads as "open the
 * app for the rest" which is the teaser frame the design rejects).
 *
 * Cap defaults to 140 chars: comfortably fits iOS lock-screen body
 * (~178), Android expanded notifications (~256), and stays readable on
 * smaller surfaces. Tunable per surface if a future signal warrants it.
 */
export function leadFromBody(body: string, cap: number = DEFAULT_CAP): string {
  const trimmed = body.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";

  // Sentence one: everything up to and including the first '.' or '?'
  // followed by whitespace or end-of-string. '!' is excluded (voice rules
  // disallow exclamation marks in Casey output). The non-greedy match
  // plus the boundary lookahead keeps decimals like "5.5km" intact.
  const sentenceMatch = trimmed.match(/^[\s\S]*?[.?](?=\s|$)/);
  const sentenceOne = sentenceMatch ? sentenceMatch[0] : trimmed;

  if (sentenceOne.length <= cap) return sentenceOne;

  // Sentence one exceeds the cap. Truncate without ellipsis. Order:
  //   1. Last clause boundary (comma / colon / semicolon) past the
  //      halfway mark, so the resulting fragment has substance.
  //   2. Last word boundary before cap.
  //   3. Hard cut at cap (logged — voice rules make this rare; frequent
  //      hard cuts mean a prompt has drifted long).
  const slice = sentenceOne.slice(0, cap);

  const clauseEnd = Math.max(
    slice.lastIndexOf(", "),
    slice.lastIndexOf("; "),
    slice.lastIndexOf(": "),
  );
  if (clauseEnd > cap / 2) {
    return slice.slice(0, clauseEnd + 1);
  }

  const wordEnd = slice.lastIndexOf(" ");
  if (wordEnd > 0) {
    return slice.slice(0, wordEnd).trimEnd();
  }

  console.warn("leadFromBody: hard-cut a body with no boundary inside cap", {
    bodyLength: body.length,
    cap,
  });
  return slice;
}
