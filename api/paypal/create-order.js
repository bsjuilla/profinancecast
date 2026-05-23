// api/paypal/create-order.js
// Creates a PayPal order tied to the authenticated buyer.
// Required env: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV ('live'|'sandbox'),
//               SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_ORIGIN

import { createClient } from '@supabase/supabase-js';

const PAYPAL_BASE = (process.env.PAYPAL_ENV === 'sandbox')
  ? 'https://api-m.sandbox.paypal.com'
  : 'https://api-m.paypal.com';

// SKU prices — must match client (js/inline/billing-2.js openCheckout calls)
// AND capture-order.js PLAN_PRICES AND webhook-paypal.js fallback table.
// W25 P0 #1: aligned with billing-2.js openProCheckout (79), openPremiumCheckout
// (19/169), and the Founders €149 one-time. Pro Annual was 69; now 79 to match
// the W14-B locked CFO pricing in pricing.md.
const PLAN_PRICES = {
  pro_monthly:     9,
  pro_annual:      79,
  premium_monthly: 19,
  premium_annual:  169,
  founders:        149,
};
const PLAN_DESCRIPTIONS = {
  pro_monthly:     'ProFinanceCast Pro — Monthly',
  pro_annual:      'ProFinanceCast Pro — Annual',
  premium_monthly: 'ProFinanceCast Premium — Monthly',
  premium_annual:  'ProFinanceCast Premium — Annual',
  founders:        'ProFinanceCast Founders Lifetime',
};
const APP_ORIGIN  = process.env.APP_ORIGIN || 'https://profinancecast.com';

// W26-a #12: origin/referer same-site check.
// Even with Supabase JWT auth, defense-in-depth against:
//   - token leaked into a third-party page (e.g., user pastes their session
//     into a malicious browser extension or a phishing site)
//   - a stolen token replayed from elsewhere
// We accept the request only if Origin (or Referer) matches APP_ORIGIN.
// In sandbox/dev we allow missing Origin (server-to-server scripts).
function _originAllowed(req) {
  // If APP_ORIGIN is the placeholder default in a dev/preview env, skip the
  // check — only enforce on production-shaped origins.
  if (!APP_ORIGIN || !APP_ORIGIN.startsWith('https://')) return true;
  const origin = req.headers.origin || '';
  const referer = req.headers.referer || '';
  if (origin) return origin === APP_ORIGIN;
  if (referer) {
    try { return new URL(referer).origin === APP_ORIGIN; } catch { return false; }
  }
  // No Origin and no Referer — likely a non-browser client. Reject mutating
  // payment ops from such clients; legitimate browsers always send one.
  return false;
}

async function _verifyUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return { error: 'Missing auth token', status: 401 };
  const supabase = createClient(
    process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return { error: 'Invalid auth token', status: 401 };
  // W26-a #9: refuse to start a payment flow for an unconfirmed account.
  // Otherwise an attacker who signs up with someone else's email can pay
  // for THEIR account, or a typo'd email becomes an orphaned paid sub.
  // Supabase Auth populates email_confirmed_at after the verification link.
  if (!data.user.email_confirmed_at) {
    return { error: 'Please confirm your email address before purchasing.', status: 403 };
  }
  return { user: data.user };
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
  if (!res.ok) throw new Error('Could not authenticate with PayPal');
  return (await res.json()).access_token;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // W26-a #12: reject cross-origin/no-origin requests on mutating payment ops.
  if (!_originAllowed(req)) {
    return res.status(403).json({ error: 'Forbidden: invalid origin' });
  }

  const { plan } = req.body || {};
  if (!plan || !PLAN_PRICES[plan]) {
    return res.status(400).json({ error: 'Invalid plan' });
  }

  // Buyer must be authenticated — prevents anonymous order creation
  const auth = await _verifyUser(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const { user } = auth;

  // Server-side amount (never trust the client)
  const amount = PLAN_PRICES[plan];

  try {
    const token = await _getAccessToken();
    const order = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `pfc-${user.id.slice(0,8)}-${plan}-${Date.now()}`,
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          custom_id: user.id,                          // ties the order back to a real user
          reference_id: `${user.id}:${plan}`,
          amount: { currency_code: 'EUR', value: amount.toFixed(2) },
          description: PLAN_DESCRIPTIONS[plan] || 'ProFinanceCast Pro',
          soft_descriptor: 'PROFINANCECAST',
        }],
        application_context: {
          brand_name: 'ProFinanceCast',
          user_action: 'PAY_NOW',
          shipping_preference: 'NO_SHIPPING',
          return_url: `${APP_ORIGIN}/billing.html`,
          cancel_url: `${APP_ORIGIN}/billing.html`,
        },
      }),
    });

    if (!order.ok) {
      const err = await order.text();
      console.error('PayPal create order error:', err);
      return res.status(502).json({ error: 'Could not create PayPal order' });
    }
    const orderData = await order.json();
    return res.status(200).json({ orderID: orderData.id });

  } catch (err) {
    console.error('create-order error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
