// api/subscription/cancel.js
//
// Schedules a Pro cancellation at end-of-period (audit H1).
//
// Behaviour:
//   - Sets cancel_at_period_end = true and cancelled_at = now()
//   - KEEPS status = 'active' so the user retains Pro until current_period_end.
//   - status.js returns Pro for an active+cancel_scheduled row whose
//     current_period_end is in the future. The PayPal webhook flips status
//     to 'cancelled' once the paid period truly ends.
//
// Previously this set status='cancelled' immediately, which status.js then
// treated as Free — users who self-cancelled lost access the same minute,
// despite having paid for the rest of the month.

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
  const userId = userData.user.id;

  // Read current row first so we can echo period_end back to the client and
  // be idempotent on duplicate cancel clicks.
  const { data: existing, error: readErr } = await supabase
    .from('subscriptions')
    .select('user_id, status, plan, current_period_end, cancel_at_period_end')
    .eq('user_id', userId)
    .maybeSingle();

  if (readErr) {
    console.error('[cancel] read err:', readErr);
    return res.status(500).json({ error: 'Could not read subscription.' });
  }
  if (!existing) {
    return res.status(400).json({ error: 'No subscription to cancel.' });
  }
  if (existing.status !== 'active') {
    return res.status(400).json({ error: 'Subscription is not active.' });
  }
  if (existing.cancel_at_period_end === true) {
    // Already scheduled — return idempotent success.
    return res.status(200).json({
      ok: true,
      already_cancelled: true,
      cancel_at_period_end: true,
      current_period_end: existing.current_period_end,
    });
  }

  const nowIso = new Date().toISOString();
  const { data: updated, error: updErr } = await supabase
    .from('subscriptions')
    .update({
      // status intentionally NOT changed; webhook will flip to 'cancelled' at period end.
      cancel_at_period_end: true,
      cancelled_at: nowIso,
      cancel_reason: 'user_requested',
      updated_at: nowIso,
    })
    .eq('user_id', userId)
    .select('status, plan, current_period_end, cancel_at_period_end, cancelled_at')
    .single();

  if (updErr) {
    console.error('[cancel] update err:', updErr);
    return res.status(500).json({ error: 'Could not cancel — please try again.' });
  }

  // Append-only audit trail (audit M3) — non-fatal on failure.
  try {
    await supabase.from('subscription_events').insert({
      user_id: userId,
      event_type: 'cancellation_scheduled',
      provider: 'paypal',
      provider_id: null,
      amount: null,
      currency: null,
      raw_payload: {
        source: 'api/subscription/cancel.js',
        plan: existing.plan,
        scheduled_at: nowIso,
        current_period_end: existing.current_period_end,
      },
    });
  } catch (logErr) {
    console.error('[cancel] event log non-fatal:', logErr);
  }

  return res.status(200).json({
    ok: true,
    status: updated.status,
    cancel_at_period_end: updated.cancel_at_period_end,
    cancelled_at: updated.cancelled_at,
    current_period_end: updated.current_period_end,
    message: 'Cancellation scheduled. Pro access remains until the end of your current period.',
  });
}
