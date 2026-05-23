# W25 Payments P0 — Money-Loss Trio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task inline. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the three P0 findings from the W25 audit that would cause real money loss on every paying customer. Defer the other 9 P0s to W26 (they require schema migrations + atomic SQL patterns that need their own focused session).

**Architecture:** Three surgical fixes, each touching 1-3 files. No new abstractions, no schema migrations, no new endpoints. Each fix is verifiable with `node --check` + the `security-review` skill on the diff.

**Tech Stack:** Vercel serverless (Node runtime), PayPal v2/checkout/orders + v1/notifications/verify-webhook-signature, Supabase service-role inserts.

**Scope honesty:** This plan deliberately does NOT include:
- #3/#20 Refund handler scoping (needs `provider_capture_id` lookup pattern + new "current capture" linkage)
- #4/#5 Founders cap atomic enforcement (needs DB function + pre-numbered seats table)
- #7 Webhook idempotency (needs `webhook_events_processed` table migration)
- #8 Capture replay (needs `PayPal-Request-Id` + preflight existence check)
- #9 Unverified emails (needs `_verifyUser` refactor across 3 endpoints)
- #11 XSS validation on PAYPAL_CLIENT_ID (1-line regex — easy add but defer for batching)
- #12 Origin check on mutating endpoints (helper + ~6 call sites — also defer)

All of the above queue for **W26 — Payments P0 batch B**.

---

## File Structure

| File | Role | Changed in |
|---|---|---|
| `api/paypal/create-order.js` | Server-side price source + order creation | Tasks 1, 2 |
| `api/paypal/capture-order.js` | Server-side price verification + DB upsert | Tasks 1, 2 |
| `api/subscription/webhook-paypal.js` | PayPal webhook handler — sig verify + event dispatch | Tasks 1, 2, 3 |
| `js/inline/billing-2.js` | PayPal SDK loader (sets currency in URL) | Task 2 |

Total: 4 files modified, 0 created, 0 deleted.

---

## Task 1: Reconcile PLAN_PRICES (Premium SKUs + Pro Annual price)

**Files:**
- Modify: `api/paypal/create-order.js:16-25`
- Modify: `api/paypal/capture-order.js:23-40`
- Modify: `api/subscription/webhook-paypal.js:155-167` (the amount→plan mapping in `PAYMENT.CAPTURE.COMPLETED`)

### Why this is P0

Frontend (billing-2.js) charges `pro_annual` at 79, `premium_monthly` at 19, `premium_annual` at 169. Server has `pro_annual: 69`, NO `premium_monthly`, NO `premium_annual`. Every Premium purchase → 400 "Invalid plan" before order creation. Every Pro Annual purchase → 409 "Payment amount mismatch" AFTER PayPal captures funds. **Money is taken, entitlement is not granted.** This is the worst-case failure mode for a payment system.

- [ ] **Step 1: Update `api/paypal/create-order.js:16-25` — add premium SKUs and fix pro_annual price**

```javascript
// SKU prices — must match client (js/inline/billing-2.js openCheckout calls)
// AND capture-order.js PLAN_PRICES AND webhook-paypal.js fallback table.
// W25 P0 #1: aligned with billing-2.js openProCheckout (79), openPremiumCheckout
// (19/169) and the Founders €149 one-time.
const PLAN_PRICES = {
  pro_monthly:     9,
  pro_annual:      79,
  premium_monthly: 19,
  premium_annual:  169,
  founders:        149,
};
const PLAN_DESCRIPTIONS = {
  pro_monthly:     'ProFinanceCast Pro — Monthly',
  pro_annual:      'ProFinanceCast Pro — Annual',
  premium_monthly: 'ProFinanceCast Premium — Monthly',
  premium_annual:  'ProFinanceCast Premium — Annual',
  founders:        'ProFinanceCast Founders Lifetime',
};
```

- [ ] **Step 2: Update `api/paypal/capture-order.js:23-40` — mirror the price table + add premium entitlement entries**

