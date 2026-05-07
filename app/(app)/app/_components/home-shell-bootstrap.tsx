"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { HomeBootstrapResponse } from "@/app/api/home/bootstrap/route";
import { HomeBootShell } from "./home-boot-shell";

/**
 * HomeSurface is the heavy chat surface (~34 KB component pulling in
 * Composer, MenuBar, message renderers, calendar/search modal stubs,
 * etc.). next/dynamic with ssr:false splits it into its own chunk
 * that only loads after the bootstrap fetch resolves, so the static
 * /app HTML the SW serves on cold-tap pulls in just the boot-shell +
 * tiny bootstrap JS. On a slow device that's a real first-paint win.
 */
const HomeSurface = dynamic(
  () => import("./home-surface").then((m) => m.HomeSurface),
  { ssr: false, loading: () => <HomeBootShell /> },
);

/**
 * Client bootstrap that the static /app page renders. The shell paints
 * instantly (the page HTML is SW-cached, so it hits local storage
 * before any network goes out), then this component fires the
 * /api/home/bootstrap fetch to get the personalized thread payload
 * and swaps to HomeSurface in place. Redirect responses are turned
 * into a same-tab navigation so unauthed / mid-onboarding athletes
 * still land where they should.
 */
export function HomeShellBootstrap() {
  const [data, setData] = useState<
    Extract<HomeBootstrapResponse, { kind: "ready" }> | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/home/bootstrap", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!res.ok) {
          // Treat any error as an auth-style fall-through to /signin.
          // Network failures show the shell indefinitely, which is
          // acceptable, the offline indicator inside HomeSurface only
          // appears after data arrives, and a hard error here means
          // the bootstrap couldn't run at all.
          window.location.replace("/signin");
          return;
        }
        const payload = (await res.json()) as HomeBootstrapResponse;
        if (cancelled) return;
        if (payload.kind === "redirect") {
          window.location.replace(payload.to);
          return;
        }
        setData(payload);
      } catch {
        if (cancelled) return;
        window.location.replace("/signin");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) return <HomeBootShell />;

  return (
    <HomeSurface
      threadId={data.threadId}
      lastViewedAt={data.lastViewedAt}
      initialMessages={data.messages}
      initialHasMore={data.hasMore}
      initialOldestLoaded={data.oldestLoaded}
      athleteEmail={data.athleteEmail}
    />
  );
}
