# Coach Casey — Marketing Site Rewrite

**Owner:** Jason
**Version:** 1.0
**Date:** 2026-04-24
**Status:** Full rewrite of coachcasey.app. Sections reordered, two new sections added, all copy updated for thesis refinement and voice discipline. Design notes included. Pass this to Claude Code for implementation.

**Cross-refs:**
- `strategy-foundation.md` — thesis, moat, ICP, pricing argument
- `voice-guidelines.md` — register, anti-patterns, worked examples
- `v1-scope.md` — product surfaces that exist in V1

---

## 1. Why this rewrite

Three strategic and three voice-level issues in the current site. Named here so the rewrite's decisions are traceable.

**Strategic:**
1. **The moat is invisible.** The single most important commercial asset of the product (life-aware longitudinal memory, compounding over months) is not surfaced anywhere. Annual pricing argument collapses without it. Differentiation vs Strava and Runna collapses without it.
2. **Product scope reads too narrow.** Site implies Coach Casey only does post-run debriefs. V1 has debriefs, weekly reviews, and responsive chat. The site should show the breadth without listing features.
3. **ICP invitation is implied, not spoken.** Book-plan, app-plan, and running-group runners don't see themselves on the current site. Coached framing dominates.

**Voice:**
4. **Em-dashes throughout.** Against voice rules. Mechanical fix.
5. **Hero subheadline flat, pricing subheader arms-length, "on the house" register mismatch.** The three lines that stood out as off-voice in the review pass.
6. **Over-literal retrospective framing.** "Reads what just happened, and remembers" boxes Coach Casey into a retrospective-only product. The thesis refinement (responsive when asked) requires the marketing to open up too.

---

## 2. Page structure (new order)

Same basic flow, two new sections added, one section reordered.

1. **Hero** (rewritten)
2. **The debrief** (anchor example, kept, em-dashes removed, header tweaked)
3. **More than the debrief** (new — shows weekly reviews and chat exist)
4. **The moat** (new — gets sharper the longer you use it)
5. **Who it's for** (rewritten — all four ICP segments named)
6. **How it works** (tweaked — three steps, slightly broadened)
7. **Pricing** (rewritten — annual argument now carries the moat)
8. **FAQ** (edited — ICP invitation, responsive framing, data question kept)
9. **Footer CTA** (rewritten — warmer, no colloquialism drift)
10. **Founder line** (new — small, in footer)

**Rationale for the new order:** the user needs four questions answered before they'll buy. (1) What is this? (2) Show me what it actually does. (3) Why does it matter / how is it different? (4) Am I the right kind of runner? The current site answers (1) and (2) well, skips (3) entirely, and implies (4). The new structure answers all four in order — hero and debrief handle (1) and (2); "more than the debrief" widens (2); the moat section handles (3); "who it's for" handles (4). Then pricing, FAQ, close.

---

## 3. The rewrite, section by section

### Hero

**Primary hero line:**

> **Plans know the route. Coach Casey knows the runner.**

