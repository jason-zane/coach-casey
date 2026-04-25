# Coach Casey — Cross-Training and Other Activities

**Owner:** Jason
**Last updated:** 2026-04-25
**Status:** Living document. Full feature spec — product behaviour, design intent, and engineering implementation. Built so an engineer can implement against it directly. Expected to evolve as build surfaces decisions the spec didn't anticipate.

Supersedes project memory when they conflict. Read alongside `strategy-foundation.md` (thesis — Coach Casey is a marathon coach, not a multi-sport coach), `v1-scope.md` (post-run debriefs and follow-ups, which this surface mirrors), `voice-guidelines.md` (in-product register), `interaction-principles.md` (push behaviour, message rhythm), `engineering-foundation.md` (services, data model conventions), `build-standards.md` (engineering baselines), and `technical-decision-log.md` (locked engineering decisions).

---

## Part A — Product behaviour and design

Sections 1–8 describe what this surface does and why. The engineering sections (9 onwards) implement against this part.

---

## 1. Why this exists

Marathon training doesn't happen only on the runs. The bike on a recovery day, the gym session on Tuesday, the swim that replaced an aborted tempo — all of it shapes how the next run goes, and all of it carries information about the athlete's life and body that Coach Casey should be paying attention to.

Three jobs this surface does:

1. **Captures life and load context.** Cross-training activities are part of the picture Coach Casey holds about the athlete. Memory lives here as much as in chat.
2. **Lightly interprets.** Coach Casey is a marathon coach, not a strength coach or a swim coach. The interpretation is honest about that — observational, focused on running impact, not pretending to coach the activity itself.
3. **Detects substitution.** When a cross-training session appears where a run was planned, that's a signal worth surfacing. Often it's an injury or niggle; sometimes it's life. Either way, Coach Casey should notice and ask.

What this surface is not: a cross-training coaching surface. Coach Casey does not write strength programmes, prescribe yoga sequences, or build swim sets. The interpretive depth is intentionally light.

---

## 2. What triggers a prompt

### 2.1 Activities that trigger

When any of the following sync from Strava, Coach Casey produces a single thread message:

- Ride (outdoor)
- Virtual Ride (Zwift, etc.)
- Swim (pool or open water)
- Workout / WeightTraining (gym, strength)
- Yoga
- Pilates
- **Catch-all:** any other Strava activity type not on the run path or in the ambient-only list (§2.2). Treated with the generic interpretation pattern.

Note: Virtual Run flows into the run debrief pipeline, not this one. Listed in §5.6 only for boundary clarity.

### 2.2 Activities that don't trigger

These sync to context but produce no thread message:

- Walk — too noisy (dog walks, commutes). Captured as ambient load context only.

