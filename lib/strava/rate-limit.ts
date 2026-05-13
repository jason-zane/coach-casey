/**
 * Detects Strava rate-limit errors so callers can short-circuit instead of
 * burning the rest of their 15-minute budget on follow-on calls that all
 * 429 too. The thrown errors from `client.ts` are plain `Error` with the
 * HTTP status embedded in the message; matching on the literal " 429 "
 * keeps this resilient to message-text drift around it, with a fallback
 * on the human "Rate Limit Exceeded" body Strava returns.
 *
 * Lives in its own file (rather than `ingest.ts`) so it can be imported
 * by the unit-test runner — `node --experimental-strip-types` doesn't
 * resolve the `@/...` path alias that `ingest.ts` uses, so importing
 * `ingest.ts` from a test file blows up at module load.
 */
export function isRateLimited(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return / 429 /.test(error.message) || /Rate Limit Exceeded/i.test(error.message);
}
