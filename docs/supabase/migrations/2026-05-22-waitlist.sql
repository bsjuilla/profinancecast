-- W24 — Waitlist table for the channel-test launch (Wave-13 GTM plan).
--
-- RUN THIS in Supabase SQL Editor BEFORE deploying api/waitlist/subscribe.js.
-- This migration is idempotent — safe to re-run.
--
-- Semantics:
--   Waitlist (this table) ≠ Newsletter (public.newsletter_signups).
--   Newsletter is for "send me blog updates" — ongoing content opt-in.
--   Waitlist is for "I want early access when ProFinanceCast launches" —
--   one-shot launch-announcement intent. Different lifecycle, different
--   GDPR retention story, different table.
--
-- GDPR design:
--   - email is the only PII stored long-term
--   - consent_at is mandatory (set automatically by API endpoint when
--     user submits with consent checkbox checked)
--   - unsubscribed_at is nullable; setting it via the unsubscribe link
--     soft-deletes the entry (we keep the row to honor "do not re-add")
--   - Day-14 deletion drill: a row marked unsubscribed_at >= 14 days
--     ago can be HARD-DELETED (see docs/runbooks/waitlist-deletion-sop.md)
--   - ip_hash is sha256(ip + supabase_url_salt), 32 chars. Not reversible
--     to the original IP. Used for spam-pattern detection only.

create table if not exists public.waitlist (
  id              uuid primary key default gen_random_uuid(),
  email           text not null,
  use_case        text,
  source          text default 'waitlist_page',
  consent_at      timestamptz not null default now(),
  confirmed_at    timestamptz, -- nullable; reserved for future double-opt-in
  unsubscribed_at timestamptz, -- nullable
  ip_hash         text,
  user_agent      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Case-insensitive uniqueness on email
create unique index if not exists waitlist_email_unique_idx
  on public.waitlist (lower(email));

-- Auto-update updated_at on row change
create or replace function public.waitlist_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists waitlist_set_updated_at_trg on public.waitlist;
create trigger waitlist_set_updated_at_trg
  before update on public.waitlist
  for each row execute function public.waitlist_set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────
-- Default-deny. Only the service role (used by api/waitlist/subscribe.js)
-- can read or write. Anon role gets NO access — PII protection.

alter table public.waitlist enable row level security;

-- Explicit revoke from anon + authenticated to be sure
revoke all on public.waitlist from anon;
revoke all on public.waitlist from authenticated;

-- Service-role bypasses RLS by design; no policy needed for it.

-- ── Comments for future readers ───────────────────────────────────────
comment on table public.waitlist is
  'Pre-launch waitlist signups. GDPR: email is PII, consent_at required, unsubscribed_at gates re-emails, Day-14 deletion SOP at docs/runbooks/waitlist-deletion-sop.md';
comment on column public.waitlist.consent_at is
  'Timestamp the user checked the explicit-consent box on /waitlist.html. NOT a default — must be set by the API endpoint.';
comment on column public.waitlist.use_case is
  'Optional ICP-segmentation field. Free text. Values: cross-border / FIRE / household / other / null.';
comment on column public.waitlist.ip_hash is
  'sha256(ip + SUPABASE_URL salt) truncated to 32 chars. Not reversible. For spam-pattern detection only.';
