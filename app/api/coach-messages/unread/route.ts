import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/current";
import { countUnreadForAthlete } from "@/lib/coach-messages";

export const dynamic = "force-dynamic";

/**
 * Unread coach-message count for the signed-in athlete. Drives the in-app
 * "Messages" badge. Returns { count: 0 } for anyone without an athlete row, so
 * the client can call it unconditionally.
 */
export async function GET() {
  const session = await getCurrentSession();
  if (!session?.athlete) {
    return NextResponse.json({ count: 0 });
  }
  const count = await countUnreadForAthlete(session.athlete.id);
  return NextResponse.json({ count });
}
