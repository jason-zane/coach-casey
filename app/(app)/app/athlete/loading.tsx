import { SkeletonBar } from "../_components/skeleton";

/**
 * Athlete page route-level skeleton. Mirrors the new structure: a
 * header with two utility links, the serif H1, the subhead, the
 * memory hero line placeholder, then the grouped subsections and
 * the "Your training" block.
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
          <SkeletonBar className="h-3 mt-2" width="60%" />
          <SkeletonBar className="h-3 mt-1" width="80%" />
        </header>

        <section>
          <SubsectionShell label="You" rows={5} />
          <SubsectionShell label="Your goal race" rows={2} />
          <SubsectionShell label="On the radar" rows={2} />
          <SubsectionShell label="Life context" helper="Last 14 days" rows={2} />
        </section>

        <section className="space-y-5">
          <h2
            className="text-[22px] sm:text-[24px] leading-tight font-medium text-ink"
            style={{ fontFamily: "var(--font-serif)", letterSpacing: "-0.015em" }}
          >
            Your training
          </h2>
          <SkeletonBar className="h-3" width="80%" />
          <SubsectionShell label="Plan" rows={3} />
        </section>
      </div>
    </div>
  );
}

function SubsectionShell({
  label,
  helper,
  rows,
}: {
  label: string;
  helper?: string;
  rows: number;
}) {
  return (
    <div className="border-t border-rule/40 pt-5 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-ink">{label}</h3>
        {helper && (
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle">
            {helper}
          </span>
        )}
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonBar
            key={i}
            width={i === 0 ? "70%" : i === rows - 1 ? "45%" : "85%"}
          />
        ))}
      </div>
    </div>
  );
}
