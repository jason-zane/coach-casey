# Coach Casey — Onboarding Flow (Working Draft)

**Owner:** Jason
**Last updated:** 2026-04-23
**Status:** **Working draft, not a build spec.** The flow shape and moments are settled. Edge cases, error states, loading treatments, and final copy are not. Engineering can start on infrastructure work that doesn't depend on final design (auth, Strava OAuth plumbing, session management, onboarding-state schema). Feature work on user-facing surfaces should wait until this doc is promoted to a build spec — expected after an edge-case pass and content-skill copy pass.

Read alongside `design-principles.md` (feel, voice posture, design implications), `strategy-foundation.md` (thesis, ICP), `v1-scope.md` (onboarding in the context of the wider product), `technical-decision-log.md` (engineering decisions the flow depends on).

---

## 1. What this flow does

Takes a first-time visitor from the marketing site through to a fully set-up Coach Casey account, trial started, ready to receive their first debrief.

**Primary user:** plan-following marathon runner, 2:45–3:45 goal band, AU/NZ, Strava-native, arriving with a goal race somewhere on the horizon. Curious but skeptical of another running tool. Card-in-hand ready if convinced, but won't push through high-friction onboarding for a product they haven't yet felt working.

**Entry state at onboarding start:**
- On mobile or desktop. Mobile-first product, mobile is the expected case.
- Just clicked Sign Up or equivalent on coachcasey.app.
- Has read some version of the pitch. Does not need it re-pitched.
- Has not yet experienced the product.

**What the flow has to achieve:**
- Establish trust through a specific, earned moment (the validation).
- Connect the data source that makes the product work (Strava).
- Set honest expectations about what Coach Casey is and isn't.
- Start the 14-day trial. No card capture at this stage.

**What the flow explicitly avoids:**
- Re-pitching the product.
- Collecting data that isn't load-bearing for the first debrief or the moat.
- Making install feel like a toll gate.
- Any sense that Coach Casey is trying to replace the user's coach or plan.

---

## 2. The three moments

These are the weight-bearing parts of the flow. Everything else serves them.

**Moment 1 — the validation lands.**
Coach Casey pulls the athlete's Strava history and reflects something specific back. The observation is real, drawn from actual data. The athlete recognises themselves in it. The feeling is *oh, it's actually looking at me.* This is the single most load-bearing moment in the product's first impression.

**Moment 2 — the plan upload framing.**
The moment Coach Casey asks about a plan. The framing honestly articulates what a plan unlocks without making Coach Casey sound broken without one. The athlete either uploads, defers knowing what they're deferring, or opts out because they don't have a plan. All three are fine.

**Moment 3 — the expectation set.**
Near the end. Coach Casey names what it is and isn't. Retrospective, not prescriptive. Gets sharper over weeks and months. Supplementary. Trial mechanics. The athlete walks out knowing exactly what they've signed up for.

---

## 3. Flow — step by step

Eight steps on mobile, seven on desktop (install prompt skipped).

### Step 1 — Sign up

**What it does:** creates the account.

**Interactions:**
- Two paths: *Continue with Google* or *Continue with email*.
- Google: one-tap OAuth, account created on return.
- Email: three fields — email address, password, confirm password. Account created on submit.

**Password requirements:** NOT YET DECIDED. Likely 8+ characters, no forced complexity, no forced rotation (aligned with current NIST guidance). Needs a decision before build. Forgot-password flow is standard (email → reset link → set new password) and can be designed separately.

**Voice direction** (content skill to draft final):
- Surface communicates *welcome, this is what Coach Casey is, two weeks on us, no card.* Does not re-pitch.

**States required for build:**
- Default
- Loading (submit in progress, Google OAuth in flight)
- Success (account created → advance to Step 2)
- Error states — **not yet enumerated.** Includes at minimum: invalid email format, password too short, passwords don't match, email already exists, Google OAuth cancelled or failed, network error.

