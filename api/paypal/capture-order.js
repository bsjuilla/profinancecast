// api/paypal/capture-order.js
//
// Captures a PayPal order, verifies the captured amount matches the plan price,
// authenticates the buyer via their Supabase JWT, and writes the resulting
// subscription row to Supabase. This is the SOURCE OF TRUTH for plan upgrades —
// the client cannot fake a successful payment by simply calling this endpoint.
//
// REQUIRED env vars (Vercel → Project → Settings → Environment Variables):
//   PAYPAL_CLIENT_ID
//   PAYPAL_CLIENT_SECRET
//   PAYPAL_ENV               → 'live' or 'sandbox'   (default: 'live')
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY  ← service role, NOT anon. Server-only secret.

import { createClient } from '@supabase/supabase-js';

const PAYPAL_BASE = (process.env.PAYPAL_ENV === 'sandbox')
  ? 'https://api-m.sandbox.paypal.com'
  : 'https://api-m.paypal.com';

const APP_ORIGIN = process.env.APP_ORIGIN || 'https://profinancecast.com';

// W26-a #12: origin/referer same-site check on mutating payment ops.
// Defense-in-depth against a leaked or replayed JWT. Browsers always send
// Origin or Referer for cross-origin POSTs; rejecting requests without one
// blocks the easiest CSRF-style replay paths.
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

// SKU prices — must match create-order.js. W25 P0 #1: added premium SKUs and
// corrected pro_annual to 79 to match the W14-B CFO pricing in pricing.md and
// the client (js/inline/billing-2.js openCheckout calls).
const PLAN_PRICES  = {
  pro_monthly:     9,
  pro_annual:      79,
  premium_monthly: 19,
  premium_annual:  169,
  founders:        149,
};

// SKU → entitlement tier. Pro SKUs grant 'pro'; Premium SKUs grant 'premium'.
// Founders is a lifetime Pro entitlement.
// The 'plan' column on subscriptions stores the entitlement tier, not the SKU,
// so PFCPlan.requirePlan(['pro','premium']) consumer code stays unchanged.
const SKU_TO_PLAN  = {
  pro_monthly:     'pro',
  pro_annual:      'pro',
  premium_monthly: 'premium',
  premium_annual:  'premium',
  founders:        'pro',
};

// Sage AI message quota per entitlement tier per month.
// W25 P0 #1: premium corrected from 150 → 500 to match billing.html copy
// (W14-C: "Sage AI — 500 messages/month (vs Pro's 200)").
const PLAN_QUERIES = { pro: 200, premium: 500 };

// W27-a #15 — calendar-correct period end. Previous code used 30-day chunks
// for monthly and 365-day chunks for annual, which drifts ~5 days/year and
// breaks for anyone billing on the 31st of a month. Now month-aware in UTC.
function _addMonthsUTC(date, months) {
  const d = new Date(date);
  const desiredMonth = d.getUTCMonth() + months;
  d.setUTCMonth(desiredMonth);
  if (d.getUTCMonth() !== ((desiredMonth % 12) + 12) % 12) d.setUTCDate(0);
  return d;
}
function _addYearsUTC(date, years) {
  const d = new Date(date);
  const target = d.getUTCFullYear() + years;
  d.setUTCFullYear(target);
  if (d.getUTCFullYear() !== target) d.setUTCDate(0);
  return d;
}
function _periodEndForSku(sku, from) {
  const f = from ? new Date(from) : new Date();
  switch (sku) {
    case 'pro_monthly':
    case 'premium_monthly': return _addMonthsUTC(f, 1).toISOString();
    case 'pro_annual':
    case 'premium_annual':  return _addYearsUTC(f, 1).toISOString();
    case 'founders':        return _addYearsUTC(f, 100).toISOString();
    default:                return null;
  }
}

function _supabaseAdmin() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

