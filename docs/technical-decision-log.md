# Coach Casey — Technical Decision Log

**Owner:** Jason
**Last updated:** 2026-04-25
**Scope:** Engineering decisions only. Product and strategy decisions live in the project decision log.

Each entry follows the pattern: **Decision** → **Reasoning** → **What would change it** → **Superseded by**. Reasoning is summarised; fuller reasoning lives in the architecture doc and conversation history.

---

## Locked-in decisions

### [2026-04-23] — Frontend: Next.js 15 + React 19 + Tailwind, deployed on Vercel as a mobile-first PWA

**Reasoning:** Standard modern stack, excellent Vercel integration, strong ecosystem (Auth helpers, form libraries, React Email for Resend). Mobile-first PWA covers the initial user base without app store overhead. PWA capabilities (installable, offline shell, web push) are sufficient for V1 without chasing "iOS-native feel" — disproportionate effort for modest payoff, and partially wasted when we eventually go native.

**What would change it:** (1) Confidence that native mobile is coming within 6 months (would justify Expo Router from day one for iOS + Android + web from a single codebase). (2) SEO or marketing-site requirements that don't fit Next.js (very unlikely).

**Superseded by:** —

---

### [2026-04-23] — Backend logic: FastAPI (Python) deployed as Vercel Python functions

**Reasoning:** FastAPI is the standard modern Python web framework — clean syntax, native async (important for slow LLM calls), auto-generated OpenAPI docs. Python has the deepest LLM tooling ecosystem. Vercel supports Python as a first-class serverless runtime, so the deployment story is unified with the Next.js frontend. Known constraints: 60s execution limit on Vercel Pro, 500ms–2s cold starts.

**What would change it:** (1) Meaningful volume of long-running work (>60s) beyond what pg_cron + short functions can handle — then move specific workers to Render or Fly.io ($5–10/month). (2) Latency-critical reactive chat where cold starts become user-visible — mitigation is warm-up pings or a small always-on worker.

**Superseded by:** —

---

### [2026-04-23] — Database, auth, storage, scheduled jobs: Supabase (single vendor)

**Reasoning:** Consolidates Postgres + auth + file storage + scheduled jobs (pg_cron) + pgvector into one managed product. For a solo non-engineer builder, reducing operational surface area is decisive. RLS enabled on all tables from day one. Append-only for activities, rolling snapshots for physiology.

**What would change it:** (1) Cost at scale — Supabase becomes noticeably more expensive than self-hosted Postgres past ~10k active users; revisit then. (2) A feature requirement Supabase can't handle cleanly (unlikely for V1 and V2).

**Superseded by:** —

---

### [2026-04-23] — LLM: Anthropic SDK direct (not OpenRouter)

**Reasoning:** Prompt caching is the decisive feature — Coach Casey's system prompt and athlete context will be reused across every debrief, chat turn, and weekly review. Anthropic's prompt caching cuts input token costs by 50–90% on cached prefixes. OpenRouter's support for provider-specific features is inconsistent and adds an abstraction layer to fight through. Also: no middleman markup, simpler failure surface, first-class tool use support.

**What would change it:** (1) A need to route between multiple provider models dynamically (not our pattern). (2) Anthropic pricing or availability becoming non-viable (no current signal).

**Superseded by:** —

---

### [2026-04-23] — Model selection: Sonnet 4.5 for generation and onboarding, Haiku for classification

**Reasoning:** Sonnet handles the interpretation quality that *is* the product — debriefs, weekly reviews, chat, onboarding conversation, training plan screenshot extraction. Haiku is cost-efficient for routing and classification tasks where tone isn't critical. Sonnet's vision is strong enough for screenshot extraction without needing a separate vision model.

**What would change it:** (1) Sonnet pricing or latency materially worsens. (2) A newer Anthropic model supersedes both at similar price (routine — update model strings, no architecture change). (3) Evals show Haiku is insufficient for a classification task that matters — move that task to Sonnet.

**Superseded by:** —

---

