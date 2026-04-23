<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog into Coach Casey — a Next.js 16.2.4 App Router application. The following changes were made:

- **`instrumentation-client.ts`** (new) — Initializes `posthog-js` using the Next.js 15.3+ `instrumentation-client` pattern. Configured with a reverse proxy (`/ingest`), automatic exception capture, and debug logging in development.
- **`next.config.ts`** (updated) — Added PostHog reverse proxy rewrites for `/ingest/static/*`, `/ingest/array/*`, and `/ingest/*`, plus `skipTrailingSlashRedirect: true`. This ensures reliable event delivery and ad-blocker bypass.
- **`lib/posthog-server.ts`** (new) — Singleton server-side PostHog client (`posthog-node`) for use in API routes and Server Actions. Configured with `flushAt: 1` and `flushInterval: 0` for immediate event dispatch in serverless environments.
- **`.env.local`** (updated) — `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` and `NEXT_PUBLIC_POSTHOG_HOST` set via environment variables, never hardcoded.
- **`posthog-js`** and **`posthog-node`** installed as dependencies.

The events below are planned for the key conversion and engagement surfaces described in the product roadmap. They should be added to the listed files as those features are built.

| Event | Description | File |
|---|---|---|
| `user_signed_up` | Athlete completes registration and creates an account | `app/api/auth/signup/route.ts` |
| `strava_connected` | Athlete successfully connects their Strava account during onboarding | `app/api/auth/strava/callback/route.ts` |
| `onboarding_validation_confirmed` | Athlete confirms an interpretive observation from Coach Casey during the onboarding validation step | `app/onboarding/page.tsx` |
| `onboarding_validation_corrected` | Athlete corrects an interpretive observation from Coach Casey during the onboarding validation step | `app/onboarding/page.tsx` |
| `onboarding_completed` | Athlete finishes Phase 1 onboarding — all required steps done | `app/onboarding/page.tsx` |
| `plan_upload_prompted` | Athlete is shown the plan upload prompt (smart re-prompt at a natural moment) | `app/debriefs/[id]/page.tsx` |
| `plan_uploaded` | Athlete successfully uploads and confirms a training plan | `app/api/plans/route.ts` |
| `debrief_viewed` | Athlete opens and views a post-run debrief — top of debrief engagement funnel | `app/debriefs/[id]/page.tsx` |
| `chat_message_sent` | Athlete sends a message in reactive chat | `app/chat/page.tsx` |
| `weekly_review_viewed` | Athlete opens and views a weekly review | `app/weekly-reviews/[id]/page.tsx` |
| `subscription_trial_started` | Athlete starts the free trial — server-side event from Stripe webhook | `app/api/webhooks/stripe/route.ts` |
| `subscription_converted` | Athlete converts from trial to paid subscription — server-side event from Stripe webhook | `app/api/webhooks/stripe/route.ts` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard** — [Analytics basics](https://us.posthog.com/project/394025/dashboard/1501357)
- **Onboarding conversion funnel** — [THq0OipX](https://us.posthog.com/project/394025/insights/THq0OipX) — Signup → Strava connected → Onboarding completed (14-day window)
- **Subscription conversion funnel** — [rEqJ3vBY](https://us.posthog.com/project/394025/insights/rEqJ3vBY) — Trial started → Converted to paid (30-day window)
- **New signups over time** — [YGHdYGAD](https://us.posthog.com/project/394025/insights/YGHdYGAD) — Weekly signup trend
- **Core engagement: debriefs and chat** — [v3BUiBAA](https://us.posthog.com/project/394025/insights/v3BUiBAA) — Weekly debrief views + chat messages sent
- **Plan upload adoption** — [anFVDgYf](https://us.posthog.com/project/394025/insights/anFVDgYf) — Plans uploaded vs. times prompted (prompt-to-upload conversion signal)

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-nextjs-app-router/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
