# Coach Casey — V1 Scope

**Owner:** Jason
**Last updated:** 2026-04-23
**Status:** Living document. Captures V1 scope as decided to date — athlete-facing surfaces, supporting infrastructure, the prompt engineering workstream, explicit exclusions, and open items for launch-prep. Update as decisions evolve; supersede entries rather than deleting them.

---

## 1. What V1 is

V1 is the smallest product that can genuinely test the thesis: that a retrospective, life-aware interpretive layer for marathon runners is worth paying for, and that the accumulating athlete-specific memory is a real moat.

V1 is not a minimum viable product in the stripped-down sense. It's the minimum *thesis-proving* product. That distinction matters: every surface in V1 is here because it's load-bearing for either the thesis (does this work?) or the moat (does it compound?). Surfaces that would broaden the product without proving the thesis are out.

Target: 100–200 paying users within 6 months of launch. Real validation signal is retention past month 3 (primary) and month 6 (critical) — see strategy foundation §8.

---

## 2. In scope — athlete-facing surfaces

Five surfaces. All retrospective. All deliberately chosen for thesis-proving value.

### 2.1 Onboarding (two-phase)

**Phase 1 — core setup, chunked conversational validation.**

~10–12 turns, roughly 5–8 minutes. Accomplishes four jobs: signals the voice, gathers the minimum context needed for the first debrief to be good, connects the integrations, sets expectations.

Turn-by-turn shape:
- Warm opening and thesis framing ("supplementary, retrospective, gets to know you over time")
- Strava OAuth
- Chunked validation step — Coach Casey presents ~5–6 interpretive observations drawn from Strava activity history, one at a time, inviting confirmation or correction between each. Adapts subsequent observations based on athlete responses. Athlete can exit the loop at any point.
- Plan handling prompt — upload now or defer, with honest framing about what the plan unlocks (see §2.2)
- Goal race question (light-touch version; "what's this race about" handled later — see §6)
- Injury / niggle check
- Expectation-setting: retrospective, doesn't replace your coach, gets better with time, 7–14 day trial, trial-to-subscription mechanics

**Phase 2 — progressive gathering via post-run follow-ups.**

Context-gathering doesn't end at Phase 1. It continues through the first weeks, delivered as an optional question attached to each post-run debrief.

- **Weeks 1–2: structured gathering.** 10–14 specific questions, ranked by interpretive value, sequenced across the first two weeks of runs. Priority questions fill gaps that would otherwise degrade debrief quality (injury history, typical training pattern, coach/plan context, life rhythm). List to be produced at launch-prep (see §6).
- **Week 3 onwards: conversational follow-ups.** Generated per run, responsive to what just happened — not general "getting to know you" questions. "That was slower than usual, was that deliberate?" / "You didn't run Tuesday, anything going on?" The question is always about the run just completed.
- **Transition is soft.** Conversational questions can fire in week 1 if a run warrants it; structured questions can fire in week 6 if a gap is still open.
- **Cadence rule: one follow-up per run, skippable, non-repeating.** If the athlete ignores it, don't re-ask. If they answer, the information lives in memory forever.

**Chunked conversational shape applies beyond onboarding.** The validation step establishes a pattern — short turns, reflective claim, athlete responds, Coach Casey adapts. This pattern is the voice of Coach Casey, and it shows up in debriefs, weekly reviews, and chat too. Onboarding is where it first lands.

### 2.2 Plan ingestion (optional, progressively prompted)

Coach Casey works with and without a plan. With a plan, interpretation is materially deeper (Coach Casey can evaluate what happened against what was meant to happen). Without a plan, Coach Casey interprets against recent training, history, and life context — still real, still useful, but thinner on the "was this what it was meant to be?" axis.

