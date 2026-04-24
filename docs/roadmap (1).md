# Coach Casey — Roadmap

**Owner:** Jason
**Last updated:** 2026-04-24
**Status:** Living document. Captures what's being built now (V1), what's intended shortly after (V1.1), what's on the horizon (Next, Later), and what's explicitly out (Never). No dates. No vanity items.

**Recent revision (2026-04-24):** §6 Never bucket refactored to reflect the thesis refinement in `strategy-foundation.md`. "Plan generation or prescriptive coaching advice" split into two distinct items — autonomous plan generation (still Never) and unsolicited prescriptive output (still Never). Responsive prescription (engaging athlete forward-looking questions in chat) is now in V1 scope and therefore not in Never.

Supersedes project memory when they conflict. Separate from `v1-scope.md` (detailed V1 specification), `strategy-foundation.md` (strategic rationale), `voice-guidelines.md` (voice rules), and `technical-decision-log.md` (engineering decisions with triggers).

---

## 1. How this roadmap works

**Five buckets, no dates.**

- **V1** — in scope now, being built
- **V1.1** — planned shortly after V1 launch, to lift quality or close known gaps
- **Next** — the phase after V1.1, not yet specified
- **Later** — on the horizon, with a trigger for when to revisit
- **Never** — explicitly rejected, named so the rejection doesn't get relitigated silently

**Rules:**

- Every item connects to the thesis (see `strategy-foundation.md` §1) or it doesn't belong. "X serves the thesis because Y" — not "X would be cool."
- No vanity items. Not "explore coach partnerships" — either it's a shippable thing or it isn't.
- Moving an item up (e.g. Later → V1.1) requires re-logging, not silent promotion. The jump is a decision, not a drift.
- Items in **Never** can only move out via an explicit strategic shift logged in `strategy-foundation.md`. The thesis-preserving exclusions are the whole point.

---

## 2. V1 — in scope now

The athlete-facing surfaces, infrastructure, and prompt engineering workstream defined in `v1-scope.md`. Summary only here; the scope doc is the source of truth.

- Two-phase onboarding (chunked conversational validation + progressive gathering via post-run follow-ups)
- Plan ingestion (optional, progressively prompted — screenshot, PDF, text paste)
- Post-run debriefs — interpretive; quality bar: great
- Reactive chat — responsive to forward-looking athlete questions; quality bar: solid
- Weekly reviews — interpretive; quality bar: acceptable at launch, sharpened in V1.1
- Supporting infrastructure (Strava, Stripe, Supabase, LLM pipeline, observability)
- Prompt engineering workstream as a named deliverable

---

## 3. V1.1 — shortly after launch

Post-launch improvements to lift quality and close known gaps. Each item has a clear trigger or rationale.

- **Weekly reviews to "great" quality.** Shipped at "acceptable" in V1; sharpened as accumulated athlete context gives them more to work with (see `v1-scope.md` §9).
- **Reactive chat to "great" quality.** Shipped "solid" in V1; deepened as real usage patterns surface what users actually ask — especially what forward-looking questions they bring to Coach Casey, which is the responsive-prescription use case the thesis now explicitly enables.
- **Plan ingestion edge case handling.** Improved extraction accuracy, better handling of unusual plan formats, mid-block plan updates (currently out of V1 — users re-upload).
- **Post-run follow-up refinement.** The conversational version improves based on real usage data (which questions land, which get skipped, which surface the most useful life context).
- **Annual conversion mechanics — live versions of the four mechanics** (see `strategy-foundation.md` §9). Designed at V1 launch-prep; tuned based on early-cohort conversion data.

V1.1 is explicitly *quality and polish*, not new surfaces. Adding new surfaces to V1.1 requires re-examining against the thesis.

---

## 4. Next — after V1.1, not yet specified

Deliberately thin. What goes here depends on what V1 teaches us.

- **TBD pending V1 learnings.** The real Next scope depends on retention data, qualitative signals about the thesis, and what users actually ask for that's consistent with the thesis.

Candidates that *might* land here, but should not be pre-committed:
- Audio voice (speech-in / speech-out) — moved from Later if interpretation quality is proven and voice feels like the right next product dimension.
- Expanded race distance support (half marathons, ultras) — if V1 users reveal meaningful non-marathon demand that fits the thesis.

---

## 5. Later — on the horizon, with triggers

Items deliberately deferred, each with a specific trigger for revisit.

| Item | Trigger for revisit |
|---|---|
| **B2B coach tier** (coaches configure philosophy, resell Coach Casey access) | Post-launch validation of core product + unprompted coach interest |
| **Native mobile app** (via Expo Router, iOS + Android + web from single codebase) | 100 paying users, or sustained mobile usage patterns the PWA can't serve well |
| **Audio voice** (speech-in / speech-out) | Post-V1 once interpretation quality is proven; next product dimension worth adding |
| **TrainingPeaks native API integration** | Three unprompted user requests + evidence TP-native athletes are a meaningful segment + commercial story that makes approval likely |
| **Terra (multi-wearable aggregator)** | Any of: 3+ wearable platforms beyond Strava needed; 200+ paying users so Terra is <10% of revenue; expansion to non-Strava-native segments (US triathletes) |
| **Geographic expansion beyond AU/NZ** | AU/NZ traction proven, or a clear opportunity (partnership, event, distribution) in an adjacent market |
| **Squad or coach-to-multiple-athletes features** | Only after B2B coach tier lands; requires Strava API compliance re-review |

---

## 6. Never — explicitly rejected

Thesis-preserving exclusions. These aren't "not yet" — they're "not ever, unless the thesis itself changes."

- **Autonomous plan generation.** Writing marathon plans from scratch. Coach Casey does not create training programmes; that belongs to the coach, the book, or the plan-generation app. Responsive prescription (engaging athlete forward-looking questions in chat — "should I swap tomorrow's tempo?") is in scope; autonomous plan generation is not. Moving this out of Never requires rewriting the thesis (`strategy-foundation.md` §1).
- **Unsolicited prescriptive output.** Coach Casey does not volunteer "do X tomorrow" on its own initiative, across any surface. Proactive surfaces (debriefs, weekly reviews) interpret; the athlete has to open the door before Coach Casey engages with forward-looking prescription. Moving this out of Never also requires rewriting the thesis.
- **In-run coaching or real-time cueing during a workout.** Not the product moment. Coach Casey is between-runs; it does not cue or instruct during a run.
- **Direct medical, nutrition, or injury advice crossing into clinical territory.** Liability zone Coach Casey deliberately avoids. Responsive prescription does not extend into clinical territory — "you asked about the calf, here's what I'd think about" is fine; "you have a tibial stress response" is not.
- **Selling, syndicating, or aggregating Strava-derived data.** Required by Strava API compliance (`strava-api-compliance-note.md`), but also a hard ethical line.
- **Training models on Strava user data.** Same source.

---

## 7. How this document is used

- **New items** arrive with a proposed bucket and a one-line justification against the thesis. If the justification doesn't hold, the item doesn't enter the roadmap.
- **Items moving between buckets** require a note on why the move is happening. "User asked for X and I said yes" is not sufficient — the movement needs a thesis-consistent reason.
- **Reviewed** at each major milestone (V1 launch, 100 users, 6 months post-launch) and after any strategic shift.
- **Read alongside** `strategy-foundation.md` (for the thesis anchor) and `open-questions-log.md` (for items that aren't yet roadmap-ready because they're still questions).
