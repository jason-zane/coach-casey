# Coach Casey — Open Questions Log

**Owner:** Jason
**Last updated:** 2026-04-23
**Status:** Living document. Tracks unresolved questions and design work pending across the project. Each entry has a status, a trigger for when it must be closed, and an owner. Stale items (open >30 days without movement) get flagged during review.

Separate from `roadmap.md` (what's being built and when) and the various working docs (where in-progress thinking lives). Items in this log are *questions*, not *plans*. When a question gets answered, it moves out — into the relevant doc, or into the roadmap, or into the decision being implemented.

---

## 1. How this log works

**Each entry captures:**
- **The question** — what's actually unresolved
- **Why it matters** — what's blocked, or what degrades without an answer
- **Status** — open / in progress / answered / deferred
- **Trigger for closure** — when does this *have* to be decided (a date, a milestone, a condition)
- **Owner** — who's resolving it (Jason in all cases pre-launch)
- **Opened** — date the question was logged
- **Notes** — any relevant context or thinking in progress

**Rules:**

- A question that's been open >30 days gets reviewed on the next pass: close it, defer it with a trigger, or consciously decide to keep it open with a reason.
- "Deferred" is fine *if* a trigger is named. "Deferred" without a trigger is drift. Don't let items sit in "deferred" indefinitely.
- When a question is answered, move the answer to the relevant doc and close the entry here (mark as answered, note where it lives).
- No questions in this log that aren't genuinely open. If the answer is clear and it's just not written down, write it down in the right doc, don't log it here.

---

## 2. V1-blocking

Items that must be resolved before V1 can ship (or before a specific build phase can start).

### [2026-04-23] — Strava Step 1: API app creation

**Question:** Has the Strava API app been created and Client ID/Secret captured?

**Why it matters:** Step 1 is the prerequisite for any Strava-dependent build work. Without Client ID + Secret, no OAuth flow exists; without that, no activity sync; without that, nothing downstream. Unlike Step 2, this is instant and non-reviewed — the only reason it's still open is that it hasn't been done yet.

**Status:** Open — app not yet created.

**Trigger for closure:** Must be done during foundation setup. Expected resolution: within days of this entry.

**Notes:** Full step-by-step in `strava-application-pack.md` §2. Single Player Mode means Jason is the sole test athlete until Step 2 approves.

---

### [2026-04-23] — Strava Step 2: Developer Program review submission

**Question:** Has the Developer Program review been submitted and approved?

**Why it matters:** Required before any athlete beyond Jason can connect to Coach Casey. Launch-blocking (can't onboard real users without it), not build-blocking (full integration can be built and tested against Jason's own account under Single Player Mode).

**Status:** Deferred — submission gated on having a functionally complete product to screenshot.

**Trigger for closure:** Submit when OAuth, activity sync, debrief generation, and basic UI are working end-to-end against Jason's own Strava account. Realistically 4–8 weeks into build. Approval typically 7–10 business days after submission; sometimes longer per community threads.

**Notes:** Submission content drafted in `strava-application-pack.md` §3. Screenshots collected as surfaces land. Optional pre-submission step: email `developers@strava.com` for confirmation on AI interpretation.

---

## 3. Launch-prep — design work deferred to closer to launch

Items V1 will ship with, but which need specific design work closer to launch. Listed here so they're visible; resolution is expected at the launch-prep checkpoint (roughly the last weeks before V1 ships).

### [2026-04-23] — Annual conversion mechanics detail

**Question:** What are the specific live versions of the four annual conversion mechanics (onboarding framing, memory-as-progress UI, month-2 upsell trigger, annual-exclusive features)?

**Why it matters:** The moat compounds at month 3–6; monthly subscribers most likely to churn before they feel it. Getting athletes onto annual, or giving monthly subscribers a reason to stay past month 3, is the key retention lever.

**Status:** Deferred — strategic direction locked in `strategy-foundation.md` §9, design detail deferred to launch-prep.

**Trigger for closure:** V1 launch-prep checkpoint, before first paying users.

**Notes:** Three of four mechanics default-in; annual-exclusive features default-out unless a naturally annual-cadence feature surfaces.

---

### [2026-04-23] — Trial length and shape

**Question:** 7 days or 14 days? Free trial or money-back first month?

**Why it matters:** Affects conversion rate, unit economics, and the athlete's first-impression experience of the product.

**Status:** Deferred — not yet decided.

**Trigger for closure:** V1 launch-prep checkpoint.

**Notes:** Bias: short enough to force conversion, long enough for the first weekly review to land (probably 10–14 days).

---

### [2026-04-23] — "What's this race about" question design

**Question:** What's the specific UX for asking athletes why their goal race matters? Lightweight multi-select? Open text? Skippable? Re-prompted later?

**Why it matters:** Highest-value single piece of context in the product (per `strategy-foundation.md` §5), but genuinely hard to answer cleanly. A clumsy implementation either feels performative (athletes with no story forced to invent one) or extracts no signal.

**Status:** Deferred — dedicated design work needed.

**Trigger for closure:** Before Phase 1 onboarding prompt is finalised.

**Notes:** Candidate mechanics named in `v1-scope.md` §6 — multi-select defaults, soft re-prompt later, non-blocking in onboarding. Product of the design session: specific copy, specific default options, specific re-prompt timing.

---

### [2026-04-23] — Ranked list of 10–14 structured context questions (Phase 2)

**Question:** What are the specific 10–14 context questions that fire as post-run follow-ups in weeks 1–2, ranked by interpretive value?

**Why it matters:** These questions shape the context Coach Casey can draw on for debriefs and weekly reviews. Asked in the wrong order, wasted prompts hit low-value questions first and miss the high-impact ones. Never asked at all means thinner debriefs for the first several weeks.

**Status:** Deferred — needs a dedicated design session.

**Trigger for closure:** Before Phase 2 prompts ship — likely during prompt engineering work on post-run surfaces.

**Notes:** From `v1-scope.md` §6 — "Size explicitly when picked up. This is the kind of item that silently expands if treated as a one-liner. Realistic effort is a dedicated design session, not a casual afternoon. Product of the session: a ranked, sequenced list with a defensible reason each question earned its place and a cut-line below which questions are deferred."

---

### [2026-04-23] — Weekly review cadence (day and time)

**Question:** What day of the week and what time do weekly reviews arrive?

**Why it matters:** Arrival timing affects whether weekly reviews are actually read, and whether they feel like they respect the athlete's rhythm or interrupt it.

**Status:** Deferred.

**Trigger for closure:** Before weekly review surface ships.

**Notes:** Options: triggered by Strava training-week rhythms (Sunday evening after the long run is common), or by athlete preference (set during onboarding). Probably the latter — athlete owns when Coach Casey talks to them.

---

## 4. Prompt engineering — load-bearing design items

Items that need to be produced as part of the prompt engineering workstream (`v1-scope.md` §4), flagged here because they unlock other work.

### [2026-04-23] — Debrief quality bar rubric

**Question:** What does "great" mean operationally for a post-run debrief? What's the rubric for grading debrief outputs against?

**Why it matters:** The eval suite can't grade against something undefined. Without a concrete rubric, "great debriefs" is vibes — prompt iteration has no feedback loop, and "is this good enough to ship?" has no answer.

**Status:** Open — load-bearing, flagged in `v1-scope.md` §6.

**Trigger for closure:** At the start of prompt engineering work on the debrief surface. Must exist before debrief prompt ships.

**Notes:** Rubric should cover: voice/tone alignment, interpretive depth (claim + reasoning), appropriate use of context (plan, history, life), avoidance of prescriptive drift, structural shape (lead claim, 2–4 paragraphs, optional follow-up question). Graded examples at "great," "acceptable," and "fails" quality.

---

### [2026-04-23] — Validation step quality bar

**Question:** What makes the onboarding chunked validation step land well — and what makes it fail?

**Why it matters:** Highest-stakes prompt in the onboarding experience. Gets the trust relationship right or wrong in the first 60 seconds of product use.

**Status:** Open.

**Trigger for closure:** Before onboarding Phase 1 prompts ship.

**Notes:** Needs its own eval set, its own iteration time. The prompt adapts across turns (observation 2 responds to athlete's reaction to observation 1), so evals need to cover the adaptation logic, not just single-turn output quality.

---

## 5. Deferred with trigger — not launch-prep

Questions that don't need to be answered soon, but have been named so they don't disappear.

### [2026-04-23] — V1 Next-bucket scope

**Question:** What specifically goes in the "Next" roadmap bucket (post-V1.1)?

**Why it matters:** Currently deliberately thin — depends on V1 learnings. But worth checking after V1 launches that the thinness isn't drift.

**Status:** Deliberately unresolved.

**Trigger for closure:** After 3 months of V1 usage data and qualitative signal.

**Notes:** See `roadmap.md` §4. Candidates exist but are explicitly not pre-committed.

---

## 6. How this document is used

- **New questions** get logged here as they surface, with the six fields above filled in.
- **Answered questions** are marked answered, the answer is moved to the relevant doc (strategy, scope, roadmap, technical decision log), and the entry can stay here as a record or be removed at review.
- **Stale items** (>30 days open with no movement) get flagged on review: close, deliberately re-defer with fresh reasoning, or explicitly acknowledge being avoided with a reason.
- **Reviewed** at each major checkpoint (V1 build kickoff, V1 launch-prep, V1 launch, 100 users, 6 months post-launch) and monthly during active build.

Not a place to stash vague ideas or "things to think about." If it's not a real, resolvable question with something concrete blocked by it, it belongs somewhere else.
