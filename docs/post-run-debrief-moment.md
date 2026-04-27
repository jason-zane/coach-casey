# Coach Casey — Post-Run Debrief Moment (Working Doc)

**Owner:** Jason
**Last updated:** 2026-04-27
**Status:** **Working draft, not a build spec.** Settles the debrief moment shape — order, push behaviour, RPE picker placement, Q2 logic, divergence affordance, decay, skip mechanics. Engineering spec items (state coverage, error handling, copy finalisation) are flagged but not all resolved here. Promotes to build spec once the divergence affordance copy lands and the loading/error states are specified.

Read alongside `design-principles.md` (feel, voice posture), `interaction-principles.md` (timing, push behaviour, feedback patterns), `rpe-feature-spec.md` (data model, eligibility, picker UI, downstream consumers — this doc supersedes its order/skip-bucket/cross-training calls), `cross-training.md` (acknowledgement surface that mirrors most of this), `prompts/post-run-debrief.md` and `prompts/post-run-followup-rpe-branched.md` (the system prompts that fire inside the moment), `voice-guidelines.md` (in-product register).

This doc supersedes earlier project memory and earlier sections of `rpe-feature-spec.md` where they conflict — specifically the "RPE picker above the debrief" placement (§5), the global skip count (§8), and the same-activity-RPE-blind Q2 carve-out for runs (§7).

---

## 1. What this moment is

A run lands. The athlete didn't ask for anything. Coach Casey reads the run, says what it sees, and asks one question that earns its place. The athlete reads, optionally rates the effort, and optionally answers back.

This is the moment Coach Casey earns the marathon-coach trust the rest of the product is making promises about. It's the surface that has to feel like *a coach reading you*, not *a tool processing data*. Everything in this doc serves that.

Three jobs the moment does, in order:

1. **Reads the run, in voice.** Interpretive prose, two to four short paragraphs, no prescription, no sign-off.
2. **Captures effort, lightly.** A 1–10 RPE picker sits below the prose. Skippable. Decays after a window if not engaged.
3. **Opens the door, contextually.** A single follow-up question (Q2) below the picker, branched on whether RPE was answered and whether the answer diverged from the run's intent.

The whole moment is one thread message — see `interaction-principles.md` §6.3.

---

## 2. What the athlete feels

**Push notification arrives.** The lock screen carries the opening sentence of the debrief verbatim. *"This looked like the long-run effort coming back after last week's cutback, and the legs answered."* That sentence is the start of the moment, not a pointer to it (`design-principles.md` §3 *"the notification copy IS the opening of the experience"*).

**Tap. Surface opens.** The debrief is already there — full prose, room to read. No rate-this-first toll booth. No "tap to see your debrief" wrapper. The opening sentence the push showed is the first line of the prose; the rest develops it. The athlete reads.

**Below the prose, quietly: a 1–10 strip.** Tabular numerals, plum accent on selection, descriptors visible at anchor positions on first use — *barely felt it* (1), *easy* (3), *working* (5), *hard* (7), *all out* (10). Above it: *How hard did that one feel?* Not modal. Not a blocker. The athlete can leave the surface without rating.

**They tap a number.** The picker collapses to a quiet *understood* and the chosen number stays visible with its descriptor. Q2 fades in below within ~1–3s. If RPE diverged from the run's intent, Q2 reads the divergence specifically and carries one chip beneath it — *Take it to chat* — that opens the thread with the run pinned as context. If RPE didn't diverge or the athlete skipped, Q2 is a conversational follow-up without chips.

**They answer Q2 by tapping the message and typing, or they don't.** Either way, the moment closes. The thread accepts the next event.

**They ignored the picker entirely and came back four hours later.** The picker is gone. The debrief is still there, fully readable. No "you missed your chance" copy. The thread carries on. Next run lands the next picker.

---

## 3. Flow

Beat-by-beat from sync to close.

### 3.1 On Strava sync (server-side, before the athlete sees anything)

1. Activity classified (run / cross-training / ambient-only / sub-1km skip — see `lib/strava/workout-detect.ts`).
2. If ambient-only or sub-1km, stop. No debrief, no push, no picker.
3. Debrief generated (or cross-training acknowledgement generated). The opening sentence is structurally engineered to stand alone as a push body.
4. Push fires. Body = verbatim opening sentence. Tag coalesces same-activity duplicates.
5. RPE picker eligibility computed (see §4). If eligible, `rpe_prompted_at` stays NULL until display.

