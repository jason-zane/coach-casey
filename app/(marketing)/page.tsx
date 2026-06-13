import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { SITE_URL } from "@/lib/site-url";
import { KmMeter, KmRail, RevealFx, ThreadFx } from "./fx";

/* ════════════════════════════════════════════════════════════════════════
 * THE COACH'S PEN
 * Casey reads your running like a text, so the site is a read text:
 * print typography, marked up in plum pen as you scroll. The scroll bar
 * is a marathon: 0.0 → 42.2 km.
 * ════════════════════════════════════════════════════════════════════════ */

const DESCRIPTION =
  "Connect Strava, keep your marathon plan. Coach Casey reads every run, remembers your season, and writes back like a coach who's paying attention. 14 days free.";

export const metadata: Metadata = {
  title: {
    absolute: "Coach Casey | AI running coach for marathoners on Strava",
  },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Coach Casey",
    title: "Plans know the run. Coach Casey knows the runner.",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Plans know the run. Coach Casey knows the runner.",
    description: DESCRIPTION,
  },
};

/* Structured data: the site, the application (with both offers), and the
 * FAQ. Single graph, one script tag. */
function structuredData() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: "Coach Casey",
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_URL}/#app`,
        name: "Coach Casey",
        url: SITE_URL,
        description: DESCRIPTION,
        applicationCategory: "HealthApplication",
        operatingSystem: "Web",
        creator: {
          "@type": "Person",
          name: "Jason Hunt",
        },
        offers: [
          {
            "@type": "Offer",
            name: "Annual",
            price: "199",
            priceCurrency: "AUD",
          },
          {
            "@type": "Offer",
            name: "Monthly",
            price: "24",
            priceCurrency: "AUD",
          },
        ],
      },
      {
        "@type": "FAQPage",
        "@id": `${SITE_URL}/#faq-schema`,
        mainEntity: FAQ_ITEMS.map((it) => ({
          "@type": "Question",
          name: it.q,
          acceptedAnswer: { "@type": "Answer", text: it.a },
        })),
      },
    ],
  };
}

export default function Home() {
  return (
    <div className="rd-shell">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData()).replace(/</g, "\\u003c"),
        }}
      />
      <Header />
      <main>
        <Hero />
        <Artifact />
        <PlansCantKnow />
        <Memory />
        <Compounds />
        <HowItWorks />
        <Fit />
        <Pricing />
        <Faq />
        <Colophon />
        <FinalCta />
      </main>
      <Footer />
      <KmRail />
      <RevealFx />
      <ThreadFx />
    </div>
  );
}

/* ── pen marks ─────────────────────────────────────────────────────── */

function delayStyle(d?: string) {
  return d ? ({ "--d": d } as CSSProperties) : undefined;
}

/* an open loop, the way a real pen never quite closes the circle */
function CircleMark({ delay }: { delay?: string }) {
  return (
    <svg
      className="rd-draw"
      viewBox="0 0 100 42"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={delayStyle(delay)}
    >
      <path
        pathLength={1}
        vectorEffect="non-scaling-stroke"
        d="M77 4.5 C91 7.5 98.5 15 97 23.5 C94.5 34.5 70 41 45 39.5 C19.5 38 2 30.5 2.5 19.5 C3 8.5 25 1.5 50 2 C63 2.2 76 3.5 86 7"
      />
    </svg>
  );
}

function PenUnder({
  children,
  delay,
}: {
  children: ReactNode;
  delay?: string;
}) {
  return (
    <span className="rd-pen-under">
      {children}
      <svg
        className="rd-draw"
        viewBox="0 0 100 10"
        preserveAspectRatio="none"
        aria-hidden="true"
        style={delayStyle(delay)}
      >
        <path
          pathLength={1}
          vectorEffect="non-scaling-stroke"
          d="M2 7.5 C18 3.5 40 8 58 5 C72 2.8 88 6 98 3.8"
        />
      </svg>
    </span>
  );
}

