import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/current";
import { ensureThread, loadRecentWindow, loadThread } from "@/lib/thread/repository";
import { seedEmptyStateIfNeeded } from "@/app/actions/thread";
import { HomeSurface } from "./_components/home-surface";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getCurrentSession();
  if (!session) redirect("/signin");
  const { user, athlete } = session;

  if (!athlete) redirect("/signin");
  if (athlete.deleted_at) {
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/?deleted=1");
  }
  if (!athlete.onboarding_completed_at) redirect("/onboarding");

  const threadId = await ensureThread(athlete.id);

  // Hot path: load the thread + recent window first, then only run the
  // welcome seed when the thread is genuinely empty (no recent messages
  // and no older history). Pre-V1 always fired the seed action on every
  // render, which meant 4 round trips of "do we need to seed?" on every
  // home-page load even after years of usage.
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

  return (
    <HomeSurface
      threadId={threadId}
      lastViewedAt={thread?.last_viewed_at ?? null}
      initialMessages={initialMessages}
      initialHasMore={initialHasMore}
      initialOldestLoaded={initialOldestLoaded}
      athleteEmail={user.email ?? ""}
    />
  );
}
