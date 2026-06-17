import {
  HandNote,
  PenUnderline,
  SkeletonBar,
  SkeletonTable,
} from "../_components/skeleton";

/**
 * Admin route-level skeleton. Mirrors page.tsx exactly: the static chrome
 * (back-link, title, subhead, sub-nav, stat labels, table header) renders
 * for real, and only the per-athlete numbers and rows are skeleton bars.
 * The stat-card and table markup is kept byte-for-byte in step with the
 * page so the shell collapses into the content with no reflow.
 */

const STAT_LABELS = [
  "Athletes",
  "Test users",
  "Active 7d",
  "Debriefs 7d",
  "Reviews 7d",
];

const COLUMNS = [
  "Name / email",
  "Joined",
  "Last sign in",
  "Strava",
  "Last activity",
  "Last Casey msg",
  "Last review",
  "Test user",
  "Actions",
];

export default function AdminLoading() {
  return (
    <div className="min-h-svh bg-paper text-ink">
      <div className="mx-auto max-w-[960px] px-5 sm:px-8 py-10 space-y-8">
        <header className="space-y-2">
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle inline-flex items-center gap-1">
            <span aria-hidden>‹</span>
            <span>Back to thread</span>
          </div>
          <h1
            className="text-[28px] leading-tight font-medium text-ink"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Admin
          </h1>
          <PenUnderline />
          <p className="text-[13px] leading-[1.55] text-ink-muted">
            Cohort overview. Toggle test-user flag, retroactively trigger
            weekly reviews. Use sparingly.
          </p>
          <HandNote>counting the cohort</HandNote>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {["Early access", "Messages", "Observability"].map((label) => (
              <span
                key={label}
                className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle"
              >
                <span>{label}</span>
                <span aria-hidden>›</span>
              </span>
            ))}
          </div>
        </header>

        <section className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {STAT_LABELS.map((label) => (
            <div
              key={label}
              className="rounded-md border border-rule bg-surface p-3"
            >
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle">
                {label}
              </div>
              <SkeletonBar className="h-6 mt-1" width="40%" />
            </div>
          ))}
        </section>

        <section className="space-y-3">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted">
            Athletes
          </h2>
          <SkeletonTable columns={COLUMNS} rows={6} twoLineCol={0} />
        </section>
      </div>
    </div>
  );
}
