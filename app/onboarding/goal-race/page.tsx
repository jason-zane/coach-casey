import { saveGoalRace, skipGoalRace } from "@/app/actions/race";

export default function GoalRacePage() {
  return (
    <div className="space-y-10">
      <header className="space-y-4">
        <p className="font-mono text-xs uppercase tracking-wider text-ink-subtle">
          The race on the horizon
        </p>
        <h1 className="font-serif text-3xl leading-tight text-ink md:text-4xl">
          Training toward something?
        </h1>
        <p className="prose-serif text-ink-muted max-w-prose">
          If you&rsquo;ve got a race in your calendar, tell me what and when.
          I&rsquo;ll keep it in mind when I read your training.
        </p>
      </header>

      <form action={saveGoalRace} className="space-y-5">
        <div className="space-y-1.5">
          <label
            htmlFor="name"
            className="block font-sans text-sm text-ink-muted"
          >
            Race
          </label>
          <input
            id="name"
            name="name"
            type="text"
            placeholder="Gold Coast Marathon"
            className="w-full rounded-md border border-rule bg-surface px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-subtle outline-none transition-colors focus:border-accent"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              className="w-full rounded-md border border-rule bg-surface px-3 py-2 font-sans text-sm text-ink outline-none transition-colors focus:border-accent"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="goal_time"
              className="block font-sans text-sm text-ink-muted"
            >
              Goal time
            </label>
            <input
              id="goal_time"
              name="goal_time"
              type="text"
              placeholder="3:00:00"
              pattern="^\d{1,2}:\d{2}(:\d{2})?$"
              className="w-full rounded-md border border-rule bg-surface px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-subtle outline-none transition-colors focus:border-accent"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <button
            type="submit"
            formAction={skipGoalRace}
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
