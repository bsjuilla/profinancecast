# Net-worth page deep audit — 2026-05-24

**Scope:** `net-worth.html` + `js/inline/net-worth-1.js` + `js/inline/net-worth-2.js` + `js/inline/net-worth-3.js`
plus every file that produces or consumes `localStorage.nw_history`:
- `js/inline/dashboard-2.js` (writer — auto-log + welcome-back nudge)
- `js/inline/history-2.js` (reader — net-worth tab)
- `js/pfc-storage.js` (encryption layer)

**Audit method (lens skills already deployed — no fixes applied):**
| # | Lens skill | Subagent | Findings |
|---|------------|----------|----------|
| 1 | Cross-dependency mapping | `general-purpose` | 5 cross-file integrity findings |
| 2 | Functionality + bug-hunt | `general-purpose` | 17 functional bugs |
| 3 | Design + perf + a11y | `general-purpose` | 22 design/perf/a11y findings |
| 4 | Mobile + compat + security | `general-purpose` | 18 mobile/compat findings, 6 security findings |
| 5 | CRO + worth-it | `general-purpose` | 12 conversion/retention findings |

Status: **AUDIT COMPLETE. NO FIXES APPLIED.** Awaiting operator approval per pattern established for landing + dashboard batches.

---

## Cross-dependency map (READ FIRST — this is how we avoid the dashboard regression)

The page reads/writes `localStorage.nw_history`, a 7-field array shared across **4 files**:

```js
// Producer schema (must remain stable):
{ date, netWorth, assets, savings, investments, debt, source }
//                                                          ^^ 'auto' | 'manual'
```

| File | Role | Caps history? | Notes |
|---|---|---|---|
| `dashboard-2.js:2155-2172` | Auto-log producer (IIFE at end) | **YES — 365** | Slices on every dashboard visit |
| `net-worth-2.js:52-73` | Auto-log producer (`logTodaySnapshot`) | **NO** | Called from `init()` + every onChange |
| `net-worth-2.js:437-463` | Manual-entry producer (`saveManualEntry`) | **NO** | Backfilled dates allowed |
| `net-worth-2.js:99-155` | Reader/renderer | n/a | Reads all 7 fields |
| `history-2.js:1973` | Reader (history tab) | n/a | Reads same key |
| `dashboard-2.js:1606` | Reader (welcome-back nudge) | n/a | Reads same key |

### THE LANDMINE (NW-XDEP-1, also surfaced as NW-BUG-3 and NW-WORTH-1)

> User logs a manual entry dated 2024-01-15 (backfill). It saves fine (no cap on `net-worth-2.js:455`).
> User opens dashboard tomorrow → `dashboard-2.js:2170` reads the array, slices to most recent 365, **silently drops the backfilled entry**.
> User returns to net-worth → entry is gone. **Trust event.**

This is the **#1 silent destroyer** on the page and it can only be seen by looking at all 4 files together.

### Script-load-order trap (mirror of dashboard PROD-FIX)

`net-worth.html` head currently loads `pfc-config`, `pfc-auth`, `pfc-storage`, `pfc-currency`, `pfc-user`, `pfc-entitlements` **SYNC** (lines 192–200). Bottom-of-body inline `net-worth-2.js` (line 580) is also SYNC. **So today the page is correct.**

🚨 **If we apply the same perf win we did to dashboard (defer head scripts) we MUST also add `defer` to `net-worth-2.js` AND `net-worth-3.js` in the same commit.** Otherwise we recreate DASH-PROD-FIX: the inline script runs while head scripts are still queued → `PFCStorage`/`PFCUser` undefined → empty page. The dashboard verification agents missed this; do not repeat the mistake.

---

## Findings table — P0 (launch-blocking quality / data-integrity)

