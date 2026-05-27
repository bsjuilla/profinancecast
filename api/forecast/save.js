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
// Returns 429 if rate-limit exceeded (per-user).
// Fails closed on Supabase outage (logs but returns 200 so the client
// doesn't think the forecast itself failed — only telemetry is impacted).
//
// FULL-P0-C2 hardening (audit 2026-05-26):
//   1) bodyParser size cap — this endpoint reads ZERO body fields, so
//      Vercel's default 4MB ceiling was pure DoS surface. An authenticated
//      attacker could POST 4MB of garbage 10/s and consume function memory
//      while the body parser munched through the payload. 1KB is generous
//      (the real body is empty `{}`).
//   2) Per-user rate limit via the shared Upstash helper. Soft-fails open
//      if Upstash isn't configured (same trade-off as the payment
//      endpoints; better to allow legit telemetry than break activation
//      tracking during a Redis outage).
export const config = { api: { bodyParser: { sizeLimit: '1kb' } } };

import { createClient } from '@supabase/supabase-js';
import { rateLimitOrReject } from '../_lib/rate-limit.js';

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

  // FULL-P0-C2 — per-user rate limit. Bucket key includes the endpoint
  // label so cancel/create budgets stay separate from this telemetry tap.
  // 10/min per user is generous (a real user runs the forecast once or
  // twice per session) but caps any script-level abuse to PayPal-safe
  // bounds. Auth check above runs BEFORE this so the rate-limit bucket
  // is keyed on a verified user id (not a forgeable header).
  const rl = await rateLimitOrReject(req, res, `forecast-save:${userId}`);
  if (rl) return;

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