**V1 requires:**
- Screenshot, PDF, and text-paste input paths
- Sonnet vision extraction pipeline with athlete confirmation UI before save (non-negotiable due to ~90% extraction accuracy)
- Plan versioning: new upload supersedes previous, history preserved
- Timestamp / "is this your current plan?" confirmation at upload
- Handles partial plans (athlete uploads 4 weeks of an 18-week block — full value on those 4 weeks)
- Unit variance handling (km/mi, pace formats, HR zones)

**V1 explicitly does not require:**
- Plan upload for onboarding to complete
- An athlete-facing "here's your week" plan display (that's what their existing tool is for — Coach Casey doesn't replace the plan delivery surface)
- Mid-block single-session edits from inside Coach Casey (athletes re-upload if plan changes materially)
- Native API integrations (TrainingPeaks, Runna, Final Surge — all deferred or dropped, see technical decision log)

**Prompting behaviour:**
- Onboarding surfaces plan upload as an optional step with specific framing: "Coach Casey can tell you whether you're pushing harder than the plan intends, not just whether you ran today. Want to share your plan?"
- Smart re-prompts at natural moments: after the first debrief ("I could go deeper on this if I knew what today was meant to be"), at end of week 1, when athletes mention planned session types in chat
- Cadence: once per week maximum, backs off entirely if dismissed twice
- Framing is always honest — names the specific thing that's unlocked, never vague promises

### 2.3 Post-run debriefs

Thesis in miniature. Triggered on Strava activity sync. Interprets the activity against: the plan if uploaded, recent training arc, historical patterns, known injuries/niggles, life context accumulated via chat and follow-ups.

**Quality bar: great.** Debriefs are the surface users will judge the product by. Thin, generic debriefs kill trial conversion. This is the surface with the highest prompt-engineering investment and the most disciplined eval work.

**Structural shape:**
- Opens with the claim that grounds the rest — one sentence that names what Coach Casey sees as the most important thing about this run
- Develops the interpretation in 2–4 short paragraphs, drawing on plan/context/history
- Ends with an optional follow-up question (see §2.1 Phase 2)
- Never prescriptive — no "do X tomorrow"

**Edge cases to handle:** very short runs (recovery runs, cooldowns), aborted activities, non-run activities (cycling, cross-training), duplicate/edited activities from Strava, activities with missing HR or pace data.

### 2.4 Reactive chat

Athlete-initiated conversation. Secondarily the catch-all for questions structured surfaces can't handle. **Primarily the channel where life context arrives** — "sleeping badly," "calf is tight," "work is kicking my ass" — which feeds the moat.

**Quality bar: solid.** Conversational context creates forgiveness that one-shot debriefs don't have. Excellent chat is a V1.1 goal.

**V1 capabilities:**
- Access to the athlete's full memory / context store
- Can reference specific activities, past conversations, injury history, plan details
- Never prescriptive — retrospective and interpretive only
- Life context captured in chat persists to memory (via structured tool use) and surfaces in subsequent debriefs/reviews

**V1 explicitly does not include:**
- Scheduled/proactive check-ins outside of debriefs and weekly reviews
- Multi-turn reasoning chains that require external data (e.g. weather APIs, race result lookups) — deferred

### 2.5 Weekly reviews

Proactive end-of-week reflection. The surface where the moat is most visible — this is where Coach Casey does the "I see the pattern across your week, compared to your March block, in the context of the stress you mentioned" work that single-activity debriefs can't.

**Quality bar: acceptable at launch, sharpened in V1.1.** Early-cohort reviews will be thinner than later-cohort reviews simply because there's less accumulated context to work with. Frame this honestly in-copy: *"These get sharper as I learn more about you."*

**Load-bearing for annual conversion.** Weekly reviews are the surface the month-2 upsell trigger rides on (see strategy foundation §9). Cutting them would require relocating that mechanic.

**Structural shape:**
- Arrives at a consistent weekly cadence (day TBD at launch-prep)
- Summarises the week's training in Coach Casey's interpretive voice, not as stats
- References patterns, life context, and plan where relevant
- Ends with a reflective prompt, not an instruction

