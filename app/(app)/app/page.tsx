import { HomeShellBootstrap } from "./_components/home-shell-bootstrap";

/**
 * Home page is now a static, SW-cacheable shell. The branded
 * HomeBootShell paints instantly from local cache the moment the iOS
 * splash hands off, then HomeShellBootstrap fires the bootstrap fetch
 * to load the personalized thread and swaps in HomeSurface.
 *
 * Auth + onboarding redirects still happen, just from the bootstrap
 * API instead of inline server awaits, so this page can be statically
 * generated at build time and served from the SW cache without ever
 * round-tripping the origin on cold start.
 *
 * Middleware still runs on the FIRST visit (before SW intercepts) and
 * redirects unauthed users to /signin then. Subsequent taps from the
 * home-screen icon are SW-cached and cold-start instantly.
 */
export default function HomePage() {
  return <HomeShellBootstrap />;
}
