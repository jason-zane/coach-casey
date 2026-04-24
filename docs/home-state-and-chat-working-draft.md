# Coach Casey — Home State & Chat (Working Draft)

**Owner:** Jason
**Last updated:** 2026-04-23
**Status:** **Working draft, not a build spec.** Architecture and interaction model are settled. Visual treatment, error states, loading states, empty-state copy, and several decisions are open. Engineering can begin on infrastructure (thread data model, message types, search, calendar picker, memory retrieval, streaming) but should not build user-facing surfaces until this doc is promoted to a build spec.

Read alongside `design-principles.md` (feel, voice posture, design implications), `strategy-foundation.md` (thesis, moat), `v1-scope.md` (chat and debrief scope), `voice-guidelines.md` (voice across surfaces), `onboarding-flow-working-draft.md` (what the athlete is walking out of into this surface).

---

## 1. What this doc covers

The main surface of the product — the place the athlete is in when they're using Coach Casey. Three things scaffolded together because they're one connected piece:

1. **The home state** — what the athlete sees when they open the app.
2. **Reactive chat** — how they talk to Coach Casey.
3. **Navigation and retrieval** — how they find older content.

**Out of scope for this doc:**
- The post-run debrief as a designed moment (returns in its own doc after this closes)
- The weekly review as a designed moment (same)
- Settings, plan management, subscription surfaces (separate, smaller flows)
- Notifications (push and email copy, covered with the relevant flow that generates them)

---

## 2. The architecture decision: chat-first, one thread

**Decision:** Coach Casey is a chat-first product. The home state is the conversation thread. There is no dashboard, no tab bar, no home screen separate from the chat.

**Why:**
- Matches the thesis — the product is a voice, the interface should be the voice's stage.
- Respects `design-principles.md` §3: *moments over dashboards*. A home screen with tiles and activity cards is a dashboard.
- Makes the moat visible — scrolling back through the thread is scrolling through the accumulated relationship. At month 3 the thread has 60+ debriefs, weekly reviews, and chats. The accumulation is tangible.
- One surface to design well, not three.

**One continuous thread, not daily chunks.** Alternative considered and rejected: breaking the chat into daily threads with calendar navigation between them. Rejected because (a) fragmenting the thread undermines the visibility-of-accumulation property, (b) most days have no content, so daily threads are empty a lot of the time, (c) some conversations cross day boundaries. One continuous thread is the simpler, more honest model. The calendar navigates *within* the thread, not between threads.

**Message types within the thread** (visual treatment TBD — visual-design workstream):
- Athlete chat messages
- Coach Casey chat replies
- Post-run debriefs (Coach Casey, longer, structured, arriving unprompted after a run)
- Weekly reviews (Coach Casey, longer, structured, arriving on a cadence)
- Follow-up questions (Coach Casey, attached to the end of debriefs — stylistically part of the debrief, not separate messages)
- System messages (rare — "Plan uploaded," "Strava reconnected") — may not need visible representation at all; decision pending

All types live in the same thread. None of them live in a separate section.

**Message alignment (standard chat convention):**
- Athlete messages on the right.
- Coach Casey messages on the left.
- Universal convention across messaging apps. Breaking it introduces friction for no benefit.
- This applies to all message types within the thread regardless of length — a debrief is left-aligned (Coach Casey), an athlete's reply is right-aligned. Wider / longer Coach Casey messages (debriefs, reviews) may take more horizontal space but are still anchored left.

---

## 3. The home state — what the athlete sees on open

**Default behaviour:** app opens to the thread. Scroll position lands on the most recent unread message, or on the most recent message if nothing is unread. Input field is at the bottom, persistent.

**Three states the home cycles through:**

**State 1 — Something to read.**
A new debrief just landed, weekly review arrived, or Coach Casey replied to a message. The unread message is in view on open. No red badge, no notification count — opening the app *is* the notification. A subtle visual marker (e.g. a soft left-edge indicator) fades once the message has been viewed.

**State 2 — Conversation in progress.**
Athlete has been chatting, Coach Casey has replied, or the athlete sent a message and Coach Casey is generating. Surface opens on the active exchange.

**State 3 — Quiet.**
No new content. The surface shows the most recent exchange (could be yesterday's debrief, last Sunday's weekly review, a chat from three days ago). Input field is present. The product is at rest, not dead.