```javascript
const PLAN_PRICES  = {
  pro_monthly:     9,
  pro_annual:      79,
  premium_monthly: 19,
  premium_annual:  169,
  founders:        149,
};

// All Pro SKUs grant 'pro' entitlement; Premium SKUs grant 'premium'.
// 'plan' column on subscriptions is the entitlement tier, NOT the SKU.
const SKU_TO_PLAN  = {
  pro_monthly:     'pro',
  pro_annual:      'pro',
  premium_monthly: 'premium',
  premium_annual:  'premium',
  founders:        'pro',
};

const PLAN_QUERIES = { pro: 200, premium: 500 };

const PLAN_PERIOD_DAYS = {
  pro_monthly:     30,
  pro_annual:      365,
  premium_monthly: 30,
  premium_annual:  365,
  founders:        365 * 100,
};
```

Note: changed `PLAN_QUERIES.premium` from 150 → 500. The billing.html copy promises Premium gets 500 Sage messages/month (W14-C commit). Old value 150 was wrong.

- [ ] **Step 3: Update webhook `PAYMENT.CAPTURE.COMPLETED` amount→plan mapping at `api/subscription/webhook-paypal.js:155-167`**

Replace the brittle amount-based switch with a parse of `reference_id` (which create-order.js sets to `${user.id}:${plan}` at line 83). The current switch is wrong on every value and was never going to work after this price fix.

```javascript
// W25 P0 #6 fix: parse the reference_id we set in create-order.js
// (line 83: reference_id = `${user.id}:${plan}`) instead of inferring
// plan from amount. Amount inference is brittle — any price change in
// PLAN_PRICES silently breaks this handler. Parsing the reference_id
// makes the mapping unambiguous.
const pu = resource.purchase_units?.[0] || {};
const refId = pu.reference_id || '';
const [refUserId, refSku] = refId.split(':');
const sku = refSku && ['pro_monthly','pro_annual','premium_monthly','premium_annual','founders'].includes(refSku) ? refSku : null;
const plan = sku ? ({
  pro_monthly: 'pro', pro_annual: 'pro',
  premium_monthly: 'premium', premium_annual: 'premium',
  founders: 'pro',
}[sku]) : null;

if (!plan || !sku) {
  console.warn('[webhook] capture-completed: could not derive plan from reference_id', { refId });
  await _logEvent({ event_type: eventType, user_id: userId || null, raw_payload: event, _reason: 'no_plan_match' });
  break;
}
```

- [ ] **Step 4: Verify all 3 files**

Run:
```bash
node --check api/paypal/create-order.js
node --check api/paypal/capture-order.js
node --check api/subscription/webhook-paypal.js
```
Expected: all three exit 0.

- [ ] **Step 5: Grep for any other place the old prices appear**

Run:
```bash
grep -rn "69\|\b9\b.*pro_monthly\|pro_annual.*69" api/ js/
```
Expected: only legitimate matches (e.g. comments documenting the change). Investigate any other code-path hits.

---

## Task 2: Currency match — EUR everywhere

**Files:**
- Modify: `api/paypal/create-order.js:84` (`currency_code: 'USD'` → `'EUR'`)
- Modify: `api/paypal/capture-order.js:108` (the `currencyPaid !== 'USD'` check)
- Modify: `js/inline/billing-2.js:137` (SDK URL `&currency=USD` → `&currency=EUR`)
- Modify: `api/subscription/webhook-paypal.js:113` (the `'USD'` fallback default)

### Why this is P0

Every price the user sees is in €. Server creates orders in $. **EU customers pay ~8-10% more than the advertised price** (depending on FX). Consumer-protection / mis-selling exposure on top of the trust loss. This is also a contradiction with the "we charge in EUR per pricing.md" Wave-13 decision.

- [ ] **Step 1: Update `api/paypal/create-order.js:84`**

Change:
```javascript
amount: { currency_code: 'USD', value: amount.toFixed(2) },
```
To:
```javascript
amount: { currency_code: 'EUR', value: amount.toFixed(2) },
```

- [ ] **Step 2: Update `api/paypal/capture-order.js:108`**

