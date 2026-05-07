import { TimezoneCapture } from "./_components/timezone-capture";

/**
 * Sync layout, no server awaits. The auth + onboarding gates that
 * used to run here have moved to middleware (see
 * lib/supabase/middleware.ts), which lets /app prerender as a static
 * shell for SW caching so the PWA cold-start tap is instant.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <TimezoneCapture />
      {children}
    </div>
  );
}
