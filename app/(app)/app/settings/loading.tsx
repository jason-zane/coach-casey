import { SkeletonLines } from "../_components/skeleton";
import { Section } from "./_sections/section-shell";

/**
 * Settings route-level skeleton. Built from the same Section primitive the
 * real page uses, with the static chrome (back-link, title, subhead,
 * section labels) rendered for real so only the per-section body fills in.
 * Section list kept in lockstep with page.tsx; the admin-only section is
 * omitted here since the shell can't know whether the viewer is an admin.
 */
export default function SettingsLoading() {
  return (
    <div className="min-h-svh bg-paper text-ink">
      <div className="mx-auto max-w-[640px] px-5 sm:px-8 py-10 space-y-12">
        <header className="space-y-2">
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle inline-flex items-center gap-1">
            <span aria-hidden>‹</span>
            <span>Back to athlete page</span>
          </div>
          <h1
            className="text-[26px] leading-tight font-medium text-ink"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Settings
          </h1>
          <p className="text-[14px] leading-[1.55] text-ink-muted">
            Account, data, and connections.
          </p>
        </header>

        <Section title="Messages from Jason">
          <SkeletonLines rows={2} />
        </Section>
        <Section title="Strava">
          <SkeletonLines rows={2} />
        </Section>
        <Section title="Data">
          <SkeletonLines rows={2} />
        </Section>
        <Section title="Account">
          <SkeletonLines rows={3} />
        </Section>
        <Section title="Legal">
          <SkeletonLines rows={1} />
        </Section>
      </div>
    </div>
  );
}