---

## 3. In scope — supporting infrastructure

Everything the athlete-facing surfaces depend on. Non-negotiable for V1.

**Authentication and user management.** Supabase auth, RLS on every table from day one, athlete-scoped data access end-to-end.

**Strava integration.** OAuth, activity sync, webhook subscriptions for real-time activity triggers. Depends on Strava developer application approval — see §8.

**Subscription billing.** Stripe, two products: AU$24/month and AU$199/year (see strategy foundation §7). 7–14 day free trial (specific length TBD at launch-prep). No free tier.

**Data model.** As specified in technical decision log — athletes, activities, activity_notes, profile_snapshots, personal_records, training_context, preferences, injuries_niggles, memory_items, conversations, debriefs, training_plans, planned_sessions. Activities append-only, physiology as rolling snapshots, LLM writes via structured tool use.

**Notifications.**
- Email (Resend) — reliable default channel, used for debriefs, weekly reviews, important announcements
- Web Push API — enhancement for installed PWAs (see technical decision log on install-first constraint)
- Per-channel toggles in preferences table

**LLM pipeline.**
- Anthropic SDK direct, Sonnet 4.5 for generation, Haiku for classification
- Prompt caching on all reusable prefixes (system prompt, athlete context)
- Structured tool use for all LLM-originated data writes
- OpenAI `text-embedding-3-small` for embeddings, pgvector for storage and retrieval

**Observability.**
- Langfuse for every LLM call (prompt, response, tokens, latency, cost) — non-negotiable
- Sentry for application errors
- PostHog for product analytics and feature flags

**Progressive Web App shell.** Mobile-first, installable, offline shell. See technical decision log for rationale on PWA-over-native.

---

## 4. In scope — prompt engineering workstream

Named as a V1 deliverable, not a sub-task. Coach Casey is made of prompts; the production quality is prompt quality.

**Repository structure:**
- `prompts/` directory, one file per high-stakes surface
- Each file: purpose, input context shape, expected output shape, the prompt itself, eval fixtures, version history, notes on what didn't work
- `prompts/prompt-engineering-principles.md` — cross-cutting: eval discipline, Claude-specific patterns (tool use, caching), grading rubrics, quality bars by surface

**High-stakes surfaces requiring dedicated prompt files at V1:**
- `onboarding-validation.md` — the chunked validation observations and adaptation logic
- `onboarding-phase1-conversation.md` — turn-by-turn conversation design
- `post-run-debrief.md` — the highest-stakes prompt in the product
- `post-run-followup-structured.md` — weeks 1–2 ranked question set
- `post-run-followup-conversational.md` — generated per-run questions
- `reactive-chat.md` — system prompt and tool use definitions
- `weekly-review.md`
- `plan-extraction.md` — vision extraction (distinct prompt category — extraction, not voice)
- `plan-upload-reprompts.md`

**Discipline:**
- Eval fixtures authored alongside each prompt from day one
- Prompt changes go through the eval suite before deployment
- Langfuse logging on every production prompt
- Version history in each file — know which version was live when
- No prompt ships to production without a quality bar agreed for its surface

**Why a workstream, not a skill.** A dedicated prompt-engineering skill is deferred until post-V1 when prompt iteration becomes its own continuous discipline (maintaining, improving, re-evaluating existing prompts, independent of feature work). Pre-V1, the discipline lives in this workstream; voice questions route to content, architecture questions route to engineering.

---

## 5. Out of V1

Named explicitly — the out-list matters as much as the in-list, because it's where scope creep gets contested.

**Product exclusions (thesis-preserving, not trade-off):**
- Plan generation or prescriptive coaching advice — violates the thesis, see strategy foundation §1
- In-run coaching or real-time cueing — ditto
- Direct medical, nutrition, or injury advice that crosses into clinical territory
- Squad/social/sharing features, leaderboards, cross-athlete visibility — single-user-scope by design, also required by Strava API compliance

