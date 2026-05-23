-- W27-d — Schema verification queries (audit findings #19 + #28).
-- These are not DDL; they're SELECTs you run once after deploying W27 to
-- confirm the production schema matches what the codebase expects.
--
-- #19 — subscriptions.user_id should be UNIQUE
--   The original schema (20260508_subscriptions.sql:19) declares user_id as
--   the PRIMARY KEY, so UNIQUE is implied. This query confirms the constraint
--   actually exists in your deployed DB (in case a migration drifted).
--
--   Expected: at least one row with constraint_type='PRIMARY KEY' on user_id.
--
SELECT
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name   = 'subscriptions'
  AND kcu.column_name = 'user_id'
  AND tc.constraint_type IN ('PRIMARY KEY','UNIQUE');

-- #28 — subscriptions.created_at should DEFAULT now()
--   The original schema (20260508_subscriptions.sql:30) declares
--     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
--   Without the default, every new row would have created_at = NULL and
--   forensic queries ("when did this user first become Pro?") would fail.
--
--   Expected: column_default value contains 'now()'.
--
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'subscriptions'
  AND column_name  = 'created_at';
