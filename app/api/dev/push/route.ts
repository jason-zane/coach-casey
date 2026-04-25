import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendPushToAthlete } from "@/lib/push/send";
import { isPushConfigured } from "@/lib/push/keys";

/**
 * Dev/local helper to fire a push at the signed-in athlete's devices.
 *
 *   GET /api/dev/push                     — sends a generic test
 *   GET /api/dev/push?body=Hello          — overrides the body text
 *   GET /api/dev/push?title=Hi            — overrides the title
 *
 * Useful for verifying VAPID keys, sw.js delivery, and notification rendering
 * without needing to fake a Strava activity. Disabled in production.
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not available in production" }, { status: 404 });
  }
  if (!isPushConfigured()) {
    return NextResponse.json(
      {
        error:
          "VAPID keys missing. Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, NEXT_PUBLIC_VAPID_PUBLIC_KEY in .env.local. Generate with: npx web-push generate-vapid-keys",
      },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: athlete } = await supabase
    .from("athletes")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!athlete) return NextResponse.json({ error: "no athlete" }, { status: 400 });

  const url = new URL(request.url);
  const result = await sendPushToAthlete(athlete.id as string, {
    title: url.searchParams.get("title") ?? "Coach Casey",
    body: url.searchParams.get("body") ?? "Test notification from /api/dev/push.",
    tag: "dev-test",
    url: "/app",
  });

  return NextResponse.json({ ok: true, result });
}