### 3.2 On surface open

1. Debrief prose renders top of the message. Already loaded — no skeleton needed; the message is server-rendered.
2. RPE picker renders below the prose if eligible AND within the 4h decay window from first display. On first display this turn, set `rpe_prompted_at = NOW()`.
3. Q2 renders below the picker, in its initial conversational state. (Conversational Q2 is generated at sync time alongside the debrief; only the divergence-aware Q2 generates lazily.)

### 3.3 On RPE answer

1. Optimistic UI: picker collapses to acknowledgement instantly.
2. Server records `rpe_value` and `rpe_answered_at`. Skip-bucket counter resets to 0 for this athlete + bucket (see §6).
3. Q2 picker logic runs (`lib/llm/followup-picker.ts`):
   - **Phase 2 onboarding** (week 1–2 of athlete tenure, structured-context backlog non-empty) → no change to Q2; the conversational Q2 already shown stays.
   - **Divergence detected** (RPE ≥ 7 on easy intent, or RPE ≤ 4 on hard intent — heuristics in `rpe-feature-spec.md` §7.1) → divergence Q2 generates server-side, replaces the conversational Q2 in place. Affordance row appears below.
   - **No divergence** → conversational Q2 stays, no replacement.
4. Q2 fade-in transition follows `interaction-principles.md` §1.1 (180ms ease-out).

### 3.4 On RPE skip (active dismissal)

1. Set `rpe_skipped_at = NOW()`. `rpe_value` stays NULL.
2. Picker hides from the surface. No verbal acknowledgement. The athlete dismissed the ask; the surface respects that without commentary.
3. Q2 stays as the conversational variant. **Never** RPE-branched, even if the activity would otherwise have triggered divergence.
4. Skip-bucket counter increments. If reaches 5 consecutive active skips in this bucket, set `rpe_prompts_paused_until = NOW() + INTERVAL '21 days'` *for this bucket only*.

### 3.5 On 4h decay (no engagement)

1. At `rpe_prompted_at + 4h`, the picker hides from the surface for this activity. Server-side flag or client-side time check; either is fine.
2. The debrief, prose, and any conversational Q2 stay visible and interactive.
3. Counts as **non-engagement**, not active skip. Does not increment the skip-bucket counter (`rpe-feature-spec.md` §8.1 already distinguishes these).

### 3.6 On Q2 answer

Standard chat turn. Athlete taps the message, types, sends. Reply goes into memory via tool use. No special handling beyond what `lib/thread/repository.ts` already does.

### 3.7 On chip tap (*Take it to chat*, divergence variant only)

1. Open the chat composer scoped to the thread.
2. Pin the run as visible context — small chip or prefix above the composer reading the activity (placeholder: *"about Tuesday's 8km easy"*).
3. No pre-typed message. Athlete types whatever.
4. Casey's reply takes the run as primary context, plus the just-recorded RPE value, plus the standard memory inputs.

---

## 4. RPE picker eligibility

Picker fires on every activity that:

- Generated a debrief or a cross-training acknowledgement (i.e. wasn't sub-1km, ambient-only, or skipped at the workout-detect layer).
- Has duration ≥ 10 minutes.
- Has `rpe_prompted_at IS NULL` for this `activity_notes` row (idempotent on first display).
- The athlete's bucket is not currently paused (`rpe_prompts_paused_until` is NULL or past for the activity's bucket — see §6).

Activities that don't generate a debrief or acknowledgement (walks, sub-1km) get no picker. Same gate the cross-training prompt and the run debrief use.

---

## 5. Q2 — three states

Mutually exclusive, picked server-side.

### 5.1 Conversational Q2 (default for every activity at sync)

Existing behaviour from `prompts/post-run-followup-conversational.md`. Generated at sync time alongside the debrief. One question, observational, no prescription. Used:

- On every run that doesn't trigger divergence.
- On every run where the athlete skipped RPE.
- On every cross-training session in V1 (no divergence Q2 for cross-training — see §7).

### 5.2 Divergence-aware Q2 (runs only, V1)

Replaces the conversational Q2 in place after RPE answer when divergence fires. Two branches:

- **`high_on_easy`** — RPE ≥ 7 on easy/recovery intent.
- **`low_on_hard`** — RPE ≤ 4 on workout / long / top-quartile intent.

Prompt at `prompts/post-run-followup-rpe-branched.md`.

**Posture shift specific to this branch.** The divergence-aware Q2 is the one place in the moment where light forward-implicating language is allowed — *"reads like a day to keep tomorrow gentle if it's there"* is in scope; *"you should run 6km easy tomorrow"* still isn't. The debrief body's no-prescription rule stays untouched. This carve-out exists because RPE is *new information* the debrief didn't see; the moment earns the right to reflect that information forward in one short line.

The forward-implicating line is **optional inside Q2** — present only when the divergence has an honest read available (memory signal, plan context, recent arc). When there's nothing real to say, Q2 stays a question alone.

### 5.3 Phase 2 structured context Q2 (onboarding weeks 1–2)

Existing behaviour from `rpe-feature-spec.md` §7. Pulls from the ranked structured-context question list (open question §3 in `open-questions-log.md`). Takes priority over divergence-aware Q2 in the priority order.

---

## 6. Skip mechanics — two buckets

Two buckets: **run** and **cross-training**.

- All run activities share one consecutive-skip counter.
- All non-run activities (ride, swim, gym, yoga, pilates, catch-all) share one consecutive-skip counter.

Pause logic:
- 5 consecutive active skips in a bucket → pause RPE prompts for that bucket only, for 21 days.
- The opposing bucket continues to fire normally.
- Re-prompt logic per `rpe-feature-spec.md` §8.4 — applied per bucket.

**Why two, not six.** Six buckets (per Strava activity type) would give finer-grained pause behaviour, but most athletes don't accumulate skip patterns granular enough for it to matter. Two is enough to protect the run-RPE signal — the most important one for the product — from being killed by skip patterns on cross-training. Refine if real data shows athletes engaging asymmetrically across cross-training types.

**Data model implication.** `athletes.rpe_prompts_paused_until` becomes two columns OR one column scoped by bucket. Engineering call. The skip-count query (`rpe-feature-spec.md` §8.3) gains a `WHERE activity_type IN (...)` filter scoped per bucket.

---

## 7. Cross-training — what's the same, what differs

