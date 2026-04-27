# Coach Casey — RPE Capture: Feature Specification

**Owner:** Jason
**Last updated:** 2026-04-27
**Status:** Implementation spec. Ready to build against. Reasoning summarised here; fuller reasoning in `v1-scope.md` §2.1 and conversation history.

> **Supersession note (2026-04-27):** Moment-level shape — order on the surface, push body, picker decay, skip-count bucketing, Q2 timing and priority, divergence affordance — is now owned by `post-run-debrief-moment.md`. That doc supersedes §5, parts of §6, §7, and §8 of this spec where they conflict. Per-section markers below point at the relevant moment-doc section. This spec remains authoritative for §3 (data model), §4 (scale and copy), §10 (edge cases), §11 (out of V1), and §13 (done-when), with the moment-doc additions layered on top.

Read alongside `post-run-debrief-moment.md` (moment-level source of truth), `v1-scope.md` (the post-run follow-up structure RPE plugs into), `engineering-foundation.md` (data model conventions), `build-standards.md` (accessibility, error handling baselines), and `interaction-principles.md` (timing, feedback patterns).

---

## 1. What this feature is

Capture Rate of Perceived Exertion (RPE) on every synced activity, via a two-question post-run prompt:

- **Question 1: RPE.** A 1–10 numeric pick with anchored descriptors. Universal — appears for every eligible activity unless the athlete is in a paused state.
- **Question 2: Contextual follow-up.** Picked from a small set based on the run, the athlete's tenure, and (where present) the RPE answer. Replaces the existing single post-run follow-up slot specified in `v1-scope.md` §2.1.

Both questions are skippable. RPE skip-tracking pauses prompts after 5 consecutive explicit skips and re-prompts after a cooldown.

RPE feeds future debriefs, weekly reviews, and chat as longitudinal context. It does not modify today's debrief (see §6).

---

## 2. Why this matters (briefly)

RPE-vs-pace divergence is genuinely diagnostic — high RPE on easy pace flags fatigue, low RPE on hard pace flags adaptation. Strava doesn't capture this; other platforms ask but adherence is poor because the data goes into a void. In Coach Casey, RPE has an immediate visible payoff (it shapes Question 2 today, and the next debrief and weekly review tomorrow), and accumulates as a per-athlete signal that strengthens the moat. Fuller reasoning in `strategy-foundation.md` §5.

---

## 3. Data model additions

### 3.1 `activity_notes` — new columns

| Column | Type | Notes |
|---|---|---|
| `rpe_value` | `smallint`, nullable | 1–10. Non-null only if `rpe_answered_at` is non-null. |
| `rpe_prompted_at` | `timestamptz`, nullable | Set when the RPE prompt is first shown to the athlete for this activity. |
| `rpe_answered_at` | `timestamptz`, nullable | Set when the athlete submits an RPE value. |
| `rpe_skipped_at` | `timestamptz`, nullable | Set when the athlete explicitly dismisses the RPE prompt. |

**Constraints:**
- `rpe_value IS NOT NULL` only when `rpe_answered_at IS NOT NULL`
- At most one of `rpe_answered_at` and `rpe_skipped_at` is non-null
- `rpe_value BETWEEN 1 AND 10`

**Indexes:**
- `(athlete_id, rpe_prompted_at DESC)` — supports the consecutive-skip-count query (see §6).

### 3.2 `athletes` — new columns

| Column | Type | Notes |
|---|---|---|
| `rpe_prompts_paused_until` | `timestamptz`, nullable | When set and in the future, RPE prompts are suppressed. |

### 3.3 RLS

Standard per-athlete RLS, same pattern as the rest of `activity_notes`. No new policies needed beyond the existing template.

---

## 4. Scale and copy