**Alternate hero line (if the above doesn't land on implementation):**

> **Plans give you structure. Coach Casey gives you the read.**

**Subheadline:**

> For runners following a plan, from a book, a coach, a running group, or an app. Coach Casey reads the runs, answers the questions, and gets sharper the longer it knows you.

**CTAs (unchanged from current):**

> [Start 14-day free trial] [See how it works]

**Rationale:**

The primary hero line keeps the parallel structure that's already working on the site but replaces "sees the run" with "knows the runner." The shift is load-bearing. "Sees the run" is transactional and narrow. "Knows the runner" is relational, longitudinal, and directly gestures at the moat ("knows" is the word the strategy doc uses for what compounds). It also signals supplementary positioning without being defensive about it; plans know the route, Coach Casey knows the runner, both are true, both are needed.

The subheadline does three jobs the current one doesn't. (1) Names all four ICP segments explicitly so no one feels excluded. (2) Widens the product description beyond retrospective reading ("answers the questions" = responsive). (3) Introduces the compounding claim directly ("gets sharper the longer it knows you"), which previews the moat section without pre-empting it.

**Design notes:**

- Keep the typographic treatment (large serif or editorial sans) currently used for the hero.
- Line break before "Coach Casey knows the runner" if the layout allows — the parallel lands harder with visual symmetry.
- Subheadline should be visibly smaller but still readable at a scroll's distance.

---

### Section 2 — The debrief (anchor example)

**Section header:**

> *A debrief, written*
>
> **Every run, read.**

(Current site uses "Every run, read out loud." "Read out loud" is cute but slightly over. Just "read" is cleaner.)

**Introduction line (above the debrief card):**

> Not a summary. Not a scoreboard. A read on what actually happened, in the voice of a coach who's been paying attention.

(Keep. This is already voice-perfect.)

**The debrief card — copy updated to remove em-dashes:**

Metadata block (unchanged structure):

> Thursday · Easy run
>
> **10 km around the park**
>
> 06:42
>
> Pace: 4:58/km avg
> HR: 142bpm avg
> Distance: 10.0km
> Week: 42km so far

Debrief body (em-dashes removed, otherwise kept):

> Quicker than an easy run usually lives for you. 4:58/km, about 15s/km faster than your usual easy. HR stayed low, so nothing physical. But the plan wanted easy to be easy.
>
> Two things. You mentioned the calf on Tuesday. Easy runs are where you bank that signal, and 4:58 is harder to justify if the calf's still talking. Not my call, but worth sitting with before tomorrow.
>
> — Coach Casey

**Rationale:**

This section is already doing most of its job. The debrief body is the best piece of voice on the site and it stays. The only changes are (1) em-dash removal and (2) a slightly cleaner section header. The em-dash swap works — the new sentence breaks actually read better than the em-dash version did.

**Design notes:**

- Keep the card treatment. The metadata block with pace/HR/distance/week is excellent — makes the debrief feel anchored to real data, reinforces specificity as a voice principle.
- "— Coach Casey" signature is fine.

---

### Section 3 — More than the debrief (NEW)

**Section header:**

> *Between every debrief*
>
> **There's more than the read after the run.**

**Body copy:**

> Coach Casey isn't only there at the end of a run. It's there during the week too.
>
> When the week's over, it reads the whole thing in context, not just each run one at a time. Sessions across the block. Patterns it's seen before. What you said about the calf, the work trip, the sleep.
>
> And when you've got a question, you can just ask. *"Should I swap tomorrow's tempo given the calf?"* isn't a question a plan can answer. Coach Casey can.

**Rationale:**

This is the missing breadth section. It does three things: (1) names weekly reviews as a surface without featuring them as heavily as debriefs, (2) names responsive chat as a surface and gives a specific example of what a forward-looking question looks like, (3) shows the life-context integration in passing ("what you said about the calf, the work trip, the sleep"), previewing the moat.

The chat example is deliberate. It shows responsive prescription in action — an athlete asking a forward-looking question — which is the V1.5 thesis refinement that the current site can't reflect because it was written before. The copy is careful to frame it as "you can just ask," not "Coach Casey tells you what to do." That preserves the thesis boundary.

**Design notes:**

- Visual weight of this section should be lighter than the debrief section. Think subsection, not peer section. A single paragraph with maybe a small chat-style illustration (not a full card treatment).
- Optional: small illustration of a chat bubble with the "Should I swap tomorrow's tempo" line, styled like a messaging interface. Would reinforce the responsive-chat point without needing more copy.
- This section is short on purpose. Don't pad.

---

### Section 4 — The moat (NEW)

**Section header:**

> *The hidden part*
>
> **Coach Casey gets sharper the longer it knows you.**

**Body copy:**

> Your first week, Coach Casey is useful. It reads your runs, notices what's fast and what's not, catches the obvious stuff.
>
> Your third month, it's different. It knows your easy pace isn't the book's easy pace. It remembers the calf from February and brings it up when you go quick on a Tuesday. It knows which races matter and which are rehearsals. It knows you had a kid six months ago and you're still finding your old sleep.
>
> None of that's in your Strava data. It's in the slow accumulation of everything you've told Coach Casey along the way. That's the part that compounds. That's the part that doesn't exist anywhere else.

**Rationale:**

This is the most important new section on the page. The strategy doc explicitly calls this a copy requirement, not a flourish. Without it, the annual pricing argument collapses and the differentiation vs Strava has no spine.

The approach is show-don't-tell. Not "our AI personalises over time" but specific observable behaviour — "remembers the calf from February," "knows you had a kid six months ago." The concrete examples do more work than any abstract claim about memory or personalisation.

The last paragraph does the Strava differentiation implicitly without naming Strava. "None of that's in your Strava data" is the differentiation sentence. Doesn't need to name the competitor to land.

Careful note: the copy deliberately doesn't frame day 1 as "wait for it to be good." It says Coach Casey is useful in your first week *and* gets sharper. Per strategy doc §5, "already useful, gets deeper" is the right framing to avoid trial-conversion risk.

**Design notes:**

- This section wants its own visual treatment. Possibly:
  - A simple left-to-right progression showing Week 1 / Month 3 / Month 12 with a short descriptive line under each
  - Or a stylised "memory card" showing accumulated context (X runs read, Y notes remembered, Z races logged) — the start of the memory-as-progress UI from strategy doc §9
- If going visual, keep the body copy above as well. Don't replace text with a graphic.
- Consider this section's visual weight roughly equal to the debrief section. It's the second major pillar of the site.

---

### Section 5 — Who it's for

**Section header:**

> *Who it's for*

**Body copy:**

> If you've committed to a plan and you're showing up to the runs, you've done the hard part.
>
> Coach Casey is for the runners in between. Following Pfitz, Hansons, or Daniels from the book. Running the block your coach wrote. Executing the Runna plan on your phone. Showing up to your running group's sessions each week. Any of these. All of these. None of them matter, as long as there's a plan and you're in it.
>
> What's missing for most plan-following runners is the read. Someone holding the memory of every run, noticing the drift, asking the sharper question before the pattern becomes a problem. That's what Coach Casey is.
>
> If you want something to write your training, to pump you up through an app, or to replace a coach who already watches every run of yours, Coach Casey isn't that. It sits alongside what you've already got, reads what's happening, and answers when you ask.

**Rationale:**

Three changes from the current site. (1) All four ICP segments are now named — book, coach, app, group — rather than implied. (2) "Reads what just happened" softened to "reads what's happening, and answers when you ask," which accommodates both the retrospective default and the responsive posture. (3) "Replace a coach who already watches every run" is clearer than the current phrasing and more explicit about the anti-ICP.

The "Pfitz, Hansons, or Daniels" specificity is deliberate — it's a recognition-bait moment. If you're running any of those plans, you'll notice. If you're running any other book plan, you'll feel invited by association. The brand names do more work than "book plan" would.

**Design notes:**

- No special treatment needed. Runs as prose.
- If the layout supports a small icon-row treatment of the four ICP segments (book icon / coach icon / phone icon / people icon), that could reinforce the breadth visually. But copy works without it.

---

### Section 6 — How it works

**Section header:**

> *How it works*
>
> **Three steps. Then it's just running.**

(Keep current header. "Then it's just running" is working.)

**Step 1 — unchanged:**

> **Connect Strava.**
>
> New activities sync automatically. Coach Casey starts reading from your first run.

**Step 2 — lightly edited:**

> **Tell it what you're training for.**
>
> Upload your plan, paste a block, or just describe the race and how you're getting there. The more Coach Casey knows, the sharper the reads.

(Current copy says "upload a plan, paste a block, or describe the race." New copy adds "your" and "just," both small warmth moves. "Just describe the race and how you're getting there" is a slight broadening — leaves the door open for runners who don't have a formal plan to upload.)

**Step 3 — rewritten to reflect scope:**

> **Get your debriefs. Get your weekly reviews. Ask the questions.**
>
> Coach Casey writes after every run, reads your whole week at the end of it, and answers whatever you want to bring to it. Uses your actual data, your plan, and everything you've told it.

(Current copy is just "Get a debrief after every run." The new version names all three surfaces without over-explaining them. Matches the breadth established in Section 3.)

**Rationale:**

Steps 1 and 2 are fine with small tweaks. Step 3 is where the scope-narrowness problem was worst — reducing the product to "get a debrief" in the how-it-works section trains the reader to expect one-surface product. Rewriting it to name all three surfaces (debrief / weekly review / chat) aligns the mental model with V1 scope.

**Design notes:**

- Current numbered treatment is clean. Keep.
- Step 3 is now two sentences where the others are one-plus-one. Fine. Let it breathe.

---

### Section 7 — Pricing

**Section header:**

> *Pricing*
>
> **Fair for serious runners.**

**Subheader replacement copy:**

> Priced against a human coach, not against a running app. Less than one coaching session a month, every month.

**Monthly card:**

> **Monthly**
>
> **A$24/month**
>
> Cancel anytime.

**Annual card (with new surrounding copy):**

> **Annual**
>
> **A$199/year**
>
> Effective A$16.60/month. Save A$89 a year.

**New line below cards (this is the load-bearing change):**

> Annual is priced to keep you through the window where Coach Casey gets sharpest. The first three months are already useful. Month six is when the memory really earns its keep.

**CTA line (below all of the above):**

> [Start 14-day free trial]
>
> No card required for the trial. All prices in AUD.

**Rationale:**

Three changes. (1) "Fair for what it does" replaced with "Fair for serious runners" — warmer, anchors to the ICP, avoids the generic "fair" framing. (2) The offending subheader ("priced for people who are serious enough to pay for it and sensible enough to notice when they aren't using it") is gone. Replaced with a line that names the coaching-tier anchor directly, which is the pricing strategy's actual argument per strategy doc §7. (3) A new line below the cards makes the annual argument explicit. This is the moat doing commercial work — "priced to keep you through the window where Coach Casey gets sharpest" says why annual exists without being sales-y.

**Design notes:**

- Two-card layout (monthly / annual) is right. Don't change the shape.
- The new "Annual is priced to keep you..." line should sit below the cards, not inside either card. It's site-wide framing, not a card feature.
- Consider making the annual card visually slightly emphasised (subtle — a border treatment, a "recommended" tag, not a loud difference).

---

### Section 8 — FAQ

**Section header:**

> *Questions*
>
> **Fair things to ask.**

(Keep. "Fair things to ask" is in voice.)

**Q1 — edited:**

> **Does it replace my coach?**
>
> No. Coach Casey reads your runs, remembers the pattern, and answers your questions. Your coach decides the programme and the big calls. If anything, the debriefs give your coach a sharper starting point.

**Q2 — rewritten:**

> **What if I don't have a coach? Or I'm following a book plan, an app plan, or a group plan?**
>
> Coach Casey works with all of those. It needs a plan of some sort to read against, but the plan can come from anywhere. Book plan, Runna, TrainingPeaks, your coach, a running group block — it's all good. You can even just describe what you're training for in a few sentences, and Coach Casey will work with that until you've got something more structured.

**Q3 — edited:**

> **How is this different from Strava or Runna?**
>
> Strava records the run. Runna writes the plan. Coach Casey does neither. It reads your runs, weighs them against your plan, your history, and the life context you've given it, and answers your questions about all of it. The longer you use it, the sharper it gets — because it actually remembers.

**Q4 — kept mostly as-is:**

> **Where does my data go?**
>
> Strava data comes in read-only through their API. Your runs, plan, and chat history are stored on Supabase, in Sydney. Coach Casey uses large language models to write debriefs and respond to you; your data is never used to train them.

**Q5 — edited:**

> **What does the trial include?**
>
> 14 days, no card required, everything enabled. Connect Strava, upload a plan if you've got one, get debriefs, weekly reviews, and open chat. If it isn't clicking by day 10, it probably isn't for you.

**Q6 — unchanged:**

> **Can I cancel anytime?**
>
> Yes, from your account page. No claw-backs on the annual plan. Unused months refund automatically, pro-rata.

(Em-dash removed in Q6: original read "No claw-backs on the annual plan — unused months refund automatically" which has an em-dash.)

**Rationale:**

Three real changes. (1) Q2 is rewritten from "what if I don't have a plan" to "what if I don't have a coach / I'm following a book, app, or group plan" — directly invites the three non-coached ICP segments that the strategy doc flagged as under-represented. (2) Q3 updated to reflect the responsive posture ("answers your questions about all of it") and makes the moat argument explicitly ("the longer you use it, the sharper it gets"). (3) Q5 updated so "everything enabled" is a real claim — debriefs, weekly reviews, and chat all named, matching actual V1 scope.

**Design notes:**

- Keep the current expanding-FAQ or list-style treatment. Whatever's already there works.
- Order matters slightly — Q2 is a lot more prominent now (it's essentially the ICP invitation for the non-coached segments) so it lives high in the list.

---

### Section 9 — Footer CTA

**Section header (rewritten):**

> **Fourteen days, no card.**

**Body copy:**

> Connect Strava, run the runs you were going to run anyway, see what Coach Casey has to say.

(Body keeps.)

**CTA:**

> [Start free trial]

**Rationale:**

"Fourteen days on the house" is warm but out of register against the rest of the site. "Fourteen days, no card" says the same generosity in plainer language. Same content (trial length, no card required, low-friction), cleaner voice. The body line beneath ("run the runs you were going to run anyway") is already working — it's one of the best lines on the site.

**Design notes:**

- Keep the card-style footer CTA treatment.
- Subtle note: if there's a design-system opportunity, pairing this section with the hero section visually (same headline treatment) would create a bookend effect — the page opens and closes on the same tonal note.

---

### Section 10 — Founder line (NEW)

**Placement:** small, in or just above the existing footer. Not a section of its own; a trust signal.

**Copy:**

> Built by Jason Gauci in Sydney. Founder of [The Marathon Clinic](https://themarathonclinic.com).

**Rationale:**

The brand architecture decision in strategy doc §2 says Coach Casey is a standalone product brand, with The Marathon Clinic as a separate content/philosophy property. Attribution to Jason and the clinic is the footer move. Reinforces credibility (especially in AU/NZ), provides a link out, doesn't confuse the Coach Casey brand identity.

(Replace "Jason Gauci" with your preferred attribution — first name only, full name, etc. Style choice.)

**Design notes:**

- Small text. Lives alongside the existing copyright line or just above it.
- Link The Marathon Clinic only if it's ready to receive traffic (even if just as a placeholder). If not ready, drop the link; keep the text.

---

## 4. Cross-site design observations

Things that would strengthen the rewrite if tackled at the design layer, not just copy.

### 4.1 Memory as a visible element

The moat section (§4 of this doc) lands as copy, but a visual treatment would make it land harder. The memory-as-progress UI flagged in strategy doc §9 for the product could preview here. Something like:

> *Coach Casey has read 47 of your runs. Remembers your 2026 goal. Knows about the calf.*

Used as either a decorative line within Section 4, or as a small "live example" card. This is also the place where a generic site would put testimonials; since we don't have those yet, the memory element substitutes.

### 4.2 Chat as a visible moment

Section 3 (More than the debrief) could be designed with a small chat UI showing the "Should I swap tomorrow's tempo" example. Styled like a messaging app. Would reinforce the responsive surface without requiring the reader to imagine it. Doesn't need to be interactive. A single illustrative frame is enough.

### 4.3 The "four ICPs" visual

Section 5 (Who it's for) could take a small four-icon row — book, coach, app, running group — to make the ICP breadth visible at a glance. Optional. Copy carries it without.

### 4.4 Em-dash audit sitewide

The rewrite removes em-dashes from the rewritten sections. Anywhere else on the site (legal, signup flow, error states, emails) that might still contain em-dashes should be swept. This is a cross-site voice rule, not a hero-page exception.

### 4.5 Voice registers by surface

From `voice-guidelines.md` §4: the site is in marketing register; the debrief example within it is in in-product register. This is good. But some of the CTAs and button labels should stay in marketing register ("Start 14-day free trial" — marketing; "Start free trial" — marketing), while any in-product text that eventually appears on the site (e.g. future interactive demo) should switch to in-product register. Worth establishing this distinction in the Design System when it's built.

### 4.6 What's deliberately absent

No testimonials (no real users yet). No logos/press section. No founder photo. No "as seen in" strip. All of these are legitimate to add post-launch when there's something real to put in them; at V1 launch, absence is better than placeholders. A site with nothing fake beats a site with something fake.

---

## 5. What to ship, in order

If Claude Code is implementing this, suggested build order:

1. **Em-dash sweep across existing site.** Mechanical. Zero new sections.
2. **Hero rewrite** (copy only). Drop new lines in.
3. **Section 2 header tweak + em-dash removal in debrief body.**
4. **Section 5 (Who it's for) rewrite.** Copy-only. No new design.
5. **Section 6 (How it works) Step 3 rewrite.** Copy-only.
6. **Section 7 (Pricing) subheader + new annual-argument line.** Copy, with small layout addition under the cards.
7. **Section 8 (FAQ) rewrite.** Copy-only, reordering and new Q2.
8. **Section 9 (Footer CTA) header tweak.** Copy-only.
9. **Section 10 (Founder line) addition.** Copy-only, small footer change.
10. **NEW: Section 3 (More than the debrief).** Requires a layout decision for how it sits between debrief section and moat. Possibly small new component for chat illustration.
11. **NEW: Section 4 (The moat).** Biggest new section. Requires layout decision and possibly a small new component (memory card / progression).

Steps 1–9 are ~2 hours of copy and light-layout work. Steps 10–11 are the design investment. The site would be materially better just with steps 1–9 if the new sections aren't ready; the moat section in particular benefits from a design pass and shouldn't ship as text-only if it can wait a week for a proper treatment.

---

## 6. Open decisions for Jason

Small calls that I haven't made for you — lock these before handoff.

1. **Primary vs alternate hero line.** I went with "Plans know the route. Coach Casey knows the runner." Alternate "Plans give you structure. Coach Casey gives you the read." is viable if the first doesn't land after a day of sitting with it. Both are thesis-consistent.
2. **Founder attribution form.** First name, full name, or just "Built by the founder of The Marathon Clinic." Your call.
3. **Whether to link themarathonclinic.com in the footer now.** Only if the placeholder page is live.
4. **Whether to design Section 3 and Section 4 with visual treatments or ship them as text-only on first pass.** My recommendation: ship Section 3 text-only, design Section 4 with a real treatment. Section 4 is load-bearing enough to warrant the design investment.
5. **Whether to keep "Built in Australia" in the current footer or replace with "Built in Sydney" in the founder line.** Minor, but worth being consistent.
