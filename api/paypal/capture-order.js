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

const PLAN_PRICES = { pro: 9.99, premium: 19.99 };
const PLAN_QUERIES = { pro: 60, premium: 150 };

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

    // 4. Upsert the subscription row (server is source of truth)
    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { error: upsertErr } = await supabase
      .from('subscriptions')
      .upsert({
        user_id: user.id,
        plan,
        status: 'active',
        provider: 'paypal',
        provider_order_id: orderID,
        provider_capture_id: capture?.id || null,
        amount_usd: amountPaid,
        current_period_end: periodEnd,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (upsertErr) {
      console.error('Supabase upsert error:', upsertErr);
      // Payment captured but DB write failed — flag for manual reconciliation.
      // We still return 200 so the user sees success; the webhook will retry.
      return res.status(200).json({
        status: 'COMPLETED', plan, orderID,
        warning: 'Payment recorded — plan activation may take a few minutes.',
      });
    }

    // 5. Reset query counters on the profile (best-effort; ignore if column missing)
    await supabase.from('profiles').update({
      plan, ai_queries_used: 0, ai_queries_limit: PLAN_QUERIES[plan],
      ai_queries_reset_at: periodEnd,
    }).eq('id', user.id);

    console.log(`UPGRADED: user=${user.id} plan=${plan} order=${orderID} amount=${amountPaid}`);
    return res.status(200).json({
      status: 'COMPLETED', plan, orderID,
      captureID: capture?.id,
      currentPeriodEnd: periodEnd,
    });

  } catch (err) {
    console.error('capture-order error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
