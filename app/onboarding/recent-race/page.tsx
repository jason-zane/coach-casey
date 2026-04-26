import { saveRecentRace, skipRecentRace } from "@/app/actions/race";

/**
 * Engineering placeholder per `docs/training-load-feature-spec.md` §5.2 + §11.
 * UX (final copy, layout, skip framing, multi-race input) is launch-prep
 * work. The step is only inserted into the onboarding order when the
 * `ONBOARDING_RACE_INPUT_FLAG` env var is on, so dogfood athletes don't
 * see the placeholder by accident.
 */
export default function RecentRacePage() {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-10">
      <header className="space-y-4">
        <p className="font-mono text-xs uppercase tracking-wider text-ink-subtle">
          Sharpening the picture
        </p>
        <h1 className="font-serif text-3xl leading-tight text-ink md:text-4xl">
          Raced recently?
        </h1>
        <p className="prose-serif text-ink-muted max-w-prose">
          If you&rsquo;ve raced in the last few months, drop in your time
          &mdash; it lets me set sensible reference paces for interpreting
          your running. Optional. If you skip, I&rsquo;ll work it out from
          your runs.
        </p>
      </header>

      <form action={saveRecentRace} className="space-y-5">
        <div className="space-y-1.5">
          <label
            htmlFor="preset"
            className="block font-sans text-sm text-ink-muted"
          >
            Distance
          </label>
          <select
            id="preset"
            name="preset"
            defaultValue="10k"
            className="w-full rounded-md border border-rule bg-surface px-3 py-2 font-sans text-sm text-ink outline-none transition-colors focus:border-accent"
          >
            <option value="5k">5K</option>
            <option value="10k">10K</option>
            <option value="half">Half marathon</option>
            <option value="marathon">Marathon</option>
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label
              htmlFor="time"
              className="block font-sans text-sm text-ink-muted"
            >
              Time
            </label>
            <input
              id="time"
              name="time"
              type="text"
              placeholder="42:15"
              pattern="^\d{1,2}:\d{2}(:\d{2})?$"
              className="w-full rounded-md border border-rule bg-surface px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-subtle outline-none transition-colors focus:border-accent"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="race_date"
              className="block font-sans text-sm text-ink-muted"
            >
              Date
            </label>
            <input
              id="race_date"
              name="race_date"
              type="date"
              defaultValue={today}
              className="w-full rounded-md border border-rule bg-surface px-3 py-2 font-sans text-sm text-ink outline-none transition-colors focus:border-accent"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <button
            type="submit"
            formAction={skipRecentRace}
            className="font-sans text-sm text-ink-muted underline-offset-4 hover:underline"
          >
            Skip for now
          </button>
          <button
            type="submit"
            className="rounded-md bg-accent px-5 py-2.5 font-sans text-sm text-accent-ink transition-opacity hover:opacity-90"
          >
            Continue
          </button>
        </div>
      </form>
    </div>
  );
}