**What's settled:**
- Two sign-up paths (Google, email+password)
- Password-based, not magic link
- No extra fields collected here (no name, no opt-ins, nothing)

**What's not settled:**
- Final password rules
- Exact error state behaviour and copy
- Terms of service and privacy policy acceptance — is it a checkbox, an implicit-by-continuing footer, something else? Decision needed before build.

---

### Step 2 — Connect Strava

**What it does:** connects the athlete's Strava account and begins pulling their activity history.

**Interactions:**
- One screen, one action: a button that launches Strava OAuth.
- User authorises on Strava's side. Returns to Coach Casey.
- On return: activity history pull begins in the background.

**Required scopes:** at minimum `read` for activities and `profile:read_all`. Engineering to confirm minimum scope list against Strava API and the V1 data model. Ask for no more scope than is needed — Strava will scrutinise this during the developer-application review.

**Voice direction:**
- Framing is about purpose, not permissions-for-permissions-sake: *Coach Casey reads your training to be most useful. Connect Strava.*
- Does not list permissions in-product — Strava's own OAuth screen handles that.

**Background work:**
- On OAuth success, Coach Casey immediately begins pulling the athlete's Strava history.
- **For the validation moment:** the last 8–12 weeks of activities. This pull needs to be complete (or close to it) before Step 3 can run.
- **For the memory layer:** the maximum history Strava's API allows — target is ~2 years. This continues in the background after onboarding finishes. The user does not wait for it.
- Engineering decision: the 8–12 week pull should be a priority fetch; the full 2-year pull is a lower-priority background job that can extend for minutes after onboarding completes.

**Strava connection is required to proceed.** Coach Casey cannot do its job without activity data. Users who can't or won't connect Strava cannot complete onboarding. They can always return later.

**States required for build:**
- Default (pre-OAuth)
- Loading (OAuth round-trip)
- Success (auto-advance to Step 3 once minimum history is pulled)
- Error states — **not yet enumerated.** Includes at minimum: user denied on Strava side, Strava API down, network error, account has zero activities (edge case — see §5).
- Priority-fetch loading state: if the 8–12 week pull is slow (rate limits, large history), Step 3 needs a graceful waiting state. **Not yet designed.**

**What's settled:**
- Strava connection is required
- Two-tier data pull (priority 8–12 weeks, background 2 years)
- OAuth is fast and non-dramatic

**What's not settled:**
- Exact scope list (engineering to confirm)
- Priority-fetch timeout behaviour — how long before we surface "this is taking longer than usual"
- Failure-recovery path — what we show when OAuth explicitly fails vs a network timeout

---

### Step 3 — Validation moment

**What it does:** the first moment where Coach Casey demonstrates, rather than promises, that it's looking at the athlete specifically.

**Interactions:**
- Coach Casey presents a single observation drawn from the athlete's Strava history.
- Below the observation: two or three quick-response chips (e.g. *"Yep"*, *"Not quite"*, *"Mostly right"*) plus a free-text field that is always available.
- Tapping *"Yep"* confirms directly and advances to the next observation.
- Tapping *"Not quite"* pre-fills the text field with cursor active and prompt-like placeholder (*"What's off?"*), ready for the user to elaborate.
- Tapping *"Mostly right"* behaves similarly — pre-fills for elaboration.
- Free-text field accepts any input at any time, independent of chip selection.
- Coach Casey acknowledges the response (briefly) and presents the next observation, adapting based on what it just heard.
- Loop runs for ~5–6 observations total.
- A *"move on"* or equivalent action is always available — the athlete can exit the sequence early at any observation.

**Observation content:**
- Real, specific, drawn from the athlete's actual Strava data.
- Voice direction: observational, specific, confident. Generic observations ("you've been running regularly!") fail this moment.
- Examples (voice direction only, content skill to draft final):
  - *"You've been averaging about 65km a week for the last two months, with Sundays looking like long runs and something harder on Wednesdays. That read right?"*
  - *"Your easy pace sits around 5:20/km and your harder efforts are landing in the 4:00–4:20 range. Does that match what you're aiming for?"*
  - *"Looks like you had a gap in early March — a week with almost nothing. Anything worth noting there?"*

