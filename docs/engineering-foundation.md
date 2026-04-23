# Coach Casey — Engineering Foundation

**Owner:** Jason
**Last updated:** 2026-04-23
**Status:** Living document. The starting point for building — repo structure, services to connect, environment setup, deployment pipeline, database foundation, observability. Precedes feature work; it's the runbook for getting the shell of the product production-ready before any user-facing features exist.

Supersedes project memory when they conflict. Separate from `technical-decision-log.md` (individual engineering decisions), `strategy-foundation.md` (why), `v1-scope.md` (what), and `strava-api-compliance-note.md` (Strava application prep).

---

## 1. What this doc is

This is the engineering foundation — everything that needs to be in place *before* feature work starts. Not an architecture spec, not a handoff pack, not a code tutorial. The bridge between decisions already locked (in the technical decision log) and the first line of feature code.

Success after following this doc: a GitHub repo exists with the right shape; every service needed for V1 has an account and an env var; the repo deploys cleanly to Vercel on every push; the database has schema migrations in place with RLS; observability captures every request, LLM call, and error; the LLM pipeline is wired for real calls in staging and mockable in dev; nothing in the foundation is stopping feature work from starting.

**Explicitly out of scope here:**
- Feature implementation (debriefs, chat, onboarding, etc.) — that's V1 build work
- Individual prompt design — lives in `prompts/` and is its own workstream (see V1 scope §4)
- Detailed API surface specs — produced per-feature as needed
- Exhaustive cost modelling at scale — only named where relevant to setup choices

**Guiding principle for this stage:** free where free is good enough; architecturally ready for paid services to slot in when needed; nothing left to retrofit.

---

## 2. Repository structure

Single repo, mixed frontend/backend. Vercel's Python functions support means FastAPI code colocates cleanly with the Next.js app under one deployment.

```
coach-casey/
├── .github/
│   └── workflows/
│       └── ci.yml                    # Lint, typecheck, test on every PR
├── api/                              # Python (FastAPI as Vercel functions)
│   ├── _shared/                      # Shared backend code
│   │   ├── config.py                 # Pydantic Settings, env loading
│   │   ├── db.py                     # Supabase client setup
│   │   ├── llm/
│   │   │   ├── anthropic_client.py   # With prompt caching
│   │   │   ├── openai_client.py      # Embeddings
│   │   │   └── mock.py               # Deterministic dev mocks
│   │   ├── models/                   # Pydantic models (source of truth for types)
│   │   ├── services/                 # Business logic
│   │   └── observability.py          # Sentry + Langfuse wiring
│   ├── strava/
│   │   ├── webhook.py                # Strava activity webhook handler
│   │   └── oauth.py                  # OAuth callback
│   ├── debriefs/
│   │   └── generate.py               # Post-run debrief generation
│   ├── chat/
│   │   └── message.py
│   └── weekly_review/
│       └── generate.py
├── app/                              # Next.js 15 app router
│   ├── (auth)/                       # Auth routes
│   ├── (dashboard)/                  # Authenticated app
│   ├── api/                          # Next.js API routes (thin proxies to Python)
│   ├── layout.tsx
│   └── page.tsx                      # Marketing / landing
├── components/
│   ├── ui/                           # Shared UI primitives
│   └── features/                     # Feature-specific components
├── lib/
│   ├── supabase/                     # Supabase client (browser + server)
│   └── types/                        # Generated TS types from Pydantic/OpenAPI
├── public/
│   ├── manifest.json                 # PWA manifest
│   └── service-worker.js             # PWA service worker
├── supabase/
│   ├── migrations/                   # Timestamped SQL migration files
│   ├── seed.sql                      # Dev seed data
│   └── config.toml                   # Supabase CLI config
├── prompts/                          # V1-scope §4 workstream — starts empty, grows
│   └── prompt-engineering-principles.md
├── scripts/
│   ├── generate-types.sh             # Pydantic → OpenAPI → TypeScript
│   └── local-setup.sh                # One-shot local environment setup
├── .env.example                      # Checked-in template, no real values
├── .gitignore
├── next.config.js
├── package.json
├── pyproject.toml                    # Python dependencies (via uv or poetry)
├── requirements.txt                  # Vercel reads this for Python functions
├── tsconfig.json
├── README.md
└── vercel.json                       # Deployment config, function runtimes
```

