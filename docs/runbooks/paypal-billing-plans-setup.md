# PayPal Billing Plans setup — W29-b runbook

This is the one-time manual setup that activates real auto-renewing
subscriptions for Pro and Premium SKUs. **Until you finish this runbook,
all Pro/Premium checkouts continue to use the one-shot Orders flow** that
was working before W29-b — there's no breakage from shipping the code
without finishing the setup.

Founders Lifetime stays one-shot (no recurring) regardless.

---

## Step 1 — Create one Product in the PayPal dashboard

1. Sign in to your PayPal **business** account (the one tied to
   `PAYPAL_CLIENT_ID` in Vercel).
2. Open the developer dashboard → **Products & Plans → Catalog → Create
   Product**.
3. Fields:
   - **Name:** `ProFinanceCast Subscription`
   - **Type:** Service
   - **Category:** SaaS (or "Software" — closest available)
   - **Description:** Pro/Premium subscription to ProFinanceCast.
4. Save. PayPal returns a **product_id** (looks like `PROD-XXXX`).
   You don't need to copy it — only the plan IDs matter for our code.

## Step 2 — Create 4 Plans against that product

For each row below, open **Catalog → your Product → Create Plan**:

| Plan name              | Billing cycle | Price (EUR) | Plan type |
|-----------------------|---------------|-------------|-----------|
| Pro Monthly           | Every 1 month | €9.00       | Standard recurring, infinite cycles |
| Pro Annual            | Every 1 year  | €79.00      | Standard recurring, infinite cycles |
| Premium Monthly       | Every 1 month | €19.00      | Standard recurring, infinite cycles |
| Premium Annual        | Every 1 year  | €169.00     | Standard recurring, infinite cycles |

For each plan, set:
- **Currency:** EUR
- **Setup fee:** none
- **Tax:** none (handled outside the plan)
- **Trial cycle:** **none** — we don't offer trials (per W28-a truthful-
  marketing fix; trial copy was removed from billing.html).
- **Failed payment threshold:** 3 attempts (PayPal default is fine; suspend
  after 3 failed renewals → we handle BILLING.SUBSCRIPTION.SUSPENDED).

After creating each plan, click into it and **copy the Plan ID** — it looks
like `P-1A2B3C4D5E6F7G8H9`.

## Step 3 — Set the 4 env vars in Vercel

Vercel → Project → **Settings → Environment Variables → Add New**.

Apply each to **Production ✓ Preview ✓ Development ✓**.

| Env var name                        | Value           |
|-------------------------------------|-----------------|
| `PAYPAL_PLAN_ID_PRO_MONTHLY`        | `P-<from plan>` |
| `PAYPAL_PLAN_ID_PRO_ANNUAL`         | `P-<from plan>` |
| `PAYPAL_PLAN_ID_PREMIUM_MONTHLY`    | `P-<from plan>` |
| `PAYPAL_PLAN_ID_PREMIUM_ANNUAL`     | `P-<from plan>` |

You do **not** need to redeploy. Vercel picks up env-var changes on the
next serverless invocation.

## Step 4 — Subscribe to the new webhook events

PayPal Developer Dashboard → your app → **Webhooks → Edit** the webhook
already configured for `https://profinancecast.com/api/subscription/webhook-paypal`.

Add these events (keep the existing ones, just check the new boxes):

- `BILLING.SUBSCRIPTION.ACTIVATED`
- `BILLING.SUBSCRIPTION.UPDATED`
- `BILLING.SUBSCRIPTION.CANCELLED` *(already subscribed)*
- `BILLING.SUBSCRIPTION.EXPIRED`   *(already subscribed)*
- `BILLING.SUBSCRIPTION.SUSPENDED`
- `BILLING.SUBSCRIPTION.PAYMENT.FAILED`
- `PAYMENT.SALE.COMPLETED`         *(fires on each recurring charge)*
- `PAYMENT.SALE.REFUNDED`
- `PAYMENT.SALE.REVERSED`

The existing one-shot events (`PAYMENT.CAPTURE.COMPLETED`,
`PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED`, `CUSTOMER.DISPUTE.CREATED`)
**stay subscribed** — Founders Lifetime continues to go through the one-shot
flow and emits those events.

## Step 5 — End-to-end test in sandbox FIRST

Before flipping production:

1. Switch `PAYPAL_ENV` to `sandbox` in Vercel (or use a separate preview
   deployment with sandbox credentials).
2. Repeat Steps 1-4 in the sandbox dashboard with sandbox credentials.
3. Visit billing.html, sign in with a test buyer account, click "Upgrade to
   Pro" with **Annual** selected. You should:
   - See the new "Approve with PayPal — auto-renews" button (W29-b style,
     not the standard PayPal SDK button).
   - Be redirected to `sandbox.paypal.com` to approve.
   - On approval, redirect back to `/billing.html?subscription=ok`.
   - Within ~10 seconds, the homepage banner flips to "Pro Plan".
4. Verify in Supabase:
   - `subscriptions` row has `provider_subscription_id = P-XXXX`,
     `subscription_state = ACTIVE`, `status = active`.
   - `subscription_periods` has one row with that subscription_id.
   - `subscription_events` has `subscription_activated` event.
5. Trigger a refund in the PayPal sandbox dashboard → confirm
   `subscription_periods.refunded_at` populates, user downgrades to free.
6. Click **Cancel subscription** in billing.html → confirm
   `subscriptions.cancel_at_period_end = true` AND the PayPal sandbox
   dashboard shows the subscription as cancelled.

## Step 6 — Flip production

Set the 4 `PAYPAL_PLAN_ID_*` env vars in Vercel **Production** scope only.
The next Pro/Premium checkout will use the new recurring flow.

Existing one-shot Pro users keep working until their period ends — their
`subscriptions` row has `provider_subscription_id = NULL`, so cancel.js,
status.js, and the webhook all treat them as legacy and use the old paths.

---

## What if I need to roll back?

Just unset (or delete) the 4 `PAYPAL_PLAN_ID_*` env vars. The
`/api/paypal/create-subscription` endpoint returns 503, the client falls
back to the one-shot Orders flow automatically. No code change required.

Existing recurring subs that were already created stay active — PayPal
keeps charging them until they cancel. The webhook still handles
PAYMENT.SALE.COMPLETED for those subs regardless of the env-var state.

---

## What's still NOT auto-handled (W30+ candidates)

- **Plan upgrades / downgrades mid-cycle** (Pro → Premium without cancel-
  and-resubscribe) — requires the `/v1/billing/subscriptions/{id}/revise`
  flow. Today, the user cancels and re-subscribes.
- **Pause-for-N-months retention move** — `/v1/billing/subscriptions/{id}/suspend`
  is wired in the webhook but no UI surfaces it. Add to W28-c cancel
  modal as a "Pause for 1 month" retention option.
- **Migrating legacy one-shot Pro users to recurring** — currently they
  stay on the one-shot flow until period_end. Could prompt them to
  switch via an in-app banner.
- **Plan price changes** — once you publish a plan with a price, you
  can't edit that price in place. You'd create a new plan with new IDs
  and migrate. Document the procedure when it's needed.
