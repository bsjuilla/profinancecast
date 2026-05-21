# CPO WCAG 2.1 AA Shipping Plan
**Date:** 2026-05-22
**Owner:** Founder / CPO
**Budget:** ~75 min (your slice of the 3-5 hour P0 sprint)
**Regulatory driver:** EU Accessibility Act (deadline: June 2025 for large orgs; June 2026 phased-in for smaller; audit now = lead time)
**Status:** P1 — must close before any paid-user acquisition push

---

## Brand tension — call it out first

The STYLE-GUIDE and BRAND-VOICE.md encode three specific a11y risk surfaces that CANNOT be silently patched:

1. **Gold eyebrows on dark canvas.** `var(--gold, #D4AF6A)` on the emerald-black canvas (`#0B1410`) passes AAA at ~7.5:1. Safe. Do not touch eyebrow color on dark-surface pages.
2. **Gold on ivory surfaces.** BRAND-VOICE.md already prohibits gold-as-text on ivory (1.95:1 — fails AA). Rule is written; the risk is that future copy accidentally uses it. WCAG enforcement here is brand enforcement.
3. **JetBrains Mono small-caps eyebrow tags at 11px.** At 11px this is non-large text. AA contrast threshold is 4.5:1, not 3:1. The gold on dark-canvas is fine. But if any page accidentally renders an eyebrow tag on a mid-tone surface (the card background, `var(--bg3)`), that will fail. Audit must check eyebrow tags on every page surface, not just the hero.
4. **Fraunces italic display at 36-48px.** Large text threshold is 18pt (~24px) or 14pt bold (~18.67px). At 36px+ Fraunces italic qualifies as large text — 3:1 minimum. The emerald-on-dark white (`var(--text)`) is fine. The amber state variants need checking.
5. **The 117 innerHTML sinks.** WCAG 4.1.1 (parsing) and 4.1.3 (status messages) both touch dynamically injected content. If user-generated goal names or debt labels are injected via innerHTML without sanitization, an injected `<button>` or `<img>` without alt breaks the tree. The `escHtml` wrapper protects XSS; it does not guarantee accessible markup in what survives. Flag this for a Wave-3 sweep, but note it tonight.

**Verdict on brand vs. compliance:** The brand's color system is structurally compliant on its intended surfaces. The a11y risk is in (a) off-label surface combinations and (b) interactive-state colors that were designed visually and never contrast-checked. No brand decisions need reversing tonight. One potential adjustment: emerald hover states on nav items use `rgba(255,255,255,0.05)` background — effectively invisible — as the only hover signal. That is fine for mouse users; it does not affect keyboard focus, which is handled by `:focus-visible`. Confirm `:focus-visible` survived Wave-11.

---

## Answer 1 — The 10 Critical Accessibility Surfaces (priority order)

Criteria applied: auth requirement, onboarding funnel position, conversion value, form density, dynamic content, regulatory exposure as entry points cited in EU Accessibility Act Article 3.