/* a gently curved arrow whose tip points left, into whatever it annotates */
function ArrowNote({ delay }: { delay?: string }) {
  return (
    <svg
      className="rd-draw rd-note-arrow"
      viewBox="0 0 60 32"
      aria-hidden="true"
      style={delayStyle(delay)}
    >
      <path
        pathLength={1}
        d="M58 8 C42 4 24 8 8 17 M8 17 L18 10.5 M8 17 L18 22.5"
      />
    </svg>
  );
}

/* a short pen arrow pointing up at the line above, for the phone build */
function ArrowUp({ delay }: { delay?: string }) {
  return (
    <svg
      className="rd-draw rd-arrow-up"
      viewBox="0 0 26 40"
      aria-hidden="true"
      style={delayStyle(delay)}
    >
      <path
        pathLength={1}
        d="M8 37 C4.5 24 8 13 17 4 M17 4 L9.5 7.5 M17 4 L16.5 12"
      />
    </svg>
  );
}

function Tick({ delay }: { delay?: string }) {
  return (
    <svg
      className="rd-tick rd-draw"
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={delayStyle(delay)}
    >
      <path
        pathLength={1}
        d="M4.5 13 C7.5 14.5 9.5 17 10.5 18.5 C13 12 16.5 7 21 4.5"
      />
    </svg>
  );
}

function Cross({ delay }: { delay?: string }) {
  return (
    <svg
      className="rd-tick is-cross rd-draw"
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={delayStyle(delay)}
    >
      <path pathLength={1} d="M5.5 5.5 L18.5 18.5 M18.5 6 L6 18.5" />
    </svg>
  );
}

/* ── header ────────────────────────────────────────────────────────── */

function Header() {
  return (
    <header className="rd-header">
      <div className="rd-wrap">
        <div className="rd-header-inner">
          <Link className="rd-wordmark" href="/">
            Coach <em>Casey</em>
          </Link>
          <KmMeter />
          <nav className="rd-nav" aria-label="primary">
            <a href="#how">How it works</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
            <a href="/signin" className="rd-nav-keep">
              Sign in
            </a>
            <Link className="rd-btn rd-btn-sm rd-nav-keep" href="/signup">
              Start free trial
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}

/* ── hero ──────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="rd-hero" data-reveal>
      <div className="rd-wrap rd-hero-grid">
        <p className="rd-mono rd-hero-eyebrow rd-rise" style={delayStyle("0.05s")}>
          For marathon runners with a date on the calendar
        </p>
        {/* the margin note lives beside the h1, not inside it: the heading
          * stays clean for crawlers and screen readers */}
        <div className="rd-hero-h rd-rise" style={delayStyle("0.12s")}>
          <h1>
            <span className="rd-muted-line">
              <span className="rd-nw">Plans know</span>{" "}
              <em className="rd-nw">the run.</em>
            </span>
            <br />
            <span className="rd-nw">Casey knows</span>{" "}
            <span className="rd-circled">
              the runner.
              <CircleMark delay="1s" />
            </span>
          </h1>
          <span
            className="rd-hand rd-hero-note-inline rd-rise"
            style={delayStyle("1.6s")}
            aria-hidden="true"
          >
            <ArrowNote delay="1.9s" />
            <span>
              the part every
              <br />
              app skips
            </span>
          </span>
        </div>
        <p
          className="rd-hand rd-hero-note-m rd-only-m rd-rise"
          style={delayStyle("1.4s")}
          aria-hidden="true"
        >
          <ArrowUp delay="1.7s" />
          <span>the part every app skips</span>
        </p>
        <div className="rd-hero-aside">
          <p className="rd-hero-copy rd-rise" style={delayStyle("0.25s")}>
            Connect Strava. Keep the plan you&rsquo;ve already got. Coach Casey
            reads every run, remembers the season, and{" "}
            <strong>
              writes back like someone who&rsquo;s actually paying attention.
            </strong>
          </p>
          <div className="rd-hero-actions rd-rise" style={delayStyle("0.38s")}>
            <div className="rd-cta-row">
              <Link className="rd-btn" href="/signup">
                Start 14-day free trial
              </Link>
              <a className="rd-btn-ghost" href="#exhibit">
                Read a debrief
              </a>
            </div>
            <span className="rd-cta-note">
              No card. No new app on the run.
            </span>
          </div>
        </div>
      </div>
      <PaceTrace />
    </section>
  );
}

