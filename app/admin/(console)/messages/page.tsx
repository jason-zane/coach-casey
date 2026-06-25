import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { listConversations, broadcastTargetIds } from "@/lib/coach-messages";
import { broadcastCoachMessage } from "@/app/actions/coach-messages";
import { CoachComposer } from "@/app/(app)/app/_components/coach-composer";
import { PageHeader, Card, Section, Pill, shortDateTime } from "../_components/ui";

export const dynamic = "force-dynamic";

/**
 * Admin inbox for the human coach <-> athlete channel. One row per athlete
 * with a conversation, unread athlete replies badged, plus a broadcast composer
 * that fans a single message out to every non-test athlete in their own thread.
 */
export default async function MessagesPage() {
  const gate = await requireAdmin();
  if (!gate.ok) redirect("/admin/login");

  const conversations = await listConversations();
  const unreadTotal = conversations.reduce((n, c) => n + c.unread, 0);
  const broadcastCount = (await broadcastTargetIds()).length;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Console"
        title="Messages"
        lede={
          <>
            Your direct line to athletes, separate from Casey.{" "}
            {unreadTotal > 0 ? `${unreadTotal} unread.` : "Nothing unread."} Start
            a new thread from any athlete&rsquo;s page.
          </>
        }
      />

      <Card>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted">
            Message everyone
          </h2>
          <span className="font-mono text-[11px] text-ink-subtle">
            {broadcastCount} athlete{broadcastCount === 1 ? "" : "s"}
          </span>
        </div>
        <p className="mb-3 text-[12px] leading-[1.5] text-ink-muted">
          Sends to all non-test athletes at once, each in their own thread, so
          replies come back individually. Pushes everyone.
        </p>
        <CoachComposer
          action={broadcastCoachMessage}
          placeholder="Announcement to all athletes (sends as you, Jason)…"
        />
      </Card>

      <Section title="Conversations">
        <div className="space-y-2">
          {conversations.map((c) => (
            <Link
              key={c.athleteId}
              href={`/admin/messages/${c.athleteId}`}
              className="flex items-center gap-3 rounded-md border border-rule bg-surface px-4 py-3 transition-colors hover:border-rule-strong"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-sans text-[14px] text-ink">
                    {c.name ?? c.email}
                  </span>
                  {c.unread > 0 && <Pill tone="accent">{c.unread} new</Pill>}
                </div>
                <div className="truncate font-sans text-[13px] text-ink-muted">
                  <span className="text-ink-subtle">
                    {c.lastSender === "coach" ? "You: " : ""}
                  </span>
                  {c.lastBody}
                </div>
              </div>
              <span className="shrink-0 font-mono text-[11px] text-ink-subtle">
                {shortDateTime(c.lastAt)}
              </span>
            </Link>
          ))}
          {conversations.length === 0 && (
            <p className="text-[13px] text-ink-muted">
              No conversations yet. Open an athlete from the{" "}
              <Link
                href="/admin/athletes"
                className="underline underline-offset-2"
              >
                athletes list
              </Link>{" "}
              and send the first message.
            </p>
          )}
        </div>
      </Section>
    </div>
  );
}
