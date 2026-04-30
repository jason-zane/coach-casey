# Prompt engineering, design rationale

This is the design rationale for how Casey's prompts are structured. It
explains the *why* of the layout in `prompts/` and `lib/llm/`, and lists
the working agreements that keep the system coherent over time. It does
not duplicate the runtime prompt content; the prompts themselves are the
source of truth for what Casey actually reads.

Referenced by `docs/v1-scope.md` §4 and
`docs/home-state-and-chat-working-draft.md`.

---

## How prompts are composed

Every Casey-authored system prompt is built at runtime from a stack of
blocks. The composition lives in `lib/llm/prompts.ts::buildSystemPrompt`,
which returns Anthropic's `system` array shape with `cache_control` set
on every block.

The stack, in order:

1. **Voice profile.** Always loaded. Defaults to `default`; the
   `eavesdropping` profile is selected by the strava-blurb surface.
2. **Opt-in shared blocks.** `heart-rate` and `demographics` today.
   Surfaces declare which they want.
3. **Opt-in posture block.** `interpretive` today. Used by debrief and
   the three follow-up surfaces.
4. **Surface prompt.** Structural shape, situation handling, examples,
   fixtures.
5. **Per-call rendered context.** Athlete + plan + memory + arc, built
   by `lib/llm/context-render.ts`.

Order matters because Anthropic's prompt cache is prefix-based. The
voice block, identical across every Casey call, sits at the top so the
cache hit rate is highest there. Per-athlete context sits at the
bottom because it varies more often.

## File layout

```
prompts/
├── _shared/
│   ├── voice/
│   │   ├── default.md            # universal voice
│   │   └── eavesdropping.md      # strava-blurb voice (allows wry humour)
│   ├── posture/
│   │   └── interpretive.md       # used by debrief + follow-ups
│   ├── heart-rate.md             # opt-in
│   └── demographics.md           # opt-in
├── post-run-debrief.md
├── post-run-followup-conversational.md
├── post-run-followup-structured.md
├── post-run-followup-rpe-branched.md
├── chat-system.md
├── cross-training-acknowledgement.md
├── onboarding-validation.md
├── strava-blurb.md
└── prompt-engineering-principles.md   # this file
```

```
lib/llm/
├── prompts.ts             # buildSystemPrompt composer + boot validator
├── context-render.ts      # athlete, goal-races, plan, memory blocks + formatPace
├── voice-check.ts         # mechanical post-hoc voice validator
├── mocks.ts               # all mock outputs, one per surface
├── debrief.ts             # generators
├── chat.ts
├── cross-training.ts
├── validation.ts
└── followup-rpe-branched.ts
```

## What goes where

A working agreement that prevents drift:

- **`_shared/voice/`** owns *how Casey talks*. Em-dashes, hype,
  sycophancy, register, second person, gender-neutral self-reference,
  Markdown bans. If the rule applies to every message regardless of
  surface, it lives here.

- **`_shared/posture/`** owns *how Casey relates to the athlete*.
  Interpretive vs. responsive vs. eavesdropping. Whether Casey
  prescribes, signs off, or volunteers forward instructions.

- **`_shared/<topic>.md`** owns rules that several surfaces share but
  not all. Heart-rate handling and demographics calibration today;
  add others when a third surface needs the same rule and the wording
  is genuinely identical.

- **Surface prompts** own structural shape (one paragraph vs. five),
  situation handling (workout vs. easy run vs. substitution),
  surface-specific voice tightening or loosening, examples, and eval
  fixtures.

- **`lib/llm/context-render.ts`** owns the Markdown shape of the
  context blocks (`# Athlete`, `# Goal races`, `# Active training
  plan`, `# Known injuries and niggles`, `# Recent life context`).
  When a new field is added to the athlete schema, update this file
  and every surface that renders the athlete picks it up
  automatically.

- **`lib/llm/voice-check.ts`** owns the regex-checkable
  interpretation of the voice rules. When `_shared/voice/default.md`
  adds a new ban, add the corresponding rule here and a negative
  sample to `scripts/eval-voice.mts`.

- **`lib/llm/mocks.ts`** owns every deterministic mock output. Real
  generators delegate to these when `LLM_MODE=mock` or no API key.
  Mock output text must obey the universal voice rules (the eval
  catches regressions).

## Why these voice rules

Casey is a coach, not a marketing copy generator. The voice rules
exist to keep Casey in the register an experienced runner trusts:

- **No exclamation marks, no hype, no sycophancy.** The product fails
  the moment Casey reads as performative. Real coaches don't say
  "great job" after every run.
- **No em-dashes, no Markdown.** Casey sits inside a chat thread; the
  output must read as plain prose. Em-dashes also look LLM-ish in a
  way that breaks immersion.
- **Second person, never the athlete by name.** Talking *to* the
  athlete makes the relationship coherent. Talking *about* them
  breaks the fourth wall.
- **No clinical register.** "Data suggests" is the dashboard talking,
  not a coach. Coaches say what they see; they don't cite the data
  as authority.
- **No hedge words.** Casey is meant to be confident. "Basically",
  "kind of", "essentially" all signal that the model is dodging
  commitment.
- **Gender-neutral self-reference.** Casey is a name, not a gender.

