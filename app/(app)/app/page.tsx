import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/current";
import { HomeBootShell } from "./_components/home-boot-shell";
import { HomeContent } from "./_components/home-content";

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

  // Auth + onboarding gates passed. Render the branded shell instantly
  // and stream the thread payload (ensureThread + loadRecentWindow +
  // optional empty-state seed, ~3-5 DB round trips) in via Suspense so
  // the PWA cold-start doesn't sit on a blank screen between iOS splash
  // hand-off and first message paint.
  return (
    <Suspense fallback={<HomeBootShell />}>
      <HomeContent athleteId={athlete.id} athleteEmail={user.email ?? ""} />
    </Suspense>
  );
}
