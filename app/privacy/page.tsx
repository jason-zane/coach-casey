import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Coach Casey",
  description:
    "How Coach Casey collects, stores, and uses your data. Strava data is read-only and never used to train models.",
};

const LAST_UPDATED = "27 April 2026";

export default function PrivacyPage() {
  return (
    <div className="flex flex-col flex-1">
      <PageHeader />
      <main className="flex-1">
        <article className="mx-auto max-w-[720px] px-6 md:px-10 py-16 md:py-24 prose-policy">
          <header className="mb-12 space-y-2">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--color-ink-subtle)]">
              Privacy Policy
            </p>
            <h1
              className="text-[color:var(--color-ink)] text-[40px] md:text-[48px] leading-[1.05] font-medium"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Your data, plainly handled.
            </h1>
            <p className="text-[13px] text-[color:var(--color-ink-subtle)]">
              Last updated: {LAST_UPDATED}
            </p>
          </header>

          <Section title="The short version">
            <p>
              Coach Casey is a reflective training partner. We read your runs
              from Strava, store your training plan and our conversations, and
              use those to write debriefs and answer your questions. That data
              belongs to you. We don&apos;t sell it. We don&apos;t use it to
              train AI models. You can disconnect Strava, export everything we
              hold about you, and delete your account at any time.
            </p>
            <p>
              The longer version below covers exactly what we collect, where
              it&apos;s stored, who it&apos;s shared with, and the rights you
              have under Australian, New Zealand, UK, EU (GDPR), and US
              (including California) privacy laws.
            </p>
          </Section>

          <Section title="Who we are">
            <p>
              Coach Casey is operated by Jason Hunt (sole trader), based in
              Sydney, Australia. For privacy enquiries, deletion requests, or
              questions about this policy, contact{" "}
              <a className="link" href="mailto:privacy@coachcasey.app">
                privacy@coachcasey.app
              </a>
              .
            </p>
            <p>
              In this policy, &ldquo;Coach Casey&rdquo;, &ldquo;we&rdquo;,
              &ldquo;us&rdquo; and &ldquo;our&rdquo; refer to that operating
              entity. &ldquo;You&rdquo; means the athlete using the service.
            </p>
          </Section>

          <Section title="What we collect">
            <h3>Information you give us</h3>
            <ul>
              <li>
                <strong>Account details</strong> — email address, password
                (hashed), display name. Used to sign you in.
              </li>
              <li>
                <strong>Onboarding answers</strong> — your training plan
                (pasted as text), goal race, current niggles or injuries, and
                notification preferences. Used to write debriefs and respond
                to you in context.
              </li>
              <li>
                <strong>Conversation history</strong> — messages you send
                Coach Casey and the responses generated. Stored so future
                replies can reference earlier context.
              </li>
              <li>
                <strong>Effort and feedback</strong> — RPE (rate of perceived
                exertion) ratings you submit after runs.
              </li>
            </ul>

            <h3>Information from Strava</h3>
            <p>
              When you connect Strava, we receive the data Strava&apos;s API
              returns under the scopes you grant (
              <code>read</code>, <code>activity:read_all</code>,{" "}
              <code>profile:read_all</code>):
            </p>
            <ul>
              <li>
                <strong>Profile</strong> — your Strava athlete ID, name, and
                profile photo.
              </li>
              <li>
                <strong>Activities</strong> — runs and other activities,
                including distance, time, pace, heart rate, elevation,
                workout laps, GPS-derived summary fields, and any
                title/description you wrote.
              </li>
            </ul>
            <p>
              We never write to your Strava account. The connection is
              read-only.
            </p>

            <h3>Information collected automatically</h3>
            <ul>
              <li>
                <strong>Usage analytics</strong> — pages viewed, features
                used, errors encountered. Pseudonymous; we use this to fix
                bugs and decide what to improve.
              </li>
              <li>
                <strong>Device and connection</strong> — browser, operating
                system, approximate region, IP address (used for
                rate-limiting and security; not stored long-term).
              </li>
            </ul>
            <p>
              We do not use advertising trackers. We do not sell your data
              to anyone, full stop.
            </p>
          </Section>

          <Section title="How we use it">
            <ul>
              <li>
                <strong>Generate your debriefs and replies.</strong> Your
                runs, plan, and recent conversation context are sent to a
                large language model (Anthropic Claude, with OpenAI used for
                some narrower tasks) to produce the response. See &ldquo;AI
                models&rdquo; below.
              </li>
              <li>
                <strong>Operate the service.</strong> Authenticating you,
                routing notifications, syncing new Strava activities, billing
                if you become a paid subscriber.
              </li>
              <li>
                <strong>Improve the product.</strong> Pseudonymised usage
                analytics tell us which moments are working and where people
                get stuck. We do not feed your training data into any
                analytics product.
              </li>
              <li>
                <strong>Keep it secure.</strong> Detect abuse, prevent
                unauthorised access, comply with legal obligations.
              </li>
            </ul>
          </Section>

          <Section title="AI models — and what we don't do">
            <p>
              Coach Casey uses third-party large language models at inference
              time to write debriefs and respond in chat. Specifically:
            </p>
            <ul>
              <li>
                <strong>Anthropic</strong> (Claude) — primary model for
                debriefs and chat.
              </li>
              <li>
                <strong>OpenAI</strong> — used for narrower tasks (e.g.
                embeddings, certain classifications).
              </li>
            </ul>
            <p>
              When we call these APIs, only the data needed for that specific
              response is included. Both providers are configured under their
              standard zero-data-retention or short-retention enterprise
              terms, and neither is permitted to train models on your data.
              You can read their published policies:{" "}
              <a
                className="link"
                href="https://www.anthropic.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
              >
                Anthropic
              </a>
              ,{" "}
              <a
                className="link"
                href="https://openai.com/policies/api-data-usage-policies"
                target="_blank"
                rel="noopener noreferrer"
              >
                OpenAI
              </a>
              .
            </p>
            <p>
              <strong>We never train AI models on your data.</strong> Strava
              data is never included in any dataset used for model training,
              fine-tuning, or evaluation. This is a hard rule, in line with
              Strava&apos;s API agreement.
            </p>
          </Section>

          <Section title="Where it's stored">
            <p>
              Your account data, training plans, conversations, and ingested
              Strava activities are stored on{" "}
              <a
                className="link"
                href="https://supabase.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                Supabase
              </a>
              , in the <strong>Sydney (ap-southeast-2)</strong> region. The
              database is encrypted at rest. Connections are encrypted in
              transit (TLS).
            </p>
            <p>
              Hosting and serverless compute run on{" "}
              <a
                className="link"
                href="https://vercel.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                Vercel
              </a>
              . Some serverless functions may execute in regions outside
              Australia for latency reasons; the canonical store of your data
              remains in Sydney. AI model calls are routed to the relevant
              provider (Anthropic, OpenAI), which may process the request in
              the United States.
            </p>
            <p>
              By using Coach Casey you consent to these international
              transfers, which are made under standard contractual
              safeguards.
            </p>
          </Section>

          <Section title="How long we keep it">
            <ul>
              <li>
                <strong>Account, plan, and conversation data</strong> — kept
                for as long as your account is active.
              </li>
              <li>
                <strong>Strava activity data</strong> — kept for as long as
                your account is active and your Strava connection is in
                place. If you disconnect Strava, we stop syncing new
                activities. Previously-ingested activities remain (so your
                history is intact) unless you ask us to delete them.
              </li>
              <li>
                <strong>Account deletion</strong> — when you delete your
                account, your data is soft-deleted immediately and hard-
                deleted within 30 days. Backups are purged within 90 days.
                Aggregated, fully de-identified statistics may be retained.
              </li>
              <li>
                <strong>Logs</strong> — operational logs are retained for up
                to 30 days for debugging and security.
              </li>
            </ul>
          </Section>

          <Section title="Who we share it with">
            <p>
              We share data only with service providers who help us operate
              Coach Casey. Each is bound by a written agreement, processes
              data only on our instructions, and is contractually prohibited
              from using your data for any other purpose.
            </p>
            <ul>
              <li>
                <strong>Supabase</strong> — database and authentication.
                Data stored in Sydney.
              </li>
              <li>
                <strong>Vercel</strong> — application hosting and serverless
                compute.
              </li>
              <li>
                <strong>Anthropic, OpenAI</strong> — AI inference (see
                &ldquo;AI models&rdquo;).
              </li>
              <li>
                <strong>Stripe</strong> — payments, if and when you
                subscribe. Stripe is the controller of payment-method data;
                we never see your card number.
              </li>
              <li>
                <strong>PostHog, Sentry</strong> — pseudonymous product
                analytics and error monitoring.
              </li>
              <li>
                <strong>Resend / similar</strong> — transactional email
                (sign-in, account notices).
              </li>
            </ul>
            <p>
              We do not sell, rent, or trade your personal information. We
              will only disclose data to law enforcement or other third
              parties when legally required to do so, and where possible we
              will notify you first.
            </p>
          </Section>

          <Section title="Your rights">
            <p>
              The specific rights you have depend on where you live. The
              practical effect is the same: you can see, correct, export, or
              delete your data, and disconnect Strava, at any time. To
              exercise any of these rights, email{" "}
              <a className="link" href="mailto:privacy@coachcasey.app">
                privacy@coachcasey.app
              </a>{" "}
              or use the controls inside Coach Casey&apos;s settings page.
            </p>

            <h3>Australia &mdash; Privacy Act 1988 (Cth)</h3>
            <p>
              We handle personal information in accordance with the
              Australian Privacy Principles (APPs). You can request access
              to, or correction of, your personal information. If you
              believe we have breached the APPs, you can complain to us
              first; if not satisfied, you can complain to the{" "}
              <a
                className="link"
                href="https://www.oaic.gov.au"
                target="_blank"
                rel="noopener noreferrer"
              >
                Office of the Australian Information Commissioner (OAIC)
              </a>
              .
            </p>

            <h3>New Zealand &mdash; Privacy Act 2020</h3>
            <p>
              You have the right to access and correct personal information
              we hold about you. If we cannot resolve a complaint, you can
              contact the{" "}
              <a
                className="link"
                href="https://www.privacy.org.nz"
                target="_blank"
                rel="noopener noreferrer"
              >
                Office of the Privacy Commissioner
              </a>
              .
            </p>

            <h3>
              United Kingdom and European Economic Area &mdash; UK GDPR / EU
              GDPR
            </h3>
            <p>
              If you are in the UK or EEA, you have the right to: access your
              data; rectify inaccurate data; erase data
              (&ldquo;right to be forgotten&rdquo;); restrict processing;
              object to processing; data portability (export); and withdraw
              consent at any time. We rely on the following lawful bases:
              performance of our contract with you (running the service),
              your consent (e.g., notifications), and legitimate interests
              (e.g., security and fraud prevention). You can complain to your
              local supervisory authority — in the UK, the{" "}
              <a
                className="link"
                href="https://ico.org.uk"
                target="_blank"
                rel="noopener noreferrer"
              >
                Information Commissioner&apos;s Office (ICO)
              </a>
              .
            </p>

            <h3>United States</h3>
            <p>
              If you live in California, you have rights under the{" "}
              <strong>California Consumer Privacy Act</strong> (CCPA) as
              amended by the CPRA: to know what personal information we
              collect about you; to delete it; to correct inaccuracies; to
              opt out of &ldquo;sales&rdquo; or &ldquo;sharing&rdquo; (we do
              neither); and to limit use of sensitive personal information.
              We do not knowingly sell or share personal information for
              cross-context behavioural advertising. Residents of Virginia,
              Colorado, Connecticut, Utah, Texas, and other US states with
              comprehensive privacy laws have analogous rights, which we
              honour on the same basis. To exercise any of these rights,
              email{" "}
              <a className="link" href="mailto:privacy@coachcasey.app">
                privacy@coachcasey.app
              </a>{" "}
              with the subject line &ldquo;Privacy Request&rdquo;. We will
              verify your identity (typically by replying to the email
              address on your account) before acting on the request and
              respond within the applicable statutory window.
            </p>
            <p>
              We do not knowingly collect personal information from children
              under 16. If you believe a child has provided us with personal
              information, please contact us and we will delete it.
            </p>
          </Section>

          <Section title="Disconnecting Strava, exporting, and deleting your account">
            <p>
              You can disconnect Strava at any time from{" "}
              <strong>Settings &rsaquo; Strava connection</strong> inside
              Coach Casey, or from{" "}
              <a
                className="link"
                href="https://www.strava.com/settings/apps"
                target="_blank"
                rel="noopener noreferrer"
              >
                Strava&apos;s authorised apps page
              </a>
              . When you disconnect, we revoke our access token with Strava
              and stop syncing new activities. Your existing thread and
              debriefs remain so you can read them; you can delete them with
              the account-deletion flow if you want them gone too.
            </p>
            <p>
              You can <strong>export everything we hold about you</strong>{" "}
              from <strong>Settings &rsaquo; Export my data</strong>. We
              return a single JSON file with your account, training plan,
              activities, conversations, RPE responses, and memory items.
              Strava OAuth tokens are excluded for security.
            </p>
            <p>
              To delete your account, use{" "}
              <strong>Settings &rsaquo; Delete account</strong>, or email{" "}
              <a className="link" href="mailto:privacy@coachcasey.app">
                privacy@coachcasey.app
              </a>
              . We will soft-delete immediately (you&apos;re signed out and
              can no longer sign back in) and hard-delete within 30 days.
            </p>
          </Section>

          <Section title="Security">
            <p>
              We use industry-standard safeguards: TLS in transit,
              encryption at rest, scoped database access via row-level
              security policies, and least-privilege service credentials. No
              system is impenetrable, but we take this seriously. If you
              believe you&apos;ve found a vulnerability, please email{" "}
              <a className="link" href="mailto:security@coachcasey.app">
                security@coachcasey.app
              </a>
              .
            </p>
          </Section>

          <Section title="Cookies and similar technologies">
            <p>
              Coach Casey uses essential cookies to keep you signed in and a
              small number of pseudonymous analytics cookies (PostHog) to
              measure how the product is used. We do not use advertising or
              cross-site tracking cookies. You can clear cookies at any time
              from your browser settings; some functionality (notably
              sign-in) will not work without them.
            </p>
          </Section>

          <Section title="Changes to this policy">
            <p>
              If we make a material change to this policy, we will email
              registered users and update the &ldquo;Last updated&rdquo;
              date above. Continued use of the service after a change
              constitutes acceptance of the updated policy.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              <strong>Privacy enquiries:</strong>{" "}
              <a className="link" href="mailto:privacy@coachcasey.app">
                privacy@coachcasey.app
              </a>
              <br />
              <strong>Security disclosures:</strong>{" "}
              <a className="link" href="mailto:security@coachcasey.app">
                security@coachcasey.app
              </a>
              <br />
              <strong>General:</strong>{" "}
              <a className="link" href="mailto:hello@coachcasey.app">
                hello@coachcasey.app
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
