import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/current";
import { TimezoneCapture } from "./_components/timezone-capture";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Backfill gate for athletes who completed onboarding before the
  // about-you step existed. DOB is the only field Strava doesn't give us,
  // so it's the cleanest "is the demographic block populated" signal.
  // Sex/weight may legitimately be null for athletes who decline to set
  // them in Strava, so we don't gate on those.
  //
  // getCurrentSession is React-cache-memoised so the same lookup is reused
  // by the page below this layout, no second auth + athletes round trip.
  const session = await getCurrentSession();
  const athlete = session?.athlete;
  if (athlete?.onboarding_completed_at && !athlete.date_of_birth) {
    redirect("/onboarding/about-you?backfill=1");
  }

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <TimezoneCapture />
      {children}
    </div>
  );
}
