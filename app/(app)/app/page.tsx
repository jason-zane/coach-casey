import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <header className="space-y-3">
        <h1 className="font-serif text-4xl leading-tight text-ink">
          Signed in.
        </h1>
        <p className="font-sans text-sm text-ink-muted">{user?.email}</p>
      </header>

      <section className="mt-10 space-y-4 font-serif text-lg leading-relaxed text-ink">
        <p>
          Nothing lives here yet. This is the shell Coach Casey will grow into,
          the surface that opens when the installed icon is tapped.
        </p>
        <p className="font-sans text-sm text-ink-muted">
          Next: onboarding, Strava connection, the first debrief.
        </p>
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