- **Scale:** 1–10 numeric.
- **Descriptors:** anchored at positions 1, 3, 5, 7, and 10. Visible alongside the picker on first use; subsequent uses can show on tap-and-hold.
- **V1 build placeholder copy** (will be replaced at launch-prep by the content workstream — do not treat as final):
  - 1: *very easy*
  - 3: *steady*
  - 5: *somewhat hard*
  - 7: *very hard*
  - 10: *max effort*
- Picker rendered as a horizontal numeric strip on mobile (1–10), large enough to be tappable. Selected number is highlighted in plum accent. Tabular numerals (per `visual-identity.md` §1).

Final descriptor copy is a launch-prep open item — see `open-questions-log.md`.

---

## 5. Where the RPE prompt appears

> **Superseded — see `post-run-debrief-moment.md` §3.2 and §10 decision 1.** Picker now sits **below** the debrief prose, not above. The eligibility rules and `rpe_prompted_at` semantics in this section still apply. The placement and the order-of-attention have flipped.

- **Surface:** the debrief surface, at the top, above the debrief body.
- **Trigger conditions** (all must be true):
  - The activity is one Coach Casey would otherwise generate a debrief for (run, ride, swim — not walks, manual activities under the threshold)
  - Activity duration ≥ 10 minutes (skip very short activities — see §10)
  - `activity_notes.rpe_prompted_at` is `NULL` for this activity
  - `athlete.rpe_prompts_paused_until` is `NULL` or in the past
- **On display:** set `rpe_prompted_at = NOW()` (idempotent — only the first display sets it).
- **On answer:** set `rpe_value`, `rpe_answered_at = NOW()`. Reveal Question 2 (see §7).
- **On skip:** set `rpe_skipped_at = NOW()`. Reveal Question 2 — skipping RPE does not skip the secondary follow-up.
- **Optimistic UI** per `interaction-principles.md` §3.4 — local state updates immediately on tap, server reconciles in the background.

The debrief body renders below the RPE prompt regardless of whether RPE has been answered. The athlete can read the debrief without engaging the prompt; the prompt remains visible and tappable.

---

## 6. Interaction with debrief generation

> **Partially superseded — see `post-run-debrief-moment.md` §10 decision 4.** The debrief *body* still does not consume today's RPE (the carve-out below stands — sync-time generation, stale-debrief avoidance). What changed: today's RPE *does* now inform today's **Q2** (the divergence-aware branch), generated lazily after RPE submission. See `post-run-debrief-moment.md` §3.3 and §5.2. Same-activity RPE-aware *debrief body* remains a launch-prep open item.

**The current activity's debrief does not consume the current activity's RPE.** Reasoning: debriefs generate on Strava sync (typically before the athlete opens the app); waiting for RPE before generating introduces complex timing logic and stale-debrief risk. Subsequent debriefs, weekly reviews, and chat use accumulated RPE as longitudinal context. Same-activity RPE-awareness is a V1.1 candidate.

What this means in practice:
- Today's debrief does not reference today's RPE.
- Today's RPE shows up in tomorrow's RPE-aware analysis ("yesterday's easy was a 7 — keeping today gentler").
- Weekly review consumes the full week's RPE as input to its interpretation.
- Question 2 (the follow-up) is RPE-aware in the same session — see §7.

If the launch-prep content review concludes the athlete will feel cheated by an RPE-blind same-day debrief, two-stage generation becomes a launch-prep design item. Not building it day-1.

---

## 7. Question 2 — contextual follow-up

> **Superseded — see `post-run-debrief-moment.md` §5 and §3.3.** Q2 timing changed: a conversational Q2 is generated at sync time and shown by default; the divergence-aware branch generates *lazily* on RPE answer and **replaces the conversational Q2 in place** when divergence fires. The priority order below is preserved logically, but the picker now runs after RPE submission rather than at sync. The divergence-aware Q2 also acquires affordance chips (currently one: *Chat about this run*) and a permitted light forward-implicating line — see moment-doc §5.2 and §10 decisions 9 and 10. Cross-training does **not** get a divergence-aware Q2 in V1 — see moment-doc §7.

