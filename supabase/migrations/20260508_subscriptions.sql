-- Subscriptions + profiles schema
-- Run in Supabase SQL editor (one-time). Safe to re-run; uses IF NOT EXISTS.

-- ── profiles: one row per auth.users.id with plan + usage counters ───────
CREATE TABLE IF NOT EXISTS public.profiles (
  id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name         TEXT,
  plan              TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro','premium')),
  ai_queries_used   INT  NOT NULL DEFAULT 0,
  ai_queries_limit  INT  NOT NULL DEFAULT 5,
  ai_queries_reset_at TIMESTAMPTZ,
  country_code      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── subscriptions: paid plan rows, written by api/paypal/capture-order ──
CREATE TABLE IF NOT EXISTS public.subscriptions (
  user_id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan                 TEXT NOT NULL CHECK (plan IN ('pro','premium')),
  status               TEXT NOT NULL CHECK (status IN ('active','cancelled','expired','past_due')),
  provider             TEXT NOT NULL DEFAULT 'paypal',
  provider_order_id    TEXT,
  provider_capture_id  TEXT,
  amount_usd           NUMERIC(10,2),
  current_period_end   TIMESTAMPTZ,
  cancelled_at         TIMESTAMPTZ,
  cancel_reason        TEXT,
  dispute_open         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_period_end ON public.subscriptions (current_period_end);

-- ── RLS: users can read their own row, service role writes ───────────────
ALTER TABLE public.profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_self_select"       ON public.profiles;
DROP POLICY IF EXISTS "subscriptions_self_select"  ON public.subscriptions;

CREATE POLICY "profiles_self_select"      ON public.profiles      FOR SELECT USING (auth.uid() = id);
CREATE POLICY "subscriptions_self_select" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);

-- ── Auto-create a profile row when a user signs up ───────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Atomic counter increment used by api/sage.js ─────────────────────────
CREATE OR REPLACE FUNCTION public.increment_ai_queries(p_user_id UUID)
RETURNS INT AS $$
  UPDATE public.profiles
     SET ai_queries_used = ai_queries_used + 1,
         updated_at = NOW()
   WHERE id = p_user_id
   RETURNING ai_queries_used;
$$ LANGUAGE sql SECURITY DEFINER;
