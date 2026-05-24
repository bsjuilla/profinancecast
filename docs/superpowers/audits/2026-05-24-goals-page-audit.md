# Goals page deep audit — 2026-05-24

**Scope:** `goals.html` + `js/inline/goals-1.js` + `js/inline/goals-2.js` + `js/inline/goals-3.js` plus every file that touches `localStorage.goals` (namespaced `pfc:{uid}:goals`):
- `js/inline/dashboard-2.js` (alternate writer/reader — dashboard mini-goals widget)
- `js/inline/onboarding-2.js` (initial goal seeding from onboarding wizard)
- `js/inline/sage-3.js` (reads goalsCount for context)
- `js/inline/recurring-2.js`, `settings-2.js`, `portfolio-main.js`, `report-card-3.js` (no direct touches confirmed)
- `js/pfc-storage.js` (encryption namespace adoption layer)

**Audit method — 5 parallel lens skills already deployed:**
| # | Lens | Agent | Findings |
|---|---|---|---|
| 1 | Cross-dependency mapping | `general-purpose` | 12 cross-page landmines |
| 2 | Functionality + bug-hunt | `general-purpose` | 30 functional bugs |
| 3 | Design + perf + a11y | `general-purpose` | 35 findings (10 + 10 + 15) |
| 4 | Mobile + compat + security | `general-purpose` | 33 findings (9 + 9 + 15) |
| 5 | CRO + worth-it | `general-purpose` | 19 retention/value findings |

**Total: ~129 raw findings, deduplicated to ~70 unique.** Status: **AUDIT COMPLETE. NO FIXES APPLIED.** Awaiting operator approval.

---

## Cross-dependency map (READ FIRST — same landmine class as nw_history)

The goals storage key is **read or written by 4 files** with **inconsistent schemas** — this is more fragmented than the nw_history situation we just fixed.

### Goal schema (drifted across writers)

| Field | onboarding-2 | goals-2 | dashboard-2 | Risk |
|---|:-:|:-:|:-:|---|
| `name` | ✓ | ✓ | ✓ | |
| `target` | ✓ | ✓ | ✓ | |
| `current` | ✓ | ✓ | ✓ | |
| `color` | – | ✓ | ✓ | dashboard edit destroys if goals.html set custom color |
| `category` | – | ✓ | ✗ destroys | **silent loss** on dashboard edit |
| `targetDate` | – | ✓ | ✗ destroys | **silent loss** on dashboard edit |
| `monthlyNeeded` | – | ✓ | ✗ destroys | **silent loss** on dashboard edit |
| `boost` | – | ✓ | ✗ destroys | **silent loss** on dashboard edit |
| `id` | – | ✗ | ✓ | **goals.html never mints id** → dashboard backfills → edit/delete from dashboard fails if user edits via goals.html in between |
| `key` | ✓ | – | – | dead field — onboarding writes it, nobody reads |

### The LANDMINE chain (G-XDEP-1)

> 1. User onboards → onboarding-2 writes `{key, name, target, current}` (no id)
> 2. User opens dashboard → `loadGoals` backfills `id` for each goal
> 3. User opens goals.html → adds custom category, color, targetDate → `saveGoal` overwrites the goal but DOESN'T preserve `id` from dashboard
> 4. User returns to dashboard → `editGoalById('g_xxx_yyy')` finds nothing because goals.html-written goal has no id → **silent edit failure**
> 5. User clicks delete on dashboard → `deleteGoalById('g_xxx_yyy')` also fails silently
> 6. Or: user edits a goal on dashboard → `saveGoal` overwrites with `{name, target, current, color}` only → **category/targetDate/monthlyNeeded/boost wiped**

This is data-loss class. Higher severity than the nw_history schema drift we fixed because there are 3 writers, not 2.

### Other cross-file invariants (LAND-N from lens 1)

