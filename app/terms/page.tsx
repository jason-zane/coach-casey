import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Coach Casey",
  description:
    "The terms under which Coach Casey is provided. Plain language, no surprises.",
};

const LAST_UPDATED = "27 April 2026";

export default function TermsPage() {
  return (
    <div className="flex flex-col flex-1">
      <PageHeader />
      <main className="flex-1">
        <article className="mx-auto max-w-[720px] px-6 md:px-10 py-16 md:py-24 prose-policy">
          <header className="mb-12 space-y-2">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--color-ink-subtle)]">
              Terms of Service
            </p>
            <h1
              className="text-[color:var(--color-ink)] text-[40px] md:text-[48px] leading-[1.05] font-medium"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              The terms, in plain language.
            </h1>
            <p className="text-[13px] text-[color:var(--color-ink-subtle)]">
              Last updated: {LAST_UPDATED}
            </p>
          </header>

          <Section title="The short version">
            <p>
              Coach Casey is a reflective training partner that reads your
              runs from Strava and writes you debriefs. Use it for personal
              training. Don&apos;t use it for medical advice, don&apos;t try
              to break it, and don&apos;t train AI models on its output.
              We&apos;ll do our best to keep it running but we don&apos;t
              guarantee perfection. Either of us can end the relationship at
              any time.
            </p>
            <p>
              The full terms below apply when you use Coach Casey. If you
              don&apos;t agree with them, don&apos;t use the service.
            </p>
          </Section>

          <Section title="Who we are">
            <p>
              Coach Casey is operated by Jason Hunt (sole trader), based in
              Sydney, Australia. In these terms, &ldquo;Coach
              Casey&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo; and{" "}
              &ldquo;our&rdquo; refer to that operating entity. &ldquo;You&rdquo;
              means the person using the service.
            </p>
          </Section>

          <Section title="Eligibility">
            <p>
              You must be at least 16 years old to use Coach Casey. By using
              the service you confirm that you are at least 16, that any
              information you give us is true, and that you have the right
              to connect any third-party account (e.g. Strava) you connect.
            </p>
          </Section>

          <Section title="Your account">
            <p>
              You&apos;re responsible for keeping your sign-in credentials
              secure and for any activity that happens under your account.
              Tell us promptly if you think someone else has accessed it. We
              may suspend or close accounts that show signs of compromise or
              abuse.
            </p>
          </Section>

          <Section title="Trial and subscription">
            <p>
              Coach Casey is offered with a free trial period (currently 14
              days, no card required). After the trial, continued use
              requires a paid subscription. Pricing is shown on the website
              before you subscribe; we&apos;ll always confirm before
              charging you.
            </p>
            <p>
              Subscriptions renew automatically until cancelled. You can
              cancel at any time; cancellation takes effect at the end of
              your current billing period and you keep access until then. We
              don&apos;t pro-rate refunds for partial periods, except where
              required by law.
            </p>
            <p>
              Payments are processed by{" "}
              <a
                className="link"
                href="https://stripe.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                Stripe
              </a>
              . We don&apos;t store your card details.
            </p>
          </Section>

          <Section title="Strava integration">
            <p>
              To use the core of Coach Casey you connect your Strava account.
              The integration is read-only: we receive runs and profile
              data, we never write to your Strava account. You can revoke
              access at any time from{" "}
              <strong>Settings &rsaquo; Strava connection</strong> inside
              Coach Casey or from{" "}
              <a
                className="link"
                href="https://www.strava.com/settings/apps"
                target="_blank"
                rel="noopener noreferrer"
              >
                Strava&apos;s authorised apps page
              </a>
              .
            </p>
            <p>
              Your use of Strava is also governed by Strava&apos;s own terms.
              Strava is a trademark of Strava, Inc. Coach Casey is not
              endorsed by or affiliated with Strava beyond being a registered
              API consumer.
            </p>
          </Section>

          <Section title="What Coach Casey is — and isn't">
            <p>
              Coach Casey is a reflective training partner. It writes
              debriefs, answers questions, and tracks the shape of your
              training. It is not a substitute for professional medical,
              physiotherapy, or coaching advice. Pain, illness, persistent
              niggles, or unusual physical symptoms should be assessed by a
              qualified clinician.
            </p>
            <p>
              The training suggestions and analysis Coach Casey produces are
              based on the information you give it and the model&apos;s
              best inference. They can be wrong. You&apos;re always the
              final judge of what to do with your body.
            </p>
          </Section>

          <Section title="Acceptable use">
            <p>You agree not to:</p>
            <ul>
              <li>
                Use Coach Casey to harm others, harass, or do anything
                illegal.
              </li>
              <li>
                Probe, scrape, reverse-engineer, or attempt to circumvent
                authentication or rate limits.
              </li>
              <li>
                Use Coach Casey&apos;s output to train, fine-tune, or
                evaluate any AI or machine-learning model. This includes
                building a competing product on top of our outputs.
              </li>
              <li>
                Resell or sublicense access to Coach Casey, or share an
                account with someone else.
              </li>
              <li>
                Connect a Strava account that isn&apos;t yours, or otherwise
                misrepresent who you are.
              </li>
              <li>
                Upload or send content that is unlawful, defamatory,
                harassing, or infringes on someone else&apos;s rights.
              </li>
            </ul>
            <p>
              We may suspend or terminate accounts that breach these rules.
            </p>
          </Section>

          <Section title="Your content; our content">
            <p>
              You retain ownership of the content you give us &mdash; your
              training plan, your messages, your runs. You grant us a
              limited, worldwide, royalty-free licence to host, process, and
              display that content solely so we can run the service for
              you. We don&apos;t claim any ownership over it, we don&apos;t
              sell it, and we don&apos;t use it to train AI models.
            </p>
            <p>
              The Coach Casey service, brand, design, and software are
              owned by us. We grant you a limited, non-exclusive,
              non-transferable right to use the service for your personal
              training while these terms are in effect.
            </p>
          </Section>

          <Section title="AI-generated content">
            <p>
              Coach Casey uses third-party large language models to generate
              debriefs and chat replies. Output may occasionally be
              inaccurate, incomplete, or outdated. Don&apos;t rely on it for
              decisions where accuracy is critical (medical, legal,
              financial). You&apos;re responsible for how you use the
              output.
            </p>
          </Section>

          <Section title="Service availability">
            <p>
              We work hard to keep Coach Casey available, but we don&apos;t
              guarantee uninterrupted service. We may need to take the
              service offline for maintenance, security, or to fix
              problems. Strava&apos;s API may be unavailable from time to
              time, which can prevent us from syncing new activities.
            </p>
            <p>
              We may change, add, or remove features. If we make a material
              change that adversely affects you, we&apos;ll give you
              reasonable notice.
            </p>
          </Section>

          <Section title="Disclaimers">
            <p>
              To the maximum extent permitted by law, Coach Casey is provided
              &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. We make no
              warranties &mdash; express or implied &mdash; about
              merchantability, fitness for a particular purpose, accuracy,
              or non-infringement.
            </p>
            <p>
              In Australia, certain consumer guarantees under the Australian
              Consumer Law cannot be excluded. Nothing in these terms limits
              those rights. Where allowed, our liability for breach of a
              non-excludable guarantee is limited to re-supplying the
              service or paying the cost of having the service re-supplied.
              Comparable consumer-protection laws in New Zealand, the UK,
              the EU, and US states are likewise not affected.
            </p>
          </Section>

          <Section title="Limitation of liability">
            <p>
              To the maximum extent permitted by law, Coach Casey, its
              operator, employees, contractors, and partners will not be
              liable for any indirect, incidental, consequential, special,
              or punitive damages, or for lost profits, lost data, or
              business interruption, arising out of or in connection with
              your use of the service.
            </p>
            <p>
              Our total liability to you for all claims arising out of or in
              connection with the service is capped at the greater of (a)
              the amount you paid us in the twelve months preceding the
              event giving rise to the claim, or (b) AU$100.
            </p>
          </Section>

          <Section title="Termination">
            <p>
              You can stop using Coach Casey and delete your account at any
              time from{" "}
              <strong>Settings &rsaquo; Delete account</strong> or by
              emailing{" "}
              <a className="link" href="mailto:hello@coachcasey.app">
                hello@coachcasey.app
              </a>
              .
            </p>
            <p>
              We can suspend or terminate your access if you breach these
              terms, if continued provision is not practical (e.g. for
              legal, security, or commercial reasons), or if your account
              has been inactive for an extended period. We&apos;ll give you
              reasonable notice unless doing so would be illegal or risk
              harm.
            </p>
            <p>
              Provisions that by their nature should survive termination
              (e.g. ownership, disclaimers, limitations of liability) will
              survive.
            </p>
          </Section>

          <Section title="Changes to these terms">
            <p>
              We may update these terms from time to time. If we make a
              material change, we&apos;ll email registered users and update
              the &ldquo;Last updated&rdquo; date above. Continued use of
              the service after a change constitutes acceptance of the
              updated terms.
            </p>
          </Section>

          <Section title="Governing law">
            <p>
              These terms are governed by the laws of New South Wales,
              Australia. Disputes are subject to the non-exclusive
              jurisdiction of the courts of New South Wales. If you live in
              a jurisdiction that grants you the right to bring proceedings
              in your local courts (for example, as a consumer in the UK or
              EU), nothing in these terms limits that right.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              <strong>General:</strong>{" "}
              <a className="link" href="mailto:hello@coachcasey.app">
                hello@coachcasey.app
              </a>
              <br />
              <strong>Privacy:</strong>{" "}
              <a className="link" href="mailto:privacy@coachcasey.app">
                privacy@coachcasey.app
              </a>
              <br />
              <strong>Security:</strong>{" "}
              <a className="link" href="mailto:security@coachcasey.app">
                security@coachcasey.app
              </a>
            </p>
          </Section>
        </article>
      </main>
      <PageFooter />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2
        className="text-[color:var(--color-ink)] text-[22px] md:text-[24px] leading-tight font-medium mb-4"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function PageHeader() {
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
          <Link
            href="/"
            className="hover:text-[color:var(--color-ink)] transition-colors duration-150"
          >
            Home
          </Link>
          <Link
            href="/signin"
            className="hover:text-[color:var(--color-ink)] transition-colors duration-150"
          >
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}

function PageFooter() {
  return (
    <footer>
      <div className="mx-auto max-w-[1180px] px-6 md:px-10 py-10 flex flex-wrap items-center gap-x-8 gap-y-3 text-[13px] text-[color:var(--color-ink-subtle)]">
        <span
          className="text-[color:var(--color-ink)] text-[15px] font-medium"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Coach Casey
        </span>
        <Link
          href="/privacy"
          className="hover:text-[color:var(--color-ink)] transition-colors duration-150"
        >
          Privacy
        </Link>
        <Link
          href="/terms"
          className="hover:text-[color:var(--color-ink)] transition-colors duration-150"
        >
          Terms
        </Link>
        <span className="ml-auto">© 2026</span>
      </div>
    </footer>
  );
}
