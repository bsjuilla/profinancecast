# ProFinanceCast Remediation Plan

## Problems observed (from current implementation)

1. **Account data is not isolated per authenticated user.**
   The app currently uses shared browser keys (e.g., `pfc_user`, `pfc_scenarios`, `pfc_report_history`) directly in `localStorage`, so user A and user B in the same browser can read/overwrite each other’s state.
2. **Pro pages can be opened directly via URL.**
   Navigation to Pro features may show an upgrade message in some flows, but direct routes (e.g., `scenarios.html`, `salary-calculator.html`, `report-card.html`) are not centrally access-controlled.
3. **Plan badge can be inconsistent/misleading.**
   Some pages render static labels such as “Pro plan” in sidebar HTML regardless of real entitlement.
4. **Google OAuth branding is not professional.**
   Google shows the raw Supabase project domain because OAuth configuration is using backend project identity instead of polished app/domain branding setup.

---

## Professional remediation process (phased)

## Phase 1 — Stabilize identity and session handling

### Goal
Create one source of truth for session/user identity across all pages.

### Existing files to inspect/update
- `auth.html` (sign-in/sign-up/OAuth entrypoint)
- `dashboard.html`
- `scenarios.html`
- `salary-calculator.html`
- `report-card.html`
- `goals.html`
- `net-worth.html`
- `debt-optimizer.html`
- `recurring.html`
- `settings.html`
- `billing.html`

### New file to create
- `js/pfc-auth.js`
  - Initializes Supabase client.
  - Exposes `getSession()`, `requireAuth()`, `getUserId()`, `getPlan()` helpers.
  - Handles redirect to `auth.html` when unauthenticated.
  - Emits a small app-level auth state event (`pfc:auth-ready`) for pages.

### Why this solves your issue
With a shared auth module, every page checks the same session source and knows exactly which user is logged in.

---

## Phase 2 — Namespaced data isolation per user

### Goal
Prevent one user’s financial data from appearing in another user’s session on the same browser/device.

### Existing files to inspect/update
Every file currently reading/writing `localStorage` keys:
- `dashboard.html`
- `scenarios.html`
- `salary-calculator.html`
- `report-card.html`
- `goals.html`
- `net-worth.html`
- `debt-optimizer.html`
- `recurring.html`

### New file to create
- `js/pfc-storage.js`
  - Prefix keys by authenticated user id, e.g. `pfc:{userId}:user`, `pfc:{userId}:scenarios`.
  - Backward-compatible migration helper:
    - One-time import from legacy keys (`pfc_user`, etc.) into user-scoped keys.
    - Optional cleanup of legacy keys after successful migration.

### Why this solves your issue
Even on one browser, account A and account B have separate storage namespaces, so switching account will not show previous account data.

---

## Phase 3 — Enforce Pro entitlement consistently

### Goal
Block non‑Pro users from Pro routes even if they open links directly.

### Existing files to inspect/update
- Pro feature pages:
  - `scenarios.html`
  - `salary-calculator.html`
  - `report-card.html`
- Navigation containers in:
  - `dashboard.html`
  - `goals.html`
  - `net-worth.html`
  - `settings.html`

### New file to create
- `js/pfc-entitlements.js`
  - `requirePlan(['pro','premium'])` route guard.
  - `applyPlanBadges()` to render `Free / Pro / Premium` accurately.
  - Optional UI helper to show upgrade card and disable gated actions.

### Why this solves your issue
Direct URL access gets intercepted by route guard, not just menu click logic.

---

## Phase 4 — Backend source of truth for membership

### Goal
Avoid trusting client-only plan values.

### Existing files to inspect/update
- `api/paypal/create-order.js`
- `api/paypal/capture-order.js`
- `api/paypal/card-order.js`
- `billing.html`
- `settings.html`

### New files to create
- `api/subscription/status.js`
  - Returns authoritative plan from server/database.
- `api/subscription/webhook-paypal.js`
  - Receives PayPal webhooks and updates plan status.
- `supabase/migrations/<timestamp>_subscriptions.sql`
  - Adds `subscriptions` table (`user_id`, `plan`, `status`, `current_period_end`, `provider`).

### Why this solves your issue
Plan access is based on verified payment/subscription state, not local client flags.

---

## Phase 5 — OAuth branding and production polish

### Goal
Replace “continue to ...supabase.co” style experience with your branded domain/app identity where possible.

### Configuration work (outside code, but mandatory)
1. In Google Cloud Console:
   - Set OAuth consent app name to **ProFinanceCast**.
   - Add authorized domain `profinancecast.com`.
   - Configure logo/support email.
2. In Supabase Auth settings:
   - Set **Site URL** and redirect URLs to your website domain.
   - Keep callback paths clean and production-only.
3. In `auth.html` UX copy:
   - Replace technical setup/debug wording with production-safe messaging.

### Note
Google’s account chooser can still show backend callback domain behavior depending on OAuth chain, but proper OAuth consent branding + domain configuration gives the most professional flow available.

---

## QA plan (must pass before release)

## Identity & isolation tests
- Sign in as user A, input data, sign out.
- Sign in as user B on same browser.
- Confirm user B does **not** see user A’s data.
- Switch back to user A and confirm data is preserved for A only.

## Entitlement tests
- Free account:
  - Directly open `scenarios.html`, `salary-calculator.html`, `report-card.html`.
  - Confirm redirected or blocked with upgrade UI.
- Pro account:
  - Same routes should open normally.

## Membership consistency tests
- After payment capture/webhook update, user plan updates without manual local edits.
- Sidebar and badges match backend subscription state on all pages.

## OAuth tests
- “Continue with Google” flow displays ProFinanceCast branding details correctly.
- Redirect returns to website and starts expected onboarding/dashboard.

---

## Rollout strategy

1. Ship Phase 1 + Phase 2 together (most urgent security/data correctness).
2. Ship Phase 3 immediately after (close Pro-access loopholes).
3. Ship Phase 4 with webhook monitoring + retry logging.
4. Finish Phase 5 UX polish and regression test end-to-end auth journey.

---

## Deliverables checklist

- [ ] `js/pfc-auth.js`
- [ ] `js/pfc-storage.js`
- [ ] `js/pfc-entitlements.js`
- [ ] `api/subscription/status.js`
- [ ] `api/subscription/webhook-paypal.js`
- [ ] `supabase/migrations/*_subscriptions.sql`
- [ ] Updated page integrations (all listed HTML files)
- [ ] Cross-account isolation test evidence
- [ ] Pro-gate test evidence
- [ ] OAuth branding configuration evidence
