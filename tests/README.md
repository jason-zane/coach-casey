# Eval discipline

Two cheap deterministic passes plus an opt-in live-LLM pass. Run before
shipping prompt or context-rendering changes.

## What runs

```
pnpm eval        # voice + surfaces
pnpm eval:voice  # mock corpus + negative cases through the voice validator
pnpm eval:surfaces             # prompt files + mock structure
pnpm eval:surfaces -- --live   # also send fixtures to Sonnet for human review
```

Both deterministic passes complete in under a second and need no API key.

## What each pass catches

### `eval:voice` (existing)

Runs `checkVoice` against:
- Every mock body in `lib/llm/mocks.ts` (debriefs, follow-ups, strava
  blurbs, RPE-branched, chat, validation observations).
- A set of intentionally bad inputs (em-dashes, hype, sycophancy,
  hedge words, markdown-bold, athlete-name-third-person) that **must**
  trip the validator.

Catches:
- Voice rules sneaking out of the mocks.
- The validator regressing and missing patterns it claims to catch.

### `eval:surfaces` deterministic pass

Runs:
1. **Prompt voice-check.** Reads each prompt file (`prompts/*.md` and
   `prompts/_shared/**/*.md`) and runs the validator. Currently
   non-strict, prompts contain teaching examples that intentionally trip
   the validator. The mode is wired so we can flip individual prompts to
   strict once they're stable.
2. **Mock structural assertions.** Length bounds, no markdown headers,
   no bullet lists, no em dashes. Catches mock changes that drift away
   from the intended surface shape.

### `eval:surfaces -- --live` (opt-in)

With `ANTHROPIC_API_KEY` set, posts each fixture in `LIVE_FIXTURES` to
Sonnet and dumps the output to stdout for human review. Voice-check
runs on the fresh output and reports findings inline.

No assertion (LLM output is non-deterministic). The point is to read
two or three real outputs ahead of a friend-testing cohort to feel
whether the prompt changes you just made are landing.

## Fixtures

`tests/fixtures/debrief.ts` and `tests/fixtures/weekly-review.ts` hold
type-safe fixture contexts (full `DebriefContext` / `WeeklyReviewContext`
shapes). They're imported by the in-app dev routes for prompt iteration
and serve as ground-truth scenarios:

- `debrief.steady-run.no-plan` , recovery-shape Tuesday 10km, no plan, no niggles.
- `debrief.workout-shape.with-plan` , 5x1km @ threshold, plan in context, calf
  niggle absent, marathon goal race set.
- `weekly-review.plan-following-week` , 5 runs + 1 ride, plan in context,
  niggle on file.
- `weekly-review.empty-week` , exercises the no-activity gate.

To run a fixture against real Sonnet locally:

```
LLM_MODE=real pnpm dev
# in another shell, signed in via the local app:
curl -s 'http://localhost:3000/api/dev/debrief?activity_id=<id>'
curl -s 'http://localhost:3000/api/dev/weekly-review?week_start=2026-04-27&week_end=2026-05-03'
```

## When to run

- **After any prompt edit** (`prompts/*.md`).
- **After any context-rendering change** (`lib/llm/context-render.ts`).
- **Before merging a PR that touches LLM-call sites.**
- **Before opening the app to a new friend cohort** (run
  `eval:surfaces -- --live` so you've read at least one fresh output of
  every surface).

## Adding new mocks

When you add a new mock string in `lib/llm/mocks.ts`:
1. Mirror it in `MOCK_*` arrays at the top of `scripts/eval-voice.mts`
   (deliberate duplication, the voice eval runs as a plain Node script
   that cannot import `lib/llm/mocks.ts` without the Next.js host).
2. Add a `MockSample` entry to the relevant array in
   `scripts/eval-surfaces.mts` so the structural pass covers it.