Change:
```javascript
if (currencyPaid !== 'USD' || Math.abs(amountPaid - PLAN_PRICES[plan]) > 0.005) {
```
To:
```javascript
if (currencyPaid !== 'EUR' || Math.abs(amountPaid - PLAN_PRICES[plan]) > 0.005) {
```

- [ ] **Step 3: Update `js/inline/billing-2.js:137`**

Change:
```javascript
script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&currency=USD&intent=capture&components=buttons`;
```
To:
```javascript
script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&currency=EUR&intent=capture&components=buttons`;
```

- [ ] **Step 4: Update `api/subscription/webhook-paypal.js:113`**

Change:
```javascript
const currency = resource.amount?.currency_code || 'USD';
```
To:
```javascript
const currency = resource.amount?.currency_code || 'EUR';
```

- [ ] **Step 5: Verify all 4 files**

```bash
node --check api/paypal/create-order.js
node --check api/paypal/capture-order.js
node --check api/subscription/webhook-paypal.js
```
(billing-2.js has been verified clean in earlier W17/W18 sessions; the only change is a string literal.)

---

## Task 3: Raw-body webhook signature verification

**Files:**
- Modify: `api/subscription/webhook-paypal.js` (top of file + `_verifySignature` function + handler entrypoint)

### Why this is P0

Vercel's default body parser re-orders JSON keys and re-emits whitespace. PayPal's `verify-webhook-signature` computes the signature over **the exact bytes PayPal sent**. Sending the parsed-and-re-stringified body causes verification to silently fail on real events. The user pays via PayPal → PayPal fires webhook → our handler rejects with 401 → user is on Free plan despite paying.

Fix is to disable the body parser, read the raw buffer, parse JSON ourselves for routing, but pass the raw string to the verify endpoint.

- [ ] **Step 1: Disable Vercel's body parser at top of `api/subscription/webhook-paypal.js`**

Add export at the top of the file (after imports but before any function definitions):
```javascript
// W25 P0 #10 — disable Vercel's body parser. PayPal's webhook signature
// is computed over the exact raw bytes PayPal sent; the default parser
// re-orders keys and changes whitespace, breaking verification silently
// (HTTP 401 on every real event despite "valid" signatures).
export const config = { api: { bodyParser: false } };
```

- [ ] **Step 2: Add a `_readRawBody` helper near the top (after `_getAccessToken`)**

```javascript
async function _readRawBody(req) {
  // Reads the raw incoming bytes as a Buffer. Used for PayPal webhook
  // signature verification (which must see byte-identical input).
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}
```

- [ ] **Step 3: Rewrite `_verifySignature` to accept the raw string + already-parsed event**

Replace lines 45-68 of the existing function with:
```javascript
async function _verifySignature(headers, rawBodyString) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    console.error('PAYPAL_WEBHOOK_ID not configured — refusing to process webhook');
    return false;
  }
  const token = await _getAccessToken();
  // PayPal's verify endpoint takes webhook_event as a JSON OBJECT field,
  // but it computes the signature over our raw bytes. We pass the parsed
  // event for the API contract; the signature itself is keyed on the
  // headers (transmission_id, transmission_time, transmission_sig) +
  // webhookId + the raw body. The raw body never has to be re-emitted.
  // See: developer.paypal.com/api/rest/webhooks/rest/#verify-webhook-signature
  let parsedEvent;
  try { parsedEvent = JSON.parse(rawBodyString); }
  catch (_) { return false; }
  const verifyRes = await fetch(`${PAYPAL_BASE}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_algo:         headers['paypal-auth-algo'],
      cert_url:          headers['paypal-cert-url'],
      transmission_id:   headers['paypal-transmission-id'],
      transmission_sig:  headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'],
      webhook_id:        webhookId,
      webhook_event:     parsedEvent,
    }),
  });
  if (!verifyRes.ok) return false;
  const data = await verifyRes.json();
  return data.verification_status === 'SUCCESS';
}
```

- [ ] **Step 4: Update the handler entrypoint to read raw body BEFORE parsing**

Replace the top of `handler()` (lines 70-78) with:
```javascript
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // W25 P0 #10 — read raw bytes. bodyParser is disabled (top of file).
  let rawBody;
  try { rawBody = (await _readRawBody(req)).toString('utf8'); }
  catch (e) {
    console.error('Failed to read webhook raw body:', e);
    return res.status(400).json({ error: 'Bad request' });
  }

  // 1. Verify the webhook actually came from PayPal (raw-body version)
  const valid = await _verifySignature(req.headers, rawBody).catch(() => false);
  if (!valid) {
    console.warn('Rejected unverified PayPal webhook');
    return res.status(401).json({ error: 'Signature verification failed' });
  }

  // 2. Parse the body NOW for routing (verification already passed)
  let event;
  try { event = JSON.parse(rawBody); }
  catch (_) { return res.status(400).json({ error: 'Invalid JSON' }); }