- **LAND-7** Guest→user adoption skips when user key exists (`pfc-storage.js:143`) — two-device login can lose data silently
- **LAND-8** No `storage` event listener anywhere → tab A delete + tab B save resurrects deleted goal
- **LAND-9** `shownMilestones` keyed on `g.name` not `g.id` → rename goal re-fires all milestones
- **LAND-11** `goals-2` escapes `g.name` via `escHtml`; `dashboard-2 renderGoals` interpolates `${g.name}` **raw** → **stored XSS** if user-name contains script payload
- **LAND-12** PFCStorage encrypted cache cold at module-init → goals-2 first render shows empty state, then re-renders after `PFCAuth.onReady` (acceptable but causes empty-state flash)

### Defer-race verdict

`goals.html` head scripts are **SYNC** (not deferred). Body inline scripts (goals-1.js inside head, goals-2/3.js in body) are also sync. So no DASH-PROD-FIX class regression today. **BUT**: goals-1.js loads inside `<head>` and calls `document.getElementById('goals-grid')` at module top — the element doesn't exist yet. Page works only because re-render on `PFCAuth.onReady` repaints. **First paint is broken** for any user without the auth path firing — flagged as P0 below.

---

## P0 — launch-blocking findings (8)

| ID | Lens | File:line | What's broken | Recommended fix skill |
|---|---|---|---|---|
| **G-P0-1** | Cross-dep | `goals-2.js:433` + `dashboard-2.js:986` | **Schema drift causes silent data loss.** Editing a goals.html-created goal from dashboard wipes category/targetDate/monthlyNeeded/boost. goals.html never mints id, dashboard backfills. Cross-page edit/delete breaks. | `using-superpowers` (data-integrity) → `writing-plans` (schema unification plan) → `focused-fix` |
| **G-P0-2** | Security | `goals-2.js:108-109, 128, 131, 140, 209-214` + `dashboard-2.js:818` | **Multiple XSS sinks.** (a) `USER.sym` interpolated raw into conflict-banner innerHTML; (b) `g.color` interpolated into CSS context (`style="background:${color}"`) — CSS-injection breakout; (c) `g.boost` interpolated raw into HTML attribute (`value="${g.boost}"`) — attribute breakout; (d) `dashboard-2.js renderGoals` interpolates `${g.name}` raw into innerHTML even though goals-2 escapes via `escHtml`. | `ruflo-security-audit:audit` (if unblocked) + `security-review` → `focused-fix` |
| **G-P0-3** | Mobile | `goals.html:36-42, 102-109` | **Page unusable on phones.** Zero mobile breakpoint, 240px sidebar covers 64% of 375px viewport, no drawer toggle, no scrim. Worse than dashboard pre-DASH-P0-2 and net-worth pre-NW-P0-4. | `using-superpowers` (mobile-first) → `focused-fix` (graft dashboard P0-2 + net-worth P0-4 pattern) |
| **G-P0-4** | Perf / Design | `goals.html:641-651` | **Lighthouse hero `<figure>` renders unconditionally** (above the grid, even when user has 5 goals). Plus it's the LCP candidate but `loading="lazy"` — delays paint. | `focused-fix` (gate display on `GOALS.length === 0` + remove lazy on LCP) |
| **G-P0-5** | Security / Perf | `goals-2.js:218-228` | **Inline `onclick=` / `oninput=` injected via innerHTML** for every goal card. CSP `script-src 'self'` impossible to adopt; renders run rebuild attribute parsers every save. Same anti-pattern dashboard fixed (DBUG-16 CSP refactor). | `focused-fix` (data-pfc-on-click pattern already used elsewhere on this same page — inconsistent) |
| **G-P0-6** | Perf / Functionality | `goals.html:486` + `goals-1.js:474` | **Goals-1.js sync-loaded in head calls `document.getElementById` at module top** — element doesn't exist yet. First-paint throws (silently caught), works only via auth-rehydrate re-render. | `systematic-debugging` → `focused-fix` (move to body OR defer with rest of page scripts) |
| **G-P0-7** | Functionality | `goals-2.js:404-405, 428-429` | **UTC date math.** `new Date(dateVal + '-01')` parses as UTC, `now = new Date()` is local. Users east of UTC near month boundaries lose a month in `monthlyNeeded` calculation — silent overstatement. Same class as NW-P1-2. | `systematic-debugging` → `focused-fix` (use `_localToday`-style helper) |
| **G-P0-8** | Pricing/Worth | `pricing.md:7` + `billing.html:1341` vs `goals.html:629-638` | **Promise/code contradiction.** Pricing says Free gets "full goals" but goals page Pro-gates the conflict resolver ("Upgrade to Pro to see the optimal reallocation plan"). Free user sees Pro upsell on a feature pricing promises. | `using-superpowers` (entitlement audit) — needs operator decision before code: (a) remove the Pro gate, OR (b) add "Goal optimizer (Pro)" row to pricing table |