/* the long run, traced along the hero floor */
function PaceTrace() {
  return (
    <svg
      className="rd-trace rd-only-d"
      viewBox="0 0 1600 240"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
    >
      <path
        className="rd-trace-line"
        pathLength={1}
        d="M0 178 C80 168 140 150 220 154 C300 158 340 182 420 178 C500 174 560 140 640 138 C720 136 760 168 840 170 C920 172 980 132 1060 126 C1140 120 1180 150 1260 156 C1340 162 1420 132 1500 122 C1550 116 1580 118 1600 116"
      />
      {[
        [200, "5k"],
        [400, "10k"],
        [600, "15k"],
        [800, "20k"],
        [1000, "25k"],
        [1200, "30k"],
        [1400, "35k"],
      ].map(([x, label]) => (
        <g key={label}>
          <line
            className="rd-trace-tick"
            x1={x as number}
            y1={206}
            x2={x as number}
            y2={216}
          />
          <text x={(x as number) - 8} y={232}>
            {label}
          </text>
        </g>
      ))}
      <circle className="rd-trace-you" cx={1235} cy={154} r={5.5} />
      <text className="rd-trace-hand" x={1130} y={108} transform="rotate(-2 1130 108)">
        km 32. the bit that bites.
      </text>
    </svg>
  );
}

/* ── section scaffolding ───────────────────────────────────────────── */

function Section({
  id,
  deep,
  chapter,
  title,
  headline,
  stand,
  children,
}: {
  id?: string;
  deep?: boolean;
  chapter?: string;
  title: string;
  headline: ReactNode;
  stand?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={`rd-section${deep ? " is-deep" : ""}`}
    >
      <div className="rd-wrap">
        <header className="rd-section-head" data-reveal>
          <p className="rd-chapter rd-rise">
            {chapter && <span className="rd-chapter-no">{chapter}</span>}
            <span className="rd-chapter-title">{title}</span>
          </p>
          <h2 className="rd-h2 rd-rise" style={delayStyle("0.08s")}>
            {headline}
          </h2>
          {stand && (
            <p className="rd-stand rd-rise" style={delayStyle("0.16s")}>
              {stand}
            </p>
          )}
        </header>
        <div className="rd-section-body">{children}</div>
      </div>
    </section>
  );
}

/* ── exhibit A: the annotated debrief ──────────────────────────────── */

