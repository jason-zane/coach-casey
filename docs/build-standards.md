# Coach Casey — Build Standards

**Owner:** Jason
**Last updated:** 2026-04-24
**Status:** Living document. Engineering baselines — accessibility targets, error handling patterns, performance targets, observability requirements, and the engineering side of offline/network behaviour. Companion to `engineering-foundation.md` (the setup runbook) and `technical-decision-log.md` (individual decisions). This doc is the *how we build*, not the *what we build with*.

Supersedes project memory when they conflict. Read alongside `engineering-foundation.md` (services, repo, deployment), `technical-decision-log.md` (locked engineering decisions), `interaction-principles.md` (concrete interaction specs, some of which have engineering implications), and `design-principles.md` (principle-level constraints).

---

## 1. What this doc is

Engineering standards that apply across every feature built. The rules a new contractor, Claude Code, or Jason-himself-in-three-months should follow without re-deciding each time.

Not a tutorial. Not a style guide. The baseline expectations against which code gets written and reviewed.

**Scope:**
- Accessibility targets and engineering requirements
- Error handling patterns
- Observability and logging standards
- Performance targets
- Testing expectations
- Security baseline
- Legal and help surfacing (where these things live)
- State management patterns

**Out of scope:**
- Individual technology decisions (captured in `technical-decision-log.md`)
- Setup and services (captured in `engineering-foundation.md`)
- Interaction timing or visual specs (captured in `interaction-principles.md` and `visual-identity.md`)

---

## 2. Accessibility

### 2.1 Target level

**WCAG 2.1 AA** baseline. Non-negotiable for V1.

- Widely tooled (axe, Lighthouse, pa11y all catch most violations).
- Achievable without disproportionate effort for a chat-first product.
- AU and NZ accessibility expectations are met by 2.1 AA for a commercial consumer product.

**Not aiming for 2.2 AA or AAA at V1.** Can revisit post-launch if the user base or legal landscape changes.

### 2.2 Keyboard navigation

- Every interactive element reachable via keyboard. Every action achievable without a mouse.
- Visible focus ring on every focused element. High contrast, matches plum accent at reasonable luminance.
- Logical tab order — DOM order matches visual order for every surface.
- Skip-to-content link on the main surface for screen reader users navigating past the header.
- Keyboard shortcuts as specified in `interaction-principles.md` §8 — implemented without capturing system shortcuts.

### 2.3 Screen reader behaviour

- Semantic HTML first. `<button>` for buttons, `<nav>` for navigation, `<main>` for the main surface. ARIA used only where semantic HTML is insufficient.
- Chat messages announced with sender and content. Athlete messages announced as "You," Coach Casey messages as "Coach Casey."
- Debriefs and weekly reviews announced as structured content — the opening claim functions as a heading for screen reader navigation within the message.
- New-message-arriving announced politely (`aria-live="polite"`) — never intrusive interrupts.
- Streaming responses announced on completion, not per-token. Token-by-token announcement would be unbearable for screen reader users.
- Error messages announced (`aria-live="assertive"` for errors that need immediate attention; `aria-live="polite"` for inline validation).

### 2.4 Reduced motion

- Honour `prefers-reduced-motion: reduce` from day one.
- All transitions drop to 40ms with no easing (near-instant, not jarring).
- Streaming responses still stream (content arriving, not motion).
- Directional slide-in/out for calendar and search becomes a simple fade.
- Implementation: CSS media query at the framework level, not per-component.

### 2.5 Text scaling

- Honour browser / OS text-size preference up to 200%.
- Layout flexes. Components don't break at 200%.
- No hard ceiling below 200%.

### 2.6 Colour contrast

- **Body text against background:** minimum 4.5:1.
- **Large text (18pt+ or 14pt+ bold) against background:** minimum 3:1.
- **UI components (buttons, form fields) against background:** minimum 3:1.
- Checked at design time, not as a post-pass. Fails are fixed before PR approval.

### 2.7 Testing

- Automated accessibility audit in CI (axe-core or Lighthouse). Fails block deploy to production.
- Manual keyboard-only navigation test before shipping any new user-facing surface.
- Manual screen reader test (VoiceOver on iOS/macOS; NVDA or TalkBack elsewhere) before shipping significantly new or changed surfaces.

---

## 3. Error handling

### 3.1 Principle

Every function that can fail should fail gracefully. No silent crashes, no thrown exceptions that bubble to the user.

Errors are categorised by their surface:

- **User-actionable** — the athlete did something; something went wrong; they need to do something to resolve it.
- **Background recoverable** — work happening behind the scenes; failure is retryable; eventual consistency is acceptable.
- **Background unrecoverable** — background work that failed permanently; may need to surface to the athlete eventually.
- **System failures** — something's wrong in the infrastructure; neither the athlete nor the runtime can fix it at that moment.

### 3.2 Retry patterns

Per `interaction-principles.md` §4.2, but specified engineering-side:

