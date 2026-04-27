# Strava Step 2 Application Pack

The exact text to paste into Strava's production-approval form at
`https://www.strava.com/settings/api`.

Drafted to match Strava's own framing language for the kinds of apps it
allows under the November 2024 API agreement (see
`strava-api-compliance-note (2).md` for the reasoning). The submission
needs to be both honest about what Coach Casey does (it's an AI-driven
analysis tool) and clear about what it does not do (it doesn't train
models on Strava data, build a competing dataset, or repackage activity
data for third parties).

Last reviewed: 27 April 2026.

---

## Submission checklist

Before opening the form:

- [ ] Privacy Policy live at `https://coachcasey.app/privacy` (✓ shipped)
- [ ] Terms of Service live at `https://coachcasey.app/terms` (✓ shipped)
- [ ] Athletes can disconnect from Settings → Strava connection (✓ shipped)
- [ ] Athletes can delete their account from Settings → Delete account (✓ shipped)
- [ ] Athletes can export their data from Settings → Export my data (✓ shipped)
- [ ] "View on Strava" attribution on every activity-derived UI surface (✓ shipped)
- [ ] Official "Connect with Strava" button asset rendering at /onboarding/strava (✓ shipped)
- [ ] App icon ready (PNG, 512×512 — see `public/icon-512.png`)
- [ ] 3–5 screenshots of the product showing attribution and connect button
- [ ] Smoke test in `STRAVA_MODE=live` against your own Strava account

---

## Field-by-field text to paste

### Application Name

```
Coach Casey
```

### Category

`Coaching`

### Club

Leave blank.

### Website

```
https://coachcasey.app
```

### Application Description (short — 100 chars)

```
Reflective training partner. Reads your runs, answers your questions, gets sharper the longer it knows you.
```

### Authorization Callback Domain

```
coachcasey.app
```

(Strava only accepts the bare domain here, not a full URL or path. Vercel
serves the OAuth callback at `/api/strava/callback` under both
`coachcasey.app` and `www.coachcasey.app`.)

### Webhook Callback URL

```
https://coachcasey.app/api/strava/webhook
```

### Application Icon

Upload `public/icon-512.png` (or a 512×512 PNG of the Coach Casey C mark).

---

## Long-form questions

These are the parts of the application Strava reviews most carefully.

### What does your application do?

```
Coach Casey is a coaching platform that provides interpretation and feedback on a runner's training. After each run we generate a written debrief that places the workout in the context of the athlete's plan, recent training load, goal race, and any niggles they've told us about. Athletes can ask follow-up questions and get answers grounded in their own training history.

Strava is the source of truth for the runs themselves. We read activities (and the laps within them) via the API on a read-only basis. We never write to a runner's Strava account. We don't post to social, push activities back, or try to replace any part of the Strava experience.

The intended user is a runner who is already following a plan — from a coach, a group, an app, or written themselves — and wants reflection and conversation on top of execution.
```

### How will you use Strava data?

```
At inference time, only. When a new activity webhook fires, we pull the activity detail (with laps) from the API, persist it scoped to the authenticated athlete, and pass the relevant slice to a large language model (Anthropic Claude is our primary; OpenAI is used for narrower tasks like embeddings). The model produces a debrief or a chat reply, which we save back to that athlete's thread.

Athletes only see their own data. Coach Casey does not surface other athletes' runs, build leaderboards, or display Strava data in any cross-athlete view.

We do not:
- Train, fine-tune, or evaluate any AI or ML model on Strava data.
- Build a derived dataset, embeddings index, or analytics warehouse from Strava data for purposes outside an individual athlete's own thread.
- Share Strava data with third parties beyond the AI inference providers and infrastructure providers listed in our privacy policy, all of which are bound by data-processing agreements that prohibit retention or training.
- Use Strava data to enrich other products, sell to advertisers, or generate aggregated insights for sale.

This is consistent with Strava's November 2024 API agreement clarification that AI features for personal coaching and analysis are permitted; the prohibition is on training models on Strava data, which we do not do.
```

### How will Strava data be stored and protected?

```
Storage: Supabase (Postgres) in the Sydney (ap-southeast-2) region. Encrypted at rest. All access mediated by row-level security policies scoped to athlete_id, with a separate service-role credential held only by server-side code.

Transit: TLS end to end. Webhook events arrive over HTTPS; the OAuth callback domain is HSTS-pinned via Vercel.

Tokens: Strava OAuth access and refresh tokens are stored in the strava_connections table, never logged, never exported. The token-refresh path runs server-side only.

Retention: Activity data is retained for the lifetime of the athlete's account. On disconnect, we stop syncing new activities; on account deletion, all data including activities is hard-deleted within 30 days (soft-deleted immediately).

Disclosure: Our full privacy policy is at https://coachcasey.app/privacy, which covers AU Privacy Act, NZ Privacy Act 2020, UK and EU GDPR, and US state laws including CCPA/CPRA.
```

### How will users be able to revoke access and delete their data?

