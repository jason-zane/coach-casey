import { ensureThread, loadRecentWindow, loadThread } from "@/lib/thread/repository";
import { seedEmptyStateIfNeeded } from "@/app/actions/thread";
import { HomeSurface } from "./home-surface";

/**
 * Async server component for the personalized thread payload. Pulled
 * out of /app/page.tsx so the page can render the boot shell instantly
 * and stream this in via Suspense, instead of blocking the entire HTML
 * response on the four DB awaits below.
 */
export async function HomeContent({
  athleteId,
  athleteEmail,
}: {
  athleteId: string;
  athleteEmail: string;
}) {
  const threadId = await ensureThread(athleteId);

  const [thread, window] = await Promise.all([
    loadThread(athleteId),
    loadRecentWindow(threadId, athleteId, 14),
  ]);

  let initialMessages = window.messages;
  let initialHasMore = window.hasMore;
  let initialOldestLoaded = window.oldestLoaded;

  if (initialMessages.length === 0 && !initialHasMore) {
    await seedEmptyStateIfNeeded(threadId, athleteId);
    const reloaded = await loadRecentWindow(threadId, athleteId, 14);
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
      athleteEmail={athleteEmail}
    />
  );
}