**Data source:** last 8–12 weeks of Strava activity, pulled in Step 2.

**Adaptation logic:** Coach Casey's observations adapt based on athlete responses — corrections feed into subsequent observations. This is prompt-engineering work, lives in `prompts/onboarding-validation.md`. **Not yet written.** The prompt file and its eval fixtures are load-bearing for the quality of this moment; nothing about the moment's feel can be built against a placeholder prompt.

**Quality bar:** Great. See `v1-scope.md` §9.

**States required for build:**
- Default (observation + response surface)
- Loading (between observations — Sonnet generating next one). This needs a designed treatment. 2–4 seconds is typical; too short is whiplash, too long is dead air. Deliberate-pace principle applies. **Loading-state treatment not yet designed.**
- Success (observation confirmed/corrected, next one arrives)
- Error (LLM timeout, generation failure) — **not yet specified**
- Early-exit (athlete taps "move on" mid-sequence — flow advances to Step 4)
- Edge case: athlete has very little Strava history (see §5)

**What's settled:**
- Observations are specific and drawn from real data
- Chunked, one at a time
- Quick-response chips + free-text field
- Adaptation between observations
- ~5–6 observations, with early-exit always available
- Draws on last 8–12 weeks

**What's not settled:**
- The actual `onboarding-validation.md` prompt (prompt-engineering workstream)
- Loading-state treatment between observations
- Behaviour when LLM generation fails mid-sequence
- Very-little-history adaptation (sketched in §5, not designed)
- Whether each observation is on its own full screen or stacks conversationally as a scrollable log

---

### Step 4 — Plan prompt

**What it does:** invites the athlete to share their training plan, with honest framing of what it unlocks.

**Interactions:**
- One screen, three options:
  1. *Upload now* — opens plan upload sub-flow (photo, PDF, or text paste)
  2. *I'll add it later* — deferred; Coach Casey will re-prompt at natural moments
  3. *I'm not following a structured plan* — opts out of all future plan prompts; changes downstream debrief behaviour (no plan-vs-actual framing)

**Voice direction:**
- Honest framing names the specific thing unlocked: *If I can see your plan, I can tell you whether a run matched what it was meant to be, not just whether it happened.*
- Does not threaten what's lost without it.
- The "not following a plan" option is framed without sniffing: *No plan, no problem. I'll work with what's in front of me.*

**The upload sub-flow is a separate flow** we haven't designed yet. For the purposes of onboarding, treat it as a black box: athlete uploads, extraction runs, confirmation UI shows extracted data, athlete confirms or corrects, plan is saved, flow returns to Step 5. The sub-flow has its own error cases — see §5 for the specific behaviour when it fails mid-onboarding.

**Deferred vs no-plan paths have different downstream consequences:**
- *Deferred:* athlete will be re-prompted at natural moments (after first debrief, end of week 1, when they mention plan-specific session types in chat). Re-prompt cadence capped at once per week; backs off entirely after two dismissals.
- *No plan:* no re-prompts, debrief voice doesn't reference plan-vs-actual, chat responds differently to forward-looking questions.

These are preferences that persist and affect the whole product, not just onboarding.

**States required for build:**
- Default (three options presented)
- Loading (if upload: extraction running) — handled in the upload sub-flow
- Success (plan saved, deferred, or opted out) → advance to Step 5
- Error (upload fails) — **not yet fully specified**, see §5

**What's settled:**
- Three-option shape
- Honest framing direction
- Deferred vs no-plan are durable preferences with downstream consequences

**What's not settled:**
- Plan upload sub-flow details (separate flow)
- Final copy
- Error handling when extraction fails mid-flow

