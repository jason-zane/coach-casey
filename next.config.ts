import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Pin Turbopack's root to this config file's own directory. Next infers the
  // workspace root from the nearest lockfile, and with multiple pnpm lockfiles
  // present (the main checkout plus every .claude/worktrees/* copy) it can pick
  // the main checkout instead of the worktree the dev server is actually
  // running in. When that happens it compiles files from the main checkout's
  // currently checked-out branch into this build, which has produced phantom
  // "Module not found" errors for files that exist only on another branch.
  // __dirname follows wherever this file lives, so it resolves to the main
  // checkout or the active worktree automatically. See
  // node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/turbopack.md.
  turbopack: {
    root: __dirname,
  },
  // Prompt files are loaded at runtime via readFile from lib/llm/prompts.ts.
  // The path is resolved dynamically (import.meta.url + relative segments) so
  // @vercel/nft cannot statically detect the references. Without an explicit
  // include, the prompts/ directory is excluded from the function bundle and
  // every debrief/cross-training/chat call fails ENOENT at runtime. See
  // node_modules/next/dist/docs/.../output.md for outputFileTracingIncludes.
  outputFileTracingIncludes: {
    "/*": ["./prompts/**/*.md"],
  },
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/array/:path*",
        destination: "https://us-assets.i.posthog.com/array/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },
  // This is required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,
  async headers() {
    return [
      {
        // Service worker: never cache (so updates ship instantly), correct
        // content-type, and a tight CSP so a compromised SW can't load
        // third-party scripts. See node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md.
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self'",
          },
        ],
      },
      {
        // PWA icons are content-addressed by name and never change in
        // place (we'd ship a new filename if the design changed). One
        // year, immutable, so the HTTP cache backs up the SW cache.
        source: "/:icon(icon-192|icon-512|icon-maskable-512|apple-touch-icon|favicon-16|favicon-32).png",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        // iOS PWA splash images are device-specific and only ever
        // re-generated when the icon or palette changes. Same
        // immutable policy as the icons above.
        source: "/splash/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        // The manifest is small and rarely changes; treat it like the
        // icons but with revalidation so a tweak (say, a new theme
        // colour) propagates quickly.
        source: "/manifest.json",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