```
Three independent paths, any of which works on its own:

1. Inside Coach Casey: Settings → Strava connection → Disconnect Strava. This calls Strava's /oauth/deauthorize endpoint with the access token and removes our local connection record. Two-tap confirmation.

2. Inside Coach Casey: Settings → Delete account. Soft-deletes the athlete record immediately (signs them out, blocks re-entry) and hard-deletes all data — including ingested Strava activities — within 30 days. Strava is disconnected as part of this flow.

3. Strava's own authorised apps page (https://www.strava.com/settings/apps). Our webhook handles the resulting athlete deauthorisation event and clears the local connection so we stop attempting to sync.

Athletes can also export everything we hold about them as a JSON file via Settings → Export my data, before or after deletion.
```

### Will Strava data be used to train AI/ML models?

```
No. Strava data is never included in any dataset used for model training, fine-tuning, evaluation, or red-teaming.

Coach Casey uses third-party large language models (Anthropic Claude, with OpenAI for narrower tasks) at inference time only. Both providers are configured under their standard zero-data-retention or short-retention enterprise terms; neither is permitted to train models on inference inputs from our application.

This is a hard rule. It's stated explicitly in our Privacy Policy (https://coachcasey.app/privacy) and our Terms of Service (https://coachcasey.app/terms), which include an acceptable-use clause prohibiting users themselves from feeding our outputs into model training.
```

### What is the user experience for connecting Strava?

```
During onboarding, we present Strava's official "Connect with Strava" button (the orange button asset from Strava's brand guidelines bundle, self-hosted unmodified). Tapping it begins the standard OAuth flow with scopes read, activity:read_all, profile:read_all. Athletes are taken to Strava's consent screen, then redirected back to our reading-state surface that pulls their last 10 weeks of activity in the background.

After onboarding, the connection is managed from Settings → Strava connection, which shows the connection status, the connection date, a Disconnect button, and a deep link to Strava's authorised apps page.
```

### How will Strava attribution appear?

```
Two surfaces:

1. The "Connect with Strava" button uses Strava's official orange button asset, served unmodified from our origin, on the onboarding screen at /onboarding/strava.

2. Every UI surface that displays activity-derived data (post-run debriefs, cross-training acknowledgements) carries a "View on Strava" link in the eyebrow of the message. The link opens https://www.strava.com/activities/{strava_id} in a new tab. Rendered subtly in muted ink so it sits in the typographic rhythm of the thread without competing for attention.
```

### Approximate request volume

```
Two patterns:
- Webhook-driven ingest: one fetch of /activities/{id} per athlete per new run. We do not poll for activity lists in steady state.
- Safety-net poll: a single /athlete/activities call per athlete per 30 minutes, only when the webhook is suspected to have missed something (gated by a "no debrief in last 48h for an existing athlete" check).

Per-athlete steady-state volume is well under 100 requests per day. Total volume scales with active athlete count.
```

---

## Screenshots to attach

Three is the minimum; five is comfortable. Strava reviewers want to see
the connect button, the consent flow, and the data display.

1. **Onboarding /onboarding/strava** — the official "Connect with Strava" button rendered in context.
2. **Post-run debrief** — a debrief message with the "View on Strava" attribution visible.
3. **Settings → Strava connection** — connection status, "Since" date, Disconnect button, and the link to Strava's authorised apps page.
4. **(Optional) Privacy Policy at /privacy** — showing the AU/NZ/UK/EU/US coverage and the AI-non-training language.
5. **(Optional) Settings → Your data + Account** — Export my data and Delete account controls.

---

## After approval

Strava issues a `subscription_id` for the webhook subscription (one per
application). Run the registration script once, after approval and once
the production webhook URL is reachable:

```sh
pnpm tsx scripts/strava-webhook-subscribe.ts
```

The script reads `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`,
`STRAVA_WEBHOOK_VERIFY_TOKEN`, and `NEXT_PUBLIC_APP_URL` from the
environment, registers the subscription, and prints the resulting
`subscription_id` so it can be recorded.

---

## If Strava asks for changes

Most-likely review points and how to respond:

- **"Add Powered by Strava on the debrief"** — we already render "View on Strava" per surface, which is the canonical attribution Strava accepts. If a reviewer asks for the wordmark instead, we have the Powered-by-Strava SVG self-hosted at `public/strava/api_logo_pwrdBy_strava_horiz_orange.svg` and can swap the text for the wordmark in `app/(app)/app/_components/message.tsx` in minutes.

- **"Clarify your AI usage"** — the answer is on this page (model provider, retention, no training). Point them to /privacy and /terms.

- **"Reduce request volume"** — we already use the webhook as the primary trigger and a 30-minute fallback poll only when needed. If reviewer pushes back on the poll, we can extend the lookback window or remove the poll entirely (it's a safety net, not load-bearing).

- **"Justify the activity:read_all scope"** — needed because we read activities the athlete has marked private. Many runners log workouts privately; a coaching app that only sees public runs would be unable to do its job.