| Failure class | Retry strategy | Surface behaviour |
|---|---|---|
| LLM call timeout/error | One silent retry, 500ms backoff | Inline retry UI if still failing |
| Strava sync | Three retries, exponential backoff (1s, 3s, 9s) | Soft banner on third persistent failure |
| Memory write (tool use) | Three retries, exponential backoff | Silent; log to Sentry if all fail |
| Plan extraction | No automatic retry | User-initiated retry via UI |
| Auth | No retry | User action required |
| Database write | Three retries, exponential backoff | Inline error if all fail |

### 3.3 Error logging

- Every caught error logged to Sentry with:
  - User ID (where available)
  - Environment (production/preview/development)
  - Feature area (debrief, chat, onboarding, etc.)
  - Relevant non-PII context
- **PII never logged.** No email addresses, no athlete messages, no Strava activity content in error logs.
- LLM errors include the trace ID from Langfuse so the full prompt/response context can be retrieved.
- Errors in background jobs logged with retry count and final disposition.

### 3.4 User-facing error copy

Per `design-principles.md` §2: warm competence applies to errors.

- Never blame the user.
- Never apologise performatively ("Oops! Something went wrong!").
- Specific over vague ("Couldn't reach Strava just now" over "Something went wrong").
- Action-oriented where possible ("Try again?", "Reconnect Strava").
- Never expose error codes, stack traces, or technical detail to the athlete.

---

## 4. Observability

### 4.1 What gets logged

- **Every LLM call** — Langfuse — prompt, response, tokens, latency, model, cache hit/miss, cost, trace ID. Tags for prompt name and version, athlete ID.
- **Every application error** — Sentry — stack trace, environment, feature area, sanitised context.
- **Every user-facing event** — PostHog — page views, feature interactions, conversion events. Athlete identified by user ID only.
- **Every background job completion** — structured logs — job type, duration, result, retry count.

### 4.2 What does not get logged

- Athlete messages or Coach Casey's chat replies (except as needed inside Langfuse for LLM observability — scoped access).
- Strava activity content.
- Email addresses, names, or other PII in Sentry or PostHog.
- Anything that would make a leaked log a privacy incident.

### 4.3 Structured logging

- JSON logs from backend services. No `print()` or `console.log()` in production code paths.
- Log levels used correctly — ERROR for actual errors, WARN for recoverable issues, INFO for notable events, DEBUG for diagnostic detail.
- Correlation IDs (request ID, trace ID) propagated through every log entry for a given operation.

### 4.4 Alerting

- Sentry → email on new error types. No paging pre-launch.
- Anthropic cost alerts at $5, $20, $50 monthly thresholds.
- No uptime monitoring at V1; Vercel's own surface is enough. Revisit at first paying user.

---

## 5. Performance targets

### 5.1 User-facing latency

- **Thread open (cached):** under 300ms from app launch to first visible content.
- **Thread open (cold — first load of day, cache miss):** under 1.2s.
- **Chat message send to first streamed token:** under 2s at p50, under 4s at p95.
- **Calendar picker open:** under 200ms (respects §1.1 transition duration).
- **Search result population on text-match query:** under 500ms.
- **Debrief generation time (Strava sync to debrief ready):** under 60s at p95. 30s target.

These are targets, not SLAs. Misses get logged and investigated, not paged.

### 5.2 Bundle size

- **Initial JS bundle (gzipped):** under 200KB for the main entry.
- **Total first-paint payload (JS + CSS + HTML):** under 400KB gzipped.
- Monitored via Vercel build reports. Significant increases flagged in PR review.

### 5.3 Mobile performance

- **Largest Contentful Paint (LCP):** under 2.5s on Moto G4-class hardware over 4G.
- **First Input Delay (FID / INP):** under 100ms / 200ms.
- **Cumulative Layout Shift (CLS):** under 0.1.

Standard Core Web Vitals. Measured via PostHog and real-user data, not lab tools alone.

---

## 6. Testing expectations

### 6.1 What gets tested

- **Unit tests** for all business logic functions. Backend services, data transformation, non-trivial frontend utilities.
- **Integration tests** for API endpoints — every endpoint has at least one happy path test and one error path test.
- **End-to-end tests** for the three critical flows: sign-up + onboarding, debrief generation, chat message send. Run on every PR.
- **Accessibility tests** in CI — axe-core or equivalent, failures block deploy.
- **LLM eval tests** for every production prompt — runs on prompt changes, not on every PR (separate workflow).

### 6.2 What does not get tested

- Visual regression at V1 — too expensive to maintain pre-launch. Revisit post-V1 if visual bugs become a pattern.
- Performance benchmarking on every PR — slow. Spot-check instead.
- Full screen reader automation — manual testing on significant changes is the bar at V1.

### 6.3 CI

- Every PR runs: lint, typecheck, unit tests, integration tests, E2E tests, accessibility audit.
- All must pass to merge.
- No coverage thresholds enforced at V1 — discipline over gaming. Revisit if coverage becomes a concern.

---

## 7. Security baseline

### 7.1 Secrets

Per `engineering-foundation.md` §4:

- Never in source control. Ever.
- `.env.local` for dev, Vercel env vars for deployed environments.
- GitHub secret scanning enabled.
- Rotation immediately on any accidental commit, regardless of whether reverted.