**Same as runs:**
- Picker placement (below the acknowledgement, above Q2).
- 4h decay from first display.
- Skip mechanics (in the cross-training bucket).
- Push body rule (verbatim opening of the acknowledgement — often the whole acknowledgement, since they're short).
- Read → rate → reflect rhythm.

**Different from runs:**
- **No divergence-aware Q2 in V1.** Cross-training "intent" is fuzzy — what's the expected RPE for 60 min in the gym? Picker would invent baselines that don't exist. Q2 stays the existing cross-training acknowledgement question logic (ask vs don't ask per `prompts/cross-training-acknowledgement.md`). RPE captures silently as longitudinal context.
- **No affordance chips in V1.** No divergence detection means no divergence affordance.
- **V1.1 candidate:** once per-athlete cross-training RPE baselines accumulate (~10+ answers per activity type), revisit divergence detection for cross-training. Most likely shape: *"that's a higher number than your usual gym session — anything heavy on the legs today?"*

---

## 8. Push notifications

**Body = verbatim opening sentence of the debrief or cross-training acknowledgement.**

- Run debrief: the opening interpretive claim sentence per `prompts/post-run-debrief.md`.
- Cross-training: often the whole acknowledgement sentence; if longer than fits the push body, the first sentence (acknowledgements are structurally short).

**Tag** coalesces same-activity duplicates so a backlog doesn't stack.

**TTL** 24h, per existing `lib/push/send.ts` behaviour. The picker decays at 4h from first in-app display, but the push itself persists longer — opening the app surfaces the debrief regardless.

**Multi-activity day.** Each activity gets its own push and its own moment. No batching, no daily cap (`docs/cross-training.md` §2.3 already commits to this for cross-training; same rule applies to runs).

**Per-activity preference** to silence push (e.g. silence cross-training pushes only) is **out of V1**. Single global push toggle in preferences. Revisit if dogfood shows volume is noisy.

---

## 9. States checklist

Per the design discipline in `product-design` skill — every state spec'd or flagged.

### 9.1 Default

Debrief prose loaded, RPE picker visible (within 4h window), conversational Q2 below picker. Athlete can read, tap, type, or do nothing.

### 9.2 Loading

- **Surface open:** debrief prose is server-rendered into the thread message — no loading state needed for prose itself.
- **Q2 generation on RPE answer:** picker collapses to a quiet acknowledgement (~120ms), then a *thin pulse / breathing ellipsis* placeholder appears in the Q2 slot until the divergence Q2 streams in. Treatment per `interaction-principles.md` §2.2 *Coach Casey's thinking state*. Typical wait: 1–3s.
- **Chip tap → chat open:** standard chat-surface load. Existing pattern.

### 9.3 Empty

Not applicable to this surface. Every triggered moment has prose, a picker, and a Q2.

### 9.4 Error

- **RPE submission fails (network drop mid-tap):** picker shows the optimistic state, retries silently per `interaction-principles.md` §4.2 LLM/memory-write retry policy. If retry exhausts, inline soft error on the picker (*"didn't save, tap to retry"* — placeholder). Skip-count not incremented on a failed submission.
- **Q2 generation fails (LLM error post-RPE answer):** the conversational Q2 generated at sync stays visible — no replacement. The athlete sees the standard Q2 instead of the divergence Q2; they don't see an error message. This is a graceful-degradation path, not a user-facing failure.
- **Push fails:** silent. Push is best-effort (`lib/push/send.ts`). The moment still exists in the thread when the athlete next opens.

### 9.5 Decay (4h elapsed without engagement)

- Picker hides. Debrief and any visible Q2 stay.
- No "expired" copy. No nudge. The moment passed; the surface moves on.
- Counts as non-engagement. Skip counter unchanged.

### 9.6 Offline

Per `interaction-principles.md` §4.3. Thread reads from cache; debrief is visible if it was loaded. RPE submission queues locally and submits when connection returns. Q2 generation can't fire offline; if it was the divergence path, the conversational Q2 stays as fallback.

### 9.7 Multi-activity day

Two (or more) activities synced same day. Each generates its own thread message with its own debrief / acknowledgement, picker, and Q2. Each fires its own push. Each picker has its own 4h decay window from its own first display. Skip counters increment per-activity.

### 9.8 Sync delay

Activity ran at 06:00; Strava webhook fires at 12:00; athlete opens at 13:30. Push fired at 12:00, debrief was generated at 12:00, picker first displays at 13:30 → `rpe_prompted_at = 13:30`, decay clock starts there. Athlete had 6 hours of "stale" between activity and surface; that's fine — RPE accuracy is degraded vs fresh, but the spec doesn't suppress display, and the alternative (refusing to ask) loses signal we'd otherwise capture.

---

## 10. Key locked decisions (decision log)

Decisions made in design conversations 2026-04-26 / 2026-04-27. Each supersedes any earlier-doc statement.

1. **Order on the surface: prose first, picker below, Q2 below picker.** Supersedes `rpe-feature-spec.md` §5 (which had picker above the debrief). Reason: the moment is the coach reading you; transactional ask before interpretive read inverts the moment.

2. **Push body = verbatim opening sentence of the debrief / acknowledgement.** Supersedes earlier "send a generic 'new debrief' push" thinking. Reason: `design-principles.md` §3 — notification copy IS the opening of the experience, not a pointer.

3. **RPE picker decays after 4h from first display.** Reason: RPE accuracy degrades sharply hours after the activity (sports-science evidence); past that window the ask is friction without signal. Counts as non-engagement, not skip.

4. **RPE answer informs today's Q2 (divergence-aware), not today's debrief body.** Carve-out preserved from `rpe-feature-spec.md` §6 — debrief generates at sync time, before athlete answers. RPE-aware reading shifts to Q2, which generates lazily.

5. **Skip RPE → Q2 stays conversational, never RPE-branched.** Active skip is a meaningful athlete signal — the surface respects it by not surfacing a "softer" branch in its place.

6. **Skip-count: two buckets — run, cross-training.** Supersedes `rpe-feature-spec.md` §8 single global bucket. Protects run-RPE signal from cross-training skip patterns without per-type complexity.

7. **RPE fires on every eligible cross-training session, same shape as runs.** Affirms `rpe-feature-spec.md` §10 — "non-run activities: show RPE prompt." Captures longitudinal load picture.

8. **No divergence-aware Q2 for cross-training in V1.** No baselines exist yet; "intent" is fuzzy; would invent reads we can't honestly produce. V1.1 candidate.

9. **Divergence affordance: one chip, *Take it to chat*.** Supersedes the floated *Go deeper* chip — cut for V1. Opens the thread with the run pinned as context, no pre-typed message. Reason: divergence already gets a question and a chat path; *Go deeper* is a whole new surface whose value is speculative pre-evidence. V1.1 candidate.

10. **Light forward-implicating line allowed inside divergence-aware Q2 only.** Debrief body keeps strict no-prescription. The Q2 carve-out is contained because RPE is genuinely new information the debrief didn't see.

---

## 11. Open / launch-prep items

- **Bucket pause data model shape.** `rpe_prompts_paused_until` becomes either a single column scoped by bucket (e.g. JSON), two columns, or a separate `rpe_prompt_pauses` table. Engineering call.
- **Push body length cap.** Apple/Android push body limits truncate long opening sentences. The debrief prompt aims for short opening sentences; if any prompt outputs an opener > push limit, truncation rule needed (likely: truncate at a sentence boundary, append nothing — no ellipsis).
- **Per-activity skip-count granularity revisit.** If V1 dogfood shows asymmetric engagement across cross-training types, refine from 2 buckets toward more granular (likely 3: run / non-run-aerobic / non-run-strength) before V1.1.
- **Same-day RPE-aware debrief body.** Currently a launch-prep open item in `rpe-feature-spec.md` §6 — kept open here pending dogfood evidence on whether the divergence Q2 closes the gap or whether the debrief body itself feels stale when RPE diverges.
- **Go-deeper surface.** V1.1 candidate. Design when there's evidence athletes want it.

### Resolved 2026-04-27 (was previously open)

- **Final copy** locked. Picker prompt: *How hard did that one feel?* Descriptors: *barely felt it / easy / working / hard / all out* at 1/3/5/7/10. Post-tap acknowledgement: *understood*. Post-skip: no verbal beat, picker hides. Chip label: *Take it to chat*. See §2 for in-surface phrasing.
- **Forward-implicating line rules** locked into `prompts/post-run-followup-rpe-branched.md`. Three add-the-line criteria, four skip-the-line criteria, shape rules, and anchor examples for both branches.
- **First-time picker introduction.** No intro copy. Show picker with descriptors visible at anchor positions on first use; trust the athlete.

---

## 12. Engineering implications summary

For the engineer reading this to scope the build:

- **Surface order changes:** picker moves below the debrief in the thread message component. Q2 component moves below the picker.
- **Push body changes:** the push payload `body` field gets the debrief's opening sentence rather than a generic string. Generation pipeline needs to extract sentence one cleanly.
- **Picker eligibility check:** add the 4h decay rule to the existing eligibility computation.
- **Skip-count query:** scope by bucket (run vs non-run). Two pause states tracked per athlete.
- **Q2 picker logic:** runs after RPE submission, replaces in-place when divergence fires. Conversational Q2 stays as fallback on LLM failure.
- **Chip component:** new — small pill below Q2, divergence-aware Q2 only. Tap behaviour: open thread composer with run pinned as context.
- **Eval fixtures** updated to cover divergence Q2 with affordance, decay, multi-activity stacking, two-bucket pause.

---

## 13. How this document is used

- **Engineering** reads this as the moment-level spec. State coverage in §9 plus engineering implications in §12 are the build surface. Specific values that need tuning during build (Q2 generation timeout, decay timing edge cases) get logged in `technical-decision-log.md` and reflected back here.
- **Content** owns every placeholder copy item flagged in §11. This doc names where copy lives and what role it plays; the words are the content layer's call.
- **Visual design** (when it starts) reads §2 (what the athlete feels) and §9 (states) as the behaviour spec. Visual treatment serves these.
- **PM** uses §10 (decision log) as the authoritative record of what was decided and why. New decisions update §10 and the relevant operational section.
- **Reviewed** at V1 build kickoff, after first dogfood debrief lands, at launch-prep, and on any material change to surface order, RPE eligibility, or skip mechanics.
