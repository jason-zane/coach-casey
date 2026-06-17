import {
  HandNote,
  PenUnderline,
  SkeletonBar,
  SkeletonTable,
} from "../../_components/skeleton";

/**
 * Loading shell for the admin observability page. Title, subhead, and the
 * three table headers (cron health, recent errors, audit trail) are
 * static; the stat values and rows fill in.
 */
export default function ObservabilityLoading() {
  return (
    <div className="min-h-svh bg-paper text-ink">
      <div className="mx-auto max-w-[960px] px-5 sm:px-8 py-10 space-y-8">
        <header className="space-y-2">
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle inline-flex items-center gap-1">
            <span aria-hidden>‹</span>
            <span>Back to admin</span>
          </div>
          <h1
            className="text-[28px] leading-tight font-medium text-ink"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Observability
          </h1>
          <PenUnderline />
          <p className="text-[13px] leading-[1.55] text-ink-muted">
            Errors, background-job health, and the audit trail. Errors and cron
            runs feed from the last few hundred records.
          </p>
          <HandNote>reading the dials</HandNote>
        </header>

        <section className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="rounded-md border border-rule bg-surface p-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle">
              Errors 24h
            </div>
            <SkeletonBar className="h-6 mt-1" width="40%" />
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
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
            Cron health
          </h2>
          <SkeletonTable
            columns={[
              "Job",
              "Last run",
              "Status",
              "Duration",
              "Runs 24h",
              "Failures 24h",
            ]}
            rows={5}
          />
        </section>

        <section className="space-y-3">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted">
            Recent errors
          </h2>
          <SkeletonTable
            columns={["When", "Source", "Route", "Message"]}
            rows={5}
          />
        </section>

        <section className="space-y-3">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted">
            Audit trail
          </h2>
          <SkeletonTable
            columns={["When", "Actor", "Action", "Target athlete"]}
            rows={5}
          />
        </section>
      </div>
    </div>
  );
}
