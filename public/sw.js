/* Coach Casey service worker.
 *
 * Two jobs:
 *   1. Web push notifications and notification-click routing.
 *   2. Asset + shell caching so the PWA cold-start (tap home-screen
 *      icon → first paint) is instant. The home page is now a static
 *      auth-agnostic shell that the SW serves cache-first; the page
 *      then fires /api/home/bootstrap to load the personalized thread
 *      and swaps it in. Pre-V3 SW kept HTML network-only, so cold
 *      tap still waited on TTFB + middleware + auth before any pixels.
 *
 * Caching policy:
 *   - PRECACHE: small set of cold-start essentials (manifest, icons).
 *   - SHELL (cache-first + background revalidate): /app document. Auth
 *     redirects (307 to /signin etc.) are NEVER cached, so unauthed
 *     users still go through middleware on first hit.
 *   - STATIC (cache-first, immutable): /_next/static/** chunks. Hashed
 *     filenames mean a cached copy is correct forever; we just keep
 *     them and let the browser bust on a new hash.
 *   - FONTS (stale-while-revalidate): Google Fonts CSS + woff2 files.
 *   - Other HTML and /api/**: NETWORK-ONLY. Auth state and per-user
 *     data must always come from the server.
 *
 * Bump CACHE_VERSION whenever the shell HTML, precache list, or
 * strategy changes. The activate handler purges anything not on the
 * current version, so a new SW deploy invalidates the prior shell.
 */

