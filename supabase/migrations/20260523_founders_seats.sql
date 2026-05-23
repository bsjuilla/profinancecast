-- W26-d — Founders Lifetime atomic cap enforcement.
--
-- The Founders tier is hard-capped at 100 seats (see pricing.md, about.html,
-- billing.html). Today the cap is enforced only via the API counter at
-- /api/founders-claimed, which RACES against itself: 100 concurrent buyers
-- can all see "97 claimed" at the same moment, all complete checkout, and
-- the counter ends up at 197. The cap is decorative, not enforced.
--
-- Fix: pre-seed 100 rows in founders_seats; each Founders purchase ATOMICALLY
-- claims one row via SELECT ... FOR UPDATE SKIP LOCKED, so two concurrent
-- buyers cannot win the same seat. A 15-minute TTL reservation gives the
-- user time to complete PayPal checkout before the seat is released back to
-- the pool; finalization (writing the captureId) makes the claim permanent.
--
-- Flow:
--   1. create-order.js (plan='founders'): call claim_founders_seat(user_id)
--        -> returns seat_no, or NULL if all 100 are reserved/claimed
--        -> if NULL, return 409 "All Founders seats reserved/claimed"
--   2. capture-order.js (plan='founders'): on COMPLETED capture, call
--        finalize_founders_seat(user_id, capture_id) to lock the row
--        permanently. webhook PAYMENT.CAPTURE.COMPLETED also calls this
--        as a fallback (matches Audit H2 capture-completed pattern).
--   3. If user never captures, reservation expires after 15 min and the
--      next claim_founders_seat call can rebid the row.
--
-- This is independent of the public counter (api/founders-claimed.js), which
-- still reads from `subscriptions` — that counter is for marketing display
-- and is allowed to be slightly stale.

CREATE TABLE IF NOT EXISTS public.founders_seats (
  seat_no          INTEGER PRIMARY KEY,
  reserved_by      UUID,                       -- auth.users.id while reserving
  reserved_until   TIMESTAMPTZ,                -- NULL when seat is free or finalized
  claimed_by       UUID,                       -- final owner once captured
  capture_id       TEXT,                       -- PayPal capture id (permanent marker)
  claimed_at       TIMESTAMPTZ,                -- when finalize_founders_seat ran
  CONSTRAINT founders_seats_reservation_chk
    CHECK (
      (reserved_by IS NULL AND reserved_until IS NULL)  -- free
      OR (reserved_by IS NOT NULL AND reserved_until IS NOT NULL AND capture_id IS NULL)  -- reserved
      OR (claimed_by IS NOT NULL AND capture_id IS NOT NULL AND reserved_until IS NULL)   -- claimed
    )
);

-- Pre-seed 100 seats. Safe to re-run.
INSERT INTO public.founders_seats (seat_no)
SELECT s FROM generate_series(1, 100) AS s
ON CONFLICT (seat_no) DO NOTHING;

CREATE INDEX IF NOT EXISTS founders_seats_reserved_by_idx
  ON public.founders_seats (reserved_by) WHERE reserved_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS founders_seats_claimed_by_idx
  ON public.founders_seats (claimed_by) WHERE claimed_by IS NOT NULL;

ALTER TABLE public.founders_seats ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated RLS policies; only SERVICE_ROLE_KEY (the API) writes.

