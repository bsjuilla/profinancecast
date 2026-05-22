# CPO Onboarding Sequencing Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a tangible forecast preview on the onboarding welcome step (step 0) BEFORE asking for any input, plus make the existing live-calculation panel auto-scroll into view on mobile when the user enters data. Closes Wave-14 CPO carry-forward item §11.

**Architecture:**
The CPO plan §4 calls for a full two-panel "live as you type" rebuild of step 1. That is the right destination but it rewires the wizard state machine and is regression-risky for a 90-min slot. Wave-14 ships the **friction-removal subset** that delivers the CPO's core promise — "show the forecast output before asking for the input" — without touching the wizard finite state. Specifically: a static **example-forecast block** is appended to the existing step 0 welcome panel using sample numbers (€5,000 income / €3,200 expenses / €1,800 surplus / €21,600 projected over 12 months), and the existing `.live-preview` panels on steps 2 and 3 get a `scrollIntoView({behavior:'smooth', block:'nearest'})` call on mobile when an `<input>` is edited. The full two-panel rebuild is deferred to a separate plan (`2026-05-23-cpo-onboarding-live-twopanel.md` or later).

**Tech Stack:** Static HTML (no SPA), CSS in `<style>` block inside `onboarding.html`, JS handlers in `js/inline/onboarding-2.js` (already extracted in Wave-11). CSP is `script-src-attr 'none'` so handlers must use `data-pfc-on-*` attributes wired by `js/pfc-inline-bootstrap.js`. Funnel event `pfc.onboarding_step` already fires on step transitions via `js/pfc-funnel.js`.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `onboarding.html` | Step 0 welcome panel markup + step 0 example-forecast CSS | Modify |
| `js/inline/onboarding-2.js` | Wizard state machine + handlers (already extracted) | Modify (add `scrollPreviewOnInput` helper) |
| `docs/superpowers/audits/2026-05-22-cpo-gtm-plan.md` | CPO source plan | No change |

---

## Task 1: Add the static example-forecast block to step 0

**Files:**
- Modify: `onboarding.html` (step-0 panel, after the encryption notice but before the closing `</div>` at line 224)
- Modify: `onboarding.html` `<style>` block (add `.ex-forecast` CSS class)

- [ ] **Step 1: Read the current step-0 panel boundaries**

Run: open `onboarding.html` and locate the `<!-- STEP 0 — WELCOME -->` block. It ends with the encryption-notice `<div>` that contains `"All your data is AES-256 encrypted"`. The closing `</div>` of `id="step-0"` is on the line immediately after that notice.

- [ ] **Step 2: Add CSS for the example-forecast block**

Add to the `<style>` block in `onboarding.html`, right after the existing `.complete-metrics` / `.cm-card` rules (around line 122 area) and BEFORE the `@media(max-width:600px)` rule at line 127:

```css
  /* Example forecast preview on step 0 — sample numbers, NOT user data.
     Per CPO Wave-14 §4: show output before asking input. The chart is a
     CSS-only sparkline (12 monthly net-worth bars) so it ships without
     touching the dashboard forecast renderer. */
  .ex-forecast{
    background:var(--card);border:1px solid var(--border2);
    border-radius:var(--r);padding:18px 20px;margin-top:18px;
  }
  .ex-forecast-eyebrow{
    font-size:11px;color:var(--text3);font-weight:600;
    letter-spacing:.08em;text-transform:uppercase;margin-bottom:4px;
  }
  .ex-forecast-title{
    font-family:var(--font-display);font-size:17px;font-weight:700;
    color:var(--text);margin-bottom:14px;letter-spacing:-0.1px;
  }
  .ex-forecast-chart{
    display:flex;align-items:flex-end;gap:5px;height:64px;margin-bottom:12px;
  }
  .ex-bar{
    flex:1;background:linear-gradient(180deg,var(--teal) 0%,rgba(43,182,125,0.4) 100%);
    border-radius:2px 2px 0 0;min-height:6px;
  }
  .ex-forecast-row{
    display:flex;justify-content:space-between;align-items:baseline;
    padding:6px 0;border-bottom:1px solid var(--border);font-size:13px;
  }
  .ex-forecast-row:last-of-type{border-bottom:none;}
  .ex-forecast-key{color:var(--text2);}
  .ex-forecast-val{color:var(--text);font-weight:500;font-variant-numeric:tabular-nums;}
  .ex-forecast-val.good{color:var(--teal);}
  .ex-forecast-note{
    font-size:11.5px;color:var(--text3);font-style:italic;margin-top:8px;line-height:1.5;
  }
```

- [ ] **Step 3: Add the example-forecast HTML inside step 0**

Insert immediately AFTER the encryption-notice `<div>` (the one containing `"All your data is AES-256 encrypted"`) and BEFORE the closing `</div>` of `id="step-0"`:

