import type { Message, MessageKind } from "@/lib/thread/types";

type Props = { message: Message; unread?: boolean };

function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const opts: Intl.DateTimeFormatOptions = sameDay
    ? { hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
  return new Intl.DateTimeFormat(undefined, opts).format(d);
}

export function MessageBlock({ message, unread }: Props) {
  const wrapperBase = "px-5 sm:px-6";
  const unreadRail = unread ? "border-l-2 border-accent/70" : "border-l-2 border-transparent";

  switch (message.kind) {
    case "chat_user":
      return (
        <div className={`${wrapperBase} flex justify-end`}>
          <div
            role="article"
            aria-label={`You: ${message.body}`}
            className="max-w-[78%] rounded-2xl rounded-br-md bg-accent text-accent-ink px-4 py-2.5 font-sans text-[15px] leading-snug whitespace-pre-wrap"
          >
            {message.body}
          </div>
        </div>
      );

    case "chat_casey":
      return (
        <article
          data-kind={message.kind}
          aria-label={`Coach Casey: ${message.body}`}
          className={`${wrapperBase} ${unreadRail} pl-4 sm:pl-5 max-w-[85%] font-sans text-[15px] leading-relaxed text-ink whitespace-pre-wrap`}
        >
          {message.body}
        </article>
      );

    case "debrief":
      return (
        <article
          data-kind={message.kind}
          aria-label={`Coach Casey debrief: ${message.body}`}
          className={`${wrapperBase} ${unreadRail} pl-4 sm:pl-5 space-y-3`}
        >
          <div
            className="font-mono text-[11px] uppercase tracking-wider text-ink-subtle"
            suppressHydrationWarning
            aria-hidden
          >
            Debrief · {formatDateLabel(message.created_at)}
          </div>
          <div className="prose-serif max-w-[65ch] text-ink whitespace-pre-wrap">
            {message.body}
          </div>
        </article>
      );

    case "weekly_review":
      return (
        <article
          data-kind={message.kind}
          aria-label={`Coach Casey weekly review: ${message.body}`}
          className={`${wrapperBase} ${unreadRail} pl-4 sm:pl-5 space-y-3`}
        >
          <div
            className="font-mono text-[11px] uppercase tracking-wider text-ink-subtle"
            suppressHydrationWarning
            aria-hidden
          >
            Weekly review · {formatDateLabel(message.created_at)}
          </div>
          <div className="prose-serif max-w-[65ch] text-ink whitespace-pre-wrap">
            {message.body}
          </div>
        </article>
      );

    case "follow_up":
      return (
        <article
          data-kind={message.kind}
          aria-label={`Coach Casey follow-up: ${message.body}`}
          className={`${wrapperBase} pl-4 sm:pl-5 max-w-[65ch]`}
        >
          <p className="font-serif italic text-ink-muted text-[16px] leading-relaxed whitespace-pre-wrap">
            {message.body}
          </p>
        </article>
      );

    case "system":
      return (
        <div className="px-5 sm:px-6 flex justify-center" role="status">
          <span className="font-mono text-[11px] uppercase tracking-wider text-ink-subtle">
            {message.body}
          </span>
        </div>
      );

    default:
      return null;
  }
}

export function StreamingCaseyBlock({ text }: { text: string }) {
  return (
    <article
      aria-hidden
      className="px-5 sm:px-6 pl-4 sm:pl-5 border-l-2 border-accent/50 max-w-[85%] font-sans text-[15px] leading-relaxed text-ink whitespace-pre-wrap"
    >
      {text}
      <span className="ml-0.5 inline-block h-[1em] w-[2px] align-[-0.15em] bg-accent breath" />
    </article>
  );
}

export function ThinkingBlock() {
  return (
    <div aria-hidden className="px-5 sm:px-6 pl-4 sm:pl-5 max-w-[85%]">
      <span className="font-mono text-[11px] uppercase tracking-wider text-ink-subtle breath">
        …
      </span>
    </div>
  );
}

export function FailedMessageNote({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="px-5 sm:px-6 flex justify-end">
      <button
        type="button"
        onClick={onRetry}
        className="font-sans text-[12px] text-ink-muted hover:text-ink underline-offset-4 hover:underline"
      >
        Didn&rsquo;t send — tap to retry
      </button>
    </div>
  );
}

export type { MessageKind };