function Artifact() {
  return (
    <Section
      id="exhibit"
      deep
      title="Exhibit A · after Thursday's run"
      headline={
        <>
          After the run, <em>a read.</em>
        </>
      }
      stand="What the run actually meant, not just the numbers on the watch. From a coach who's been paying attention, seven minutes after it synced."
    >
      <div className="rd-artifact-zone" data-reveal>
        <article className="rd-sheet rd-rise">
          <span className="rd-stamp">Read by Casey · 06:31</span>
          <p className="rd-sheet-meta rd-mono">
            <span>Strava sync · Thu 06:24</span>
            <span className="is-pen">Debrief</span>
          </p>
          <h3 className="rd-sheet-h">10 km around the park</h3>
          <dl className="rd-metrics">
            <div>
              <dt>Pace</dt>
              <dd>
                <span className="rd-circled">
                  4:58
                  <CircleMark delay="0.7s" />
                </span>
                <small>/km</small>
              </dd>
            </div>
            <div>
              <dt>Heart rate</dt>
              <dd>
                142<small>bpm</small>
              </dd>
            </div>
            <div>
              <dt>Distance</dt>
              <dd>
                10.0<small>km</small>
              </dd>
            </div>
            <div>
              <dt>Week so far</dt>
              <dd>
                42<small>km</small>
              </dd>
            </div>
          </dl>
          <p className="rd-hand rd-sheet-note rd-only-m rd-rise" style={delayStyle("0.7s")}>
            <ArrowUp delay="0.9s" />
            <span>15s quicker than where your easy lives. on a Thursday?</span>
          </p>
          <div className="rd-sheet-prose">
            <p>
              Quicker than an easy run usually lives for you. 4:58 against a
              usual 5:13. Heart rate stayed low, so nothing physical. But{" "}
              <span className="rd-hl">the plan wanted easy to be easy.</span>
            </p>
            <p>
              You mentioned <PenUnder delay="1.3s">the calf</PenUnder>
              {" "}on Tuesday. Easy runs are where you bank that signal, and 4:58 is
              harder to justify if it&rsquo;s still talking. Not my call. But
              worth sitting with before tomorrow.
            </p>
          </div>
          <p className="rd-hand rd-sheet-note rd-only-m rd-rise" style={delayStyle("1.1s")}>
            <ArrowUp delay="1.3s" />
            <span>the calf again. April was the same side.</span>
          </p>
        </article>
        <aside className="rd-margin-note at-pace rd-hand rd-rise" style={delayStyle("0.9s")}>
          <ArrowNote delay="1.2s" />
          <span>15s quicker than where your easy lives. on a Thursday?</span>
        </aside>
        <aside className="rd-margin-note at-calf rd-hand rd-rise" style={delayStyle("1.4s")}>
          <ArrowNote delay="1.7s" />
          <span>the calf again. April was the same side.</span>
        </aside>
      </div>
    </Section>
  );
}

/* ── № 01: what a plan can't know ──────────────────────────────────── */

function PlansCantKnow() {
  return (
    <Section
      chapter="№ 01"
      title="What a plan can't know"
      headline={
        <>
          The life <em>around</em> the runs.
        </>
      }
      stand="A plan is a prescription. It can't read what came before, what came after, or the day you actually had. Casey holds the rest of the picture, and brings it to every read."
    >
      <div className="rd-convo">
        <div data-reveal>
          <ul className="rd-life-list">
            <li className="rd-rise" style={delayStyle("0s")}>
              <span className="rd-life-when">Tue</span>
              <span className="rd-life-what">
                Calf felt tight on the cooldown.
                <span className="rd-hand">noted.</span>
              </span>
            </li>
            <li className="rd-rise" style={delayStyle("0.1s")}>
              <span className="rd-life-when">Wed</span>
              <span className="rd-life-what">
                Work trip, landing late Thursday.
                <span className="rd-hand">seen.</span>
              </span>
            </li>
            <li className="rd-rise" style={delayStyle("0.2s")}>
              <span className="rd-life-when">Thu</span>
              <span className="rd-life-what">
                Kids up at five. Again.
                <span className="rd-hand">factored.</span>
              </span>
            </li>
            <li className="rd-rise" style={delayStyle("0.3s")}>
              <span className="rd-life-when">Plan says</span>
              <span className="rd-life-what">
                8 &times; 3:00 tempo, Friday.
                <span className="rd-hand">hmm.</span>
              </span>
            </li>
          </ul>
        </div>
        <div className="rd-chat" data-reveal>
          <div className="rd-chat-user rd-rise-r" style={delayStyle("0.15s")}>
            should i swap tomorrow&rsquo;s tempo given the calf?
          </div>
          <div className="rd-chat-casey rd-rise-l" style={delayStyle("0.4s")}>
            <p>
              Plan wants 8&times;3 tempo. But the calf&rsquo;s been talking
              since Tuesday and you land late tonight. Not the week to push
              through something that&rsquo;s already whispering.
            </p>
            <p>
              I&rsquo;d swap for an easy 45 and take the tempo to Saturday.{" "}
              <span className="rd-hl">Your call.</span>
            </p>
          </div>
          <span className="rd-chat-byline rd-rise" style={delayStyle("0.5s")}>
            Casey · 21:42 · read the whole season before answering
          </span>
        </div>
      </div>
    </Section>
  );
}