| ID | Lens | File:line | What's broken | Recommended fix skill |
|---|---|---|---|---|
| **NW-P0-1** | Functionality + Xdep | `net-worth-2.js:455` & `dashboard-2.js:2170` | **Schema cap mismatch.** Net-worth writers don't cap; dashboard writer caps at 365. Manual backfill entries → silently truncated. Data loss. | `using-superpowers` (data-integrity reasoning) → `focused-fix` to unify cap behind one helper, OR remove the cap entirely if Pro/Founders are promised forever |
| **NW-P0-2** | Functionality | `net-worth-2.js:480-486` + `537-538` | **`clearHistory` immediately re-logs.** `clearHistory` calls `PFCStorage.remove → renderAll`; the `PFCUser.onChange` subscriber at L537 fires nothing on its own, BUT `_rehydrateFromStorage` (L514) calls `logTodaySnapshot()` which re-writes today's entry from USER data. Net effect: "Clear all" appears to work, then on next user event the row reappears. User reports as ghost data. | `verification-before-completion` (manual trace) → `focused-fix` (guard with cleared-flag or skip `logTodaySnapshot` inside rehydrate when called from clear path) |
| **NW-P0-3** | Security | `net-worth-2.js:240-245` (history table) + `212-217` (milestones) | **Stored-XSS via `nw_history`.** `h.source`, `m.label`, `m.emoji`, `m.hint` are all interpolated into `innerHTML` without escape. `source` field is user-controllable via direct `localStorage` write (any XSS in any other PFC page can land payload here, and it will render on every visit). | `ruflo-security-audit:audit` (when unblocked) OR `using-superpowers` + `focused-fix` to escape with same `_esc()` helper pattern used in `dashboard-3.js:11-14` |
| **NW-P0-4** | Mobile | `net-worth.html:35-36`, `54`, `71` | **No mobile breakpoint at all.** Sidebar `width:240px` + main `flex:1` + content `padding:28px` + 4-col strip. Under ~900px the sidebar covers half the viewport. Touch targets on period tabs are 5×12px (line 87). This is worse than the dashboard's pre-P0-2 state — at least dashboard had a stale mobile-broken sidebar; net-worth has nothing. | `using-superpowers` (mobile-first reasoning) → `focused-fix` to graft dashboard's P0-2 sidebar-drawer pattern verbatim |
| **NW-P0-5** | A11y | `net-worth.html:421` | **Chart canvas has no a11y fallback.** Screen-readers get nothing. No `aria-label`, no `<table>` fallback, no `figure+figcaption`. WCAG 1.1.1 fail. Goals page Chart.js already has this pattern (precedent exists). | `using-superpowers` (a11y reasoning) → `focused-fix` (role="img" + aria-label summary + sr-only table fallback) |
| **NW-P0-6** | Xdep + Perf | `net-worth.html:580, 582` | **PROD-FIX trap.** Same as DASH-PROD-FIX. If we defer head scripts for LCP we MUST also defer these. Currently safe ONLY because everything is sync. Document this in the commit message of any perf change. | `verification-before-completion` (execution-order trace) — applied during fix, not as a finding |

## Findings table — P1 (correctness, polish, perf)

