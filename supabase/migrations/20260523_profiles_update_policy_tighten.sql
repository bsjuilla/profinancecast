-- NEW-P0b fix / W29-post-restart — drop the open profiles UPDATE policy.
--
-- Why: 20260510_owner_override_and_forecast_policy.sql:21-27 installed a
-- column-unrestricted UPDATE policy on profiles that allowed any signed-in
-- user to modify any column on their own row, including ai_queries_limit
-- and ai_queries_used. Combined with the publicly-shipped Supabase anon
-- key (js/pfc-config.js:46 — intentional design) and api/sage.js:319
-- reading profile.ai_queries_limit for the AI quota cap, this let a free
-- user grant themselves unlimited Sage AI via one browser-console call:
--
--   await supabase.from('profiles')
--     .update({ai_queries_used: 0, ai_queries_limit: 999999})
--     .eq('id', userId);
--
-- All current writers to profiles (api/forecast/save.js, api/sage.js
-- increment_ai_queries RPC, payment endpoints) use SUPABASE_SERVICE_ROLE_KEY
-- which bypasses RLS. No legitimate authenticated-client UPDATE path
-- exists. Drop the policy.
--
-- Detection note: if anyone exploited this between 2026-05-10 and the
-- application of this migration, Supabase admin logs under role
-- 'authenticated' with target table='profiles' and operation='UPDATE'
-- will show it. After applying this migration, repair affected users
-- by recomputing ai_queries_limit from their plan tier.
--
-- Safe to re-run.

DROP POLICY IF EXISTS "users_set_first_forecast_once" ON public.profiles;

-- Defense-in-depth: also block self-update at the column level via a
-- trigger that REJECTS authenticated-role attempts to modify quota or
-- plan. If a future migration re-adds an UPDATE policy by mistake, this
-- trigger still blocks the dangerous columns.
--
-- service_role bypasses RLS but ALSO bypasses this trigger because the
-- request.jwt.claim.role setting reflects the JWT role, which is
-- 'service_role' for the server-side SUPABASE_SERVICE_ROLE_KEY. Trigger
-- only fires for the 'authenticated' role (i.e., anon-key + user JWT).
CREATE OR REPLACE FUNCTION public.profiles_block_quota_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := current_setting('request.jwt.claim.role', true);
  IF v_role = 'authenticated' THEN
    IF NEW.ai_queries_limit IS DISTINCT FROM OLD.ai_queries_limit
       OR NEW.ai_queries_used  IS DISTINCT FROM OLD.ai_queries_used
       OR NEW.plan             IS DISTINCT FROM OLD.plan THEN
      RAISE EXCEPTION 'forbidden: client cannot modify quota or plan fields'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_block_quota_self_update_t ON public.profiles;
CREATE TRIGGER profiles_block_quota_self_update_t
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_block_quota_self_update();

COMMENT ON FUNCTION public.profiles_block_quota_self_update IS
  'NEW-P0b defense-in-depth: even if a future migration re-installs a permissive UPDATE policy on profiles, this trigger blocks the authenticated role from modifying ai_queries_limit, ai_queries_used, or plan. service_role bypasses (role check) and stays unaffected.';