```html
    <div class="ex-forecast" aria-label="Example forecast — sample numbers">
      <div class="ex-forecast-eyebrow">Example forecast — sample numbers</div>
      <div class="ex-forecast-title">This is what your forecast will look like.</div>
      <div class="ex-forecast-chart" aria-hidden="true">
        <div class="ex-bar" style="height:24%"></div>
        <div class="ex-bar" style="height:30%"></div>
        <div class="ex-bar" style="height:37%"></div>
        <div class="ex-bar" style="height:43%"></div>
        <div class="ex-bar" style="height:50%"></div>
        <div class="ex-bar" style="height:57%"></div>
        <div class="ex-bar" style="height:64%"></div>
        <div class="ex-bar" style="height:71%"></div>
        <div class="ex-bar" style="height:78%"></div>
        <div class="ex-bar" style="height:85%"></div>
        <div class="ex-bar" style="height:92%"></div>
        <div class="ex-bar" style="height:100%"></div>
      </div>
      <div class="ex-forecast-row"><span class="ex-forecast-key">Monthly income (example)</span><span class="ex-forecast-val">€5,000</span></div>
      <div class="ex-forecast-row"><span class="ex-forecast-key">Monthly expenses (example)</span><span class="ex-forecast-val">€3,200</span></div>
      <div class="ex-forecast-row"><span class="ex-forecast-key">Monthly surplus</span><span class="ex-forecast-val good">€1,800</span></div>
      <div class="ex-forecast-row"><span class="ex-forecast-key">Projected net worth in 12 months</span><span class="ex-forecast-val good">€21,600</span></div>
      <div class="ex-forecast-note">Replace these sample numbers with yours in the next steps. The chart updates live as you type.</div>
    </div>
```

- [ ] **Step 4: Verify CSP doesn't trip**

Run: open `onboarding.html` in browser, DevTools → Console. The example-forecast block uses inline `style="height:..."` on each bar. This is a STYLE attribute, NOT a script attribute, so `script-src-attr 'none'` does not block it. `style-src` policy controls inline styles — check `vercel.json` headers to confirm `style-src 'self' 'unsafe-inline'` (already-current policy permits inline style attributes site-wide because `.step-eyebrow` styles use them).

Run:
```bash
grep -n "style-src" "C:/Users/Nitin/profinancecast-audit/profinancecast/vercel.json"
```

Expected: a line containing `style-src 'self' 'unsafe-inline'` or similar. If not present, the bars will render unstyled — verify by visual check in browser.

- [ ] **Step 5: Visual check — load `/onboarding.html` and confirm step 0 shows the new block**

Run: open the page locally (or via Vercel preview), confirm:
1. Step 0 welcome panel still shows the 3 feature cards
2. Encryption notice still appears
3. Below the encryption notice, the new `.ex-forecast` block renders with 12 ascending bars and 4 number rows
4. "Replace these sample numbers with yours..." italic note appears at bottom

Expected: panel is taller than before but still fits within the wizard-body scroll region.

- [ ] **Step 6: Commit**

