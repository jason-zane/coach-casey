/**
 * Skeleton primitives for loading.tsx fallbacks.
 *
 * Editorial style: hairline rules, mono uppercase eyebrows, slow breath
 * rather than shimmer. Mirrors the chrome of the section-based pages
 * (athlete, admin, plan) so the skeleton lands in the same shape the
 * real content fills, no layout jolt when data arrives.
 */
export function SkeletonBar({
  className = "",
  width = "100%",
}: {
  className?: string;
  width?: string;
}) {
  return (
    <div
      aria-hidden
      className={`h-3 rounded-sm bg-rule/60 breath ${className}`}
      style={{ width }}
    />
  );
}

/**
 * A run of skeleton bars with the house width rhythm (first wide, last
 * short, the rest full-ish). The single source of truth for "some text
 * is loading here", shared by every loading.tsx and every in-page
 * Suspense fallback so the two never drift from each other.
 */
export function SkeletonLines({ rows = 2 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonBar
          key={i}
          width={i === 0 ? "70%" : i === rows - 1 ? "45%" : "85%"}
        />
      ))}
    </div>
  );
}

/**
 * The admin table chrome (overflow wrapper, hairline border, real header
 * row) with skeleton body cells. The column labels are static, so they
 * render for real; only the per-row values are bars. `twoLineCol` marks
 * the column that carries a name-over-email stack so its skeleton gets
 * the matching second line. One source of truth for every admin table
 * shell (cohort, access, observability).
 */
export function SkeletonTable({
  columns,
  rows = 6,
  twoLineCol,
}: {
  columns: string[];
  rows?: number;
  twoLineCol?: number;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-rule">
      <table className="w-full font-sans text-[12px] text-ink">
        <thead className="bg-surface text-ink-muted">
          <tr>
            {columns.map((col) => (
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
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} className="border-t border-rule">
              {columns.map((col, c) => (
                <td key={col} className="px-3 py-2 align-top">
                  {c === twoLineCol ? (
                    <>
                      <SkeletonBar className="h-3" width="70%" />
                      <SkeletonBar className="h-2 mt-1.5" width="90%" />
                    </>
                  ) : (
                    <SkeletonBar className="h-3" width="60%" />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A short stand-in for a coach<->athlete conversation: a few bubbles
 * alternating incoming/outgoing so the message pages have something in
 * the thread slot while the real conversation streams in.
 */
export function SkeletonThread() {
  const bubbles = [
    { mine: false, width: "62%" },
    { mine: true, width: "48%" },
    { mine: false, width: "70%" },
    { mine: true, width: "38%" },
  ];
  return (
    <div className="space-y-4">
      {bubbles.map((b, i) => (
        <div key={i} className={b.mine ? "flex justify-end" : "flex justify-start"}>
          <div
            aria-hidden
            className="h-12 rounded-2xl bg-rule/60 breath"
            style={{ width: b.width }}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * Stand-in for the sticky message composer (a single-line input + send
 * affordance), used by the message-thread loading shells.
 */
export function SkeletonComposer() {
  return (
    <div
      aria-hidden
      className="h-11 w-full rounded-[10px] border border-rule bg-surface breath"
    />
  );
}

/**
 * Casey's pen, mid-stroke. A gently curved underline that draws itself under
 * a page title and loops, in the plum accent. Pure CSS (.pen-draw in
 * globals.css); a warm accent on top of the grey skeletons, not a
 * replacement. The slight negative margin tucks it under the title against
 * the header's space-y rhythm.
 */
export function PenUnderline({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={`pen-draw -mt-1 block h-3.5 w-[150px] overflow-visible ${className}`}
      viewBox="0 0 150 14"
    >
      <path pathLength={1} d="M3 8 C40 3 92 4 124 7 C133 8 142 7 147 5.5" />
    </svg>
  );
}

/**
 * A short handwritten margin note in the pen ink, with a little drawn arrow
 * pointing back at what it annotates. The loading shells use it for a
 * contextual aside ("reading your account…") that fades and redraws on the
 * same loop as the underline.
 */
export function HandNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="hand-note ink-hand mt-3 inline-flex items-center gap-2 text-[19px] leading-tight">
      <span>{children}</span>
      <svg
        aria-hidden
        className="pen-draw h-[18px] w-[26px] overflow-visible"
        viewBox="0 0 60 32"
        style={{ "--pen-delay": "0.5s" } as React.CSSProperties}
      >
        <path
          pathLength={1}
          d="M58 8 C42 4 24 8 8 17 M8 17 L18 10.5 M8 17 L18 22.5"
        />
      </svg>
    </p>
  );
}
