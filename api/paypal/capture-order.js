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

// SKU prices — must match create-order.js. The post-rewrite billing.html
// posts one of these three SKU strings.
const PLAN_PRICES  = { pro_monthly: 9, pro_annual: 69, founders: 149 };

// All SKUs grant the same Pro entitlement; the difference is billing interval.
// 'pro' is the canonical plan string written to the subscriptions table — this
// keeps PFCPlan.requirePlan(['pro','premium']) consumer code unchanged.
const SKU_TO_PLAN  = { pro_monthly: 'pro', pro_annual: 'pro', founders: 'pro' };

// Sage AI message quota per Pro user/month (pricing report 07).
const PLAN_QUERIES = { pro: 200, premium: 150 };

// How long the subscription period runs from capture time, per SKU.
// Founders is one-time; we set a 100-year period_end so status.js never
// expires it via the !expired check. Cancellation still works the same way.
const PLAN_PERIOD_DAYS = {
  pro_monthly: 30,
  pro_annual:  365,
  founders:    365 * 100,
};

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

  const { orderID, plan } = req.body || {};
  if (!orderID || !plan) return res.status(400).json({ error: 'Missing orderID or plan' });
  if (!PLAN_PRICES[plan]) return res.status(400).json({ error: 'Invalid plan' });

  // 1. Authenticate the buyer
  const auth = await _verifyUser(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const { user, supabase } = auth;

  try {
    const token = await _getAccessToken();

    // 2. Capture the funds at PayPal
    const capRes = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
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
    if (currencyPaid !== 'USD' || Math.abs(amountPaid - PLAN_PRICES[plan]) > 0.005) {
      console.error(`Amount mismatch: paid ${amountPaid} ${currencyPaid}, expected ${PLAN_PRICES[plan]} USD for plan ${plan}`);
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
    const periodDays = PLAN_PERIOD_DAYS[sku];
    const periodEnd = new Date(Date.now() + periodDays * 24 * 60 * 60 * 1000).toISOString();
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

    console.log(`UPGRADED: user=${user.id} sku=${sku} plan=${dbPlan} order=${orderID} amount=${amountPaid}`);
    return res.status(200).json({
      status: 'COMPLETED', plan: dbPlan, sku, orderID,
      captureID: capture?.id,
      currentPeriodEnd: periodEnd,
    });

  } catch (err) {
    console.error('capture-order error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
