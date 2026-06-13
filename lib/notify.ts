import "server-only";
import { getResendClient } from "@/lib/resend";

// Resend is in sandbox mode (no verified domain), so it can only send FROM
// onboarding@resend.dev TO the Resend account address (hello@coachcasey.app).
// Once coachcasey.app is verified at resend.com/domains, set NOTIFY_FROM to an
// address on the domain and NOTIFY_TO to wherever alerts should land (e.g.
// jasonzanehunt@gmail.com).
const NOTIFY_FROM = process.env.NOTIFY_FROM?.trim() || "onboarding@resend.dev";
const NOTIFY_TO = process.env.NOTIFY_TO?.trim() || "hello@coachcasey.app";

/**
 * Best-effort founder notification. Never throws: a notification failure must
 * not break the user-facing flow that triggered it (a signup must succeed even
 * if the alert email doesn't). No-ops when RESEND_API_KEY is unset.
 */
export async function notifyFounder(opts: {
  subject: string;
  text: string;
  // When set (e.g. an access requester's address), the alert's reply-to is
  // this address, so a reply goes straight to them. reply_to is not subject
  // to Resend's sandbox to-address restriction.
  replyTo?: string;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;
  try {
    const resend = getResendClient();
    await resend.emails.send({
      from: NOTIFY_FROM,
      to: NOTIFY_TO,
      subject: opts.subject,
      text: opts.text,
      ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
    });
  } catch (e) {
    console.error("[notify] founder notification failed (non-fatal)", e);
  }
}
