-- ────────────────────────────────────────────────────────────────────────
-- Fix-up migration for projects that already had a profiles table from a
-- previous setup. Adds columns idempotently (ADD COLUMN IF NOT EXISTS works
-- on Postgres 9.6+, which Supabase always is).
--
-- Safe to run multiple times. Run this BEFORE 20260508_subscriptions.sql,
-- or run this alone if 20260508_subscriptions.sql failed mid-way.
-- ────────────────────────────────────────────────────────────────────────

-- ── profiles: add every column my code expects ─────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name           TEXT,
  ADD COLUMN IF NOT EXISTS plan                TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS ai_queries_used     INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_queries_limit    INT  NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS ai_queries_reset_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS country_code        TEXT,
  ADD COLUMN IF NOT EXISTS created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Add the plan check constraint only if it isn't already there
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_plan_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_plan_check CHECK (plan IN ('free','pro','premium'));
  END IF;
END$$;

-- ── subscriptions: create if missing, add columns if older version exists ─
CREATE TABLE IF NOT EXISTS public.subscriptions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS plan                TEXT,
  ADD COLUMN IF NOT EXISTS status              TEXT,
  ADD COLUMN IF NOT EXISTS provider            TEXT NOT NULL DEFAULT 'paypal',
  ADD COLUMN IF NOT EXISTS provider_order_id   TEXT,
  ADD COLUMN IF NOT EXISTS provider_capture_id TEXT,
  ADD COLUMN IF NOT EXISTS amount_usd          NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS current_period_end  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_reason       TEXT,
  ADD COLUMN IF NOT EXISTS dispute_open        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_plan_check') THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_plan_check CHECK (plan IN ('pro','premium'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_status_check') THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_status_check CHECK (status IN ('active','cancelled','expired','past_due'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_subscriptions_period_end ON public.subscriptions (current_period_end);

-- ── RLS: re-create policies (DROP first so this stays idempotent) ───────
ALTER TABLE public.profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_self_select"      ON public.profiles;
DROP POLICY IF EXISTS "subscriptions_self_select" ON public.subscriptions;

CREATE POLICY "profiles_self_select"      ON public.profiles      FOR SELECT USING (auth.uid() = id);
CREATE POLICY "subscriptions_self_select" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);

-- ── Auto-create profile on signup ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, plan, ai_queries_limit, ai_queries_reset_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'free',
    5,
    NOW() + INTERVAL '30 days'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Atomic counter for api/sage.js ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_ai_queries(p_user_id UUID)
RETURNS INT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.profiles
     SET ai_queries_used = ai_queries_used + 1,
         updated_at      = NOW()
   WHERE id = p_user_id
   RETURNING ai_queries_used;
$$;

-- ── Backfill: any existing user without a profile gets one ──────────────
INSERT INTO public.profiles (id, full_name, plan, ai_queries_limit, ai_queries_reset_at)
SELECT u.id,
       COALESCE(u.raw_user_meta_data->>'full_name', u.email),
       'free',
       5,
       NOW() + INTERVAL '30 days'
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
 WHERE p.id IS NULL;
