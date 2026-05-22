# Wave-15 Design Director audit — dashboard surgery + photography discipline

**Anchor aesthetic:** Editorial-fintech (Monarch Money, Copilot Money).
**Trigger:** Founder posted dashboard screenshot showing a 700px-tall decorative coin-bowls photo dominating the page above the user's actual KPI numbers. Verdict: hierarchy is upside-down, brand poetry has eaten product utility.

## Research findings

| Source | Pattern observed |
|---|---|
| Monarch Money | Hero is the **net-worth trend line** + total figure in display serif. Photos: none on working surfaces. Photography reserved for marketing/onboarding. |
| Copilot Money | Spending-progress graph is the hero. Type-driven hierarchy, near-zero decoration on dashboard. Brand stays in marketing. |
| Lunchmoney / YNAB | Tighter, more utility-focused — no decoration at all on dashboard. Dense data, opinionated grid. |

**Single shared pattern:** working-tool surfaces do not feature page-dominant decorative photography. The user's numbers ARE the design.

## Diagnosis on the dashboard screenshot

| Problem | Cause | Fix |
|---|---|---|
| Coin-bowls photo dominates page (~50% of viewport) | `portfolio-currency-triptych.webp` rendered as full-width masthead on the FX card | Strip the photo; FX panel becomes a small data card |
| KPI cards pushed below the fold | FX panel sits above them in the DOM | Reorder: metrics first, FX second |
| Leather-ledger masthead band above tabs | `dashboard-masthead-band.webp` rendered as eyebrow strip | Suppressed via site-wide CSS rule |
| Savings-rate vignette photo | `dashboard-savings-rate-vignette.webp` decorating an analytical card | Suppressed via same rule |
| Upgrade-banner flourish photo (Free users only) | `dashboard-upgrade-banner-flourish.webp` on Pro pitch | Suppressed (less critical — only Free users see it) |
| KPI numbers display as `$48,848` (USD) for a Mauritius user | Currency formatter defaults to `$` | Out of scope tonight — separate slice (touches pfc-currency.js + user account settings) |

## The design-system rule (single-rule sledgehammer)

Created `css/pfc-photo-rules.css`. Two surface classes via `data-pfc-surface` on `<body>`:

- **`working`** — dashboard, scenarios, sage, settings, net-worth, portfolio, goals, debt-optimizer, cash-forecast, recurring, salary-calculator, report-card, history, journal, billing, all of tools/*. **Photography is suppressed.**
- **`marketing`** (or no attribute) — index, about, blog, blog-*, privacy, terms, help, onboarding, auth. **Photography renders.**

Override mechanism for rare exceptions: `data-pfc-photo-keep="true"` on the figure/img.

This is one CSS file, 30 lines, with `:not([data-pfc-photo-keep="true"])` selectors so the override is safe-to-add per element.

**Applied site-wide:** 62 working-surface pages received both the `data-pfc-surface="working"` body attribute and the new CSS link in one scripted pass.

## What this does NOT fix tonight

1. **Currency display** — KPI numbers still show `$` for users whose account currency is non-USD. This is a separate slice that touches `pfc-currency.js`, `pfc-user.js`, and the demo-data hardcoded fallbacks. ~60-90 min.

2. **Spacing scale** — the current dashboard uses ad-hoc inline `padding` and `margin` values. A proper Monarch-style spacing pass would extract `--space-2 / 3 / 4 / 5 / 6 / 9` token usage and replace every inline value. ~3-4 hours, lower visual leverage than the photo strip.

3. **Type-rhythm refinement** — Monarch uses 1 display serif + 1 monospace for numbers + 1 sans for body. ProFinanceCast already has this stack (Fraunces / mono / body) but inconsistently applied. Worth a future audit. ~2 hours.

4. **The other tool pages** — they NOW have the surface attribute so photography is suppressed, but their per-page layout decisions (what's the hero? what's below the fold?) haven't been individually reviewed. Triage by visiting each: scenarios.html, sage.html, settings.html most-likely candidates for the next visual audit.

## Scope honesty

This wave is the **fastest possible visual quality recovery** — strip the worst offender, ship a system-level rule that prevents the same pattern site-wide. It is NOT the full Monarch/Copilot aesthetic catch-up. That would be a multi-day rebuild.

The COO discipline still applies: don't keep iterating on the dashboard if the channel test hasn't returned data. After tonight's pass, the visual quality is "acceptable for a beta channel test", not "competitive with €100M-funded incumbents". That's the right ceiling for this stage.
