import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col flex-1">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <SampleDebrief />
        <MoreThanTheDebrief />
        <TheMoat />
        <WhoItsFor />
        <HowItWorks />
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
          Training plans know the run.{" "}
          <span className="block">
            <span className="text-[color:var(--color-accent)]">Coach Casey</span>{" "}
            knows the runner.
          </span>
        </h1>

        <div className="mt-10 md:mt-14 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-10 md:gap-16 items-end">
          <p className="prose-serif text-[color:var(--color-ink-muted)] max-w-[52ch] rise rise-2">
            For runners following a plan, from a book, a coach, a running group,
            or an app. Coach Casey reads the runs, answers the questions, and
            gets sharper the longer it knows you.
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
              Every run, read.
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
                  Quicker than an easy run usually lives for you. 4:58/km, about
                  15s/km faster than your usual easy. HR stayed low, so nothing
                  physical. But the plan wanted easy to be easy.
                </p>
                <p>
                  Two things. You mentioned the calf on Tuesday. Easy runs are
                  where you bank that signal, and 4:58 is harder to justify if
                  the calf&rsquo;s still talking.{" "}
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

function MoreThanTheDebrief() {
  return (
    <section className="border-b rule">
      <div className="mx-auto max-w-[1180px] px-6 md:px-10 py-20 md:py-28">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-10 md:gap-20 items-center">
          <div className="max-w-[42ch]">
            <p className="text-[13px] font-medium text-[color:var(--color-ink-muted)] uppercase tracking-[0.04em]">
              Between every debrief
            </p>
            <h2
              className="mt-4 text-[color:var(--color-ink)]"
              style={{
                fontFamily: "var(--font-serif)",
                fontWeight: 450,
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
                fontSize: "clamp(1.75rem, 3vw, 2.5rem)",
              }}
            >
              There&rsquo;s more than the read after the run.
            </h2>
            <p className="mt-5 prose-serif text-[color:var(--color-ink-muted)]">
              Weekly reviews in context. And whenever you want to ask something,
              you just ask.
            </p>
          </div>

          <ChatExample />
        </div>
      </div>
    </section>
  );
}

