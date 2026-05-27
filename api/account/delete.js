// api/account/delete.js
//
// GDPR/CCPA-compliant account deletion.
// Verifies a Supabase Bearer token, then uses the service-role admin API to
// delete the auth.users row. RLS-cascading FKs on `subscriptions`, `profiles`,
// etc. clean up the related rows automatically.
//
// FULL-P0-A1 fix (audit 2026-05-26) — pre-fix this endpoint ONLY marked the
// subscriptions row as cancelled and deleted the auth row. It NEVER told
// PayPal to stop charging the user. Result: PayPal Billing Plans subscription
// kept charging the now-deleted user at next billing cycle → no associated
// account → support ticket → chargeback. We now MUST cancel every active
// PayPal subscription BEFORE deleting the auth row, and we MUST fail closed
// if PayPal cancellation fails (refusing the deletion is strictly better
// than silently letting the user keep getting charged).
//
// Returns:
//   204 No Content  — success
//   401             — missing/invalid auth token (never trust the body)
//   405             — non-POST
//   500             — server error
//   503             — PayPal cancellation failed; account NOT deleted (try again or contact support)
//
// Hard rule: this endpoint MUST require a valid Bearer token. There is no
// path that accepts a userId from the request body — the userId is derived
// strictly from the verified session.
//
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Required for PayPal cancellation (no-op if absent — Founders/legacy-only deployments):
//                PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV
// Optional: RESEND_API_KEY, ALERT_EMAIL, SLACK_WEBHOOK_URL (for ops alerts on cancel failures)

import { createClient } from '@supabase/supabase-js';

const APP_ORIGIN = process.env.APP_ORIGIN || 'https://profinancecast.com';

// FULL-P1-D1 (audit 2026-05-27) — CORS pin + origin guard. Account
// deletion is a destructive, irreversible operation; a malicious site
// running in the user's session-bearing browser shouldn't be able to
// trigger it via cross-origin POST (CSRF defence-in-depth). The auth
// token check below already requires a valid Bearer token from
// Supabase, but a cross-origin script with stolen access to a token
// could still issue the call — pinning Origin/Referer to APP_ORIGIN
// closes that vector. Pattern mirrors api/subscription/cancel.js.
function _normalizeOrigin(o) {
  if (!o || typeof o !== 'string') return '';
  try {
    const u = new URL(o);
    return u.protocol + '//' + u.hostname.replace(/^www\./, '') + (u.port ? ':' + u.port : '');
  } catch { return ''; }
}
function _originAllowed(req) {
  const IS_PROD = (process.env.VERCEL_ENV === 'production') || (process.env.NODE_ENV === 'production');
  if (!APP_ORIGIN || !APP_ORIGIN.startsWith('https://')) {
    if (IS_PROD) {
      console.error('[account/delete] APP_ORIGIN missing or non-https in production — refusing request');
      return false;
    }
    return true;
  }
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

// ── PayPal helpers (copied verbatim from api/subscription/cancel.js so this
//    file has the exact same retry / error semantics as the user-facing
//    cancel flow. When the NEW-R1 shared-lib refactor lands, both files
//    should switch to importing from api/_lib/paypal.js).

function _paypalBase() {
  return (process.env.PAYPAL_ENV === 'sandbox')
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';
}

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
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
    throw new Error('PayPal credentials not configured');
  }
  const creds = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');
  const res = await _fetchPayPalWithRetry(`${_paypalBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  }, 'oauth2/token');
  if (!res.ok) throw new Error('PayPal auth failed (account-delete)');
  return (await res.json()).access_token;
}

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
      body: JSON.stringify({ from, to: [to], subject: `[PFC alerts] ${subject}`, text: body }),
    });
  } catch (e) {
    console.error('[account/delete] _alertViaEmail failed:', e?.message || e);
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
          { type: 'context', elements: [{ type: 'mrkdwn', text: `_ProFinanceCast account-delete alert · ${new Date().toISOString()}_` }] },
        ],
      }),
    });
  } catch (e) {
    console.error('[account/delete] _alertViaSlack failed:', e?.message || e);
  }
}

// Cancel ONE PayPal subscription. Returns { ok, status, reason }.
// ok=true means PayPal acknowledged (204) or returned 422 (already cancelled — idempotent).
async function _cancelOnePayPalSubscription(accessToken, subscriptionId) {
  const cancelRes = await _fetchPayPalWithRetry(
    `${_paypalBase()}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Account deletion (GDPR/CCPA)' }),
    },
    'subscription-cancel'
  );
  if (cancelRes.ok) return { ok: true, status: cancelRes.status };
  if (cancelRes.status === 422) return { ok: true, status: 422, reason: 'already_cancelled' };
  const errText = await cancelRes.text().catch(() => '');
  return { ok: false, status: cancelRes.status, body: errText.slice(0, 500) };
}

