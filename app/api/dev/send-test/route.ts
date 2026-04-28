import { NextResponse } from "next/server";
import { getResendClient } from "@/lib/resend";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }

  const url = new URL(request.url);
  const to = url.searchParams.get("to");
  if (!to) {
    return NextResponse.json(
      { error: "Pass ?to=you@example.com. In Resend sandbox mode, 'to' must be your Resend account email." },
      { status: 400 }
    );
  }

  const resend = getResendClient();
  const { data, error } = await resend.emails.send({
    from: "onboarding@resend.dev",
    to,
    subject: "Coach Casey, Resend wiring works",
    html: "<p>If you're reading this, <strong>lib/resend.ts</strong> is wired correctly.</p>",
  });

  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: data?.id });
}
