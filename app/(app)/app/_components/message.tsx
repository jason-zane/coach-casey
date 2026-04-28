import type { Message, MessageActivityStats, MessageKind } from "@/lib/thread/types";
import {
  getDebriefActivityId,
  getDebriefRpe,
  getMessageActivityStats,
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
// for debrief, cross_training_ack, and cross_training_substitution rows) to
// the display label used in the thread eyebrow. Kept in lockstep with
// `pushTitleForActivity` in app/actions/cross-training.ts. Run variants
// (Run, TrailRun, VirtualRun) all collapse to "Run" so the eyebrow rhythm
// stays consistent across activity types.
function activityLabel(
  activityType: unknown,
  fallback: "Run" | "Cross-training" = "Cross-training",
): string {
  if (typeof activityType !== "string") return fallback;
  if (/run/i.test(activityType)) return "Run";
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
  return map[activityType] ?? fallback;
}

function formatPace(secPerKm: number): string {
  // Round total seconds first, then split, a naive `Math.round(secPerKm % 60)`
  // can produce `:60` for paces that round up across a minute boundary
  // (e.g. 5:59.6/km would render as 5:60/km).
  const rounded = Math.round(secPerKm);
  const m = Math.floor(rounded / 60);
  const s = rounded % 60;
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m`;
  return `${Math.round(seconds)}s`;
}

function formatStatRow(stats: MessageActivityStats): string[] {
  const parts: string[] = [];
  const isRun = stats.activityType ? /run/i.test(stats.activityType) : false;
  const isRide = stats.activityType
    ? /ride/i.test(stats.activityType)
    : false;

  if (stats.distanceKm != null && stats.distanceKm >= 0.1) {
    parts.push(`${stats.distanceKm.toFixed(1)} km`);
  }
  if (stats.movingTimeS != null && stats.movingTimeS > 0) {
    parts.push(formatDuration(stats.movingTimeS));
  }
  if (
    isRun &&
    stats.distanceKm != null &&
    stats.distanceKm > 0 &&
    stats.movingTimeS != null &&
    stats.movingTimeS > 0
  ) {
    parts.push(formatPace(stats.movingTimeS / stats.distanceKm));
  } else if (
    isRide &&
    stats.distanceKm != null &&
    stats.distanceKm > 0 &&
    stats.movingTimeS != null &&
    stats.movingTimeS > 0
  ) {
    const kmh = stats.distanceKm / (stats.movingTimeS / 3600);
    parts.push(`${kmh.toFixed(1)} km/h`);
  }
  if (stats.avgHr != null && stats.avgHr > 0) {
    parts.push(`${Math.round(stats.avgHr)} bpm`);
  }
  return parts;
}

/**
 * Shared header used by debrief and cross-training rows. Renders, in order:
 * accent line → activity label · date/time → stat row (distance · time ·
 * pace · HR) → View on Strava attribution. The body and RPE prompt are
 * rendered by the caller below this block so the read flows: identify →
 * numbers → external link → Casey's reading → engagement.
 */
function ActivityHeader({
  label,
  createdAt,
  trailing,
  stats,
  stravaId,
}: {
  label: string;
  createdAt: string;
  trailing?: React.ReactNode;
  stats: MessageActivityStats | null;
  stravaId: number | null;
}) {
  const statParts = stats ? formatStatRow(stats) : [];
  return (
    <div className="pt-1 space-y-2">
      <div className="h-px w-8 bg-accent/70" aria-hidden />
      <div
        className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted"
        suppressHydrationWarning
        aria-hidden
      >
        {label} <span className="text-ink-subtle">·</span>{" "}
        {formatDateLabel(createdAt)}
        {trailing}
      </div>
      {statParts.length > 0 && (
        <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted">
          {statParts.map((part, i) => (
            <span key={part}>
              {i > 0 && <span className="text-ink-subtle"> · </span>}
              {part}
            </span>
          ))}
        </div>
      )}
      {stravaId !== null && <StravaAttribution stravaId={stravaId} />}
    </div>
  );
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
      const stats = getMessageActivityStats(message);
      // Debrief gate already restricts this kind to runs, so default the
      // label when activity_type wasn't captured (older debriefs predate the
      // meta field).
      const label = activityLabel(stats?.activityType, "Run");
      return (
        <article
          data-kind={message.kind}
          aria-label={`Coach Casey ${label.toLowerCase()} debrief: ${message.body}`}
          className={`${wrapperBase} ${unreadRail} pl-4 sm:pl-5 space-y-4 max-w-[66ch]`}
        >
          <ActivityHeader
            label={label}
            createdAt={message.created_at}
            stats={stats}
            stravaId={stravaId}
          />
          <div className="prose-serif text-ink whitespace-pre-wrap break-words">
            {renderInlineCopy(message.body)}
          </div>
          {rpe && activityId && (rpe.eligible || rpe.state.kind !== "unanswered") && (
            <RpePrompt activityId={activityId} initial={rpe} />
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
      const stats = getMessageActivityStats(message);
      const label = activityLabel(stats?.activityType, "Cross-training");
      const isSubstitution = message.kind === "cross_training_substitution";
      const stravaId = getMessageStravaId(message);
      return (
        <article
          data-kind={message.kind}
          aria-label={`Coach Casey ${label.toLowerCase()} note: ${message.body}`}
          className={`${wrapperBase} ${unreadRail} pl-4 sm:pl-5 space-y-4 max-w-[66ch]`}
        >
          <ActivityHeader
            label={label}
            createdAt={message.created_at}
            stats={stats}
            stravaId={stravaId}
            trailing={
              isSubstitution ? (
                <>
                  {" "}
                  <span className="text-ink-subtle">·</span> instead of a run
                </>
              ) : null
            }
          />
          <div className="prose-serif text-ink whitespace-pre-wrap break-words">
            {renderInlineCopy(message.body)}
          </div>
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
