# ProFinanceCast — Brand Voice Audit (CMO)
**Date:** 2026-05-21 · **Overall cohesion:** 7.1 / 10

## Verdict
Public-facing layer (landing, blog, about, auth) sounds like a seasoned editorial house. App layer (dashboard, debt-optimizer, recurring, scenarios, goals) mostly sounds like a Notion-template SaaS. Three structural problems:

1. **Two-tier copy quality** — marketing pages vs. app pages
2. **Eyebrow discipline is uneven** — net-worth has canonical `THE ARCHIVE · NET WORTH`; debt-optimizer/portfolio/report-card/history/cash-forecast have no eyebrow at all
3. **Empty-state + microcopy still unedited** — `No debts added yet`, `Loading your goals…`, `Add your first stock, ETF, or crypto`, `You're all set!` all break register

## Per-page voice scores

| Page | Score | Note |
|---|---|---|
| index | 4.5/5 | Exemplary |
| dashboard | 2.5/5 | `My Dashboard` topbar is generic |
| sage | 4.0/5 | `What can Sage forecast for you today?` warm + on-brand |
| portfolio | 2.0/5 | Pure fintech-startup prose |
| scenarios | 3.0/5 | `Same product as Free; more rope` semi-casual |
| report-card | 3.0/5 | `Download image` app-vernacular |
| debt-optimizer | 2.0/5 | 🔥/⚡ emoji directly violate brief |
| goals | 2.5/5 | `Loading your goals…` system-state as copy |
| **net-worth** | **5.0/5** | **The canonical reference** |
| cash-forecast | 2.5/5 | Topbar title missing entirely |
| salary-calculator | 2.5/5 | Internal product-name as title |
| recurring | 2.0/5 | Instruction-manual prose |
| history | 3.0/5 | `All your activity in one place` — most generic line in app |
| journal | 4.0/5 | Could be `The Journal` for more weight |
| onboarding | 3.0/5 | `You're all set!` severe voice break |
| auth | 4.5/5 | `Your financial future, forecast.` perfect |
| about | 4.5/5 | `A quiet European forecasting house` — best self-description |
| help | 4.0/5 | Direct + unpretentious |
| blog | 4.0/5 | `The financial forecast journal.` on-register |
| blog-emergency-fund | 4.5/5 | — |
| blog-50-30-20 | 4.5/5 | Photo violates brief (ceramic jars with text) |
| blog-debt-avalanche-method | 4.0/5 | — |
| blog-index-funds | 4.5/5 | Best blog headline (`buy the haystack`); photo off-register |
| blog-inflation | 4.5/5 | Closest art-to-brief match |
| blog-net-worth | 4.5/5 | — |
| blog-salary-negotiation | 4.0/5 | — |
| tools/take-home-pay | 3.5/5 | Direct, no eyebrow |
| tools/debt-strategy | 3.5/5 | — |

## Top 10 voice-breaking lines + rewrites

| # | Line | Page | Rewrite |
|---|---|---|---|
| 1 | `You're all set!` | onboarding completion | `The ledger is open.` (or `The ledger is open, [Name].`) |
| 2 | `No debts added yet` | debt-optimizer empty-state | `The ledger is clear.` |
| 3 | `Upload a bank CSV to detect all your recurring charges automatically` | recurring topbar sub | `Lay your statements on the desk — every standing charge surfaces within moments.` |
| 4 | `🔥 Saves most money` / `⚡ Most motivating` | debt-optimizer strategy badges | `OPTIMAL` (amber) / `PROVEN` (teal), JetBrains Mono small-caps |
| 5 | `Add your first stock, ETF, or crypto using the form to start tracking live prices.` | portfolio empty | `Record your first position — equities, funds, or other instruments — and the portfolio begins its account.` |
| 6 | `Loading your goals…` | goals topbar sub | `Your objectives, drawn in ink.` |
| 7 | `All your activity in one place` | history topbar sub | `The full record, entry by entry.` |
| 8 | `A taste of Pro` | scenarios eyebrow | `Scenarios · Pro feature` (net-worth pattern) |
| 9 | `Same product as Free; more rope.` | scenarios invitation | `The same instrument, with more range.` |
| 10 | `Add your debts below to get started` | debt-optimizer topbar sub | `Enter each obligation — the optimizer orders them by cost.` |

## Top 5 art-copy mismatches

1. **debt-optimizer empty-state**: snuffed match + PAID envelope = "completion" symbolism, placed AT ENTRY before any debt added — inverted. Move to post-payoff state; use compass-on-paper for entry.
2. **blog-50-30-20 hero**: ceramic jars with printed NEEDS/WANTS/SAVE labels = text-in-image, violates brief. Re-shoot with three unlabeled porcelain bowls at different fill levels.
3. **blog-index-funds hero**: pastoral wheat field = no leather/brass/paper/velvet/walnut. Translate haystack metaphor into desk register: jar of mixed grain seeds on ledger paper with letterpress `MARKET INDEX` card.
4. **debt-optimizer strategy buttons**: 🔥/⚡ emoji on velvet-and-brass surface = clashing design system. Replace with JetBrains Mono small-caps.
5. **scenarios empty-state**: brass dividers on nautical chart placed BELOW the Pro upsell — instrument-behind-glass effect. Move ABOVE upsell with Fraunces italic caption *"Navigating from where you stand."*

## Three rules to codify in STYLE-GUIDE.md

**Rule 1 — The Eyebrow Mandate**
Every section opens with a JetBrains Mono small-caps eyebrow (gold `#D4AF6A`, letter-spacing 0.18em, `CATEGORY · SUBJECT` format) before the h1/h2. Functional system labels (`About you`, `Loading…`) prohibited in eyebrow position.

**Rule 2 — The Empty-State Register**
Ledger metaphor only. Ledger can be *clear / unwritten / open / waiting* — never *empty yet / not added yet*, never `get started`. Acceptable: `The ledger is clear.` / `No entry on record.` CTA button that follows may be functional (`Add the first entry`).

**Rule 3 — The Emoji & Badge Prohibition**
Zero emoji anywhere in product UI (buttons, badges, strategy selectors, status chips). Colour-coded JetBrains Mono badges only (`OPTIMAL`, `PROVEN`, `PRO ONLY`, `BETA`). Permitted decorative marks: PFC brand diamond, typographic em-dash.