Question 2 replaces the existing single-follow-up slot from `v1-scope.md` §2.1. The picker chooses one of three question types, in this priority order:

1. **Phase 2 structured context question** — used in weeks 1–2 of athlete tenure, while the structured context backlog (the ranked list from `v1-scope.md` §6) has unasked questions.
2. **RPE-branched follow-up** — used when RPE was answered (not skipped) and shows divergence from expected effort for the activity type.
3. **Conversational follow-up** — fallback. Generated per-run based on what's notable about the activity (existing `v1-scope.md` §2.1 behaviour).

### 7.1 RPE-branched follow-up logic (V1 day-1)

Keep the V1 logic deliberately simple. The picker sophistication is V1.1 polish.

- **High RPE on easy intent:** `rpe_value >= 7` AND the activity matches an easy/recovery profile (see below) → fire follow-up: *"Felt harder than I'd have expected — what was going on?"*
- **Low RPE on hard intent:** `rpe_value <= 4` AND the activity matches a hard/workout profile → fire follow-up: *"Felt smoother than I'd have expected — what made the difference?"*
- **No divergence:** RPE within an unremarkable band → fall through to conversational follow-up.

**Easy intent detection** (V1, simple heuristic):
- Activity matches a planned easy/recovery session in the uploaded plan, OR
- Activity has no plan match AND average HR is in the athlete's lower band (per their rolling baseline), OR
- Activity is shorter than the athlete's median run length AND below their median pace

**Hard intent detection** (V1, simple heuristic):
- Activity matches a planned workout/long-run/tempo/threshold session, OR
- Activity has no plan match AND contains structured laps suggesting intervals, OR
- Activity duration or pace places it in the athlete's top quartile for the trailing 30 days

These heuristics are intentionally crude. The picker accuracy can improve in V1.1 once real RPE data accumulates.

### 7.2 Conversational follow-up

Existing `v1-scope.md` §2.1 behaviour. Generated per-run as today.

### 7.3 Picker shape (engineering)

Implement Question 2 selection via a small server-side picker function that returns `{type, prompt_id, params}`. Behind a feature flag so the picker logic can evolve without redeploys. Picker output fed into the prompt rendering path.

### 7.4 Cadence

One Question 2 per run. Skippable. Non-repeating per run. Same rules as the existing single-follow-up slot in `v1-scope.md` §2.1.

---

## 8. Skip mechanics

> **Superseded — see `post-run-debrief-moment.md` §6 and §10 decision 6.** Skip count is now bucketed into **two buckets — run and cross-training**, not a single global counter. Five active skips in a bucket pauses RPE prompts for that bucket only, for 21 days; the opposing bucket continues firing. The active-skip vs non-engagement distinction in §8.1 below still applies. The §8.3 query gains a `WHERE` clause scoped per bucket. The data model implication (one column scoped by bucket vs. two columns vs. separate table) is an open engineering call — see moment-doc §11.

### 8.1 Definitions

- **Active skip** = `rpe_prompted_at IS NOT NULL` AND `rpe_skipped_at IS NOT NULL` AND `rpe_value IS NULL`.
- **Non-engagement** = `rpe_prompted_at IS NOT NULL` AND `rpe_skipped_at IS NULL` AND `rpe_value IS NULL`. Athlete saw the prompt but neither answered nor explicitly skipped (e.g. closed the app, never returned).
- **Answer** = `rpe_value IS NOT NULL`.

**Only active skips count toward the threshold.** Non-engagement does not. Reasoning: a user who never opens the debrief shouldn't have RPE silently disabled. Revisit at launch-prep — see open questions.

### 8.2 Pause threshold

- When the athlete has 5 consecutive active skips (counted from most recent prompted activity backwards, stopping at the first non-skip — answer, non-engagement, or no prompt), set `athletes.rpe_prompts_paused_until = NOW() + INTERVAL '21 days'`.
- Pause runs as part of the same code path that decides whether to show the prompt — checked on every potential prompt display.

