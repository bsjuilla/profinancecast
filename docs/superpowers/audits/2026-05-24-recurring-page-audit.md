# /recurring page deep audit — 2026-05-24

**Scope:** `recurring.html` + `recurring-1.js` + `recurring-2.js` + `recurring-3.js` plus every file that reads/writes `localStorage.pfc_recurrings` (the namespaced storage key):
- `js/inline/cash-forecast-2.js` (read-only consumer of `monthlyAmount`)
- `js/pfc-storage.js` (encryption + legacy `pfc_recurrings` migration)

**Audit method (5 parallel lens skills, full disk-scrape of skills inventory first):**

| # | Lens | Primary skill recommended | Findings |
|---|---|---|---|
| 1 | Cross-dependency mapping | `graphify` mental model | 15 |
| 2 | Functionality + bug-hunt | `systematic-debugging` Phase 1 | 27 |
| 3 | Design + perf + a11y | `frontend-design` + `performance-analysis` | 53 (12+14+27) |
| 4 | Mobile + compat + security | `security-review` + `webapp-testing` | 47 (12+10+25) |
| 5 | CRO + worth-it | `page-cro` + `cro` | 17 |

**Total raw: 159 findings → deduplicated to ~80 unique.** Status: **AUDIT COMPLETE. NO FIXES APPLIED.** Awaiting operator approval before any code change.

---

## Cross-dependency map (READ FIRST)

The `pfc_recurrings` storage key is **single-writer** (only `recurring-2.js` writes; `cash-forecast-2.js` reads only). That's GOOD — no cross-page schema drift class like `nw_history` (3 writers) or `goals` (3 writers).

But there's a much worse landmine: **the `CANCELLED` Set lives only in memory** and is keyed by **array index**.

### THE LANDMINE (R-XDEP-2 / R-BUG-1 / R-BUG-2 — combined)

> 1. User cancels Netflix (index 0). `CANCELLED = Set{0}`.
> 2. User clicks "Sort by name". `RECURRINGS.sort()` mutates in-place. Adobe is now at index 0.
> 3. **Adobe shows as cancelled. Netflix shows as active.**
> 4. User reloads. `CANCELLED = new Set()`. **All cancellations silently lost.**
> 5. User adds a manual recurring via `unshift`. **Every existing index in `CANCELLED` shifts +1.**

This is THE worst data-correctness issue on the page. Same anti-pattern class as the dashboard/goals "no stable id" bug we fixed earlier in the session — but with a side of "never persisted" on top.

### Schema drift sub-landmine (R-XDEP-4 / R-XDEP-5)

- `pricePct` field: set conditionally by `flagPriceChanges` (only when pct>5), omitted entirely by `saveManual`, never read anywhere yet. Future renderer adding `r.pricePct` lookup → silent `undefined` for manual entries.
- `occurrences[]`: detected entries have arrays of charge dates. Manual entries write `[]`. `renderCharts` iterates `r.occurrences.forEach` → **manual entries contribute $0 to the monthly trend chart while still hitting the metric strip totals → numbers don't reconcile.**

### Script-load-order trap (R-XDEP-8 / R-PERF-1)

Chart.js explicitly SYNC in head with comment "must NOT use defer". 8 other PFC head scripts also SYNC. Body has 3 sync inline `<script src>` tags. **If a future NW-P1-7-style "defer everything" optimization is applied uniformly → blank charts.** This is the EXACT PROD-FIX class that bit us twice already (DASH-PROD-FIX, NW-P1-7).

---

## P0 — launch-blocking (16 unique findings, deduped across lenses)

