# ProFinanceCast — UX Hierarchy Audit (CPO)
**Date:** 2026-05-21 · **Verdict:** ITERATE

The photo refactor solved the original "overshadowing" complaint almost everywhere, but a new cluster of "ghost pages" emerged — pages where shrunken or zero-dimension images leave a large dark-green void with no typographic or data mass to fill it. Onboarding flow + goals + recurring + portfolio + tools pages need targeted fixes before the next public announcement.

## Rubric (per page, 0-5 each, /25 total)
- **T** Title prominence — is the h1 the first thing the eye lands on?
- **D** Data prominence — KPIs/charts/forms visually salient?
- **A** Art harmony — photo supports, not dominates?
- **E** Empty zones — dead space disrupts rhythm? (5 = no dead space)
- **B** Balance — overall

## Per-page scorecard (selected highlights)

| Page | T | D | A | E | B | /25 | Note |
|---|---|---|---|---|---|---|---|
| **debt-optimizer** | 5 | 5 | 5 | 5 | 5 | **25** | No-photo page; dense data fills every zone — gold standard |
| scenarios | 5 | 5 | 4 | 4 | 5 | 23 | Best-balanced photo page |
| net-worth | 5 | 4 | 4 | 4 | 4 | 21 | Hero pairs beautifully with Fraunces italic h1 |
| cash-forecast | 4 | 5 | 4 | 4 | 4 | 21 | Tide-band eyebrow harmonious |
| journal | 4 | 4 | 4 | 4 | 4 | 20 | Editorial card grid works |
| auth | 4 | 4 | 4 | 4 | 4 | 20 | Most elegant 2-column layout |
| about | 4 | 3 | 4 | 4 | 4 | 19 | Well-proportioned |
| help | 4 | 3 | 4 | 3 | 3 | 17 | Hero precedes h1 slightly |
| sage | 4 | 4 | 3 | 3 | 4 | 18 | Right sidebar hollow when empty-context card is 0x0 |
| dashboard | 3 | 4 | 3 | 3 | 3 | 16 | Upgrade-banner key floats mid-page |
| history | 4 | 3 | 4 | 2 | 3 | 16 | "No history yet" creates 200px void |
| report-card | 4 | 4 | 1 | 2 | 3 | 14 | Keepsake portrait 0x0 — completely absent |
| portfolio | 3 | 2 | 2 | 2 | 2 | 11 | Two competing voids stacked |
| goals | 3 | 2 | 3 | 1 | 2 | 11 | Floating-island photo, dead zone above and below |
| onboarding | 3 | 2 | 1 | 1 | 2 | **9** | Both photos 0x0, bottom 40% pure void |
| recurring | 2 | 1 | 3 | 1 | 2 | **9** | Empty-state holding pattern, too much vertical air |
| tools/take-home-pay | 0 | 0 | 0 | 0 | 0 | **0** | **404 — CPO's audit hit a dead page** |
| tools/debt-strategy | 0 | 0 | 0 | 0 | 0 | **0** | **404 — CPO's audit hit a dead page** |

> **Note on tools pages:** my own screenshot-photos.py harness rendered them OK (figures=0, status 200). CPO may have hit them without the .html suffix and Vercel returned 404. **Action: verify routing in vercel.json for `/tools/*` rewrites.**

> **Note on 0x0 images** (sage-empty-context, report-card-keepsake, both onboarding images): these are conditional renders that only show when the user has no data. In audit-mode the SAMPLE_USER has data, so the empty-states correctly hide. The 0x0 here is intentional — NOT a bug. But CPO is right that we should still verify they render properly on a true zero-data user.

## Top 5 pages needing work

**1. tools/take-home-pay + tools/debt-strategy** — verify Vercel rewrites/redirects; ensure both `.html` and clean URL load.

**2. onboarding (9/25)** — diagnose 0x0 images (likely path or conditional issue); restore welcome vignette + completion keepsake; even a typographic numeral ("Step 1") would anchor the void.

**3. recurring (9/25)** — add ghost/skeleton 2-3 row table preview of what detected charges look like; converts dead air into promise of value.

**4. goals (11/25)** — replace floating photo with 2-column split (photo left, explainer right, mirroring auth pattern); add one example goal card as ghost state.

**5. portfolio (11/25)** — demote empty-vault from 320×240 standalone to 64px icon inside a structured empty-state card; fill right-rail allocation panel with placeholder donut.

## Three cross-cutting moves

**Move 1: Zero-state data placeholder rule** — every empty-state section must contain a ghost/skeleton of its filled state (faded table row, flat donut ring, dashed goal-card outline) alongside the CTA. Eliminates "abandoned page" feeling without new photography.

**Move 2: Photo-free page masthead treatment** — for any page with broken/missing imagery, apply a strong page-masthead pattern: h1 at 48-56px Fraunces italic + 2-line subtitle at 16px + 1px brass-toned rule. Debt-optimizer (25/25) proves this works.

**Move 3: CI check for zero-dimension images** — any `<img>` or `.pfc-photo-*` element rendering with `naturalWidth === 0` after 500ms should log an error and render a fallback background with min-height 120px instead of collapsing. Prevents silent voids after future refactors.