**Product exclusions (deferred, not violating thesis):**
- Native mobile app (Expo trigger: 100 paying users or sustained mobile patterns PWA can't serve)
- Audio voice / speech-in / speech-out (post-V1, once interpretation quality is proven)
- B2B coach tier (post-launch validation of core product + unprompted coach interest)
- Proactive check-ins outside debriefs and weekly reviews

**Integration exclusions:**
- TrainingPeaks native API (deferred — see technical decision log)
- Final Surge API (dropped — one-way, can't read planned workouts)
- Terra multi-wearable aggregator (deferred)
- Garmin Connect direct, Apple Health, Polar, etc. — all via Strava for V1

**Infrastructure / feature exclusions:**
- In-app plan editing (athletes re-upload)
- Geographic expansion beyond AU/NZ (initial concentration, not a permanent bet)
- Web-based onboarding without Strava (Strava connection is V1-assumed)

---

## 6. Open — design at launch-prep

Items V1 will ship with, but which need specific design work closer to launch. Not V1 day-one, not post-V1 — launch-prep.

- **Annual conversion mechanics.** Four mechanics documented in strategy foundation §9 — onboarding framing, memory-as-progress UI, month-2 upsell trigger, annual-exclusive features (default out). Design detail deferred to launch-prep.
- **Trial length and shape.** 7 days vs 14 days. Free trial vs money-back first month. Bias: short enough to force conversion, long enough for the first weekly review to land.
- **"What's this race about" question.** Known to be high-value, known to be hard to answer well. Deferred to dedicated design work. Candidate mechanics: lightweight multi-select defaults, soft re-prompt later in training block, non-blocking in onboarding.
- **The 10–14 structured context questions for Phase 2 (weeks 1–2).** Ranked by interpretive value — what specifically improves debrief quality most. To be produced as a ranked list at launch-prep. **Size explicitly when picked up** — this is the kind of item that silently expands if treated as a one-liner. Realistic effort is a dedicated design session, not a casual afternoon. Product of the session: a ranked, sequenced list with a defensible reason each question earned its place and a cut-line below which questions are deferred.
- **Weekly review cadence (day of week, time).** Triggered by Strava rhythms (end of training week) or by athlete preference.
- **Validation step quality bar.** The single highest-stakes prompt in onboarding. Dedicated eval set, iteration time, and prompt-engineering discipline before launch.
- **Debrief quality bar definition.** What "great" means operationally — rubric for grading debrief outputs against. **Load-bearing, do early.** Without a concrete rubric, "great debriefs" is vibes, not a bar — the eval suite can't grade against something undefined, and prompt iteration has no feedback loop. Belongs at the start of prompt engineering work on the debrief surface, not as documentation written retrospectively.

---

## 7. Build sequencing

Rough order, not dates. Dependencies named where they matter.

**1. Strava API app creation (~15 minutes).** Do early — unblocks all Strava-dependent build work via Single Player Mode (Jason as sole test athlete). See `strava-application-pack.md` §2.

**2. Infrastructure foundation (parallel with Strava app creation).**
- Supabase schema + RLS
- Auth + user management
- Stripe subscription wiring (doesn't need to be production-facing on day one, but data model needs to be right)
- Resend email infrastructure
- Langfuse + Sentry + PostHog wiring
- LLM pipeline with prompt caching

**3. Strava integration (after Step 1 app creation).**
- OAuth flow (against Jason's own account initially)
- Activity sync + webhook subscription
- Backfill of historical activities
- Deauthorization webhook (required by Strava before Step 2 submission)

**4. Onboarding Phase 1 + validation step.** The first thing a user hits; the highest-stakes prompt in the product. Build early, iterate hard.

**5. Post-run debriefs.** The core thesis surface. Sonnet prompt + caching + eval fixtures. Must be great before anything else ships.

**6. Plan ingestion.** Screenshot + PDF + text paste, Sonnet extraction, confirmation UI, versioning. Parallel-able with debrief work once infrastructure is in place.

**7. Reactive chat.** Once memory system is stable from debrief work, chat rides on top with less incremental cost.

**8. Post-run follow-ups (structured + conversational).** Layered onto the debrief surface.

**9. Weekly reviews.** Last, ship at acceptable quality, sharpen in V1.1.

**10. Annual conversion mechanics design + trial shape finalisation.** Launch-prep.

**Prompt engineering workstream runs alongside all of this.** Every surface gets a prompt file with eval fixtures before it ships.

**Load-bearing assumption: solo delivery.** This sequencing assumes one person (Jason) building thoughtfully, with Claude Code as an accelerator on specific tasks. Two things follow:
- Parallelisation is limited to what one person can realistically hold in context at once. "Build X and Y in parallel" means actually switching between them on a week-to-week basis, not running two concurrent workstreams.
- If contractors come in, Claude Code workflows change materially, or a co-builder joins, the sequencing assumptions need revisiting. Specifically: items currently sequential because of attention constraints (not technical constraints) could become parallel, and the order of non-dependent items could shift.

Revisit this note if the delivery model changes. Don't re-sequence silently — re-log the change with new reasoning.

---

## 8. V1-blocking dependencies

Items that block V1 shipping. Tracked explicitly.

- **Strava Developer Program approval (Step 2 — launch-blocking only, not build-blocking).** Required before any athlete beyond Jason can connect. Not a gate on build work: Single Player Mode lets the full integration be built and tested against Jason's own Strava account. Submit when product is functionally complete enough to demonstrate via screenshots. See `strava-application-pack.md` for submission content and timing.

  **Step 1 (app creation)** is not launch-blocking and not build-blocking — it's the unblocking step itself. Done during foundation setup. Tracked in `open-questions-log.md`.
- **Stripe account setup** (standard, not a real blocker but named for completeness).
- **PWA installable on iOS 16.4+** — required for web push notifications to work. Not a blocker for V1 shipping but a blocker for push as a channel.

---

## 9. Quality bars by surface

Different surfaces hit production at different quality bars. Explicit here to prevent quality mismatches.

| Surface | V1 quality bar | V1.1 target |
|---|---|---|
| Onboarding validation step | Great | Great |
| Post-run debriefs | Great | Great |
| Plan ingestion | Functional + honest (90% accurate with clear confirmation) | Better accuracy + edge case handling |
| Reactive chat | Solid | Great |
| Weekly reviews | Acceptable (thinner for early cohorts, framed honestly) | Great |
| Post-run follow-ups (structured) | Good | Refined based on usage |
| Post-run follow-ups (conversational) | Good | Great |

**"Great" means:** meets the defined rubric in the relevant prompt file, passes eval suite at the defined threshold, would be something Jason would be proud to show a new user.

**"Solid" means:** consistently useful, doesn't break trust, occasional thinness is acceptable.

**"Acceptable" means:** works, doesn't embarrass, is honestly framed to users about its current limits.

---

## 10. How this document is used

- **New V1 scope decisions** — added here in the same shape.
- **Scope changes mid-build** — require explicit re-logging. Adding a surface means either cutting another or justifying against the thesis (see strategy foundation §1). Removing a surface needs a note on what downstream effects are.
- **Items in §6 (open — design at launch-prep)** — revisited at the launch-prep checkpoint. Each gets closed into V1 scope or explicitly punted to V1.1.
- **Reviewed** at V1 build kickoff, at each major milestone, at launch-prep, and immediately after launch. Reviewed quarterly thereafter.

Supersedes project memory when they conflict. Separate from `strategy-foundation.md` (what we're building and why), `technical-decision-log.md` (engineering decisions), and `strava-api-compliance-note.md` (Strava application prep).
