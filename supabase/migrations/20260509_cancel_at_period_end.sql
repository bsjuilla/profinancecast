-- 20260509_cancel_at_period_end.sql
--
-- Audit H1 + H2 + M3 fixes:
--   1. Add cancel_at_period_end + (existing) cancelled_at columns to subscriptions
--      so cancel.js can schedule a cancellation without revoking Pro immediately.
--   2. Create subscription_events as the append-only history of every capture,
--      refund, cancellation, and dispute (audit M3).
--   3. Backfill: existing status='cancelled' rows whose current_period_end is
--      still in the future are promoted to status='active', cancel_at_period_end=true
--      so they don't lose access on next read (this re-grants access that was
--      incorrectly revoked by the H1 bug).
--
-- Idempotent: re-runnable. All ALTER/CREATE/POLICY use IF NOT EXISTS guards.

-- =============================================================================
-- 1. subscriptions: add cancel_at_period_end (cancelled_at already exists)
-- =============================================================================

ALTER TABLE IF EXISTS public.subscriptions
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS subscriptions_user_status_idx
  ON public.subscriptions (user_id, status);

CREATE INDEX IF NOT EXISTS subscriptions_provider_capture_id_idx
  ON public.subscriptions (provider_capture_id);

-- =============================================================================
-- 2. subscription_events: append-only history (audit M3)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.subscription_events (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type   TEXT NOT NULL,
  provider     TEXT NOT NULL DEFAULT 'paypal',
  provider_id  TEXT NULL,
  amount       NUMERIC(12, 2) NULL,
  currency     TEXT NULL,
  raw_payload  JSONB NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscription_events_user_id_idx
  ON public.subscription_events (user_id);

CREATE INDEX IF NOT EXISTS subscription_events_provider_id_idx
  ON public.subscription_events (provider_id);

CREATE INDEX IF NOT EXISTS subscription_events_event_type_idx
  ON public.subscription_events (event_type);

CREATE INDEX IF NOT EXISTS subscription_events_created_at_idx
  ON public.subscription_events (created_at DESC);

-- ---- RLS: SELECT for owner only; no client INSERT/UPDATE/DELETE ----
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'subscription_events'
      AND policyname = 'subscription_events_select_own'
  ) THEN
    CREATE POLICY subscription_events_select_own
      ON public.subscription_events
      FOR SELECT
      TO authenticated
      USING (user_id = auth.uid());
  END IF;
END$$;

GRANT SELECT ON public.subscription_events TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.subscription_events FROM authenticated, anon;
GRANT USAGE, SELECT ON SEQUENCE public.subscription_events_id_seq TO service_role;

-- =============================================================================
-- 3. Backfill: re-grant Pro to users who self-cancelled while still inside
--    their paid period (these users lost access prematurely because of the
--    H1 bug in api/subscription/cancel.js).
-- =============================================================================

UPDATE public.subscriptions
   SET status = 'active',
       cancel_at_period_end = true,
       cancelled_at = COALESCE(cancelled_at, now())
 WHERE status = 'cancelled'
   AND current_period_end IS NOT NULL
   AND current_period_end > now()
   AND cancel_at_period_end = false;

-- For status='cancelled' rows whose period has already ended, leave them as-is
-- (correctly Free) but populate cancelled_at if missing for audit cleanliness.
UPDATE public.subscriptions
   SET cancelled_at = COALESCE(cancelled_at, updated_at, now())
 WHERE status = 'cancelled'
   AND cancelled_at IS NULL;

-- End of migration.
