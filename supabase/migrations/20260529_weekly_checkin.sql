-- 20260529_weekly_checkin.sql — Weekly Check-In retention email preference.
--
-- The Weekly Check-In is a privacy-preserving Sunday nudge ("your weekly
-- check-in is ready") sent by the Weekly Check-In cron (hosted on
-- api/founders-claimed.js; logic in api/_lib/weekly-checkin-core.js) to users who have
-- OPTED IN. The email contains NO financial data — the report-card grade it
-- invites the user to view is computed client-side after they click. Design
-- per the 2026-05-29 retention research (CCO advisor + research agent), which
-- converged on this loop because (a) it works for 100% of users via email
-- (iOS web-push is blocked in the EU + needs Add-to-Home-Screen), (b) it
-- reuses the existing client-side report-card grader, and (c) it respects the
-- privacy model (the server is blind to user finances).
--
-- This migration stores ONLY a boolean preference + a last-sent timestamp on
-- the profiles row. No financial figure is ever stored server-side.
--
-- GDPR / anti-spam posture (three independent guards, so applying this
-- migration can NEVER, by itself, cause an email to be sent):
--   1. weekly_checkin_opt_in defaults to FALSE — nobody is emailed until they
--      explicitly enable the toggle in Settings -> Notifications.
--   2. The cron is gated by the WEEKLY_CHECKIN_LIVE env kill-switch.
--   3. The cron requires the Vercel CRON_SECRET bearer token.
-- The email itself carries a one-click opt-out instruction (Settings).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS weekly_checkin_opt_in       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS weekly_checkin_last_sent_at TIMESTAMPTZ;

-- Partial index: the cron only ever scans opted-in rows. Small index now,
-- meaningful speedup once the user base grows.
CREATE INDEX IF NOT EXISTS profiles_weekly_checkin_due_idx
  ON public.profiles (weekly_checkin_last_sent_at)
  WHERE weekly_checkin_opt_in = true;

COMMENT ON COLUMN public.profiles.weekly_checkin_opt_in IS
  'User opted in to the privacy-preserving Weekly Check-In email (Settings -> Notifications). Default false (explicit opt-in).';
COMMENT ON COLUMN public.profiles.weekly_checkin_last_sent_at IS
  'Timestamp of the last Weekly Check-In email send. The cron skips rows sent within the last 6 days (idempotency / no double-send).';
