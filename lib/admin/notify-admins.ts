import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { adminEmails } from "@/lib/admin/auth";
import { sendPushToAthlete, type PushPayload } from "@/lib/push/send";

/**
 * Web-push fanout to every admin (ADMIN_EMAILS) who has an athlete row and a
 * registered push subscription. Resolves each admin email to its athlete id
 * (push subscriptions are keyed by athlete id), then reuses the per-athlete
 * sender. Best-effort and never throws: admins who haven't enabled
 * notifications simply receive nothing, and the email alert remains the
 * reliable channel.
 */
export async function pushAdmins(payload: PushPayload): Promise<void> {
  const emails = adminEmails();
  if (emails.length === 0) return;
  try {
    const admin = createAdminClient();
    for (const email of emails) {
      const { data } = await admin
        .from("athletes")
        .select("id")
        .ilike("email", email)
        .limit(1)
        .maybeSingle<{ id: string }>();
      if (data?.id) {
        await sendPushToAthlete(data.id, payload);
      }
    }
  } catch (e) {
    console.error("[notify] admin push failed (non-fatal)", e);
  }
}
