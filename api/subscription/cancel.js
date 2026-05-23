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

const APP_ORIGIN = process.env.APP_ORIGIN || 'https://profinancecast.com';

// W29-b helpers — only invoked when the user holds a recurring Billing
// Plans subscription (existing.provider_subscription_id IS NOT NULL).
function _paypalBase() {
  return (process.env.PAYPAL_ENV === 'sandbox')
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';
}
async function _getPayPalAccessToken() {
  const creds = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');
  const res = await fetch(`${_paypalBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error('PayPal auth failed (cancel)');
  return (await res.json()).access_token;
}

// W26-a #12: origin/referer same-site check on mutating subscription ops.
// Cancellation is destructive (revokes Pro entitlement at period end); same
// defense-in-depth as create/capture order endpoints.
function _originAllowed(req) {
  if (!APP_ORIGIN || !APP_ORIGIN.startsWith('https://')) return true;
  const origin = req.headers.origin || '';
  const referer = req.headers.referer || '';
  if (origin) return origin === APP_ORIGIN;
  if (referer) {
    try { return new URL(referer).origin === APP_ORIGIN; } catch { return false; }
  }
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // W26-a #12: reject cross-origin/no-origin requests.
  if (!_originAllowed(req)) {
    return res.status(403).json({ error: 'Forbidden: invalid origin' });
  }

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

  // Read current row first so we can echo period_end back to the client,
  // be idempotent on duplicate cancel clicks, AND detect whether this is
  // a recurring Billing Plans subscription (W29-b: provider_subscription_id
  // IS NOT NULL) — those need a PayPal-side cancel call too.
  const { data: existing, error: readErr } = await supabase
    .from('subscriptions')
    .select('user_id, status, plan, current_period_end, cancel_at_period_end, provider_subscription_id, subscription_state')
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

  // W29-b #14 — For recurring Billing Plans subs, ALSO call PayPal's
  // cancel-subscription endpoint. Without this, PayPal would keep charging
  // the user at next billing time even after we marked cancel_at_period_end.
  // For one-shot rows (founders, legacy Pro/Premium) this block is skipped
  // and behaviour is unchanged from W26-b.
  if (existing.provider_subscription_id) {
    try {
      const accessToken = await _getPayPalAccessToken();
      const cancelRes = await fetch(
        `${_paypalBase()}/v1/billing/subscriptions/${encodeURIComponent(existing.provider_subscription_id)}/cancel`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ reason: 'User requested cancellation' }),
        }
      );
      // PayPal returns 204 on success. 422 means "already cancelled" which
      // we treat as idempotent success. Any other error: log + still flip
      // our local flag (PayPal won't have stopped billing, but the user
      // should not be locked into an "active" state in our UI — they need
      // a path to escalate via support).
      if (!cancelRes.ok && cancelRes.status !== 422) {
        const errText = await cancelRes.text();
        console.error('[cancel] PayPal cancel failed:', cancelRes.status, errText, {
          userId, subscriptionId: existing.provider_subscription_id,
        });
        // Don't fail the whole request — surface the local cancel-at-period-end
        // anyway and let support reconcile. Returning 502 here would leave the
        // user with an active PayPal sub AND no local cancel state.
      }
    } catch (e) {
      console.error('[cancel] PayPal cancel threw:', e?.message || e, {
        userId, subscriptionId: existing.provider_subscription_id,
      });
      // Same fallback policy as above.
    }
  }

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
