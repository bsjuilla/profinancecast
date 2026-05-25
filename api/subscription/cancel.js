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
import { rateLimitOrReject } from '../_lib/rate-limit.js';

const APP_ORIGIN = process.env.APP_ORIGIN || 'https://profinancecast.com';

// W29-b helpers — only invoked when the user holds a recurring Billing
// Plans subscription (existing.provider_subscription_id IS NOT NULL).
function _paypalBase() {
  return (process.env.PAYPAL_ENV === 'sandbox')
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';
}

// NEW-P1b fix — retry wrapper mirroring create-order.js / capture-order.js.
// Cancel is critical: if it fails silently and we just flip our local flag,
// PayPal keeps charging the user at next billing cycle.
async function _fetchPayPalWithRetry(url, opts, label) {
  const RETRYABLE = new Set([429, 502, 503, 504]);
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, opts);
      if (res.ok) return res;
      if (!RETRYABLE.has(res.status) || attempt === 2) return res;
      lastErr = new Error(`PayPal ${label} returned ${res.status}`);
    } catch (e) {
      lastErr = e;
      if (attempt === 2) throw e;
    }
    const baseMs = attempt === 0 ? 200 : 600;
    const jitter = Math.floor(Math.random() * 200);
    await new Promise(r => setTimeout(r, baseMs + jitter));
  }
  if (lastErr) throw lastErr;
  return null;
}

async function _getPayPalAccessToken() {
  const creds = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');
  const res = await _fetchPayPalWithRetry(`${_paypalBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  }, 'oauth2/token');
  if (!res.ok) throw new Error('PayPal auth failed (cancel)');
  return (await res.json()).access_token;
}

// NEW-P1b fix — best-effort alert sink for cancel failures that need support
// intervention. CISO #3 fan-out: email AND Slack independently. Identical
// signature to webhook-paypal.js _alertOps; copy kept here until NEW-R1
// shared lib refactor lands.
async function _alertOps(subject, body) {
  await Promise.allSettled([
    _alertViaEmail(subject, body),
    _alertViaSlack(subject, body),
  ]);
}

async function _alertViaEmail(subject, body) {
  const apiKey = process.env.RESEND_API_KEY;
  const to     = process.env.ALERT_EMAIL;
  const from   = process.env.ALERT_FROM_EMAIL || 'alerts@profinancecast.com';
  if (!apiKey || !to) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from, to: [to],
        subject: `[PFC alerts] ${subject}`,
        text: body,
      }),
    });
  } catch (e) {
    console.error('[cancel] _alertViaEmail failed:', e?.message || e);
  }
}

async function _alertViaSlack(subject, body) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return;
  try {
    const truncated = String(body).slice(0, 2500);
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `🚨 *${subject}*\n\`\`\`${truncated}\`\`\``,
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: `🚨 ${subject}`.slice(0, 150) } },
          { type: 'section', text: { type: 'mrkdwn', text: '```' + truncated + '```' } },
          { type: 'context', elements: [{ type: 'mrkdwn', text: `_ProFinanceCast cancel alert · ${new Date().toISOString()}_` }] },
        ],
      }),
    });
  } catch (e) {
    console.error('[cancel] _alertViaSlack failed:', e?.message || e);
  }
}

// W26-a #12 + W29-c regression fix: origin/referer check now accepts both
// www and apex variants of the same domain. Same defense-in-depth posture.
function _normalizeOrigin(o) {
  if (!o || typeof o !== 'string') return '';
  try {
    const u = new URL(o);
    return u.protocol + '//' + u.hostname.replace(/^www\./, '') + (u.port ? ':' + u.port : '');
  } catch { return ''; }
}
function _originAllowed(req) {
  if (!APP_ORIGIN || !APP_ORIGIN.startsWith('https://')) return true;
  const expected = _normalizeOrigin(APP_ORIGIN);
  if (!expected) return false;
  const origin = req.headers.origin || '';
  const referer = req.headers.referer || '';
  if (origin) return _normalizeOrigin(origin) === expected;
  if (referer) {
    try { return _normalizeOrigin(new URL(referer).origin) === expected; }
    catch { return false; }
  }
  return false;
}

