import { SkeletonBar } from "../_components/skeleton";

export default function AdminLoading() {
  return (
    <div className="min-h-svh bg-paper text-ink">
      <div className="mx-auto max-w-[960px] px-5 sm:px-8 py-10 space-y-8">
        <header className="space-y-2">
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle inline-flex items-center gap-1">
            <span aria-hidden>‹</span>
            <span>Back to thread</span>
          </div>
          <SkeletonBar className="h-7" width="20%" />
          <SkeletonBar className="h-3 mt-2" width="70%" />
        </header>

        <section className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="rounded-md border border-rule bg-surface p-3 space-y-2"
            >
              <SkeletonBar className="h-2" width="55%" />
              <SkeletonBar className="h-6" width="40%" />
            </div>
          ))}
        </section>

        <section className="space-y-3">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted">
            Athletes
          </h2>
          <div className="rounded-md border border-rule overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-3 py-3 border-t border-rule first:border-t-0"
              >
                <SkeletonBar className="h-3" width="22%" />
                <SkeletonBar className="h-3" width="14%" />
                <SkeletonBar className="h-3" width="12%" />
                <SkeletonBar className="h-3" width="18%" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
