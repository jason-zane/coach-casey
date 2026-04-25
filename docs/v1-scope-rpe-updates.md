# v1-scope.md — RPE Updates

**For Jason:** Apply the changes below to `v1-scope.md`. Each section names where it goes.

---

## 1. Add to "Recent revision" at the top of the doc

Insert this above the existing 2026-04-24 entry:

> **2026-04-24** *(RPE addition)* — Added RPE capture to V1 as a default-in feature. RPE becomes the universal first question of the post-run prompt; the existing single-follow-up slot becomes Question 2, picked from a small priority-ordered set. Skip-tracking pauses RPE prompts after 5 consecutive explicit skips. Detailed implementation in `rpe-feature-spec.md`. Updates §2.1 (post-run follow-up structure), §2.3 (debrief context), §2.5 (weekly review inputs), §4 (prompt files), §5 (RPE-related exclusions), §6 (launch-prep design items), §9 (quality bars).

---

## 2. Replace §2.1 "Phase 2 — progressive gathering via post-run follow-ups"

The post-run follow-up cadence rule changes shape — same one-prompt-block-per-run rule, but the block is now two questions, not one.

Replace the existing Phase 2 paragraph block with:

> **Phase 2 — progressive gathering via post-run follow-ups.**
>
> Context-gathering doesn't end at Phase 1. It continues through the first weeks and beyond, delivered as an optional two-question block attached to each post-run debrief.
>
> - **Question 1: RPE.** Universal — appears on every eligible activity. 1–10 numeric pick with anchored descriptors. Skippable. Skip-tracking pauses RPE prompts after 5 consecutive explicit skips and re-prompts after a cooldown. Full mechanics in `rpe-feature-spec.md`.
> - **Question 2: Contextual follow-up.** One of three types, picked by priority:
>   - **Weeks 1–2: structured gathering.** A specific question from the ranked 10–14 priority list (see §6), filling gaps that would otherwise degrade debrief quality.
>   - **Weeks 3+, RPE answered with divergence:** RPE-branched follow-up. *"Felt harder than expected — what's going on?"* / *"Felt smoother than expected — what made the difference?"*
>   - **Otherwise:** conversational follow-up generated per-run, responsive to what just happened. *"That was slower than usual, was that deliberate?"* / *"You didn't run Tuesday, anything going on?"*
> - **Cadence rule: one prompt block per run, fully skippable, non-repeating.** If the athlete ignores it, don't re-ask the same question on the same run. If they answer either or both, the information lives in memory.
> - **Transition is soft.** Conversational follow-ups can fire in week 1 if a run warrants it; structured questions can fire in week 6 if a gap is still open. The picker is heuristic, not strict.
>
> **Chunked conversational shape applies beyond onboarding.** The validation step establishes a pattern — short turns, reflective claim, athlete responds, Coach Casey adapts. This pattern is the voice of Coach Casey, and it shows up in debriefs, weekly reviews, and chat too. Onboarding is where it first lands.

---

## 3. Update §2.3 "Post-run debriefs"

Add this paragraph at the end of the §2.3 "Structural shape" subsection (before the Edge cases bullet):

> **RPE as longitudinal context, not same-day input.** Today's debrief does not consume today's RPE — debriefs generate on Strava sync, before the athlete answers the prompt, and same-day waiting introduces stale-debrief risk. Trailing RPE history (typically 14–28 days) feeds the debrief prompt as context for divergence pattern recognition. Same-activity RPE awareness is a V1.1 candidate, revisited at launch-prep if dogfooding shows the gap is jarring. See `rpe-feature-spec.md` §6 for reasoning.

---

## 4. Update §2.5 "Weekly reviews"

Add a bullet to the "Structural shape" list:

> - **RPE patterns across the week feed the interpretation.** RPE-vs-pace divergence trends are a primary input — *"You ran easy four times, RPE averaged 5 against your usual band of 3–4 — worth watching"* — exactly the kind of read single-activity debriefs can't make.

---

## 5. Update §4 "Prompt engineering workstream"

Add to the "High-stakes surfaces requiring dedicated prompt files at V1" list:

> - `post-run-followup-rpe-branched.md` — the RPE-branched follow-up prompt for high/low RPE divergence cases

And update the existing bullet for the post-run debrief prompt:

> - `post-run-debrief.md` — the highest-stakes prompt in the product. Receives trailing RPE history as longitudinal context input.

And update the bullet for `weekly-review.md`:

> - `weekly-review.md` — receives the full week's RPE-and-activity data as primary input alongside the activities themselves.

---

## 6. Update §5 "Out of V1" — under "Product exclusions (deferred, not violating thesis)"

Add these bullets:

> - RPE editing after submission (V1.1)
> - Custom RPE scales — per-athlete preference for 1–7 or other variations (V1.1 if requested)
> - Standalone RPE history or trends UI (the data is consumed by Coach Casey, not displayed as a tracker — would violate `design-principles.md` §3 *moments over dashboards*)
> - Same-activity RPE-aware debriefs (V1.1 candidate, revisit at launch-prep if dogfooding shows it matters)
> - Sub-activity RPE — per rep, per lap, cardio vs muscular (V2+, if ever)

---

## 7. Update §6 "Open — design at launch-prep"

Add these bullets:

> - **RPE scale descriptor copy.** Final voice-aligned copy for anchors at 1, 3, 5, 7, 10. Content workstream. Placeholder shipped at build time; production copy swaps in pre-launch.
> - **RPE re-prompt copy and post-pause threshold tuning.** After a 5-skip pause, what does the re-prompt say? Does the post-pause skip threshold differ from the initial threshold? Currently 21-day pause and 5-skip threshold both used post-pause as placeholders.
> - **RPE Question 2 picker refinement.** The day-1 picker logic in `rpe-feature-spec.md` §7 is deliberately simple. Real RPE data will surface where the heuristics underfit (e.g. activities the picker misclassifies as easy when athlete intent was hard). Tuning happens once data exists.
> - **RPE baseline `memory_item` shape and cadence.** When and how does Coach Casey establish "your usual easy is RPE 3-4" as a stored memory item? Engineering + content design.

---

## 8. Update §9 "Quality bars by surface"

Add a row to the table:

| Surface | V1 quality bar | V1.1 target |
|---|---|---|
| RPE prompt and Question 2 picker | Functional + voice-aligned (placeholder copy at build, final copy at launch-prep) | Picker accuracy improved with real RPE data; same-activity RPE awareness if warranted |

---

## 9. Update §7 "Build sequencing"

No structural change. Add a note under step 8 ("Post-run follow-ups"):

> **8. Post-run follow-ups (RPE + Question 2 picker + structured + conversational).** Layered onto the debrief surface. RPE is the universal Question 1; Question 2 picker selects from structured / RPE-branched / conversational per `rpe-feature-spec.md` §7. Build the data model and skip mechanics first; layer the picker logic and prompt files after.
