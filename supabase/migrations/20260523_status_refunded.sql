-- W27-d / W27-b enabler — expand subscriptions.status to allow 'refunded'.
--
-- The original schema (20260508_subscriptions.sql:21) constrained status to
-- ('active','cancelled','expired','past_due'). W27-b made the refund webhook
-- branch set status='refunded' (distinct from 'cancelled' which now means
-- "user opted out at period end") so /api/founders-claimed can correctly
-- release the seat back to the cap pool.
--
-- WITHOUT this migration the W27-b refund handler will throw a CHECK
-- constraint violation and PayPal will retry the refund webhook forever.
--
-- Safe to re-run.

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('active','cancelled','expired','past_due','refunded'));

COMMENT ON COLUMN public.subscriptions.status IS
  'Lifecycle: active (paid, current period valid) | cancelled (user opted out, period ended) | expired (period ended naturally) | past_due (payment failed for renewal) | refunded (W27-b: money returned, Founders seat released back to cap pool). Read by /api/subscription/status and /api/founders-claimed.';
