import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { captureError } from "@/lib/observability/capture";

export const runtime = "nodejs";

type ClientErrorBody = {
  message?: string;
  digest?: string | null;
  stack?: string | null;
  path?: string | null;
};

/**
 * Sink for client-side render errors reported by the error boundaries. Caps
 * field sizes so it cannot be used to bloat error_events. Best-effort.
 */
export async function POST(req: Request) {
  let body: ClientErrorBody;
  try {
    body = (await req.json()) as ClientErrorBody;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  let athleteId: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from("athletes")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      athleteId = (data as { id: string } | null)?.id ?? null;
    }
  } catch {
    // unauthenticated client errors (e.g. on /signin) are still worth keeping
  }

  const err = new Error(
    (typeof body.message === "string" ? body.message : "client error").slice(
      0,
      2000,
    ),
  );
  if (typeof body.stack === "string") err.stack = body.stack.slice(0, 8000);

  await captureError(err, {
    source: "client",
    route: typeof body.path === "string" ? body.path.slice(0, 512) : null,
    digest: typeof body.digest === "string" ? body.digest : null,
    athleteId,
  });

  return NextResponse.json({ ok: true });
}