function ChatExample() {
  return (
    <div className="max-w-[52ch] space-y-3">
      <div className="flex justify-end">
        <div
          className="inline-block rounded-[14px] rounded-br-[4px] bg-[color:var(--color-accent)] text-[color:var(--color-accent-ink)] px-4 py-2.5 text-[15px] leading-snug max-w-[44ch]"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          Should I swap tomorrow&rsquo;s tempo given the calf?
        </div>
      </div>
      <p className="text-[13px] text-[color:var(--color-ink-subtle)] text-right" style={{ fontFamily: "var(--font-sans)" }}>
        Not a question a plan can answer.
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

function TheMoat() {
  const stages = [
    {
      label: "Week 1",
      line: "Reads your runs. Notices what&rsquo;s fast and what&rsquo;s not. Catches the obvious stuff.",
    },
    {
      label: "Month 3",
      line: "Knows your easy pace isn&rsquo;t the book&rsquo;s easy pace. Remembers the calf from February.",
    },
    {
      label: "Month 12",
      line: "Knows which races matter. Knows the kid, the sleep, the patterns you didn&rsquo;t know you had.",
    },
  ];

  return (
    <section className="bg-[color:var(--color-surface)] border-b rule">
      <div className="mx-auto max-w-[1180px] px-6 md:px-10 py-24 md:py-36">
        <div className="max-w-[52ch]">
          <p className="text-[13px] font-medium text-[color:var(--color-ink-muted)] uppercase tracking-[0.04em]">
            The hidden part
          </p>
          <h2 className="display-section text-[color:var(--color-ink)] mt-4">
            Coach Casey gets sharper the longer it knows you.
          </h2>
        </div>

        <div className="mt-14 md:mt-20 grid grid-cols-1 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-12 md:gap-20 items-start">
          <div className="prose-serif text-[color:var(--color-ink-muted)] space-y-6 max-w-[58ch]">
            <p>
              Your first week, Coach Casey is useful. It reads your runs,
              notices what&rsquo;s fast and what&rsquo;s not, catches the
              obvious stuff.
            </p>
            <p>
              Your third month, it&rsquo;s different. It knows your easy pace
              isn&rsquo;t the book&rsquo;s easy pace. It remembers the calf from
              February and brings it up when you go quick on a Tuesday. It knows
              which races matter and which are rehearsals. It knows you had a
              kid six months ago and you&rsquo;re still finding your old sleep.
            </p>
            <p className="text-[color:var(--color-ink)]">
              None of that&rsquo;s in your Strava data. It&rsquo;s in the slow
              accumulation of everything you&rsquo;ve told Coach Casey along the
              way. That&rsquo;s the part that compounds. That&rsquo;s the part
              that doesn&rsquo;t exist anywhere else.
            </p>
          </div>

          <ol className="space-y-6 md:space-y-0 md:border-l rule-strong md:pl-10">
            {stages.map((s, i) => (
              <li
                key={s.label}
                className={`md:py-6 ${i > 0 ? "md:border-t rule" : ""}`}
              >
                <p
                  className="text-[12px] font-medium text-[color:var(--color-accent)] uppercase tracking-[0.12em]"
                >
                  {s.label}
                </p>
                <p
                  className="mt-3 text-[color:var(--color-ink)] max-w-[34ch]"
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontStyle: "italic",
                    fontSize: "clamp(1.0625rem, 1.2vw, 1.125rem)",
                    lineHeight: 1.45,
                  }}
                  dangerouslySetInnerHTML={{ __html: s.line }}
                />
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

function WhoItsFor() {
  const segments = [
    { label: "From a book", example: "Pfitz, Hansons, Daniels." },
    { label: "From a coach", example: "The block they wrote for you." },
    { label: "From an app", example: "Runna, TrainingPeaks, Garmin." },
    { label: "From a group", example: "The sessions you show up to each week." },
  ];

  return (
    <section className="border-b rule">
      <div className="mx-auto max-w-[1180px] px-6 md:px-10 py-24 md:py-32">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-10 md:gap-20 items-start">
          <div>
            <p className="text-[13px] font-medium text-[color:var(--color-ink-muted)] uppercase tracking-[0.04em]">
              Who it&rsquo;s for
            </p>
            <h2 className="display-section text-[color:var(--color-ink)] mt-4">
              Anyone following a plan.
            </h2>
            <p className="mt-6 prose-serif text-[color:var(--color-ink-muted)] max-w-[38ch]">
              If you&rsquo;re showing up to the runs, you&rsquo;ve done the hard
              part. The plan can come from anywhere.
            </p>
          </div>

          <ul className="divide-y rule border-y rule">
            {segments.map((s) => (
              <li
                key={s.label}
                className="py-5 grid grid-cols-[minmax(0,14ch)_1fr] gap-6 items-baseline"
              >
                <span
                  className="text-[color:var(--color-ink)]"
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontWeight: 500,
                    fontSize: "1.0625rem",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {s.label}
                </span>
                <span className="text-[15px] text-[color:var(--color-ink-muted)]">
                  {s.example}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-14 md:mt-16 prose-serif text-[color:var(--color-ink-subtle)] max-w-[58ch]">
          Not the thing to write your training, pump you up, or replace a coach
          who already watches every run. Coach Casey sits alongside what
          you&rsquo;ve got.
        </p>
      </div>
    </section>
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
        "Upload your plan, paste a block, or just describe the race and how you&rsquo;re getting there. The more Coach Casey knows, the sharper the reads.",
    },
    {
      n: "3",
      title: "Get your debriefs. Get your weekly reviews. Ask the questions.",
      body:
        "Coach Casey writes after every run, reads your whole week at the end of it, and answers whatever you want to bring to it. Uses your actual data, your plan, and everything you&rsquo;ve told it.",
    },
  ];

  return (
    <section id="how" className="bg-[color:var(--color-surface)] border-b rule">
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

function Pricing() {
  return (
    <section id="pricing" className="border-b rule">
      <div className="mx-auto max-w-[1180px] px-6 md:px-10 py-24 md:py-36">
        <div className="max-w-[46ch]">
          <p className="text-[13px] font-medium text-[color:var(--color-ink-muted)] uppercase tracking-[0.04em]">
            Pricing
          </p>
          <h2 className="display-section text-[color:var(--color-ink)] mt-4">
            Fair for serious runners.
          </h2>
          <p className="mt-6 prose-serif text-[color:var(--color-ink-muted)]">
            Priced against a human coach, not against a running app. Less than
            one coaching session a month, every month.
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
            recommended
          />
        </div>

        <p className="mt-10 prose-serif text-[color:var(--color-ink-muted)] max-w-[58ch]">
          Annual is priced to keep you through the window where Coach Casey gets
          sharpest. The first three months are already useful. Month six is when
          the memory really earns its keep.
        </p>

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
  recommended,
}: {
  label: string;
  amount: string;
  period: string;
  note: string;
  highlight?: string;
  dividerLeft?: boolean;
  recommended?: boolean;
}) {
  return (
    <div className={`py-10 md:py-14 md:pl-10 md:pr-10 ${dividerLeft ? "md:border-l rule-strong md:pl-10" : "md:pl-0"}`}>
      <div className="flex items-center gap-3">
        <p className="text-[12px] font-medium text-[color:var(--color-ink-subtle)] uppercase tracking-[0.12em]">
          {label}
        </p>
        {recommended && (
          <span className="text-[10px] font-medium text-[color:var(--color-accent)] uppercase tracking-[0.14em] border border-[color:var(--color-accent)] rounded-full px-2 py-0.5">
            Recommended
          </span>
        )}
      </div>
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
      a: "No. Coach Casey reads your runs, remembers the pattern, and answers your questions. Your coach decides the programme and the big calls. If anything, the debriefs give your coach a sharper starting point.",
    },
    {
      q: "What if I don't have a coach? Or I'm following a book plan, an app plan, or a group plan?",
      a: "Coach Casey works with all of those. It needs a plan of some sort to read against, but the plan can come from anywhere. Book plan, Runna, TrainingPeaks, your coach, a running group block. It's all good. You can even just describe what you're training for in a few sentences, and Coach Casey will work with that until you've got something more structured.",
    },
    {
      q: "How is this different from Strava or Runna?",
      a: "Strava records the run. Runna writes the plan. Coach Casey does neither. It reads your runs, weighs them against your plan, your history, and the life context you've given it, and answers your questions about all of it. The longer you use it, the sharper it gets, because it actually remembers.",
    },
    {
      q: "Where does my data go?",
      a: "Strava data comes in read-only through their API. Your runs, plan, and chat history are stored on Supabase, in Sydney. Coach Casey uses large language models to write debriefs and respond to you; your data is never used to train them.",
    },
    {
      q: "What does the trial include?",
      a: "14 days, no card required, everything enabled. Connect Strava, upload a plan if you've got one, get debriefs, weekly reviews, and open chat. If it isn't clicking by day 10, it probably isn't for you.",
    },
    {
      q: "Can I cancel anytime?",
      a: "Yes, from your account page. No claw-backs on the annual plan. Unused months refund automatically, pro-rata.",
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
          Fourteen days, no card.
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
      <div className="mx-auto max-w-[1180px] px-6 md:px-10 py-10 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-[13px] text-[color:var(--color-ink-subtle)]">
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
          <span className="ml-auto">© 2026</span>
        </div>
        <p className="text-[12px] text-[color:var(--color-ink-subtle)]">
          Built by Jason Gauci in Sydney. Founder of{" "}
          <a
            href="https://themarathonclinic.com"
            className="underline underline-offset-2 hover:text-[color:var(--color-ink)] transition-colors duration-150"
          >
            The Marathon Clinic
          </a>
          .
        </p>
      </div>
    </footer>
  );
}
