// api/subscription/cancel.js
//
// Marks the user's subscription as scheduled to cancel at period end.
// We do NOT immediately revoke access — the user paid for the current month.
// PayPal-side cancellation of recurring billing is handled by the customer
// in their PayPal account (PayPal does not let merchants unilaterally cancel
// one-off captures without a billing-plan ID, which we don't use yet).
//
// When the period rolls over and current_period_end < now,
// api/subscription/status returns 'free' automatically.

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing auth token' });

  const supabase = createClient(
    process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) return res.status(401).json({ error: 'Invalid auth token' });

  const { error } = await supabase
    .from('subscriptions')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancel_reason: 'user_requested',
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userData.user.id);

  if (error) {
    console.error('cancel error:', error);
    return res.status(500).json({ error: 'Could not cancel — please try again.' });
  }
  return res.status(200).json({ ok: true });
}