## P1 — correctness, polish, perf, a11y, CRO (23 unique)

| ID | Lens | File:line | What's broken | Fix skill |
|---|---|---|---|---|
| **G-P1-1** | Functionality | `goals-2.js:283-296` | Milestones in-memory `Set`, not persisted → fire EVERY page visit. Same class fix as NW-P2-5 `nw_celebrated_at`. | `focused-fix` |
| **G-P1-2** | Functionality | `goals-2.js:284` | Milestone key `g.name + '-' + bucket` — rename re-fires all; two goals same name cross-fire. | `focused-fix` |
| **G-P1-3** | Validation | `goals-2.js:421-422` | Accepts negative current, current > target, target overflow (1e308), emoji-only name, deadline in past. | `systematic-debugging` |
| **G-P1-4** | Functionality | `goals-2.js:69, 75` + `g.target===0` | Division by zero → `pct = Infinity` → `Math.min(100, Infinity) = 100` → goal incorrectly shows "Completed". | `focused-fix` |
| **G-P1-5** | Functionality | `goals-2.js:430` | `monthlyNeeded` frozen at save → stale forever as `current` changes, `diffMonths` decays. | `focused-fix` (recompute at render time) |
| **G-P1-6** | A11y / Functionality | `goals-2.js:307-348` + `goals.html:670-759` | **Modal a11y baseline missing.** No `role=dialog`, no `aria-modal`, no focus trap, no Escape handler, no backdrop click, no `label for=`, no initial focus into name input. | `focused-fix` (graft NW-P1-8 + NW-P2-9 patterns) |
| **G-P1-7** | Functionality / Security | `goals-2.js:449` | `window.confirm()` for delete — blocked in some iOS PWA configs. Net-worth fixed via `_pfcConfirm` (NW-P1-6). | `focused-fix` (graft `_pfcConfirm` pattern) |
| **G-P1-8** | A11y | `goals.html:489-826` | No skip link, no `<h1>` on page at all, `topbar-title` is `<div>`. | `focused-fix` |
| **G-P1-9** | A11y | `goals.html:679-721` | Modal inputs have `<label class="field-label">` siblings but no `for=` linkage. WCAG 1.3.1, 3.3.2 fail. | `focused-fix` |
| **G-P1-10** | A11y | `goals.html:680-690, 723-728` | Category options and color swatches are `<div>` with no `role`/`aria-pressed`/`tabindex`/keyboard handler. Mouse-only. | `focused-fix` |
| **G-P1-11** | A11y | `goals-2.js:176-183` | SVG progress ring has no `role="img"`/`aria-label` and no sr-only fallback table. Same pattern fix as NW-P0-5. | `focused-fix` |
| **G-P1-12** | Security | `goals.html:460` | Supabase CDN naked (no SRI, version `@2` floats). Same fix as NW-P1-5 — hash already in repo (sha384-4eCDoMN...). | `focused-fix` (one-line copy from NW-P1-5) |
| **G-P1-13** | Compat | `goals.html` styles | No 100dvh, no forced-colors, no print stylesheet, no prefers-reduced-motion, no safe-area-inset, no `-webkit-backdrop-filter`. Same set we added in NW-P0-4. | `focused-fix` (paste NW-P0-4 compat block) |
| **G-P1-14** | Mobile | `goals.html:102-109` | Topbar buttons clip on <540px (Add goal + Dashboard back). No overflow:clip, no breakpoint. | `focused-fix` |
| **G-P1-15** | Mobile / A11y | `goals.html:286-296` | Action buttons (boost/edit/↑↓/delete) ~28px tall, below 44px touch target. | `focused-fix` |
| **G-P1-16** | Mobile | `goals.html:705, 709` | Number inputs missing `inputmode="decimal"`. iOS shows number pad without decimal. | `focused-fix` |
| **G-P1-17** | Perf | `goals-2.js:62-251` | `render()` rebuilds entire grid on every event. `updateBoost` calls `save()` on every slider tick (no debounce). | `focused-fix` (debounce + diff-render) |
| **G-P1-18** | Security cross-page | `dashboard-2.js:818` | Dashboard renderGoals interpolates `${g.name}` raw — but goals-2 escapes — inconsistent. Stored XSS via name on dashboard side. | `focused-fix` (add escape to dashboard) |
| **G-P1-19** | CRO | `goals.html:652-662` + `goals-2.js:82-88` | Empty state lacks "what your goals will look like at month 3" preview (we added equivalent for net-worth in NW-P1-11). | `using-superpowers` (CRO) → `focused-fix` |
| **G-P1-20** | CRO / Worth | `goals-2.js` schema | **No `history[]` of contributions** — page can't show "you saved 3 months in a row." Single biggest retention lever missing. | `writing-plans` (schema migration) → `focused-fix` |
| **G-P1-21** | CRO | `goals-2.js:144-251` | No "second-visit" delta — same card every load. Missing "added $X since last visit", "last contribution N days ago." | `focused-fix` |
| **G-P1-22** | CRO | `goals-2.js:331-348` | High-friction progress update: must open edit modal + retype current. No "+$50/+100/+500 quick-chip" pattern. | `focused-fix` (add quick-contribution row to card) |
| **G-P1-23** | CRO | `goals-2.js:217-232` | Goals are siloed — debt goal doesn't link to /debt-optimizer with debt pre-loaded, emergency goal doesn't cross-link /salary-calculator, retirement doesn't link /dashboard forecast. | `focused-fix` (add contextual "Open in X" link per category) |

