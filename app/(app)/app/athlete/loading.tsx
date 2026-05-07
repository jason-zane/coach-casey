import { SkeletonBar, SkeletonSection } from "../_components/skeleton";

export default function AthleteLoading() {
  return (
    <div className="min-h-svh bg-paper text-ink">
      <div className="mx-auto max-w-[640px] px-5 sm:px-8 py-10 space-y-12">
        <header className="space-y-2">
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle inline-flex items-center gap-1">
            <span aria-hidden>‹</span>
            <span>Back to thread</span>
          </div>
          <SkeletonBar className="h-7" width="60%" />
          <SkeletonBar className="h-3 mt-2" width="80%" />
        </header>

        <SkeletonSection title="You" rows={4} />
        <SkeletonSection title="Goals" rows={2} />
        <SkeletonSection title="Training plan" rows={3} />
        <SkeletonSection title="Training" rows={1} />
        <SkeletonSection title="What Casey is tracking" rows={3} />
        <SkeletonSection title="Memory" rows={1} />
        <SkeletonSection title="Strava connection" rows={2} />
      </div>
    </div>
  );
}
