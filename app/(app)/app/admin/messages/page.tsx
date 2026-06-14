import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { listConversations } from "@/lib/coach-messages";

export const dynamic = "force-dynamic";

/**
 * Admin inbox for the coach<->athlete channel. One row per athlete with a
 * conversation, newest first, unread (athlete replies you haven't read) badged.
 * Start a new conversation from the "message" link on the Admin athletes table.
 */
export default async function AdminMessagesPage() {
  const gate = await requireAdmin();
  if (!gate.ok) redirect(gate.redirect);

  const conversations = await listConversations();
  const unreadTotal = conversations.reduce((n, c) => n + c.unread, 0);

  return (
    <div className="min-h-svh bg-paper text-ink">
      <div className="mx-auto max-w-[760px] px-5 sm:px-8 py-10 space-y-8">
        <header className="space-y-2">
          <Link
            href="/app/admin"
            className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle hover:text-ink-muted transition-colors duration-150"
          >
            <span aria-hidden>‹</span>
            <span>Back to admin</span>
          </Link>
          <h1
            className="text-[28px] leading-tight font-medium text-ink"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Messages
          </h1>
          <p className="text-[13px] leading-[1.55] text-ink-muted">
            Your direct line to athletes, separate from Casey.{" "}
            {unreadTotal > 0
              ? `${unreadTotal} unread.`
              : "Nothing unread."}{" "}
            To start a new one, use the “message” link on the{" "}
            <Link href="/app/admin" className="underline underline-offset-2">
              athletes list
            </Link>
            .
          </p>
        </header>

        <section className="space-y-2">
          {conversations.map((c) => (
            <Link
              key={c.athleteId}
              href={`/app/admin/messages/${c.athleteId}`}
              className="flex items-center gap-3 rounded-md border border-rule bg-surface px-4 py-3 transition-colors hover:border-rule-strong"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-sans text-[14px] text-ink">
                    {c.name ?? c.email}
                  </span>
                  {c.unread > 0 && (
                    <span className="rounded-full bg-accent px-2 py-0.5 font-mono text-[10px] text-accent-ink">
                      {c.unread}
                    </span>
                  )}
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
              <Link href="/app/admin" className="underline underline-offset-2">
                athletes list
              </Link>{" "}
              and send the first message.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function shortDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
