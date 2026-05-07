import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/current";
import {
  ensureThread,
  loadRecentWindow,
  loadThread,
} from "@/lib/thread/repository";
import { seedEmptyStateIfNeeded } from "@/app/actions/thread";
import type { Message } from "@/lib/thread/types";

/**
 * Hot-path bootstrap for the home thread, called by the static /app
 * shell once it mounts in the browser. Returns either a redirect
 * directive (which the shell turns into a navigation) or the full
 * thread payload that HomeSurface needs to render.
 *
 * Why an API route, not a server component: the /app page is now a
 * static, SW-cacheable shell so the cold-start tap hits local storage
 * instead of round-tripping the network. All the auth + DB work that
 * used to block that response now happens here, fired by the shell
 * after first paint.
 */
export type HomeBootstrapResponse =
  | { kind: "redirect"; to: string }
  | {
      kind: "ready";
      threadId: string;
      lastViewedAt: string | null;
      messages: Message[];
      hasMore: boolean;
      oldestLoaded: string | null;
      athleteEmail: string;
    };

export async function GET(): Promise<NextResponse<HomeBootstrapResponse>> {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ kind: "redirect", to: "/signin" } as const);
  }
  const { user, athlete } = session;
  if (!athlete) {
    return NextResponse.json({ kind: "redirect", to: "/signin" } as const);
  }
  if (athlete.deleted_at) {
    const supabase = await createClient();
    await supabase.auth.signOut();
    return NextResponse.json({
      kind: "redirect",
      to: "/?deleted=1",
    } as const);
  }
  if (!athlete.onboarding_completed_at) {
    return NextResponse.json({
      kind: "redirect",
      to: "/onboarding",
    } as const);
  }
  if (!athlete.date_of_birth) {
    return NextResponse.json({
      kind: "redirect",
      to: "/onboarding/about-you?backfill=1",
    } as const);
  }

  const threadId = await ensureThread(athlete.id);
  const [thread, window] = await Promise.all([
    loadThread(athlete.id),
    loadRecentWindow(threadId, athlete.id, 14),
  ]);

  let initialMessages = window.messages;
  let initialHasMore = window.hasMore;
  let initialOldestLoaded = window.oldestLoaded;

  if (initialMessages.length === 0 && !initialHasMore) {
    await seedEmptyStateIfNeeded(threadId, athlete.id);
    const reloaded = await loadRecentWindow(threadId, athlete.id, 14);
    initialMessages = reloaded.messages;
    initialHasMore = reloaded.hasMore;
    initialOldestLoaded = reloaded.oldestLoaded;
  }

  return NextResponse.json({
    kind: "ready",
    threadId,
    lastViewedAt: thread?.last_viewed_at ?? null,
    messages: initialMessages,
    hasMore: initialHasMore,
    oldestLoaded: initialOldestLoaded,
    athleteEmail: user.email ?? "",
  } as const);
}
