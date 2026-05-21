# Code Review — Photo Refactor Commits (a7d2921 + c017bb3 + c535df7)
**Verdict:** SHIP (with 3 trivial fixes below).
**A11y score:** 7/10.

## Bugs Found

### Bug 1 — warning — wrapper-div pattern collapse risk
`css/pfc-photos.css:96` — `.pfc-photo-hero img { height: 100% }` rule. On the direct-img pattern (24 dashboard pages) it doesn't match. But ANY future wrapper-div usage will collapse the image to height 0 because the parent has no explicit height (relies on `aspect-ratio`).

**Fix:** change line 96 from `height: 100%` to `height: auto !important` (or drop the rule entirely and let the `img.pfc-photo-*` block handle both patterns).

### Bug 2 — warning — `.pfc-photo-eyebrow.is-tall` missing explicit max-width
`css/pfc-photos.css:75` — Inherits 640px from base (works today on portfolio's 2048×768 source, but undocumented).

**Fix:** add `max-width: 640px` explicitly for clarity.

### Bug 3 — warning — tools pages missed `?v=2` cache-bust
`tools/debt-strategy.html:159` + `tools/take-home-pay.html:139` — Both load `../css/pfc-photos.css` WITHOUT `?v=2`. Returning visitors see cached v1 (880px hero, 440px card) instead of corrected sizes.

**This explains the CPO's "404" reading on those pages — the photos render at oversized v1 dimensions, breaking layout enough that the audit agent misread them as a 404.**

**Fix:** bump both link tags to `?v=2`.

## A11y Score: 7/10
- Alt text: strong (descriptive, editorial register, no `alt=""` or `alt="photo"`)
- loading + decoding + width + height: 100% adoption
- `<picture>/<source>` WebP delivery intact
- `-1` Inconsistent `<figcaption>` (used in onboarding, missing on heroes — fine for atmospheric, weakens semantics)
- `-1` Decorative photos (upgrade-banner key, empty-state vignettes) NOT marked `aria-hidden="true"` — screen readers announce alt text for ornamental content
- `-1` `<section aria-label>` pattern from index.html not replicated in app pages

## CSS specificity table

| Rule | Specificity | !important |
|---|---|---|
| Base block | 0-1-0 | no |
| `img.pfc-photo-*` override | 0-1-1 | yes (width, height) |
| Size/aspect block | 0-1-0 | no |
| Modifier classes (.is-wide etc.) | 0-2-0 | no |
| `.pfc-photo-hero img` child rule | 0-2-0 | no |
| Mobile media | 0-1-0 | no |
| Dark canvas variant | 0-2-0 | no |

`!important` usage well-justified (HTML width/height presentational attrs from integration script winning over CSS aspect-ratio). No naked !important to solve a specificity war.

## Nice-to-haves
1. Move to content-hash busting (`?v=<sha1:6>`) — `?v=2` will drift
2. Add CSS comment that `.is-wide`/`.is-cinema` inherit base margin (currently relies on un-explicit cascade)
3. Mark purely-atmospheric figures with `aria-hidden="true"`
4. Strengthen net-worth.html's figure → heading semantic relationship with `aria-labelledby`
