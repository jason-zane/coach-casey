# Casey refresh, engineering follow-ups

**Owner:** Jason
**Status:** Open. Captures the engineering work surfaced by the
2026-05-16 voice + conversation refresh. The prompt changes shipped
in the same PR are usable as soon as they land; the items below
unlock the new proactive surfaces and the sharper context routing.

This doc complements the prompt changes; it does not duplicate them.
Read alongside the new prompts in `prompts/race-week-briefing.md`,
`prompts/fueling-prerun.md`, `prompts/fueling-retrospective.md`,
`prompts/niggle-escalation.md`, `prompts/mid-block-flatness.md`, and
the updated existing prompts.

---

## 1. Race tier on the goal-race model

**Why:** the race-week briefing schedule scales by tier (A, B, or
C). Without a tier field, every race is treated the same and Casey
either over-briefs B races or under-briefs A races.

**What:** add a `tier` column to the goal-race table, enum of
`A | B | C`. Default `B` if not set, on the view that a marathon
without a tier is rarely a true train-through-it race.

**UX:** in the goal-race capture flow (currently Step 6 of
onboarding), add a tier selector with short explanations:

- **A race (priority race).** Full taper, full prep, can't train
  through it.
- **B race (important).** Shorter taper, careful approach, can train
  with it in the picture but not through it.
- **C race (train through).** Lower priority, slot into training
  without disrupting it. Rare for marathons.

If the athlete doesn't set a tier, default to B and prompt them later
("is the Sydney marathon an A race or a B race for you?").

**Migration:** add the column. Backfill existing rows to `B`. The
race-week trigger logic reads from this column.

## 2. "Has coach" status on the athlete

**Why:** the coached-vs-uncoached posture block scales Casey's
push-back behaviour by whether the athlete has a human coach. The
chat-system prompt and the niggle-escalation prompt both branch on
it.

**Status:** confirm whether this field already exists on the
athlete record. The refresh interview stated "we measure whether or
not someone has a coach". If true: confirm the field is rendered into
the context block. If not: add it.

**Capture:** the structured follow-up bank now ranks coach status at
Rank 1 (highest information value, gates push-back posture). The
question fires on one of the first debriefs in the relationship.
Persist the answer to the athlete record as `has_human_coach:
boolean | null`. Null is fine; surface prompts treat null as "unknown,
default to softer posture".

## 3. Triggers for the new proactive surfaces

The four new proactive surfaces (race-week briefing, fuelling
pre-run, niggle escalation, mid-block flatness) need trigger logic.
Each is event-driven or cron, listed per surface.

### 3.1 Race-week briefing

- **Cron-driven daily at the athlete's local morning** (e.g. 7am
  local).
- **Read all goal races.** For each race, compute days remaining
  (T-N). Cross-reference with the per-tier schedule:
  - A race: T-14, T-7, T-3, T-2, T-1, T-0
  - B race: T-10, T-3, T-1, T-0
  - C race: T-1, T-0
- **Idempotent:** record `race_week_briefing_sent_at` for each
  (race, day-marker) pair so a single race doesn't get two briefings
  for the same day.
- The prompt itself returns `SKIP` if invoked off-schedule; the
  trigger is the gate, not the prompt.

### 3.2 Pre-run fuelling nudge

- **Event-driven on planned-run-detected.** When the system knows a
  long run is scheduled (from an uploaded plan), fire ~24 hours
  ahead.
