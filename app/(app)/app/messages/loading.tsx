import { SkeletonComposer, SkeletonThread } from "../_components/skeleton";

/**
 * Loading shell for the athlete's "Messages with Jason" thread. Header
 * copy is static so it renders for real; only the conversation and the
 * composer are skeletons while the messages load.
 */
export default function MessagesLoading() {
  return (
    <div className="min-h-svh bg-paper text-ink">
      <div className="mx-auto flex min-h-svh max-w-[680px] flex-col px-5 sm:px-8 py-8">
        <header className="space-y-2 pb-6">
          <div className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
            <span aria-hidden>‹</span>
            <span>Back to Casey</span>
          </div>
          <h1
            className="text-[24px] leading-tight font-medium text-ink"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Messages with Jason
          </h1>
          <p className="text-[13px] leading-[1.55] text-ink-muted">
            You&rsquo;re talking to Jason here, the human who built Coach Casey,
            not Casey itself. He reads every reply.
          </p>
        </header>

        <div className="flex-1">
          <SkeletonThread />
        </div>

        <div className="sticky bottom-0 bg-paper pt-4 space-y-2">
          <SkeletonComposer />
          <p className="text-center font-mono text-[10px] uppercase tracking-[0.12em] text-ink-subtle">
            Replies go to Jason
          </p>
        </div>
      </div>
    </div>
  );
}
