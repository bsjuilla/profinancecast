# Payments Launch State — Handoff Document

**Date:** 2026-05-23
**Purpose:** Brief a fresh Claude session on the current state of the ProFinanceCast payments system so work can continue without reading the entire prior session transcript.

> **For a new Claude session:** read this file first. Then look at the git log (`git log --oneline -25`) for commit hashes. Most context you need is captured here; everything else lives in `docs/superpowers/audits/2026-05-23-payments-code-audit.md` (the original 40-finding audit) and the migration files under `supabase/migrations/`.

---

## TL;DR

- **40 of 40 payments audit findings closed** across waves W25 → W29 (commits `f5bd602` through `4469cf4`).
- **3 additional P0 bugs found and fixed** in the W29-final pre-launch self-audit (this session).
- **Codebase is launch-ready** pending the user applying 6 Supabase migrations + 4 PayPal Plan ID env vars in Vercel.
- The user has already done most of the manual setup; remaining gates are listed below.

---

## What's deployed (live on `main`)

| Commit | Wave | What it shipped |
|---|---|---|
| `f5bd602` | W25 | P0 money-loss trio: price reconciliation, EUR currency, raw-body webhook signature |
| `bcd3cc7` | W25b | Promoted waitlist CTA on landing |
| `4ecc166` | W26-a | Origin check, email-confirmed gate, PayPal client-id regex validation |
| `2a077f3` | W26-b | Refund scoping by capture_id, capture preflight + replay protection |
| `1f900b1` | W26-c | Webhook idempotency table (PAYMENT.CAPTURE.* dedup) |
| `fcf5848` | W26-d | Founders cap atomic enforcement (100-seat ledger + RPC) |
| `d3e3cc1` | W27-a | Timezone math, status.js 503-on-DB-error, alerts, log propagation |
| `3923ce5` | W27-b | PII redaction, dispute auto-suspend, refund accounting |
| `3f238e0` | W27-c | PayPal retry+backoff, auto-refund on amount mismatch, PFCPlan poll |
| `cf14f84` | W27-d | `status='refunded'` migration + schema verification queries |
| `f4dc17d` | W28-a | Truthful-marketing fix (removed false 14-day trial copy) |
| `1b88193` | W28-b | UX polish bundle (refund line, error matrix, trust strip, funding pins) |
| `e6ddcbe` | W28-c | Cancel modal w/ analytics |
| `36dd276` | W28-d | Real billing history Edge endpoint |
| `7c616f8` | W28-e | pfc-config.js validation + no-cache headers |
| `46a6178` | W29-a | `subscription_periods` history table + write sites |
| `1cc6618` | W29-b | PayPal Billing Plans recurring (env-var-gated) |
| `9106fe4` | W29-c | Origin check accepts www + apex (regression fix) |
| `b60c619` | W29-d | Card payment UX copy/icons on subscribe button |
| `4469cf4` | **W29-final** | **Three P0 fixes** from pre-launch self-audit (see below) |

---

## The W29-final P0s (most recent fix — critical to understand)

### P0 #1 — Free Pro/Premium via abandoned subscription approval

**File:** `api/paypal/create-subscription.js` (now line 280-298)
**Exploit:** User clicked Subscribe → got subscriptionID + approveUrl → never approved at PayPal → DB pre-write said `status='active'` → status.js returned Pro/Premium indefinitely.
**Fix:** Pre-write now uses `status='pending'`. status.js treats anything != 'active' as 'free' so no entitlement is granted until BILLING.SUBSCRIPTION.ACTIVATED webhook fires.

### P0 #2 — `current_period_end` never set on activation

**File:** `api/subscription/webhook-paypal.js` (BILLING.SUBSCRIPTION.ACTIVATED handler)
**Fix:** `current_period_end` now set from `resource.billing_info.next_billing_time`. Previously left null — fragile.

### P0 #3 — Pro Annual users lose access after 30 days

**File:** `api/subscription/webhook-paypal.js` (PAYMENT.SALE.COMPLETED handler)
**Exploit:** Inferred SKU threshold `amount >= 100 ? annual : monthly` misclassified Pro Annual (€79) as monthly → period_end = +1 month → user downgraded to free after 30 days despite paying for a year.
**Fix:** Exact-price lookup table `{ 9: pro_monthly, 79: pro_annual, 19: premium_monthly, 169: premium_annual }`. Unknown amounts fall back to monthly + alert ops.

---

## Manual setup REQUIRED before this code is fully live

### A. Supabase migrations (apply via Dashboard → SQL Editor, in order)

| # | File | What it does |
|---|---|---|
| 1 | `20260523_webhook_events_processed.sql` | Webhook idempotency table |
| 2 | `20260523_founders_seats.sql` | 100-seat Founders ledger + RPCs |
| 3 | `20260523_status_refunded.sql` | Add 'refunded' to status CHECK |
| 4 | `20260523_subscription_periods.sql` | Per-period history table |
| 5 | `20260523_billing_plans_columns.sql` | `provider_subscription_id`, `next_billing_time`, `failed_payment_count`, `subscription_state` columns |
| 6 | `20260523_status_pending.sql` | Add 'pending' to status CHECK (CRITICAL for W29-final) |

**The user has applied #1, #2, #3 confirmed. Need to confirm #4, #5, #6 are also applied.**

### B. Vercel env vars