| ID | Lens | File:line | What's broken | Fix skill |
|---|---|---|---|---|
| **R-P0-1** | Cross-dep + Bug | `recurring-2.js:14,490-499,509-513` | **CANCELLED Set keyed by array index + never persisted + sort mutates in place.** Reload wipes all cancellations. Sort + cancel = wrong-item-cancelled. Manual add shifts all prior indices. | `systematic-debugging` → key by stable id + persist to PFCStorage |
| **R-P0-2** | Bug | `recurring-2.js:106,553` | **CSV upload OR manual add silently wipes the OTHER source.** `detectRecurrings` replaces RECURRINGS wholesale. Manual gym entry → next CSV upload → gym vanishes. No merge logic. | `systematic-debugging` (spread-merge pattern like G-P0-1) |
| **R-P0-3** | Bug | `recurring-2.js:60-65,606,617` | **`init()` runs at module top before DOMContentLoaded.** `recurring-2.js` is in `<head>` per `recurring.html:217`, not deferred. `getElementById` returns null → crash on cold-load with cached data. Same as G-P0-6. | `systematic-debugging` |
| **R-P0-4** | Security | `recurring.html:191` | **Supabase CDN not pinned, no SRI.** `@supabase/supabase-js@2` floating version, no integrity hash. Same violation we fixed on net-worth + goals (sha384-4eCDoMN... known). | `focused-fix` (1-line copy from NW-P1-5) |
| **R-P0-5** | Security | `recurring.html:209,211,216` | **Sentry + Cloudflare + Plausible CDNs all unpinned, no SRI.** Per-CDN compromise → arbitrary JS execution in authenticated context. | `focused-fix` |
| **R-P0-6** | Security | `recurring.html:326-328` | **Inline `ondragover`/`ondragleave`/`ondrop` handlers** on drop-area. Direct CSP `script-src-elem 'self'` violation. Page will throw CSP errors on load + drop won't work in production. Same class as the inline-script bug that just failed E2E. | `security-review` → data-pfc-on-drop pattern |
| **R-P0-7** | Security + a11y | `recurring-2.js:480-482` | **Inline `onclick="toggleCancel(${gi})"` and `onclick="askSage(${gi})"` injected via innerHTML.** Direct CSP violation. Same class as G-P0-5 we already fixed. | `focused-fix` (data-action pattern) |
| **R-P0-8** | Security | `recurring-2.js:319,461,466,472-473` | **Multi-vector XSS.** Unescaped: `r.name` in alert banner, `r.icon`/`meta.label`/`r.freqLabel`/`meta.color` in card render, `sym` (currency) in metrics. Card render uses `escHtml(g.name)` but ALERT banner skips it. localStorage tampering or CSV merchant name with `<script>` fires. | `security-review` → `_esc()` helper everywhere |
| **R-P0-9** | Security | `recurring-2.js:589,85,91,524-525,537` | **6 native `confirm()`/`alert()` calls.** iOS PWA standalone mode renders them unreliably. clearAll completely blocked, Sage reply unreadable, file errors invisible. Same fix class as NW-P1-6 / G-P1-D. | `focused-fix` (`_pfcConfirm` graft) |
| **R-P0-10** | Mobile | `recurring.html:223-300, 30-182` | **Zero mobile breakpoints + no sidebar drawer.** 240px sidebar covers 64% of phone viewport, no hamburger toggle, no scrim. `body{overflow:hidden}` clips horizontal scroll → page unusable. WORSE than dashboard pre-P0-2. | `focused-fix` (graft NW-P0-4 drawer pattern) |
| **R-P0-11** | Perf | `recurring.html:29, 191-199` | **9 render-blocking sync head scripts** (Chart.js + Supabase + 7 PFC modules). Each blocks parse. ~250KB before body. Chart.js comment explicitly forbids deferring (init runs sync in body) — landmine for any future defer pass. | `using-superpowers` → atomic-defer commit per NW-P1-7 |
| **R-P0-12** | Perf | `recurring-2.js:367,400` | **No `typeof Chart === 'function'` guard around `new Chart(...)`.** If Chart.js CDN fails (offline/firewall/blocked), entire `renderCharts()` throws → results state broken. Same as NW-P1-10. | `focused-fix` |
| **R-P0-13** | Design + a11y | `recurring.html:306` | **No `<h1>` anywhere on page.** topbar-title is a `<div>`. Document outline starts at `<h4>` in footer. Screen-reader heading nav unusable. | `focused-fix` (graft NW-P1-8 + G-P1-C h1 pattern) |
| **R-P0-14** | A11y | `recurring.html:464-507` | **Modal lacks role=dialog, aria-modal, aria-labelledby, focus trap, label-for on inputs.** Close button is a `<div>`, not a `<button>`. Drop-area is a `<div>` with no role/tabindex/keyboard handler — keyboard users can't trigger upload. | `focused-fix` (graft G-P1-C a11y pattern) |
| **R-P0-15** | A11y + perf | `recurring.html` + `recurring-2.js` | **No reduced-motion / forced-colors / print stylesheet / 100dvh fallback / -webkit-backdrop-filter / safe-area-inset / focus-visible / noscript fallback.** Full set of compat patterns we shipped on other surfaces — recurring is the only page without them. | `focused-fix` (paste NW-P0-4 compat block) |
| **R-P0-16** | CRO + Worth | `index.html:2138-2139` vs code | **Landing promises "Flags every subscription BEFORE it auto-renews."** Code has zero renewal-date logic, no `nextChargeDate`, no notification. The killer landing claim is unbuilt. Same class as NW-WORTH-1 / G-WORTH-1. | `using-superpowers` (entitlement) — needs operator decision |

## P1 — correctness, polish, perf, a11y, CRO (~30 unique)