**Empty state (brand-new user, pre-first-run):**
The thread has one short Coach Casey message — voice direction: *First run and I'll have something to say. Or say something now if you like.* (Content skill to draft final.) Input field is live. The athlete can message Coach Casey before their first run and get a response. The product is not inert.

**What's deliberately absent from the home state:**
- No navigation tabs (Home / Activity / Stats / Chat). Nothing to put in tabs.
- No "recent runs" feed. Strava is the runs feed.
- No stats dashboard.
- No "quick actions" shelf.
- No notification count badges beyond the subtle unread marker.
- No promotional prompts (upgrade nudges, install prompts) in the home state. Those live elsewhere at their right moments.
- No pop-ups. Ever. (See `design-principles.md` §3.)

---

## 4. Mobile-first layout

**Frequent actions live at the bottom of the screen, not the top.** Mobile thumb-reach is the governing constraint. This is now a project-level design principle (see `design-principles.md` §3).

**Mobile layout (top to bottom):**
- Minimal header — Coach Casey wordmark or mark only. No controls in the header.
- Thread fills the main area, scrollable.
- Persistent input field sits above the menu bar.
- Menu bar at the bottom, holding the frequently-used controls. Exact contents TBD (see below), but includes at least: calendar, search, main menu (for settings, plan, subscription, etc.).

**The menu bar is where the frequent controls live.** The principle: anything the athlete reaches for day-to-day is thumb-reachable. Settings-style controls (sign out, subscription management) can be one level deeper, accessed via the main menu button. Day-to-day controls (search, calendar, writing a message) are on the main surface.

**Desktop layout:**
- Header is allowed to do more on desktop — it's where desktop web conventions put navigation.
- Search and calendar can live in the header on desktop. Menu likewise.
- Thread fills the main area.
- Input field is at the bottom of the thread area — this matches the chat convention across platforms.
- Desktop-specific keyboard shortcuts (Ctrl/Cmd-K for search, Ctrl/Cmd-D for calendar, etc.) are a nice-to-have, deferred.

**What's settled:**
- Mobile puts frequent controls at the bottom.
- Desktop can use a header for controls.
- The thread and input field are the constant.

**What's not settled:**
- Exact menu bar composition on mobile (see §5).
- Specific keyboard shortcuts on desktop.
- Responsive breakpoint behaviour — where does mobile layout give way to desktop layout?

---

## 5. Navigation and retrieval

Three retrieval modes. Each has a right situation. None replaces the others.

- **Scroll** — what you do for recent history. Default behaviour. Always available.
- **Calendar** — for *"what was happening then?"* Time-anchored memory.
- **Search** — for *"has this come up before?"* Content-anchored memory.

All three operate on the same thread. Calendar and search are navigation affordances onto the thread, not separate views.

### 5.1 Primary affordances (visible buttons)

On mobile, the menu bar at the bottom of the screen contains visible buttons for calendar and search, plus a main menu button for settings/plan/subscription. Exact iconography and ordering — visual-design workstream.

On desktop, the same controls live in the header.

### 5.2 Gesture accelerators (mobile)

**Decision:** gestures exist as an accelerator *on top of* visible buttons, not instead of them. This preserves discoverability for new users while giving returning users a faster path.

- **Swipe-right from left edge:** opens calendar.
- **Swipe-left from right edge:** opens search.

**Reasoning on direction assignment:** left-to-right is the forward-in-time reading direction, so calendar (which navigates through time) sits on the left. Search (which is content-anchored, non-directional) is on the right. This is a weak preference — if user research later suggests it should swap, swap it without ceremony.

**Gesture teaching:** in-context hint on the visible buttons. The first few times the athlete uses the calendar or search button, a subtle fading animation suggests the swipe alternative — a small arrow-out-from-edge indicator or equivalent. Fades after a few exposures. Athletes learn in the moment they're already using the feature, not via a scheduled pop-up or modal. **No pop-ups to teach this** (see `design-principles.md` §3).

**What's settled:**
- Gestures exist alongside buttons, not instead of them.
- Swipe directions assigned (weakly — revisable on evidence).
- Gestures are taught via in-context visual hints that fade after a few exposures.

**What's not settled:**
- Gesture behaviour on desktop (probably no gestures; keyboard shortcuts instead).
- Exact treatment of the visual hint (visual-design workstream).
- Number of exposures before the hint fades — probably 3–5, specifics with visual-design.

### 5.3 Calendar