---

### Step 5 — Install prompt

**This step fires on mobile only. Desktop users skip directly to Step 6.**

**What it does:** invites the athlete to install Coach Casey as a PWA on their device.

**Interactions:**
- Auto-detected device/browser determines the instructions shown.
- Three main branches:
  - **iOS Safari (and iOS Chrome, which uses Safari's rendering):** instructions for Share → Add to Home Screen. Animated illustration showing the Share icon's location on iOS.
  - **Android Chrome / Edge / Samsung Internet:** attempt to trigger native `beforeinstallprompt` where available; fallback to menu-based instructions ("Tap menu, then Install App").
  - **Fallback (in-app browsers, Firefox mobile, unrecognised user-agents):** generic instructions with help links ("Open this page in Safari or Chrome to install") plus a "Not your device?" escape hatch to switch branch manually.
- Single CTA to install (where the platform supports programmatic triggering), plus a *"Not now"* skip option.

**Cross-device handling (not part of onboarding, flagged here for the engineer):**
- A user who onboards on desktop and later signs in on mobile for the first time should be prompted to install at that point. This is NOT an onboarding concern — it's a cross-device moment that lives in the sign-in flow. Flagging so it's not forgotten.

**Voice direction:**
- Names the specific benefit: *Coach Casey lives on your home screen. Install, and you'll get debriefs the moment your runs finish.*
- Does not lecture about push vs email.
- Skip is genuine — not a dark pattern that re-surfaces aggressively.

**If skipped:** install re-prompt is queued for after the first debrief. See §5 for re-prompt cadence.

**States required for build:**
- Default (instructions matched to auto-detected platform)
- Loading (native install prompt triggered, awaiting user response)
- Success (install detected — where the platform fires `appinstalled`; for iOS, we just assume on CTA tap and move on)
- Skipped (user taps "Not now")
- Fallback (detection uncertain → generic instructions + manual branch-switch option)
- Error (detection failed entirely)

**What's settled:**
- Install happens after validation moment, not before
- Mobile-only within onboarding
- Auto-detection with fallback
- Skippable without penalty
- Desktop users skip this step entirely

**What's not settled:**
- Animated illustrations for iOS Share icon (visual-design workstream)
- Exact fallback instructions copy
- Handling users who tap install on iOS (no confirmation event fires — we optimistically advance)

---

### Step 6 — Goal race

**What it does:** captures the athlete's goal race — lightweight version.

**Interactions:**
- Three fields, all optional:
  - Race name (free text — "Gold Coast Marathon," "Sydney Marathon," etc.)
  - Race date (date picker)
  - Goal time (time input — HH:MM:SS)
- One action: *Continue.*
- A *"Skip for now"* option is always available.

**Voice direction:**
- Honest: *If you're training toward something, tell me what and when. I'll keep it in mind.*
- Names that Coach Casey will actually use this — not asked for collection's sake.

**What this screen does NOT do:**
- The *"what's this race about"* deeper question. Deferred to launch-prep per `v1-scope.md` §6 and `open-questions-log.md`. That question is genuinely hard to answer well and needs its own design session. This screen captures the mechanical facts only.

**Skippable entirely.** Athletes without a named goal race can proceed. Coach Casey works with the training arc in the absence of a fixed endpoint — thinner, but functional.

**States required for build:**
- Default (three fields)
- Loading (submit in progress — minimal)
- Success → advance to Step 7
- Skip path → advance to Step 7
- Error states — **not yet enumerated.** Includes at minimum: date in the past, goal time implausible (e.g. 1:00:00 marathon), required field empty if any field becomes required later.

**What's settled:**
- Three mechanical fields, all optional, skippable
- Deeper "what's this race about" question NOT in this step
- Used by Coach Casey, not stored for show

**What's not settled:**
- Whether any field should be required if the user doesn't skip the step entirely
- Input validation boundaries (e.g. goal time ranges)
- Final copy and the "why are we asking" framing

---

### Step 7 — Injury / niggle check

**What it does:** captures anything physical Coach Casey should know about before the first debrief.

**Interactions:**
- One open text field: *Anything going on physically I should know about? A niggle, an old injury, something you're managing?*
- Chips for common items below the field: *calf, Achilles, knee, hip, plantar, shin* (list not finalised).
- Tapping a chip adds its label to the text field with a space for the athlete to elaborate (e.g. tapping *calf* inserts "calf: " into the field, cursor positioned ready to continue).
- Free-text field accepts any input at any time.
- Submit or skip.

**Voice direction:**
- Matter-of-fact, not clinical: *Anything going on physically I should know about?*
- Framing implies the athlete knows their body better than Coach Casey does.
- Does not pathologise — this is context, not a medical intake.

**Why this lives in onboarding and not Phase 2 post-run follow-ups:** injuries and niggles shape how Coach Casey reads the first debrief. An athlete with an Achilles niggle is running easy days differently than one without. Coach Casey should know before the first debrief lands, not learn later.

**Data handling:**
- Free-text entry is saved as a memory item tagged as injury/niggle.
- Chip-assisted entries can be structured (engineering decision — tagging the text with the chip label) to make retrieval easier downstream.
- Coach Casey does NOT give medical advice based on this input. See `roadmap.md` Never bucket: no clinical-territory advice.

**States required for build:**
- Default
- Loading (submit)
- Success → advance to Step 8
- Skip path → advance to Step 8
- Error (save failure)

**What's settled:**
- Lives in onboarding, not Phase 2
- Text field + chip shortcuts
- Skippable
- Not a medical intake

**What's not settled:**
- Final chip list
- Whether chip taps should insert structured data or just scaffold text
- Final copy

---

### Step 8 — Expectation setting

**What it does:** the third moment. Coach Casey names what it is and isn't, cadence expectations, trial mechanics. The athlete walks out of this screen knowing what they've signed up for.

**Interactions:**
- Mostly prose. The product speaking directly to the athlete.
- One action: a *Let's go* button (or equivalent) that completes onboarding and starts the trial.

**Content points to cover (voice direction only, content skill to draft final):**
- Coach Casey reads every run and sends a debrief.
- A weekly review arrives on [day TBD — launch-prep decision].
- The athlete can message Coach Casey any time.
- Coach Casey does NOT write training plans. That's the athlete's coach or the plan they're following.
- Coach Casey interprets what's happening.
- It will get sharper as it learns more. The first couple of weeks it'll ask small questions after runs to fill in what Strava can't tell it.
- Trial: 14 days. No card. No commitment.

**Voice direction:**
- Honest, not salesy.
- Names boundaries explicitly — the "does not write plans" line is load-bearing. Supplementary positioning is the thesis.
- Does not hype or motivate. Warm competence, not coach-speak.

**This is the last screen before the product itself.** After this, the athlete is in Coach Casey proper.

**States required for build:**
- Default
- Loading (trial activation in progress — minimal)
- Success → onboarding complete, redirect to main product surface
- Error (trial activation failed — rare but possible if DB write fails) — **not yet specified**

**What's settled:**
- Lives at the end of onboarding
- Prose-led, single action
- Covers boundaries, cadence, trial mechanics
- One of the three moments

**What's not settled:**
- Final copy (content skill)
- Whether weekly review day/time is captured here, implied (Sunday default), or deferred to settings
- Visual treatment of the prose (component design — visual-design workstream)

---

## 4. After onboarding

The athlete lands in the main product surface. Trial clock has started.

**Initial main-surface state:**
- Empty state (no runs yet, no debriefs yet).
- Voice direction: *First run and I'll have something to say.* Something in that shape — warm, patient, not empty-looking.

**Notification channel state:**
- Installed → push + email available, push preferred for debriefs and weekly reviews.
- Not installed → email only until install happens.
- **Post-first-debrief install nudge is queued for users who skipped install in onboarding.** See §5 for cadence.

**Phase 2 progressive context-gathering begins on the next run.** Structured question set (weeks 1–2) is primed in the post-run follow-up prompt. Not a user-facing concern for onboarding, but the engineer should know the state flows: onboarding complete → flag set on the athlete record → next activity sync triggers follow-up selection logic.

**Background Strava pull continues.** The 2-year history continues syncing in the background after onboarding completes. This should not block anything user-facing.

---

## 5. Edge cases — STATUS: NOT YET DESIGNED

This section exists to name the edge cases, not to resolve them. Most of these need a dedicated design pass.

**The engineer should not attempt to build user-facing behaviour for these cases from the notes below — they're sketches, not specifications.** What they *can* do is ensure the infrastructure supports the eventual behaviour (e.g. database allows for re-entry into onboarding, activity pull handles zero-activity Strava accounts without crashing, extraction failures are surfaced as catchable errors).

Cases to resolve in the edge-case design pass:

- **Strava OAuth denied or failed.** What recovery surface? How do we let the user retry without losing progress?
- **Strava account has zero activities.** Coach Casey can't generate validation observations. Does onboarding skip Step 3, adapt it, or ask the athlete to run something first?
- **Strava account has very little history (fewer than ~10 activities over 8–12 weeks).** Validation moment adapts — Coach Casey says less, asks more. Specific adaptation is prompt-engineering work.
- **Strava API is down.** How do we handle mid-onboarding failure without losing state?
- **Strava activity history pull times out.** Priority-fetch (8–12 weeks) is slow. What's the timeout? What do we show? Fallback to a smaller window?
- **LLM timeout or generation failure during validation.** Single observation, multiple observations, mid-sequence — different recovery behaviours.
- **User abandons onboarding mid-flow.** Do we save progress? How do they resume — auto-resume on next login, or restart? What's the cut-off after which progress is discarded?
- **User signs up, verifies email (if applicable), and the verification link is opened on a different device from where they started.** Which device completes onboarding?
- **User completes onboarding on desktop, then signs in on mobile for the first time.** Install prompt moment — noted in §3 Step 5. Lives in sign-in flow.
- **Plan extraction fails mid-onboarding.** Confirmed behaviour: user continues onboarding, can retry plan upload later. Needs specific error-surface design.
- **Plan extraction succeeds but confidence is low / extraction obviously wrong.** Plan upload sub-flow concern, but affects onboarding because the athlete is mid-flow.
- **Goal race date in the past, or goal time implausible.** Validation behaviour in Step 6.
- **Injury input that edges toward medical-advice territory.** Coach Casey does not diagnose or advise clinically. How do we handle input like *"I think I've torn something"*? Content-level decision.
- **Password reset during onboarding.** User is mid-flow, forgets password, resets, returns — what's the resume behaviour?
- **Google OAuth returns an email that's already registered via email+password** (and vice versa). Account linking or error? Policy decision.
- **User hits a dead-end on install detection.** Fallback surface works, but what if even the fallback instructions don't help them? Is there a skip-and-continue path? (Yes — install is always skippable — but worth checking the fallback's escape hatches.)
- **Trial-activation DB write fails at Step 8.** Rare but possible. Recovery path?