/* ── № 02: memory ──────────────────────────────────────────────────── */

function Memory() {
  return (
    <Section
      deep
      chapter="№ 02"
      title="Memory, in practice"
      headline={
        <>
          It remembers what <em>you&rsquo;d</em> remember.
        </>
      }
      stand="Months later, in the middle of a different conversation, the right detail comes back. Not because it was tagged. Because it mattered."
    >
      <div className="rd-memory" data-reveal>
        {/* path coordinates are computed from the cards' real positions by ThreadFx */}
        <svg className="rd-thread rd-draw rd-only-d" aria-hidden="true">
          <path pathLength={1} d="" style={delayStyle("0.5s")} />
        </svg>
        <article className="rd-mem-card is-april rd-rise" style={delayStyle("0.1s")}>
          <span className="rd-mem-when">April 14 · you, in chat</span>
          <p className="rd-mem-said">
            &ldquo;Pulled up sore on the left calf around the 8k mark. Backed
            off.&rdquo;
          </p>
        </article>
        <span className="rd-hand rd-thread-label rd-only-d rd-rise" style={delayStyle("0.9s")}>
          four months,
          <br />
          held.
        </span>
        {/* phone build: the thread becomes a drawn arrow between the
         * stacked cards */}
        <div className="rd-mem-link rd-only-m" aria-hidden="true">
          <svg className="rd-draw" viewBox="0 0 34 84">
            <path
              pathLength={1}
              d="M14 4 C24 24 8 44 17 76 M17 76 L9.5 66.5 M17 76 L24 65.5"
              style={delayStyle("0.4s")}
            />
          </svg>
          <span className="rd-hand">
            four months,
            <br />
            held.
          </span>
        </div>
        <article className="rd-mem-card is-august rd-rise" style={delayStyle("0.4s")}>
          <span className="rd-mem-when is-recall">
            August 22 · Casey, long-run debrief
          </span>
          <p className="rd-mem-said">
            &ldquo;Calf chatter on the descent at 19k. Same side as April.
            Worth keeping an eye on, not worth panicking about.&rdquo;
          </p>
        </article>
      </div>
    </Section>
  );
}

/* ── № 03: it compounds ────────────────────────────────────────────── */

function Compounds() {
  return (
    <Section
      chapter="№ 03"
      title="The hidden part"
      headline={
        <>
          Sharper, <em>the longer it knows you.</em>
        </>
      }
      stand="Most of what makes a coach good isn't in your Strava data. It compounds. The type below is doing what the product does."
    >
      <div className="rd-compound" data-reveal>
        <div className="rd-comp-row rd-rise" style={delayStyle("0s")}>
          <span className="rd-comp-when">Week 1</span>
          <p className="rd-comp-said">Reads your runs. Catches the obvious.</p>
        </div>
        <div className="rd-comp-row rd-rise" style={delayStyle("0.12s")}>
          <span className="rd-comp-when">Month 3</span>
          <p className="rd-comp-said">
            Knows your <PenUnder delay="0.9s">easy</PenUnder>
            {" "}isn&rsquo;t the book&rsquo;s easy. Remembers the calf from
            February.
          </p>
        </div>
        <div className="rd-comp-row rd-rise" style={delayStyle("0.24s")}>
          <span className="rd-comp-when">Month 12</span>
          <p className="rd-comp-said">
            Knows which races matter, the way you unravel in February,{" "}
            <em>
              <span className="rd-hl">
                the patterns you didn&rsquo;t know you had.
              </span>
            </em>
          </p>
        </div>
      </div>
    </Section>
  );
}

