// api/account/delete.js
//
// GDPR/CCPA-compliant account deletion.
// Verifies a Supabase Bearer token, then uses the service-role admin API to
// delete the auth.users row. RLS-cascading FKs on `subscriptions`, `profiles`,
// etc. clean up the related rows automatically.
//
// Returns:
//   204 No Content  — success
//   401             — missing/invalid auth token (never trust the body)
//   405             — non-POST
//   500             — server error
//
// Hard rule: this endpoint MUST require a valid Bearer token. There is no
// path that accepts a userId from the request body — the userId is derived
// strictly from the verified session.
//
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  if (!token) return res.status(401).json({ error: 'Missing auth token' });

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[account/delete] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env');
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  // 1) Verify the token and resolve the user. Never trust client-supplied IDs.
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user?.id) {
    return res.status(401).json({ error: 'Invalid auth token' });
  }
  const userId = userData.user.id;

  // 2) Best-effort: mark the subscription as cancelled before nuking auth row.
  //    RLS-cascading deletes would remove the row anyway, but the
  //    cancellation marker leaves an audit trail.
  try {
    await supabase
      .from('subscriptions')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancel_reason: 'account_deleted',
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
  } catch (e) {
    console.warn('[account/delete] subscription mark-cancelled failed:', e?.message || e);
  }

  // 3) Hard-delete the auth.users row via admin API. Cascading FKs handle
  //    profiles, subscriptions, etc.
  const { error: delErr } = await supabase.auth.admin.deleteUser(userId);
  if (delErr) {
    console.error('[account/delete] admin.deleteUser failed:', delErr);
    return res.status(500).json({ error: 'Could not delete account — please contact support.' });
  }

  return res.status(204).end();
}