const CACHE_VERSION = "v6-light-2026-06-17";
const PRECACHE = `precache-${CACHE_VERSION}`;
const SHELL = `shell-${CACHE_VERSION}`;
const STATIC = `static-${CACHE_VERSION}`;
const FONTS = `fonts-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
  "/favicon-32.png",
  "/favicon-16.png",
];

async function tryPrecacheShell() {
  // Best-effort precache of the /app shell so the FIRST PWA tap after a
  // deploy can hit cache instead of the network. cache-on-first-fetch
  // (in shellCacheFirst) covers steady state; this covers the first tap.
  //
  // The fetch carries the document's cookies (SW fetch defaults to
  // credentials: same-origin), so for an authed athlete this returns
  // the 200 static shell. Unauthed, /app 307s to /signin, which we
  // skip via response.redirected. Either way install completes.
  try {
    const cache = await caches.open(SHELL);
    const response = await fetch("/app", { credentials: "same-origin" });
    if (response.ok && !response.redirected) {
      await cache.put("/app", response);
    }
  } catch {
    // Network failure during install is fine; shellCacheFirst will
    // populate on the next /app navigation.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE);
      // Tolerate individual misses, e.g. a single icon 404 shouldn't
      // block install. addAll is atomic; we want best-effort.
      await Promise.allSettled(
        PRECACHE_URLS.map((url) => cache.add(url).catch(() => {})),
      );
      await tryPrecacheShell();
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([PRECACHE, SHELL, STATIC, FONTS]);
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => !keep.has(n)).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

function isStaticChunk(url) {
  return url.pathname.startsWith("/_next/static/");
}

function isFontRequest(url, request) {
  if (url.hostname === "fonts.googleapis.com") return true;
  if (url.hostname === "fonts.gstatic.com") return true;
  // Self-hosted fonts (Next.js's font optimization rewrites Google
  // Fonts to /_next/static, already covered by isStaticChunk).
  return request.destination === "font";
}

function isPrecached(url) {
  return PRECACHE_URLS.includes(url.pathname);
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type !== "opaque") {
    cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok && response.type !== "opaque") {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    })
    .catch(() => cached);
  return cached || fetchPromise;
}

/**
 * App-shell strategy for /app.
 *
 * Returns the cached shell HTML immediately if present (this is what
 * makes the PWA tap feel instant: no network round-trip), and kicks
 * off a background revalidate to keep the cache fresh.
 *
 * On first visit (no cache yet) we hit the network and ONLY cache
 * 200-OK same-origin responses. Auth redirects (307 → /signin,
 * /onboarding, etc.) and any error response are returned but NOT
 * cached, so future cache hits are always the real shell.
 *
 * Same-origin scope is enforced via response.url because the
 * Supabase auth refresh middleware can return a 307 whose location
 * is same-origin but whose Response.redirected is true; we explicitly
 * filter on `redirected` to keep redirect responses out of cache.
 */
async function shellCacheFirst(request) {
  const cache = await caches.open(SHELL);
  // ignoreSearch so any iOS-injected query params on the PWA launch URL
  // (e.g. utm_source=homescreen, source=pwa) don't cause a cache miss
  // for what is fundamentally the same shell document.
  const cached = await cache.match("/app", { ignoreSearch: true });
  if (cached) {
    fetch(request)
      .then((response) => {
        if (response.ok && !response.redirected) {
          cache.put("/app", response.clone()).catch(() => {});
        }
      })
      .catch(() => {});
    return cached;
  }
  const response = await fetch(request);
  if (response.ok && !response.redirected) {
    cache.put("/app", response.clone()).catch(() => {});
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Only handle GETs. Anything else (chat POSTs, server actions, etc.)
  // must hit the network unmediated.
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Cross-origin requests that aren't fonts: leave alone. PostHog,
  // Supabase, Strava callbacks, etc. all go straight to the network.
  if (url.origin !== self.location.origin && !isFontRequest(url, request)) {
    return;
  }

  // Never cache the SW itself.
  if (url.pathname === "/sw.js") return;

  // /app document: cache-first shell. The static auth-agnostic shell
  // is what fires the bootstrap fetch and renders the personalized
  // thread, so cold-start tap can paint pixels before any network
  // hop completes. Anything else under /app/* (athlete, settings,
  // admin) falls through to the network-only branch below.
  if (
    url.pathname === "/app" &&
    request.destination === "document" &&
    request.mode === "navigate"
  ) {
    event.respondWith(shellCacheFirst(request));
    return;
  }

  // Other HTML, server actions, and API routes: network-only. Auth
  // state and per-user data flow through these and must always be
  // fresh. Match by destination (HTML documents) and path.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/ingest/") ||
    request.destination === "document"
  ) {
    return;
  }

  if (isStaticChunk(url) || request.destination === "script" || request.destination === "style") {
    event.respondWith(cacheFirst(request, STATIC));
    return;
  }

  if (isFontRequest(url, request)) {
    event.respondWith(staleWhileRevalidate(request, FONTS));
    return;
  }

  if (isPrecached(url) || request.destination === "image") {
    event.respondWith(staleWhileRevalidate(request, PRECACHE));
    return;
  }
});

function sameOriginPath(value, fallback) {
  try {
    const url = new URL(value || fallback, self.location.origin);
    if (url.origin !== self.location.origin) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (err) {
    // Push services occasionally deliver empty/non-JSON pings to keep
    // subscriptions alive. Fall through with defaults.
    console.warn("push payload parse failed", err);
  }

  const title = payload.title || "Coach Casey";
  const options = {
    body: payload.body || "",
    icon: sameOriginPath(payload.icon, "/icon-192.png"),
    badge: "/icon-192.png",
    tag: payload.tag,
    // renotify=true forces the device to re-alert when an existing tag is
    // replaced; important so an updated debrief doesn't slide in silently.
    renotify: Boolean(payload.tag),
    data: {
      url: sameOriginPath(payload.url, "/app"),
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = sameOriginPath(
    event.notification.data && event.notification.data.url,
    "/app",
  );

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // If a tab is already open on this origin, focus it and navigate.
      for (const client of all) {
        try {
          const url = new URL(client.url);
          if (url.origin === self.location.origin) {
            await client.focus();
            if ("navigate" in client) {
              await client.navigate(target);
            }
            return;
          }
        } catch {
          // Ignore parse failures and fall through to openWindow.
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
