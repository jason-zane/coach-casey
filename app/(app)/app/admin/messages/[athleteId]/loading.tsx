import {
  HandNote,
  PenUnderline,
  SkeletonBar,
  SkeletonComposer,
  SkeletonThread,
} from "../../../_components/skeleton";

/**
 * Loading shell for a single admin<->athlete conversation. The athlete's
 * name and email are dynamic (skeleton bars); the back-link is static.
 */
export default function AdminConversationLoading() {
  return (
    <div className="min-h-svh bg-paper text-ink">
      <div className="mx-auto flex min-h-svh max-w-[680px] flex-col px-5 sm:px-8 py-8">
        <header className="space-y-2 pb-6">
          <div className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle">
            <span aria-hidden>‹</span>
            <span>All messages</span>
          </div>
          <SkeletonBar className="h-6" width="40%" />
          <PenUnderline />
          <SkeletonBar className="h-3 mt-1" width="55%" />
          <HandNote>opening the thread</HandNote>
        </header>

        <div className="flex-1">
          <SkeletonThread />
        </div>

        <div className="sticky bottom-0 bg-paper pt-4">
          <SkeletonComposer />
        </div>
      </div>
    </div>
  );
}