**Interaction:**
- Tap calendar button (mobile menu bar or desktop header) or swipe-right from left edge on mobile.
- Calendar picker appears — minimal month view, current month by default.
- Month navigable by tap (forward/back arrows or swipe within the calendar).
- Dates with activity (runs, debriefs, weekly reviews, chat exchanges) are visually marked. Marking is subtle, not loud. Exact treatment — visual-design.
- Tap a date → calendar dismisses, thread scrolls to that date's first message of the day. Surrounding context (day before and after) is visible as the athlete scrolls naturally from there.
- Tap a date with no activity → thread scrolls to the nearest date with activity. A subtle indication that the selected date had nothing. Not an error, not an empty screen.

**Calendar-jumps and performance:** tapping a date that's far back in the thread may require loading older messages. Expect a small load delay while the messages hydrate. Loading treatment — visual-design, consistent with the thread's scroll-pagination loading treatment.

**"Back to now" affordance:** after scrolling into history via calendar (or via natural scroll), a small button or gesture appears to jump the thread back to current position. Visual-design to specify.

**What the calendar deliberately doesn't do:**
- No stats overlay (run counts, mileage, streaks). Dashboard behaviour.
- No preview of a date before tapping. The preview is scrolling to it.
- No multi-date range selection. One date at a time.
- No event-type filtering on the calendar view (e.g. show only debriefs). That's search territory.

**Style direction:** existing calendar style elsewhere in the project reused. Visual-design to confirm.

### 5.4 Search

**Interaction:**
- Tap search button (mobile menu bar or desktop header) or swipe-left from right edge on mobile.
- Search surface appears — input field focused, keyboard up on mobile.
- Athlete types. Results appear as a list below the input.
- Each result is a message snippet with date context (e.g. "March 14 — debrief").
- Tap a result → search dismisses, thread scrolls to that message, surrounding context visible.
- Dismiss search without selecting → return to wherever the thread was before search opened.

**What's searched:**
- All messages in the thread (chat, debriefs, weekly reviews, follow-up questions, athlete replies).
- Strava activity names and notes — *"find my last interval workout"* surfaces the activity and attached debrief.
- Memory items — *"what have I said about the calf"* surfaces the original message and subsequent references.

**Search behaviour (V1):**
- Text match at V1. Fast, cheap, works.
- Semantic search via pgvector as a V1.1 enhancement — *"find where I was worried about training load"* without those specific words.

**What search doesn't do at V1:**
- No filter UI (date range, message type). Typing constraints into the query gets most of the way there — *"weekly review March"* works.
- No query suggestions.
- No search analytics surfaced to the athlete.

**Type-filter gap to watch:** *"find all the weekly reviews"* is genuinely weak under text-match — "weekly review" will return many results, not only review messages. Flagged as a candidate V1.1 enhancement (filter by message type). Holding on shipping it at V1 on the view that athletes rarely need all-of-type at once.

---

## 6. Reactive chat

**What it is:** athlete-initiated messages to Coach Casey, responded to in line in the thread. Per `v1-scope.md` §2.4: responsive to forward-looking questions, captures life context, answers questions about past runs and memory.

**In the chat-first architecture, chat is not a surface you enter.** The input field is always there. Typing and sending is chat. No mode switch.

**Interaction:**
- Athlete types into the input field. Multi-line accepted (Shift+Return for new line on desktop; mobile long-press or soft-key for new line).
- Sends via Return (desktop) or send button (mobile).
- Athlete's message appears in the thread, right-aligned.
- Coach Casey's thinking state shows briefly. Treatment TBD — must match deliberate-pace principle. Not bouncing dots.
- **Response streams in** (decision locked). Tokens appear progressively as they're generated. Matches modern chat UX conventions. Coach Casey's message is left-aligned and populates as the stream arrives.
- Engineering specifics (smooth streaming, fallback behaviour if the stream fails mid-response, reconnection logic) are engineering calls, not design calls.

**What chat does:**
- Responds to forward-looking questions using the responsive-prescription posture. Coach Casey reasons from within the plan's logic, brings plan + recent training + life context to bear, names the decision as the athlete's. See `v1-scope.md` §2.4 and `strategy-foundation.md` §1 for the posture rules.
- Captures life context. *"Calf tight,"* *"Slept badly,"* *"Work is a nightmare"* — Coach Casey acknowledges and persists via structured tool use. Invisible to the athlete. Surfaces in later debriefs and reviews.
- Retrieves from memory to answer past-anchored questions. *"Was last Tuesday's tempo faster than my previous one?"* — Coach Casey checks and answers.

