# Coach Casey — Interaction Principles

**Owner:** Jason
**Last updated:** 2026-04-24
**Status:** Living document. Concrete interaction specifications — timing values, easing, loading thresholds, feedback patterns, data formatting, streaming cadence, device-specific behaviours. Extends `design-principles.md` (principles) and `visual-identity.md` (motion posture) into specific values developers can build against. Not a full design system; that emerges during build.

Supersedes project memory when they conflict. Read alongside `design-principles.md` (feel, voice posture, project-level defaults), `visual-identity.md` (what things look like), `build-standards.md` (engineering baselines, accessibility targets).

---

## 1. Transitions

Visual-identity §1 commits to motion being *fast and purposeful, 150–200ms, nothing animated for decoration.* This section extends that into specific rules.

### 1.1 Default transition

- **Duration:** 180ms.
- **Easing:**
  - Ease-out for entries (element appears, settles).
  - Ease-in for exits (element leaves, accelerates away).
  - Ease-in-out for movement between positions.
- **Applies to:** most surface-level transitions — menu open/close, inline reveal/collapse, state changes within a surface.

### 1.2 Button and tap acknowledgement

- **Duration:** 100–120ms.
- **Treatment:** slight opacity reduction (95%) and/or subtle scale (98%).
- **Easing:** ease-out.
- No bouncy spring. No scale-up on press. Restrained.

### 1.3 Scroll-to-position

Used for calendar-date jumps, search result taps, and the "back to now" affordance.

- **Duration:** 350ms.
- **Easing:** ease-in-out.
- **Behaviour:** the thread scrolls continuously to the target position. The athlete sees the movement; it gives direction. Long scroll distances use the same duration — the animation is about orientation, not proportional to distance.

### 1.4 Calendar and search surfaces

Both surfaces follow the same pattern, mirrored left/right. Directional motion matches the swipe gesture.

**Calendar (left-side surface):**
- Enters: slides in from the left, centres on screen.
- Duration: 220ms, ease-out.
- Background: subtle blur applied to the thread behind. Thread remains visible, slightly muted. Blur transitions in with the surface.
- Dismisses: slides back out to the left, blur fades away. 220ms, ease-in.

**Search (right-side surface):**
- Enters: slides in from the right, centres on screen.
- Duration: 220ms, ease-out.
- Background: same subtle blur as calendar.
- Dismisses: slides back out to the right. 220ms, ease-in.

**Applies on both mobile and desktop.** Directional motion is the visual language regardless of whether the athlete invoked the surface via gesture (mobile) or button (mobile or desktop). Consistency across platforms is preferred to matching each platform's convention.

**Why not the native "sheet from bottom" pattern on mobile?** Directional motion reinforces the gesture semantics (swipe-right reveals calendar from the left, swipe-left reveals search from the right). The directional sliding is the interaction's visual identity; sheets-from-bottom would be generic.

### 1.5 Reduced motion

