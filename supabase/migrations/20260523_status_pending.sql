-- W29-final / Audit P0 fix — add 'pending' to subscriptions.status CHECK.
--
-- Why: W29-b create-subscription pre-writes the user's subscriptions row
-- BEFORE the user approves at PayPal so support can find the row if the
-- approval flow stalls. It was writing status='active', which status.js
-- interpreted as "user is Pro" — a malicious or abandoning user could
-- request subscription creation and then NEVER approve at PayPal, getting
-- Pro for free indefinitely (current_period_end stayed NULL → expired
-- check returns false → status.js returns sub.plan).
--
-- Fix: use status='pending' for the pre-write. status.js already treats
-- anything != 'active' as 'free' so this works automatically. This
-- migration adds 'pending' to the allowed values in the CHECK constraint.
--
-- Safe to re-run.

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('active','cancelled','expired','past_due','refunded','pending'));

COMMENT ON COLUMN public.subscriptions.status IS
  'Lifecycle: active (paid, current period valid) | cancelled (user opted out, period ended) | expired (period ended naturally) | past_due (payment failed mid-cycle for recurring) | refunded (money returned, Founders seat released back to cap pool) | pending (W29-final: PayPal subscription created but user has not yet approved at PayPal — never grants entitlement; flipped to active by BILLING.SUBSCRIPTION.ACTIVATED webhook).';
