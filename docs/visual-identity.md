# Coach Casey — Visual Identity

**Owner:** Jason
**Last updated:** 2026-04-23
**Status:** Short reference doc. Captures what's locked across the visual system as of foundation work. Expected to evolve — exact type scale values, component specs, and some surface colours will tune during V1 build. Not a comprehensive design system.

Supersedes project memory when they conflict. Sits alongside `strategy-foundation.md`, `v1-scope.md`, `engineering-foundation.md`, and `technical-decision-log.md`.

---

## 1. Locked

### Accent — deep plum

- **Light mode:** `#5C3763`
- **Dark mode:** `#8B6B92`

Same plum tuned per mode (not a different colour). Chosen after testing against warm red-orange (too close to Strava), burgundy, forest green, and copper. Plum is distinctive in the running/fitness space, reads as a considered digital product rather than another fitness app, and holds the voice well.

### Typography

- **Serif (prose, headings, display):** Newsreader
- **Sans (UI, data, numbers):** Geist
- **Mono (technical labels):** IBM Plex Mono
- **Tabular numerals** across all numeric content.

### Visual posture

- **Modular scale** of 5–6 type sizes, each with a defined role. Specific pixel values tune during real UI work.
- **4pt base grid.** Spacing rhythm: 8 / 16 / 24 / 32 / 48 / 64.
- **~65ch reading width** for prose.
- **Soft radii** (6–8px).
- **Borders for structural hierarchy.** Shadows reserved for real elevation (modals, dropdowns, hovers) — not decoration.
- **No decorative gradients.** Structural and data-viz gradients allowed when they carry information.
- **No illustration, stock photography, mascot, or decorative iconography.** Typography and composition carry the identity.
- **Motion:** fast and purposeful (150–200ms). Nothing animated for decoration.
- **Density over whitespace in chrome.** Editorial spacing for reading moments.

### Colour modes

- **Dual mode** (light and dark) from day one.
- **Default mode:** TBD post user research.
- All accent and surface values tuned per mode.

---

## 2. Provisional — to resolve

### Paper and surface colours

Working values in use through foundation work — flagged as likely to shift:

- Light paper: `#faf8f5` (warm off-white) — *may be too creamy, reads editorial/old-school. Test near-white (~`#fafafa`) when real UI gets built.*
- Light ink: `#1c1915` (warm near-black)
- Dark surface: `#131217`
- Dark ink: `#f0ede8` (warm off-white)

Resolve at: first real UI surface, or proper marketing page design — whichever comes first.

### Exact type scale values

Scale structure is locked (5–6 sizes, defined roles). Specific values — display, H1, H2, body, UI, small — tune when real content is in place. Composition test artifacts from foundation work can serve as starting points.

### Component specs

None locked. Components get specified as they're built. Reference existing composition tests for treatment patterns (debrief cards, buttons, tags, metric rows).

---

## 3. How this doc is used

Locked items in §1 are the non-negotiables — don't re-litigate without a proposed replacement and reasoning. Provisional items in §2 are expected to shift; when resolved, they move to §1. The Tailwind config in the repo is the source of truth for implementation; this doc is the reference.

Reviewed when major UI surfaces ship, and when any visual component gets contested. Short by design — if it grows past two pages it's no longer doing its job.