### 8.3 SQL for the consecutive-skip count

```sql
-- For a given athlete, count consecutive active skips from most recent prompted activity backwards
WITH recent_prompts AS (
  SELECT
    rpe_prompted_at,
    rpe_value,
    rpe_skipped_at,
    rpe_answered_at
  FROM activity_notes
  WHERE athlete_id = $1
    AND rpe_prompted_at IS NOT NULL
  ORDER BY rpe_prompted_at DESC
  LIMIT 10  -- only need to look back at most 5; 10 is buffer
),
labelled AS (
  SELECT
    *,
    CASE
      WHEN rpe_value IS NOT NULL THEN 'answered'
      WHEN rpe_skipped_at IS NOT NULL THEN 'skipped'
      ELSE 'no_engagement'
    END AS state,
    ROW_NUMBER() OVER (ORDER BY rpe_prompted_at DESC) AS rn
  FROM recent_prompts
)
SELECT COUNT(*) AS consecutive_skips
FROM labelled
WHERE rn <= (
  SELECT COALESCE(MIN(rn), 11) - 1
  FROM labelled
  WHERE state IN ('answered', 'no_engagement')
)
AND state = 'skipped';
```

Trigger evaluation: after every RPE skip is recorded. If count >= 5, apply pause.

### 8.4 Re-prompt after pause

- After `rpe_prompts_paused_until` passes, the next eligible activity shows the RPE prompt with a slightly different framing (acknowledging the gap). Exact copy is launch-prep — placeholder for V1 build: *"OK to ask again? You can keep skipping if it's not useful."*
- If the athlete answers → resume normally.
- If the athlete skips this re-prompt → it counts as one skip toward a fresh 5-skip threshold. Pause recurs only after another 5 consecutive active skips.

This may be too lenient — the athlete might skip another 5 before pausing again. An alternative shorter post-pause threshold (e.g. 2 skips → pause again, longer) is launch-prep tunable.

---

## 9. Downstream consumers

### 9.1 Debrief generation prompt

- The debrief prompt template (`prompts/post-run-debrief.md`) accepts RPE history as input context, not the current activity's RPE (per §6).
- Prompt receives: trailing 14–28 days of `(activity, rpe_value, planned_intent)` triples for divergence pattern recognition.
- Prompt update is part of the prompt engineering workstream — see `v1-scope.md` §4.

### 9.2 Weekly review prompt

- The weekly review prompt receives the full week's `(activity, rpe_value, planned_intent)` set.
- RPE-vs-pace divergence trends are a primary input to the week's interpretation. *"You ran easy four times this week, RPE averaged 5 — that's higher than your usual easy band of 3-4. Worth watching."*

### 9.3 Chat

- Reactive chat has access to the athlete's full RPE history via the memory store.
- No special chat behaviour needed at V1 — the prompt has the data and uses it as it would any other longitudinal signal.

### 9.4 Memory items

- Establish a per-athlete RPE baseline as a `memory_item` after ~10 RPE answers (e.g. *"easy run baseline: RPE 3-4; long run baseline: RPE 5-6; workout baseline: RPE 7-8"*).
- Updated periodically as more data accumulates. Specific cadence and format: launch-prep design.

---

## 10. Edge cases

> **Picker decay added — see `post-run-debrief-moment.md` §3.5 and §10 decision 3.** Picker hides 4h after first display if not engaged. Counts as non-engagement, not active skip. The cross-training bullet below is affirmed and extended in moment-doc §7 (RPE fires same shape as runs, no divergence Q2 in V1, no affordance chips in V1).

