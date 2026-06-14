"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/auth";
import { getCurrentSession } from "@/lib/auth/current";
import { recordAuditEvent } from "@/lib/audit/log";
import { sendPushToAthlete } from "@/lib/push/send";
import { pushAdmins } from "@/lib/admin/notify-admins";
import { broadcastTargetIds } from "@/lib/coach-messages";

const MAX_BODY = 4000;

/**
 * Coach -> athlete message. Admin only. Persists as sender='coach', pushes the
 * athlete ("Message from Jason" deep-linking to /app/messages), and audits.
 * Casey is never involved: this is a separate channel.
 */
export async function sendCoachMessage(formData: FormData) {
  const gate = await requireAdmin();
  if (!gate.ok) redirect(gate.redirect);

  const athleteId = String(formData.get("athlete_id") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim().slice(0, MAX_BODY);
  if (!athleteId || !body) return;

  const admin = createAdminClient();
  const { error } = await admin.from("coach_messages").insert({
    athlete_id: athleteId,
    sender: "coach",
    body,
  });
  if (error) throw error;

  await sendPushToAthlete(athleteId, {
    title: "Message from Jason",
    body,
    tag: `coach-msg-${athleteId}`,
    url: "/app/messages",
  });

  await recordAuditEvent({
    actorType: "admin",
    actorId: gate.user.id,
    actorEmail: gate.user.email ?? null,
    action: "admin.send_coach_message",
    targetAthleteId: athleteId,
  });

  revalidatePath(`/app/admin/messages/${athleteId}`);
  revalidatePath("/app/admin/messages");
}

/**
 * Coach -> every (non-test) athlete. Inserts one message per athlete (so each
 * lands in that athlete's own conversation and can be replied to individually)
 * and pushes each. Admin only.
 */
export async function broadcastCoachMessage(formData: FormData) {
  const gate = await requireAdmin();
  if (!gate.ok) redirect(gate.redirect);

  const body = String(formData.get("body") ?? "").trim().slice(0, MAX_BODY);
  if (!body) return;

  const ids = await broadcastTargetIds();
  if (ids.length === 0) return;

  const admin = createAdminClient();
  const { error } = await admin
    .from("coach_messages")
    .insert(ids.map((id) => ({ athlete_id: id, sender: "coach", body })));
  if (error) throw error;

  await Promise.all(
    ids.map((id) =>
      sendPushToAthlete(id, {
        title: "Message from Jason",
        body,
        tag: `coach-msg-${id}`,
        url: "/app/messages",
      }),
    ),
  );

  await recordAuditEvent({
    actorType: "admin",
    actorId: gate.user.id,
    actorEmail: gate.user.email ?? null,
    action: "admin.broadcast_coach_message",
    metadata: { count: ids.length },
  });

  revalidatePath("/app/admin/messages");
}

/**
 * Athlete -> coach reply. Resolves the athlete from the session, persists as
 * sender='athlete', and pushes the admins ("Reply from …" deep-linking to the
 * conversation). Never hits Casey. Returns a status the client form can read.
 */
export async function replyToCoach(formData: FormData): Promise<void> {
  const session = await getCurrentSession();
  if (!session?.athlete) return;
  const athlete = session.athlete;

  const body = String(formData.get("body") ?? "").trim().slice(0, MAX_BODY);
  if (!body) return;

  const admin = createAdminClient();
  const { error } = await admin.from("coach_messages").insert({
    athlete_id: athlete.id,
    sender: "athlete",
    body,
  });
  if (error) throw error;

  const who = athlete.display_name || athlete.email || "An athlete";
  await pushAdmins({
    title: `Reply from ${who}`,
    body,
    tag: `coach-reply-${athlete.id}`,
    url: `/app/admin/messages/${athlete.id}`,
  });

  revalidatePath("/app/messages");
}