### 7.2 Row-Level Security

- Every table has RLS enabled. No exceptions.
- Default policy: deny all.
- Explicit policies grant read/write only to authenticated athletes accessing their own data.
- Service role key server-only, never exposed to frontend.

### 7.3 Data handling

- **Strava data:** per-athlete, never cross-visible. RLS enforces.
- **PII:** email, name, Strava identity. Handled per Supabase auth defaults. Never logged.
- **LLM inputs / outputs:** sensitive. Logged to Langfuse with scoped access. Never to Sentry, PostHog, or general logs.
- **Payment data:** never handled directly. Stripe owns it.

### 7.4 Authentication

- Supabase auth with password + Google OAuth.
- Password requirements: minimum 8 characters, no forced complexity, no rotation (current NIST guidance).
- Session tokens: httpOnly, secure, sameSite=lax.
- MFA not at V1. Revisit post-launch.

### 7.5 Third-party auditing

- Strava API compliance per `strava-api-compliance-note.md`. Reviewed annually or on agreement change.
- GDPR-adjacent data export and deletion supported from day one (see §10).
- No third-party pen test at V1. Revisit at 500+ users or first security-sensitive feature.

---

## 8. State management

### 8.1 Where state lives

- **Server state** (database, Strava activities, generated content) — the source of truth. Queried via React Query or equivalent with caching.
- **URL state** (current view, search query, calendar selection) — reflects navigational state. Bookmarkable where meaningful.
- **Component state** (form input, local UI toggles) — React `useState` or `useReducer`. Lives in the component that owns it.
- **Global client state** (authenticated user, theme preference) — Context API at V1. Revisit if it grows.

### 8.2 What does not happen

- No Redux, no Zustand, no MobX at V1. Context + React Query cover the need.
- No localStorage or sessionStorage for application state — use in-memory state and reload from server on app start.
- No client-side caching of sensitive data beyond React Query's in-memory cache for the session.

---

## 9. Offline behaviour

### 9.1 What works offline

- Thread reads from React Query's cache — last-loaded window viewable.
- Calendar works on cached data.
- Search works on cached data.
- Settings and account info readable where cached.

### 9.2 What doesn't

- New message sending — queues locally, sends on reconnect.
- New debriefs or weekly reviews — require server.
- Plan upload — requires server.
- Pagination older than cache — fails gracefully, surfaces a soft "can't reach the network" indicator.

### 9.3 Indicators

Per `interaction-principles.md` §4.3 — soft offline banner at the top of the surface, voice-aligned copy. Clears on reconnect.

### 9.4 Service worker

- Registered from day one.
- Caches app shell (JS, CSS, HTML) aggressively.
- Uses network-first for API calls, falls back to cache on failure.
- Handles background sync for queued messages (Android only — iOS doesn't support).

---

## 10. Legal, help, and compliance surfacing

### 10.1 Terms of service and privacy policy

- Linked from: footer (desktop), main menu (mobile).
- Not inline in onboarding as a checkbox.
- Accepting-by-continuing acknowledgement on sign-up screen: *"By continuing, you agree to the Terms and Privacy Policy."*
- Content owned by Jason, reviewed legally before launch.

### 10.2 Cookie and tracking disclosure

- Minimal banner — what's required, nothing more.
- AU/NZ targeted at launch. Content meets AU Privacy Act and NZ Privacy Act 2020 requirements.
- EU/UK expansion would require revisiting (GDPR consent, cookie banner). Not at V1.

### 10.3 Data export and deletion

- Account settings surface: "Export my data" and "Delete my account."
- Export: JSON dump of all athlete-owned data (profile, activities, debriefs, chats, weekly reviews, memory items).
- Deletion: soft delete with 30-day recovery window; hard delete after. Strava disconnection always offered alongside.
- Functional implementation, not heavily designed. Voice-aligned copy per `design-principles.md`.

### 10.4 Refund and cancellation policy

- Linked from: pricing page, subscription-management surface.
- Voice-aligned in copy.
- Functional at V1. Auto-renewal clearly disclosed; cancellation one-click.

### 10.5 Help and support

- Main menu → "Help."
- Opens a short FAQ (curated, probably under 10 questions at launch) plus a contact-by-email option.
- No chat support, no knowledge base, no help widget at V1.
- Contact email: `help@coachcasey.app` or similar. Routes to Jason's inbox. Revisit if volume requires.

---

## 11. How this document is used

- **New engineering standards** added here as patterns emerge and get reused. A standard earns its place by being reusable, not by being written speculatively.
- **Deviations** are logged in `technical-decision-log.md` with reasoning. Don't silently deviate.
- **Engineers and Claude Code reference this** before building a new feature. Checks: accessibility covered? Error handling covered? Performance implication known? Observability wired?
- **Reviewed** at V1 build kickoff, after the first user-facing surface ships, at launch-prep, and on any material change to the stack or compliance posture.

This doc is not a style guide. It's the engineering baseline that prevents the product from accumulating quiet technical or accessibility debt. Additions are welcome; padding is not.
