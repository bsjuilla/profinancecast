-- W29-a / Audit #13 — subscription_periods history table.
--
-- The subscriptions table is a "current state" record — one row per user,
-- overwritten on every new purchase via upsert(onConflict='user_id'). That
-- design loses the per-period audit trail: when a user buys pro_monthly,
-- then 30 days later buys another pro_monthly, the first capture_id and
-- period_end are clobbered. Combined with the refund branch (audit #3),
-- without history it's hard to know which capture to refund.
--
-- subscription_periods is the APPEND-ONLY history. Every successful capture
-- (and every Billing-Plans recurring payment, when W29-b ships) inserts a
-- row here in ADDITION to upserting the subscriptions row. Refunds mark
-- the matching period_row's refunded_at; the row is never deleted.
--
-- Reads:
--   /api/subscription/history already exists (W28-d) reading subscription_events.
--   We keep that as the user-facing history (event-shaped) and use this table
--   for operations / forensic queries / per-period accounting.
--
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.subscription_periods (
  id                  BIGSERIAL    PRIMARY KEY,
  user_id             UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sku                 TEXT         NOT NULL CHECK (sku IN (
                                   'pro_monthly','pro_annual',
                                   'premium_monthly','premium_annual',
                                   'founders'
                                 )),
  -- Normalized tier the period grants (pro|premium). Mirrors subscriptions.plan.
  tier                TEXT         NOT NULL CHECK (tier IN ('pro','premium')),
  provider            TEXT         NOT NULL DEFAULT 'paypal',
  provider_capture_id TEXT         NOT NULL,
  provider_order_id   TEXT,
  -- W29-b additions for recurring: when the period came from a Billing Plans
  -- subscription rather than a one-shot order, this holds the PayPal
  -- subscription id (P-XXXXX). NULL for one-shot captures.
  provider_subscription_id TEXT,
  amount              NUMERIC(12,2) NOT NULL,
  currency            TEXT         NOT NULL DEFAULT 'EUR',
  period_start        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  period_end          TIMESTAMPTZ  NOT NULL,
  refunded_at         TIMESTAMPTZ,
  refund_capture_id   TEXT,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  -- Idempotency: provider_capture_id should be unique system-wide. Two
  -- different users can't share a capture; same user can't capture the
  -- same payment twice. Webhook retries should hit this constraint
  -- and be silently dropped at INSERT-time as belt-and-braces to
  -- W26-c's webhook_events_processed dedup.
  CONSTRAINT subscription_periods_capture_id_uniq UNIQUE (provider_capture_id)
);

CREATE INDEX IF NOT EXISTS subscription_periods_user_idx
  ON public.subscription_periods (user_id, period_start DESC);

CREATE INDEX IF NOT EXISTS subscription_periods_subscription_id_idx
  ON public.subscription_periods (provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS subscription_periods_refunded_idx
  ON public.subscription_periods (refunded_at)
  WHERE refunded_at IS NOT NULL;

-- ── RLS: read-own for users, service_role writes ─────────────────────────
ALTER TABLE public.subscription_periods ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'subscription_periods'
      AND policyname = 'subscription_periods_select_own'
  ) THEN
    CREATE POLICY subscription_periods_select_own
      ON public.subscription_periods
      FOR SELECT
      TO authenticated
      USING (user_id = auth.uid());
  END IF;
END$$;

GRANT SELECT ON public.subscription_periods TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.subscription_periods FROM authenticated, anon;
GRANT USAGE, SELECT ON SEQUENCE public.subscription_periods_id_seq TO service_role;

COMMENT ON TABLE public.subscription_periods IS
  'Append-only history of every paid subscription period. One row per capture (one-shot) or per recurring billing cycle (W29-b Billing Plans). subscriptions table remains the "current state" for entitlement reads; this table is the audit history.';