**What chat doesn't do at V1:**
- No proactive or scheduled check-ins outside debriefs and weekly reviews. Coach Casey does not message unprompted.
- No external data lookups (weather, race results, etc.). Deferred.
- No unsolicited prescription. Athlete opens the door.

**Response shape:**
- Conversational, not essay-length.
- Shorter than debriefs by default.
- Longer when the question warrants it.
- Voice matches across surfaces — warm competence, specific, observational.

**Memory retrieval under the hood:**
- Relevant memory context is pulled into the prompt at inference time. Recent runs, referenced activities, active injuries/niggles, plan context if present.
- pgvector used surgically for this (per `technical-decision-log.md`). Semantic retrieval for content-anchored references that aren't in the immediate context window.
- The retrieval is invisible — the athlete gets the answer, the work happens behind it.

**What's settled:**
- Chat is the default mode; no mode switch.
- Responsive prescription posture is baked into the system prompt.
- Life context capture via structured tool use.
- Memory retrieval is invisible.
- Responses stream, not block-delivered.

**What's not settled:**
- Thinking-state visual treatment (between athlete sending and first token arriving).
- Streaming fallback behaviour when the stream breaks mid-response (engineering decision).
- How memory retrieval scope is decided at inference (engineering call).
- Whether the athlete sees any indication that Coach Casey looked something up (probably no — feels like a coach who just knows).

---

## 7. Long-thread performance strategy

**Engineering direction** (for engineering-lead to specify the details against):

