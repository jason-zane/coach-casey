import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";

function fmtDaysLeft(endsAt: string | null | undefined): number | null {
  if (!endsAt) return null;
  const diff = new Date(endsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: athlete } = await supabase
    .from("athletes")
    .select("id, display_name")
    .eq("user_id", user?.id ?? "")
    .maybeSingle();

  const { data: trial } = athlete
    ? await supabase
        .from("trials")
        .select("ends_at")
        .eq("athlete_id", athlete.id)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const { count: runCount } = athlete
    ? await supabase
        .from("activities")
        .select("id", { count: "exact", head: true })
        .eq("athlete_id", athlete.id)
    : { count: 0 };

  const daysLeft = fmtDaysLeft(trial?.ends_at);

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <header className="space-y-3">
        <p className="font-mono text-xs uppercase tracking-wider text-ink-subtle">
          You&rsquo;re in.
        </p>
        <h1 className="font-serif text-4xl leading-tight text-ink">
          First run and I&rsquo;ll have something to say.
        </h1>
        <p className="font-sans text-sm text-ink-muted">{user?.email}</p>
      </header>

      <section className="mt-10 space-y-4 font-serif text-lg leading-relaxed text-ink">
        <p>
          {runCount ? (
            <>
              {runCount}
              {" "}runs loaded so far. I&rsquo;ve got what I need to start. The
              next run you do, I&rsquo;ll be reading it.
            </>
          ) : (
            <>
              Nothing fresh yet. When you finish your next run, Coach Casey
              will have a read ready.
            </>
          )}
        </p>
        <p className="font-sans text-sm text-ink-muted">
          {daysLeft !== null ? (
            <>Trial: {daysLeft} day{daysLeft === 1 ? "" : "s"} left.</>
          ) : null}
        </p>
      </section>

      <section className="mt-10 border-t border-rule/60 pt-6 space-y-3">
        <h2 className="font-sans text-sm font-medium text-ink">
          Coming next
        </h2>
        <ul className="font-sans text-sm text-ink-muted space-y-1.5 list-disc pl-4">
          <li>
            Run your next run. I&rsquo;ll send a debrief when Strava fires the
            webhook.
          </li>
          <li>A weekly review lands on Sundays.</li>
          <li>Message me any time. I&rsquo;m here.</li>
        </ul>
      </section>

      <form action={signOut} className="mt-12">
        <button
          type="submit"
          className="font-sans text-sm text-ink-muted underline-offset-4 hover:underline"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