**Why this shape:**

- **Single repo, not monorepo tooling.** No Turborepo, no pnpm workspaces. Over-engineering for one person building with Claude Code. Plain file organisation is enough.
- **Python under `/api`.** Vercel's convention — any Python file under `/api` becomes a serverless function at that path. Clean separation of concerns without deployment complexity.
- **`_shared/` prefix (underscore).** Vercel ignores files/directories prefixed with `_` when generating function routes. Prevents shared code from being exposed as endpoints.
- **Migrations co-located in repo.** `supabase/migrations/` tracks schema evolution in git. Never run manual SQL against production; every change is a migration file.
- **Pydantic as the type source of truth.** Backend owns the data shapes. TypeScript types are generated from Pydantic via OpenAPI. One source of truth prevents frontend/backend drift.
- **Prompts directory exists from day one.** Even if empty. Part of the V1 scope deliverables; easier to grow a directory than create one late.

---

## 3. Services — connect now vs later

Split by cost model, not by importance. The paid services get accounts and wiring but no active spend.

### Connect now (free tier or free to set up)

| Service | Purpose | Free tier limits | What to set up now |
|---|---|---|---|
| **GitHub** | Source control, CI | Unlimited private repos | Create org or personal repo, enable branch protection on `main`, configure Actions |
| **Vercel** | Hosting (web + Python functions) | Hobby: personal projects, 100GB bandwidth, unlimited deploys | Create project, connect to GitHub, configure env vars, verify Python runtime |
| **Supabase** | DB, auth, storage, pg_cron, pgvector | Free: 500MB DB, 50K MAU, 500MB storage, 2GB bandwidth | Create project, enable pgvector, run first migration, enable RLS |
| **Sentry** | Error tracking | Free: 5K errors/month, 1 user | Create project, install SDK in both Next.js and Python, verify test error |
| **PostHog** | Product analytics + feature flags | Free: 1M events/month | Create project, install JS snippet, verify test event |
| **Langfuse** | LLM observability | Free cloud tier: 50K observations/month | Create project, install SDK, verify test trace |
| **Resend** | Transactional email | Free: 3K emails/month, 100/day | Create account, verify domain (can use resend.dev subdomain initially), send test email |

Every one of these costs nothing until usage exceeds the free tier. At 100–200 paying users (the V1 target) you're comfortably inside all free tiers except possibly Supabase (if DB growth is heavy) and Resend (if weekly reviews + debriefs mean 4+ emails per user per week).

### Set up account but manage spend carefully

| Service | Cost model | Strategy |
|---|---|---|
| **Anthropic API** | Per-token, no subscription | Create account, add $5 dev credit. Use real API calls for staging and specific tests only. Default dev path is mocked (see §9). |
| **OpenAI API** | Per-token, no subscription | Same as Anthropic. Embeddings are cheap (~$0.02 per 1M tokens on `text-embedding-3-small`); $5 lasts weeks of dev. |
| **Stripe** | % of transactions, free setup | Create account, enable test mode. No production wiring until real subscriptions start. Test mode is free and complete. |

### Domains (register now)

- **`coachcasey.app`** — primary product domain. Register at foundation setup; forward to Vercel once deployed. Also the basis for product email (`hello@coachcasey.app`, `coach@coachcasey.app` via Resend for transactional, forwarding to Workspace inbox for inbound).
- **`coachcasey.run`** — defensive registration, redirects to primary. Cheap insurance against on-theme competitors.
- **`themarathonclinic.com`** — Jason owns this separately. Placeholder at V1 launch; content buildout deferred post-V1 (see `strategy-foundation.md` §9). Not part of Coach Casey's operational infrastructure at launch.
- **`coachcasey.com`** — premium-priced (~$10k). Deferred. Revisit post-launch if warranted.

### Hold off entirely until needed