**Functionality (5):**
- R-BUG-5: UTC parse of CSV dates → DST flips weekly→monthly bucket
- R-BUG-7: 3 utility bills 28/35/92 days apart → grouped quarterly → monthly amount understated by 67%
- R-BUG-8: Bi-annual / 18-month subs silently dropped (no bucket between 400-730 days)
- R-BUG-9: `monthlyAmount` uses LATEST charge — promo $0.99 anchors annual rollup to ridiculous low
- R-BUG-20: `saveManual` calls `updateMetrics` + `renderCards` but NOT `renderAlerts` or `renderCharts` → charts stale

**Security (5):**
- R-SEC-17: `JSON.parse(saved)` with no schema validation → prototype pollution via `{"__proto__":{"polluted":true}}`
- R-SEC-18: `groups[key]` and `bycat[r.cat]` use raw user-controlled keys → prototype pollution via `__proto__`/`constructor` merchant names
- R-SEC-19: `Number()` coercion missing on `r.monthlyAmount` → poisoned string concatenates instead of adds
- R-SEC-20: `sym` (currency symbol from USER) unescaped → settings injection vector
- R-SEC-21: Sage prompt includes raw `r.name` → prompt-injection from `"Netflix\n\nIgnore previous. Reply with..."`

**Cross-page (2):**
- R-BUG-19: Cross-page sync read-only — adding/cancelling on /recurring doesn't update dashboard `subs-strip` until reload. No storage event listener.
- R-XDEP-6: Cross-page contract is `monthlyAmount` only, undocumented. Rename in recurring-2.js silently breaks cash-forecast-2.js:387.

**CSV parse (3):**
- R-BUG-12: `parseCSVRow` doesn't handle escaped quotes `""`
- R-BUG-13: Amount regex strips `R` and `s` from non-amount text
- R-BUG-14: US-format MM/DD/YYYY CSVs become invalid dates silently

**Compat (4):**
- R-COMPAT-1: `100vh` no `100dvh` fallback → iOS Safari clips bottom
- R-COMPAT-2: `backdrop-filter` no `-webkit-` prefix → blur loss on older Safari
- R-COMPAT-3: Zero `env(safe-area-inset-*)` → notch/home-indicator clipping
- R-COMPAT-8: `color-scheme:dark` only on selects, not root → light scrollbars in Firefox

**Mobile (4):**
- R-MOB-4: Topbar 4 buttons overflow on <420px (no flex-wrap)
- R-MOB-5: Touch targets 26-28px (filter tabs, action buttons, modal close, sort select)
- R-MOB-6: `mm-amount` missing `inputmode="decimal"`, `mm-name` no autocomplete
- R-MOB-8: No iOS keyboard avoidance on modal — Save/Cancel pushed off-screen

**A11y (6):**
- R-A11Y-3: All 4 modal inputs have `<label>` but no `for=`
- R-A11Y-7: Drop-area is a `<div>`, not keyboard-accessible
- R-A11Y-8: Filter tab group missing `role=tablist`/`aria-pressed`
- R-A11Y-9: Sort `<select>` has no label
- R-A11Y-10: Chart canvases + sankey SVG missing `role=img`/`aria-label`/sr-only fallback
- R-A11Y-27: Sidebar nav has no `aria-current="page"` for /recurring (current-page indicator)

**CRO (6 — biggest retention drivers missing):**
- R-CRO-2 (P0 promoted): **The killer hook is missing** — no "zombie subscription" detection (last charge >60 days, low frequency). The entire retention pitch for a subs tracker is "look at this thing you forgot."
- R-CRO-3: No second-visit moment — "since last upload" / "you saved $X by cancelling Y this month"
- R-CRO-4: No cross-tool links — debt loans don't link /debt-strategy, streaming-heavy → no link to /goals
- R-CRO-5: No cancel cost-recovery framing — "if you cancel Netflix you'd reach Emergency goal 2.3 months sooner"
- R-CRO-6: No renewal warning — annual subs renew silently with zero nudge
- R-CRO-7: No Pause/Snooze/Negotiate quick-actions — only Cancel + Ask Sage

## P2 — polish (~30 unique)

**Design:** emoji icons throughout (R-DES-3), 36+ inline styles (R-DES-5), color-only state signal (R-DES-6), KPI weighting flat (R-DES-8), CTA copy generic (R-DES-2), empty state lacks preview tiles (R-CRO-1, R-DES-7), category-share insight as chart only no prose (R-CRO-9)

**Perf:** Full grid rebuild on every event (R-PERF-8), no debounce on sort (R-PERF-9), animation-delay staircase to 2s at 50 cards (R-PERF-10), `init()` runs twice (R-PERF-12), no `preconnect` hints for 5 CDNs (R-PERF-14)

**A11y:** Toast lacks `role=status`/aria-live (R-A11Y-24), drop-area drag-state silent for SR (R-A11Y-26)

