-- W29-b / Audit #14 — schema additions for PayPal Billing Plans recurring subs.
--
-- The original subscriptions schema was built for one-shot PayPal Orders.
-- W29-b adds parallel support for PayPal Subscriptions API (Billing Plans)
-- — true auto-renewing subs that the user can cancel via /v1/billing/
-- subscriptions/{id}/cancel. Founders Lifetime stays one-shot.
--
-- The new columns are NULLABLE so existing one-shot rows aren't disturbed.
-- A row is "recurring" iff provider_subscription_id IS NOT NULL.
--
-- Safe to re-run.

ALTER TABLE IF EXISTS public.subscriptions
  ADD COLUMN IF NOT EXISTS provider_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS next_billing_time        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_payment_count     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subscription_state       TEXT;

-- subscription_state mirrors PayPal's BillingAgreement state machine:
--   APPROVAL_PENDING | APPROVED | ACTIVE | SUSPENDED | CANCELLED | EXPIRED
-- One-shot rows leave this NULL; reads check it only when
-- provider_subscription_id IS NOT NULL.
ALTER TABLE IF EXISTS public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_subscription_state_check;

ALTER TABLE IF EXISTS public.subscriptions
  ADD CONSTRAINT subscriptions_subscription_state_check
  CHECK (
    subscription_state IS NULL
    OR subscription_state IN ('APPROVAL_PENDING','APPROVED','ACTIVE','SUSPENDED','CANCELLED','EXPIRED')
  );

CREATE INDEX IF NOT EXISTS subscriptions_provider_subscription_id_idx
  ON public.subscriptions (provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS subscriptions_next_billing_time_idx
  ON public.subscriptions (next_billing_time)
  WHERE next_billing_time IS NOT NULL;

COMMENT ON COLUMN public.subscriptions.provider_subscription_id IS
  'PayPal Billing Subscription ID (P-XXXX). NULL for one-shot Orders (founders, or pre-W29-b legacy Pro/Premium). Presence means this row is auto-renewing.';
COMMENT ON COLUMN public.subscriptions.next_billing_time IS
  'When the next recurring charge is scheduled. Updated by BILLING.SUBSCRIPTION.UPDATED and PAYMENT.SALE.COMPLETED webhooks. NULL for one-shot.';
COMMENT ON COLUMN public.subscriptions.failed_payment_count IS
  'Consecutive failed renewal attempts. PayPal suspends the subscription after a configurable threshold; we surface this in support tooling.';
COMMENT ON COLUMN public.subscriptions.subscription_state IS
  'Mirrors PayPal BillingAgreement state. NULL for one-shot rows.';
