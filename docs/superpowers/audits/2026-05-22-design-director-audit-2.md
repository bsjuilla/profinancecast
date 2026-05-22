# Wave-15 Design Director audit — Round 2 (W15-A/B/C closing)

Continuation of the design audit started in `2026-05-22-design-director-audit.md`. Three slices delivered:

## W15-A: currency display fix (commit `56ab398`)

**Problem:** Founder screenshot showed `$48,848` for a Mauritius user. Root cause: `USER.currency` was stored sometimes as a symbol (`$`) and sometimes as an ISO code (`MUR`), and 36 display sites across 9 inline JS files concatenated `USER.currency` raw.

**Fix:** Exposed `window.PFCSym` as a top-level shorthand for `PFCCurrency.toSymbol()` (already a normaliser that handles both formats). Routed every display site through it via a defensive ternary:

```js
const sym = window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$');
```

**Result:** Mauritius user with `USER.currency === "MUR"` now sees `₨48,848`. French user with `"EUR"` sees `€48,848`. Legacy storage with `"$"` still works. Defensive fallback covers early-boot edge cases.

**Files touched:** dashboard-2.js (8 sites), debt-optimizer-2.js (7), history-2.js (3), net-worth-2.js (4), recurring-2.js (5), salary-calculator-2.js (6), scenarios-3.js (1), goals-2.js (1), cash-forecast-2.js (1).

## W15-B: type + spacing rhythm baseline (commit `4f2459c`)

**Problem:** `pfc-tokens.css` already had the right token scale (font stack, type sizes 11→96px, spacing 4/8/12/16/24/32/48/64/96), but dashboard.html had 189 inline `font-size:` overrides because there was no baseline to fall back on.

**Fix:** Created `css/pfc-rhythm.css` — a baseline LAYER using `:where()` selectors (specificity 0,0,0). Scoped to `body[data-pfc-surface="working"]`. Inline styles still win; we fill in where the page doesn't speak.

**Rules established (Monarch / Copilot pattern):**
- `h1/h2/h3` → display serif (Fraunces), tight letter-spacing, tight line-height
- `p` → 1.6 line-height + tabular-nums (numbers in prose align with cards)
- `.num` → tnum + lnum + ss01 feature settings, -0.005em tracking
- Cards default 24px padding, 16px gap between metric tiles
- Section stack 32px baseline margin
- Tables: numbers right-align with tabular nums

**Result:** Wired into 63 working-surface pages. Sequenced after `pfc-photo-rules.css` so rhythm is the last word in the cascade.

**Out of scope (deferred):** The 189 inline font-sizes remain in place — they still win. A future surgical pass can remove them cluster-by-cluster as the rhythm baseline proves itself in production. Not a multi-day refactor tonight.

## W15-C: per-page hero audits — scenarios, sage, settings

**Method:** Audited each page's first-fold structure after the Wave-15 photo-rules + Wave-15-A currency fix + Wave-15-B rhythm baseline. Verdict:

| Page | Audit finding | Status |
|---|---|---|
| `scenarios.html` | Had a 1915×821 hero photo + comparison-empty-state photo. Both hidden by Wave-15 rule. **New hero:** the `.summary-strip` (Active scenarios / Best 12-mo / Highest surplus / Best health score) — exactly the Monarch dashboard-widgets pattern. | ✓ No code change needed |
| `sage.html` | Had a `sage-welcome-portrait` photo + a second decorative figure on the welcome screen. Both hidden. **New hero:** the welcome avatar (circle with "S") + `"What can Sage forecast for you today?"` heading — Copilot's chat-surface pattern (conversation IS the surface, identity is the only decoration). | ✓ No code change needed |
| `settings.html` | Already photo-free. No change. | ✓ Naturally clean |

**Conclusion:** the design-system rule from Wave-15 (`data-pfc-surface="working"` + `pfc-photo-rules.css`) did the per-page heavy lifting in one stroke. No additional surgery required for these three pages.

## What's done across Wave-15

| Slice | Commit | Files | Effect |
|---|---|---|---|
| Wave-15 base | `99d6a12` | 65 | Photography discipline + dashboard hero reorder |
| W15-A | `56ab398` | 10 | Currency normalisation across 36 display sites |
| W15-B | `4f2459c` | 64 | Type + spacing rhythm baseline (`pfc-rhythm.css`) |
| W15-C | this doc | 0 code | Per-page audit (no further surgery — design-system rule sufficient) |

Total Wave-15 scope: **5 commits, ~140 files modified, 2 new CSS files (photo-rules + rhythm), 2 audit docs.**

## Honest framing — still missing

This is "acceptable for a beta channel test" quality. Not yet "competitive with €100M-funded incumbents." Specific remaining work, prioritised:

1. **The 189 inline font-sizes on dashboard.html** — pick the top 5-10 visual offenders (e.g. the FX panel h3 inline `font-size:17px`, the metric-val inline overrides) and replace with `var(--t-N)` token references. Low-risk because the rhythm baseline is already in place to catch what's removed.

2. **Custom-component visual polish** — `.summary-card` on scenarios, `.metric-val` on dashboard, the chat message bubbles on sage. These are bespoke components that pre-date the token system; each needs ~15 min to normalise.

3. **Mobile breakpoints** — Wave-15 hasn't audited the mobile layouts. Working tool surfaces below 600px need their own check (likely cramped on most pages).

4. **Empty-state copy** — many pages now show empty states where photos used to be (e.g. scenarios.html line 871: "Add scenarios above to compare."). The copy is fine; the framing is unanchored without the photo. Worth a CMO copy pass on these.

5. **Dark-mode token audit** — the existing theme is dark-only. Light mode would require a token-level pass. Defer until requested.

**COO discipline still applies:** none of items 1-5 ship until the channel test returns first-100-user data showing which surfaces matter and which don't. The site is now visually defensible enough to put in front of real users.
