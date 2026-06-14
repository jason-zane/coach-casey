import type { CoachMessage, CoachMessageSender } from "@/lib/coach-messages";

/**
 * Presentational coach<->athlete conversation. `viewer` is the side reading:
 * their own messages sit right (accent), the other side sits left (labelled
 * with `otherLabel`). Used by both the athlete page and the admin view.
 */
export function CoachThread({
  messages,
  viewer,
  otherLabel,
}: {
  messages: CoachMessage[];
  viewer: CoachMessageSender;
  otherLabel: string;
}) {
  if (messages.length === 0) {
    return (
      <p className="py-8 text-center font-sans text-[13px] text-ink-muted">
        No messages yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {messages.map((m) => {
        const mine = m.sender === viewer;
        return (
          <div
            key={m.id}
            className={`flex flex-col ${mine ? "items-end" : "items-start"}`}
          >
            {!mine && (
              <span className="mb-1 px-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle">
                {otherLabel}
              </span>
            )}
            <div
              className={
                mine
                  ? "max-w-[80%] rounded-[18px] rounded-br-[6px] bg-accent px-4 py-2.5 font-sans text-[15px] leading-[1.45] text-accent-ink whitespace-pre-wrap break-words"
                  : "max-w-[80%] rounded-[18px] rounded-bl-[6px] border border-rule bg-surface px-4 py-2.5 font-sans text-[15px] leading-[1.45] text-ink whitespace-pre-wrap break-words"
              }
            >
              {m.body}
            </div>
            <span className="mt-1 px-1 font-mono text-[10px] text-ink-subtle">
              {formatTime(m.createdAt)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
