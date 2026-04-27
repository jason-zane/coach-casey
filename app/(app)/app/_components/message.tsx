import type { Message, MessageKind } from "@/lib/thread/types";
import {
  getDebriefActivityId,
  getDebriefRpe,
  getMessageStravaId,
} from "@/lib/thread/types";
import { renderInlineCopy } from "./rich-text";
import { RpePrompt } from "./rpe-prompt";

/**
 * Subtle attribution link to the underlying Strava activity. Required by
 * Strava's brand guidelines wherever activity data is displayed; rendered
 * in muted ink (not Strava orange) so it sits in the eyebrow rhythm rather
 * than competing with the body.
 */
function StravaAttribution({ stravaId }: { stravaId: number }) {
  return (
    <a
      href={`https://www.strava.com/activities/${stravaId}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle hover:text-ink-muted transition-colors duration-150"
      aria-label="View this activity on Strava"
    >
      <span>View on Strava</span>
      <svg
        viewBox="0 0 10 10"
        width="9"
        height="9"
        aria-hidden
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 7l4-4M3.5 3h3.5v3.5" />
      </svg>
    </a>
  );
}

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

function weekOfLabel(iso: string): string {
  const d = new Date(iso);
  // Anchor to Monday of that week for a stable "week of X" kicker.
  const day = (d.getDay() + 6) % 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - day);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(monday);
}

// Maps the raw Strava activity_type (as stored on messages.meta.activity_type
// for cross_training_ack / cross_training_substitution rows) to the display
// label used in the thread eyebrow. Kept in lockstep with
// `pushTitleForActivity` in app/actions/cross-training.ts.
function crossTrainingLabel(activityType: unknown): string {
  if (typeof activityType !== "string") return "Cross-training";
  const map: Record<string, string> = {
    Ride: "Ride",
    VirtualRide: "Ride",
    EBikeRide: "Ride",
    Swim: "Swim",
    Workout: "Gym",
    WeightTraining: "Gym",
    Yoga: "Yoga",
    Pilates: "Pilates",
  };
  return map[activityType] ?? "Cross-training";
}

export function MessageBlock({ message, unread }: Props) {
  const wrapperBase = "px-5 sm:px-6";
  const unreadRail = unread
    ? "border-l-[2px] border-accent/80"
    : "border-l-[2px] border-transparent";

  switch (message.kind) {
    case "chat_user":
      return (
        <div className={`${wrapperBase} flex justify-end`}>
          <div
            role="article"
            aria-label={`You: ${message.body}`}
            className="max-w-[78%] rounded-[18px] rounded-br-[6px] bg-accent text-accent-ink px-4 py-2.5 font-sans text-[15px] leading-[1.45] whitespace-pre-wrap break-words"
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
          className={`${wrapperBase} ${unreadRail} pl-4 sm:pl-5 max-w-[85%] font-sans text-[15px] leading-[1.55] text-ink whitespace-pre-wrap break-words`}
        >
          {renderInlineCopy(message.body)}
        </article>
      );

    case "debrief": {
      const rpe = getDebriefRpe(message);
      const activityId = getDebriefActivityId(message);
      const stravaId = getMessageStravaId(message);
      return (
        <article
          data-kind={message.kind}
          aria-label={`Coach Casey debrief: ${message.body}`}
          className={`${wrapperBase} ${unreadRail} pl-4 sm:pl-5 space-y-4 max-w-[66ch]`}
        >
          <div className="pt-1 space-y-2">
            <div className="h-px w-8 bg-accent/70" aria-hidden />
            <div
              className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted"
              suppressHydrationWarning
              aria-hidden
            >
              Debrief <span className="text-ink-subtle">·</span>{" "}
              {formatDateLabel(message.created_at)}
            </div>
          </div>
          {rpe && activityId && (rpe.eligible || rpe.state.kind !== "unanswered") && (
            <RpePrompt activityId={activityId} initial={rpe} />
          )}
          <div className="prose-serif text-ink whitespace-pre-wrap break-words">
            {renderInlineCopy(message.body)}
          </div>
          {stravaId !== null && (
            <div className="pt-1">
              <StravaAttribution stravaId={stravaId} />
            </div>
          )}
        </article>
      );
    }

    case "weekly_review":
      return (
        <article
          data-kind={message.kind}
          aria-label={`Coach Casey weekly review: ${message.body}`}
          className={`${wrapperBase} ${unreadRail} pl-4 sm:pl-5 space-y-4 max-w-[66ch]`}
        >
          <div className="pt-1 space-y-2">
            <div className="h-px w-12 bg-accent/70" aria-hidden />
            <div
              className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted"
              suppressHydrationWarning
              aria-hidden
            >
              Weekly review <span className="text-ink-subtle">·</span> week of{" "}
              {weekOfLabel(message.created_at)}
            </div>
          </div>
          <div className="prose-serif text-ink whitespace-pre-wrap break-words">
            {renderInlineCopy(message.body)}
          </div>
        </article>
      );

    case "follow_up":
      return (
        <article
          data-kind={message.kind}
          aria-label={`Coach Casey follow-up: ${message.body}`}
          className={`${wrapperBase} pl-8 sm:pl-10 max-w-[62ch]`}
        >
          <p className="font-serif italic text-ink-muted text-[16px] leading-[1.55] whitespace-pre-wrap break-words">
            <span aria-hidden className="text-ink-subtle mr-2">
              –
            </span>
            {renderInlineCopy(message.body)}
          </p>
        </article>
      );

    case "cross_training_ack":
    case "cross_training_substitution": {
      const label = crossTrainingLabel(
        (message.meta as { activity_type?: unknown }).activity_type,
      );
      const isSubstitution = message.kind === "cross_training_substitution";
      const stravaId = getMessageStravaId(message);
      return (
        <article
          data-kind={message.kind}
          aria-label={`Coach Casey ${label.toLowerCase()} note: ${message.body}`}
          className={`${wrapperBase} ${unreadRail} pl-4 sm:pl-5 space-y-3 max-w-[66ch]`}
        >
          <div className="pt-1 space-y-2">
            <div className="h-px w-8 bg-accent/70" aria-hidden />
            <div
              className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted"
              suppressHydrationWarning
              aria-hidden
            >
              {label} <span className="text-ink-subtle">·</span>{" "}
              {formatDateLabel(message.created_at)}
              {isSubstitution && (
                <>
                  {" "}
                  <span className="text-ink-subtle">·</span> instead of a run
                </>
              )}
            </div>
          </div>
          <div className="prose-serif text-ink whitespace-pre-wrap break-words">
            {renderInlineCopy(message.body)}
          </div>
          {stravaId !== null && (
            <div className="pt-1">
              <StravaAttribution stravaId={stravaId} />
            </div>
          )}
        </article>
      );
    }

    case "system":
      return (
        <div className="px-5 sm:px-6 flex justify-center" role="status">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle">
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
      className="px-5 sm:px-6 pl-4 sm:pl-5 border-l-[2px] border-accent/40 max-w-[85%] font-sans text-[15px] leading-[1.55] text-ink whitespace-pre-wrap break-words"
    >
      {renderInlineCopy(text)}
      <span
        aria-hidden
        className="ml-0.5 inline-block h-[1em] w-[2px] align-[-0.15em] bg-accent breath"
      />
    </article>
  );
}

export function ThinkingBlock() {
  return (
    <div
      aria-hidden
      className="px-5 sm:px-6 pl-4 sm:pl-5 border-l-[2px] border-accent/30 max-w-[85%]"
    >
      <span className="font-serif text-[18px] leading-none text-ink-muted breath tracking-[0.2em]">
        · · ·
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
        Didn&rsquo;t send. Tap to retry.
      </button>
    </div>
  );
}

export type { MessageKind };
