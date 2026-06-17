import { HandNote, PenUnderline, SkeletonBar } from "../../_components/skeleton";

export default function PlanLoading() {
  return (
    <div className="min-h-svh bg-paper text-ink">
      <div className="mx-auto max-w-[640px] px-5 sm:px-8 py-10 space-y-8">
        <header className="space-y-2">
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle inline-flex items-center gap-1">
            <span aria-hidden>‹</span>
            <span>Back to athlete page</span>
          </div>
          <SkeletonBar className="h-7" width="50%" />
          <PenUnderline />
          <SkeletonBar className="h-3 mt-2" width="90%" />
          <HandNote>finding your plan</HandNote>
        </header>

        <div className="space-y-3">
          <SkeletonBar width="100%" />
          <SkeletonBar width="80%" />
          <SkeletonBar width="65%" />
        </div>
      </div>
    </div>
  );
}