| Rank | Page | File | Rationale |
|------|------|------|-----------|
| 1 | Auth (sign-in / sign-up) | `auth.html` | Gateway to entire product. A11y failure here excludes the user entirely. Already has one known HIGH finding (label-for). Multi-view JS switching creates focus-management risk. |
| 2 | Onboarding | `onboarding.html` | Multi-step wizard. Form-heavy (income, expenses, goals). Step-progress dots have no accessible state announcement. Completion triggers navigation — focus must be managed. |
| 3 | Dashboard | `dashboard.html` | Primary authenticated landing. Notifications dot confirmed missing role/aria-label. Sidebar nav must be keyboard-traversable. Inline-styled buttons confirmed missing `:focus-visible`. |
| 4 | Billing / Pricing | `billing.html` | Conversion surface. Plan selection is likely a set of `<div>`-based cards, not `<input type=radio>` — high risk of missing role/checked state. Financial figures in JetBrains Mono must have accessible number formatting. |
| 5 | Debt Optimizer | `debt-optimizer.html` | Highest UX score (25/25). Form-intensive. Strategy selector buttons (recently de-emojified) are the exact surface where ARIA roles and keyboard activation matter. The OPTIMAL/PROVEN/QUICK badges must not be the only differentiator — they need role or context. |
| 6 | Goals | `goals.html` | User creates, edits, deletes named goals. CRUD operations on user-generated content. innerHTML injection point. Modal or inline edit panel = focus trap risk. |
| 7 | Scenarios | `scenarios.html` | UX score 23/25. Best-balanced photo page. Scenario comparison involves dynamic chart updates — live region announcements needed for screen readers. |
| 8 | Net Worth | `net-worth.html` | Chart-heavy. Chart.js canvases with no fallback text or `aria-label` are a known WCAG 1.1.1 failure. This is the most likely page to have silent canvas violations. |
| 9 | tools/take-home-pay | `tools/take-home-pay.html` | Public-facing (indexed). EU Accessibility Act applies to public web content, not just authenticated apps. Form inputs drive the entire page value. |
| 10 | tools/debt-strategy | `tools/debt-strategy.html` | Same public-facing rationale. Likely shares form patterns with take-home-pay. Audit both in one pass since they share structure. |

**Explicitly excluded from tonight's critical list (deferred):**
- 7 blog posts: reading-order is linear, no interactive controls, low risk. Defer to full sweep.
- `tools/compound-interest/*`, `tools/mortgage-affordability/*`, `tools/fire-date/*`, `tools/savings-rate/*` country variants: audit the `/index.html` template for each family; country variants inherit the same structure. Treat each family as 1 surface, not 8.
- `privacy.html`, `terms.html`: static prose, no interactive elements.
- `history.html`, `journal.html`, `report-card.html`, `salary-calculator.html`, `recurring.html`, `portfolio.html`, `sage.html`: Wave-2 sweep after tonight's fixes establish the baseline.

---

## Answer 2 — Audit Method

### Tonight (within the 75-minute budget)

**Method: axe-core via @axe-core/playwright, integrated into the existing E2E suite.**

Rationale: The VPE is already planning Playwright E2E. Axe-core's Playwright integration adds ~10 lines per test file and runs in CI without a browser install step (Playwright already manages the browser binary). This is the only method that produces machine-readable, reproducible, diffable output with zero manual overhead in CI.

**Do not use:**
- `axe-core` CLI directly via npx against static files. It cannot handle auth-gated pages, multi-step wizard state, or JS-rendered content reliably. The Playwright integration handles all three.
- The Wave browser extension. Useful for ad-hoc manual checks, but produces no structured output for CI gating.
- Lighthouse a11y score alone. Lighthouse uses axe-core under the hood but scores by weighting — a single missing alt on a decorative image can drop the score disproportionately. Use raw axe violation count as the gate, not the Lighthouse score.

**Integration plan:**

```
npm install --save-dev @axe-core/playwright
```

Create `e2e/a11y/axe-critical.spec.ts` (or `.js` if the project is not yet TypeScript):