/* ── № 04: how it works ────────────────────────────────────────────── */

function HowItWorks() {
  return (
    <Section
      id="how"
      deep
      chapter="№ 04"
      title="How it works"
      headline={
        <>
          Three things, once. <em>Then nothing.</em>
        </>
      }
      stand="Five minutes of setup, then keep running the way you already were."
    >
      <ol className="rd-steps" data-reveal>
        <li className="rd-rise" style={delayStyle("0s")}>
          <span className="rd-step-no">01</span>
          <h3>Connect Strava. Tell Casey the goal.</h3>
          <p>
            Upload the plan, paste it, describe it. Whatever you&rsquo;ve got.
            Five minutes, once.
          </p>
        </li>
        <li className="rd-rise" style={delayStyle("0.12s")}>
          <span className="rd-step-no">02</span>
          <h3>Run the runs you were going to run.</h3>
          <p>
            No new app during the workout. No daily check-in. Casey reads each
            run as it lands, against the plan and everything before it.
          </p>
        </li>
        <li className="rd-rise" style={delayStyle("0.24s")}>
          <span className="rd-step-no">03</span>
          <h3>Read what Casey has to say.</h3>
          <p>
            A debrief after every run. A review at the end of every week. Chat,
            whenever you want to dig in.
          </p>
        </li>
      </ol>
    </Section>
  );
}

/* ── № 05: fit, honestly ───────────────────────────────────────────── */

function Fit() {
  return (
    <Section
      chapter="№ 05"
      title="Fit, stated plainly"
      headline={
        <>
          Honestly, <em>who it&rsquo;s for.</em>
        </>
      }
      stand="Coach Casey sits alongside the plan you've already got and reads every run against it. It doesn't write you a new plan. That fits some runners and not others. The honest split, below."
    >
      <div className="rd-fit">
        <div data-reveal>
          <h3>
            For you
            <span className="rd-hand">yes, go</span>
          </h3>
          <ul>
            <li className="rd-rise" style={delayStyle("0s")}>
              <Tick delay="0.35s" />
              <span>
                A marathon with a date on it
                <small>the season pointed at one start line</small>
              </span>
            </li>
            <li className="rd-rise" style={delayStyle("0.08s")}>
              <Tick delay="0.45s" />
              <span>
                Your runs land on Strava
                <small>where Casey does its reading</small>
              </span>
            </li>
            <li className="rd-rise" style={delayStyle("0.16s")}>
              <Tick delay="0.55s" />
              <span>
                A plan you mostly trust
                <small>from a coach, a group, an app, a book, yourself</small>
              </span>
            </li>
            <li className="rd-rise" style={delayStyle("0.24s")}>
              <Tick delay="0.65s" />
              <span>
                You want a read, not a rewrite
                <small>the plan stays yours, the attention is new</small>
              </span>
            </li>
          </ul>
        </div>
        <div data-reveal>
          <h3>
            Not for you
            <span className="rd-hand">truly, it&rsquo;s fine</span>
          </h3>
          <ul>
            <li className="rd-rise" style={delayStyle("0s")}>
              <Cross delay="0.35s" />
              <span>
                No race on the horizon
                <small>Casey reads a season against a goal. no goal, no read</small>
              </span>
            </li>
            <li className="rd-rise" style={delayStyle("0.08s")}>
              <Cross delay="0.45s" />
              <span>
                Your coach already hears about every run
                <small>if you debrief together three times a day, you&rsquo;re covered</small>
              </span>
            </li>
            <li className="rd-rise" style={delayStyle("0.16s")}>
              <Cross delay="0.55s" />
              <span>
                You want the plan written for you
                <small>plenty of tools do that. this isn&rsquo;t one</small>
              </span>
            </li>
            <li className="rd-rise" style={delayStyle("0.24s")}>
              <Cross delay="0.65s" />
              <span>
                Old school, off the apps
                <small>no Strava, nothing to read</small>
              </span>
            </li>
          </ul>
        </div>
      </div>
    </Section>
  );
}