- **Vercel Pro** ($20/month) — only upgrade when hitting Hobby limits (bandwidth, function execution time, team features). Unlikely pre-launch.
- **Supabase Pro** ($25/month) — upgrade when the 500MB DB is tight or when daily backups become necessary (they are pre-launch, but not *strictly* — we can take manual snapshots).
- **Paid Sentry / PostHog / Langfuse tiers** — only at actual usage limits.
- **Email deliverability upgrades** (Resend paid, or SendGrid) — only if deliverability becomes a problem or volume exceeds 3K/month.
- **Strava developer app** (free, but requires application) — wait until foundation is solid and the application can be submitted with a real-looking app (see `strava-api-compliance-note.md`).

---

## 4. Accounts and secrets

Every service above produces credentials. Rules for handling them:

**One pattern, no exceptions.**
- Local dev: `.env.local` (gitignored). Never committed.
- Deployed environments (preview + production): Vercel env vars, configured in Vercel dashboard.
- `.env.example` in repo: checked in, contains variable *names* and descriptions, no real values. The template for local setup.

**Environment separation from day one.**
- `NEXT_PUBLIC_SUPABASE_URL` — fine to expose
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, never exposed, never prefixed `NEXT_PUBLIC_`
- Same discipline for every other secret. If in doubt: server-only.

**Variable naming convention.**
```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Anthropic
ANTHROPIC_API_KEY=

# OpenAI
OPENAI_API_KEY=

# Strava (post-approval)
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
STRAVA_WEBHOOK_VERIFY_TOKEN=

# Stripe (test mode keys initially)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Sentry
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=

# PostHog
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=

# Langfuse
LANGFUSE_SECRET_KEY=
LANGFUSE_PUBLIC_KEY=
LANGFUSE_BASE_URL=

# Resend
RESEND_API_KEY=

# App config
NEXT_PUBLIC_APP_URL=
NODE_ENV=
LLM_MODE=  # 'real' | 'mock' — see §9
```

**Rotation discipline.** Any accidental commit of a secret: rotate immediately (all affected services), regardless of whether the commit was reverted. Git history preserves reverted commits.

**Secret scanning.** Enable GitHub secret scanning on the repo. Free and catches most accidental commits.

---

## 5. Local development environment

One-shot setup target. Someone pulling the repo for the first time should be able to run the app locally within 20 minutes.

**Prerequisites:**
- Node.js 22+ (Vercel runtime match)
- Python 3.12+
- pnpm or npm (pnpm preferred)
- uv for Python dependency management (fast, modern, replaces pip + venv)
- Supabase CLI (for local DB + migrations)
- Docker (for local Supabase — optional, remote Supabase is simpler for solo dev)

**First-run steps** (captured in `scripts/local-setup.sh` and documented in README):

1. Clone repo
2. `pnpm install` — frontend deps
3. `uv sync` — Python deps
4. Copy `.env.example` → `.env.local`, fill in dev credentials
5. `pnpm dev` — runs Next.js locally
6. In separate terminal: `vercel dev` — runs Python functions locally matching Vercel behaviour
7. Point at remote Supabase dev instance (simpler than running local Supabase)

**Dev database strategy.** Use a dedicated Supabase project for development. Separate from production. Migrations run against both. Seed data can be loaded via `supabase/seed.sql`.

**Why not local Supabase via Docker?** Option exists and is fine for teams. For solo dev, the overhead (Docker running, disk space, migration drift) outweighs the benefit. Remote dev DB is simpler. Revisit if this changes.

---

## 6. Deployment pipeline

GitHub → Vercel on every push. Preview deployments for PRs, production deployment for `main`.

**Branch strategy (solo builder):**
- `main` — always deployable. Protected. No direct pushes; everything via PR.
- `feature/*` — short-lived feature branches. Merged via PR after CI passes.
- Preview deploys on every PR (Vercel does this automatically once connected to GitHub).

Why protect `main` even as a solo builder: muscle memory for when contractors or collaborators come in, and a CI gate catches mistakes before they hit production.

**CI pipeline** (`.github/workflows/ci.yml`):

- Lint (Next.js: ESLint + Prettier; Python: ruff + black)
- Typecheck (Next.js: `tsc --noEmit`; Python: mypy or pyright)
- Unit tests (Next.js: vitest; Python: pytest)
- On `main` merge: auto-deploy to production (Vercel handles)

