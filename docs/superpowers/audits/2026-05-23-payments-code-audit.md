# Payments Code Security Audit — 2026-05-23

Scope: PayPal-based payment system (Vercel serverless backend + billing.html frontend).
Auditor: Claude Opus 4.7 (deep read of all files listed in scope).
Method: Line-by-line read of all 11 files. Cross-checked client/server price tables, webhook idempotency, auth coverage, and trust/UX signals against the launch checklist.

**Headline risk**: The system is in **substantially better shape than typical pre-launch PayPal integrations** — webhook signature verification is wired up, the create/capture flow re-derives prices server-side, and the cancel flow respects period-end. However there are **two P0 launch blockers** (client/server price drift on Pro & Premium, missing user-scoping on the refund webhook handler) and several P1 correctness bugs around the Founders cap and webhook idempotency that should be fixed before real money flows through this code.

---

## P0 — Security-critical (must fix before launch)

### 1. Server price table disagrees with frontend prices (Pro & Premium)
**File**: `api/paypal/create-order.js:16-20` vs `js/inline/billing-1.js:46-58, 64-67, 73-77`
**Severity**: P0
**Description**: The frontend prices Pro at `€9/mo`, `€79/yr`, Premium at `€19/mo`, `€169/yr`, and calls `openCheckout('pro_annual', 79)`. The server's `PLAN_PRICES` table is `{ pro_monthly: 9, pro_annual: 69, founders: 149 }` (no premium, and annual is **$69 not $79**). On `capture-order.js:108`, the server compares `amountPaid` to `PLAN_PRICES[plan]` and **rejects with HTTP 409 "Payment amount mismatch"** — but PayPal will already have captured the funds. Every real Pro Annual purchase will fail to upgrade the user and trigger a manual support ticket. Premium SKUs aren't in the server table at all → `400 "Invalid plan"` before the order is even created.
**Fix**: Reconcile both tables to one source of truth (e.g. shared JSON shipped to client and server) and add `premium_monthly`/`premium_annual` to `PLAN_PRICES`, `PLAN_DESCRIPTIONS`, `SKU_TO_PLAN`, and `PLAN_PERIOD_DAYS`.

### 2. Currency mismatch — UI shows EUR (€), server charges USD
**File**: `api/paypal/create-order.js:84` (`currency_code: 'USD'`), `api/paypal/capture-order.js:108`, `js/inline/billing-1.js:137` (`currency=USD` in SDK), `billing.html:1228, 1278, 1444` (all `€`)
**Severity**: P0
**Description**: Every price the user sees is denominated in `€` (Euro), but the order is created and captured in `USD`. EU users will be charged ~8–10% more than the advertised price (depending on FX). This is consumer-protection / mis-selling exposure in the EU on top of the trust loss.
**Fix**: Decide on one currency. If EUR, change `currency_code` to `'EUR'` in `create-order.js:84` and the SDK URL in `billing-1.js:137`; if USD, change all UI symbols to `$`.

### 3. Webhook handler refund branch uses stale `eventType` for matching
**File**: `api/subscription/webhook-paypal.js:223-228`
**Severity**: P0
**Description**: The refund branch does `supabase.from('subscriptions').update({...}).eq('user_id', userId)` with **no further scoping**. If a user has had multiple subscriptions over time (refund, then re-purchase Pro), the refund of an *old* capture will downgrade the user's *current* active subscription. Should match on `provider_capture_id` (or `provider_order_id`) so the refund only affects the row that captured those funds.
**Fix**: Add `.eq('provider_capture_id', captureId)` to the update, and treat zero rows updated as a logged anomaly.

### 4. Founders seat cap not enforced server-side at purchase time
**File**: `api/paypal/create-order.js:54-104` (no seat check); `api/founders-claimed.js:21` (cap=500); `billing.html:1275` ("Limited — 100 seats"); `billing-1.js:286` (`cap || 100`)
**Severity**: P0
**Description**: The Founders Lifetime SKU advertises a hard cap (UI says 100; server says 500 — already inconsistent). `create-order.js` happily creates a `founders` order regardless of how many seats are claimed, and `capture-order.js` will upsert the row whether it's #101 or #1000. Two users clicking "Claim" simultaneously when one seat remains both succeed and pay €149. There is no `SELECT … FOR UPDATE`, no DB unique constraint, no transactional check before order creation.
**Fix**: Inside `create-order.js`, for plan==='founders' run `SELECT count(*) FROM subscriptions WHERE amount_usd=149 AND status<>'refunded'` and reject when `>= CAP`. Better: add a Postgres function `claim_founders_seat(user_id)` that does the count-and-reserve in a single transaction, or add a `founders_seat_number` column with a unique constraint where number <= CAP.

