import { SkeletonBar } from "../_components/skeleton";

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
          <p className="text-[13px] leading-[1.55] text-ink-muted">
            Cohort overview. Toggle test-user flag, retroactively trigger
            weekly reviews. Use sparingly.
          </p>
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
          <div className="overflow-x-auto rounded-md border border-rule">
            <table className="w-full font-sans text-[12px] text-ink">
              <thead className="bg-surface text-ink-muted">
                <tr>
                  {COLUMNS.map((col) => (
                    <th
                      key={col}
                      className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.14em] font-medium"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 6 }).map((_, r) => (
                  <tr key={r} className="border-t border-rule">
                    <td className="px-3 py-2 align-top">
                      <SkeletonBar className="h-3" width="70%" />
                      <SkeletonBar className="h-2 mt-1.5" width="90%" />
                    </td>
                    {Array.from({ length: COLUMNS.length - 1 }).map((_, c) => (
                      <td key={c} className="px-3 py-2 align-top">
                        <SkeletonBar className="h-3" width="60%" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
