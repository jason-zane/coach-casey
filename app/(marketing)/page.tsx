import Link from "next/link";
import type { ReactNode } from "react";

export default function Home() {
  return (
    <div className="cc-shell flex flex-col flex-1">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <SampleDebrief />
        <PlansCantKnow />
        <Moat />
        <Memory />
        <WhoItsFor />
        <HowItWorks />
        <Pricing />
        <Faq />
        <WhoBuilt />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

function Section({
  id,
  tone = "paper",
  kicker,
  headline,
  stand,
  children,
}: {
  id?: string;
  tone?: "paper" | "surface";
  kicker?: ReactNode;
  headline?: ReactNode;
  stand?: ReactNode;
  children: ReactNode;
}) {
  const cls = "cc-section" + (tone === "surface" ? " is-surface" : "");
  return (
    <section id={id} className={cls}>
      <div className="cc-container">
        <div className="cc-grid">
          <header className="cc-rail">
            {kicker && <span className="cc-kicker">{kicker}</span>}
            {headline && <h2>{headline}</h2>}
            {stand && <p className="cc-stand">{stand}</p>}
          </header>
          <div className="cc-body">{children}</div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

function SiteHeader() {
  return (
    <header className="cc-header">
      <div className="cc-container">
        <div className="cc-header-inner">
          <Link className="cc-wordmark" href="/">
            Coach Casey
          </Link>
          <nav className="cc-nav" aria-label="primary">
            <Link href="#how">How it works</Link>
            <Link href="#pricing">Pricing</Link>
            <Link href="#faq">FAQ</Link>
            <Link href="/signin">Sign in</Link>
            <Link className="cc-btn cc-btn-sm cc-nav-cta" href="/signup">
              Start free trial
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="cc-hero">
      <div className="cc-container">
        <div className="cc-hero-grid">
          <div>
            <p className="cc-hero-eyebrow">
              <span className="cc-tick" aria-hidden="true" />
              For marathon runners
            </p>
            <h1 className="rise rise-1">
              Training plans know <em>the run.</em>
              <br />
              <span className="cc-hero-plum">Coach Casey</span> knows the runner.
            </h1>
          </div>
          <aside className="cc-hero-aside rise rise-2">
            <p>
              Connect Strava. Keep the plan you&rsquo;ve already got. Coach
              Casey reads every run, remembers the season, and writes back like
              someone who&rsquo;s actually paying attention.
            </p>
            <div className="cc-cta-row rise rise-3">
              <Link className="cc-btn" href="/signup">
                Start 14-day free trial
              </Link>
              <Link className="cc-btn-ghost" href="#how">
                See how it works
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

function SampleDebrief() {
  return (
    <Section
      tone="surface"
      kicker="After the run"
      headline={
        <>
          A debrief, <em>written.</em>
        </>
      }
      stand="Not a summary. Not a scoreboard. A read on what actually happened, in the voice of a coach who's been paying attention."
    >
      <article className="cc-debrief">
        <p className="cc-debrief-kicker">
          <span className="cc-debrief-kicker-accent">Debrief</span> · Thursday
        </p>
        <h3 className="cc-debrief-h">10 km around the park</h3>
        <dl className="cc-debrief-metrics">
          <div>
            <dt>Pace</dt>
            <dd>
              4:58<span>/km</span>
            </dd>
          </div>
          <div>
            <dt>HR</dt>
            <dd>
              142<span>bpm</span>
            </dd>
          </div>
          <div>
            <dt>Distance</dt>
            <dd>
              10.0<span>km</span>
            </dd>
          </div>
          <div>
            <dt>Week</dt>
            <dd>
              42<span>km</span>
            </dd>
          </div>
        </dl>
        <div className="cc-debrief-prose">
          <p>
            Quicker than an easy run usually lives for you. 4:58/km, about
            15s/km faster than your usual easy. HR stayed low, so nothing
            physical. But the plan wanted easy to be easy.
          </p>
          <p>
            You mentioned the calf on Tuesday. Easy runs are where you bank
            that signal, and 4:58 is harder to justify if the calf&rsquo;s
            still talking. <span className="accent">Not my call</span>, but
            worth sitting with before tomorrow.
          </p>
        </div>
      </article>
    </Section>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

function PlansCantKnow() {
  return (
    <Section
      kicker="What a plan can't know"
      headline={
        <>
          The life <em>around</em> the runs.
        </>
      }
      stand="A plan is a prescription. It can't read what came before, what came after, or the day you actually had."
    >
      <p className="cc-lede">
        A plan tells you Tuesday is a tempo. It can&rsquo;t know the calf has
        been niggling since the long run, that you&rsquo;ve got a work trip
        Thursday, that the kids haven&rsquo;t been sleeping, or that race day
        is the reason any of this matters.{" "}
        <span className="cc-accent">
          Coach Casey holds the rest of the picture, and brings it to every
          read.
        </span>
      </p>
      <div className="cc-chat">
        <div className="cc-chat-user">
          Should I swap tomorrow&rsquo;s tempo given the calf?
        </div>
        <div className="cc-chat-casey">
          <p>
            Plan wants 8&times;3min tempo. But you mentioned the calf on
            Tuesday, and you&rsquo;ve got the work trip this week. Not a great
            week to push through something that&rsquo;s already talking.
          </p>
          <p>
            I&rsquo;d swap for an easy 45 and save tempo for Saturday.{" "}
            <span className="cc-accent">Your call.</span>
          </p>
        </div>
      </div>
    </Section>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

function Moat() {
  return (
    <Section
      tone="surface"
      kicker="The hidden part"
      headline={<>Sharper, the longer it knows you.</>}
      stand="Most of what makes a coach good isn't in your Strava data. It compounds."
    >
      <p className="cc-lede">
        The first month is useful. The third is sharp. By month twelve, Coach
        Casey knows things about your running that you&rsquo;d struggle to
        write down.
      </p>
      <div className="cc-timeline">
        <div className="cc-timeline-row">
          <span className="cc-timeline-when">Week 1</span>
          <p className="cc-timeline-said">
            Reads your runs. Catches the obvious.
          </p>
        </div>
        <div className="cc-timeline-row">
          <span className="cc-timeline-when">Month 3</span>
          <p className="cc-timeline-said">
            Knows your <em>easy</em> isn&rsquo;t the book&rsquo;s easy.
            Remembers the calf from February. Knows the kids have been sick.
          </p>
        </div>
        <div className="cc-timeline-row">
          <span className="cc-timeline-when">Month 12</span>
          <p className="cc-timeline-said">
            Knows which races matter. Knows the kid, the sleep, the work
            patterns, the way you fall apart in February. The patterns you
            didn&rsquo;t know you had.
          </p>
        </div>
      </div>
    </Section>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

function Memory() {
  return (
    <Section
      kicker="Memory, in practice"
      headline={
        <>
          It remembers what <em>you&rsquo;d</em> remember.
        </>
      }
      stand="Months later, in the middle of a different conversation, the right detail comes back."
    >
      <div className="cc-memory">
        <div className="cc-memory-block">
          <span className="cc-memory-when">April 14</span>
          <p className="cc-memory-said">
            &ldquo;Pulled up sore on the left calf around the 8k mark. Backed
            off.&rdquo;
          </p>
        </div>
        <div className="cc-memory-arrow">Four months later</div>
        <div className="cc-memory-block">
          <span className="cc-memory-when is-recall">
            August 22 · long run debrief
          </span>
          <p className="cc-memory-said">
            &ldquo;Calf chatter on the descent at 19k. Same side as April.
            Worth keeping an eye on, not worth panicking about.&rdquo;
          </p>
        </div>
      </div>
    </Section>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

function WhoItsFor() {
  return (
    <Section
      tone="surface"
      kicker="Who it's for"
      headline={<>Built for runners with a goal race.</>}
      stand="Coach Casey sits alongside the plan you've already got, written by you, by a coach, by an app, by anyone."
    >
      <ul className="cc-who-list">
        <li>
          <span className="cc-who-label">Marathon runners</span>
          <span className="cc-who-detail">
            With a date on the calendar and a plan to get there.
          </span>
        </li>
        <li>
          <span className="cc-who-label">Already on Strava</span>
          <span className="cc-who-detail">
            It&rsquo;s the only feed Coach Casey reads. No new app on the run.
          </span>
        </li>
        <li>
          <span className="cc-who-label">Following any plan</span>
          <span className="cc-who-detail">
            From a coach, a group, an app, a chatbot, or yourself.
          </span>
        </li>
        <li>
          <span className="cc-who-label">After a read, not a rewrite</span>
          <span className="cc-who-detail">
            Coach Casey doesn&rsquo;t write your training. It reads what
            you&rsquo;re doing.
          </span>
        </li>
      </ul>
      <p className="cc-meta">
        Not the right fit if you don&rsquo;t have a goal race in front of you,
        or if you already have a coach who watches every run. Coach Casey
        complements that work. It doesn&rsquo;t replace it.
      </p>
    </Section>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

function HowItWorks() {
  return (
    <Section
      id="how"
      kicker="How it works"
      headline={<>Three things, once. Then nothing.</>}
      stand="Five minutes of setup, then keep running the way you already were."
    >
      <ol className="cc-steps">
        <li>
          <span className="cc-step-num">Step 01</span>
          <div className="cc-step-body">
            <h3>Connect Strava and share what you&rsquo;re training for.</h3>
            <p>
              Upload the plan, paste it, describe it. Whatever you&rsquo;ve
              got. Five minutes. Once.
            </p>
          </div>
        </li>
        <li>
          <span className="cc-step-num">Step 02</span>
          <div className="cc-step-body">
            <h3>Run the runs you were going to run.</h3>
            <p>
              No new app during the workout. No daily check-in. Coach Casey
              reads each run as it comes in, against the plan and everything
              that came before.
            </p>
          </div>
        </li>
        <li>
          <span className="cc-step-num">Step 03</span>
          <div className="cc-step-body">
            <h3>Read what Coach Casey has to say.</h3>
            <p>
              A debrief after every run. A review at the end of every week.
              Chat, whenever you want to dig in.
            </p>
          </div>
        </li>
      </ol>
    </Section>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

function Pricing() {
  return (
    <Section
      id="pricing"
      tone="surface"
      kicker="Pricing"
      headline={<>Less than one coaching session a month.</>}
      stand="Annual is what we recommend. Monthly is there if you want to try it that way."
    >
      <div className="cc-price">
        <p className="cc-price-headline">
          <span className="cc-price-amount">A$199</span> a year.{" "}
          <em>Roughly A$16.60 a month.</em>
        </p>
        <div className="cc-price-rows">
          <div className="cc-price-row">
            <span className="cc-price-label">Annual, our recommendation</span>
            <span className="cc-price-val">A$199 / yr</span>
          </div>
          <div className="cc-price-row">
            <span className="cc-price-label">
              Monthly, same product, billed each month
            </span>
            <span className="cc-price-val">A$24 / mo</span>
          </div>
          <div className="cc-price-row">
            <span className="cc-price-label">14-day trial</span>
            <span className="cc-price-val">No card required</span>
          </div>
        </div>
        <p className="cc-price-foot">
          Annual is priced to keep you through the window where Coach Casey
          gets sharpest. The first three months are useful. Month six is when
          the memory really earns its keep. Monthly is a fine way to try it
          past the trial; switch to annual any time.
        </p>
        <p className="cc-price-foot">
          Cancel monthly any time. Annual is a year commitment, but if you
          cancel before it&rsquo;s up, unused months refund pro-rata,
          automatically. No claw-backs, no retention emails.
        </p>
        <div className="cc-cta-row">
          <Link className="cc-btn" href="/signup">
            Start 14-day free trial
          </Link>
        </div>
      </div>
    </Section>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

function Faq() {
  const items: { q: string; a: string; defaultOpen?: boolean }[] = [
    {
      q: "Will Coach Casey write my training plan?",
      a: "No. Coach Casey reads what you're already doing. Your plan, your runs, what's been going on around them. Then writes back like a coach paying attention. The plan stays yours, or your coach's, or your group's.",
      defaultOpen: true,
    },
    {
      q: "Do I need to log workouts somewhere new?",
      a: "Strava is the only feed Coach Casey reads. If your run shows up there, it gets debriefed. No second app on the run, no morning check-in.",
    },
    {
      q: "What if my plan changes mid-block?",
      a: "Update what you tell Coach Casey, the same way you'd tell a coach. The next debrief reads against the new plan. Memory of the old block stays. Pacing, fatigue patterns, what worked.",
    },
    {
      q: "How does it get sharper over time?",
      a: "It accumulates the context that Strava data alone can't capture: which races mattered, which weeks bent, what your easy actually looks like in July. Three months in, you'll feel the difference. By month six, the recall starts surprising you.",
    },
    {
      q: "Where does my data go?",
      a: "Strava data comes in read-only through their API. Your runs, plan, and chat history are stored on Supabase, in Sydney. Coach Casey uses large language models to write debriefs and respond to you; your data is never used to train them.",
    },
    {
      q: "Can I cancel anytime?",
      a: "14 days, no card required, everything enabled. Cancel monthly any time. Annual is a year commitment, but if you cancel before it's up, unused months refund pro-rata, automatically. No claw-backs, no retention emails.",
    },
  ];

  return (
    <Section
      id="faq"
      kicker="FAQ"
      headline={<>Things runners ask first.</>}
      stand="The questions that come up before a trial. Answered honestly."
    >
      <div className="cc-faq">
        {items.map((it) => (
          <details
            key={it.q}
            className="cc-faq-item"
            open={it.defaultOpen}
          >
            <summary className="cc-faq-summary">
              <span>{it.q}</span>
              <span className="cc-faq-plus" aria-hidden="true">
                +
              </span>
            </summary>
            <div className="cc-faq-body">
              <p>{it.a}</p>
            </div>
          </details>
        ))}
      </div>
    </Section>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

function WhoBuilt() {
  return (
    <Section
      tone="surface"
      kicker="Who built it"
      headline={<>Built by a runner who got tired of generic.</>}
      stand={
        <>
          Jason Hunt. Sydney. Founder of{" "}
          <a
            href="https://themarathonclinic.com"
            style={{
              color: "inherit",
              textDecoration: "underline",
              textUnderlineOffset: 2,
            }}
          >
            The Marathon Clinic
          </a>
          . 2:24 marathoner.
        </>
      }
    >
      <p className="cc-lede">
        Coach Casey started as a private tool I built to debrief my own runs
        while training for the Melbourne Marathon. I&rsquo;m a coach.
        I&rsquo;m also a coached athlete. I wanted the read on each run that
        my own coach gives me, specific and in context, between sessions, on
        every run.
      </p>
      <p>
        It&rsquo;s a one-person product so far. I read every support email
        myself. I use Coach Casey on every run I do, including the ones
        I&rsquo;d rather forget.
      </p>
    </Section>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

function FinalCta() {
  return (
    <section id="cta" className="cc-final">
      <div className="cc-container">
        <h2>
          Try it through one training block. <em>See if it earns its keep.</em>
        </h2>
        <p className="cc-final-sub">
          14 days free. No card required. If it isn&rsquo;t sharper than what
          you&rsquo;ve got, leave. We won&rsquo;t make it weird.
        </p>
        <div className="cc-final-cta">
          <Link className="cc-btn" href="/signup">
            Start free trial
          </Link>
          <span className="cc-foot-note">
            Connects to Strava in under a minute.
          </span>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

function SiteFooter() {
  return (
    <footer className="cc-footer">
      <div className="cc-container">
        <div className="cc-footer-row">
          <span>© 2026 Coach Casey, Sydney</span>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="#faq">FAQ</Link>
          <span className="cc-footer-spacer">
            Built by Jason Hunt, founder of{" "}
            <a href="https://themarathonclinic.com">The Marathon Clinic</a>.
          </span>
        </div>
        <p className="cc-footer-fineprint">
          Strava is a trademark of Strava, Inc. Coach Casey is not affiliated
          with Strava.
        </p>
      </div>
    </footer>
  );
}
