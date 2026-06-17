import { PenUnderline } from "./skeleton";

/**
 * Branded full-screen shell shown the instant the PWA hands off from the
 * iOS splash image, while the personalized thread streams in behind a
 * Suspense boundary.
 *
 * Visual continuity: the bg matches the splash paper color and theme
 * color exactly (#faf8f5 / #131217), so when iOS swaps from its system
 * splash to the WKWebView paint there is no color flash. The header
 * wordmark + composer chrome sit in the same positions as HomeSurface,
 * so when the real thread arrives only the message area swaps; the
 * frame doesn't shift.
 *
 * The centre carries the same handwritten pen language as the route
 * loading shells: a drawn underline under the wordmark and the status
 * line in Casey's hand, so the most-seen loading moment (every cold tap
 * and every nav back to /app) feels like Casey picking up the pen.
 *
 * No data dependencies. Renders synchronously. Used as both the
 * Suspense fallback inside /app/page.tsx and the route-level
 * loading.tsx, so it covers cold-start (PWA tap) AND in-app navigation
 * back to /app.
 */
export function HomeBootShell() {
  return (
    <div
      aria-hidden
      className="fixed inset-x-0 top-0 h-dvh flex flex-col bg-paper"
    >
      <header
        className="flex items-center justify-between px-5 sm:px-6 py-3 border-b border-rule/50"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}
      >
        <div className="font-serif text-[18px] tracking-tight text-ink">
          Coach Casey
        </div>
      </header>

      <main className="flex-1 min-h-0 relative overflow-hidden">
        <div className="absolute inset-0 flex flex-col justify-center items-center gap-4 px-6">
          <div className="flex flex-col items-center">
            <div className="font-serif text-[28px] sm:text-[32px] tracking-tight text-ink/70">
              Coach Casey
            </div>
            <PenUnderline />
          </div>
          <div className="hand-note ink-hand text-[19px] leading-tight">
            catching up
          </div>
        </div>
      </main>

      <div
        className="px-4 sm:px-6 py-3 border-t border-rule/50"
        style={{
          paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
        }}
      >
        <div className="h-12 rounded-xl bg-rule/30" />
      </div>
    </div>
  );
}
