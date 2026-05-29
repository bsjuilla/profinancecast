// api/profile/notifications.js — read / update a user's email-notification
// preferences. Currently exposes a single preference: weeklyCheckinOptIn
// (the privacy-preserving Weekly Check-In email). Stores NO financial data.
//
// Auth: Bearer JWT (Supabase access token). We verify the token with the
// SERVICE-ROLE client via auth.getUser(token) — the same pattern as
// api/subscription/status.js — then scope every DB write to WHERE id =
// <verified user id>. The profiles UPDATE RLS policy was tightened in
// 20260523_profiles_update_policy_tighten so authenticated clients cannot
// self-update; all writes flow through verified service-role endpoints
// like this one.
//
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// GET  /api/profile/notifications        -> { weeklyCheckinOptIn: boolean }
// POST /api/profile/notifications        body { weeklyCheckinOptIn: boolean }
//                                        -> { weeklyCheckinOptIn: boolean }

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('profile/notifications: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
    return res.status(500).json({ error: 'Server not configured' });
  }

  const auth  = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  // Verify the JWT and resolve the caller's user id. getUser(token) round-trips
  // to the auth server, so a forged/expired token is rejected here.
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user?.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const userId = userData.user.id;

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('profiles')
      .select('weekly_checkin_opt_in')
      .eq('id', userId)
      .single();
    if (error) {
      // Redact: log code only (matches founders-claimed.js / status.js).
      console.error('[profile/notifications] read failed code=' + (error?.code || 'UNKNOWN'));
      return res.status(500).json({ error: 'Read failed' });
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ weeklyCheckinOptIn: !!data?.weekly_checkin_opt_in });
  }

  // POST — update the single preference. Strictly typed: only a boolean is
  // accepted, and only the caller's own row is touched.
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  const optIn = body && body.weeklyCheckinOptIn;
  if (typeof optIn !== 'boolean') {
    return res.status(400).json({ error: 'weeklyCheckinOptIn must be a boolean' });
  }

  const { error } = await supabase
    .from('profiles')
    .update({ weekly_checkin_opt_in: optIn })
    .eq('id', userId);
  if (error) {
    console.error('[profile/notifications] update failed code=' + (error?.code || 'UNKNOWN'));
    return res.status(500).json({ error: 'Update failed' });
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ weeklyCheckinOptIn: optIn });
}