### 5. Founders cap is 100 in marketing copy, 500 in the API
**File**: `api/founders-claimed.js:21` (`FOUNDERS_CAP = 500`); `billing.html:1275, 1288` ("100 seats", "closes day 30"); `billing-1.js:286` (`const cap = data.cap || 100`)
**Severity**: P0 (legal / consumer-protection — advertised scarcity must be real)
**Description**: Marketing claims "Limited — 100 seats". API returns `cap: 500`. If you actually sell more than 100 the "Limited 100" claim is false advertising; if `cap` accidentally drops to a small number the count freezes.
**Fix**: Pick a number, hard-code it in **one** place (server), drop the `|| 100` fallback in `billing-1.js:286`.

### 6. Webhook `PAYMENT.CAPTURE.COMPLETED` amount-to-plan mapping is broken
**File**: `api/subscription/webhook-paypal.js:155-164`
**Severity**: P0
**Description**: The mapping says `if (v === '9.99' || v === '9.00') plan = 'pro'`, `'69.00' → 'pro'`, `'149.00' → 'pro'`, `'19.99' → 'premium'`. But the real prices in `create-order.js` are `9.00`, `69.00`, `149.00` — there is **no `9.99`**, **no `19.99`** is ever charged, and **annual is `69.00` not `79.00`** despite the UI charging `€79`. Once you fix issue #1 (annual=79, plus `premium_monthly=19`, `premium_annual=169`), this mapping table will silently send every captured fallback payment to the `console.warn("matched no plan")` branch and **the user will never be upgraded**.
**Fix**: Replace the amount-based switch with a lookup keyed on the actual reference_id / custom_id we sent in `create-order.js:83` (e.g. encode `${userId}:${sku}` and parse it back here). Don't drive plan inference from amounts.

### 7. Webhook idempotency check ignores stored events — only checks current sub row
**File**: `api/subscription/webhook-paypal.js:146-152`
**Severity**: P0
**Description**: PayPal retries webhooks up to ~25 times. The idempotency guard at line 147 reads `subscriptions.provider_capture_id` and skips if it matches — but only if `status === 'active'`. If the same capture event arrives twice in quick succession before the first upsert lands, both pass the guard and both upsert. More critically, *refund* and *subscription cancelled* branches have **no idempotency check at all** — every retry of the same event re-runs the update, re-resets `cancelled_at`, and (depending on event ordering) can resurrect/re-bury subscriptions.
**Fix**: Insert into a `webhook_events_processed` table keyed on `event.id` (PayPal's globally-unique event id) with a UNIQUE constraint as the **first** step in `handler()` after signature verification; bail with 200 on duplicate.

### 8. Capture endpoint has no idempotency on retries
**File**: `api/paypal/capture-order.js:73-167`
**Severity**: P0
**Description**: `POST /api/paypal/capture-order` is unauthenticated against replay. The client retries on network errors; the upsert at line 123 has `onConflict: 'user_id'` so the DB row is fine — but the **PayPal capture call** at line 89 is not guarded by a `PayPal-Request-Id` idempotency header (it is set on order *creation* at line 77 but not on capture). PayPal's capture endpoint **is** idempotent server-side via order state, so a second capture on an already-captured order returns `UNPROCESSABLE_ENTITY` — your code at line 93 treats that as `502 Payment capture failed` and the client sees a generic error. Worse, the success path resets `ai_queries_used = 0` (line 159) on every re-capture attempt that lands after the first — a user gets a fresh quota by replaying the request as long as the PayPal capture is somehow not yet final.
**Fix**: Add a pre-flight `SELECT … WHERE provider_order_id = orderID` — if the row exists and is `active`, short-circuit with the existing record. Also add `PayPal-Request-Id` to the capture fetch.

### 9. `_verifyUser` does not validate that the token's email is confirmed
**File**: `api/paypal/create-order.js:28-39`, `api/paypal/capture-order.js:50-58`
**Severity**: P0
**Description**: `supabase.auth.getUser(token)` returns a user record even when `email_confirmed_at` is null. An attacker who signs up with a throwaway address can immediately upgrade — fine for upgrades, but combined with the refund flow this is the standard "credit card test / chargeback farm" attack against new SaaS payment endpoints. Also, the OWNER_EMAILS override in `status.js:56` matches on `userEmail` from the JWT — if Supabase ever returns an unverified email, an attacker who registers `business060407@gmail.com` (unverified) gets owner override.
**Fix**: Reject in `_verifyUser` when `!data.user.email_confirmed_at`. Bonus: in `status.js`, also gate the OWNER_EMAILS branch on `email_confirmed_at`.

### 10. Webhook handler `_verifySignature` passes `req.body` (parsed JSON) — must be **raw** body
**File**: `api/subscription/webhook-paypal.js:62`
**Severity**: P0
**Description**: PayPal's `verify-webhook-signature` endpoint actually accepts the parsed JSON in the `webhook_event` field, so this *may* work — but **only if your raw body is byte-identical to `JSON.stringify(req.body)` you re-emit**. Vercel's default body parser re-orders keys and changes whitespace. The result is that signature verification will fail for any non-trivially-shaped payload, and you'll silently reject **all** real webhooks (you'll see 401s in logs). Easy to miss in sandbox because the test events have stable shapes.
**Fix**: Switch to a raw-body Vercel handler (`export const config = { api: { bodyParser: false } }`), buffer the raw body, and pass the buffer-decoded original string to `webhook_event` — *or* keep parsed JSON but explicitly disable bodyParser and verify before parsing.

