-- 2026-05-10 — Sprint 7
-- Adds:
--   1. profiles.first_forecast_at + forecast_count columns (used by api/forecast/save.js)
--   2. Defense-in-depth UPDATE policy on profiles (no-op now that forecast/save.js
--      uses service role, but kept so a future switch back to anon-key + JWT
--      forwarding doesn't silently break)
--   3. Free-tier default ai_queries_limit raised from 5 to 10 (matches pricing.md)
-- Safe to re-run; uses IF NOT EXISTS guards.

-- ── 1. Activation-event columns ────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_forecast_at TIMESTAMPTZ;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS forecast_count INT NOT NULL DEFAULT 0;

-- ── 2. UPDATE policy (defense-in-depth) ────────────────────────────────────
-- The api/forecast/save.js endpoint uses service role and scopes via .eq('id', uid),
-- so RLS is not load-bearing here. This policy exists so that if anyone reverts
-- the endpoint to anon-key + JWT forwarding, the activation update still works.
DROP POLICY IF EXISTS "users_set_first_forecast_once" ON public.profiles;
CREATE POLICY "users_set_first_forecast_once"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ── 3. Quota floor matches pricing.md (Free=10, Pro=200) ───────────────────
-- Update the trigger that creates new profiles + bring existing free users up.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, plan, ai_queries_limit, ai_queries_reset_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'free',
    10,
    NOW() + INTERVAL '30 days'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bring existing free users up to 10 (no effect on Pro users — they have 200).
UPDATE public.profiles
   SET ai_queries_limit = 10
 WHERE plan = 'free' AND ai_queries_limit = 5;
