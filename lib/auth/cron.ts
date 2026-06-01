import "server-only";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

/**
 * Verifies the Vercel cron `Authorization: Bearer <CRON_SECRET>` header with a
 * constant-time compare. Returns null when the caller is authorized, or the
 * error Response to return when it is not.
 *
 * Fails closed in production when CRON_SECRET is unset; allows local/dev
 * invocation (no secret configured) so the routes stay testable off-platform.
 */
export function verifyCronSecret(request: Request): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "CRON_SECRET not configured" },
        { status: 500 },
      );
    }
    return null;
  }

  const got = request.headers.get("authorization") ?? "";
  if (!constantTimeEqual(got, `Bearer ${expected}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}