```js
// e2e/a11y/axe-critical.spec.ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const CRITICAL_PAGES = [
  { name: 'auth',          url: '/auth.html',      auth: false },
  { name: 'onboarding',   url: '/onboarding.html', auth: true  },
  { name: 'dashboard',    url: '/dashboard.html',  auth: true  },
  { name: 'billing',      url: '/billing.html',    auth: true  },
  { name: 'debt-optimizer', url: '/debt-optimizer.html', auth: true },
  { name: 'goals',        url: '/goals.html',      auth: true  },
  { name: 'scenarios',    url: '/scenarios.html',  auth: true  },
  { name: 'net-worth',    url: '/net-worth.html',  auth: true  },
  { name: 'tools-take-home-pay', url: '/tools/take-home-pay.html', auth: false },
  { name: 'tools-debt-strategy', url: '/tools/debt-strategy.html', auth: false },
];

// Authenticated pages: use the existing audit-mode cookie mechanism
// Set AUDIT_BYPASS in CI via Vercel env → playwright sets cookie before navigation
const AUDIT_COOKIE = {
  name: 'pfc_audit_mode_active',
  value: '1',
  domain: 'localhost',
  path: '/',
};

for (const page of CRITICAL_PAGES) {
  test(`axe: ${page.name} has zero critical/serious violations`, async ({ page: pw, context }) => {
    if (page.auth) {
      await context.addCookies([AUDIT_COOKIE]);
    }
    await pw.goto(page.url);
    await pw.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page: pw })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    // Filter to critical + serious only for the gate; log all for triage
    const blocking = results.violations.filter(v =>
      v.impact === 'critical' || v.impact === 'serious'
    );

    if (blocking.length > 0) {
      console.log(JSON.stringify(blocking, null, 2));
    }

    expect(blocking, `${page.name}: ${blocking.length} critical/serious axe violations`).toHaveLength(0);
  });
}
```