| ID | Lens | File:line | What's broken | Recommended fix skill |
|---|---|---|---|---|
| **NW-P1-1** | Functionality | `net-worth-2.js:64-68` vs `453-455` | **Same-day auto vs manual entries coexist.** `logTodaySnapshot` finds `date+source='auto'`; `saveManualEntry` finds `date+source='manual'`. If user manually logs today and also auto-log fires, **both rows exist** with different netWorth values. History table shows duplicates. | `focused-fix` (per-day uniqueness — manual wins; or render only the latest source per date) |
| **NW-P1-2** | Functionality | `net-worth-2.js:61, 287, 412` | **Timezone cutoff bug.** `new Date().toISOString().slice(0,10)` uses UTC. A user in UTC-7 opening the dashboard at 9pm local sees tomorrow's date. "1m" period cutoff has the same issue. | `focused-fix` (replace with local-date helper used elsewhere in the codebase if one exists) |
| **NW-P1-3** | Functionality | `net-worth-2.js:255-263` | **Monthly-gain projection goes more negative.** `monthlyGain = income - expenses`. If user has surplus = -200 (spending more than earning), `projected = nw + (-200)*60 = nw - 12000` and is displayed as a "projection." Negative trajectories should be flagged + capped at 0 / break-even messaging, not shown as a linear nosedive. | `using-superpowers` (UX reasoning — "ledger forecasting must not depress users beyond reality") → `focused-fix` |
| **NW-P1-4** | Security | `net-worth-2.js:466-477` | **CSV formula injection.** `exportCSV` joins cells with `,` and writes raw. If user enters source/notes containing `=cmd|'/c calc'!A1` it executes when opened in Excel. Per OWASP CSV-injection guidance, prefix `=+-@\t\r` cells with `'`. Currently low-risk because `source` is only `'auto'`/`'manual'`, but `date` could be user-controlled via manual entry input. | `ruflo-security-audit:audit` (when unblocked) → `focused-fix` (sanitize-cell helper) |
| **NW-P1-5** | Security | `net-worth.html:192` | **No SRI on Supabase CDN.** `@supabase/supabase-js@2` is loaded sync without `integrity`. If CDN is compromised, attacker has full access to user data on every PFC page that loads this. Chart.js (L29) and Sentry (L208) DO have SRI — Supabase is the only naked CDN script. | `focused-fix` (pin version + add SRI hash) |
| **NW-P1-6** | Functionality | `net-worth-2.js:481` | **`confirm()` bricks iOS PWA.** Standalone-mode Safari has limited `confirm()` support; on some versions the prompt is invisible. Replace with custom modal (one already exists for manual entry — reuse the pattern). | `focused-fix` |
| **NW-P1-7** | Perf | `net-worth.html:192-217` | **11 render-blocking head scripts.** Same LCP impact as dashboard pre-fix. **BUT** see NW-P0-6 — must defer net-worth-2.js + net-worth-3.js in the same commit. | `using-superpowers` (defer-race reasoning) → `focused-fix` (one atomic commit) |
| **NW-P1-8** | A11y | `net-worth.html` | Missing skip-link, no `<h1>` until the hero (page title is in a `div`), period buttons lack `aria-pressed`, modal inputs lack `<label for=>`, no `aria-live` on the topbar-sub that updates with current NW, focus trap in modal missing. | `focused-fix` (apply DASH-P1-1..3 patterns from dashboard fix batch) |
| **NW-P1-9** | Mobile/Compat | `net-worth.html:33, 36, 54, 57` | `height:100vh` (no `dvh` fallback for iOS bar resize), `-webkit-backdrop-filter` missing on `.topbar`, no `env(safe-area-inset-*)` for iOS notch, no `prefers-reduced-motion` override for `.toast` animation, no forced-colors media query, no print stylesheet (high value here — users may want to print net-worth report). | `focused-fix` (apply DASH-P2 compat patterns verbatim) |
| **NW-P1-10** | Perf | `net-worth-2.js:299-407` | **Chart.js init unguarded.** If Chart.js CDN fails (firewall, offline-PWA), `renderChart` throws and breaks subsequent renders. Wrap in `if (typeof Chart === 'undefined') { canvas.replaceWith(noChartFallback); return; }`. | `focused-fix` |
| **NW-P1-11** | CRO/Worth-it | `net-worth.html:344-363` | **Empty-state lacks "why bother" narrative.** Current copy: "Your timeline starts the moment you log your first snapshot." OK editorially but doesn't answer "what will I see after 3 months / 6 months / 1 year?" — the chart is the value-prop and they can't see it. Add 1 example screenshot (could be `assets/img/photos/`) or a 3-line "Here's what month 3 looks like" preview. | `using-superpowers` (CRO reasoning) → `focused-fix` (add preview block) |
| **NW-P1-12** | Functionality | `net-worth-2.js:191-222` | **Milestone $-amounts are hard-coded USD.** EUR/GBP/MUR users see `$1,000`, `$5,000` etc as labels even though their currency symbol is `€`/`£`/`₨`. The `sym` variable IS used for "X to go" hint (line 212) but not for the label itself (line 211). | `focused-fix` (refactor `MILESTONES` `.label` to a function or strip the `$` and use sym) |

## Findings table — P2 (polish, brand voice, conversion gains)

| ID | Lens | File:line | What's broken | Recommended fix skill |
|---|---|---|---|---|
| **NW-P2-1** | Design | `net-worth-2.js:8-18, 209, 212` | **Emoji icons clash with editorial voice.** Page brand is "The Archive" + Fraunces italic + leather-ledger hero. Then milestones use 🎯🌱⚡🔥💪🚀💯👑🏆💎. Either replace with SVGs (matches dashboard nav) or keep them but acknowledge they're playful counterpoint. | `using-superpowers` (brand reasoning) → `focused-fix` |
| **NW-P2-2** | Design | `net-worth-2.js:330, 345, 357, 374-381` | **Hex literals in Chart.js.** Same anti-pattern fixed in dashboard via `Chart.defaults`. Tokens drift now possible. | `focused-fix` (apply `_brandChartDefaults` IIFE pattern from dashboard-2.js) |
| **NW-P2-3** | Design | `net-worth.html` throughout | **50+ inline styles** in markup (`style="..."` on rows, period tabs, metric cards, milestone items, projection rows). Maintenance burden + CSP `style-src` requires `'unsafe-inline'` to keep working. | `focused-fix` (extract to `pfc-photos.css` companion or page-specific class block) |
| **NW-P2-4** | CRO | `net-worth-2.js:111-142` | **No ATH (all-time-high) line on chart.** The most retention-driving metric on a wealth tracker is "you're at your highest ever" — currently invisible. Add horizontal annotation at `max(history.netWorth)`. | `focused-fix` (Chart.js annotation plugin OR overlay div) |
| **NW-P2-5** | CRO | `net-worth-2.js:443` | **No celebration when milestone is hit.** Crossing $10k/$25k/$100k is THE moment to drive retention. Currently the badge silently flips from "57%" to "✓ Reached" between sessions. Confetti / toast / share-card opportunity. | `using-superpowers` (CRO reasoning) → `focused-fix` |
| **NW-P2-6** | CRO | `net-worth-2.js:466-477` | **Pro/Free CSV export undifferentiated.** Landing says Pro gets "advanced exports". Currently both tiers get identical CSV. Either remove the promise from landing or differentiate (Pro gets monthly aggregates / PDF / cover sheet). | `using-superpowers` (entitlement-promise reasoning) → cross-team product decision before code |
| **NW-P2-7** | CRO | `net-worth.html:494-532` | **Projected-growth card outranks history table.** Forward-looking value is good for dashboard ("what will I have?") but THIS page is the archive ("what did I have?"). The retrospective view should win above-the-fold below the chart. | `focused-fix` (swap grid order) |
| **NW-P2-8** | Worth-it | `net-worth.html:365-391` summary strip | **3 of 4 KPIs restate the chart.** Current NW / Total assets / Total liabilities / All-time growth — first three are visible at chart end. Replace 2 with: "Days tracked" + "ATH" or "Best month delta" + "Current streak". | `using-superpowers` (KPI density reasoning) → `focused-fix` |