The user has already set these per prior session:
- `ALERT_EMAIL = business060407@gmail.com`
- `RESEND_API_KEY` (reused from waitlist)
- `ALERT_FROM_EMAIL` (matches existing `RESEND_FROM`)
- `PAYPAL_PLAN_ID_PRO_MONTHLY = P-76J65058SF013682XNIIXGGI`
- `PAYPAL_PLAN_ID_PRO_ANNUAL = P-8ND62838JW602673DNIIXHKQ`
- `PAYPAL_PLAN_ID_PREMIUM_MONTHLY = P-8W757240GS234372ANIIXIGY`
- `PAYPAL_PLAN_ID_PREMIUM_ANNUAL = P-2GW52145Y6923513CNIIXIZA`

Existing env vars (do not touch):
- `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV=live`
- `PAYPAL_WEBHOOK_ID = 0P342180YJ6943217`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_FROM`

### C. PayPal Developer Dashboard (Live mode)

- **Business profile renamed:** ShadowQuill Writer → ProFinanceCast ✓
- **Statement descriptor:** PROFINANCECAST ✓
- **4 Billing Plans created** with the Plan IDs above ✓
- **Webhook events subscribed (13 total):**
  - PAYMENT.CAPTURE.COMPLETED / REFUNDED / REVERSED
  - BILLING.SUBSCRIPTION.ACTIVATED / UPDATED / CANCELLED / EXPIRED / SUSPENDED / PAYMENT.FAILED
  - PAYMENT.SALE.COMPLETED / REFUNDED / REVERSED
  - CUSTOMER.DISPUTE.CREATED

### D. Smoke test status (per prior session)

- ✓ Recurring subscription flow tested in production (live mode, real user account)
- ✓ Yellow "Subscribe with PayPal or Card" button renders correctly
- ✓ PayPal hosted approval page reached and approved
- ✓ Webhook BILLING.SUBSCRIPTION.ACTIVATED fired, DB updated
- ✓ status.js returns active plan
- ✓ Origin check works for both apex and www domains

**Not yet tested:** Pro Annual real-money purchase (would catch P0 #3 in real world before it bites), refund flow, cancel-via-PayPal, dispute flow.

---

## What's next (this session deferred)

The user asked me to draft a **founders welcome email** next. The session ended before I wrote it. Approach for the new session:

- Read `index.html` and `billing.html` for the brand voice (warm, journalistic, photo-led, European understated)
- Read `docs/superpowers/audits/2026-05-22-cmo-gtm-plan.md` for the existing positioning frame
- Email should:
  - Greet by first name (we have it from Supabase auth)
  - Include their **Founders seat number** (returned in capture-order response as `foundersSeatNo`)
  - Set expectations: lifetime Pro, no auto-renew, cancel anytime within 14 days for refund
  - Soft asks: refer one friend, reply to the email
  - Be sent via Resend (same `RESEND_API_KEY` env)
- Wire it up as a side-effect of `PAYMENT.CAPTURE.COMPLETED` for founders SKU in `webhook-paypal.js`, OR as a Vercel cron that polls subscription_events for founders captures it hasn't emailed yet

The user has NOT asked for the founders email yet to be triggered automatically. They want it written first, then we wire it.

---

## Code structure quick reference

```
api/
├── paypal/
│   ├── card-order.js          410 stub (PCI escape hatch)
│   ├── create-order.js        One-shot (founders + legacy Pro/Premium fallback)
│   ├── capture-order.js       One-shot capture + auto-refund + founders finalize
│   └── create-subscription.js Recurring (Edge) — W29-b
├── subscription/
│   ├── cancel.js              Local + PayPal cancel for recurring
│   ├── status.js              Single source of truth for plan
│   ├── history.js             Edge endpoint reading subscription_events
│   └── webhook-paypal.js      All PayPal webhook handlers (LARGE, ~1040 lines)
└── (other endpoints unchanged)

js/
├── pfc-config.js              Client config with format validation (W28-e)
├── pfc-entitlements.js        PFCPlan — fail-closed cache + visibilitychange + 10-min poll
└── inline/billing-2.js        Checkout client — renders Subscription button or one-shot Orders SDK
```

---

## Known limitations / NOT bugs

- `subscriptions.amount_usd` column name is historical — actually stores EUR. Tech debt, not a bug.
- One-shot legacy Pro/Premium users (any pre-W29-b purchases) stay on the one-shot path until period_end. They have `provider_subscription_id IS NULL`. No migration UI built.
- Plan upgrades mid-cycle (Pro → Premium) require cancel + resubscribe. No in-place upgrade.
- No "Pause subscription" UI yet — would need to wire PayPal's `/v1/billing/subscriptions/{id}/suspend`.

---

## Where the user is at

- **Pre-launch.** No real customers yet (the audit and all this work was prep).
- **Solo founder.** business060407@gmail.com.
- **Vercel Hobby plan** — currently at 12 Node functions exactly. Edge runtime needed for any new endpoints.
- **Mood:** Wants to launch soon. Has already done the manual PayPal dashboard setup. Smoke-tested recurring flow successfully.

## How a new session should resume

1. `git log --oneline -25` to confirm latest is `4469cf4` (or newer).
2. Verify migrations #4, #5, #6 are applied (ask the user, or check via SQL: `SELECT conname FROM pg_constraint WHERE conname='subscriptions_status_check';` then look at the constraint def).
3. Ask the user what they want next. The defaults are:
   - Draft the founders welcome email
   - Test the refund flow with a real €9 purchase
   - Start ramping outreach to drive traffic to billing.html
4. Use ruflo/superpowers agents freely — a fresh session won't hit the 1M context limit.
