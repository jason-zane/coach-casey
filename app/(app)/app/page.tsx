import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureThread, loadRecentWindow, loadThread } from "@/lib/thread/repository";
import { seedEmptyStateIfNeeded } from "@/app/actions/thread";
import { HomeSurface } from "./_components/home-surface";
import { ThresholdBanner } from "./_components/threshold-banner";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { data: athlete } = await supabase
    .from("athletes")
    .select("id, display_name, onboarding_completed_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!athlete) redirect("/signin");
  if (!athlete.onboarding_completed_at) redirect("/onboarding");

  const threadId = await ensureThread(athlete.id as string);
  await seedEmptyStateIfNeeded(threadId, athlete.id as string);

  const [thread, window] = await Promise.all([
    loadThread(athlete.id as string),
    loadRecentWindow(threadId, athlete.id as string, 14),
  ]);

  return (
    <>
      <ThresholdBanner athleteId={athlete.id as string} />
      <HomeSurface
        threadId={threadId}
        lastViewedAt={thread?.last_viewed_at ?? null}
        initialMessages={window.messages}
        initialHasMore={window.hasMore}
        initialOldestLoaded={window.oldestLoaded}
        athleteEmail={user.email ?? ""}
      />
    </>
  );
}
