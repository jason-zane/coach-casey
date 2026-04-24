# Coach Casey — Design Principles

**Owner:** Jason
**Last updated:** 2026-04-23
**Status:** Living document. Captures the design feel, voice posture, and project-level design defaults that apply across every surface and flow. Intentionally lean — enough to stop each new flow from re-deciding the feel from scratch, not so much that it pre-empts the visual-design workstream. Expected to evolve as flow work reveals where the principles need sharpening.

Supersedes project memory when they conflict. Separate from `strategy-foundation.md` (why), `v1-scope.md` (what), `technical-decision-log.md` (engineering), and `engineering-foundation.md` (how). This doc governs the design layer — how the product works and feels from a user's perspective.

---

## 1. Feel

Three dimensions, one sentence each. Applies to every surface — onboarding, debriefs, chat, weekly reviews, settings, notifications.

**Pace: deliberate and considered.** The product doesn't rush. It's willing to spend an extra beat on a moment landing right rather than collapsing it for efficiency.

**Warmth: warm competence.** Knows what it's doing, doesn't perform it. The register of a trusted coach or a good GP — technically sharp, speaks to the athlete as an adult, no forced friendliness.

**Information density: just enough.** Not minimal to the point of sparse, not rich to the point of dashboard. Each surface carries what the athlete needs for that moment and no more.

---

## 2. Voice posture

**Warm competence rules in:**
- Confident sentences that carry expertise without announcing it
- Plain language, short where short works, longer where the idea needs it
- Observational phrasing — "I noticed X" / "that looked like Y" — over declarative verdicts
- Honest framing of what the product can and can't do

**Warm competence rules out:**
- Exclamation marks and hype language — "Awesome!", "", "Let's crush this!"
- Performative warmth — emojis as personality substitutes, over-apologising, chirpy transitions
- Clinical coldness at the opposite pole — "Data processed", "Analysis complete"
- Gamification language — points, streaks-as-pressure, badges, levelling up
- Coach-speak theatrics — "Trust the process", "The work works", motivational slogans

The test, applied to any piece of copy or interaction: *would a sharp, warm coach or a thoughtful GP say this?* If it would embarrass them, it's wrong.

Full voice work lives in the content layer. This section is posture — what the voice feels like. The content skill writes the words.

---

## 3. Design implications

Project-level design defaults. These apply unless a specific flow has a reasoned exception.

**Copy does real work.** Warm competence is primarily carried by language. The copy layer on Coach Casey's surfaces is load-bearing, not decorative. Any flow design that treats copy as placeholder is incomplete — content work is a named part of shipping, not a polish pass.

**One decision per screen, mostly.** Just-enough density means the athlete doesn't face stacked questions or decisions on a single surface. Onboarding, settings, and flows generally move forward one step at a time. Exceptions exist (a settings page is a list of toggles by nature) but the default is spacious.

**No progress bars in the form-wizard sense.** Efficiency-tool framings — "Step 4 of 7," linear progress dots, "Almost done!" — break the deliberate-pace feel. Forward momentum is carried by the conversation or the content, not by a meter. Softer progress cues may exist where helpful; hard wizard-style progress bars are out.

**Moments over dashboards.** Where the product has something to say (debrief, weekly review, validation observation), it says it — full surface, prose, space to read. Not tiles, not cards-in-a-feed, not numbers-first summaries. The product is an interpretive voice; the UI gets out of its way when it speaks.

**Notifications are the first design moment for event-driven flows.** When a debrief or weekly review arrives via push or email, the notification copy *is* the opening of the experience, not a pointer to it. Designed with the same care as the destination surface.

**Retrospective posture in UI, not just copy.** The product isn't prescriptive, which means UI conventions that imply instruction — "Next up:", "Today's task", "Recommended action" — don't belong. Surface structure reflects the thesis: what happened, what it meant, what it tells us.

**No pop-ups or interruptive modals.** Coach Casey does not interrupt the athlete with dialogs, feature-teaching modals, tips, nudges, or upgrade prompts that sit on top of whatever they were doing. Pop-ups violate the voice — they are the "hey, did you know!" register the product deliberately rejects. When something needs to be surfaced, it either lives in the thread as a message from Coach Casey (voice-aligned, dismissable by scrolling past) or appears in the relevant surface at the relevant moment (e.g. the install prompt after the first debrief). In-context hints and subtle visual cues (e.g. a fading animation on a button to suggest a gesture) are fine; scheduled interruptive dialogs are not. This rule applies across every surface.

**Frequent mobile controls live at the bottom of the screen.** Mobile thumb-reach is the governing constraint. Menus, search, calendar, and other frequently-reached controls sit at the bottom, not the top. The header, where it exists on mobile, holds quiet branding only. Desktop is allowed to use the header for controls (standard desktop-web convention).

**Standard chat conventions apply where they exist.** Athlete messages appear on the right; Coach Casey messages appear on the left. This is the universal convention across messaging apps and breaking it introduces friction for no benefit. Similar conventions (input field at the bottom of the thread, most-recent message at the bottom, chat-reply streaming on modern platforms) are adopted by default unless there's a specific reason to deviate.

---

## 4. What's not yet decided

Named explicitly. These belong to the visual-design workstream and will be worked when flow design has produced enough to design components against.

- **Visual identity** — colour palette, typography, logo, brand marks
- **Design tokens** — spacing, sizing, type scale, colour tokens
- **Component specifications** — buttons, inputs, cards, navigation, notifications
- **Iconography** — icon system and usage rules
- **Motion and animation** — transitions, micro-interactions, loading treatments
- **Dark mode** — whether, how, and when
- **Responsive behaviour** — mobile-first is locked (PWA), but specific breakpoints and component behaviour across sizes is TBD

The feel principles above constrain these decisions (deliberate pace implies restrained motion; warm competence implies certain type choices over others; just-enough density implies certain component density defaults) but don't make them.

---

## 5. How this document is used

- **New design principles** — added here as they emerge from flow work, in the same shape. A principle earns its place by being reused across more than one flow or surface.
- **Principle conflicts** — if a flow design reveals a principle is wrong or needs nuance, update it here rather than silently deviating. The doc is the source of truth.
- **Visual-design work, when it starts** — reads this doc as input. The feel and posture here constrain the visual identity and component decisions; they don't get re-opened.
- **Content work** — reads §2 (voice posture) as the voice foundation. Full voice guidelines live in the content layer.
- **Reviewed** at V1 build kickoff, after the first two or three flows are designed (to check whether principles need refining with real evidence), at launch-prep, and post-launch.

This doc is deliberately lean. Expanding it requires evidence from real flow work, not anticipation. Speculative principles hurt more than they help.