### [2026-04-23] — Embeddings: OpenAI SDK direct, text-embedding-3-small

**Reasoning:** Anthropic doesn't currently offer embeddings natively. `text-embedding-3-small` is cheap, performant, well-supported. Embeddings are a small cost item — don't over-optimise.

**What would change it:** Anthropic releases a competitive native embeddings API — re-evaluate for consolidation.

**Superseded by:** —

---

### [2026-04-23] — Email: Resend (not SendGrid)

**Reasoning:** Simpler API, generous free tier (3k emails/month), first-class React support via `react-email` (write emails as components), standard in the Next.js ecosystem, 15-minute setup. SendGrid works but has heavier onboarding and is less aligned with the rest of the stack. Either is production-grade.

**What would change it:** Resend hits a deliverability issue at scale (no current signal; their reputation is good). SendGrid offers a feature Resend doesn't and we need it (unlikely for V1).

**Superseded by:** —

---

### [2026-04-23] — Payments: Stripe

**Reasoning:** Standard choice. Strong Supabase and Next.js integration patterns. Subscription billing, tax handling, global support out of the box. Wired in before first paying user — not V1 day-one critical but close.

**What would change it:** —

**Superseded by:** —

---

### [2026-04-23] — Error tracking: Sentry

**Reasoning:** Production-grade error tracking and alerting. Generous free tier covers early scale. Catches the 2am breakages you'd otherwise hear about from users. Not optional for anything past private beta.

**What would change it:** —

**Superseded by:** —

---

### [2026-04-23] — LLM observability: Langfuse

**Reasoning:** For a product whose quality lives and dies on LLM output, logging every prompt, response, tokens, latency, and cost is non-negotiable. Langfuse is the strongest option for evals and prompt management, has a self-hostable open-source version, and is where serious LLM-product teams converge. Enables the eval-driven prompt engineering discipline: change a prompt, run it against fixtures, know whether it got better or worse. Without this, prompt work is vibes.