**Post-first-debrief install nudge cadence:**
- First nudge: in or with the first debrief.
- Second nudge: with second or third debrief if still not installed.
- Third nudge: once in the first weekly review.
- After that: stop. Never nudge again. User has decided.

---

## 6. Content — STATUS: VOICE DIRECTION ONLY

All copy in this doc is voice direction (*"in spirit: X"*). Final copy is the content skill's job. Surfaces that are especially load-bearing on copy quality:

- **Step 3 validation observations.** The observations themselves are generated by the LLM using the onboarding-validation prompt, but the framing, loading copy, acknowledgement phrasing, and transition language between observations all need the content skill.
- **Step 4 plan prompt framing.** The honest framing of what a plan unlocks is a craft piece. Placeholder copy will not survive contact with real users.
- **Step 8 expectation setting.** The entire screen is prose. The prose *is* the moment.

Other surfaces (Step 1 sign-up, Step 2 Strava connect, Step 5 install, Step 6 goal race, Step 7 injury check) need copy too, but the craft stakes are lower — functional clarity matters more than voice exactness on those.

**The content skill should do a pass on this flow before it's promoted to a build spec.**

---

## 7. What engineering can start on now

Work that doesn't depend on final design decisions or final copy:

- **Auth infrastructure.** Supabase auth setup, Google OAuth integration, email+password flow, session management, password reset email. Follow `engineering-foundation.md` for the broader auth approach.
- **Strava OAuth plumbing.** OAuth flow, token storage, refresh-token handling, webhook subscription setup (for real-time activity triggers post-onboarding). Requires approved Strava developer application — see `strava-api-compliance-note.md`.
- **Activity history ingestion pipeline.** Two-tier fetch: priority 8–12 weeks, background 2-year pull. Idempotency, retry, rate-limit handling.
- **Data model for onboarding state.** Athlete record, onboarding-complete flag, partial-progress tracking (if we save mid-flow progress — decision pending from edge-case pass). Follow `technical-decision-log.md` data model.
- **Onboarding-validation prompt scaffold.** The file structure (`prompts/onboarding-validation.md`), eval fixtures directory, Langfuse wiring. The actual prompt content is part of the prompt-engineering workstream, but the scaffolding can be in place.
- **PWA install-detection utility.** User-agent-based branch selection with fallback. Doesn't depend on copy — can be built and tested against dummy content.
- **Plan upload pipeline.** Screenshot/PDF/text-paste ingestion, Sonnet vision extraction, athlete confirmation UI. Part of a separate sub-flow but infrastructure-heavy and non-blocking.
- **Trial activation.** DB write on Step 8 completion, trial-ends-at timestamp calculation, wiring into the subscription system for later conversion.

