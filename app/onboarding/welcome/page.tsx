import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { completeOnboarding } from "@/app/actions/onboarding";

function formatGoalTime(seconds: number | null | undefined): string | null {
  if (!seconds) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatRaceDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
}

export default async function WelcomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { data: athlete } = await supabase
    .from("athletes")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!athlete) redirect("/signin");

  const twelveWeeksAgo = new Date();
  twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 12 * 7);

  const [{ count: runCount }, planRow, raceRow, injuryRow] = await Promise.all([
    supabase
      .from("activities")
      .select("id", { count: "exact", head: true })
      .eq("athlete_id", athlete.id)
      .gte("start_date_local", twelveWeeksAgo.toISOString()),
    supabase
      .from("preferences")
      .select("plan_follower_status")
      .eq("athlete_id", athlete.id)
      .maybeSingle(),
    supabase
      .from("goal_races")
      .select("name, race_date, goal_time_seconds")
      .eq("athlete_id", athlete.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("memory_items")
      .select("content, tags")
      .eq("athlete_id", athlete.id)
      .eq("kind", "injury")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const planStatus = planRow.data?.plan_follower_status as
    | "following"
    | "deferred"
    | "none"
    | "unknown"
    | undefined;
  const race = raceRow.data;
  const injury = injuryRow.data;

  return (
    <div className="space-y-12">
      <header className="space-y-4">
        <p className="font-mono text-xs uppercase tracking-wider text-ink-subtle">
          Before you go
        </p>
        <h1 className="font-serif text-3xl leading-tight text-ink md:text-4xl">
          Here&rsquo;s what I am, and what I&rsquo;m not.
        </h1>
      </header>

      <section className="space-y-4">
        <h2 className="font-mono text-xs uppercase tracking-wider text-ink-subtle">
          What I&rsquo;ve got now
        </h2>
        <div className="prose-serif text-ink max-w-prose space-y-3">
          <WhatIveGot
            runCount={runCount ?? 0}
            planStatus={planStatus}
            race={race}
            injury={injury}
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-mono text-xs uppercase tracking-wider text-ink-subtle">
          What happens from here
        </h2>
        <div className="prose-serif text-ink max-w-prose space-y-3">
          <p>
            Finish your next run and a debrief will land. Short. Specific to
            what you just did. A weekly review arrives on Sundays.
          </p>
          <p>
            Message me any time. If something&rsquo;s on your mind about
            tomorrow&rsquo;s session, ask. I&rsquo;ll answer from inside the
            plan, not around it.
          </p>
          <p>
            I don&rsquo;t write training plans. That&rsquo;s your coach or the
            plan you&rsquo;re following. I interpret what&rsquo;s happening
            inside it. Supplementary, not a replacement.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-mono text-xs uppercase tracking-wider text-ink-subtle">
          What builds
        </h2>
        <div className="prose-serif text-ink max-w-prose space-y-3">
          <p>
            What I have now is enough to start. It isn&rsquo;t everything.
          </p>
          <p>
            In the first few weeks I&rsquo;ll ask small questions after some
            runs. Sleep, stress, how it actually felt. Things Strava
            can&rsquo;t see. They fill in slowly.
          </p>
          <p>
            By month three I&rsquo;ll know you the way a coach who&rsquo;s
            been watching for months does. The calf you mentioned in April
            gets remembered in August. The race that matters gets held in
            view. That&rsquo;s where it earns its keep.
          </p>
        </div>
      </section>

      <section className="space-y-4 border-t border-rule/60 pt-6">
        <p className="font-sans text-sm text-ink-muted">
          Fourteen days. No card. No commitment. Cancel whenever.
        </p>
        <form action={completeOnboarding}>
          <button
            type="submit"
            className="rounded-md bg-ink px-6 py-3 font-sans text-sm text-paper transition-opacity hover:opacity-90"
          >
            Let&rsquo;s go.
          </button>
        </form>
      </section>
    </div>
  );
}

function WhatIveGot({
  runCount,
  planStatus,
  race,
  injury,
}: {
  runCount: number;
  planStatus: string | undefined;
  race:
    | { name: string | null; race_date: string | null; goal_time_seconds: number | null }
    | null;
  injury: { content: string; tags: string[] } | null;
}) {
  const parts: string[] = [];
  if (runCount > 0) parts.push(`your last ${runCount} runs`);

  if (planStatus === "following") parts.push("the plan you shared");
  else if (planStatus === "deferred") parts.push("a placeholder where your plan goes");
  else if (planStatus === "none") parts.push("the note that you\u2019re running without a structured plan");

  if (race) {
    const raceName = race.name ?? "your goal race";
    const when = formatRaceDate(race.race_date);
    const time = formatGoalTime(race.goal_time_seconds);
    const parts2 = [raceName];
    if (when) parts2.push(`in ${when}`);
    if (time) parts2.push(`aiming at ${time}`);
    parts.push(parts2.join(" "));
  }

  if (injury) {
    const tag = injury.tags?.[0];
    parts.push(tag ? `the ${tag} you flagged` : "the niggle you mentioned");
  }

  if (parts.length === 0) {
    return (
      <p>
        Not much yet. That&rsquo;s fine. The next run will be the first real
        signal.
      </p>
    );
  }

  const joined = joinWithCommasAnd(parts);
  return (
    <>
      <p>{"I\u2019ve got "}{joined}.</p>
      <p className="text-ink-muted font-sans text-sm">Enough to start.</p>
    </>
  );
}

function joinWithCommasAnd(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}