**What would change it:** Helicone's simplicity wins out if eval workflow isn't being used (but it should be). LangSmith if we ever adopt LangChain as the orchestration layer (we haven't).

**Superseded by:** —

---

### [2026-04-23] — Product analytics: PostHog

**Reasoning:** Full product analytics (events, funnels, retention cohorts, session recordings) plus feature flags in one product. Free tier covers past 200 users comfortably. Session recordings are particularly valuable in the first 100 users when watching real usage beats guessing.

**What would change it:** —

**Superseded by:** —

---

### [2026-04-23] — Push notifications: Web Push API via service worker, install-first onboarding

**Reasoning:** iOS 16.4+ supports web push from PWAs, but only when the PWA has been added to the home screen. This constrains the onboarding flow: athletes need to install the PWA before they can receive push. Email remains the reliable default delivery channel; push is an enhancement for installed users. The `preferences` table supports per-channel toggles.

**What would change it:** Going native (removes the install-step constraint entirely — standard push on iOS and Android).

**Superseded by:** —

---

### [2026-04-23] — Plan ingestion for V1: screenshot (incl. batch) + PDF + text paste, Claude Sonnet for extraction

**Reasoning:** Covers every plan source our ICP uses (TrainingPeaks, Final Surge, coach-supplied spreadsheets, book-plan PDFs, hand-written) through one extraction pipeline. Claude Sonnet's vision handles dense, formatted content well — better than GPT-4o for this use case in current benchmarks and direct comparison. Athlete confirmation UI (never auto-save extracted data) handles the ~10% inaccuracy. Support for plan updates via new-upload-supersedes-previous preserves history.

**Edge cases to handle:** multi-week plans across multiple screenshots (stitching), unit variance (km/mi, pace formats, HR zones), confidence thresholds and confirmation UI.

**Data model addition:** `training_plans` table (append-only, one row per plan version) + `planned_sessions` child table.

**What would change it:** A user group we care about where screenshot extraction is reliably insufficient (e.g. a particular coach's plan format that's consistently misparsed).

**Superseded by:** —

---

### [2026-04-23] — Chat onboarding: Sonnet 4.5 with prompt caching + structured tool use for profile writes

**Reasoning:** Onboarding is the first impression of Coach Casey — voice and nuance matter. Haiku isn't sharp enough for this emotional register. Prompt caching makes the long system prompt economical across the 15–30 turns of an onboarding conversation. Tool use during onboarding (`save_profile_fact`, `save_injury_niggle`, `save_training_context`, `flag_for_review`) means the profile is built as the conversation unfolds — no separate extraction step.

**What would change it:** Evals indicate a specific sub-task within onboarding can be handled by Haiku without voice degradation — route that turn only.

**Superseded by:** —

---

### [2026-04-25] — Training load model: pace-based rTSS primary, three-tier hierarchy, RPE separate

**Reasoning:** Pace and duration are always available from Strava (with grade-adjusted pace covering elevation); RPE is skippable and engagement-fragile, so load can't depend on it. Pace-based rTSS, anchored on threshold pace, is the most fixed variable available without HR or power. It produces a deterministic load number for every run with no athlete-side input beyond the threshold itself.

Three-tier hierarchy ensures every activity gets a number:

1. **Run with threshold pace known** → pace-based rTSS, `load_au = (duration_seconds × IF²) / 36`, where `IF = threshold_pace / avg_GAP`. One hour at threshold = 100 AU.
2. **Run with no threshold yet** (early athlete tenure) → `duration_minutes × default_IF² × constant`, default IF ~0.70 (placeholder, tunable). Marked low-confidence; replaced once threshold derives.
3. **Cross-training** (ride, swim, gym, yoga) → `duration_minutes × activity_type_IF`. Different default per type. Pace-based doesn't transfer.

RPE stays exactly where `rpe-feature-spec.md` puts it — captured per activity, fed to prompts as longitudinal context. **It is not an input to the load AU calculation.** RPE-vs-load divergence becomes the diagnostic signal: pace-based load says *"tempo intensity,"* RPE says 9 → fatigue or illness flag. Independent signals are stronger than entangled ones.

Threshold pace derives via Daniels VDOT from any race-grade activity (Strava `workout_type = race`) or athlete-entered race time at onboarding. Auto-refreshes when a higher-VDOT race lands; downward revisions flag for review. Shadow threshold (fastest sustained 20-min effort in trailing 60 days) used until a real race result exists, marked as low-confidence.

CTL/ATL computed on read using EWMA, uncoupled (chronic excludes the acute window). Time constants: 7-day acute, 28-day chronic. Stored values: per-activity `load_au` and `load_method` on `activity_notes`; threshold/VDOT snapshots in `profile_snapshots` (append-only). No daily load aggregation table, no scheduled job.

**What would change it:** (1) A user segment where GPS pace data is unreliable enough to invalidate pace-based load — treadmill-heavy athletes without manual pace input, persistent GPS dropouts in dense-urban or mountain terrain. Tier-3 fallback covers the edge cases for now. (2) Strava stops providing grade-adjusted pace. Mitigation: compute GAP server-side from activity streams; modest implementation cost. (3) Evals show RPE-vs-load divergence is unreliable enough to be worth re-merging RPE into the load metric — no current signal.

**Superseded by:** —

---

## Deferred decisions (with triggers)

### [2026-04-23] — Native mobile app: deferred

**Trigger for revisit:** 100 paying users, OR clear sustained mobile usage patterns that the PWA can't serve well.

**Approach when triggered:** Rebuild the frontend in React Native via Expo. Backend, database, Strava integration, and LLM layer all stay unchanged — accessed over HTTP APIs regardless of frontend.

---

### [2026-04-23] — Audio voice (speech-in / speech-out): deferred post-V1

**Reasoning:** Genuine scope expansion (~2–3 weeks build) for something not core to the thesis. Cheap realistic version (Whisper → LLM → OpenAI TTS) has 3–6s round-trip latency, which kills conversational feel. Real-time (OpenAI Realtime API) is expensive and lock-in-heavy.

**Trigger for revisit:** Post-V1 when interpretation quality is proven and voice is the next product dimension worth adding.

---

### [2026-04-23] — TrainingPeaks API direct integration: deferred

**Reasoning:** (1) Partner-approved API with 7–10 day approval wait and selective gatekeeping — TrainingPeaks may not approve a competitor-adjacent AI coaching app. (2) Real build cost (~1.5–2 weeks) even after approval. (3) Screenshot + PDF pipeline handles TrainingPeaks users at launch with minor friction.

**Trigger for revisit:** Three unprompted user requests for native TrainingPeaks sync + evidence that TP-native athletes are a meaningful user segment + a commercial story that makes approval likely.

---

### [2026-04-23] — Terra API (multi-source data aggregator): deferred

**Reasoning:** Real value is multi-wearable integration (Garmin, Polar, Fitbit, Apple Health, TrainingPeaks through one layer). Our ICP is Strava-native — ~80% of Terra's breadth is wasted on our user base at launch. Cost is significant: $399–499/month fixed, ~7x our current fixed infrastructure cost. Doesn't solve the Strava API AI terms question (Terra operates under the same underlying terms). Reversal cost is real — leaving Terra later means a frontend OAuth rewrite plus data model migration.

**Trigger for revisit:** Any of (1) native integration needed for 3+ wearable platforms beyond Strava; (2) 200+ paying users such that Terra is <10% of revenue; (3) market expansion to non-Strava-native segments (US triathletes skew Garmin-native).

---

## Dropped decisions

### [2026-04-23] — Final Surge API integration: dropped

**Reasoning:** Final Surge's API is effectively one-way — designed for uploading activities into Final Surge, not for reading planned workouts out. Getting plans out requires manual one-by-one download from the website. The API doesn't do what Coach Casey needs, so no amount of engineering work makes it viable. Final Surge users are served by the screenshot + PDF pipeline instead.

**Trigger for revisit:** Final Surge ships a public read API for planned workouts (no current signal).

---

### [2026-04-23] — OpenRouter: rejected as LLM gateway

**Reasoning:** See "LLM: Anthropic SDK direct" above. OpenRouter's value is multi-provider routing, which isn't our pattern. The cost is inconsistent support for provider-specific features (prompt caching being the critical one), an abstraction layer to debug through, and a small markup on every call.

**Trigger for revisit:** We genuinely need to route between providers at runtime (e.g. fallback to GPT-4 if Claude is down, with real SLA requirements). Not V1.

---

## V1-blocking open questions

### [2026-04-23] — Strava API compliance review before submitting developer application

**What's open:** Strava's November 2024 API agreement prohibits using Strava data "for any model training related to artificial intelligence, machine learning or similar applications." Coach Casey's use case (per-athlete inference on pre-trained models, delivered back to the same athlete) most likely falls inside Strava's explicitly-allowed "coaching platforms providing feedback to users" category, but ambiguity exists.

**Action required before submitting developer application:**
1. Read the current Strava API agreement in full (not a summary).
2. Draft the developer application using Strava's own framing language (see `strava-api-compliance-note.md`).
3. Optionally email Strava developer relations for written confirmation before submitting.
4. Submit the application. Build starts after approval.

**Who:** Jason, before the Strava integration week of the build plan.

**Blocks:** All Strava integration work. Nothing else in V1 is blocked by this.

---

## How this document is used

- **New decisions** are added here with the same shape (Decision → Reasoning → What would change it → Superseded by).
- **Reversing a decision** doesn't mean deleting the original entry. Add a new entry and mark the old one as "Superseded by: [date of new entry]."
- **Deferred decisions** become real decisions when their trigger fires. At that point they move from "Deferred" to "Locked-in" or get an explicit re-review.
- **Fuller reasoning** for any decision lives in the architecture doc or conversation history. This log is deliberately terse.

Reviewed quarterly at minimum. Reviewed immediately after any material stack change, cost change, or Strava/Anthropic/Supabase pricing change.