/* ── № 06: pricing ─────────────────────────────────────────────────── */

function Pricing() {
  return (
    <Section
      id="pricing"
      deep
      chapter="№ 06"
      title="Pricing"
      headline={
        <>
          The price of <em>attention.</em>
        </>
      }
      stand="Annual is what we recommend. Monthly is there if you want to try it that way. Both are the same product, everything on."
    >
      <div className="rd-price-zone" data-reveal>
        <p className="rd-price-big rd-rise">
          A$199 <span className="rd-price-per">a year.</span>
        </p>
        <span className="rd-hand rd-price-scribble rd-rise" style={delayStyle("0.2s")}>
          about $16.60 a month. less than one session with a human coach.
        </span>
        <div className="rd-receipt rd-rise" style={delayStyle("0.3s")}>
          <div className="rd-receipt-row">
            <span className="lbl">Annual, our recommendation</span>
            <span className="val is-pen">A$199 / yr</span>
          </div>
          <div className="rd-receipt-row">
            <span className="lbl">Monthly, same product</span>
            <span className="val">A$24 / mo</span>
          </div>
          <div className="rd-receipt-row">
            <span className="lbl">Trial, everything enabled</span>
            <span className="val">14 days · no card</span>
          </div>
          <div className="rd-receipt-row">
            <span className="lbl">Leave annual early</span>
            <span className="val">unused months refund, automatically</span>
          </div>
        </div>
        <p className="rd-price-foot rd-rise" style={delayStyle("0.4s")}>
          Annual is priced to keep you through the window where Casey gets
          sharpest. The first three months are useful. Month six is when the
          memory really earns its keep.
        </p>
        <p className="rd-price-foot rd-rise" style={delayStyle("0.45s")}>
          Cancel monthly any time. No claw-backs, no retention emails.
        </p>
        <div className="rd-cta-row rd-rise" style={{ marginTop: 36, ...delayStyle("0.5s") }}>
          <Link className="rd-btn" href="/signup">
            Start 14-day free trial
          </Link>
        </div>
      </div>
    </Section>
  );
}

/* ── appendix: FAQ ─────────────────────────────────────────────────── */

const FAQ_ITEMS: { q: string; a: string; defaultOpen?: boolean }[] = [
  {
    q: "Will Coach Casey write my training plan?",
    a: "No. Coach Casey reads what you're already doing. Your plan, your runs, what's been going on around them. Then writes back like a coach paying attention. The plan stays yours, or your coach's, or your group's.",
    defaultOpen: true,
  },
  {
    q: "Do I need to log workouts somewhere new?",
    a: "No. If your run shows up on Strava, it gets debriefed. No second app on the run, no morning check-in.",
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
    a: "Strava data comes in through their API. The only thing written back is the verdict line, one sentence under each debriefed run's description, which you can turn off in settings with one tap. Your runs, plan, and chat history are stored on Supabase, in Tokyo. Coach Casey uses large language models to write debriefs and respond to you; your data is never used to train them.",
  },
  {
    q: "Can I cancel anytime?",
    a: "14 days, no card required, everything enabled. Cancel monthly any time. Annual is a year commitment, but if you cancel before it's up, unused months refund pro-rata, automatically. No claw-backs, no retention emails.",
  },
];