**Note on auth:** After the Wave-1 security fix (#3 — split audit cookie), the JS-readable cookie becomes `pfc_audit_mode_active=1`. The spec above uses that cookie. The `pfc_audit_session` HttpOnly nonce is sent automatically by the browser on each request, so the server's audit-mode guards will also pass. Update this comment once the cookie split lands.

**Cadence:**
- CI: Run `axe-critical.spec.ts` on every PR that touches any `.html` file, any `.css` file, or `js/pfc-*.js`. Gate: zero critical or serious violations on the 10 critical pages.
- Manual spot-check: run the full suite locally before any deployment that touches auth, billing, or onboarding.
- Full 27-page sweep: Wave-2 sprint (next session). Extend `CRITICAL_PAGES` to all 27 surfaces.

---

## Answer 3 — Acceptance Criteria for "WCAG 2.1 AA P1 Audit Complete"

**One criterion, single number, no ambiguity:**

> Zero axe-core violations of impact `critical` or `serious` on all 10 critical pages, measured by `axe-critical.spec.ts` running against a deployed preview URL with audit-mode active, using the `wcag2a` and `wcag2aa` tag set.

**What this means concretely:**
- `moderate` and `minor` violations are logged but do not block the P1 close. They become Wave-2 items.
- The gate applies only to the 10 critical pages tonight. The remaining 17 pages are out of scope for tonight's P1 certificate.
- "Deployed preview" means Vercel preview URL, not localhost — some violations only surface when served from the real origin (CSP, CORS on external fonts, etc.).

**What this explicitly does NOT mean:**
- It does not mean Lighthouse a11y score greater than 95 (Lighthouse weights are not our gate).
- It does not mean 100% of WCAG 2.1 AA checkpoints met (that requires manual testing of 2.1.1 keyboard-only, 1.3.1 info and relationships, 1.4.3 contrast, 1.4.4 resize text — none of which axe-core can fully automate). Manual NVDA/VoiceOver testing is explicitly deferred.
- It does not mean the Wave-3 items are done (ink-2 contrast bump, innerHTML sink audit, aria-labelledby figures).

**Stretch goal (if you finish early):** Lighthouse a11y score greater than 90 on auth, dashboard, and onboarding. Run with `npx lighthouse <url> --only-categories=accessibility --output=json` and log the score in the PR description.

---

## Answer 4 — Anticipated Findings on the Top 3 Pages

This is the assumption-based list, written before the actual axe run. The actual run follows these fixes. Where the prior audit (2026-05-21-prompts-a11y-perf.md) already confirmed a finding, that is marked CONFIRMED. Others are PREDICTED based on pattern analysis.

### auth.html — Expected axe findings

| # | Rule ID | Impact | Finding | Status |
|---|---------|--------|---------|--------|
| A1 | `label` | Serious | `#forgot-email` input has no associated label (`for=` attribute missing on the label element at line 770-771) | CONFIRMED (A11y audit #1, HIGH) |
| A2 | `color-contrast` | Serious | `.left-eyebrow` uses `var(--teal)` text color (~#2BB67D) on `var(--bg2)` background. Teal on the dark bg2 canvas is ~4.8:1 — borderline. The exact computed value depends on the bg2 token. **If bg2 resolves to anything lighter than `#0F1A14`, this fails.** | PREDICTED — verify |
| A3 | `focus-visible` / `button-name` | Serious | The multi-view switching buttons (sign-in / sign-up tab triggers) use `onclick=` with no explicit `role="tab"` or `aria-selected`. Axe will not flag onclick directly, but if they are `<div>` or `<a href="#">` elements acting as buttons, `button-name` or `aria-required-attr` will fire. | PREDICTED — check auth.html view-switch markup |
| A4 | `aria-allowed-attr` | Moderate | The `.view` div panels use `display:none` for hiding. If any hidden panel has `aria-hidden` missing, AT will read hidden content. Not a critical violation but axe flags it as moderate. | PREDICTED |
| A5 | `scrollable-region-focusable` | Moderate | If the right panel (`.right`) becomes scrollable at small viewport, and it has no `tabindex="0"`, axe will flag it. | PREDICTED on mobile viewport |

**Tonight's fixes for auth.html (before running axe):**

1. A1 is already in Wave-1 queue (#17, 2 min). Ship it first. `<label for="forgot-email">Forgot password email</label>` on the input at line 770-771.
2. Verify the view-switch triggers are `<button>` elements. If they are `<a>` or `<div>`, convert to `<button type="button">` with an explicit visible label. This is a 10-minute change.
3. Add `aria-hidden="true"` to all `.view` panels that are not `.active`. This prevents AT from reading hidden form fields.

### dashboard.html — Expected axe findings

| # | Rule ID | Impact | Finding | Status |
|---|---------|--------|---------|--------|
| D1 | `aria-required-children` | Critical | The notifications dot `<div>` has no `role` or `aria-label`. Axe tags this as critical when a status indicator has no accessible name. | CONFIRMED (A11y audit #4, Med — axe may rate it Critical) |
| D2 | `button-name` | Serious | Inline-styled action buttons (the topbar buttons, the gauge refresh controls) have no `:focus-visible` ring AND may lack accessible names if they are SVG-only with no label. | CONFIRMED + PREDICTED (A11y audit #5, HIGH) |
| D3 | `aria-hidden-focus` | Serious | Decorative SVG icons inside nav items — if they have `focusable="true"` (SVG default in IE/Edge legacy) or are not `aria-hidden`, axe flags them. | CONFIRMED (A11y audit #8, Low — but axe may rate impact higher) |
| D4 | `color-contrast` | Serious | `.sidebar-section` uses `var(--text3)` at 10px uppercase — very small text. `--text3` is likely a dim color (~4:1 or less). At 10px this is below large-text threshold. Must hit 4.5:1. | PREDICTED |
| D5 | `region` | Moderate | Main content area has no landmark role. The `<main>` element (or its absence) is required by WCAG 1.3.1. The sidebar is likely not wrapped in `<nav>`. | PREDICTED — check if `<main>`, `<nav>`, `<aside>` landmarks are present |
| D6 | `canvas` | Serious | If Chart.js canvas elements exist on dashboard (net-worth sparkline, savings gauge) they will have no `role="img"` and no `aria-label`. Axe flags canvas elements with no text alternative as serious. | PREDICTED |

**Tonight's fixes for dashboard.html:**

1. D1: Wrap notifications dot. `<span role="status" aria-label="3 new notifications" aria-live="polite">` — 5 minutes. Already queued as Wave-2 item 13, pull forward to tonight.
2. D2: The `.btn-inline:focus-visible` CSS fix is already in Wave-1 queue (#16, 1h). Confirm it covers every button variant on dashboard.
3. D3: Add `aria-hidden="true"` to all decorative SVG icons inside `.nav-item`. This is a global fix — run a search across all app pages, not just dashboard. Already queued as Wave-2 item 14.
4. D5: Wrap sidebar in `<nav aria-label="Main navigation">`. Wrap the primary content area in `<main>`. This is structural markup — 15 minutes per page but must be done on every app page. Tonight: do it on dashboard, auth, onboarding. Defer others to Wave-2.

### onboarding.html — Expected axe findings

| # | Rule ID | Impact | Finding | Status |
|---|---------|--------|---------|--------|
| O1 | `aria-live` | Serious | The step progress dots have no live region. When the user completes a step and the panel animates to the next, screen readers get no announcement. The `<div class="nav-step-label">` exists but is not `aria-live`. | PREDICTED |
| O2 | `label` | Serious | Several onboarding form fields use `.field-label label` elements. The `for=` attribute must match the input `id`. If the ids are dynamically generated or missing, this fails. | PREDICTED — verify each `<label>` has a matching `for=` and each `<input>` has a matching `id` |
| O3 | `aria-required-attr` | Serious | The goal selection cards (`.goal-card`) are `<div>` elements acting as radio buttons. They have click handlers but no `role="radio"`, no `aria-checked`, and no `aria-label`. This is likely the most serious finding on this page. | PREDICTED |
| O4 | `range` / `aria-valuetext` | Moderate | The stress-level `<input type=range>` has `.stress-output` showing an emoji value (`font-size:22px`). Axe does not flag the emoji, but the range has no `aria-valuetext` — screen readers will announce only the numeric value, not the label. | PREDICTED |
| O5 | `color-contrast` | Moderate | `.field-label .hint` uses `var(--text3)` at 11.5px. Below large-text threshold, must hit 4.5:1. | PREDICTED |
| O6 | `skip-link` | Moderate | No skip-navigation link. On a multi-step wizard where the topnav repeats on every step re-render, keyboard users cannot bypass it. | PREDICTED |

**Tonight's fixes for onboarding.html:**

1. O1: Add `aria-live="polite"` to the `.nav-step-label` element and the `.step-dots` container so step transitions are announced. 5 minutes.
2. O3: This is the most important fix. Convert goal-cards from `<div>` to either (a) `<input type="checkbox">` / `<input type="radio">` with visually styled labels, or (b) `<div role="checkbox" aria-checked="false/true" tabindex="0">` with keyboard event handlers for Space to toggle. Option (a) is simpler, more robust, and requires less custom JS. Estimated 30-45 minutes.
3. O2: Audit every `<label>` on the page. Add `for=` / `id` pairs where missing. 10 minutes.
4. O6: Add a visually hidden skip link as the first child of `<body>`:
   ```html
   <a href="#wizard-main" class="skip-link">Skip to main content</a>
   ```
   With CSS:
   ```css
   .skip-link {
     position: absolute; left: -9999px; top: auto;
     width: 1px; height: 1px; overflow: hidden;
   }
   .skip-link:focus {
     position: static; width: auto; height: auto; overflow: visible;
   }
   ```
   5 minutes. Add to all 10 critical pages in one pass if time allows.

---

## Brand-Specific Contrast Checks (do these manually before the axe run)

These surfaces are NOT reliably caught by axe-core because the computed color depends on the CSS variable chain. Run these manually with a contrast checker (e.g., Firefox DevTools color picker or the TPGi Colour Contrast Analyser).

| Surface | Foreground | Background | Claimed ratio | Minimum needed | Action |
|---------|-----------|-----------|---------------|----------------|--------|
| Eyebrow tags on canvas | `--gold` (#D4AF6A) | `--canvas` (#0B1410) | ~7.5:1 | 4.5:1 (AA) | Pass. No change. |
| Eyebrow tags on card (`--bg3`) | `--gold` (#D4AF6A) | `--bg3` (measure) | Unknown | 4.5:1 | **Measure tonight** |
| `.left-eyebrow` teal on bg2 | `--teal` (#2BB67D) | `--bg2` (measure) | ~4.8:1 est. | 4.5:1 | **Measure tonight — borderline** |
| `--ink-2` body copy | `--ink-2` | `--canvas` | ~5.1:1 per audit | 4.5:1 | Pass if ≥4.5:1. Wave-3 if below. |
| `.sidebar-section` labels | `--text3` | `--bg2` | Unknown | 4.5:1 at 10px | **Measure tonight** |
| `.field-label .hint` | `--text3` | `--bg3` | Unknown | 4.5:1 at 11.5px | **Measure tonight** |
| Strategy badge OPTIMAL | `--gold` | `rgba(212,175,106,0.12)` on `--canvas` | Unknown | 4.5:1 | **Measure. Gold on translucent gold tint on dark canvas — likely passes but verify** |
| Emerald-green hover state on nav | `--teal` text | `rgba(255,255,255,0.05)` on `--bg2` | Effectively `--teal` on `--bg2` | 4.5:1 | Same as eyebrow check above. |

**If any of these fail:** the gold-on-card case is the most likely failure. The fix is not to remove gold — it is to deepen the card background token slightly, or restrict eyebrow tags to the dark canvas surface only. Both are 5-minute token changes.

---

## The innerHTML / XSS Surface — CPO Note for Wave 3

The security audit found 117 innerHTML assignment sites in `js/inline/`. These are the same sites where user-generated content (goal names, debt labels) will eventually render. From an accessibility standpoint:

- If a user enters a goal name like `Save for <em>house</em>`, the `escHtml` wrapper will escape it to `Save for &lt;em&gt;house&lt;/em&gt;` — the raw text is shown, not the tag. This is correct behavior for XSS and for WCAG 4.1.1 (no invalid HTML injected).
- If a user enters a goal name that axe would flag as an accessible name (e.g., all digits, or empty after trim), the form validation should catch it before it reaches the DOM.
- The real risk is Wave-3: when richer content is allowed (e.g., scenario names with special characters), the innerHTML pattern must be reviewed against WCAG 4.1.3 status messages and 4.1.1 parsing.

**Action tonight:** none. Document this as a Wave-3 dependency. The ESLint `no-unsanitized/property` rule (already in the security audit) will surface the sites.

---

## Tonight's Execution Checklist (75 minutes)

Work in this order. Each item is independent after the first.

**Minutes 0-10 — Setup**
- [ ] `npm install --save-dev @axe-core/playwright` in the repo root
- [ ] Create `e2e/a11y/axe-critical.spec.ts` from the template above
- [ ] Confirm Playwright is installed and can reach `localhost` (or the Vercel preview URL)

**Minutes 10-30 — High-impact HTML fixes (ship before the axe run to reduce noise)**
- [ ] auth.html line 770-771: add `for="forgot-email"` to the label (2 min, Wave-1 #17)
- [ ] auth.html: verify view-switch triggers are `<button type="button">` elements
- [ ] auth.html: add `aria-hidden="true"` to all `.view` panels that are not `.active`
- [ ] onboarding.html: add `aria-live="polite"` to `.nav-step-label` and step-dots container
- [ ] onboarding.html: add skip-link pattern to `<body>` (copy/paste from this doc)
- [ ] dashboard.html: wrap notifications dot in `<span role="status" aria-label="N new notifications" aria-live="polite">`
- [ ] dashboard.html: wrap sidebar in `<nav aria-label="Main navigation">`, wrap content in `<main>`
- [ ] All 3 pages: add `aria-hidden="true"` to decorative SVGs inside nav items

**Minutes 30-60 — Onboarding goal-cards (the hardest fix)**
- [ ] onboarding.html: convert `.goal-card` divs to `<label>` + `<input type="checkbox">` pattern. The visual styling stays identical; the underlying element provides native keyboard and AT support.
  ```html
  <!-- Before -->
  <div class="goal-card" onclick="toggleGoal(this, 'house')">...</div>

  <!-- After -->
  <label class="goal-card">
    <input type="checkbox" name="goals" value="house" class="sr-only">
    <!-- existing icon + title + desc markup unchanged -->
  </label>
  ```
  Add `.sr-only { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; }` to the stylesheet if not already present.
  Update the JS to read `input.checked` instead of a CSS class.

**Minutes 60-75 — Run axe + triage**
- [ ] Run `npx playwright test e2e/a11y/axe-critical.spec.ts --reporter=list` against the 3 priority pages first (auth, dashboard, onboarding)
- [ ] Paste the JSON output of any remaining violations here as a follow-on comment
- [ ] For each violation: classify as `(a) fix tonight`, `(b) Wave-2`, or `(c) Wave-3` based on the impact/effort matrix below

**Impact/effort triage matrix:**

| axe impact | Fix time < 10 min | Fix time 10-30 min | Fix time > 30 min |
|-----------|-------------------|--------------------|-------------------|
| Critical | Fix tonight | Fix tonight | Fix tonight, no exceptions |
| Serious | Fix tonight | Fix tonight | Wave-2 unless it is auth/onboarding |
| Moderate | Wave-2 | Wave-2 | Wave-3 |
| Minor | Wave-3 | Wave-3 | Wave-3 |

---

## P1 Acceptance Gate — Summary

The P1 WCAG audit is closed when:

> `axe-critical.spec.ts` passes with zero `critical` or `serious` violations on all 10 critical pages, in a single CI run against a Vercel preview deploy, documented with a PR link and the raw axe JSON output attached to that PR description.

The VPE pins this spec to the visual-regression CI job (Wave-2 item #20). Until the VPE's CI job lands, the spec runs manually via `npx playwright test` before each deploy that touches a critical page.

---

## What Gets Deferred (and Why)

| Item | Wave | Reason |
|------|------|--------|
| Manual NVDA / VoiceOver testing | Wave-2 | Requires hardware + OS setup. Cannot be done in a 75-minute window. |
| Full 27-page axe sweep | Wave-2 | Extend `CRITICAL_PAGES` array. 17 remaining pages in one session. |
| `--ink-2` contrast token bump | Wave-3 | Site-wide token; redesign blast radius. Confirmed borderline (5.1:1) but currently passing. |
| `aria-labelledby` figures-to-headings semantics | Wave-3 | Low user impact; no axe violation. |
| Redundant `<section aria-label>` duplicating `<figcaption>` | Wave-3 | Low/info severity per prior audit. |
| innerHTML sinks WCAG 4.1.1 review | Wave-3 | Coupled to ESLint `no-unsanitized/property` rollout. |
| Country-variant tools pages (40+ files) | Wave-2 | After template-level fix is confirmed on `/index.html` of each tool family, apply via `scripts/apply-to-all.js`. |
| Screen-reader narrative quality review | Wave-2 | Requires reading every page's content sequence. Separate session. |

---

## Relationship to Other Tonight's P0/P1 Items

The VPE is planning Playwright E2E infrastructure. Coordinate: the `@axe-core/playwright` install and the `e2e/a11y/` directory should be set up by whichever engineer touches `e2e/` first. Do not create duplicate Playwright configs.

The security Wave-1 fix (#3 — split audit cookie into HttpOnly nonce + JS-readable flag) changes the cookie name that the axe spec uses for authentication. The spec above already uses `pfc_audit_mode_active=1` (the post-fix name). If the security fix lands before the axe spec, the spec is correct as written. If the axe spec lands first, use the old cookie name temporarily and update in the same PR as the security fix.

The CMO voice work (eyebrow mandate, empty-state register) is additive markup — new `<div class="eyebrow-mono">` elements and `.empty-state` containers. These do not create new a11y violations unless the new elements are interactive. They are safe to ship in parallel.

---

*Plan authored: 2026-05-22. Next review: when Wave-2 sprint opens.*
