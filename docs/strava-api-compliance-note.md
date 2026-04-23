# Strava API Compliance — Coach Casey

**Last reviewed:** 2026-04-23
**Status:** V1-blocking open question. Review and execute the "Action" section below before submitting the Strava developer application.

---

## The constraint

In November 2024 Strava updated their API agreement. The relevant clause (still live in the 2026 agreement) is:

> "You may not use the Strava API Materials (including Strava Data), directly or indirectly, for any model training related to artificial intelligence, machine learning or similar applications."
>
> — [Strava API Agreement](https://www.strava.com/legal/api)

Several apps were cut off at the time of the update. The prohibition applies to anyone accessing the Strava API directly *or* via an aggregator (Terra, Rook, etc.), because it's a term on the underlying data.

The language is narrower than the headlines made it sound. It prohibits **training** models on Strava data. It does not prohibit all uses of AI with Strava data.

---

## Why Coach Casey is most likely compliant

Three reasons, in descending order of strength.

**1. Strava's own clarification names Coach Casey's category as allowed.**

From Strava's official announcement of the API changes:

> "We anticipate that these changes will affect only a small fraction (less than .1%) of the applications on the Strava platform — the overwhelming majority of existing use cases are still allowed, including coaching platforms focused on providing feedback to users and tools that help users understand their data and performance."
>
> — [Updates to Strava's API Agreement, Nov 2024](https://press.strava.com/articles/updates-to-stravas-api-agreement)

"Coaching platforms focused on providing feedback to users" is Coach Casey's positioning almost verbatim. Supplementary, retrospective, feedback-to-athlete-on-own-data. This is the language to use in the developer application.

**2. Coach Casey doesn't train models on Strava data.**

The prohibited activity is *training*. Coach Casey passes a single athlete's data to a pre-trained third-party LLM (Claude) for inference, and the output is delivered to that same athlete. No training. No aggregation for model improvement. No cross-user learning loops.

If a future version ever wants to fine-tune a model on runner data, Strava-sourced data must be excluded from that training set. Note this now so future decisions don't silently cross the line.

**3. Peer apps operate in the same lane.**

Runna (AI-generated training plans), TrainerRoad (AI-driven structured workouts), and others ingest Strava data and apply AI-style processing, and continue to operate with Strava integration post-update. Coach Casey is a narrower use case than several of these — retrospective feedback only, no plan generation, no prescriptive advice.

---

## What to put in the Strava developer application

The application is at `https://www.strava.com/settings/api`. The approval is lightweight for most apps but can be selective. Language matters.

**Describe Coach Casey using Strava's own framing:**

> Coach Casey is a coaching platform that provides retrospective feedback and interpretation to marathon runners on their own training data. It is supplementary to the athlete's existing coach or training plan — it does not generate training plans or prescribe workouts. Activities ingested from Strava are used to deliver post-run debriefs, weekly reviews, and contextual chat responses back to the same athlete whose data it is.

**Be explicit that AI is used, and be explicit about how:**

> Coach Casey uses large language models (Anthropic Claude) at inference time to generate personalised feedback on an athlete's own activities. No Strava data is used to train or fine-tune any model. Data is processed per-athlete and delivered only to that athlete.

**Confirm the data boundaries:**

- Data is never shown to anyone other than the authenticated Strava user
- Data is never sold, syndicated, or provided to third parties
- The athlete can revoke Strava access at any time and request deletion of stored data
- Strava data is never included in any dataset used for model training

Being direct about these points is the right call. Obfuscating the AI angle is both unnecessary and likely to backfire if Strava later investigates.

---

## Product behaviours to avoid

These are the things that would put Coach Casey on the wrong side of the line. Some are architecture-level; some are feature-level; all should be internalised by anyone (including future contractors or Claude Code) touching the product.

**Do not:**

- **Train or fine-tune any model on Strava data.** This includes building a custom model, a LoRA, a fine-tuned variant, or an embedding index used for model improvement. Embeddings used purely for retrieval within a single athlete's own data are fine.
- **Display one athlete's Strava data to any other user.** Coach Casey is single-user-scope. No leaderboards, no squad comparisons, no sharing, no "athletes like you ran X."
- **Sell, syndicate, or provide Strava-derived data to third parties.** Including anonymised. Including aggregated. Don't.
- **Provide broad analytics across the user base that go beyond feedback to the individual.** Internal product metrics (DAU, retention, feature usage) are fine; external analytics products built on Strava data are not.
- **Cache Strava data beyond what's needed for the product function,** and remove cached data when the underlying resource is deleted on Strava.
- **Replicate Strava's visual design or branding.** Per their distinctive-look-and-feel clause.

**Do:**

- Keep all Strava data stored per-athlete with RLS enforcing user-scoped access
- Provide a clear "disconnect Strava" flow that revokes access and offers data deletion
- Include prominent links back to Strava in any UI that displays Strava-sourced data
- Keep an internal flag on records sourced from Strava, in case you ever need to exclude them from something (e.g. a future training run on non-Strava-sourced data only)

---

## If you want to confirm directly with Strava

The application review itself is the first confirmation signal. If they approve the app with Coach Casey's description as written above, that's a strong signal of compliance.

If you want an explicit confirmation before building, the route is Strava's developer support (`developers@strava.com`, or the developer community hub at `communityhub.strava.com`). A short, specific email works better than a vague one. Draft:

> Subject: API Agreement clarification for AI-powered coaching feedback platform
>
> Hi — I'm building Coach Casey, a coaching platform that provides retrospective feedback to marathon runners on their own Strava activities. We use Anthropic Claude at inference time to generate personalised feedback per athlete. We do not train or fine-tune models on Strava data, and feedback is delivered only to the athlete who owns the data.
>
> Per the November 2024 announcement, coaching platforms providing feedback to users remain allowed, and the AI/ML restriction applies to model training. I want to confirm this interpretation is correct before submitting our application. Happy to share more detail on the architecture.
>
> — Jason

You do not need to do this step to submit the application. It's an optional belt-and-braces move if you want written confirmation before investing in build.

---

## When to re-review compliance

Trigger a compliance re-review if any of these happen:

1. **Product scope expands into plan generation or prescriptive coaching.** Moves Coach Casey out of the "feedback to user" safe zone.
2. **Features are added that involve cross-athlete visibility.** Squad features, coach-to-multiple-athletes views, leaderboards, sharing.
3. **Any fine-tuning or model training is considered,** even on non-Strava data, because the provenance question becomes live.
4. **Strava updates their API agreement.** Terms change; they've tightened once already. Check annually.
5. **You receive any communication from Strava about your use of the API.** Stop, review, respond carefully.

---

## Action

Before submitting the Strava developer application:

1. **Read the current API agreement in full** (`https://www.strava.com/legal/api`). It's short. Do not rely on summaries — including this one — for the final read.
2. **Draft the developer application** using the language in the "What to put in the Strava developer application" section above.
3. **Optional:** email Strava developer support with the template above to get written confirmation before submitting. Adds 3–10 days to the timeline.
4. **Submit the application** and wait for approval.
5. **Log the approval** (and any communication from Strava) in the project docs.

Do not start building the Strava integration in earnest until the application is approved. OAuth credentials and webhook subscription require an approved app anyway — there's nothing to start without it.

---

## Confidence level

This note is my best read as of April 2026 based on the public API agreement, Strava's own press statement, the behaviour of peer apps, and common-sense reading of the terms. I am not a lawyer and this is not legal advice. For an app that will handle paying users and their personal training data, a 30-minute review by a lawyer familiar with API terms and data licensing is a reasonable de-risking step before launch. Low-cost, high-value if there's any ambiguity.
