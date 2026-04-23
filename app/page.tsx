import Link from "next/link";

/**
 * Hero headline alternatives — primary below is "Plans know the route. Coach Casey sees the run."
 * Swap in any of these for a different read:
 *
 *   (a) "Your plan tells you what to run. Coach Casey tells you how it went."
 *       — The original from voice-guidelines.md §12. Clean, already approved voice.
 *
 *   (b) "The plan says go easy. Coach Casey tells you if easy held."
 *       — Most concrete of the set. Ties to a real coaching moment and
 *         implies the observational intelligence directly.
 *
 *   (c) "A plan is half the work. Coach Casey reads the other half."
 *       — Shortest, most positioning-forward. Reads as a statement rather
 *         than a demonstration.
 */

export default function Home() {
  return (
    <div className="flex flex-col flex-1">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <SampleDebrief />
        <HowItWorks />
        <WhoItsFor />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 backdrop-blur-sm bg-[color:var(--color-paper)]/85 border-b rule">
      <div className="mx-auto max-w-[1180px] px-6 md:px-10 h-16 flex items-center justify-between">
        <Link
          href="/"
          className="text-[color:var(--color-ink)] text-lg font-medium tracking-tight"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Coach Casey
        </Link>
        <nav className="flex items-center gap-6 md:gap-8 text-[14px] text-[color:var(--color-ink-muted)]">
          <Link href="#how" className="hidden sm:inline hover:text-[color:var(--color-ink)] transition-colors duration-150">
            How it works
          </Link>
          <Link href="#pricing" className="hidden sm:inline hover:text-[color:var(--color-ink)] transition-colors duration-150">
            Pricing
          </Link>
          <Link href="#faq" className="hidden md:inline hover:text-[color:var(--color-ink)] transition-colors duration-150">
            FAQ
          </Link>
          <Link href="/signin" className="hover:text-[color:var(--color-ink)] transition-colors duration-150">
            Sign in
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center h-9 px-4 rounded-[6px] bg-[color:var(--color-accent)] text-[color:var(--color-accent-ink)] text-[14px] font-medium hover:opacity-90 transition-opacity duration-150"
          >
            Start free trial
          </Link>
        </nav>
      </div>
    </header>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="relative">
      <div className="mx-auto max-w-[1180px] px-6 md:px-10 pt-20 md:pt-32 pb-24 md:pb-40">
        <h1 className="display-hero text-[color:var(--color-ink)] rise rise-1 max-w-[900px]">
          Plans know the route.{" "}
          <span className="text-[color:var(--color-accent)]">Coach Casey</span>{" "}
          sees the run.
        </h1>

        <div className="mt-10 md:mt-14 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-10 md:gap-16 items-end">
          <p
            className="prose-serif text-[color:var(--color-ink-muted)] max-w-[44ch] rise rise-2"
          >
            A reflective partner for marathoners already following a plan —
            from a book, a coach, or an app. Doesn&rsquo;t write your training.
            Reads what just happened, and remembers.
          </p>

          <div className="flex flex-wrap gap-3 md:justify-end rise rise-3">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center h-11 px-5 rounded-[6px] bg-[color:var(--color-accent)] text-[color:var(--color-accent-ink)] text-[15px] font-medium hover:opacity-90 transition-opacity duration-150"
            >
              Start 14-day free trial
            </Link>
            <Link
              href="#how"
              className="inline-flex items-center justify-center h-11 px-5 rounded-[6px] border rule-strong text-[color:var(--color-ink)] text-[15px] font-medium hover:border-[color:var(--color-accent)] hover:text-[color:var(--color-accent)] transition-all duration-150"
            >
              See how it works
            </Link>
          </div>
        </div>
      </div>

      <div className="border-b rule" />
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

function SampleDebrief() {
  return (
    <section className="bg-[color:var(--color-surface)] border-b rule">
      <div className="mx-auto max-w-[1180px] px-6 md:px-10 py-24 md:py-36">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)] gap-10 md:gap-20 items-start">
          <div>
            <p className="text-[13px] font-medium text-[color:var(--color-ink-muted)] uppercase tracking-[0.04em]">
              A debrief, written
            </p>
            <h2 className="display-section text-[color:var(--color-ink)] mt-4">
              Every run, read out loud.
            </h2>
            <p className="mt-6 text-[15px] leading-relaxed text-[color:var(--color-ink-muted)] max-w-[36ch]">
              Not a summary. Not a scoreboard. A read on what actually happened,
              in the voice of a coach who&rsquo;s been paying attention.
            </p>
          </div>

          <article className="relative">
            <div className="border-l-[2px] border-[color:var(--color-accent)] pl-6 md:pl-10">
              <header className="flex flex-wrap items-baseline justify-between gap-4 pb-5 border-b rule">
                <div>
                  <p className="text-[12px] font-medium text-[color:var(--color-ink-subtle)] uppercase tracking-[0.12em]">
                    Thursday · Easy run
                  </p>
                  <h3 className="display-sub text-[color:var(--color-ink)] mt-2">
                    10&thinsp;km around the park
                  </h3>
                </div>
                <p className="text-[13px] text-[color:var(--color-ink-subtle)]" style={{ fontFamily: "var(--font-mono)" }}>
                  06:42
                </p>
              </header>

              <dl className="grid grid-cols-4 gap-3 md:gap-6 py-6 border-b rule">
                <Metric label="Pace" value="4:58" unit="/km" hint="avg" />
                <Metric label="HR" value="142" unit="bpm" hint="avg" />
                <Metric label="Distance" value="10.0" unit="km" />
                <Metric label="Week" value="42" unit="km so far" />
              </dl>

              <div className="pt-6 prose-serif text-[color:var(--color-ink)] space-y-5 max-w-[62ch]">
                <p>
                  Quicker than an easy run usually lives for you &mdash;
                  4:58/km, about 15s/km faster than your usual easy. HR stayed
                  low, so nothing physical. But the plan wanted easy to be easy.
                </p>
                <p>
                  Two things. You mentioned the calf on Tuesday &mdash; easy
                  runs are where you bank that signal, and 4:58 is harder to
                  justify if the calf&rsquo;s still talking.{" "}
                  <span className="text-[color:var(--color-accent)]">
                    Not my call
                  </span>
                  , but worth sitting with before tomorrow.
                </p>
              </div>

              <footer className="pt-6 mt-8 border-t rule">
                <p className="text-[13px] text-[color:var(--color-ink-subtle)]">
                  &mdash;&thinsp;Coach Casey
                </p>
              </footer>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  unit,
  hint,
}: {
  label: string;
  value: string;
  unit: string;
  hint?: string;
}) {
  return (
    <div>
      <dt className="text-[11px] font-medium text-[color:var(--color-ink-subtle)] uppercase tracking-[0.12em]">
        {label}
      </dt>
      <dd className="mt-2 flex items-baseline gap-1">
        <span className="text-[22px] md:text-[26px] font-medium text-[color:var(--color-ink)] tabular-nums" style={{ fontFamily: "var(--font-sans)", letterSpacing: "-0.01em" }}>
          {value}
        </span>
        <span className="text-[12px] text-[color:var(--color-ink-muted)]" style={{ fontFamily: "var(--font-mono)" }}>
          {unit}
        </span>
      </dd>
      {hint && (
        <p className="mt-1 text-[11px] text-[color:var(--color-ink-subtle)]">{hint}</p>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

function HowItWorks() {
  const steps = [
    {
      n: "1",
      title: "Connect Strava.",
      body:
        "New activities sync automatically. Coach Casey starts reading from your first run.",
    },
    {
      n: "2",
      title: "Tell it what you&rsquo;re training for.",
      body:
        "Upload a plan, paste a block, or describe the race. The more Coach Casey knows, the sharper the reads.",
    },
    {
      n: "3",
      title: "Get a debrief after every run.",
      body:
        "Written in a coach&rsquo;s voice, using your actual data, informed by the block you&rsquo;re in and the runs that came before.",
    },
  ];

  return (
    <section id="how" className="border-b rule">
      <div className="mx-auto max-w-[1180px] px-6 md:px-10 py-24 md:py-36">
        <div className="max-w-[42ch]">
          <p className="text-[13px] font-medium text-[color:var(--color-ink-muted)] uppercase tracking-[0.04em]">
            How it works
          </p>
          <h2 className="display-section text-[color:var(--color-ink)] mt-4">
            Three steps. Then it&rsquo;s just running.
          </h2>
        </div>

        <ol className="mt-16 md:mt-24 divide-y rule">
          {steps.map((step) => (
            <li key={step.n} className="py-10 md:py-14 grid grid-cols-1 md:grid-cols-[96px_minmax(0,32ch)_1fr] gap-6 md:gap-16 items-start">
              <span
                className="text-[48px] md:text-[72px] leading-none font-medium text-[color:var(--color-ink-subtle)] tabular-nums"
                style={{ fontFamily: "var(--font-sans)", letterSpacing: "-0.04em" }}
                aria-hidden
              >
                {step.n}
              </span>
              <h3 className="display-sub text-[color:var(--color-ink)]">
                <span dangerouslySetInnerHTML={{ __html: step.title }} />
              </h3>
              <p className="prose-serif text-[color:var(--color-ink-muted)] max-w-[52ch]">
                <span dangerouslySetInnerHTML={{ __html: step.body }} />
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

function WhoItsFor() {
  return (
    <section className="bg-[color:var(--color-surface)] border-b rule">
      <div className="mx-auto max-w-[1180px] px-6 md:px-10 py-24 md:py-36">
        <p className="text-[13px] font-medium text-[color:var(--color-ink-muted)] uppercase tracking-[0.04em]">
          Who it&rsquo;s for
        </p>

        <div className="mt-10 max-w-[62ch]">
          <p className="display-sub text-[color:var(--color-ink)] font-normal" style={{ fontWeight: 400, lineHeight: 1.25 }}>
            If you&rsquo;ve committed to a plan and you&rsquo;re showing up to
            the runs, you&rsquo;ve done the hard part.{" "}
            <span className="text-[color:var(--color-ink-muted)]">
              What&rsquo;s missing is the read &mdash; someone holding the
              memory of every run, noticing the drift, asking the sharper
              question before the pattern becomes a problem.
            </span>{" "}
            That&rsquo;s all Coach Casey is.
          </p>

          <p className="mt-10 prose-serif text-[color:var(--color-ink-subtle)] max-w-[56ch]">
            If you want something to write your training, motivate you through
            an app, or replace a coach who already watches every run &mdash;
            Coach Casey isn&rsquo;t that. It sits alongside what you&rsquo;ve
            already got, and reads what just happened.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

function Pricing() {
  return (
    <section id="pricing" className="border-b rule">
      <div className="mx-auto max-w-[1180px] px-6 md:px-10 py-24 md:py-36">
        <div className="max-w-[42ch]">
          <p className="text-[13px] font-medium text-[color:var(--color-ink-muted)] uppercase tracking-[0.04em]">
            Pricing
          </p>
          <h2 className="display-section text-[color:var(--color-ink)] mt-4">
            Fair for what it does.
          </h2>
          <p className="mt-6 prose-serif text-[color:var(--color-ink-muted)]">
            A fraction of a human coach, priced for people who are serious
            enough to pay for it and sensible enough to notice when they
            aren&rsquo;t using it.
          </p>
        </div>

        <div className="mt-16 md:mt-20 grid grid-cols-1 md:grid-cols-2 border-y rule-strong">
          <PriceBlock
            label="Monthly"
            amount="24"
            period="/month"
            note="Cancel anytime."
          />
          <PriceBlock
            label="Annual"
            amount="199"
            period="/year"
            highlight="Effective A$16.60/month. Save A$89 a year."
            note=""
            dividerLeft
          />
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center h-11 px-5 rounded-[6px] bg-[color:var(--color-accent)] text-[color:var(--color-accent-ink)] text-[15px] font-medium hover:opacity-90 transition-opacity duration-150"
          >
            Start 14-day free trial
          </Link>
          <p className="text-[13px] text-[color:var(--color-ink-subtle)]">
            No card required for the trial. All prices in AUD.
          </p>
        </div>
      </div>
    </section>
  );
}

function PriceBlock({
  label,
  amount,
  period,
  note,
  highlight,
  dividerLeft,
}: {
  label: string;
  amount: string;
  period: string;
  note: string;
  highlight?: string;
  dividerLeft?: boolean;
}) {
  return (
    <div className={`py-10 md:py-14 md:pl-10 md:pr-10 ${dividerLeft ? "md:border-l rule-strong md:pl-10" : "md:pl-0"}`}>
      <p className="text-[12px] font-medium text-[color:var(--color-ink-subtle)] uppercase tracking-[0.12em]">
        {label}
      </p>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-[22px] text-[color:var(--color-ink-muted)]" style={{ fontFamily: "var(--font-sans)" }}>
          A$
        </span>
        <span
          className="text-[64px] md:text-[84px] leading-none font-medium text-[color:var(--color-ink)] tabular-nums"
          style={{ fontFamily: "var(--font-serif)", letterSpacing: "-0.03em" }}
        >
          {amount}
        </span>
        <span className="text-[14px] text-[color:var(--color-ink-muted)] ml-2">
          {period}
        </span>
      </div>
      {highlight && (
        <p className="mt-4 text-[14px] text-[color:var(--color-accent)]">
          {highlight}
        </p>
      )}
      {note && (
        <p className="mt-4 text-[14px] text-[color:var(--color-ink-muted)]">
          {note}
        </p>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

function Faq() {
  const items = [
    {
      q: "Does it replace my coach?",
      a: "No. Coach Casey reads your runs and remembers the pattern. Your coach decides what to do next. If anything, the debriefs give your coach a sharper starting point.",
    },
    {
      q: "What if I don't have a plan?",
      a: "Coach Casey works better with one — a book, a generated plan, or one from your coach all work. Without a plan, it still reads your runs, but the reads are thinner.",
    },
    {
      q: "How is this different from Strava or Runna?",
      a: "Strava records the run. Runna prescribes the plan. Coach Casey does neither. It reads what you ran and remembers, so the next debrief is sharper than the last.",
    },
    {
      q: "Where does my data go?",
      a: "Strava data comes in read-only through their API. Your runs, plan, and chat history are stored on Supabase (Sydney). Coach Casey uses LLMs to write debriefs; your data is never used to train them.",
    },
    {
      q: "What does the trial include?",
      a: "14 days, no card required, everything enabled. Connect Strava, upload a plan, get debriefs and weekly reads. If it isn't clicking by day 10, it probably isn't for you.",
    },
    {
      q: "Can I cancel anytime?",
      a: "Yes, from your account page. No claw-backs on the annual plan — unused months refund automatically, pro-rata.",
    },
  ];

  return (
    <section id="faq" className="bg-[color:var(--color-surface)] border-b rule">
      <div className="mx-auto max-w-[1180px] px-6 md:px-10 py-24 md:py-36">
        <div className="max-w-[42ch]">
          <p className="text-[13px] font-medium text-[color:var(--color-ink-muted)] uppercase tracking-[0.04em]">
            Questions
          </p>
          <h2 className="display-section text-[color:var(--color-ink)] mt-4">
            Fair things to ask.
          </h2>
        </div>

        <dl className="mt-16 md:mt-20 grid grid-cols-1 md:grid-cols-2 gap-x-14 gap-y-0">
          {items.map((item, i) => (
            <div
              key={item.q}
              className={`py-8 md:py-10 border-t rule ${i < 2 ? "md:first:border-t" : ""}`}
            >
              <dt
                className="text-[color:var(--color-ink)]"
                style={{
                  fontFamily: "var(--font-serif)",
                  fontStyle: "italic",
                  fontSize: "clamp(1.125rem, 1.5vw, 1.375rem)",
                  fontWeight: 500,
                  letterSpacing: "-0.01em",
                  lineHeight: 1.2,
                }}
              >
                {item.q}
              </dt>
              <dd className="mt-4 text-[15px] leading-relaxed text-[color:var(--color-ink-muted)] max-w-[56ch]">
                {item.a}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

function FinalCta() {
  return (
    <section className="border-b rule">
      <div className="mx-auto max-w-[1180px] px-6 md:px-10 py-28 md:py-40 text-center">
        <h2 className="display-section text-[color:var(--color-ink)] mx-auto max-w-[22ch]">
          Fourteen days on the house.
        </h2>
        <p className="mt-6 prose-serif text-[color:var(--color-ink-muted)] mx-auto max-w-[46ch]">
          Connect Strava, run the runs you were going to run anyway,
          see what Coach Casey has to say.
        </p>
        <div className="mt-10">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center h-12 px-6 rounded-[6px] bg-[color:var(--color-accent)] text-[color:var(--color-accent-ink)] text-[15px] font-medium hover:opacity-90 transition-opacity duration-150"
          >
            Start free trial
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

function SiteFooter() {
  return (
    <footer>
      <div className="mx-auto max-w-[1180px] px-6 md:px-10 py-10 flex flex-wrap items-center gap-x-8 gap-y-3 text-[13px] text-[color:var(--color-ink-subtle)]">
        <span
          className="text-[color:var(--color-ink)] text-[15px] font-medium"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Coach Casey
        </span>
        <Link href="#how" className="hover:text-[color:var(--color-ink)] transition-colors duration-150">
          How it works
        </Link>
        <Link href="#pricing" className="hover:text-[color:var(--color-ink)] transition-colors duration-150">
          Pricing
        </Link>
        <Link href="#faq" className="hover:text-[color:var(--color-ink)] transition-colors duration-150">
          FAQ
        </Link>
        <Link href="/privacy" className="hover:text-[color:var(--color-ink)] transition-colors duration-150">
          Privacy
        </Link>
        <Link href="/terms" className="hover:text-[color:var(--color-ink)] transition-colors duration-150">
          Terms
        </Link>
        <span className="ml-auto">© 2026 · Built in Australia</span>
      </div>
    </footer>
  );
}