---

## NW-WORTH-1 — entitlement promise gap (cross-page issue, worth its own section)

**Landing page (`index.html`) promises:**
- Free: "tracks net worth history" (no cap stated)
- Pro: "forever history" / "unlimited data points"
- Founders: "everything Pro, forever"

**Reality in code:**
- `dashboard-2.js:2170` slices to 365 entries for **every plan** — Pro pays for forever, gets 1 year
- `net-worth-2.js` writers have **no cap**, so they preserve everything until the next dashboard visit nukes them

**Implications:**
- Pro/Founders users are sold a promise the code violates
- Free users get inconsistent behaviour depending on which page they last visited
- Data-loss path for backfill is real (see NW-XDEP-1 landmine)

**Required decision before code fix:**
1. Make the cap entitlement-aware (Free=365, Pro/Founders=unlimited)
2. OR remove the cap entirely (storage cost is trivial — 365 entries × 100 bytes = 36KB, even 10 years = 360KB)
3. OR adjust the landing copy to match reality (worst option)

Recommend option 2 (remove cap). Reasoning: storage is encrypted via `pfc-storage.js` which re-encrypts the full payload on each write, so cap is actually a CPU/encryption-cost concern not storage. At 3,650 entries (10 years), encryption is still sub-millisecond on a modern device. The cap was almost certainly added as an over-cautious guess and is now causing more harm than good.

---

## Recommended skill workflow for the fix batch (mirrors dashboard pattern)

1. **`using-superpowers`** — frame each fix with the lens-specific reasoning (data-integrity for P0-1/2, security for P0-3, mobile-first for P0-4, etc.)
2. **`focused-fix`** — single-file targeted edits per finding
3. **`writing-plans`** — for any fix touching cross-page state (NW-P0-1, NW-WORTH-1) write a 1-paragraph plan before editing
4. **`verification-before-completion`** — after each P-batch, dispatch an independent `general-purpose` agent to re-trace execution order and confirm no regressions
5. **`ruflo-security-audit:audit`** — final security pass on the closed batch (when unblocked; substitute inline ruflo trail check if blocked)

**Pre-flight checklist before each commit (lessons from DASH-PROD-FIX):**
- [ ] If touched `<script>` tags in head/body → trace defer-vs-sync execution order
- [ ] If touched `nw_history` schema → grep all 4 producer/consumer files for field names
- [ ] If touched `innerHTML` → confirm `_esc()` applied to every user-controlled field
- [ ] Static review missed DASH-PROD-FIX — for any execution-order change, ALSO test in browser (or describe the test plan the user must run)

---

## Suggested batching for fix-application (when user approves)

**Batch P0 (apply first, single commit per group):**
- **Group A (data integrity):** NW-P0-1 (schema cap unify) + NW-WORTH-1 decision (remove cap)
- **Group B (clear regression):** NW-P0-2 (clearHistory ghost)
- **Group C (security):** NW-P0-3 (stored-XSS escape)
- **Group D (mobile):** NW-P0-4 (sidebar drawer + breakpoint)
- **Group E (a11y):** NW-P0-5 (chart fallback)
- (NW-P0-6 is enforcement discipline, not its own commit)

**Batch P1 (after P0 verified):**
- Group F: NW-P1-1, P1-2, P1-3 (functionality)
- Group G: NW-P1-4, P1-5 (security)
- Group H: NW-P1-7 (perf + defer race) — single atomic commit
- Group I: NW-P1-8, P1-9, P1-10 (a11y + compat)
- Group J: NW-P1-11, P1-12 (CRO + currency)

**Batch P2 (polish):**
- Group K: NW-P2-1..3 (design)
- Group L: NW-P2-4, P2-5, P2-7, P2-8 (CRO)
- Group M: NW-P2-6 (entitlement product decision — not a code fix alone)

**Awaiting operator approval to proceed to Batch P0.**
