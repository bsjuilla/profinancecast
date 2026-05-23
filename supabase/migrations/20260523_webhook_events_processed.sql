-- W26-c — Webhook idempotency table.
--
-- PayPal retries webhooks aggressively on any non-2xx (and sometimes even on
-- 2xx if their network burped). Without idempotency, a retried
-- PAYMENT.CAPTURE.COMPLETED can:
--   - upsert the same subscription row again, re-resetting
--     cancel_at_period_end / period_end that have been changed since
--   - write duplicate subscription_events log entries
--   - trigger downstream side-effects (welcome email, quota reset) twice
--
-- Solution: track every webhook transmission_id (PayPal's unique per-attempt
-- identifier) we have processed. The webhook handler does
--   INSERT INTO webhook_events_processed (event_id, ...) ON CONFLICT DO NOTHING
-- as its first SQL after signature verification. If the insert returns zero
-- rows (conflict), the event is a retry and we 200-ack without re-processing.
--
-- The PRIMARY KEY enforces uniqueness atomically — no race between two
-- concurrent webhook deliveries from PayPal's side.

CREATE TABLE IF NOT EXISTS public.webhook_events_processed (
  event_id     TEXT        PRIMARY KEY,        -- PayPal-Transmission-Id header
  event_type   TEXT        NOT NULL,           -- e.g., 'PAYMENT.CAPTURE.COMPLETED'
  provider     TEXT        NOT NULL DEFAULT 'paypal',
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for housekeeping ("delete events older than 90 days")
CREATE INDEX IF NOT EXISTS webhook_events_processed_received_at_idx
  ON public.webhook_events_processed (received_at);

-- Index for ad-hoc audit queries
CREATE INDEX IF NOT EXISTS webhook_events_processed_event_type_idx
  ON public.webhook_events_processed (event_type, received_at DESC);

ALTER TABLE public.webhook_events_processed ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policies — only the server (SERVICE_ROLE_KEY) writes
-- and reads this table. Default-deny is correct.

-- Optional retention: a scheduled job (Vercel cron or pg_cron) can prune
-- rows older than 90 days. PayPal's webhook retry window is ~3 days at most,
-- so 90 days is generous.
--   DELETE FROM public.webhook_events_processed
--   WHERE received_at < now() - INTERVAL '90 days';

COMMENT ON TABLE public.webhook_events_processed IS
  'Idempotency log for inbound payment-provider webhooks. event_id is the provider-supplied unique transmission id; presence means we have already processed it. Inserted with ON CONFLICT DO NOTHING as the first step of webhook handling.';
