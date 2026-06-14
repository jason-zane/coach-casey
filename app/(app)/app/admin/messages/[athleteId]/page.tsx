import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import {
  getAthleteBrief,
  getConversation,
  markRead,
} from "@/lib/coach-messages";
import { sendCoachMessage } from "@/app/actions/coach-messages";
import { CoachThread } from "@/app/(app)/app/_components/coach-thread";
import { CoachComposer } from "@/app/(app)/app/_components/coach-composer";

export const dynamic = "force-dynamic";

/**
 * One athlete conversation. Messages you send post as the human coach and push
 * the athlete; opening the page marks their replies read. Reachable both from
 * the inbox and from the "message" link on the Admin athletes list (so it works
 * even before any messages exist).
 */
export default async function AdminConversationPage({
  params,
}: {
  params: Promise<{ athleteId: string }>;
}) {
  const gate = await requireAdmin();
  if (!gate.ok) redirect(gate.redirect);

  const { athleteId } = await params;
  const brief = await getAthleteBrief(athleteId);
  if (!brief) redirect("/app/admin/messages");

  const messages = await getConversation(athleteId);
  await markRead(athleteId, "coach");

  const label = brief.name ?? brief.email;

  return (
    <div className="min-h-svh bg-paper text-ink">
      <div className="mx-auto flex min-h-svh max-w-[680px] flex-col px-5 sm:px-8 py-8">
        <header className="space-y-2 pb-6">
          <Link
            href="/app/admin/messages"
            className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle hover:text-ink-muted transition-colors duration-150"
          >
            <span aria-hidden>‹</span>
            <span>All messages</span>
          </Link>
          <h1
            className="text-[22px] leading-tight font-medium text-ink"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {label}
          </h1>
          {brief.name && (
            <p className="font-mono text-[12px] text-ink-subtle">{brief.email}</p>
          )}
        </header>

        <div className="flex-1">
          <CoachThread messages={messages} viewer="coach" otherLabel={label} />
        </div>

        <div className="sticky bottom-0 bg-paper pt-4">
          <CoachComposer
            action={sendCoachMessage}
            athleteId={athleteId}
            placeholder={`Message ${brief.name ?? "this athlete"} (sends as you, Jason)…`}
          />
        </div>
      </div>
    </div>
  );
}