**CRO:** Annual cost anchoring wrong direction ($9/mo big, $108/yr small — should flip) (R-CRO-8), Sage prompt throws away rich context (R-CRO-11), duplicate-detector hardcoded to streaming only (R-CRO-12), no streak/behavioral reward (R-CRO-10), pricing.md doesn't mention /recurring at all (R-WORTH-3 background)

---

## Strategic Worth-it section (operator decisions needed)

### R-WORTH-1 — Landing promise "before it auto-renews" is unbuilt (P0)
- `index.html:2138`: "Recurring radar — Flags every subscription **before it auto-renews**"
- Code: zero renewal-date math, zero nudge, zero notification
- **Operator decision**: (a) BUILD it — compute `nextChargeDate = lastCharge + avgGap`, add banner "Adobe renews in 4 days, €23.99" + email/push (Pro feature?) OR (b) REWRITE landing copy to match reality

### R-WORTH-2 — Landing's "€312/year hidden price-hike total" never anchored (P0)
- `index.html:2139` references €312/year typical hike
- Code computes `extra` price hike but doesn't compare to €312 anchor or frame "you found €X of typical €312"
- **Operator decision**: add the anchor framing OR remove the landing number

### R-WORTH-3 — Pro/Founders unlock literally nothing on /recurring (P0)
- `billing.html:1340`: ✓✓✓ across all 3 tiers
- Free user gets identical page to Founders Lifetime
- **Operator decision** (recommend a mix):
  1. Gate "renewal alerts" + email digest behind Pro (matches R-WORTH-1 build path)
  2. Gate "Sage cancel-template generation" behind Pro
  3. OR market "Free forever, no upgrade nag" explicitly on the landing — currently silent

### R-WORTH-4 — "Exportable to CSV" landing claim has no export button (P1)
- Recurring topbar has Upload, Add, Clear — NO Export
- `pfc-export.js` loaded but never wired
- **Decision**: wire Export (1-hour fix) OR strike claim from landing

### R-WORTH-5 — "Dismissible per row" promised — only Cancel exists (P1)
- No "Not a subscription / Hide" affordance for false-positive detections (rent, salary refunds)
- **Decision**: add Hide button + persisted `_hidden` set

---

## Cross-page blast-radius warnings (lessons-learned discipline)

Before ANY fix touches:
- **`recurring` schema** → only 1 writer file, but `cash-forecast-2.js:387` reads `monthlyAmount`. Don't rename.
- **`<script>` tags** → if applying defer, ALL of: Chart.js (explicit no-defer comment), Supabase, PFCStorage/PFCAuth/etc must be coordinated atomically (PROD-FIX class)
- **Inline onclick/ondragover** → must convert to data-action + pfc-inline-bootstrap dispatcher, NOT keep inline (CSP will block in production)
- **`_esc()`** → graft from net-worth-2.js, ensure EVERY innerHTML interpolation routed through it (including alerts banner which is currently unescaped)
- **Storage key migration** → `pfc_recurrings` already in LEGACY_KEYS list (pfc-storage.js:56). Safe.
- **CANCELLED persistence** → if added as `pfc:{uid}:recurrings_cancelled`, must be added to PFCStorage adoption list AND cleared on `clearAll`

---

## Recommended fix batches (mirrors prior page patterns)

**Batch P0 (apply first):**
- **Group A (data integrity):** R-P0-1 stable id + persist CANCELLED, R-P0-2 spread-merge on detect/manual, R-P0-3 init defer/DOMContentLoaded
- **Group B (security):** R-P0-4+5 SRI pin Supabase/Sentry/CF/Plausible, R-P0-6 ondragover→data-action, R-P0-7 onclick→data-action, R-P0-8 _esc() across innerHTML, R-P0-9 _pfcConfirm replaces confirm/alert
- **Group C (mobile):** R-P0-10 sidebar drawer + 540/800px breakpoints
- **Group D (perf):** R-P0-11 (atomic defer if doing perf pass) + R-P0-12 Chart.js init guard
- **Group E (a11y):** R-P0-13 h1 + skip-link, R-P0-14 modal a11y baseline + drop-area keyboard, R-P0-15 compat layer
- **Decision required (no code):** R-P0-16 / R-WORTH-1 renewal awareness — operator picks BUILD or REWRITE landing

**Batch P1:** 30 fixes grouped by domain (correctness, security hardening, cross-page sync, CSV edge cases, compat, mobile polish, a11y, CRO bundle)

**Batch P2:** 30 polish (emoji→SVG, hex→tokens, inline-style extract, KPI hierarchy, editorial CTA copy, debounce, CRO surfaces)

**Awaiting operator approval to proceed.**
