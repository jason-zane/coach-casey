import "server-only";
import { getResendClient } from "@/lib/resend";

// coachcasey.app is a verified Resend sending domain, so we send FROM a Coach
// Casey address. Both default to hello@coachcasey.app (the monitored founder
// inbox). Override NOTIFY_TO via env to route alerts somewhere else (e.g. a
// personal inbox); replyTo on access requests still routes replies to the
// requester regardless.
const NOTIFY_FROM = process.env.NOTIFY_FROM?.trim() || "Coach Casey <hello@coachcasey.app>";
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