### 11. `PFC_CONFIG.PAYPAL_CLIENT_ID` injected into a `<script src>` URL — XSS via config
**File**: `js/inline/billing-1.js:137`
**Severity**: P0
**Description**: `script.src = \`https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}…\``. `PAYPAL_CLIENT_ID` is sourced from `window.PFC_CONFIG.PAYPAL_CLIENT_ID` with no validation. If `pfc-config.js` is ever set from user-controlled data (e.g. a query param, a build-time env that includes special chars, an attacker who can edit the config file), a value like `XYZ"></script><script>...evil...</script>` would inject script. The risk is low if `pfc-config.js` is fully static — but the audit asks us to flag it.
**Fix**: Validate `PAYPAL_CLIENT_ID.match(/^[A-Za-z0-9_-]+$/)` before assigning to `script.src`. Also consider a Content-Security-Policy with `script-src 'self' https://www.paypal.com https://cdn.jsdelivr.net …`.

### 12. No CORS / origin restriction on payment endpoints
**File**: All `api/paypal/*.js` and `api/subscription/*.js`
**Severity**: P0
**Description**: None of the endpoints check `req.headers.origin` or `referer`. A malicious site can host JavaScript that, when a logged-in ProFinanceCast user visits it, calls `/api/subscription/cancel` (POST, no CSRF token, no origin check, no SameSite-secured cookie because auth is a `Authorization: Bearer` header — the attacker can't read it from another origin, *but* the user's session token may leak via any open `postMessage` channel or an XSS elsewhere). The Bearer-token model is the real saving grace, but `cancel`/`create-order`/`capture-order` should still check `req.headers.origin === APP_ORIGIN` as defense in depth.
**Fix**: Add `if (req.headers.origin && req.headers.origin !== process.env.APP_ORIGIN) return res.status(403)` at the top of every mutating endpoint.

---

## P1 — Correctness

