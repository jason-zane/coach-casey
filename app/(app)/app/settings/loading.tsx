import { SkeletonBar } from "../_components/skeleton";

export default function SettingsLoading() {
  return (
    <div className="min-h-svh bg-paper text-ink">
      <div className="mx-auto max-w-[640px] px-5 sm:px-8 py-10 space-y-12">
        <header className="space-y-2">
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle inline-flex items-center gap-1">
            <span aria-hidden>‹</span>
            <span>Back to athlete page</span>
          </div>
          <SkeletonBar className="h-7" width="35%" />
          <SkeletonBar className="h-3 mt-2" width="55%" />
        </header>

        <SectionShell title="Strava" rows={2} />
        <SectionShell title="Data" rows={2} />
        <SectionShell title="Account" rows={3} />
        <SectionShell title="Legal" rows={1} />
      </div>
    </div>
  );
}

function SectionShell({ title, rows }: { title: string; rows: number }) {
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
