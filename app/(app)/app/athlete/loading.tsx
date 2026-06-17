import {
  HandNote,
  PenUnderline,
  SkeletonBar,
  SkeletonLines,
} from "../_components/skeleton";
import { SectionHeading, Subsection } from "./_sections/section-shell";

/**
 * Athlete page route-level skeleton. Built from the *same* Subsection and
 * SectionHeading primitives the real page uses, so the shell lands in the
 * exact shape the content fills, no jolt when data arrives. Only the
 * genuinely dynamic bits (the display-name H1 and the memory hero line)
 * are skeleton bars; the static chrome (back-links, subhead, subsection
 * labels) renders for real. Keep the subsection list in lockstep with
 * page.tsx.
 */
export default function AthleteLoading() {
  return (
    <div className="min-h-svh bg-paper text-ink">
      <div className="mx-auto max-w-[640px] px-5 sm:px-8 py-10 space-y-14">
        <header className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle inline-flex items-center gap-1">
              <span aria-hidden>‹</span>
              <span>Back to thread</span>
            </div>
            <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle inline-flex items-center gap-1">
              <span>Settings</span>
              <span aria-hidden>›</span>
            </div>
          </div>
          <SkeletonBar className="h-7" width="50%" />
          <PenUnderline />
          <p className="text-[14px] leading-[1.55] text-ink-muted">
            What Coach Casey knows about you.
          </p>
          <HandNote>reading your training</HandNote>
          <SkeletonBar className="h-3 mt-1" width="70%" />
        </header>

        <section className="space-y-0">
          <Subsection label="You">
            <SkeletonLines rows={5} />
          </Subsection>
          <Subsection label="Your goal race">
            <SkeletonLines rows={2} />
          </Subsection>
          <Subsection label="On the radar">
            <SkeletonLines rows={2} />
          </Subsection>
          <Subsection label="Life context" helper="Last 14 days">
            <SkeletonLines rows={2} />
          </Subsection>
          <Subsection label="What Casey's picked up">
            <SkeletonLines rows={3} />
          </Subsection>
        </section>

        <section className="space-y-5">
          <SectionHeading>Your training</SectionHeading>
          <SkeletonBar className="h-3" width="80%" />
          <Subsection label="Plan">
            <SkeletonLines rows={3} />
          </Subsection>
        </section>
      </div>
    </div>
  );
}