```bash
git add onboarding.html
git commit -m "feat(onboarding): step 0 example forecast block (CPO Wave-14)

Per CPO plan §4 (docs/superpowers/audits/2026-05-22-cpo-gtm-plan.md):
show the output before asking for the input. Adds a static example
forecast on the welcome step using sample numbers (EUR 5,000 income /
EUR 3,200 expenses / EUR 21,600 12-month net worth) with a 12-bar
CSS-only sparkline. The full live-as-you-type two-panel rebuild is
deferred to a separate plan (sequencing surgery scoped beyond this
slice).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Mobile auto-scroll the live-preview panel into view on input

**Files:**
- Modify: `js/inline/onboarding-2.js` (the wizard state machine — find `calcLive` and `calcDebt` handlers; add a one-shot scroll on mobile after recalc)

- [ ] **Step 1: Find the existing calcLive function**

Run:
```bash
grep -n "function calcLive\|window\.calcLive\|calcLive =" "C:/Users/Nitin/profinancecast-audit/profinancecast/js/inline/onboarding-2.js"
```

Expected: a line showing the function definition. (If it's wrapped in `window.calcLive = function() { ... }` or `function calcLive() { ... }`, note the exact form for the next step.)

- [ ] **Step 2: Add the scroll helper near the top of onboarding-2.js**

Insert after the file's opening IIFE / 'use strict' line but BEFORE any handler is defined. The helper is a single function that, on mobile viewports only, scrolls the live-preview panel into view smoothly, throttled to fire at most once per 1.5s so it doesn't fight the user during rapid typing:

```javascript
  // Mobile auto-scroll for the live-preview panel — per CPO Wave-14 §4 mobile
  // friction note. Fires only on narrow viewports (<=600px to match the existing
  // @media breakpoint in onboarding.html), and only when the panel is below
  // the fold. Throttled to one scroll per 1500ms so we don't yank during typing.
  var _lastPreviewScroll = 0;
  function scrollPreviewIntoView(panelId) {
    if (window.innerWidth > 600) return;
    var now = Date.now();
    if (now - _lastPreviewScroll < 1500) return;
    var panel = document.getElementById(panelId);
    if (!panel) return;
    var rect = panel.getBoundingClientRect();
    // Only scroll if the panel is BELOW the visible viewport (don't yank up).
    if (rect.top > window.innerHeight - 80) {
      _lastPreviewScroll = now;
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
```

- [ ] **Step 3: Call the helper from calcLive (income/expenses preview)**

Find the existing `calcLive` function body (it updates `#lp-income`, `#lp-expenses`, `#lp-surplus`, `#lp-rate`). At the END of the function (just before the closing `}`), add:

```javascript
    scrollPreviewIntoView('income-preview');
```

Note: the live-preview wrapper on step 2 has `id="income-preview"` (already in onboarding.html line 314).

- [ ] **Step 4: Add an id to the step-3 live-preview panel so the helper can target it**

Find this line in `onboarding.html` (around line 364):
```html
    <div class="live-preview">
      <div class="lp-label">Your net worth today</div>
```

Change to:
```html
    <div class="live-preview" id="debt-preview">
      <div class="lp-label">Your net worth today</div>
```

- [ ] **Step 5: Call the helper from calcDebt (savings/debt preview)**

Find the existing `calcDebt` function body (it updates `#lp-assets`, `#lp-debt-val`, `#lp-networth`, `#lp-debtfree`). At the END of the function, add:

```javascript
    scrollPreviewIntoView('debt-preview');
```

- [ ] **Step 6: Manual mobile verification**

Run: open `/onboarding.html` in browser, DevTools → device mode → iPhone 14 Pro (390×844). Navigate to step 2 (Income & expenses). Type "5000" into the income field. The `.live-preview` panel should smoothly scroll into view if it was below the fold.

Expected:
- On mobile viewport, scroll happens at most once per 1.5s while typing
- On desktop (resize > 600px), no scroll triggers
- No console errors

- [ ] **Step 7: Commit**

```bash
git add onboarding.html js/inline/onboarding-2.js
git commit -m "feat(onboarding): mobile auto-scroll live-preview on input (CPO Wave-14)

scrollPreviewIntoView() helper fires from calcLive (step 2) and calcDebt
(step 3) on viewports <=600px wide, throttled to 1 scroll per 1500ms,
and only when the panel is below the fold. Step 3 live-preview now has
id=debt-preview so the helper can target it.

Closes the CPO Wave-14 mobile-friction note: 'auto-scroll the live-
calculation panel into view on mobile when data is entered.'

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Verify the funnel event still fires + push

**Files:**
- No code changes

- [ ] **Step 1: Confirm pfc.onboarding_step still fires on next-step transitions**

Run: open `/onboarding.html` in browser with DevTools → Network tab filtered for `plausible.io`. Click "Let's go" → "Next" through steps 0 → 1 → 2. Each transition should generate one POST/GET to plausible with event `pfc.onboarding_step` and `props: { step: <N> }`.

Expected: a clean sequence of 3 events as the user advances. No payload should contain the example sample numbers (those are static HTML, not user input).

- [ ] **Step 2: Run the marketing-claims grep gate on onboarding.html**

Run:
```bash
node "C:/Users/Nitin/profinancecast-audit/profinancecast/scripts/check-marketing-claims.js" "C:/Users/Nitin/profinancecast-audit/profinancecast/onboarding.html"
```

Expected: no NEW hits introduced by the Task 1 markup. (Pre-existing hits are documented in Wave-13 §6.) The example-forecast block uses neutral language ("This is what your forecast will look like", "sample numbers", "Replace these sample numbers with yours") — no "advice / recommend / suitable / planner / advisor" language.

- [ ] **Step 3: Push**

```bash
git push origin main
```

Expected: clean push, two new commits visible on GitHub. CI workflows (visual-regression + e2e-smoke) trigger automatically.

- [ ] **Step 4: CI verification**

Run: open https://github.com/bsjuilla/profinancecast/actions and confirm both workflows green within ~5 minutes.

Expected:
- Visual-regression: passes (the example-forecast block is a NEW element so a visual baseline diff is expected on `/onboarding.html`; this is the intended change — accept the new baseline)
- E2E smoke: passes (flow B covers wizard navigation; the additional element on step 0 should not break click-paths)

---

## Self-Review Notes

- **Spec coverage:** §4 of the CPO plan asks for two things — (a) show output before input, (b) live-as-you-type. (a) is delivered as a static block on step 0; (b) is explicitly deferred to a separate Wave-15 plan (rationale documented in the Architecture section above). Mobile auto-scroll is a CPO mobile-friction note covered by Task 2.
- **Type consistency:** `scrollPreviewIntoView` is defined once, called twice, both call sites pass a string ID that exists in the markup. `id="income-preview"` is pre-existing; `id="debt-preview"` is added in Task 2 Step 4.
- **No placeholders:** Every step has the literal code to type. The only uncertainty is the exact pre-existing form of `calcLive` / `calcDebt` in onboarding-2.js — the plan instructs the executor to grep for them first (Task 2 Step 1) so the insertion is keyed to the actual function shape.