function Faq() {
  return (
    <Section
      id="faq"
      title="Appendix · asked first"
      headline={
        <>
          Asked, <em>answered.</em>
        </>
      }
      stand="The questions that come up before a trial. Answered honestly."
    >
      <div className="rd-faq" data-reveal>
        {FAQ_ITEMS.map((it, i) => (
          <details
            key={it.q}
            className="rd-faq-item rd-rise"
            style={delayStyle(`${i * 0.07}s`)}
            open={it.defaultOpen}
          >
            <summary className="rd-faq-q">
              <span className="q">{it.q}</span>
              <span className="mark" aria-hidden="true">
                +
              </span>
            </summary>
            <div className="rd-faq-a">
              <p>{it.a}</p>
            </div>
          </details>
        ))}
      </div>
    </Section>
  );
}

/* ── colophon: who built it ────────────────────────────────────────── */

function Colophon() {
  return (
    <Section
      deep
      title="Who built it"
      headline={
        <>
          Built by a runner who got tired of <em>generic.</em>
        </>
      }
    >
      <div data-reveal>
        <blockquote
          className="rd-built-quote rd-rise"
          style={delayStyle("0.05s")}
        >
          &ldquo;I wanted the read my own coach gives me. On every run, not
          just the ones we talk about.&rdquo;
        </blockquote>
        <div className="rd-built-body">
          <div className="rd-built-prose rd-rise" style={delayStyle("0.18s")}>
            <p>
              Coach Casey started as a private tool I built to debrief my own
              runs while training for the Melbourne Marathon. I&rsquo;m a
              coach. I&rsquo;m also a coached athlete. I wanted the read on
              each run that my own coach gives me, specific and in context,
              between sessions, on every run.
            </p>
            <p>
              It&rsquo;s a one-person product so far. I read every support
              email myself. I use Coach Casey on every run I do, including the
              ones I&rsquo;d rather forget.
            </p>
            <span className="rd-signature rd-hand">
              Jason Hunt, Sydney
            </span>
          </div>
          <aside className="rd-built-card rd-rise" style={delayStyle("0.3s")}>
            <div className="rd-built-stat">
              <span className="k">Marathon PB</span>
              <span className="v">2:24</span>
            </div>
            <div className="rd-built-stat">
              <span className="k">World record</span>
              <span className="v">holder. ask him about it</span>
            </div>
            <div className="rd-built-stat">
              <span className="k">Base</span>
              <span className="v">Sydney, Australia</span>
            </div>
            <div className="rd-built-stat">
              <span className="k">Support inbox</span>
              <span className="v">read by Jason, personally</span>
            </div>
          </aside>
        </div>
      </div>
    </Section>
  );
}

/* ── final CTA ─────────────────────────────────────────────────────── */

function FinalCta() {
  return (
    <section className="rd-final" data-reveal>
      <div className="rd-wrap">
        <h2 className="rd-rise">
          One training block.{" "}
          <em>
            See if it{" "}
            <span className="rd-hl">earns its keep.</span>
          </em>
        </h2>
        <p className="rd-final-sub rd-rise" style={delayStyle("0.12s")}>
          14 days free. No card required. If it isn&rsquo;t sharper than what
          you&rsquo;ve got, leave. We won&rsquo;t make it weird.
        </p>
        <div className="rd-final-actions rd-rise" style={delayStyle("0.22s")}>
          <Link className="rd-btn" href="/signup">
            Start free trial
          </Link>
          <span className="rd-cta-note">
            Connects to Strava in under a minute.
          </span>
        </div>
      </div>
    </section>
  );
}

/* ── footer ────────────────────────────────────────────────────────── */

function Footer() {
  return (
    <footer className="rd-footer">
      <div className="rd-wrap">
        <div className="rd-footer-row">
          <span>© 2026 Coach Casey, Sydney</span>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <a href="#faq">FAQ</a>
          <span className="rd-hand rd-footer-end">
            km 42.2, you finished. nice one.
          </span>
        </div>
        <p className="rd-footer-fine">
          Strava is a trademark of Strava, Inc. Coach Casey is not affiliated
          with Strava. Built by Jason Hunt in Sydney.
        </p>
      </div>
    </footer>
  );
}