## P2 — polish (12 unique)

| ID | What's broken | Fix skill |
|---|---|---|
| **G-P2-1** | Emoji icons clash with editorial voice (category, milestone, status badges). Same as NW-P2-1 — replace with SVG. | `focused-fix` (graft `_milestoneIcon` pattern) |
| **G-P2-2** | Hex literals in inline styles (#3B82F6, #F5A623, #A78BFA, etc.) — bypass token system. | `focused-fix` |
| **G-P2-3** | 430+ lines of inline `<style>` block — bypasses pfc-reskin.css cascade. | `focused-fix` (extract patterns like NW-P2-3) |
| **G-P2-4** | Status badges use color-only — fails forced-colors. Already covered partly by G-P1-13. | `focused-fix` |
| **G-P2-5** | No streak counter ("saved 3 months in a row toward goal X"). | `writing-plans` (schema first) |
| **G-P2-6** | No celebration/share-card on goal completion (just a toast — no shareable moment). | `writing-plans` |
| **G-P2-7** | Smart-suggestion hints are platitudes ("Wedding costs vary widely"). Could use AI / real data ranges. | `writing-plans` |
| **G-P2-8** | No why-bother framing ("you'll be debt-free 14 months sooner", "you save €X in interest"). | `using-superpowers` (CRO) |
| **G-P2-9** | 4-col summary strip equal weight — overall progress doesn't dominate. Same class as NW-P2-8 KPI reshuffle. | `focused-fix` |
| **G-P2-10** | Generic SaaS CTA copy ("Add goal", "Add your first goal") — off editorial voice. | `frontend-design` |
| **G-P2-11** | `escHtml` used inconsistently across goals-2 (escapes name but not color, sym, boost). | `focused-fix` |
| **G-P2-12** | Stacked toasts on rapid action — no toast-replacement pattern. | `focused-fix` |

---

## NW-WORTH-1-style strategic finding: G-WORTH-1 (operator decision needed)

**Pricing/code contradiction (G-P0-8 promoted):**
- `pricing.md:7` Free tier: "full goals"
- `billing.html:1341` comparison table: Goals ✓✓✓ across Free/Pro/Premium
- `goals.html:629-638` runtime: **Pro-gated conflict resolver** with "Upgrade to Pro" CTA

**Three options:**
1. **Remove the Pro gate** — make conflict resolver free, align with promise (loses a small Pro upsell)
2. **Keep gate, edit pricing** — add "Goal optimizer" row marked Pro-only (clearer comparison, more aggressive Pro positioning)
3. **Keep gate, edit copy** — soften the upsell to "Premium plan unlocks reallocation" without making it look like a broken promise (worst — half-measure)

**Recommend option 1.** Reasoning: Pro/Premium already differentiate via Sage, scenarios, report card, deeper analysis. The conflict resolver is a small computation — not worth the trust friction of a pricing/code mismatch. AND **G-WORTH-2: Pro currently offers ZERO goals-specific features** — Pro user living in /goals gets nothing extra. The real Pro/Premium upsell on goals should be: shared goals, AI-generated goal templates, "what-if I raise contribution" Sage prompts, goal report-card integration. Those are the right Pro differentiators — keeping conflict resolver Pro feels like the minimum viable upsell, undermining the bigger Pro story.

---

## Cross-page blast radius warnings (lessons-learned discipline)

Before ANY fix touches:
- **goals schema** → grep all 4 writers/readers: onboarding-2.js, goals-2.js, dashboard-2.js, sage-3.js (count only)
- **`escHtml` / `_esc()`** → confirm escape applied to EVERY user-controllable interpolation, NOT just name (color, sym, boost, category all need escape too)
- **`<script>` tags** → if any defer change, also defer body scripts atomically (DASH-PROD-FIX class)
- **Modal pattern** → graft from NW-P1-6 (`_pfcConfirm`) and NW-P1-8 (label-for, focus-trap, role=dialog) to keep consistency across pages
- **CSS classes** → namespace as `gl-*` or use existing `.goal-*` prefix to avoid collisions

---

## Recommended fix batches (mirrors net-worth pattern)

**Batch P0 (apply first, separate commits):**
- **Group A (data integrity):** G-P0-1 schema unification + id preservation across writers
- **Group B (security):** G-P0-2 multi-vector XSS hardening (_esc on sym, color, boost; dashboard renderGoals escape)
- **Group C (mobile):** G-P0-3 sidebar drawer + breakpoints
- **Group D (perf):** G-P0-4 + G-P0-6 — gate lighthouse photo + move goals-1.js to body (atomic with defer if defer applied)
- **Group E (CSP):** G-P0-5 inline-onclick → data-pfc-on-click pattern
- **Group F (correctness):** G-P0-7 UTC date math via `_localToday`
- **Decision (no code yet):** G-P0-8 G-WORTH-1 — operator picks option 1/2/3

**Batch P1:**
- F1: G-P1-1, P1-2 (milestone persistence + id-keyed)
- F2: G-P1-3, P1-4, P1-5 (validation + correctness)
- F3: G-P1-6, P1-8, P1-9, P1-10, P1-11 (a11y baseline)
- F4: G-P1-7 (`_pfcConfirm` graft)
- F5: G-P1-12 (Supabase SRI)
- F6: G-P1-13 (compat layer paste from NW-P0-4)
- F7: G-P1-14, P1-15, P1-16 (mobile polish)
- F8: G-P1-17 (perf — debounce + diff render)
- F9: G-P1-18 (dashboard side _esc)
- F10: G-P1-19, P1-20, P1-21, P1-22, P1-23 (CRO retention bundle — may need schema migration for history[])

**Batch P2 (polish):**
- G-P2-1..12 — bundle similar to NW-P2 batch

**Awaiting operator approval to proceed.**