- Rolling-window pagination. Load a default window of recent messages on app open (measured in days — a fixed day-count rather than a fixed message count, so quiet stretches don't load disproportionate date ranges).
- As the athlete scrolls toward the top of the loaded window, load the next chunk (N more days back). Continuous experience — the athlete sees a small loading indicator at the top but the scroll doesn't break.
- Calendar jumps to an old date load that date's messages on demand — small delay while the chunk hydrates. Acceptable.
- Search result taps behave the same way — small delay loading the chunk containing the result, then scroll.
- Default window size is an engineering call. Starting point: 14 days, tunable based on real usage.

**What this means for engineering:**
- Messages fetched via cursor-based paginated API, keyed on date range.
- Client maintains a loaded-window state and requests additional chunks as the athlete approaches edges.
- Prefetch strategy can be added later for performance (e.g. speculatively load the next chunk when approaching within 1 day of the current edge). V1 can be reactive-only.
- Loading indicators at the top of the thread during chunk load — treatment per visual-design.

**Not a design call beyond that.** Engineering specifies default window, prefetch strategy, exact load boundaries.

---

## 8. How the three surfaces come together

Mental model: **one thread, one voice, one ongoing conversation.**

- The athlete's history in Coach Casey is chronological. Runs, debriefs, chats, weekly reviews, all interleaved.
- Scrolling up is reading the history of the relationship.
- The home state is "where we are now in this conversation."
- The debrief is "Coach Casey speaking, unprompted, about what just happened."
- The chat is "you and Coach Casey talking."
- Calendar and search are ways of navigating the thread.

**Design implication:** there is essentially one screen to design really well. Message types have their own typographic treatments, but they're all messages in the same thread. Navigation is lightweight. The product is its voice, and the interface is the voice's stage.

---

## 9. What this scaffold settles

- Chat-first architecture, one continuous thread.
- Home state is the thread, opened on most recent unread or most recent.
- Mobile layout puts frequent controls at the bottom; desktop can use the header.
- Message alignment: athlete right, Coach Casey left.
- Calendar and search are navigation affordances onto the thread.
- Gestures exist alongside visible buttons as accelerators.
- Swipe-right opens calendar; swipe-left opens search (weakly held).
- Gestures taught via in-context fading hints, not pop-ups.
- Empty state has a Coach Casey message and a live input field.
- Calendar is minimal month-view, no stats overlay, no previews.
- Search at V1 is text-match; semantic search is V1.1.
- Chat has no mode switch — input field is always present.
- Responses stream, not block-delivered.
- Responsive prescription posture lives in the chat system prompt.
- Memory retrieval is invisible to the athlete.
- Long-thread performance strategy is rolling-window pagination, specifics engineering-led.

## 10. What this scaffold leaves open

**Visual design (visual-design workstream):**
- Header and menu bar visual treatment.
- Message type typographic treatments (chat, debrief, weekly review, follow-up, system).
- Thinking state for Coach Casey generating (pre-stream).
- Streaming response treatment (cursor, caret, rhythm).
- Subtle unread indicator treatment.
- Calendar visual marking of dates-with-activity.
- Search result list treatment, match highlighting, context presentation.
- "Back to now" affordance treatment.
- Loading-indicator treatment at top of thread during pagination loads.
- Gesture-teaching hint treatment.
- Exact iconography.

**Content (content skill):**
- Empty-state message for brand-new users.
- System message copy if system messages are shown at all.
- Any framing text around search, calendar, and navigation.

**Interaction decisions:**
- Exact menu bar composition on mobile (which items, what ordering).
- Responsive breakpoint where mobile gives way to desktop layout.
- Desktop keyboard shortcuts.
- Semantic search ship timing (V1 vs V1.1).
- Number of exposures before gesture hint fades.

**Engineering decisions (not design):**
- Streaming fallback behaviour.
- Default pagination window size.
- Prefetch strategy.
- Memory retrieval scope at inference.

**Edge and error states:**
- All loading states.
- All error states for chat generation, memory retrieval, calendar loading, search.
- Offline behaviour — does the thread work from cache, and how much?
- What happens when memory retrieval fails or returns nothing.
- What happens when the search index is behind (new message not yet indexed).
- What happens when pagination fails mid-load.

---

## 11. What engineering can start on now

Work that doesn't depend on final design or copy:

- **Thread data model.** One thread per athlete, messages as the base record, message type as a discriminator (chat, debrief, weekly review, follow-up, system). Append-only; edits create new versions rather than mutate. Timestamps, sender, structured tool-use results attached where relevant. Indexed for text search.
- **Message retrieval API.** Cursor-based pagination keyed on date range. Rolling-window loading per §7.
- **Streaming response infrastructure.** Server-sent events or similar for Coach Casey's replies. Token-by-token delivery with graceful fallback if the stream breaks.
- **Text-match search.** Postgres full-text search on message content and activity names/notes. Indexes, ranking, performance. Return structure: matched messages with surrounding-context handles.
- **Calendar data.** A query that returns "dates on which this athlete had activity" for a given month window — feeds the calendar picker's visual marking.
- **Memory retrieval layer for chat.** pgvector wiring for semantic recall of past messages and memory items at inference time. Retrieval scope decisions (how many past messages, what time window).
- **Structured tool use for life-context capture.** Tool calls that Coach Casey invokes from within chat to persist memory items, injury flags, context notes. Schema defined in the prompt-engineering workstream; the engineering side is wiring the tools, executing them, and handling failures.
- **Empty state scaffolding.** First-message seeding for brand-new athletes (so the thread isn't literally empty when onboarding completes).
- **Gesture handling.** Touch event listeners for swipe-from-edge gestures on mobile. Stub behaviour (open calendar / search UIs) even before those UIs are finished.
- **Menu-bar and header scaffolding.** Position-only, not styled. The frame for where visual-design will fill in.

**Work to hold until this is promoted to a build spec:**
- Message type visual treatments.
- Thinking-state treatment.
- Final menu bar composition.
- Calendar and search visual design.
- Streaming visual treatment.
- "Back to now" affordance.
- Gesture-teaching hint treatment.
- Semantic search (V1.1 anyway).

---

## 12. Open items blocking promotion to build spec

- Final mobile menu bar composition.
- Responsive breakpoint behaviour.
- Visual-design pass on message types, header/menu bar, calendar, search, thinking state, streaming treatment, gesture hint.
- Content pass on empty state and any framing copy.
- Edge-case and error-state design pass across chat, calendar, search, retrieval, streaming.
- Engineering specification of pagination details (default window, prefetch).

---

## 13. How this document is used

- **Engineer:** start on §11 (infrastructure). Don't build user-facing surfaces from this doc — wait for build-spec promotion. Pagination and streaming specifics are engineering-led; specify and log in `technical-decision-log.md`.
- **Visual-design workstream:** this doc is input. Treats the items flagged as "visual-design" in §10 and §12 as its scope.
- **Content skill:** pass on §10 content items.
- **Continuing design work (Jason + Claude):** close §12. Each item closes into an updated version of this doc.
- **Reviewed:** after edge-case pass, after visual-design pass, after content pass, at V1 build kickoff for user-facing surfaces.