If usage data later shows athletes wanting walks acknowledged (e.g. they're using long deliberate walks as recovery), revisit.

### 2.3 Cadence

- One message per activity. No batching.
- No daily or weekly cap. A daily lifter gets a prompt per gym session. Pattern recognition (§4) reshapes what the prompt says, not whether it fires.
- Each prompt is its own thread message — visually distinct from run debriefs but in the same thread.
- Push notification fires on every cross-training prompt, same as run debriefs. Athlete can toggle this off in preferences if it becomes too much (§17).

---

## 3. Anatomy of a cross-training message

### 3.1 Structural shape

Shorter than a run debrief. One short paragraph or a single sentence-plus-question. Always in-product register (`voice-guidelines.md` §3) — quiet, observational, trusting the athlete to fill in the rest.

Three components, in order:

1. **Acknowledge specifically.** The activity type, the duration or distance, and one observable detail if Strava provided it (title, HR, the day's context).
2. **Interpret lightly.** A line that connects this activity to the running picture — recovery, load, substitution, pattern. Drawn from the per-activity knowledge base (§5).
3. **Open the door.** A short question that invites context. Skipped if the title or data already answers it.

### 3.2 Question vs no question

- **Ask** when the activity is novel, the title is generic, or the context is unclear.
  *"90 min on the bike. Easy spin or session?"*
- **Don't ask** when the title or data already answers it.
  *"Saw your 'easy spin' on the bike. Good shake-out the day after a tempo."*
- **Don't ask** when the pattern is established and there's nothing new to surface (§4).
  *"Tuesday gym, like clockwork."*

### 3.3 Reply behaviour

Athlete replies in the same way they reply to post-run follow-ups — taps the message, types a response.

- The reply is a real chat turn (not a system message). Goes into memory via structured tool use.
- Follow-up turns work normally if the athlete wants to keep talking.
- If ignored, the prompt does not re-ask. Same discipline as post-run follow-ups (`v1-scope.md` §2.1).
- Whatever the athlete says feeds into context for the next run debrief and any substitution detection.

### 3.4 Voice anchor examples

Marketing-register and motivational language stay out. Anchor examples:

- ✅ *"40 min easy spin. Legs probably appreciated it after Sunday's long run."*
- ✅ *"Saw the swim today. Anything going on with the legs, or just mixing it up?"*
- ✅ *"Yoga again — third time this week. Anything in particular you're working on?"*
- ❌ *"Great cross-training session!"* — sycophancy, generic.
- ❌ *"Strong work on the bike today — keep it up!"* — performative, not the voice.
- ❌ *"Your bike session shows excellent zone 2 discipline."* — pretending to coach the activity.

---

## 4. Pattern recognition

Pattern recognition shapes what the prompt says, not whether it fires. The athlete still gets a message; the message acknowledges the pattern instead of treating each session as new.

**What counts as a pattern:**

- Same activity type, same approximate day-of-week, repeated three or more times in the last four weeks.
- Common examples: Tuesday gym, Friday yoga, Sunday recovery spin.

**What changes when a pattern is established:**

- The message acknowledges the rhythm rather than asking what the activity was. *"Tuesday gym, like clockwork. How was it?"*
- The interpretive line can refer to the pattern's relationship to running. *"Tuesday gym, day before tempo — usually fine for you, the legs have been good on Wednesdays this block."*
- The question, when present, gets sharper — it asks about *this* session in the context of the pattern, not about the activity in general.

**When a pattern is broken:**

- Pattern session missed → captured silently in context. Coach Casey notices, doesn't comment unless something else (a substitution, a complaint about energy) makes it relevant.
- Pattern session done unusually hard or long → the message reflects the change. *"Longer ride than your usual Sunday spin. Something different going on?"*

---

## 5. Per-activity knowledge base

This is the substantive coaching layer Coach Casey draws on when interpreting. Each entry covers: load profile (what this costs the body), typical use case in marathon training, substitution signals, interpretation patterns.

**These are first drafts. Jason to review and rewrite in his coaching voice.** The substance here directly shapes prompt quality — generic descriptions produce generic prompts. The voice and judgement need to be Jason's, not generic endurance-training boilerplate.

### 5.1 Ride (outdoor / virtual)

**Load profile.** Aerobic, low impact. Easy spinning is genuinely recovery-promoting (light venous return, low neuromuscular cost). Hard riding (sustained intervals, sprints, climbing) is real cardiovascular load that shows up in subsequent runs as fatigue, sometimes for 24–48 hours.

**Typical use cases.** Recovery the day after a hard run. Aerobic supplement on a non-run day. Substitute for a run when injured or managing load.

**Substitution signal strength: medium.** Riding is the most common substitute for a planned run, especially for foot/lower-leg niggles. If a planned run is missing and a ride appears the same day or near it, flag for substitution check.

**Interpretation patterns.**
- Easy ride day after long run → recovery-positive, expect normal legs the next day.
- Hard ride (high HR, long duration) → acknowledge the load, watch for fatigue carrying into the next run.
- Ride replacing a planned run → ask about the substitution.

### 5.2 Swim

**Load profile.** Aerobic, zero impact, full-body. Cardiovascular load without the running impact cost. Often used for active recovery or when the legs need a break.

**Typical use cases.** Active recovery. Aerobic supplement. Substitute for a run when impact-loaded injuries (calf, foot, shin) flare.

**Substitution signal strength: high.** A swim where a run was planned almost always means impact is being managed. Flag for substitution check, with injury/niggle as the likely reason.

**Interpretation patterns.**
- Swim on a recovery day → low cost, fine.
- Swim replacing a planned run → ask. Calf, shin, or foot history makes the question more pointed.
- Long open-water swim → real cardiovascular load, may feel it in the legs.

### 5.3 Gym / Weight Training

**Load profile.** Highly variable. Heavy lower-body strength work is genuinely costly to the legs and shows up the next day. Upper-body or light maintenance work is not. Coach Casey can't always tell which from Strava data alone — duration and HR are weak signals; the title sometimes helps.

**Typical use cases.** Strength supplement (typical for serious marathon runners). Injury prevention or rehab. Sometimes pure habit unrelated to running.

**Substitution signal strength: low.** Gym sessions usually run alongside running, not instead of it. Substitution is possible (e.g. an athlete with a niggle who's been told to lift instead of run) but less common.

**Interpretation patterns.**
- Day before a key session → ask whether it was heavy, since heavy lower-body the day before a hard run is worth knowing about.
- Pattern session (recurring weekly) → acknowledge the pattern, don't over-interrogate.
- Unusually long or HR-elevated session → flag for context.

### 5.4 Yoga

**Load profile.** Low cost in most forms. Restorative or yin-style is recovery-promoting. Vinyasa or power yoga has real cardiovascular and muscular load and shouldn't be treated as zero-cost.

**Typical use cases.** Mobility, recovery, stress management. Sometimes prescribed for injury prevention.

**Substitution signal strength: low to medium.** Less common as a direct substitute for a run, but a yoga session replacing a planned run often signals the athlete is dialling back — niggle, fatigue, or life stress.

**Interpretation patterns.**
- Pattern session → acknowledge, ask what they're working on if context is thin.
- After a hard run → recovery-positive, no concern.
- Replacing a run → ask, with mobility/injury as likely context.

### 5.5 Pilates

**Load profile.** Similar to yoga — low to moderate, depending on style. Reformer Pilates can be more loading than mat. Generally low impact, focused on core and stabilisers.

**Typical use cases.** Core work, injury prevention, rehab. Often prescribed by physios.

**Substitution signal strength: low to medium.** Same logic as yoga — a Pilates session replacing a planned run often signals an injury management decision.

**Interpretation patterns.** Same shape as yoga. Acknowledge, ask if context is thin, watch for substitution patterns.

### 5.6 Virtual Run (boundary note only)

Virtual runs flow into the run debrief pipeline, not this one. Listed here for explicit boundary clarity.

If the athlete has been running outdoors and suddenly switches to treadmill for a session, that's worth noticing — usually weather, sometimes injury management. Surfaces in the run debrief, not as a cross-training prompt.

### 5.7 Catch-all (other activity types)

For activity types not specified above (hike, ski, paddleboard, e-bike, rowing, etc.): use the generic interpretation pattern.

- Acknowledge the activity and duration.
- One light line connecting it to the running picture if a connection is obvious; skip the line if it isn't.
- Ask an open question if context is thin.

Coach Casey is honest about its limits. *"Saw the kayak today. Hard to say how that interacts with running, but it's there in the picture."* is acceptable. Inventing interpretation it doesn't have is not.

---

## 6. Substitution detection

Substitution is when a cross-training activity appears where a run was planned. Coach Casey notices, asks, and feeds the answer into context.

### 6.1 What triggers substitution detection

All three conditions:

1. A plan is uploaded and current.
2. The plan had a run prescribed for the day in question.
3. A cross-training activity synced for that day, and no run did.

Without an uploaded plan, substitution detection is not possible — Coach Casey can't know what was meant to happen. This is one of the unlocked behaviours that comes with plan upload, and worth flagging in the upload re-prompt copy (`v1-scope.md` §2.2).

### 6.2 What the prompt looks like

The standard cross-training message (§3) gets a substitution-aware variant.

- **Acknowledge the activity.** Same as standard.
- **Note the substitution explicitly but lightly.** *"Saw the swim today instead of the tempo."* Not framed as a problem; framed as something Coach Casey noticed.
- **Open the door with a specific question.** The question is sharpened by what's already in context — known niggles, recent complaints, life stress.

Three substitution scenarios with example shape:

**Known niggle in context:**
*"Saw the swim today instead of the tempo. Calf still talking?"*

**No niggle, no recent stress flagged:**
*"Saw the swim today instead of the tempo. Anything going on, or just shuffling things?"*

**Recent life stress flagged:**
*"Bike instead of the tempo today. Sensible call after the week you've been having."*

### 6.3 Memory implications

Substitution events are high-value memory. Whatever the athlete says in response feeds:

- The injuries/niggles record (if injury is the reason).
- The training context record (if life is the reason).
- Subsequent run debriefs, which can reference the substitution. *"First tempo back after swimming through the calf flare — easy day, see how it feels."*

Substitution detection is one of the clearest demonstrations of the moat. Coach Casey notices a pattern that requires plan + activity + life context to read correctly. This is exactly the kind of thing Strava structurally won't build.

---

## 7. Plan-prescribed cross-training

Some plans (Pfitzinger, some coach-written plans) prescribe cross-training explicitly. When the plan includes cross-training entries, those entries are interpreted alongside running entries — same logic as run sessions.

**What this means in practice:**

- A planned 30-minute easy bike that becomes a 90-minute hard ride is treated as a deviation from plan, same as an easy run that becomes a tempo.
- A prescribed strength session done as planned gets a "did it as written" acknowledgement.
- A prescribed cross-training session missed is logged as a missed session, not held against the athlete in voice but available in context.

Plan extraction (`v1-scope.md` §2.2) needs to capture cross-training entries when present. Worth confirming with the prompt engineering workstream that the extraction prompt handles this.

---

## 8. How cross-training feeds run debriefs

Cross-training context surfaces in run debriefs **ambiently by default, explicitly when the connection is real.**

**Ambient (most cases):**
The cross-training context is part of the picture Coach Casey holds when interpreting the run, but it isn't called out in the debrief. The legs feel a little heavy on the tempo because of yesterday's hard ride; the debrief reads the tempo and reflects the heaviness, without necessarily attributing it to the ride.

**Explicit (when the connection is real and useful):**
*"Heavy spin yesterday, so the legs going into this morning's tempo were probably a touch loaded."* Used when the cross-training session is the most likely explanation for what's visible in the run.

**Anti-pattern:** tacking on cross-training references for completeness. *"You did yoga yesterday."* in a debrief that has nothing to do with yoga is filler. Cut it.

This is a prompt engineering call as much as a design call. The debrief prompt needs cross-training context available in its input but should be instructed to reference it only when it explains something visible in the run.

---

## Part B — Engineering implementation

Sections 9 onwards specify how this gets built. An engineer should be able to implement against this part directly, with §1–8 as reference for behaviour and intent.

---

## 9. Dependencies

This feature depends on the following being in place. If any are missing or incomplete, build sequence (§20) addresses ordering.

**Required (build cannot proceed without these):**

- **Strava webhook integration.** Activities sync from Strava to the `activities` table on creation. The webhook pipeline is the entry point for this feature.
- **Sonnet LLM client with prompt caching** (per `technical-decision-log.md`). Cross-training prompts use the same client as run debriefs.
- **`debriefs` table** (or equivalent — see §10.1 note on data model assumption) with the ability to store activity-linked Coach Casey messages.
- **`activities` table** with type, duration, distance, HR, title, and start_time fields populated from Strava.
- **Push notification system.** Run debriefs trigger push; cross-training rides on the same channel.
- **Athlete preferences surface.** Adding a new toggle requires the preferences UI to exist.

**Required for substitution detection only (§14):**

- **Plan upload working.** Substitution detection reads from `planned_sessions`. If plan upload isn't shipped, the substitution path is dormant and the feature ships with the §12 standard path only. Substitution can be added in a follow-up once plan upload lands.

**Not required:**

- Pattern detection (§13) is computed on-the-fly from `activities`, requires no other feature to be live.
- Per-activity knowledge base (§5) is content baked into the prompt; not a runtime dependency.

---

## 10. Data model

### 10.1 Assumption to confirm

The existing schema (per `technical-decision-log.md` and `v1-scope.md` §3) lists a `debriefs` table. This spec assumes `debriefs` is the right home for cross-training acknowledgement messages — it already exists for run debriefs (proactive, activity-linked, Coach Casey-generated content), and cross-training acknowledgements share the same shape (proactive, activity-linked, generated content with optional athlete reply).

**Engineer to confirm against the actual built schema before applying changes.** If `debriefs` is structured run-only (e.g. has run-specific columns like `pace_summary` that don't apply to cross-training), the alternative is to extend it with a `kind` discriminator and nullable run-specific columns, or to introduce a parallel `activity_messages` table. Recommendation is to extend `debriefs` with a `kind` discriminator — adding a parallel table is more code paths for the same conceptual artifact.

### 10.2 Changes to `debriefs`

Add the following columns:

| Column | Type | Default | Purpose |
|---|---|---|---|
| `kind` | enum (`run_debrief`, `cross_training_ack`, `cross_training_substitution`) | `run_debrief` | Discriminator. Existing rows backfill to `run_debrief`. |
| `is_pattern_session` | boolean | false | Whether the linked activity matched an established pattern at generation time. |
| `pattern_description` | text | null | Cached pattern description (e.g. "Tuesday gym, 5 of last 4 weeks") used in the prompt. Null when not a pattern. |

Existing columns (assumed to exist; engineer to verify): `id`, `athlete_id`, `activity_id`, `content`, `created_at`, `model_version`, `prompt_version`. If `model_version` and `prompt_version` aren't already there, add them — non-negotiable for prompt-iteration discipline (per `engineering-foundation.md` §8).

**RLS:** existing debrief RLS policies apply. No changes needed — same athlete-scoped access.

### 10.3 Changes to `preferences`

Add the following column:

| Column | Type | Default | Purpose |
|---|---|---|---|
| `cross_training_push_enabled` | boolean | true | Athlete-controlled push toggle for cross-training acknowledgements. |

Default ON. Athletes who don't want cross-training pushes can toggle off in notification preferences.

### 10.4 No changes to `activities`

Activities sync from Strava as-is. The activity type field (already present from Strava webhook) is the routing signal. No new columns.

### 10.5 No new tables

Pattern detection runs as a query against `activities` (§13). Substitution detection runs as a query against `planned_sessions` and `activities` (§14). No caching tables — at V1 user scale, on-the-fly queries are trivially cheap and pre-optimisation adds complexity for no benefit.

If pattern detection becomes a performance issue at scale (unlikely below 10k users), a denormalised `athlete_patterns` table with daily refresh becomes the answer. Don't build it now.

### 10.6 Migration

Single migration file: `supabase/migrations/000XX_cross_training.sql`. Adds the three columns above, sets defaults, backfills `debriefs.kind = 'run_debrief'` for existing rows. Standard pattern per `engineering-foundation.md` §7.

---

## 11. Activity sync routing

### 11.1 Existing flow (assumed)

When a Strava webhook fires for a new activity:

1. `/api/strava/webhook.py` receives the event.
2. Activity is fetched via Strava API and stored in `activities`.
3. If the activity is a Run or VirtualRun, the run debrief pipeline is triggered.

### 11.2 New routing logic

After step 2, before any pipeline triggers, route by activity type:

```
activity_type = activities.activity_type  # Strava's type field

if activity_type in ('Run', 'VirtualRun'):
    → run debrief pipeline (existing)

elif activity_type == 'Walk':
    → no pipeline. Activity is stored, available as ambient context for future debriefs.
    Log: 'walk_ambient_capture' to PostHog.

elif activity_type in CROSS_TRAINING_TYPES:
    → cross-training acknowledgement pipeline (§12)

else:  # unrecognised type
    → cross-training acknowledgement pipeline with catch-all handling (§5.7)
```

`CROSS_TRAINING_TYPES` constant: `['Ride', 'VirtualRide', 'Swim', 'Workout', 'WeightTraining', 'Yoga', 'Pilates']`. Live in `api/_shared/constants.py` or equivalent.

### 11.3 Idempotency

The pipeline must not generate duplicate messages for the same activity. Guard at the entry point:

```sql
SELECT 1 FROM debriefs WHERE activity_id = $1 LIMIT 1;
```

If a debrief already exists for the activity, exit early. Strava can send webhook events more than once for the same activity (retries on their side); the pipeline must be idempotent.

### 11.4 Retroactive activities

Activities synced more than 24 hours after their `start_time` should be treated as ambient capture only — no message generated, no push. Rationale: a debrief or cross-training prompt arriving for a 5-day-old activity is jarring and stale; the moment has passed.

```
if (now() - activity.start_time) > 24 hours:
    → ambient capture only, no pipeline trigger
    Log: 'retroactive_activity_skip' to PostHog with activity_type and age.
```

Edge case: athlete connects Strava for the first time and historical activities sync via backfill. Backfill should bypass the message pipeline entirely (set an `is_backfill` flag during the initial sync, skip the routing entirely when true).

---

## 12. Cross-training acknowledgement pipeline

The standard path. Substitution detection (§14) runs as an extension of this path when conditions are met.

### 12.1 Sequence

1. **Idempotency check** (§11.3). Exit if already processed.
2. **Retroactive check** (§11.4). Exit to ambient capture if too old.
3. **Pattern detection query** (§13). Returns `is_pattern: bool, pattern_description: str | null`.
4. **Substitution detection query** (§14). Returns `is_substitution: bool, planned_session: object | null`. Only runs if a current plan exists.
5. **Build prompt input** — activity data, pattern info, substitution info, recent context, per-activity knowledge base entry (§15.2).
6. **Sonnet call with structured tool use** — generates the message text. Tool use available for memory writes if the prompt determines they're warranted (rare on initial generation; more common on athlete reply).
7. **Persist to `debriefs`** with `kind = 'cross_training_ack'` (or `'cross_training_substitution'` if §14 fired), `is_pattern_session`, `pattern_description`, `model_version`, `prompt_version`.
8. **Trigger push notification** if `preferences.cross_training_push_enabled = true`.
9. **Log to PostHog**: `cross_training_ack_generated` with tags for `activity_type`, `is_pattern`, `is_substitution`.
10. **Log to Langfuse** (per `engineering-foundation.md` §8) — full prompt, response, tokens, latency, cost.

### 12.2 Failure handling

Per `build-standards.md` §3.2:

- **LLM call timeout/error** → one silent retry, 500ms backoff. If still failing, log to Sentry and skip silently. The athlete sees no message; the activity remains in context. Do not surface a failure — a failed cross-training acknowledgement is a silent miss, not a user-facing error.
- **Database write failure** → three retries, exponential backoff. If all fail, log to Sentry. The Sonnet call has already happened (cost incurred); failing to persist is bad. Worth alerting on.
- **Push notification failure** → silent. The message exists in the thread; athlete sees it on next app open.

### 12.3 Latency target

Per `build-standards.md` §5.1, debrief generation target is under 60s p95, 30s target. Cross-training acknowledgement is shorter content and should comfortably hit 15s p95. Not a hard SLA; logged and investigated if persistently slow.

---

## 13. Pattern detection

Cheap query, runs on every cross-training pipeline invocation.

### 13.1 Query

```sql
SELECT
  EXTRACT(DOW FROM start_time AT TIME ZONE athlete_timezone) AS day_of_week,
  COUNT(*) AS occurrences
FROM activities
WHERE athlete_id = $1
  AND activity_type = $2
  AND start_time >= NOW() - INTERVAL '4 weeks'
  AND id != $3
GROUP BY day_of_week
HAVING COUNT(*) >= 3
ORDER BY occurrences DESC
LIMIT 1;
```

Inputs: `athlete_id`, `activity_type` (current activity's type), `id` (current activity, excluded from count).

### 13.2 Pattern match logic

- Compute the current activity's day-of-week in the athlete's timezone.
- If the query returns a row and the returned `day_of_week` matches the current activity's day-of-week → pattern matched.
- Build `pattern_description` string: e.g. `"{activity_type} on {day_name}, {occurrences} of the last 4 weeks"`. Used in the prompt context, not shown verbatim to the athlete.

### 13.3 Timezone handling

Day-of-week must be computed in the athlete's timezone, not UTC. An athlete in Sydney whose Tuesday gym session starts at 7pm local can sync as a Wednesday morning UTC activity — naive UTC handling would break pattern detection.

Athlete timezone source: `athletes.timezone` (assumed to exist; if not, capture during onboarding from browser locale or Strava profile). Must be available before pattern detection can run reliably.

### 13.4 Edge cases

- **Two activities of the same type on the same day.** Counted as one occurrence for pattern purposes (group by day, not by activity).
- **Activity at midnight.** Day-of-week determined by `start_time` only. Activities crossing midnight are bucketed by their start.
- **Athlete changes timezone (travel).** Pattern is computed at generation time in current timezone. Travel-adjacent disruption to patterns is acceptable noise; not worth complicating for.

---

## 14. Substitution detection

Conditional on plan being uploaded and current.

### 14.1 Query

```sql
SELECT ps.session_type, ps.session_description, ps.scheduled_date
FROM planned_sessions ps
JOIN training_plans tp ON ps.plan_id = tp.id
WHERE tp.athlete_id = $1
  AND tp.is_current = true
  AND ps.scheduled_date = $2
  AND ps.session_type IN ('run', 'easy_run', 'tempo', 'long_run', 'interval', 'recovery_run', 'progression')
  AND NOT EXISTS (
    SELECT 1 FROM activities a
    WHERE a.athlete_id = $1
      AND DATE(a.start_time AT TIME ZONE athlete_timezone) = ps.scheduled_date
      AND a.activity_type IN ('Run', 'VirtualRun')
  );
```

Inputs: `athlete_id`, the date of the current activity in athlete timezone.

Returns: zero or one row. A returned row means a run was planned for that date and no run activity exists.

### 14.2 Session-type list

The `IN (...)` list above must match the run-session type values used by the plan extraction prompt. Engineer to verify against `prompts/plan-extraction.md` once it exists. If extraction uses different labels, align here.

### 14.3 The "wait until end of day" rule

A cross-training activity arriving at 6am where a run is planned for 6pm should not trigger substitution detection — the run might still happen.

Implementation: only run substitution detection if the cross-training activity's `start_time` is in the second half of the athlete's day (after 12:00 local time). Rough heuristic, not perfect. The alternative (defer the cross-training message until end of day) breaks the "message arrives shortly after activity sync" rhythm and is worse for the athlete experience.

Edge case acknowledgement: a 9am cross-training session followed by a 6pm planned run that does happen will get a non-substitution message in the morning, which is correct. A 9am cross-training session followed by a planned run that doesn't happen will get a non-substitution message in the morning and the substitution will be missed. The morning miss is acceptable cost; the moat is built across many sessions, not single-session perfection.

### 14.4 If detection fires

Set `kind = 'cross_training_substitution'` on the debrief row. Pass the planned session details into the prompt (§15.2 includes `planned_session_type` and `planned_session_description` in the input). The prompt picks the substitution-aware variant.

### 14.5 Edge cases

- **Multiple run sessions planned for the same day** (rare — doubles in elite training, occasionally in marathon plans). Treat as substitution if no run happened that day; pass the most significant session (long > tempo > easy) into the prompt.
- **Plan exists but is past end-date.** `is_current = true` should be false in this case; query won't return rows. If a stale plan is marked current, that's a plan-management bug, not a substitution detection bug.
- **Plan was uploaded but not yet processed by extraction.** `planned_sessions` would be empty for the day; query returns nothing; no substitution fires. Acceptable.

---

## 15. Prompt design

New prompt file: `prompts/cross-training-acknowledgement.md`. Structure follows the V1 prompt-file convention (`v1-scope.md` §4).

### 15.1 Prompt jobs

The single prompt handles:

- Standard acknowledgement (no pattern, no substitution).
- Pattern-aware acknowledgement.
- Substitution-aware acknowledgement (when input includes substitution data).
- Catch-all activity types (handled via the per-activity knowledge base prompt context — see §15.2).

One prompt with conditional logic in input. Not three separate prompts. The Sonnet call branches on input flags rather than the application code routing to different prompts.

### 15.2 Input context shape

```json
{
  "activity": {
    "type": "Ride",
    "duration_minutes": 90,
    "distance_km": 35.2,
    "average_hr": 142,
    "title": "Easy spin",
    "start_time": "2026-04-25T07:00:00+10:00"
  },
  "pattern": {
    "is_pattern": true,
    "description": "Sunday rides, 4 of the last 4 weeks"
  },
  "substitution": {
    "is_substitution": false,
    "planned_session_type": null,
    "planned_session_description": null
  },
  "athlete_context": {
    "recent_runs_summary": "...",
    "active_niggles": ["calf, mentioned 3 days ago"],
    "recent_life_context": "...",
    "training_block_context": "Week 8 of 16, Pfitz 18/55"
  },
  "knowledge_base_entry": {
    "activity_type": "Ride",
    "load_profile": "...",
    "typical_use_cases": "...",
    "interpretation_patterns": "..."
  }
}
```

### 15.3 Output shape

```json
{
  "message": "string, 1-3 sentences, in Coach Casey's in-product voice",
  "memory_writes": [
    {"category": "string", "content": "string"}
  ]
}
```

Structured tool use enforces this shape (per `technical-decision-log.md` — never parse freeform text for structured data).

### 15.4 Prompt caching strategy

Same as run debriefs:

- System prompt (the voice, the rules, the thesis) → cached. Stable across all athletes.
- Per-activity knowledge base entries → cached. Stable across all uses.
- Athlete-specific context → cached for the conversation burst (5-minute TTL).
- Activity-specific data → not cached. Variable per call.

### 15.5 Prompt evals

Per `v1-scope.md` §4, every prompt has fixtures and evals before shipping. For cross-training:

- One fixture per activity type (ride, swim, gym, yoga, Pilates, plus catch-all).
- Pattern variants: with-pattern and without-pattern fixtures.
- Substitution variants: with-niggle-known, with-life-stress-known, neither.
- Anti-pattern fixtures: confirm the prompt does NOT generate sycophantic, motivational, or activity-coaching language.

Eval rubric covers: voice alignment, specificity, appropriate use of context, length discipline, question-vs-no-question call, no drift into activity coaching.

### 15.6 Prompt version

`prompt_version` column on `debriefs` captures which prompt iteration generated the message. Increments on any change to the prompt. Necessary for tracing quality regressions back to a specific version.

---

## 16. Push notifications

### 16.1 Trigger

After successful debrief persistence (§12.1 step 8). Same notification system as run debriefs.

### 16.2 Preference gate

```
if preferences.cross_training_push_enabled == true:
    send push
else:
    skip (the message is still in the thread; athlete sees it on next app open)
```

### 16.3 Notification copy

The notification *is* the opening of the experience (per `design-principles.md` §3). Voice-aligned, specific where possible.

Variants by message kind:

- Standard cross-training: notification preview shows the first sentence of the message.
- Pattern cross-training: same — first sentence carries the pattern reference.
- Substitution: same — first sentence carries the substitution acknowledgement.

Engineer doesn't write the copy; the prompt produces the message and the first sentence is used as the preview. Truncation at ~80 chars per platform conventions.

### 16.4 Notification grouping

If multiple activities sync in burst (e.g. athlete uploads a backlog), each generates a debrief but pushes should batch. Native iOS/Android notification grouping handles this if all pushes share a group key (`coach_casey_messages` or similar). Engineer to confirm group-key handling matches existing run debrief push behaviour.

---

## 17. Preferences UI

### 17.1 New toggle

Add to the notification preferences screen:

- Toggle label: TBD by content skill. Suggested placeholder: "Cross-training acknowledgements"
- Description (smaller text below): TBD. Suggested placeholder: "Hear from Coach Casey after rides, swims, gym, yoga, and other non-run sessions."
- Default: ON.

### 17.2 Existing toggles

Run debrief push and weekly review push toggles assumed to exist. Cross-training is a third toggle alongside them, not a replacement.

### 17.3 Preference write

Standard preference write path. Optimistic update on toggle, server confirms (per `interaction-principles.md` §3.4). No special handling.

---

## 18. Edge cases and failure modes

Caught above where they belong; consolidated here for engineer convenience.

| Case | Handling | Reference |
|---|---|---|
| Activity with missing data (no HR, no duration) | Fall back to type + title only in prompt | §3.1 |
| Manual activities (no GPS) | Same as above | — |
| Activities longer than 4 hours | Acknowledge normally; flag in prompt as unusual | — |
| Activities synced retroactively (>24h old) | Ambient capture only, no pipeline | §11.4 |
| Multiple activities synced in burst | Process each, batch push notifications via group key | §16.4 |
| Strava activity edited after sync (renamed, type changed) | First sync wins, edits don't regenerate the message | — |
| Activity later deleted on Strava | Soft-delete the linked debrief; preserve any thread reply | — |
| Webhook fires twice for same activity | Idempotency check exits early | §11.3 |
| Duplicate / near-duplicate activities (Strava bug) | Idempotency check on activity_id; if Strava sends a different ID, both get processed (acceptable, very rare) | §11.3 |
| Pattern query returns multiple matching days | Take the most-occurrences row (LIMIT 1) | §13.1 |
| Plan exists but is past end-date | `is_current = false` should prevent query match | §14.5 |
| Athlete deletes account mid-pipeline | RLS prevents cross-athlete data; pipeline either completes or fails — both are acceptable | — |
| Sonnet returns malformed structured output | Tool-use schema enforces shape; if Anthropic returns invalid output (rare), retry once, then log to Sentry and skip | §12.2 |
| Athlete timezone unknown | Pattern detection falls back to UTC; substitution detection skipped (correctness > coverage) | §13.3 |

---

## 19. Observability

Per `build-standards.md` §4, with cross-training-specific tags.

### 19.1 Langfuse

Every Sonnet call traced. Tags:

- `prompt=cross_training_ack`
- `prompt_version={version}`
- `activity_type={Ride|Swim|...}`
- `is_pattern={true|false}`
- `is_substitution={true|false}`
- `athlete_id={uuid}` (per existing convention)

Captures: prompt input, response, tokens (input/output, cached/uncached), latency, model, cost.

### 19.2 PostHog events

- `cross_training_ack_generated` — fires after successful persistence. Properties: `activity_type`, `is_pattern`, `is_substitution`, `latency_ms`.
- `cross_training_ack_replied` — fires when athlete replies to a cross-training message. Properties: `activity_type`, `is_substitution`, `time_to_reply_minutes`.
- `cross_training_ack_skipped` — fires after 7 days with no reply. Properties: `activity_type`, `is_substitution`. Used for engagement analysis.
- `walk_ambient_capture` — fires when a walk syncs without triggering. Used for monitoring whether walks should re-enter the prompt list.
- `retroactive_activity_skip` — fires on retroactive activity short-circuit. Properties: `activity_type`, `age_hours`.
- `cross_training_push_sent` — fires when push fires. Properties: `activity_type`.

### 19.3 Sentry

Standard error catching per `build-standards.md` §3.3. Specific to this feature:

- LLM retries that ultimately fail → ERROR with prompt name and trace ID.
- DB write failures after retries → ERROR with athlete_id and activity_id (no PII in payload).
- Pattern or substitution query failures → WARN, with query name. Should not block message generation; if pattern detection fails, the message still generates (no pattern context).

### 19.4 Cost tracking

Cross-training prompts are shorter than run debriefs (less input context, shorter output). Approximate cost per call: ~30–40% of a run debrief at current pricing. Logged through Langfuse; no separate tracking needed.

At 100 active users averaging 3 cross-training activities per week → ~1,200 calls/month. At expected per-call cost, well within budget envelope.

---

## 20. Build sequence

Order to build, with dependencies named.

1. **Schema migration** (§10.6). Adds columns to `debriefs` and `preferences`. Required first.
2. **Activity sync routing** (§11). Add the type-based routing to the webhook handler. At this stage, cross-training activities are received but no pipeline processes them — they hit a stub.
3. **Pattern detection query** (§13). Implement and test against fixture data. Returns pattern info to a logger before any prompt uses it.
4. **Cross-training prompt file** (§15) — initial version, no substitution variant. Includes per-activity knowledge base content from §5 (Jason to finalise voice before this lands).
5. **Cross-training acknowledgement pipeline** (§12) — wires routing → pattern → prompt → persistence → push. End-to-end happy path working.
6. **Preferences UI toggle** (§17). Athletes can opt out of pushes.
7. **Eval fixtures** (§15.5). Run the eval suite. Iterate prompt until quality bar is met.
8. **Substitution detection query** (§14). Depends on plan upload working. Adds substitution path to existing pipeline.
9. **Substitution-aware prompt variant** (§15.1). Iterate evals on substitution fixtures.
10. **Edge case handling pass** (§18). Walk through the table; verify each case behaves as specified.
11. **Observability verification** (§19). Confirm Langfuse, PostHog, Sentry events fire correctly.

Steps 1–7 are the standalone cross-training feature. Steps 8–9 add substitution detection (depends on plan upload). Steps 10–11 close out.

Realistic effort for a competent engineer working with Claude Code: 3–5 days for steps 1–7, 1–2 days for steps 8–9, 1 day for steps 10–11. Total ~5–8 days. Iterating prompt evals can extend this if the quality bar takes time to hit.

---

## 21. Testing

### 21.1 Unit tests

- Pattern detection query: fixtures for "no pattern," "pattern matches," "pattern matches different day," "fewer than threshold," "different timezone."
- Substitution detection query: fixtures for "no plan," "plan + run done," "plan + cross-training (substitution)," "plan + nothing yet today," "multiple planned sessions."
- Routing logic: fixtures for each activity type, including unrecognised types (catch-all).
- Idempotency: fixture for duplicate webhook events.
- Retroactive guard: fixture for an activity older than 24h.

### 21.2 Integration tests

- End-to-end webhook → activity stored → cross-training pipeline → debrief saved → push triggered. Mocked Sonnet call.
- End-to-end webhook for Walk → activity stored → no debrief, no push.
- End-to-end webhook for substitution case → debrief saved with `kind = 'cross_training_substitution'`.

### 21.3 LLM evals

Per §15.5. Run on prompt changes, not on every PR. Separate workflow.

### 21.4 Manual testing

Before launch:

- Sync a real ride from Strava in test environment, observe the message generated.
- Sync a real gym session, observe pattern detection if applicable.
- Manually create a substitution scenario in test environment (plan + cross-training, no run), observe the substitution variant.
- Test push notification fires and renders correctly on iOS and Android.
- Test the preferences toggle disables pushes without disabling the message.

---

## 22. Open items

Items to resolve as build progresses or as this surface is specified for prompt engineering. Not build-blocking unless flagged.

- **Per-activity knowledge base** (§5) — written here in placeholder voice, needs Jason rewrite in his coaching voice. **Blocks step 4 of build sequence.**
- **Voice anchor examples** in §3.4 — first-pass placeholders. Worth running through `voice-guidelines.md` anti-pattern checks during prompt engineering.
- **Plan extraction handling cross-training entries** (§7) — needs verification when the plan extraction prompt is being written. Doesn't block the standard cross-training pipeline; only affects plan-prescribed cross-training interpretation.
- **Notification copy details** (§17.1) — content skill drafts the toggle label and description copy.
- **Session-type list alignment** (§14.2) — confirm against plan extraction prompt once it exists.

---

## 23. Downstream updates

This document creates work in adjacent docs. Tracked here so it doesn't get lost.

- **`v1-scope.md` §2.3** currently lists "non-run activities (cycling, cross-training)" as an edge case to handle. Update to reference this document and confirm the surface is in V1 scope.
- **`v1-scope.md` §4** (prompt engineering workstream) — add `cross-training-acknowledgement.md` to the prompt files list.
- **`v1-scope.md` §7** (build sequencing) — note that cross-training acknowledgement pipeline lands after debriefs and before chat.
- **`open-questions-log.md`** — close the cross-training open question, point to this doc.
- **`technical-decision-log.md`** — log the data model decision (extending `debriefs` with `kind` discriminator vs introducing `activity_messages` table). Also log the "wait until end of day" heuristic for substitution detection — it's a real engineering call worth preserving the reasoning for.
- **`roadmap.md`** — no change needed (cross-training behaviour is in V1, not a new bucket item).

---

## 24. How this document is used

- **New decisions** about cross-training behaviour or implementation are added here in the same shape.
- **Prompt engineering work** on `cross-training-acknowledgement.md` reads §15 as the spec.
- **Voice work** on the cross-training prompt references §3.4 and `voice-guidelines.md`.
- **Engineering work** on the activity-sync pipeline references §10–§19 directly.
- **Reviewed** at V1 build kickoff, after the first cross-training prompts ship, after first 100 cross-training acknowledgements have been generated (sanity check evals against real production data), and on any material change to plan extraction or activity handling.

This doc is subordinate to `strategy-foundation.md` and `v1-scope.md`. When they conflict, the strategy and scope docs win, and this doc gets updated.
