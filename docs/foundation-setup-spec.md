# Coach Casey — Foundation Setup Spec

**Owner:** Jason
**Last updated:** 2026-04-23 (spec correction: Python runtime on Vercel)
**Status:** Execution spec. First in a sequence of foundation specs. Ordered to be followed top-to-bottom.

Covers: registering service accounts, creating the GitHub repository, deploying the Next.js shell to Vercel, and wiring service credentials into the deployment. Ends when the empty app auto-deploys on every push to `main` with all service credentials in place.

Does not cover: database migrations, observability SDK wiring in code, LLM client implementation, auth flow, or any user-facing features. Those are subsequent specs.

Source of truth for the "what" and "why" is `engineering-foundation.md`. This spec is the "in what order, doing what specifically."

---

## 1. Prerequisites

Before starting, have these ready on your local machine:

- **Node.js 22+** installed (`node --version` to check). If not, install via [nvm](https://github.com/nvm-sh/nvm) — it lets you switch Node versions later without pain.
- **Python 3.12+** installed (`python3 --version`).
- **Git** installed, with your GitHub identity configured (`git config --global user.name` and `user.email` set).
- **A password manager** for capturing API keys and secrets as you go. 1Password, Bitwarden, or similar. Don't skip this — you'll be generating 10+ credentials across services and losing track is the start of trouble.
- **A credit card** for services that require one at signup (domains, Stripe). No service in Phase 1 will actually charge you at this stage.

If any prerequisite is missing, install it first. Don't start Phase 1 mid-missing-tool.

---

## 2. Phase 1 — Register service accounts (~2–3 hours, mostly parallel)

Goal: every service listed in `engineering-foundation.md` §3 under "Connect now" and "Set up account but manage spend carefully" has an account, and you have the API keys or credentials stored safely.

No ordering dependency between these — do them in whatever order feels natural. Capture every credential to your password manager as you generate it, under a clearly labelled entry ("Coach Casey — [service]").

**Free-tier or free-to-setup services:**

| Service | What you need to capture |
|---|---|
| **GitHub** | Username + ensure two-factor auth is on |
| **Vercel** | Sign in with GitHub, no separate credentials to capture yet |
| **Supabase** | Project URL, anon key, service role key (you'll get these after creating a project in Phase 4) |
| **Sentry** | DSN for Next.js project, DSN for Python project, auth token for source map uploads |
| **PostHog** | Project API key, project host URL |
| **Langfuse** | Public key, secret key, host URL (use cloud.langfuse.com unless self-hosting) |
| **Resend** | API key (use the `resend.dev` subdomain for now — you'll verify `coachcasey.app` in Phase 2) |

**Paid-on-usage services (add small dev credit, no subscription):**

| Service | Action |
|---|---|
| **Anthropic** | Sign up at console.anthropic.com, add $5 credit, generate API key |
| **OpenAI** | Sign up at platform.openai.com, add $5 credit, generate API key |
| **Stripe** | Sign up, activate test mode only, capture test publishable key + test secret key. **Don't complete business verification yet** — not needed for dev, and you'll want your business details finalised before you do |

**Defer for now (named here so you don't forget):**

- **Strava developer application** — see Phase 6 below. Submit in parallel with the rest of foundation work.
- **Domain registration** — Phase 2.

### Notes on a few of these

**Vercel.** Use the Hobby (free) plan. You'll upgrade to Pro only when you hit a real limit — not pre-emptively.

**Supabase.** When you create the project, pick the **Sydney (ap-southeast-2)** region. Your users are AU/NZ and region choice affects database latency noticeably. You can't change region later without a full data migration.

**Langfuse.** If you're unsure self-host vs cloud, pick cloud. Self-hosting is more operational surface area than it's worth pre-launch.

**Anthropic/OpenAI.** Set a billing alert on each ($5, $20, $50 monthly thresholds is fine). LLM costs are the easiest line item to let run away.

---

## 3. Phase 2 — Register domains (~15 minutes)

Goal: own the product domains before anything else gets labelled.

1. **Register `coachcasey.app`.** Use any reputable registrar (Namecheap, Cloudflare, Porkbun). Cloudflare is slightly cheaper and has better DNS tooling, but all three are fine.
2. **Register `coachcasey.run`.** Same registrar. Defensive registration, will redirect to the primary later.
3. **Do not attempt to register `coachcasey.com`** — premium-priced, deferred (see `engineering-foundation.md` §3).
4. Keep `themarathonclinic.com` as-is under Jason's existing registration. Not part of Coach Casey's operational infrastructure at launch.

Don't point DNS at anything yet — Vercel will give you DNS records to add in Phase 5. Just own the domains.

---

## 4. Phase 3 — Create the GitHub repository and initial scaffold (~45 minutes)

Goal: a private GitHub repo named `coach-casey` with the directory structure from `engineering-foundation.md` §2, minimally scaffolded, pushed, and protected.

### Step-by-step

1. **Create the repo.** On GitHub: `coach-casey`, private, no README/licence/gitignore (you'll add these locally). Under your personal account is fine — you can transfer to an org later without friction.

2. **Clone locally.**
   ```bash
   git clone git@github.com:<your-username>/coach-casey.git
   cd coach-casey
   ```

3. **Scaffold the Next.js app.** From the repo root:
   ```bash
   npx create-next-app@latest . --typescript --tailwind --app --eslint --use-pnpm
   ```
   Accept defaults when prompted. This overlays a Next.js 15 app into the current directory.

4. **Create the directory structure** from the foundation doc §2. Run this from the repo root:
   ```bash
   mkdir -p api/_shared/llm api/_shared/models api/_shared/services
   mkdir -p api/strava api/debriefs api/chat api/weekly_review
   mkdir -p supabase/migrations scripts prompts
   touch api/_shared/config.py api/_shared/db.py api/_shared/observability.py
   touch api/_shared/llm/anthropic_client.py api/_shared/llm/openai_client.py api/_shared/llm/mock.py
   touch supabase/seed.sql
   touch prompts/prompt-engineering-principles.md
   ```
   These are empty placeholders. They'll get real content in subsequent specs. Creating them now establishes the shape so you don't have to re-organise later.

5. **Add Python dependency management.** Create `pyproject.toml` at the repo root with minimal content (pick `uv` as the tool — it's fast and modern):
   ```bash
   uv init --python 3.12
   ```
   Then add the dependencies you'll need initially:
   ```bash
   uv add fastapi anthropic openai supabase pydantic pydantic-settings
   uv add --dev pytest ruff black mypy
   ```
   Export a `requirements.txt` for Vercel's Python runtime to read. `uv` does not generate this automatically — run it yourself, and re-run it whenever deps change (you can automate this later via a pre-commit hook):
   ```bash
   uv export --no-hashes --no-dev -o requirements.txt
   ```
   Commit `pyproject.toml`, `uv.lock`, and `requirements.txt` together.

6. **Create `.env.example`** at the repo root with the variable names from `engineering-foundation.md` §4, no real values. This is the checked-in template.

7. **Create `.gitignore`** — `create-next-app` gives you a good default. Add these lines to be safe:
   ```
   .env.local
   .env
   .vercel
   __pycache__/
   .pytest_cache/
   .mypy_cache/
   *.pyc
   ```

8. **Write a minimal README.md** — purpose, how to set up locally, link to the project docs. Keep it thin; it'll grow.

9. **Make the initial commit and push.**
   ```bash
   git add .
   git commit -m "Initial scaffold: Next.js app, Python API structure, empty directories"
   git push origin main
   ```

10. **Enable branch protection on `main`.** On GitHub → Settings → Branches → Add rule for `main`:
    - Require a pull request before merging
    - Require status checks to pass before merging (you'll add CI in a later spec — the rule can exist without checks yet)
    - Do not allow bypassing the above settings

    Why this matters even as a solo builder: it forces you to work through PRs, which means CI gates catch problems, and the habit carries over if contractors join later.

11. **Enable GitHub secret scanning.** Settings → Code security → Secret scanning: Enable. Free on public repos, included on GitHub Free/Pro for private repos. Catches accidental API key commits before they leave your machine in practice — it's cheap insurance.

At the end of Phase 3: repo exists on GitHub, is scaffolded, pushes work, branch protection is on. Nothing deploys yet — that's Phase 4.

---

## 5. Phase 4 — Connect to Vercel and deploy the shell (~30 minutes)

Goal: every push to `main` triggers an automatic deploy to Vercel; the live URL serves your landing page.

1. **Create a Vercel project from the GitHub repo.** vercel.com → Add New → Project → Import your `coach-casey` repo. Vercel auto-detects Next.js.

2. **Configure build settings.** Mostly defaults. Two things to set explicitly:
   - **Deployment region:** Sydney (`syd1`). Under Project Settings → Functions → Default Region.
   - **Node.js version:** 22.x. Usually auto-detected from your `package.json` engines field; confirm it.

3. **Python version pinning — no `vercel.json` needed.** Vercel's `vercel.json` `functions.runtime` field is only for *community* runtimes (things like `vercel-php@0.5.2`). Python is a built-in runtime and rejects that syntax — a `vercel.json` trying to set `"runtime": "python3.12"` fails the build with `Error: Function Runtimes must have a valid version, for example 'now-php@1.0.0'.`

   Instead, pin the Python version via `requires-python` in `pyproject.toml` (which `uv init --python 3.12` already wrote). Vercel's built-in Python runtime reads this and provisions the matching version. No `vercel.json` required at this stage.

4. **Trigger the first deploy.** Either push a trivial commit or click "Deploy" in the Vercel dashboard. Watch the build.

5. **Verify the deploy.** Vercel gives you a URL like `coach-casey-xxx.vercel.app`. Open it. You should see the default Next.js landing page (you'll replace this later).

6. **Connect `coachcasey.app` as a custom domain.** Vercel project → Settings → Domains → Add `coachcasey.app`. Vercel gives you DNS records to add at your registrar. Add them. DNS propagation is usually minutes, occasionally hours.

7. **Set up `coachcasey.run` to redirect to `coachcasey.app`.** Add it as a second domain in Vercel, configure as a redirect.

At the end of Phase 4: pushing to `main` auto-deploys, `coachcasey.app` serves the Next.js landing page over HTTPS.

---

## 6. Phase 5 — Wire service credentials into Vercel (~30 minutes)

Goal: every environment variable from `engineering-foundation.md` §4 is set in Vercel, scoped correctly to Production and Preview environments. Local development uses `.env.local` with dev credentials.

1. **In Vercel:** Project → Settings → Environment Variables. For each variable from the list in `engineering-foundation.md` §4:
   - Set the value.
   - Scope: check **Production** and **Preview**. Leave Development unchecked (you'll use local `.env.local` instead).
   - For variables prefixed `NEXT_PUBLIC_`: Vercel treats these as exposed to the browser. Double-check you're only using that prefix for genuinely public keys (Supabase anon key, PostHog key, Stripe publishable key). **Never** prefix secret keys with `NEXT_PUBLIC_`.

2. **Locally:** copy `.env.example` to `.env.local` and fill in the same values. `.env.local` is gitignored and will never be committed.

3. **Add `LLM_MODE=mock`** to `.env.local` (so local dev doesn't burn API credits). Add `LLM_MODE=real` to Vercel's Production and Preview environments.

4. **Set billing alerts.** On both Anthropic and OpenAI consoles, set alerts at $5, $20, $50 monthly spend. These email you when you cross each threshold.

5. **Trigger a redeploy** so Vercel picks up the new env vars. Either push a trivial commit or click "Redeploy" in the Vercel dashboard.

At the end of Phase 5: env vars are everywhere they need to be, nothing is hardcoded, no secrets are in the repo.

---

## 7. Parallel track — Strava developer application

Submit in parallel with Phases 1–5. Nothing here blocks on Strava approval, but Strava approval is V1-blocking for all Strava-integration work later — so the clock should start ticking now.

1. Read `strava-api-compliance-note.md` in full.
2. Follow the "Action" section at the end of that doc. Draft the application using Strava's own framing language ("coaching platforms focused on providing feedback to users"), optionally email developer support for written confirmation first, then submit.
3. Log the submission date and (when it arrives) the approval date in `open-questions-log.md` as the closure of the V1-blocking Strava question.

Approval timelines vary — days to weeks. You'll know the outcome by the time feature work reaches the Strava-integration phase.

---

## 8. Done when

Foundation setup is complete when all of the following are true:

- [ ] All services from `engineering-foundation.md` §3 have accounts; all API keys are captured in your password manager.
- [ ] `coachcasey.app` and `coachcasey.run` are registered.
- [ ] GitHub repo `coach-casey` exists, is private, has the directory structure from §2 of the foundation doc, has branch protection on `main`, has secret scanning enabled.
- [ ] Pushing to `main` triggers an automatic Vercel deploy.
- [ ] `https://coachcasey.app` serves the default Next.js landing page over HTTPS.
- [ ] Every env var from §4 of the foundation doc is configured in Vercel (Production + Preview) and in local `.env.local` (Development).
- [ ] Billing alerts are set on Anthropic and OpenAI.
- [ ] Strava developer application is submitted (approval can come later).

When all eight are true, the foundation shell is in place and ready for the next spec.

---

## 9. What comes next

The next spec picks up with the thirteen-point scaffold from `engineering-foundation.md` §10, in this order:

1. **Database foundation.** First Supabase migrations (extensions, `athletes` table, baseline RLS). Migration workflow via Supabase CLI. Dev/production database separation.
2. **Observability wiring.** Sentry SDK in Next.js + Python. PostHog snippet. Langfuse wrapper around LLM calls. Verify each with a test event.
3. **LLM pipeline.** Anthropic client with prompt caching. OpenAI embeddings client. Mock layer keyed off `LLM_MODE`. Verify real + mock paths.
4. **Auth + welcome email.** Supabase Auth magic-link flow. First-sign-up email via Resend. End-to-end verification that a new user can sign up and receives a welcome email.
5. **CI pipeline.** GitHub Actions for lint, typecheck, test.

Each of those is substantial enough to warrant its own spec rather than being appended here.

---

## 10. If something goes wrong

A few failure modes worth naming:

- **Vercel Python function fails to deploy.** Usually a `requirements.txt` missing a dependency, or a Python version mismatch. Check the Vercel build log; it names the offending package.
- **Domain doesn't resolve after adding DNS records.** DNS propagation can take up to 24 hours; usually minutes. Use `dig coachcasey.app` or [whatsmydns.net](https://www.whatsmydns.net) to check propagation status.
- **Env var shows as `undefined` in deployed app.** Either the variable isn't scoped to Production, or you forgot to redeploy after adding it. Vercel does not hot-reload env vars.
- **Accidentally committed a secret.** Rotate the key immediately on the service side (don't trust that reverting the commit is sufficient — git history preserves it). Regenerate, update everywhere, move on.

For anything outside these, the Vercel and Supabase Discord/community forums are active and responsive.
