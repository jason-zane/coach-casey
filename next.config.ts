import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
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
    ];
  },
};

export default nextConfig;
