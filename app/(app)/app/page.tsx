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

  const threadId = await ensureThread(athlete.id as string);
  await seedEmptyStateIfNeeded(threadId);

  const [thread, window] = await Promise.all([
    loadThread(athlete.id as string),
    loadRecentWindow(threadId, athlete.id as string, 14),
  ]);

  return (
    <HomeSurface
      threadId={threadId}
      lastViewedAt={thread?.last_viewed_at ?? null}
      initialMessages={window.messages}
      initialHasMore={window.hasMore}
      initialOldestLoaded={window.oldestLoaded}
      athleteEmail={user.email ?? ""}
    />
  );
}