The eavesdropping voice (strava-blurb only) loosens two rules: a thin
layer of amused tone and wry humour are permitted, because the public
context demands a slightly different register. Every other ban still
holds.

## Why posture is separate from voice

Voice is constant across surfaces. Posture varies by surface and
medium:

- **Interpretive** (debrief, follow-ups). Reads the past, names what
  it sees, doesn't prescribe. Forward-implicating observations are
  fine; explicit "you should X" is not.
- **Responsive** (chat). Engages forward-looking questions, reasons
  from within the plan, names the athlete's decision as the
  athlete's. May touch prescription when asked, but doesn't
  volunteer it.
- **Eavesdropping** (strava-blurb). One angle, public-facing, ends
  when said.
- **Acknowledgement-only** (cross-training). Marathon coach reading a
  non-running activity. Connects to the running picture, doesn't
  coach the discipline.
- **Observation** (onboarding-validation). Specific reading of recent
  data, ends with a confirmation check the athlete can chip.

Only `interpretive` is currently extracted as a shared block because
it covers four surfaces with substantively-identical posture. The
others are surface-specific; extract when a second surface needs the
same posture wording.

## Quality bars by surface

| Surface | Quality bar | Why |
|---|---|---|
| Post-run debrief | GREAT | The product surface users judge by. |
| Strava blurb | GREAT | Public; bad copy here is visible to strangers. |
| Chat | SOLID | Conversational forgiveness; one bad reply isn't catastrophic. |
| Cross-training | SOLID | Lower stakes than a debrief, but still athlete-facing. |
| Follow-ups | GOOD | Ignored or skipped when bad; sharpens over time. |
| Onboarding validation | ACCEPTABLE at v1 | Pre-product-market-fit; revise as athletes flow through. |
| Weekly review | ACCEPTABLE at launch, GREAT v1.1 | Reviews lean on accumulated context; thin early-cohort reviews are honest. |

## How fixtures work today, and where eval is going

Each surface's prompt file carries `## Eval fixtures` at the bottom:
input scenarios with expected output shape described in prose. They
are *not* runnable today; they're authored for human review and as
prompts for a future judge model.

The mechanical layer that *is* runnable today is `pnpm eval:voice`,
which:

1. Takes a corpus of mock Casey outputs (deterministic, no LLM
   needed).
2. Runs each through `checkVoice` from `lib/llm/voice-check.ts`.
3. Pass/fail report with negative samples that prove the validator
   catches what it claims to catch.

Two further investments make sense when there's appetite:

- **Live-LLM fixture runner.** Runs each fixture through the actual
  generator, applies voice-check, and surfaces the output for human
  review. Gated on cost (each run hits the API).
- **Judge-model fixture runner.** Runs the generator output through a
  judge model that scores against the rubric in each surface prompt.
  Higher signal but more setup.

## Working agreements

These are the rules-of-the-road that keep the structure coherent over
time. Read before opening a PR that touches `prompts/` or `lib/llm/`.

1. **Don't restate `_shared/` rules in surface prompts.** If a surface
   needs to override a shared rule, name the override explicitly and
   keep the override scope tight.

2. **Surface prompts don't define how Casey speaks.** Voice belongs in
   `_shared/voice/`. Posture belongs in `_shared/posture/` (when
   shared) or in the surface (when not).

3. **Adding a new shared block** means: create the `.md`, register it
   in `prompts.ts::SHARED_BLOCKS` or `POSTURE_BLOCKS`, declare it from
   the call sites that opt in, and update the table in this doc.

4. **Adding a new voice rule** means: edit `_shared/voice/default.md`
   (and `eavesdropping.md` if it applies there), add the regex rule
   to `voice-check.ts`, and add a negative sample to
   `scripts/eval-voice.mts`. The eval should catch the new rule.

5. **Adding a new context field** to the athlete or goal-race schema
   means: update the type in `lib/thread/...`, update the renderer in
   `lib/llm/context-render.ts`. Surfaces don't need to change.

6. **Adding a new mock output** means: add to `lib/llm/mocks.ts` AND
   add the same string to `scripts/eval-voice.mts`'s corpus. The eval
   catches voice drift in mocks.

7. **Every prompt change** logs to Langfuse in production and bumps
   the version-history section in the surface file.

8. **GREAT-bar surfaces** (debrief, strava-blurb) require manual
   review against the rubric before merging. Non-trivial drift to
   structural shape or voice constraints requires re-reviewing the
   rubric itself.

## Claude-specific patterns

- **Prompt caching** on reusable prefixes. `cache_control:
  { type: "ephemeral" }` on every block in the system array. The
  voice block hits cache across every call against the same model;
  context blocks hit cache for the same athlete within minutes.
- **Structured output via tool use** for parsed outputs (memory
  writes, extractions). Plain text for anything rendered to the
  athlete.
- **Model choice.** Sonnet 4.6 for voice-bearing surfaces; Haiku for
  classification and lightweight routing. Single-provider in v1
  (Claude only); simplicity outweighs marginal quality.
- **Temperature.** 1.0 for voice-bearing prompts; 0.2 for extraction.
  Deterministic voice is worse than varied voice; a coach does not
  say the same thing the same way every time.