// B-P0-CORS-PIN (audit 2026-05-25) — set explicit CORS headers BEFORE
// any early return so the browser sees a real status code instead of a
// generic CORS error on 4xx. The _originAllowed() check below already
// rejects cross-origin POSTs at the application layer; this is
// defense-in-depth + better DX when an authenticated request from prod
// hits a non-OK path. Same pattern as SAGE-P0-BACK.
function _setCors(req, res) {
  const origin = req.headers.origin || '';
  if (_originAllowed(req)) {
    res.setHeader('Access-Control-Allow-Origin', origin || APP_ORIGIN);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
  }
}

export default async function handler(req, res) {
  _setCors(req, res);
  // B-P0-CORS-PIN — OPTIONS preflight for browsers that probe before POST.
  if (req.method === 'OPTIONS') return res.status(204).end();
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

  // NEW-S4 fix — per-user rate limit on cancel to prevent flapping.
  if (await rateLimitOrReject(req, res, `cancel:${userId}`)) return;

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
  //
  // NEW-P1b fix — wrap PayPal cancel call in retry, alert ops on persistent
  // failure, and surface a paypal_cancel_failed flag on the response so the
  // client can show a support-escalation message.
  let paypalCancelFailed = false;
  let paypalCancelStatus = null;
  if (existing.provider_subscription_id) {
    try {
      const accessToken = await _getPayPalAccessToken();
      const cancelRes = await _fetchPayPalWithRetry(
        `${_paypalBase()}/v1/billing/subscriptions/${encodeURIComponent(existing.provider_subscription_id)}/cancel`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ reason: 'User requested cancellation' }),
        },
        'subscription-cancel'
      );
      paypalCancelStatus = cancelRes.status;
      // PayPal returns 204 on success. 422 means "already cancelled" which
      // we treat as idempotent success. Any other error after retries: alert
      // ops, surface the failure to the client. Still flip the local flag
      // so the user sees "scheduled to cancel" in the UI rather than being
      // locked into an inconsistent "active" state.
      if (!cancelRes.ok && cancelRes.status !== 422) {
        const errText = await cancelRes.text();
        paypalCancelFailed = true;
        console.error('[cancel] PayPal cancel failed after retries:', cancelRes.status, errText, {
          userId, subscriptionId: existing.provider_subscription_id,
        });
        _alertOps(
          'Cancel failed at PayPal — user may keep getting charged',
          `user_id: ${userId}\n` +
          `subscriptionId: ${existing.provider_subscription_id}\n` +
          `paypal_status: ${cancelRes.status}\n` +
          `paypal_body: ${errText.slice(0, 500)}\n\n` +
          `Local cancel_at_period_end flipped to true but PayPal still has ` +
          `this subscription active. They will charge the user at next billing ` +
          `time unless someone cancels it manually via the PayPal dashboard ` +
          `(Activity → Recurring → find subscription → Cancel) AND emails the ` +
          `user to confirm.`
        );
      }
    } catch (e) {
      paypalCancelFailed = true;
      console.error('[cancel] PayPal cancel threw:', e?.message || e, {
        userId, subscriptionId: existing.provider_subscription_id,
      });
      _alertOps(
        'Cancel threw at PayPal — user may keep getting charged',
        `user_id: ${userId}\n` +
        `subscriptionId: ${existing.provider_subscription_id}\n` +
        `error: ${String(e?.stack || e?.message || e).slice(0, 500)}\n\n` +
        `Local cancel_at_period_end flipped to true but PayPal call never ` +
        `completed. Cancel manually via PayPal dashboard, then email user.`
      );
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
    // NEW-P1b — surface PayPal-side cancel state to the client so it can
    // show a support-escalation message if the local flip succeeded but
    // PayPal didn't acknowledge the cancellation.
    paypal_cancel_failed: paypalCancelFailed,
    paypal_cancel_status: paypalCancelStatus,
    message: paypalCancelFailed
      ? 'Cancellation scheduled locally, but we could not confirm with PayPal. Your next charge may still happen — our team has been alerted and will reconcile within 24 hours. Email support@profinancecast.com if you see another charge.'
      : 'Cancellation scheduled. Pro access remains until the end of your current period.',
  });
}
