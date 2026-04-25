# open-questions-log.md — RPE Additions

**For Jason:** Add the entries below to `open-questions-log.md` §3 "Launch-prep — design work deferred to closer to launch". They use the same six-field shape as existing entries.

---

### [2026-04-25] — RPE scale descriptor copy

**Question:** What's the final voice-aligned copy for the RPE descriptors at positions 1, 3, 5, 7, and 10?

**Why it matters:** RPE is asked on every eligible activity — the descriptor copy is one of the most-seen pieces of product copy. Generic descriptors (*"very hard"*, *"easy"*) work but are flat. Voice-aligned copy that sounds like Coach Casey would be a differentiator. Build-time placeholders in `rpe-feature-spec.md` §4 are functional, not final.

**Status:** Deferred — content workstream owns final copy.

**Trigger for closure:** Before V1 launch. Belongs alongside the rest of the launch-prep copy review.

**Notes:** Anchors at 1, 3, 5, 7, 10. Other numbers in between are picker positions without descriptors. Copy needs to read in the same register as the rest of the in-product voice (`voice-guidelines.md` §3) — observational, dry, warm.

---

### [2026-04-25] — RPE re-prompt copy and post-pause threshold tuning

**Question:** When RPE prompts resume after a 5-skip pause, what does Coach Casey say? Should the post-pause skip threshold be the same 5, or shorter, before pausing again?

**Why it matters:** First impression after a pause sets whether the athlete answers or skips again. Current placeholder copy (*"OK to ask again? You can keep skipping if it's not useful."*) is functional but not workshopped. Threshold question is a tuning call — current spec uses 5 again, which may be too lenient.

**Status:** Deferred — needs voice work plus a judgement call on the threshold.

**Trigger for closure:** Before V1 launch.

**Notes:** Spec details in `rpe-feature-spec.md` §8. Threshold options worth considering: same 5, shorter (e.g. 2), or escalating (5 → 2 → 1 → permanent off).

---

### [2026-04-25] — RPE Question 2 picker refinement

**Question:** Does the day-1 Question 2 picker logic (priority order: structured weeks 1–2, RPE-branched on divergence, conversational fallback) hold up against real activity data, or does it misclassify often enough to be wrong?

**Why it matters:** Question 2 is one of two prompts the athlete sees post-run. Picking wrong (e.g. firing an RPE-branched question on what was actually a workout the athlete classified as easy because the heuristic missed it) wastes the prompt slot.

**Status:** Deferred — needs real RPE data to evaluate.

**Trigger for closure:** First 2–4 weeks of dogfood usage with RPE captured. Re-evaluate at launch-prep based on misclassification rate.

**Notes:** Easy-intent and hard-intent heuristics in `rpe-feature-spec.md` §7.1 are intentionally crude. Picker is feature-flagged so it can be tuned without redeploys. Real candidates for V1.1: better intent inference using planned-session data, athlete's rolling baseline, and recent training context.

---

### [2026-04-25] — RPE baseline memory item shape and cadence

**Question:** When and in what shape does Coach Casey establish a per-athlete RPE baseline as a stored `memory_item` (e.g. *"your usual easy run baseline is RPE 3–4"*)?

**Why it matters:** The baseline is what makes RPE-vs-pace divergence detection sharp. Without it, the system can only detect within-week patterns; with it, debriefs and weekly reviews can reference *"that's higher than your usual easy"* as accumulated context. This is part of how the moat compounds.

**Status:** Deferred — needs design.

**Trigger for closure:** Before the prompt engineering work on the debrief surface that consumes RPE context. Must exist before debrief prompt ships with RPE awareness.

**Notes:** Open questions: trigger threshold (after how many RPE answers per activity-type?); update cadence (rolling window, fixed period?); display format inside the prompt (a single sentence, structured triple, both?). Engineering and content design overlap.

---

### [2026-04-25] — Same-activity RPE-aware debriefs — revisit at launch-prep

**Question:** Should V1 ship with the gap, or close it?

**Why it matters:** Today's debrief does not consume today's RPE (per `rpe-feature-spec.md` §6). Reasoning was simplicity — same-day waiting introduces stale-debrief risk and complex timing logic. But the athlete answering RPE = 7 on a planned easy run, then reading a debrief that doesn't reference the high effort, may feel like the data went into a void.

**Status:** Deferred — V1 day-1 ships without it. Revisit at launch-prep based on dogfood feel.

**Trigger for closure:** Launch-prep checkpoint. Decide based on whether dogfooding reveals the gap is genuinely jarring or barely noticeable.

**Notes:** Two implementation paths if it gets closed: (1) regenerate or amend the debrief once RPE arrives; (2) wait up to N minutes for RPE before generating, with a fallback if the athlete doesn't answer. Both add complexity. Either becomes V1.1, not V1, unless dogfood shows it's launch-blocking.

---

### [2026-04-25] — Whether RPE non-engagement should count toward the skip threshold

**Question:** When `rpe_prompted_at` is set but the athlete neither answered nor explicitly skipped (closed the app, never opened the debrief), should that count as a skip?

**Why it matters:** Current decision (in `rpe-feature-spec.md` §8) is no — only explicit skips count. Reasoning: a user who simply doesn't engage shouldn't have RPE silently disabled. But if the threshold is too generous, athletes who genuinely don't want RPE keep getting prompted.

**Status:** Deferred — current default is "no, only explicit skips count."

**Trigger for closure:** First 4–8 weeks of real usage. Look at the ratio of non-engagement to active-skip and decide whether the current rule lets prompts persist longer than they should.

**Notes:** A middle path: count non-engagement at half-weight (2 non-engagements = 1 skip-equivalent). Probably overcomplicated for V1. Easier path is to leave the rule as-is and tune the post-pause threshold (separate question above) if it becomes a problem.