**Vercel configuration:**
- Framework preset: Next.js (auto-detected)
- Python runtime: specified in `vercel.json`
- Env vars: set in Vercel dashboard, scoped to Production/Preview/Development
- Function region: Sydney (syd1) for lowest latency to AU/NZ users

**Deployment verification.** Every production deploy runs a smoke test: one GET request to a `/api/health` endpoint that verifies DB connection and returns 200. Fails loud if anything's broken.

---

## 7. Database foundation

The discipline that's most painful to retrofit. Get it right on day one.

**Migrations, not manual SQL.**
Every schema change authored as a file under `supabase/migrations/`, committed to git, run through `supabase db push` (or equivalent). Never run SQL directly against production. Never. This is how schema drift happens.

**RLS on every table from day one.**
Every table gets a Row Level Security policy. Default policy: deny all. Explicit policies grant read/write only to authenticated users accessing their own data.

Pattern for every user-scoped table:
```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "athlete_select_own" ON <table>
  FOR SELECT USING (athlete_id = auth.uid());

CREATE POLICY "athlete_insert_own" ON <table>
  FOR INSERT WITH CHECK (athlete_id = auth.uid());

-- Similar for UPDATE and DELETE where appropriate
```

Service role key bypasses RLS (server-side operations). Anon/auth key respects RLS (client-side operations). Never expose service role key to the frontend.

**First migrations to run** (before any feature code):

1. `00001_enable_extensions.sql` — enable pgvector, pg_cron, uuid-ossp
2. `00002_create_athletes.sql` — athletes table tied to auth.users
3. `00003_rls_defaults.sql` — baseline RLS helper functions if needed
4. Subsequent migrations per data-model table as features come online

The full V1 data model is captured in `technical-decision-log.md` — that's the source of truth for table list. Migrations implement it incrementally as features land.

**Backups.**
Supabase free tier does daily backups with 7-day retention. Sufficient for pre-launch dev.
Before launch: take a manual snapshot before any risky change. Upgrade to Pro for longer retention once real user data exists.

**pgvector setup.**
Extension enabled in first migration. Indexes added lazily — per-table, when actually needed. Don't create vector indexes speculatively; they're expensive to maintain and "surgical use" was a deliberate data-architecture decision (see technical decision log).

---

## 8. Observability foundation

Wire everything from day one. Catching production issues starts here.

**Sentry** — every uncaught error, in both frontend and backend.
- Next.js: `@sentry/nextjs` SDK, configured via Sentry wizard
- Python: `sentry-sdk` with FastAPI integration
- Source maps uploaded on every deploy so stack traces are readable
- Tags: environment (production/preview/development), user ID (where available), feature area

**PostHog** — every user-facing event.
- JS snippet in Next.js root layout
- Feature flag evaluation from day one (empty flag set initially; infrastructure ready)
- Autocapture enabled; custom events added as features land
- Session recordings: off initially (privacy-sensitive, uses quota fast); toggle on for first-100-users watching period

**Langfuse** — every LLM call.
- Wrapped around every Anthropic SDK call in `api/_shared/llm/anthropic_client.py`
- Captures: prompt, response, input tokens, output tokens, latency, model, cache hit/miss, cost
- Trace IDs correlate with Sentry errors so an error on an LLM call surfaces both the app-layer stack trace and the prompt/response context
- Tags: prompt name (e.g. `post-run-debrief`, `onboarding-validation`), prompt version, athlete ID

**Logging discipline.**
- Structured JSON logs from both Next.js and Python backends
- No `print()` or `console.log()` in production code paths — use proper loggers
- Log levels used correctly (ERROR is for actual errors, not "something happened")

**Alerting.**
- Sentry → email for new errors (default)
- No pager-style alerting pre-launch. Add when real users exist.

---

## 9. LLM pipeline

The highest-cost variable component. Design the dev strategy deliberately.

**Three modes, controlled by `LLM_MODE` env var:**

| Mode | When used | Behaviour |
|---|---|---|
| `mock` | Local dev (default) | Returns deterministic canned responses. No API calls. No cost. |
| `real` | Staging + specific tests | Real Anthropic API calls with small dev credit budget. |
| `real` | Production | Real calls, real budget, full observability. |

