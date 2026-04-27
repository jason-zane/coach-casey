# Strava API Program Submission Pack

The exact text to paste into Strava's production-approval form at
`https://share.hsforms.com/1VXSwPUYqSH6IxK0y51FjHwcnkd8` (linked from
the developer programme page).

The form is short — most of the work happens in the single
**Application Description** textarea, which is what reviewers read
closely. The long-form answer below covers every point the November
2024 API agreement requires applicants to address.

Last reviewed: 28 April 2026.

---

## Pre-flight checklist

Before opening the form:

- [ ] Privacy Policy live at `https://coachcasey.app/privacy` (✓ shipped)
- [ ] Terms of Service live at `https://coachcasey.app/terms` (✓ shipped)
- [ ] Athletes can disconnect from Settings → Strava connection (✓ shipped)
- [ ] Athletes can delete their account from Settings → Delete account (✓ shipped)
- [ ] Athletes can export their data from Settings → Export my data (✓ shipped)
- [ ] "View on Strava" attribution on every activity-derived UI surface (✓ shipped)
- [ ] Official "Connect with Strava" button asset rendering at /onboarding/strava (✓ shipped)
- [ ] Strava Client ID at hand (from `STRAVA_CLIENT_ID` in the production env)
- [ ] 3–5 screenshots ready (see "App Images" section below)
- [ ] Smoke test in `STRAVA_MODE=live` against your own Strava account

---

## Field-by-field

### First name

```
Jason
```

### Last name

```
Hunt
```

### Email Address

> Note from the form: *You will receive a response to your application at this email address. Please ensure emails from developers@strava.com are not marked as spam.*

```
hello@coachcasey.com
```

(Or your personal email if you'd rather get the response there. The
brand inbox is fine — you read it.)

### Company Name

```
Coach Casey
```

### API Application Name

> Note: *If you have staging or development environments, only provide your primary app name.*

```
Coach Casey
```

### Strava Client ID

Pull from the production env:

```sh
vercel env ls production | grep STRAVA_CLIENT_ID
# then:
vercel env pull --environment=production .env.production.local
grep '^STRAVA_CLIENT_ID' .env.production.local
```

Paste the numeric value (not the secret).

### Additional Apps

Leave blank — there's no separate staging/dev API application.

### Number of Currently Authenticated Users

```
1
```

(Form note says: *If your app is not yet available, write 1.*)

### Number of Intended Users

```
2000
```

Conservative first-year estimate. Strava doesn't audit this number; it's
a sizing signal so they can route the application correctly. Anything
3-figure to low 4-figure is unremarkable.

### Application Description

Paste this as a single textarea. ~2,200 characters; covers what
reviewers actually look for.

```
Coach Casey is a reflective coaching platform for runners who already follow a training plan — from a coach, a club, an app, or written themselves — and want interpretation and feedback on top of execution. After each run we generate a written debrief that places the workout in the context of the athlete's plan, recent training load, goal race, and any niggles they've told us about. Athletes can ask follow-up questions and get answers grounded in their own training history.

Strava is the source of truth for the runs themselves. We use the API on a strictly read-only basis: list activities, fetch activity detail with laps, and receive webhook events for new activities. We never write to a runner's Strava account, post anything back, or use any non-read scope. The scopes we request are read, activity:read_all, and profile:read_all — activity:read_all is needed because many runners log private workouts, and a coaching tool that only saw public runs would be unable to do its job.

Strava data is stored on Supabase in the Sydney (ap-southeast-2) region, encrypted at rest, with row-level security policies scoped to athlete_id so an athlete can only ever see their own data. We never surface other athletes' runs, build leaderboards, or display Strava data in any cross-athlete view.

We use Anthropic's Claude models at inference time to write debriefs and chat replies. Anthropic is configured under standard zero-data-retention terms and is not permitted to train models on inference inputs. We do not train, fine-tune, or evaluate any AI/ML model on Strava data, and our Terms of Service explicitly prohibit users from doing so with our outputs. This is consistent with Strava's November 2024 API agreement clarification that AI features for personal coaching and analysis are permitted; the prohibition is on training models on Strava data, which we do not do.

Athletes can disconnect Strava at any time from inside Coach Casey (Settings → Strava connection), which calls /oauth/deauthorize and clears the local connection record. They can also export their full data as JSON or delete their account, which soft-deletes immediately and hard-deletes within 30 days. Our webhook handles athlete-deauthorisation events and clears the local connection when an athlete revokes from strava.com/settings/apps.

Strava attribution: the official orange "Connect with Strava" button (from Strava's brand guidelines bundle, served unmodified) on the onboarding screen, plus a "View on Strava" link on every UI surface that displays activity-derived data, opening the underlying activity in a new tab.

Privacy policy: https://coachcasey.app/privacy
Terms of service: https://coachcasey.app/terms
Web: https://coachcasey.app
```