async function _verifyUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return { error: 'Missing auth token', status: 401 };
  const supabase = _supabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return { error: 'Invalid auth token', status: 401 };
  // W26-a #9: don't let an unconfirmed account capture a payment. Pairs with
  // the same check in create-order; defense-in-depth in case create-order
  // was deployed at an older version when the order was minted.
  if (!data.user.email_confirmed_at) {
    return { error: 'Please confirm your email address before purchasing.', status: 403 };
  }
  return { user: data.user, supabase };
}

async function _getAccessToken() {
  const creds = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error('PayPal auth failed');
  return (await res.json()).access_token;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // W26-a #12: reject cross-origin/no-origin requests on mutating payment ops.
  if (!_originAllowed(req)) {
    return res.status(403).json({ error: 'Forbidden: invalid origin' });
  }

  const { orderID, plan } = req.body || {};
  if (!orderID || !plan) return res.status(400).json({ error: 'Missing orderID or plan' });
  if (!PLAN_PRICES[plan]) return res.status(400).json({ error: 'Invalid plan' });
  // W26-b #8 hardening: validate orderID before interpolating into PayPal
  // URL. Real PayPal order IDs are [A-Z0-9]{17}; we allow [A-Za-z0-9_-]{8,40}
  // to be forgiving across PayPal's variants while blocking path-traversal
  // characters (/, .., %2F, etc.) that could land us on a different PayPal
  // endpoint.
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(orderID)) {
    return res.status(400).json({ error: 'Invalid orderID format' });
  }

  // 1. Authenticate the buyer
  const auth = await _verifyUser(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const { user, supabase } = auth;

  try {
    const token = await _getAccessToken();

    // W26-b #8: preflight — GET the order before capture to verify:
    //   (a) it actually exists,
    //   (b) the custom_id on the order matches the JWT user (binding check —
    //       prevents user A capturing user B's order if A obtains the orderID),
    //   (c) it isn't already COMPLETED (replay protection — capturing a
    //       COMPLETED order is a no-op at PayPal but we'd still upsert and
    //       could reset cancel_at_period_end / period_end unexpectedly).
    const preflightRes = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderID}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!preflightRes.ok) {
      console.error('[capture-order] preflight GET failed', { orderID, status: preflightRes.status });
      return res.status(404).json({ error: 'Order not found' });
    }
    const preflightData = await preflightRes.json();
    const orderCustomId = preflightData.purchase_units?.[0]?.custom_id;
    if (orderCustomId && orderCustomId !== user.id) {
      // Don't leak who the order belongs to — generic 403.
      console.warn('[capture-order] cross-user capture attempt', {
        attempting_user_id: user.id, order_user_id: orderCustomId, orderID,
      });
      return res.status(403).json({ error: 'Order does not belong to this user' });
    }
    if (preflightData.status === 'COMPLETED') {
      // Already captured — refuse to re-process. The original capture
      // already wrote the subscription row; replaying it would clobber
      // any cancel_at_period_end state that has since been set.
      return res.status(409).json({
        error: 'Order has already been captured',
        status: 'ALREADY_CAPTURED',
      });
    }

    // 2. Capture the funds at PayPal.
    // PayPal-Request-Id makes the call idempotent on PayPal's side — a
    // replay with the same Request-Id returns the same result instead of
    // double-charging. We key it on the orderID so the same order
    // re-captured by us yields the same response from PayPal.
    const capRes = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `pfc-capture-${orderID}`,
      },
    });
    if (!capRes.ok) {
      const err = await capRes.text();
      console.error('Capture error:', err);
      return res.status(502).json({ error: 'Payment capture failed' });
    }
    const captureData = await capRes.json();
    if (captureData.status !== 'COMPLETED') {
      return res.status(402).json({ error: 'Payment not completed', status: captureData.status });
    }

    // 3. Verify amount and currency match the expected plan price.
    // The client cannot tamper with the price — we compare to our server-side table.
    const capture = captureData.purchase_units?.[0]?.payments?.captures?.[0];
    const amountPaid = parseFloat(capture?.amount?.value);
    const currencyPaid = capture?.amount?.currency_code;
    if (currencyPaid !== 'EUR' || Math.abs(amountPaid - PLAN_PRICES[plan]) > 0.005) {
      console.error(`Amount mismatch: paid ${amountPaid} ${currencyPaid}, expected ${PLAN_PRICES[plan]} EUR for plan ${plan}`);
      // Money was captured but at the wrong amount — we refuse to upgrade.
      // Operations team must reconcile manually via PayPal dashboard.
      return res.status(409).json({ error: 'Payment amount mismatch — please contact support.' });
    }

    // 4. Upsert the subscription row (server is source of truth).
    // The SKU determines billing interval; the *plan* column on subscriptions
    // is normalized to 'pro' so all entitlement code (status.js, PFCPlan,
    // requirePlan) stays SKU-agnostic.
    const sku = plan;
    const dbPlan = SKU_TO_PLAN[sku];
    // W27-a #15: calendar-correct period_end via _periodEndForSku.
    const periodEnd = _periodEndForSku(sku);
    const { error: upsertErr } = await supabase
      .from('subscriptions')
      .upsert({
        user_id: user.id,
        plan: dbPlan,
        status: 'active',
        provider: 'paypal',
        provider_order_id: orderID,
        provider_capture_id: capture?.id || null,
        amount_usd: amountPaid,
        current_period_end: periodEnd,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (upsertErr) {
      // Audit H2 fix: payment captured but DB write failed.
      // Previously we returned 200 + warning, leaving paid users on Free with
      // NO recovery path (the configured webhook list doesn't include
      // PAYMENT.CAPTURE.COMPLETED). Now: 5xx so the client retries, and the
      // captureID is logged loudly for support reconciliation via the PayPal
      // dashboard until the webhook fallback ships in Phase B.
      console.error('[capture-order] CAPTURED-BUT-NOT-UPGRADED', {
        userId: user.id, sku, dbPlan, orderID,
        captureId: capture?.id,
        amountPaid, currencyPaid,
        upsertErr: { message: upsertErr.message, details: upsertErr.details, code: upsertErr.code },
      });
      return res.status(500).json({
        error: 'Payment captured but account upgrade failed. Our team has been notified — please refresh in a moment, or contact support if your plan still shows Free.',
        captureID: capture?.id,
        retryable: true,
      });
    }

    // 5. Reset query counters on the profile (best-effort; ignore if column missing)
    await supabase.from('profiles').update({
      plan: dbPlan, ai_queries_used: 0, ai_queries_limit: PLAN_QUERIES[dbPlan],
      ai_queries_reset_at: periodEnd,
    }).eq('id', user.id);

    // W26-d #4/#5: finalize the Founders seat reservation if this was a
    // Founders purchase. Idempotent — safe if create-order already pre-claimed
    // and the webhook also fires later. Best-effort: a failure here doesn't
    // unwind the successful capture (the subscriptions row is the
    // entitlement source of truth; the seats table is the cap accounting).
    let foundersSeatNo = null;
    if (sku === 'founders') {
      const { data: seat, error: finErr } = await supabase.rpc(
        'finalize_founders_seat',
        { p_user_id: user.id, p_capture_id: capture?.id || orderID }
      );
      if (finErr) {
        console.error('[capture-order] finalize_founders_seat err:', finErr);
      } else {
        foundersSeatNo = typeof seat === 'number' ? seat : (seat?.seat_no ?? null);
      }
    }

    return res.status(200).json({
      status: 'COMPLETED', plan: dbPlan, sku, orderID,
      captureID: capture?.id,
      currentPeriodEnd: periodEnd,
      ...(foundersSeatNo ? { foundersSeatNo } : {}),
    });

  } catch (err) {
    console.error('capture-order error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
