# NW-P1-7: Defer race fix (net-worth.html script load order) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate render-blocking head scripts on net-worth.html while preventing the DASH-PROD-FIX class of regression (mid-body sync scripts running before deferred head scripts resolve).

**Architecture:** Two coupled changes in ONE atomic commit: (1) add `defer` to the 7 sync head scripts that don't yet have it; (2) add `defer` to `net-worth-2.js` and `net-worth-3.js` mid-body. With both deferred, browser executes all deferred scripts in document order after parse, before DOMContentLoaded — preserving the existing data-flow contract while letting parsing race ahead of network.

**Tech Stack:** Plain HTML5 (no bundler). Defer attribute semantics per WHATWG.

---

## The gotchas (read once before touching anything)

1. **The head currently mixes sync and defer.** `pfc-export.js` is already `defer`, but `pfc-config/auth/crypto/storage/currency/user/entitlements/audit-mode` are SYNC. The body has `net-worth-1.js` SYNC (line 273) before `pfc-anim.js defer`.
2. **net-worth-1.js (head body bottom L273) currently runs DURING parse.** It contains `data-pfc-on-click` declarative-handler bootstrap. If we defer head sync scripts but leave net-worth-1 sync, the data contract still works because net-worth-1 doesn't read PFCStorage/PFCUser (it just sets up event-delegation patterns). So we can leave it sync — confirmed by reading the file.
3. **net-worth-2.js (line 650) and net-worth-3.js (line 652) READ PFCStorage/PFCUser/PFCAuth at top-level** (e.g. `_rehydrateFromStorage` calls in init, route-guard in 3). If they run sync while head scripts are deferred, they execute mid-parse and those globals are undefined.
4. **`<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2">` (L249) is naked sync — no `defer`.** This is intentional for now because it's a third-party global script and Supabase docs don't publish an SRI-pinned defer variant. We leave it sync — it's the only naked sync script left after this commit. NW-P1-5 will pin and SRI it in a separate commit; not in scope here.
5. **Plausible script (L272) is `async`** — already correct, not touched.
6. **The Chart.js CDN (L29) is intentionally NOT deferred** per the existing comment in the file (inline chart-init expects Chart global). Do not touch it.

## File map

- Modify: `net-worth.html` — 9 small edits (7 head sync→defer, 2 body sync→defer)
- No other files touched
- No tests added (static HTML, no runtime to test in this repo; verification is a browser smoke test)

## Single-task plan (one commit)

### Task 1: Add defer to 7 head sync scripts + 2 body sync scripts

**Files:**
- Modify: `net-worth.html:248-274` (head region) and `:650, :652` (body region)

- [ ] **Step 1: Confirm net-worth-1.js does not read top-level globals**

Run: search for PFCStorage/PFCUser/PFCAuth usage in net-worth-1.js
Expected: zero direct reads at module-init time (only inside event handlers that fire later)

- [ ] **Step 2: Edit head — add defer to the 7 currently-sync scripts**

Net-effect: every PFC-* script in head becomes `defer` so they all execute in document order after parse.

Change lines 250-257 (`pfc-audit-mode`, `pfc-config`, `pfc-auth`, `pfc-crypto`, `pfc-storage`, `pfc-currency`, `pfc-user`, `pfc-entitlements`) — add `defer`.

```html
<script src="js/pfc-audit-mode.js" defer></script>
<script src="js/pfc-config.js" defer></script>
<script src="js/pfc-auth.js" defer></script>
<script src="js/pfc-crypto.js" defer></script>
<script src="js/pfc-storage.js" defer></script>
<script src="js/pfc-currency.js" defer></script>
<script src="js/pfc-user.js" defer></script>
<script src="js/pfc-entitlements.js" defer></script>
```

DO NOT touch:
- Line 249 Supabase CDN (NW-P1-5 will handle separately)
- Line 247 pfc-export.js (already defer)
- Line 259 pfc-fonts.js (already defer)
- Lines 264-270 sentry/analytics/cloudflare/funnel/sidebar (already defer)
- Line 272 Plausible (already async)
- Line 274 pfc-anim.js (already defer)
- Line 273 net-worth-1.js (leave sync; doesn't read PFC globals at init)
- Line 29 Chart.js (intentional sync per file comment)

- [ ] **Step 3: Edit body — add defer to net-worth-2.js**

Change line 650 from:
```html
<script src="./js/inline/net-worth-2.js"></script>
```
to:
```html
<script src="./js/inline/net-worth-2.js" defer></script>
```

- [ ] **Step 4: Edit body — add defer to net-worth-3.js**

Change line 652 from:
```html
  <script src="./js/inline/net-worth-3.js"></script>
```
to:
```html
  <script src="./js/inline/net-worth-3.js" defer></script>
```

- [ ] **Step 5: Verify execution-order contract**

After the edits, the deferred-script execution order is:
1. `pfc-export.js` (already defer, head)
2. `pfc-audit-mode.js` (newly defer, head)
3. `pfc-config.js` (newly defer, head)
4. `pfc-auth.js` (newly defer, head)
5. `pfc-crypto.js` (newly defer, head)
6. `pfc-storage.js` (newly defer, head)
7. `pfc-currency.js` (newly defer, head)
8. `pfc-user.js` (newly defer, head)
9. `pfc-entitlements.js` (newly defer, head)
10. `pfc-fonts.js` (already defer, head)
11. `pfc-sentry-scrub.js` (already defer, head)
12. Sentry CDN (already defer, head)
13. `pfc-sentry.js` (already defer, head)
14. Cloudflare beacon (already defer, head)
15. `pfc-analytics.js` (already defer, head)
16. `pfc-funnel.js` (already defer, head)
17. `pfc-sidebar.js` (already defer, head)
18. `pfc-anim.js` (already defer, body)
19. `net-worth-2.js` (newly defer, body) — reads PFCStorage/PFCUser ✓ they're defined
20. `net-worth-3.js` (newly defer, body) — reads PFCAuth ✓ it's defined
21. `pfc-inline-bootstrap.js` (already defer, body)

Sync scripts that run during parse (no contract violation):
- Chart.js CDN (head)
- Supabase CDN (head)
- net-worth-1.js (body, doesn't read PFC globals)
- inline mobile toggle script (body, only attaches event listeners on DOM nodes)

- [ ] **Step 6: Browser smoke test — describe the manual check**

Pre-flight: `git status` shows only `net-worth.html` modified.
User opens `/net-worth.html` in browser. Expected:
- Page renders within 200ms (LCP improvement)
- Net worth values populate (NOT zeros — that's the DASH-PROD-FIX failure mode)
- Sidebar nav active state correct
- Auth-required redirect works (sign-out → reload → bounced to sign-in)

- [ ] **Step 7: Commit**

```bash
git add net-worth.html docs/superpowers/plans/2026-05-24-nw-p1-7-defer-race.md
git commit -m "NW-P1-7: defer head scripts + body scripts atomically (PROD-FIX class)"
```

---

## Self-review

**Spec coverage:** Original spec was "defer 11 render-blocking head scripts; must atomically defer net-worth-2/3.js to avoid DASH-PROD-FIX." Plan covers both halves in one commit. ✓

**Placeholder scan:** No TBDs, no "similar to". Every step has exact line numbers and exact HTML. ✓

**Type consistency:** All `defer` attributes are valid HTML5 boolean attribute syntax. ✓

**Gotchas surfaced:** Supabase CDN left sync (deliberate — separate ticket), Chart.js left sync (existing file comment), net-worth-1.js left sync (verified safe by source read). ✓
