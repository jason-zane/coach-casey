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

export function SkeletonSection({
  title,
  rows = 2,
}: {
  title: string;
  rows?: number;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted">
        {title}
      </h2>
      <div className="space-y-3 border-t border-rule/60 pt-4">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonBar
            key={i}
            width={i === 0 ? "70%" : i === rows - 1 ? "45%" : "85%"}
          />
        ))}
      </div>
    </section>
  );
}
