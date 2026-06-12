// Pure client-IP extraction, kept free of server-only / Supabase imports so it
// is unit-testable under the plain `node --test` runner (see
// tests/security-hardening.test.ts).

/**
 * Best-effort client IP from the Vercel proxy headers. `x-forwarded-for` is a
 * comma-separated chain (client, proxy1, proxy2, ...) where the left-most entry
 * is the originating client; fall back to `x-real-ip`. Returns null when
 * neither header is present or usable, which the rate limiter treats as "skip
 * the throttle" so a missing header can never break legitimate error reporting.
 */
export function clientIpFromHeaders(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = headers.get("x-real-ip")?.trim();
  return real ? real : null;
}