### Support URL

Leave blank — there's no separate support site. Reviewers won't
penalise an empty optional field; the contact email in /privacy and
/terms is enough.

### TOS Compliance

✓ Tick the checkbox.

(The application description above already names the November 2024
clarification, the no-training rule, and our compliance with the
read-only / no-cross-athlete-display rules. If you want to re-read the
agreement first: https://www.strava.com/legal/api.)

### Brand Guidelines Review

✓ Tick the checkbox.

(We use the official Connect-with-Strava asset, View-on-Strava
attribution per surface, and don't recolour or modify Strava marks.
Brand guidelines: https://developers.strava.com/guidelines/.)

### App Images

Required: screenshots of **every** surface where Strava data is shown.
Form note explicitly says incomplete photos delay the response.

Capture these from a logged-in `STRAVA_MODE=live` account on
production:

1. **Onboarding /onboarding/strava** — the official "Connect with Strava" button rendered in context.
2. **Strava OAuth consent** — the screen the athlete sees on strava.com when granting access (proves the standard OAuth flow).
3. **Post-run debrief** — a debrief message in the thread with the "View on Strava" attribution visible at the bottom.
4. **Cross-training acknowledgement** — same surface for non-run activity types, again with the "View on Strava" attribution.
5. **Settings → Strava connection** — connection status, "Since" date, Disconnect button, link to Strava's authorised apps page.

Optional but useful if you want to be thorough:

6. **Settings → Your data + Account** — Export my data and Delete account controls.
7. **Privacy Policy at /privacy** — the AI-non-training and Strava-data-handling sections.

Upload as PNGs or JPEGs.

---

## After submitting

1. Strava typically replies within 1–2 weeks. The decision arrives at
   the email you put in the form.
2. While you wait: nothing operational changes. The dev app keeps
   working at the 1-athlete / 1k-requests-per-day cap.
3. On approval: register the production webhook subscription:
   ```sh
   pnpm tsx scripts/strava-webhook-subscribe.ts
   ```
   This reads `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`,
   `STRAVA_WEBHOOK_VERIFY_TOKEN`, and `NEXT_PUBLIC_APP_URL` from the
   environment, registers the subscription, and prints the resulting
   `subscription_id`.

---

## If Strava asks for changes

Most likely review points and how to respond:

- **"Add Powered by Strava on the debrief"** — we already render "View on Strava" per surface, which is the canonical attribution Strava accepts. If a reviewer prefers the wordmark, the Powered-by-Strava SVG is self-hosted at `public/strava/api_logo_pwrdBy_strava_horiz_orange.svg` and the swap is a few lines in `app/(app)/app/_components/message.tsx`.

- **"Clarify your AI usage"** — the application description already covers it; point them at https://coachcasey.app/privacy for the full version.

- **"Reduce request volume"** — webhook is the primary trigger; the 30-min poll is only a safety net for missed webhooks. We can extend the lookback window or remove the poll entirely if asked (it isn't load-bearing).

- **"Justify activity:read_all"** — covered in the description: many runners log workouts privately, and a coaching tool that only saw public runs would be unable to do its job.

- **"Are you training on Strava data?"** — no, never; explicitly stated in /privacy and /terms; Anthropic configured under zero-data-retention.
