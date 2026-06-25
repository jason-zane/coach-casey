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
import { PageHeader } from "../../_components/ui";

export const dynamic = "force-dynamic";

/**
 * One athlete conversation. Messages send as the human coach and push the
 * athlete; opening the page marks their replies read. Reachable from the inbox
 * and from any athlete's detail page.
 */
export default async function ConversationPage({
  params,
}: {
  params: Promise<{ athleteId: string }>;
}) {
  const gate = await requireAdmin();
  if (!gate.ok) redirect("/admin/login");

  const { athleteId } = await params;
  const brief = await getAthleteBrief(athleteId);
  if (!brief) redirect("/admin/messages");

  const messages = await getConversation(athleteId);
  await markRead(athleteId, "coach");

  const label = brief.name ?? brief.email;

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-[760px] flex-col">
      <PageHeader
        backHref="/admin/messages"
        backLabel="All messages"
        title={label}
        eyebrow={brief.name ? brief.email : undefined}
        actions={
          <Link
            href={`/admin/athletes/${athleteId}`}
            className="rounded-md border border-rule px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle transition-colors hover:border-rule-strong hover:text-ink"
          >
            profile
          </Link>
        }
      />

      <div className="flex-1">
        <CoachThread messages={messages} viewer="coach" otherLabel={label} />
      </div>

      <div className="sticky bottom-0 -mx-1 mt-6 bg-paper px-1 pt-4">
        <CoachComposer
          action={sendCoachMessage}
          athleteId={athleteId}
          placeholder={`Message ${brief.name ?? "this athlete"} (sends as you, Jason)…`}
        />
      </div>
    </div>
  );
}