-- ------------------------------------------------------------------
-- claim_founders_seat(p_user_id UUID, p_ttl_minutes INTEGER DEFAULT 15)
-- ------------------------------------------------------------------
-- Reserves the lowest-numbered free seat for p_user_id with a TTL.
-- Returns the seat_no on success, NULL when all seats are reserved/claimed.
--
-- Concurrency:
--   FOR UPDATE SKIP LOCKED ensures two concurrent callers cannot both win
--   the same row. The first locks seat N; the second sees seat N locked
--   and skips to N+1. Worst case: all 100 seats are SKIP-LOCKED by other
--   in-flight transactions, and the SELECT returns no row -> we return NULL.
--
-- Idempotency:
--   If p_user_id already holds an unexpired reservation, that seat is
--   returned again (so a refreshed checkout page doesn't burn two seats).
CREATE OR REPLACE FUNCTION public.claim_founders_seat(
  p_user_id      UUID,
  p_ttl_minutes  INTEGER DEFAULT 15
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing INTEGER;
  v_seat     INTEGER;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Idempotency: re-issue the same seat to the same user if they're still
  -- inside their 15-minute reservation window.
  SELECT seat_no INTO v_existing
    FROM public.founders_seats
   WHERE reserved_by = p_user_id
     AND capture_id IS NULL
     AND reserved_until > now()
   LIMIT 1;
  IF v_existing IS NOT NULL THEN
    -- Bump the TTL so the user gets a fresh 15 minutes from this call.
    UPDATE public.founders_seats
       SET reserved_until = now() + (p_ttl_minutes || ' minutes')::INTERVAL
     WHERE seat_no = v_existing;
    RETURN v_existing;
  END IF;

  -- Find the next free (or stale-reservation) seat and lock it atomically.
  WITH next_seat AS (
    SELECT seat_no
      FROM public.founders_seats
     WHERE capture_id IS NULL
       AND (reserved_by IS NULL OR reserved_until < now())
     ORDER BY seat_no
     LIMIT 1
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.founders_seats fs
     SET reserved_by    = p_user_id,
         reserved_until = now() + (p_ttl_minutes || ' minutes')::INTERVAL,
         claimed_by     = NULL,
         capture_id     = NULL,
         claimed_at     = NULL
    FROM next_seat
   WHERE fs.seat_no = next_seat.seat_no
  RETURNING fs.seat_no INTO v_seat;

  RETURN v_seat;  -- NULL if no free seat
END;
$$;

-- ------------------------------------------------------------------
-- finalize_founders_seat(p_user_id UUID, p_capture_id TEXT)
-- ------------------------------------------------------------------
-- Promotes a reserved seat to permanently-claimed for p_user_id.
-- Returns the seat_no on success, NULL if no matching reservation.
--
-- Idempotent: re-calling with the same capture_id is a no-op.
CREATE OR REPLACE FUNCTION public.finalize_founders_seat(
  p_user_id    UUID,
  p_capture_id TEXT
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_seat INTEGER;
BEGIN
  IF p_user_id IS NULL OR p_capture_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Idempotency: if the capture_id is already finalized for this user, return it.
  SELECT seat_no INTO v_seat
    FROM public.founders_seats
   WHERE claimed_by = p_user_id AND capture_id = p_capture_id
   LIMIT 1;
  IF v_seat IS NOT NULL THEN
    RETURN v_seat;
  END IF;

  -- Promote the user's active reservation to claimed.
  UPDATE public.founders_seats
     SET claimed_by     = p_user_id,
         capture_id     = p_capture_id,
         claimed_at     = now(),
         reserved_by    = NULL,
         reserved_until = NULL
   WHERE reserved_by = p_user_id
     AND capture_id IS NULL
  RETURNING seat_no INTO v_seat;

  RETURN v_seat;
END;
$$;

-- ------------------------------------------------------------------
-- release_founders_seat(p_user_id UUID)
-- ------------------------------------------------------------------
-- Releases an active (unfinalized) reservation back to the pool.
-- Used by error-recovery paths in create-order.js when PayPal order
-- creation fails AFTER we successfully claimed a seat.
CREATE OR REPLACE FUNCTION public.release_founders_seat(
  p_user_id UUID
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_seat INTEGER;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;
  UPDATE public.founders_seats
     SET reserved_by    = NULL,
         reserved_until = NULL
   WHERE reserved_by = p_user_id
     AND capture_id IS NULL
  RETURNING seat_no INTO v_seat;
  RETURN v_seat;
END;
$$;

-- Restrict EXECUTE so only service_role can call these functions.
-- (Anon/authenticated roles still can't call them because SECURITY DEFINER
--  with no public GRANT is the default — but be explicit for defense-in-depth.)
REVOKE ALL ON FUNCTION public.claim_founders_seat(UUID, INTEGER)    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_founders_seat(UUID, TEXT)    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_founders_seat(UUID)            FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.claim_founders_seat(UUID, INTEGER) TO service_role;
GRANT  EXECUTE ON FUNCTION public.finalize_founders_seat(UUID, TEXT) TO service_role;
GRANT  EXECUTE ON FUNCTION public.release_founders_seat(UUID)        TO service_role;

COMMENT ON TABLE public.founders_seats IS
  'Pre-numbered 100-seat ledger for the Founders Lifetime tier. claim_founders_seat() / finalize_founders_seat() / release_founders_seat() are the atomic API.';
