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
