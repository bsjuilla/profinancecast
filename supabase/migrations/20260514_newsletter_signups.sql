-- Newsletter signups table for the public blog "Subscribe free" button.
-- Stores raw emails server-side; export to mailing-list provider when needed.
-- Public-insert via a dedicated RLS policy; reads restricted to service_role only.

CREATE TABLE IF NOT EXISTS public.newsletter_signups (
  id          BIGSERIAL PRIMARY KEY,
  email       CITEXT     NOT NULL,
  source      TEXT       NOT NULL DEFAULT 'blog',
  user_agent  TEXT,
  ip_hash     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT newsletter_signups_email_format CHECK (email ~* '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$')
);

-- Allow CITEXT type (case-insensitive email comparisons)
CREATE EXTENSION IF NOT EXISTS citext;

-- Unique on email so the same address can't be inserted twice
CREATE UNIQUE INDEX IF NOT EXISTS newsletter_signups_email_uniq
  ON public.newsletter_signups (email);

ALTER TABLE public.newsletter_signups ENABLE ROW LEVEL SECURITY;

-- No SELECT/UPDATE/DELETE policies for anon -- only the server (service_role) can read.
-- The insert happens via the API endpoint using SERVICE_ROLE_KEY, which bypasses RLS,
-- so no public INSERT policy is needed either. Defense in depth.