export default async function handler(req, res) {
  // FULL-P1-D1 — CORS pin + OPTIONS preflight. Headers must be set
  // BEFORE the early returns below so the browser sees the right CORS
  // posture even on 4xx.
  _setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // FULL-P1-D1 — reject cross-origin / no-origin POSTs as CSRF defence.
  // The Bearer-token check below also prevents unauthenticated abuse,
  // but origin pinning blocks the case where a malicious site holds a
  // valid token (XSS-stolen, SSO bug, etc.) and tries to issue the
  // destructive account-delete cross-origin.
  if (!_originAllowed(req)) {
    return res.status(403).json({ error: 'Forbidden: invalid origin' });
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

  // 2) FULL-P0-A1 — enumerate every PayPal Billing Plans subscription that
  //    is still active for this user. We must call PayPal /cancel on each
  //    one BEFORE deleting the auth row, otherwise PayPal keeps charging
  //    the now-orphaned user at next billing cycle.
  //
  //    We include status='active' AND status='past_due' (suspended-but-
  //    recoverable subscriptions are also charged on retry). Founders /
  //    one-shot rows have provider_subscription_id IS NULL and are skipped.
  const { data: activeSubs, error: subsErr } = await supabase
    .from('subscriptions')
    .select('id, provider_subscription_id, status, plan')
    .eq('user_id', userId)
    .not('provider_subscription_id', 'is', null)
    .in('status', ['active', 'past_due']);

  if (subsErr) {
    console.error('[account/delete] could not enumerate subscriptions code=' + (subsErr.code || 'UNKNOWN'));
    return res.status(500).json({ error: 'Could not verify subscription state — please try again' });
  }

  // 3) Cancel every active PayPal subscription. Fail closed if any cancel
  //    fails — we'd rather refuse the deletion (giving the user a clear
  //    error + ops alert path) than silently let them keep getting charged.
  const cancelFailures = [];
  if (Array.isArray(activeSubs) && activeSubs.length > 0) {
    let accessToken;
    try {
      accessToken = await _getPayPalAccessToken();
    } catch (e) {
      console.error('[account/delete] PayPal token fetch failed code=' + (e?.code || 'AUTH'));
      await _alertOps(
        'Account deletion blocked — PayPal auth failed',
        `user_id: ${userId}\n` +
        `active_subscriptions: ${activeSubs.length}\n` +
        `error: ${String(e?.message || e).slice(0, 300)}\n\n` +
        `User attempted to delete their account but we could not authenticate ` +
        `with PayPal to cancel their subscription(s). Cancel manually via the ` +
        `PayPal dashboard, then have the user retry deletion.`
      );
      return res.status(503).json({
        error: 'Could not contact PayPal to cancel your subscription. Your account was NOT deleted. Please try again in a few minutes, or email founder@profinancecast.com if this keeps happening.',
      });
    }

    for (const sub of activeSubs) {
      try {
        const result = await _cancelOnePayPalSubscription(accessToken, sub.provider_subscription_id);
        if (!result.ok) {
          cancelFailures.push({ subscriptionId: sub.provider_subscription_id, status: result.status, body: result.body });
        }
      } catch (e) {
        cancelFailures.push({ subscriptionId: sub.provider_subscription_id, status: 0, body: String(e?.message || e).slice(0, 300) });
      }
    }

    if (cancelFailures.length > 0) {
      console.error('[account/delete] paypal cancel failed for ' + cancelFailures.length + ' subscription(s)');
      await _alertOps(
        'Account deletion blocked — PayPal cancel failed',
        `user_id: ${userId}\n` +
        `failed: ${cancelFailures.length}/${activeSubs.length}\n` +
        `details:\n` +
        cancelFailures.map(f => `  - ${f.subscriptionId}: status=${f.status} body=${f.body || '(empty)'}`).join('\n') +
        `\n\nUser attempted to delete their account but at least one PayPal ` +
        `subscription could not be cancelled after retries. Cancel manually ` +
        `via PayPal dashboard (Activity → Recurring → Cancel) for EACH listed ` +
        `subscription, then have the user retry deletion. Do NOT manually ` +
        `delete the auth row until all PayPal subs are confirmed cancelled.`
      );
      return res.status(503).json({
        error: 'We could not cancel your PayPal subscription. Your account was NOT deleted to prevent further charges. Please try again, or email founder@profinancecast.com — we will cancel manually and complete your deletion.',
        paypal_cancel_failed: true,
      });
    }
  }

  // 4) Mark subscriptions row as cancelled in our DB. Best-effort: the
  //    cascading delete in step 5 would remove the row anyway, but the
  //    audit trail (cancel_reason='account_deleted') is useful for support.
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
    console.warn('[account/delete] subscription mark-cancelled failed code=' + (e?.code || 'UNKNOWN'));
  }

  // 5) Hard-delete the auth.users row via admin API. Cascading FKs handle
  //    profiles, subscriptions, etc.
  const { error: delErr } = await supabase.auth.admin.deleteUser(userId);
  if (delErr) {
    console.error('[account/delete] admin.deleteUser failed code=' + (delErr.code || 'UNKNOWN'));
    // At this point PayPal cancels SUCCEEDED but we failed to delete the
    // auth row. The user is now in an inconsistent state: their billing
    // is cancelled but their account still exists. Alert ops so support
    // can either complete the deletion manually or re-create the PayPal
    // subscription on user request.
    await _alertOps(
      'Account deletion partial — PayPal cancelled but auth row delete failed',
      `user_id: ${userId}\n` +
      `paypal_subs_cancelled: ${activeSubs?.length || 0}\n` +
      `error: ${String(delErr?.message || delErr).slice(0, 300)}\n\n` +
      `PayPal subscriptions were cancelled successfully but Supabase admin ` +
      `deleteUser failed. The user's billing is stopped (good) but their ` +
      `account still exists (bad — they may not realise deletion failed). ` +
      `Retry admin.deleteUser manually, or if it persists, escalate.`
    );
    return res.status(500).json({ error: 'Could not delete account — please contact support@profinancecast.com.' });
  }

  return res.status(204).end();
}
