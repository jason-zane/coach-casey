import {
  HandNote,
  PenUnderline,
  SkeletonBar,
  SkeletonTable,
} from "../../_components/skeleton";

/**
 * Loading shell for the early-access requests page. Title and section
 * eyebrows are static; the pending-count subhead, the invite link, and
 * the request rows fill in.
 */
export default function AccessLoading() {
  return (
    <div className="min-h-svh bg-paper text-ink">
      <div className="mx-auto max-w-[960px] px-5 sm:px-8 py-10 space-y-8">
        <header className="space-y-2">
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle inline-flex items-center gap-1">
            <span aria-hidden>‹</span>
            <span>Back to admin</span>
          </div>
          <h1
            className="text-[28px] leading-tight font-medium text-ink"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Early access
          </h1>
          <PenUnderline />
          <SkeletonBar className="h-3 mt-2" width="60%" />
          <HandNote>checking the list</HandNote>
        </header>

        <section className="space-y-2">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted">
            Shared invite link
          </h2>
          <SkeletonBar className="h-9" width="80%" />
        </section>

        <section className="space-y-3">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted">
            Requests
          </h2>
          <SkeletonTable
            columns={["When", "Name / email", "Training for", "Status", "Send"]}
            rows={6}
            twoLineCol={1}
          />
        </section>
      </div>
    </div>
  );
}