**Work to hold on until this is promoted to a build spec:**

- Final user-facing screens for any step
- Error-state surfaces
- Loading-state treatments
- Validation-moment loading interstitials
- Final copy on any surface
- Install-prompt illustrations and animations
- Plan-prompt upload sub-flow's user-facing design

---

## 8. Open items explicitly blocking promotion to build spec

Before this doc is handed off as a build spec, these need to close:

- **Edge-case design pass.** §5 enumerates cases; each needs specified behaviour.
- **Content skill pass on voice direction.** §6 identifies load-bearing copy surfaces.
- **Password requirements decision.** §3 Step 1.
- **Terms of service / privacy policy acceptance UX.** §3 Step 1.
- **Strava scope list confirmation.** §3 Step 2. Engineering to confirm.
- **Validation loading-state design.** §3 Step 3. Requires visual-design work.
- **Validation stacking vs screen-per-observation.** §3 Step 3. Interaction-design call.
- **Cross-device install prompt behaviour.** §3 Step 5. Lives in sign-in flow but needs design.
- **Weekly review cadence default.** §3 Step 8. Launch-prep per open-questions-log but affects whether expectation-setting captures it.

---

## 9. How this document is used

- **Engineer:** start on §7 (plumbing work). Do not build user-facing surfaces from this doc — wait until it's promoted to a build spec.
- **Designer (continuing Jason + Claude work):** close §5 (edge cases) and the items in §8. Each closes into an updated version of this doc.
- **Content skill:** pass on voice-direction surfaces identified in §6 before build spec promotion.
- **Reviewed:** after edge-case pass, after content pass, at V1 build kickoff of any user-facing onboarding surface.

This is a working draft. Until §5, §6, and §8 close, it's a reasoning document, not an instruction document.