- **Trigger condition:** the planned run is ≥ 75 minutes (or ≥ ~18km
  if duration isn't in the plan). No prior fuelling discussion for
  this specific run.
- **Idempotent:** record `fuelling_prerun_sent_for: <planned_run_id>`
  to avoid re-firing.
- Off when the athlete has no uploaded plan (the surface only fires
  when Casey can see the run coming).

### 3.3 Retrospective fuelling check

- **Event-driven on activity sync.** Fires after the debrief and
  conversational follow-up have been processed.
- **Trigger condition:** the completed run is > 75 minutes AND the
  conversational follow-up did not select a fuelling question AND
  Casey doesn't have a confirmed fuelling read for this run.
- The prompt returns `SKIP` if the condition isn't met when
  invoked.

### 3.4 Niggle escalation

- **Event-driven on niggle-mention-count change.** When a memory
  write or chat parse records an injury / niggle reference,
  recount mentions of that body part in the last 14 days. If the
  count crosses 3 *and* no escalation has fired for the same body
  part in the last 14 days, fire.
- **Counter:** a query against memory items tagged `[injury]` by
  body part. Body-part normalisation needed (calf / left calf /
  right calf all count toward "calf").
- **Threshold flagged for research review.** 3 mentions / 14 days
  is a working number from the interview; revisit when there's
  data on whether the surface fires too often, too rarely, or
  about right.

### 3.5 Mid-block flatness check-in

- **Cron-driven weekly or daily** (engineering call; weekly is
  cheaper, daily is sharper).
- **Pattern detector:** compute a fatigue signal across the recent
  rolling window. Candidate signals (combine 2 or more):
  - Easy-run pace slower than the 8-week baseline by > 10s/km
    average for ≥ 7 days
  - Workout pace off target across the last 3 of 4 sessions
  - Long-run HR drift higher than the rolling baseline for ≥ 2
    long runs
- **Fire condition:** pattern persists ≥ 14 days AND no flatness
  check-in has fired for the same athlete in the last 14 days.
- **Threshold flagged for research review.** The pattern definition
  is provisional; tune against real data.

## 4. The 75-minute fuelling rule

**Why:** Casey OWNs fuelling. The conversational follow-up bank now
asks about long-run fuelling on the first run > 75 minutes after
onboarding (or when the pattern isn't yet known). The pre-run and
retrospective surfaces use the same threshold.

**Where it lives:** as a single constant in the surface trigger code
(not in each prompt). The prompts ask the question when invoked; the
trigger gates *when* to invoke. The threshold can move (e.g. to 90
minutes) without changing prompt text.

**Tracking the answer:** persist fuelling answers to the athlete's
memory items as structured tags (e.g. `[fuelling] long-run pattern:
"60g/hr maurten + electrolyte"`). The pre-run and retrospective
surfaces read these to decide whether to fire or skip.

## 5. The "few things, got a minute?" batching pattern

**Why:** Casey opens with this pattern when multiple things have
built up. The trigger surfaces (niggle escalation, flatness
check-in, race-week briefing) can each fire in the same window.
Without batching, the athlete gets three separate messages stacked
in the thread.

**Where it lives:** in the trigger orchestrator, not in any single
prompt. When two or more proactive triggers fire in the same window
(e.g. same morning), compose a single chat-opener message that
batches them:

*"Few things, got a minute? Calf has been coming up; race week
starts in three days; and the easy runs the last fortnight have
been heavier than the rest of the block."*

Then the orchestrator either delivers the three follow-up bodies as
a single message or threads them in over the chat surface as the
athlete replies.

**Status:** design call to be made when the new surfaces ship and
real batching cases turn up. For now, each surface fires on its own
trigger. The batching shape is documented here so engineering can
build the orchestrator with batching in mind from the start.

## 6. Coach status capture in onboarding

The structured follow-up bank captures coach status at Rank 1, but
adding a single yes/no chip at onboarding (Step 6 or 7 area) would
let the chat surface have the right posture from message one.

**Decision (light):** add a single chip-confirm during onboarding
under the goal-race step. *"Working with a human coach this block?
Yep / No / Self-directed"* with optional free-text for context.
Stores to `has_human_coach`. Skippable.

If this is too much for V1, the structured follow-up captures it
within the first 14 days and the chat-system prompt treats null /
unknown as "softer posture, like the coached path" until answered.

## 7. ICP narrowing (2:30 to 3:30)

The onboarding flow doc (`docs/onboarding-flow-working-draft.md`)
currently states ICP 2:45-3:45. The 2026-05-16 refresh interview
narrowed it to 2:30-3:30. The identity block reflects the new ICP.

**Action:** update `docs/onboarding-flow-working-draft.md` §1 to
match, and review any marketing or strategy docs that reference the
old band. This is a doc-edit, not a code-edit, but it should ride
with the engineering work so the team has one source of truth.

## 8. The home-state V1 constraint

`docs/home-state-and-chat-working-draft.md` §6 states that V1 has
no proactive or scheduled check-ins outside debriefs and weekly
reviews. The 2026-05-16 refresh adds four new proactive surfaces
(race-week briefing, fuelling pre-run, niggle escalation, mid-block
flatness).

**Action:** update the home-state doc §6 and §9 to reflect the
expanded scope. The thread architecture is unchanged (these are
still messages in the one thread); only the proactive-vs-responsive
constraint shifts.

## 9. validatePrompts surface list

The `validatePrompts` boot validator in `lib/llm/prompts.ts` accepts
a list of surface paths to verify. When the new surface prompts are
wired to call sites, the validator's surface list needs the new
prompts added so a missing file surfaces at boot rather than on the
first user request.

New entries:

- `race-week-briefing.md`
- `fueling-prerun.md`
- `fueling-retrospective.md`
- `niggle-escalation.md`
- `mid-block-flatness.md`

Find the boot caller (likely `app/api/.../route.ts` or an
instrumentation file) and extend its surfaces array.

---

## How this doc is used

- **Engineering** reads §1–§3, §5, §6, §9 for the build surface.
  Each item has a clear "what" and "why".
- **Design** reads §1 (tier UX), §6 (coach-status chip) for
  flow changes.
- **PM / Jason** reads §7, §8 for the doc reconciliations.
- **Reviewed** at each surface's first dogfood firing, and at the
  research review point for the niggle and flatness thresholds.
