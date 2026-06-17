import { Edu_NSW_ACT_Foundation } from "next/font/google";
import { TimezoneCapture } from "./_components/timezone-capture";

/* Casey's pen: the same handwriting face the marketing site uses (the
 * handwriting taught in NSW schools). Only the loading shells paint it, so
 * preload:false keeps the file off the critical path; the browser fetches it
 * lazily the first time a loading state draws a handwritten note. Exposed as
 * --font-hand, which inherits to every (app) descendant. */
const hand = Edu_NSW_ACT_Foundation({
  variable: "--font-hand",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  preload: false,
});

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
    <div className={`${hand.variable} min-h-dvh bg-paper text-ink`}>
      <TimezoneCapture />
      {children}
    </div>
  );
}