When `prefers-reduced-motion` is true, all transitions drop to 40ms with no easing (effectively instant but not jarring). Directional slide-in/out for calendar and search becomes a simple fade. Streaming responses still stream (that's content arriving, not motion) but without position-animation effects.

Reduced motion is honoured at the CSS / framework level from day one. Not retrofitted.

---

## 2. Loading and waiting states

### 2.1 Threshold rules

Duration of wait determines the treatment.

- **0–300ms:** show nothing. Treat as effectively instant.
- **300ms–1s:** subtle inline indicator at the point of waiting.
- **1s–3s:** skeleton or progressive reveal where the destination's structure is known.
- **3s+:** voice-aligned "still working on it" copy.

### 2.2 Treatment taxonomy

Three loading treatments. No more — three is enough, and a fourth introduces inconsistency.

**Subtle inline indicator.** For 300ms–1s waits. Form: pulsing dot, thin shimmer line, or small caret-rhythm. Matches the plum accent at reasonable opacity (around 40–60%). Size: small, non-intrusive.

**Skeleton / progressive reveal.** For 1s–3s waits where the destination structure is known. Shows the shape of what's coming — blocked-out content areas that match the final layout. No shimmer animation unless visual-design specifies otherwise (shimmer can feel busy). Used for search result lists populating, calendar pull, plan-upload confirmation.

**Coach Casey's thinking state.** Specific to chat generation, between the athlete sending and the first token arriving.
- Voice-aligned — typographic rather than graphical.
- Likely a thin slow pulse on a placeholder line, or a breathing ellipsis. Visual-design to specify exact form.
- Appears within 300ms of send. Disappears as the first streamed token arrives.
- Does not appear for known-fast responses (memory lookups that resolve in under 200ms).

### 2.3 Loading copy

When copy appears during a wait (≥3s threshold, or holding-page contexts), it's voice-aligned and specific. *"Reading your training..."* not *"Loading..."* or *"Please wait."* Short, specific, warm competence. Content skill drafts where it matters.

---

## 3. Feedback on user actions

### 3.1 Button press

- Immediate opacity/scale change on tap (per §1.2).
- No audio feedback.
- No haptic feedback on general buttons (see §7.1 for haptic rules).

### 3.2 Form submission

- **Default: silent success.** The submission advances the flow, which *is* the confirmation. No toast, no "Saved!" message.
- **Toast used only** when no natural progression exists — updating a setting that stays on the same screen, applying a filter that changes a list in place. Never for multi-step flow advancement.
- **Failure: inline.** Error appears at the point of submission, not as a toast. See §4 for error patterns.

### 3.3 Destructive actions

Two-tap confirmation pattern (per `design-principles.md` §3 *Destructive actions use two-tap confirmation*).

- Primary action surfaces a confirmation with a named consequence.
- Confirmation surface uses the directional-slide pattern (from the side if invoked from a menu; inline if already on the affected surface — e.g. from a settings list).
- Primary-action button is named specifically ("Disconnect Strava", "Cancel subscription") — never generic ("Confirm").
- Destructive action button is visually distinct — likely a warmer red that respects the voice posture (not an aggressive hex-red).
- Undo is offered wherever the action can be reversed without data loss. Undo window: 8 seconds on a toast at the bottom of the surface.

### 3.4 Optimistic updates

- **Chat send:** the athlete's message appears immediately in the thread, right-aligned, on tap of send. Reconciles with the server on ack.
- **Failure surfaces in place on the message itself** — a small voice-aligned *"didn't send, tap to retry"* appears beside the message. Not a toast. Not a banner.
- **Memory writes** (life context capture via tool use): happen server-side, invisible to the athlete. No UI indication. Failures surface only if they affect something the athlete would notice (e.g. a subsequent debrief that references the context doesn't, in which case it's already failed silently).

### 3.5 Streaming responses

- Streaming begins as soon as the first token is available.
- Token display cadence follows natural generation rate — no artificial slowing, no artificial smoothing that buffers too long.
- Tokens arriving in bursts are passed through rather than buffered (some flicker is acceptable; heavy buffering makes streaming feel fake).
- The thread auto-scrolls to keep the streaming response in view only if the athlete hasn't scrolled up to read something else. If they have, the stream continues invisibly and a subtle indicator at the bottom signals a message is populating. Tapping it jumps to the live message.
- Stream fallback: if the stream breaks mid-response, the partial response stays visible; a small voice-aligned *"connection dropped, tap to resume"* appears. Engineering specifies exact recovery behaviour.

---

## 4. Error handling and failure behaviour

### 4.1 Error surfaces

- **Inline by default.** Errors surface on the thing that failed — next to the send button, under the input field, on the affected message.
- **Toast for background failures** the athlete can't directly address. Duration: 6 seconds. Dismissible.
- **Full-screen error pages** only for hard auth failures. Not for feature-level failures.

### 4.2 Retry behaviour

- **LLM calls:** one silent retry with short backoff. If still failing, surface inline with a retry affordance.
- **Strava sync:** silent background retry up to three times with exponential backoff. Persistent failure surfaces as a soft banner at the top of the thread (*"Haven't heard from Strava in a while. Reconnect?"*). Not blocking.
- **Auth failures:** no retry — explicit user action required.
- **Memory writes:** silent retry, eventual consistency. No user-facing surface unless the failure is persistent and affects the athlete experience.

### 4.3 Offline behaviour

- Thread reads from cache (the last-loaded window). Pagination older than cache fails gracefully.
- New messages can't be sent — a soft indicator at the top of the thread signals offline. Messages queue locally and send when connection returns.
- Calendar works on cached data; marks "offline" on any date where activity might be unloaded.
- Search works on cached data.
- Explicit offline banner at the top of the surface, voice-aligned: *"Offline. I'll catch up when you're back."*

---

## 5. Data display and numbers

### 5.1 Units

- **Per-athlete preference**, defaulting to what Strava returns for that athlete.
- **When plan and Strava use different units**, Coach Casey reports each in its source unit. *"Your plan said 10 miles and you ran 16km"* — honest, preserves precision. Does not silently convert.

### 5.2 Pace

- Format: `M:SS/km` or `M:SS/mi`.
- Always with unit. No stripped "4:58".
- No alternative phrasings ("per km", "minutes per km") in data display. Prose can phrase naturally where the context is clear.

### 5.3 Distance

- Whole numbers where natural: 20km, 10 miles.
- One decimal otherwise: 16.4km, 10.2 miles.
- Never more than one decimal.

### 5.4 Heart rate and other numeric

- Heart rate: `bpm` suffix, always. `176bpm`.
- Cadence: `spm` suffix.
- Power (if used later): `W` suffix.

### 5.5 Dates

Context-sensitive:

- **In prose:** relative where clearer. *"Tuesday,"* *"last Sunday,"* *"three weeks ago."*
- **In data display:** localised long form. AU default: *"24 April 2026."* US locale: *"April 24, 2026."*
- **Compact display:** *"24 Apr."*
- **Never numeric-only** (`24/04/2026`) — ambiguous across locales.

### 5.6 Times

- **Technical contexts** (workout start times, activity timestamps): 24-hour. *"06:00."*
- **Conversational contexts** (Coach Casey referencing a run's timing): 12-hour with am/pm where natural. *"Your 6am run."*
- Default to 24-hour where uncertain; easier to read, harder to misparse.

### 5.7 Numbers in prose

- **Running data always as digits**, regardless of magnitude or position in sentence. *"Week 12,"* *"65km,"* *"5 days."*
- **Standard English otherwise.** Spell out under ten in general text, digits above.

### 5.8 Tabular numerals everywhere numeric

Locked in `visual-identity.md`. Reaffirmed here. Any numeric content — paces, distances, HRs, dates, timestamps — uses tabular numerals so columns and successive numbers align.

---

## 6. Timing rhythms and conversation feel

### 6.1 Response timing

- Coach Casey responds when the response is ready. No enforced minimum delay, no simulated pauses.
- Streaming creates natural conversational rhythm — first token arrives in 1–2s on average, full response over 2–5s depending on length.
- That *is* the considered feel. Fake thinking is manipulative.

### 6.2 Length rhythm

Chat replies match the weight of the athlete's message:
- Short question → short reply.
- Longer message with life context → longer, more considered reply.

Debriefs and weekly reviews have their own structural shape (2–4 paragraphs, opening claim, development, optional follow-up) — §6.2 governs chat only.

See `voice-guidelines.md` for fuller voice rules on this.

### 6.3 Inter-message rhythm

- **One message per turn.** Coach Casey does not send rapid-fire multi-message replies.
- If the response is long, it's one message. Paragraph breaks are fine; separate messages are not.
- Exception: the follow-up question attached to a debrief is part of the debrief message, not a separate message.

---

## 7. Device-specific behaviours

### 7.1 Haptics (mobile)

Subtle and limited. Honouring iOS `light` and Android equivalent.

- **Haptics fire on:** sending a chat message, completing an onboarding step, confirming a destructive action.
- **Haptics do not fire on:** button presses, scroll, navigation, menu open/close, calendar/search open/close, receiving a message.
- Easy to over-use; erring on the side of less.

### 7.2 Safe areas

- Respect iOS safe areas (notch, dynamic island, home indicator).
- Respect Android gesture areas.
- Content never occluded. Input field sits above the home indicator with appropriate padding.

### 7.3 Keyboard behaviour on mobile

- Input field stays visible when keyboard opens.
- Thread scrolls to keep the most recent message visible above the keyboard — not the one being read. Trade-off, but matches universal chat convention.
- Composer expands upward for multi-line input (up to ~5 lines visible, scrollable beyond).

### 7.4 Pull-to-refresh

- Available on the thread.
- Refreshes server state — any new messages, debriefs, weekly reviews.
- Uses the subtle inline indicator treatment (§2.2) during refresh.
- Voice-aligned copy if the refresh takes long enough to surface it.

### 7.5 PWA vs browser

- Match each platform's native conventions rather than trying to unify.
- PWA back-button follows iOS/Android native behaviour.
- Browser back-button follows browser expectations.
- Consistency *within* a platform matters more than consistency *across* platforms.

### 7.6 Orientation

- Portrait-first.
- Landscape supported (layout doesn't break) but not optimised.
- No custom landscape layouts at V1.

---

## 8. Keyboard shortcuts (desktop)

Baseline set. Expands as desktop usage patterns become clear.

- **Cmd/Ctrl-K:** open search.
- **Cmd/Ctrl-D:** open calendar.
- **Cmd/Ctrl-/:** focus input field.
- **Esc:** dismiss calendar or search if open; otherwise no action.
- **Enter:** send message (when input focused).
- **Shift+Enter:** new line in input.

No other shortcuts at V1. Shortcuts are discoverable via a help-key (`?`) hint or in settings — specific mechanism TBD, probably a small hint-overlay in the menu.

---

## 9. How this document is used

- **Engineers** reference this for concrete values when building. If a value isn't here and the principle is known (from `design-principles.md`), log the engineering call in `technical-decision-log.md` and consider promoting it here if reused.
- **Visual-design work** uses this as the behaviour spec that visual treatments serve. Visual treatments that fight the timings or thresholds here get flagged and resolved.
- **New interaction decisions** are added here in the same shape — specific enough to build against, reasoned enough to revisit.
- **Reviewed** at V1 build kickoff, after the first user-facing surface ships, at launch-prep, and on any material change to motion, timing, or device behaviour.

This doc grows as surfaces are built. It starts with the interactions we've already committed to. Additions go here when a decision is reused across more than one surface; one-off decisions stay in the relevant flow doc.
