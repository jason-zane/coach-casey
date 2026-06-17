import {
  HandNote,
  PenUnderline,
  SkeletonBar,
  SkeletonComposer,
} from "../../_components/skeleton";

/**
 * Loading shell for the admin coach<->athlete inbox. Title and the
 * broadcast eyebrow are static; the unread subhead, the broadcast
 * composer, and the conversation rows fill in.
 */
export default function AdminMessagesLoading() {
  return (
    <div className="min-h-svh bg-paper text-ink">
      <div className="mx-auto max-w-[760px] px-5 sm:px-8 py-10 space-y-8">
        <header className="space-y-2">
          <div className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle">
            <span aria-hidden>‹</span>
            <span>Back to admin</span>
          </div>
          <h1
            className="text-[28px] leading-tight font-medium text-ink"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Messages
          </h1>
          <PenUnderline />
          <SkeletonBar className="h-3 mt-2" width="65%" />
          <HandNote>loading the inbox</HandNote>
        </header>

        <section className="space-y-3 rounded-md border border-rule bg-surface p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted">
              Message everyone
            </h2>
            <SkeletonBar className="h-2" width="64px" />
          </div>
          <p className="font-sans text-[12px] leading-[1.5] text-ink-muted">
            Sends to all non-test athletes at once, each in their own thread, so
            replies come back individually. Pushes everyone.
          </p>
          <SkeletonComposer />
        </section>

        <section className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-md border border-rule bg-surface px-4 py-3"
            >
              <div className="min-w-0 flex-1 space-y-2">
                <SkeletonBar className="h-3" width="38%" />
                <SkeletonBar className="h-3" width="80%" />
              </div>
              <SkeletonBar className="h-2 shrink-0" width="56px" />
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