```

The rest of the handler that references `req.body` needs to use `event` instead — search the file for `req.body` and replace with `event`.

- [ ] **Step 5: Search & replace all `req.body` → `event` in this file**

Run:
```bash
grep -n "req\.body" api/subscription/webhook-paypal.js
```
Expected output: the existing handler uses `req.body` in a few places. Replace each with `event` (the variable we defined in Step 4). Note: `event` is also a reserved keyword in some browser globals, but in Node + module scope it's fine.

- [ ] **Step 6: Verify syntax**

```bash
node --check api/subscription/webhook-paypal.js
```
Expected: exit 0.

---

## Task 4: Verify with security-review skill + commit

**Files:** none (verification only)

- [ ] **Step 1: Run `security-review` skill on the diff**

Invoke:
```
Skill: security-review (built-in)
Args: review the diff of api/paypal/create-order.js + api/paypal/capture-order.js + api/subscription/webhook-paypal.js + js/inline/billing-2.js for any security regressions introduced by the W25 P0 fixes
```

Expected: confirm no new vulnerabilities. Specifically check:
- No new XSS surfaces
- No new SQL injection
- No new info-disclosure in error paths
- Webhook signature verification still rejects unsigned events

- [ ] **Step 2: Run `verification-before-completion` skill**

Confirm:
- All `node --check` passed
- `grep "currency.*USD"` returns zero hits in api/ and js/
- `grep "pro_annual.*69"` returns zero hits

- [ ] **Step 3: Commit and push**

```bash
git add api/paypal/create-order.js \
        api/paypal/capture-order.js \
        api/subscription/webhook-paypal.js \
        js/inline/billing-2.js \
        docs/superpowers/plans/2026-05-23-payments-p0-money-loss-trio.md \
        docs/superpowers/audits/2026-05-23-payments-skills-inventory.md \
        docs/superpowers/audits/2026-05-23-payments-code-audit.md \
        docs/superpowers/audits/2026-05-23-payments-research.md
git commit -m "fix(payments): W25 P0 money-loss trio — prices + currency + webhook raw body"
git push origin main
```

---

## Self-Review

**1. Spec coverage:** The 3 P0s in scope are all addressed (Tasks 1-3). The other 9 P0s are explicitly listed in the "Scope honesty" section as deferred to W26.

**2. Placeholder scan:** No TBDs. All code blocks contain complete code. All file paths are exact.

**3. Type consistency:** `PLAN_PRICES`, `SKU_TO_PLAN`, `PLAN_QUERIES`, `PLAN_PERIOD_DAYS` all use the same SKU strings across create-order.js and capture-order.js. `event` variable is consistently the parsed JSON throughout the webhook handler post-Task 3 Step 4.

**4. Verification path:** Each task ends with `node --check` + a targeted grep. Task 4 invokes the security-review skill on the diff as the final gate.

**Risk this plan does NOT address:** A user who submitted a Premium purchase BEFORE these fixes is currently in a broken state (paid, no Premium entitlement). After deploying, those users still need manual reconciliation via PayPal dashboard. The audit doc flagged this; the recovery path is in `docs/runbooks/` (does not exist yet — create on first occurrence).