The mock layer matters. A developer iterating on UI shouldn't be burning dev credits on every page refresh. The mocks should be good enough that UI and flow logic can be built without hitting the real API — real API is only needed when iterating on prompt quality specifically.

**Prompt caching from day one.**
Anthropic's prompt caching reduces cached-prefix costs by 50–90%. Cache the system prompt and athlete context (the parts reused across every debrief, chat turn, weekly review). Cache TTL: 5 minutes (default) or 1 hour (extended). The longer TTL is right for athlete context — it's the same for a conversation burst.

**Structured tool use for all LLM writes.**
Never parse freeform text to extract structured data. Every DB write originating from an LLM goes through a tool call with a Pydantic schema. This is non-negotiable; the data layer's integrity depends on it.

**Cost guardrails.**
- Budget alerts set in Anthropic dashboard (alert at $5, $20, $50 of monthly spend)
- Rate limits enforced per-athlete (max N LLM calls per hour; prevents runaway costs from a bug)
- Logging every call's cost via Langfuse means bills are never a surprise

---

## 10. The initial scaffold — what to build first

The minimum the foundation needs to be "done" and feature work can start.

1. **Repo created, pushed to GitHub.** Structure matches §2.
2. **All "connect now" services have accounts and env vars set in Vercel.** Sentry, PostHog, Langfuse, Resend, Supabase (free tier), Vercel (Hobby).
3. **Anthropic + OpenAI accounts exist with small dev credits added.** API keys in env.
4. **First Supabase migrations run.** Extensions enabled, `athletes` table exists with RLS.
5. **Next.js app running locally and deployed to Vercel.** Landing page with placeholder copy.
6. **One Python function exists at `/api/health` and returns 200.** Hits Supabase, verifies DB connectivity.
7. **Sign-up / sign-in flow works end-to-end** via Supabase Auth. Email magic link is fine for V1.
8. **Sentry catches a test error** from both frontend and backend.
9. **Langfuse captures a test LLM call** (mocked in dev, real in staging).
10. **PostHog receives a test event.**
11. **CI pipeline passes on a test PR.**
12. **A welcome email sends via Resend** on first sign-up.
13. **`prompts/prompt-engineering-principles.md` exists** with the cross-cutting principles from V1 scope §4.

When all thirteen of those pass, the foundation is done. Feature work starts.

---

## 11. What's wired but dormant

Things in the scaffold that exist but don't do anything user-facing yet. Deliberate — builds the structural discipline before features need it.

- **Stripe integration** — SDK installed, webhook endpoint created, subscription models in schema, but no UI to subscribe and no production keys live. When the first real user signs up for the trial, this flips on.
- **Strava integration** — Python OAuth handler file exists, webhook handler file exists, schema supports activities. Activated when the developer application is approved.
- **Web push notifications** — service worker registered, subscription flow stubbed, preferences table supports channel toggles. Activated when the first notification needs to go out (post-first-debrief).
- **PWA install prompt** — manifest and service worker in place, install banner hidden by a feature flag. Flipped on close to launch.
- **Feature flags in PostHog** — no flags defined initially, but the evaluation path exists. Every new rolling feature gets a flag by default.

---

## 12. What this unblocks

With the foundation in place, feature work can start in the order defined by V1 scope §7. No more "we need to set up X before we can build Y" conversations — everything's set up. The remaining questions are about features, prompts, and flows.

**The single external blocker that still remains:** Strava developer application approval. This is the one thing that can't be built around. Submit it in parallel with foundation work so it's approved (or rejected with feedback to iterate) by the time feature work reaches the Strava-dependent surfaces.

---

## 13. How this document is used

- **New foundation decisions** (choices about repo structure, services, deployment, secrets, local dev) get added here in the same shape.
- **Deviations from this foundation** during build get logged in `technical-decision-log.md` with reasoning. Don't silently deviate.
- **Items in §11 (wired but dormant)** get "activated" as features come online. When a dormant item activates, note it here with the date and trigger.
- **Reviewed** at V1 build kickoff, when moving from pre-launch to launch, and immediately after any material change to the service stack or deployment pipeline.

Not a handoff doc. When the project is ready for a developer to implement against, `product-management` produces the handoff pack drawing from this, V1 scope, strategy, and technical decision log.
