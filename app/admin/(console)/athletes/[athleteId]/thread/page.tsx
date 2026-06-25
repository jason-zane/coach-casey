import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { loadAthleteAdminCore, loadFullThread } from "@/lib/admin/athlete-detail";
import { MessageBlock } from "@/app/(app)/app/_components/message";
import { renderInlineCopy } from "@/app/(app)/app/_components/rich-text";
import type { Message } from "@/lib/thread/types";
import { PageHeader } from "../../../_components/ui";

/**
 * Kinds the shared MessageBlock renders — which now includes casey_briefing
 * (briefings render in-thread for athletes too). The fallback below catches
 * any *future* kind MessageBlock doesn't yet handle, so the admin's "complete
 * thread" can never silently omit a stored message.
 */
const MESSAGE_BLOCK_KINDS = new Set([
  "chat_user",
  "chat_casey",
  "debrief",
  "weekly_review",
  "follow_up",
  "cross_training_ack",
  "cross_training_substitution",
  "casey_briefing",
  "system",
]);

export const dynamic = "force-dynamic";

/**
 * The athlete's full Casey thread, rendered with the same MessageBlock the app
 * uses — so an admin sees exactly the conversation flow the athlete sees, in
 * order, every kind (debrief, weekly review, chat, follow-up, cross-training,
 * system). Read-only: no RPE meta is attached, so the picker never renders.
 */
export default async function AthleteThreadPage({
  params,
}: {
  params: Promise<{ athleteId: string }>;
}) {
  const gate = await requireAdmin();
  if (!gate.ok) redirect("/admin/login");

  const { athleteId } = await params;
  const [core, thread] = await Promise.all([
    loadAthleteAdminCore(athleteId),
    loadFullThread(athleteId),
  ]);
  if (!core) redirect("/admin/athletes");

  const name = core.displayName ?? core.email ?? "Athlete";
  const groups = groupByDay(thread.messages);

  return (
    <div className="space-y-6">
      <PageHeader
        backHref={`/admin/athletes/${athleteId}`}
        backLabel="Back to athlete"
        eyebrow={core.displayName ? (core.email ?? undefined) : undefined}
        title={`${name}'s thread`}
        lede="The full conversation, exactly as the athlete sees it in the app."
      />

      {thread.truncated && (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 font-mono text-[11px] leading-[1.4] text-amber-800">
          This thread is long — showing the most recent {thread.messages.length}{" "}
          messages.
        </p>
      )}

      {thread.messages.length === 0 ? (
        <p className="text-[13px] text-ink-muted">
          No thread messages yet for this athlete.
        </p>
      ) : (
        <div className="mx-auto max-w-[720px]">
          <div className="overflow-hidden rounded-xl border border-rule bg-paper">
            <div className="space-y-5 py-6">
              {groups.map((g) => (
                <section key={g.day} className="space-y-4">
                  <div className="flex items-center gap-3 px-5 sm:px-6">
                    <div className="h-px flex-1 bg-rule/60" />
                    <div className="font-mono text-[10px] uppercase tracking-wider text-ink-subtle">
                      {formatDayHeader(g.day)}
                    </div>
                    <div className="h-px flex-1 bg-rule/60" />
                  </div>
                  {g.items.map((m) =>
                    MESSAGE_BLOCK_KINDS.has(m.kind) ? (
                      <div key={m.id}>
                        <MessageBlock message={m} />
                      </div>
                    ) : (
                      <FallbackBlock key={m.id} message={m} />
                    ),
                  )}
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Defensive fallback for any future Casey kind the shared MessageBlock doesn't
 * yet handle (every current kind, casey_briefing included, now renders via
 * MessageBlock). Labelled from the raw kind so an unrecognised message is still
 * shown — the audit view never silently drops a stored row.
 */
function FallbackBlock({ message }: { message: Message }) {
  const label = message.kind.replace(/[-_]/g, " ");
  return (
    <article
      data-kind={message.kind}
      className="max-w-[66ch] space-y-4 border-l-[2px] border-transparent px-5 pl-4 sm:px-6 sm:pl-5"
    >
      <div className="space-y-2 pt-1">
        <div className="h-px w-8 bg-accent/70" aria-hidden />
        <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle">
          {label}
        </div>
      </div>
      <div className="prose-serif whitespace-pre-wrap break-words text-ink">
        {renderInlineCopy(message.body)}
      </div>
    </article>
  );
}

function groupByDay(
  messages: Message[],
): Array<{ day: string; items: Message[] }> {
  const out: Array<{ day: string; items: Message[] }> = [];
  for (const m of messages) {
    const key = m.created_at.slice(0, 10);
    const last = out[out.length - 1];
    if (last && last.day === key) last.items.push(m);
    else out.push({ day: key, items: [m] });
  }
  return out;
}

function formatDayHeader(dayKey: string): string {
  const [y, mo, d] = dayKey.split("-").map(Number);
  const date = new Date(y, (mo ?? 1) - 1, d ?? 1);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round(
    (today.getTime() - date.getTime()) / 86_400_000,
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  const sameYear = date.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(date);
}