- **Non-run activities (cycling, swimming, cross-training):** show RPE prompt. RPE is valid for any aerobic activity.
- **Very short activities (<10 min):** suppress the RPE prompt entirely. No prompt, no `rpe_prompted_at` set.
- **Multi-activity days:** each activity prompts independently. Two runs in a day = two RPE prompts.
- **Edited Strava activities:** RPE persists. `activity_notes` rows are tied to the activity ID; activity-level edits don't disturb the notes row.
- **Deleted Strava activity:** cascade delete on `activity_notes`, including the RPE record. Standard FK behaviour.
- **Athlete answers RPE outside the debrief surface:** not supported in V1. Single point of capture.
- **Athlete wants to edit a submitted RPE:** not supported in V1. RPE answered or skipped is final per activity. Edit capability is V1.1.
- **Manual / non-Strava activities:** the data model treats them like any other activity. RPE prompt logic applies if the activity passes the duration threshold and would generate a debrief.
- **Strava sync delay:** if a debrief generates 6 hours after the activity, RPE prompt still appears on first debrief view. `rpe_prompted_at` reflects the display time, not the activity time.

---

## 11. Out of V1

- RPE editing after submission
- Custom RPE scales (per-athlete preference, e.g. 1–7)
- A standalone RPE history or trends UI (the data is consumed by Coach Casey, not displayed as a tracker — see `design-principles.md` §3 *moments over dashboards*)
- Sub-activity RPE (per rep, per lap, perceived cardio vs muscular)
- Same-activity RPE-aware debriefs (revisit at launch-prep if the gap feels jarring in dogfood)
- Smart Question 2 picker beyond the simple priority order in §7

---

## 12. Launch-prep open items

These get resolved before V1 ships, not at day-1 build time. Tracked in `open-questions-log.md`:

- **Final scale descriptor copy** (content workstream)
- **Re-prompt copy and post-pause threshold tuning** (currently 21-day pause, 5-skip threshold post-pause — both placeholder)
- **Whether non-engagement should count toward skips** (current decision: no)
- **RPE baseline derivation cadence and `memory_item` shape** (engineering + content)
- **Picker logic refinement** (current logic in §7 is deliberately simple)
- **Same-activity RPE awareness for debriefs** (current decision: no, revisit if gap is jarring)

---

## 13. Done when

- [ ] Migration adds the four columns to `activity_notes` and `rpe_prompts_paused_until` to `athletes`, with constraints and the index in §3.1.
- [ ] Migration applied and verified against dev DB.
- [ ] RPE prompt UI implemented per §4 and §5 with placeholder copy.
- [ ] Skip-count query implemented; unit tests cover: 0 skips, 1 skip, 5 skips triggers pause, 4 skips + 1 answer resets count, 4 skips + 1 non-engagement resets count, post-pause re-prompt path.
- [ ] Pause and re-prompt logic implemented and tested.
- [ ] Question 2 picker function implemented behind a feature flag, with the three priority types per §7.
- [ ] RPE history wired into debrief prompt context (input shape defined; prompt update lives in the prompt engineering workstream, not blocking this spec).
- [ ] RPE history wired into weekly review prompt context.
- [ ] Eval fixtures added covering RPE-divergence cases (high RPE on easy, low RPE on hard, RPE within band).
- [ ] Accessibility verified per `build-standards.md` §2: numeric picker keyboard-navigable, descriptors announced by screen readers, focus visible.
- [ ] Observability: each prompt display, answer, and skip emits a PostHog event. RPE submission failures logged to Sentry.

---

## 14. Notes for the engineer

A few asks that come from the project's working style:

- **Schema migrations only, never manual SQL.** Per `engineering-foundation.md` §7.
- **RLS on the new columns from the migration that adds them.** Existing `activity_notes` policies should already cover athlete-scoped access; verify the new columns are reachable under those policies.
- **Feature flag the Question 2 picker** so the picker logic can be tuned without redeploys.
- **Don't optimise the skip-count query past §8.3 unless it becomes a hot path.** It runs once per RPE skip, against a small per-athlete result set. Premature optimisation here is wasted.
- **Placeholder copy is placeholder copy.** Don't polish it; the content workstream owns final copy. Mark every placeholder string clearly so they don't accidentally ship.