### 13. `capture-order.js` blindly overwrites the subscription row — losing renewal history
**File**: `api/paypal/capture-order.js:123-135` (`upsert ... onConflict: 'user_id'`)
**Severity**: P1
**Description**: A user who buys `pro_monthly`, then 30 days later buys another `pro_monthly`, will have the first `provider_capture_id` and `current_period_end` overwritten. There is no `subscription_periods` history table. Combined with the refund branch (issue #3) — without history it's hard to know which capture to refund.
**Fix**: Make `subscriptions` a "current state" table and append every period to `subscription_periods (id, user_id, sku, capture_id, period_start, period_end, amount_usd)`. The webhook already inserts into `subscription_events` for audit — extending that pattern is a small lift.

### 14. Renewal logic is **not implemented** — subscriptions never renew
**File**: `api/paypal/capture-order.js:122` sets `current_period_end = now + 30 days` once, then `status.js:92` returns "free" when expired. There's no cron, no PayPal Billing Subscription, no auto-charge.
**Severity**: P1
**Description**: This is documented in the UI ("Access pass — extend manually for now. Auto-renewal coming Q2." at `billing.html:1232, 1260`). It's honest, but it means every user must remember to re-purchase or they silently lose Pro at day 30 — high churn risk and a UX trap. The webhook subscribes to `BILLING.SUBSCRIPTION.CANCELLED` and `BILLING.SUBSCRIPTION.EXPIRED` (lines 238-258) but these never fire because no PayPal subscription is created — those handlers are dead code today.
**Fix**: For launch, send a reminder email at day 25; longer term, move to PayPal Billing Plans (subscription product) and create a `BillingAgreement` instead of a one-shot order.

### 15. Time-zone bug in `current_period_end` (30 calendar days vs 1 month)
**File**: `api/paypal/capture-order.js:122` — `Date.now() + 30 * 24 * 60 * 60 * 1000`
**Severity**: P1
**Description**: 30 days != 1 month. A user buying on the 31st of January renews after Feb 30 (Feb 28/29 + lap into March). For Founders the 100-year period is `365 * 100 * 24h` = 100 calendar years minus ~25 leap days, expiring in ~Aug 2125 instead of May 2126 — small but real. Same in webhook fallback line 166-167.
**Fix**: Use UTC-aware `addMonths(1)`/`addYears(1)` from a date library, or `to_timestamp + interval '1 month'` SQL.

### 16. No retry / no graceful degradation when PayPal returns 5xx
**File**: `api/paypal/create-order.js:98-101`, `capture-order.js:93-96`
**Severity**: P1
**Description**: A single PayPal 5xx fails the whole request. PayPal's API has documented transient outages. The client's `onError` (billing-1.js:190-194) shows a vague "Payment failed" — user re-clicks, two orders created, possibly two captures if both succeed.
**Fix**: Wrap PayPal fetches in retry-with-jittered-backoff (max 2 retries, 5xx + network only); always include `PayPal-Request-Id` to make those retries idempotent on PayPal's side.

### 17. Webhook `PAYMENT.CAPTURE.COMPLETED` falls open on `userId = null`
**File**: `api/subscription/webhook-paypal.js:128-144`
**Severity**: P1
**Description**: The code logs `webhook_unresolvable_user` and returns 200. That's intentional (so PayPal stops retrying) but it also means: if a real user's webhook arrives missing `custom_id` (e.g. PayPal silently drops it on Smart Buttons), the user pays €149 and nothing happens. There's no alert to operations beyond a Sentry log.
**Fix**: Hook this branch into a paging alert (Sentry → PagerDuty, or simply email founder@). Also store the user's email at order-creation time so we have a fallback to look up the user.

### 18. `status.js` returns 200 on DB error — silently downgrades users to free
**File**: `api/subscription/status.js:77-85`
**Severity**: P1
**Description**: When Supabase is unreachable or the query errors, the endpoint returns `{plan: 'free'}` with HTTP 200. The browser will then strip Pro features for **all** users until Supabase recovers. The `_reason: 'db_error'` is helpful for diagnostics but the client doesn't act on it.
**Fix**: Return HTTP 503 (or 200 with `status: 'unknown'`) **and** make the client preserve the last-known plan on `unknown`/`5xx` rather than defaulting to Free.

### 19. `subscriptions` schema isn't constrained to one row per user
**File**: `api/subscription/cancel.js:36-40` does `.maybeSingle()`; `capture-order.js` does `.upsert({...}, { onConflict: 'user_id' })`
**Severity**: P1
**Description**: This *assumes* a unique constraint on `user_id`, but if migrations ever miss adding it (or if a manual SQL fixup inserts a second row), `.maybeSingle()` throws a 406 and cancellation/status calls error out for that user permanently. Also `founders-claimed.js:45` counts rows with `amount_usd=149` — duplicate rows for the same user inflate the count.
**Fix**: Verify the migration adds `UNIQUE (user_id)` on `subscriptions`. Add a Supabase RLS policy preventing duplicate inserts.

### 20. Refund handler unconditionally sets `profiles.plan = 'free'`
**File**: `api/subscription/webhook-paypal.js:229, 252`
**Severity**: P1
**Description**: A refund on an *old* capture (e.g. user got a goodwill refund for January, but has an active May subscription) downgrades the user's current `profiles.plan`. Same root cause as issue #3.
**Fix**: Only set `profiles.plan = 'free'` when the *current* `subscriptions` row was the one refunded.

### 21. Plan-mismatch capture leaves money in limbo
**File**: `api/paypal/capture-order.js:108-113`
**Severity**: P1
**Description**: When amount differs from expected, the server returns 409 — but PayPal has already captured the money. There's no automatic refund, no `subscription_events` log, no Sentry alert. Just `console.error`. Operations has to discover the orphan via PayPal dashboard.
**Fix**: On amount mismatch, call PayPal `refund` endpoint immediately (or schedule via `subscription_events` with a job that processes pending refunds), and log to Sentry.

### 22. `PFCPlan` client cache can serve stale "pro" after refund
**File**: `js/inline/billing-1.js:174-188` calls `PFCPlan.refresh()` after capture; nothing refetches after a webhook-triggered refund
**Severity**: P1
**Description**: When a refund is processed via webhook, the user's open browser tab keeps showing Pro UI until the next reload — they can keep using Pro features (e.g. burn Sage AI quota) for hours. Especially bad if the refund is fraud-driven.
**Fix**: Refresh `PFCPlan` on `visibilitychange` and at least every 10 minutes for users on paid tiers. Better: server-sent events / Supabase realtime subscription on the `subscriptions` row.

### 23. Currency hard-coded to USD in webhook fallback
**File**: `api/subscription/webhook-paypal.js:113` (`currency = resource.amount?.currency_code || 'USD'`)
**Severity**: P1
**Description**: If currency is anything other than what the plan expects, this branch still upgrades the user. Combine with the €/USD mismatch in issue #2: a refund webhook for `'EUR 9.00'` (which would happen if any test was run in EUR) gets normalized to plan='pro' and upgrades.
**Fix**: Reject the webhook upsert when currency doesn't match the expected currency for the plan.

### 24. No PII redaction in error logs
**File**: `api/paypal/capture-order.js:144-149` (logs `userId`, `orderID`, `captureId`, `amountPaid`); `api/subscription/webhook-paypal.js:99-100, 141` (raw_payload includes full PayPal event)
**Severity**: P1
**Description**: PayPal webhook payloads include `payer.email_address`, billing addresses, and (for disputes) names/notes. These end up in `subscription_events.raw_payload` (JSONB) and in Vercel logs. If `subscription_events` is exposed via PostgREST/Supabase API without RLS, this is a PII leak.
**Fix**: Strip `payer`, `addresses`, and free-text fields from `raw_payload` before insert; ensure `subscription_events` has RLS deny-by-default.

### 25. `_logEvent` does not await — failures swallow silently inside event handlers
**File**: `api/subscription/webhook-paypal.js:90-104` — `_logEvent` is `async` but several call sites (`break` immediately after) don't await all error paths; the `try { … } catch` inside `_logEvent` itself swallows errors silently.
**Severity**: P1
**Description**: If audit logging fails (RLS error, table missing column), the handler still returns 200, no Sentry breadcrumb, and we lose the audit trail. M3 (audit trail) is meant to be append-only and reliable.
**Fix**: Propagate the error to Sentry (don't swallow with `catch (e) { console.error … }`). Consider a fallback to a dead-letter table.

### 26. Disputes mark `dispute_open` but don't suspend access
**File**: `api/subscription/webhook-paypal.js:261-273`
**Severity**: P1
**Description**: When a chargeback dispute is opened, you continue to provide Pro service while PayPal investigates. Most disputes are legitimate fraud signals — a user disputing while still consuming Sage AI quota is a red flag. Also `_logEvent.user_id` is `null` here (line 264) — the linkage between dispute and user happens via `provider_capture_id` two lines later, but the audit-trail entry is orphaned.
**Fix**: Look up `user_id` from `subscriptions` where `provider_capture_id = orderId`, populate `_logEvent.user_id`, and consider auto-pausing AI queries (`profiles.ai_queries_limit = 0`) for the dispute duration.

### 27. `founders-claimed.js` count includes refunded/cancelled rows
**File**: `api/founders-claimed.js:45-49` — `.neq('status', 'refunded')`
**Severity**: P1
**Description**: The refund webhook sets `status = 'cancelled'`, not `'refunded'` (see webhook line 224). So a refunded Founders purchase still counts toward the cap. The comment at line 41-44 says "we exclude rows whose status was explicitly set to 'refunded'" but the code path that should set `refunded` doesn't exist.
**Fix**: Either set `status='refunded'` in the refund branch (and add to status.js's "is active" check), or change the filter to `.neq('status','cancelled').neq('status','refunded')`.

### 28. `created_at` is not set — only `updated_at`
**File**: `api/paypal/capture-order.js:134`
**Severity**: P1
**Description**: Forensic audits ("when did this user first become Pro?") require `created_at`. Postgres will default it if the column has `DEFAULT now()`, but on upsert-with-conflict-on-user_id the existing row's `created_at` is preserved — that's correct, but only if the column actually defaults. If the migration doesn't define a default, every new sub has `created_at = NULL`.
**Fix**: Verify the migration declares `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`.

### 29. The `_reason` debug field is leaked to clients
**File**: `api/subscription/status.js:65, 95-98, 119`
**Severity**: P1 (information disclosure)
**Description**: `_reason: 'owner_override'` and `_ownerEmailsConfigured: true` are returned to **any authenticated user** that hits the status endpoint. That tells an attacker (a) that OWNER_EMAILS exists as a server-side allowlist, (b) likely how to bypass payments. Not catastrophic but unnecessary exposure.
**Fix**: Strip `_reason` and `_ownerEmailsConfigured` in production builds (gate on `process.env.NODE_ENV !== 'production'` or a `?debug` query param the server validates against a debug header).

---

## P2 — Trust / UX

### 30. Refund policy not visible near the payment button
**File**: `billing.html:1383` mentions "14-day money-back" in the risk-reversal section, but the checkout modal (`#overlay` at line 1418) has no refund copy.
**Severity**: P2
**Description**: Industry best practice is to display the refund window at the point of payment, not 8 sections up the page. Users completing PayPal don't see it.
**Fix**: Add a single line under `#summary-total` in the modal: "14-day money-back. Email support to refund — no forms."

### 31. "14-day free trial" advertised but never wired up
**File**: `billing.html:1181, 1244, 1348` — copy promises a 14-day trial; `billing-1.js:63-78`, `create-order.js:54+` — no trial logic.
**Severity**: P2 (potential deceptive-marketing claim)
**Description**: The CTA says "Start 14-day free trial" but clicking it immediately opens the PayPal payment modal with the full price. Users who proceed are charged at once. This could be reported to ASA/FTC as misleading.
**Fix**: Either implement a real trial (PayPal Vault + delayed billing, or set `profiles.plan = 'pro_trial'` and `current_period_end = now+14d` with no charge), or change the copy everywhere to "Upgrade to Pro".

### 32. "No card required" claim contradicts the immediate-payment flow
**File**: `billing.html:1245, 1270` — "No card required." appears under the CTA, but the CTA opens a PayPal/card modal.
**Severity**: P2
**Description**: Same as #31 — copy doesn't match behavior.
**Fix**: Remove "No card required" from the Pro/Premium cards until you actually have a no-card trial.

### 33. Cancellation flow is two clicks deep and triggers a `window.confirm` (no styling, no period-end shown)
**File**: `js/inline/billing-1.js:254-268`, `billing.html:1406`
**Severity**: P2
**Description**: Best practice is in-modal cancellation with a clear "Your Pro access ends on <date>" and a brief retention prompt. `window.confirm("Cancel your subscription?")` looks like a phishing alert on Mac.
**Fix**: Replace the native confirm with a styled modal that shows `current_period_end` and a "Pause for 1 month" / "Tell us why" alternative.

### 34. Error messages after capture failure are vague
**File**: `js/inline/billing-1.js:186-194` — `alert(result.error || 'Payment could not be completed. Please try again.')`
**Severity**: P2
**Description**: When the server returns the "Payment captured but account upgrade failed" message (capture-order.js:151) it includes the `captureID` — but the client's alert just dumps the whole `result.error` string. The user has no clear next step. Also `onError` falls back to "Payment failed. Please try again or use card payment." — but cards already go through the same PayPal flow.
**Fix**: Build a small error matrix (`code → user-message + recovery-action`), and surface `captureID` as a copy-able support reference.

### 35. PayPal SDK loaded with `currency=USD` but UI is `€` — same as P0 issue #2, but surfaces as user confusion
**File**: `js/inline/billing-1.js:137`
**Severity**: P2 (UX consequence of P0 fix)
**Description**: Even after fixing #2, the user will see the **converted** amount in the PayPal popup, which won't match the headline price exactly due to FX rounding. Either bill in EUR or warn users.
**Fix**: After fixing #2, add a note: "Charged in USD; your card issuer may apply FX."

### 36. No PCI / SSL trust signals at the modal level
**File**: `billing.html:1471-1474, 1493-1496`
**Severity**: P2
**Description**: The "Secured by PayPal" line is present but tiny. There's no SSL lock icon, no Norton/McAfee badge, no "PayPal Buyer Protection" copy. For an unknown brand selling €169 subs, this is the difference between completion and abandonment.
**Fix**: Add a small trust strip near the PayPal button: PayPal logo + "Buyer Protection" + a padlock + "256-bit SSL".

### 37. Billing history table is overwritten with one synthetic row on success
**File**: `js/inline/billing-1.js:242-251`
**Severity**: P2
**Description**: `tbody.innerHTML = '<tr>...'` replaces the entire history with just the latest purchase. Returning users with prior charges see only the current one. Also the table is client-rendered with no server source, so on refresh they see "No payments yet".
**Fix**: Fetch billing history from a server endpoint (e.g. `/api/subscription/history` reading from `subscription_events`) and render server-side data on every load.

### 38. `confirm Cancel` alerts use `alert()` and `confirm()` — high-friction, no analytics
**File**: `js/inline/billing-1.js:255, 262, 265`
**Severity**: P2
**Description**: Native dialogs can't be styled, can't be A/B-tested, and don't fire any tracking events on dismiss. You won't know how many users *abandoned* the cancel flow vs completed it.
**Fix**: Replace with the same styled modal and add `PFCFunnel.track('pfc.cancel_intent' / '.cancel_confirmed' / '.cancel_abandoned')`.

### 39. PayPal SDK URL doesn't restrict funding sources
**File**: `js/inline/billing-1.js:137`
**Severity**: P2
**Description**: The SDK URL doesn't pass `disable-funding=` or `enable-funding=`. In some regions PayPal will show "Pay Later" / "Venmo" buttons that the order doesn't expect, leading to flows the server hasn't tested.
**Fix**: Pin allowed funding sources: `…&components=buttons&enable-funding=card,paypal&disable-funding=paylater,venmo`.

### 40. `pfc-config.js` is loaded over the network without integrity check
**File**: `billing.html:29`
**Severity**: P2
**Description**: If `pfc-config.js` ever gets served from a CDN or a compromised origin, the `PAYPAL_CLIENT_ID` could be swapped to point at an attacker's PayPal app — funds go to the attacker, users see your branding. Same goes for the Supabase URL/anon key.
**Fix**: Either inline the config into the HTML (server-rendered) or add a Subresource-Integrity (SRI) hash; combine with a strict CSP.

---

## Summary

| Severity | Count |
|---|---|
| P0 | 12 |
| P1 | 17 |
| P2 | 11 |
| **Total** | **40** |

### Top 5 fixes to ship before any real-money traffic
1. **Reconcile the price tables** between client (billing-1.js) and server (create-order.js / capture-order.js). Today, Pro Annual is **guaranteed to fail at capture** for every paying user. (P0 #1, #6)
2. **Pick one currency** (EUR or USD) and use it everywhere — UI, SDK URL, server. EU users will be over-charged today. (P0 #2)
3. **Add server-side Founders-seat enforcement** with a transactional count-and-reserve. The cap is currently un-enforced. (P0 #4, #5)
4. **Switch the webhook to raw-body signature verification.** Today, parsed-body verification is fragile and may silently reject all real webhooks. (P0 #10)
5. **Add webhook idempotency on `event.id`** with a unique constraint, and scope refund updates on `provider_capture_id`. (P0 #3, #7)

### Things this codebase already does **well** (worth preserving)
- Server re-derives prices from a server-only table; client cannot tamper with `amount` (intent is right; only the table values are wrong).
- Webhook signature verification is wired up (just needs the raw-body fix).
- The cancel-at-period-end pattern is correctly implemented in `cancel.js`.
- Owner override is server-side and gated on email lookup (just remove `_reason` leakage).
- The `card-order.js` PCI escape hatch (returning 410) is exactly right — keep it.
- Audit-trail table (`subscription_events`) exists and is wired into most paths.
