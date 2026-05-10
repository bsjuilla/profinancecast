// api/forecast/save.js
//
// Activation-event marker. The forecast itself runs entirely client-side
// (that is the moat — no bank credentials, no projections leaving the
// browser). This endpoint exists only to record that a signed-in user has
// produced their first forecast, so we can compute activation rate
// (UX-BRIEF §1: "first_forecast AND dashboard_view ≥2 within 7d") without
// the page-event beacon, which is unreliable for funnels.
//
// On POST, writes profiles.first_forecast_at = now() if currently NULL
// (idempotent — second + Nth saves are no-op). No body required, no PII
// stored. Auth via Supabase access token in Authorization: Bearer.
//
// Single round-trip: the user's JWT is forwarded to Supabase as an
// authorization header, and RLS scopes the update to the caller's own
// profiles row + the first_forecast_at column only. Policy:
//   create policy "users_set_first_forecast_once"
//   on public.profiles for update to authenticated
//   using ( id = auth.uid() and first_forecast_at is null )
//   with check ( id = auth.uid() );
// (See vault: 2026-05-10 RLS migration. Without that policy this endpoint
// will silently no-op — RLS deny without service-role bypass.)
//
// Returns 200 { first_run: boolean } so the client analytics wrapper can
// fire `forecast_first_run` exactly once.
// Returns 401 if no/invalid token.
// Fails closed on Supabase outage (logs but returns 200 so the client
// doesn't think the forecast itself failed — only telemetry is impacted).

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Missing token' });

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('forecast/save: missing Supabase env');
    return res.status(200).json({ first_run: false });
  }

  // Service-role client (matches status.js / sage.js convention). Bypasses
  // RLS — we MUST scope the update explicitly via .eq('id', userId) below,
  // or any row whose first_forecast_at is NULL would be updated.
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  // Resolve the caller from the JWT (validates signature + freshness).
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  const userId = userData.user.id;

  // Conditional update scoped to the caller's own row. The .is() filter
  // makes this idempotent — second + Nth saves return zero rows.
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('profiles')
    .update({ first_forecast_at: nowIso })
    .eq('id', userId)
    .is('first_forecast_at', null)
    .select('id');

  if (error) {
    console.error('forecast/save: update error:', error);
    return res.status(200).json({ first_run: false });
  }

  const firstRun = Array.isArray(data) && data.length === 1;
  return res.status(200).json({ first_run: firstRun });
}
