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
// W29-c regression fix: accept BOTH www.profinancecast.com AND
// profinancecast.com — the strict equality check rejected requests from
// users browsing via the www subdomain when APP_ORIGIN was set to apex
// (or vice versa). Normalizing by stripping "www." from both sides before
// compare keeps the defense-in-depth tight (an attacker-controlled domain
// like profinancecast.com.attacker.com still fails) while accepting the
// canonical-domain variants we actually serve.
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
  // No Origin and no Referer — likely a non-browser client. Reject mutating
  // payment ops from such clients; legitimate browsers always send one.
  return false;
}
// Returns the actual request origin (preferring Origin header, then Referer)
// so the PayPal return_url sends the user back to the SAME domain they
// started on. Without this, a user who came in via www.profinancecast.com
// would be redirected to profinancecast.com after approval — different
// origin means localStorage auth session is gone, user appears logged out.
function _requestOrigin(req) {
  const origin = req.headers.origin || '';
  if (origin) return origin;
  const referer = req.headers.referer || '';
  if (referer) {
    try { return new URL(referer).origin; } catch { /* ignore */ }
  }
  return APP_ORIGIN;
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

// W27-c #16 — retry-with-jittered-backoff for PayPal fetches.
// Retries only on transient failures (network errors, 502/503/504/429).
// Max 2 retries (3 total attempts), backoff capped ~1.5s.
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

async function _getAccessToken() {
  const creds = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');
  const res = await _fetchPayPalWithRetry(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  }, 'oauth2/token');
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

  // W26-d #4/#5 — Atomic Founders cap enforcement.
  // For the founders SKU, claim one of the 100 pre-numbered seats BEFORE we
  // mint the PayPal order. SELECT ... FOR UPDATE SKIP LOCKED inside the
  // Supabase function makes this race-safe: two concurrent buyers cannot
  // win the same seat. If all 100 are claimed/reserved, we return 409 and
  // never expose the user to the PayPal checkout (avoids the embarrassing
  // case of "you paid but there were no seats left").
  let foundersSeatNo = null;
  let foundersSupabase = null;
  if (plan === 'founders') {
    foundersSupabase = createClient(
      process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const { data: seat, error: seatErr } = await foundersSupabase.rpc(
      'claim_founders_seat',
      { p_user_id: user.id, p_ttl_minutes: 15 }
    );
    if (seatErr) {
      console.error('[create-order] claim_founders_seat error:', seatErr);
      return res.status(500).json({ error: 'Could not reserve Founders seat — please try again.' });
    }
    foundersSeatNo = typeof seat === 'number' ? seat : (seat?.seat_no ?? null);
    if (!foundersSeatNo) {
      return res.status(409).json({
        error: 'All 100 Founders Lifetime seats are currently reserved or claimed. Pro is still available at €9/mo or €79/yr.',
        sold_out: true,
      });
    }
  }

  try {
    const token = await _getAccessToken();
    // W27-c #16: retry on transient 5xx. PayPal-Request-Id keeps the
    // retry idempotent on PayPal's side — duplicate POST returns the
    // same orderID rather than creating a second order.
    const order = await _fetchPayPalWithRetry(`${PAYPAL_BASE}/v2/checkout/orders`, {
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
          // W29-c regression fix: route back to the user's actual origin
          // (www or apex) so their localStorage auth survives the round-trip.
          return_url: `${_requestOrigin(req)}/billing.html`,
          cancel_url: `${_requestOrigin(req)}/billing.html`,
        },
      }),
    }, 'create-order');

    if (!order.ok) {
      const err = await order.text();
      console.error('PayPal create order error:', err);
      // W26-d #4/#5: release the Founders seat we reserved above so the
      // next buyer can claim it. Best-effort — even if the release fails,
      // the 15-minute TTL will eventually free the row.
      if (foundersSeatNo && foundersSupabase) {
        await foundersSupabase.rpc('release_founders_seat', { p_user_id: user.id })
          .then(({ error }) => { if (error) console.error('[create-order] release_founders_seat err:', error); });
      }
      return res.status(502).json({ error: 'Could not create PayPal order' });
    }
    const orderData = await order.json();
    return res.status(200).json({
      orderID: orderData.id,
      ...(foundersSeatNo ? { foundersSeatNo } : {}),
    });

  } catch (err) {
    console.error('create-order error:', err);
    // Release the seat on any thrown error from the PayPal side too.
    if (foundersSeatNo && foundersSupabase) {
      await foundersSupabase.rpc('release_founders_seat', { p_user_id: user.id })
        .then(({ error }) => { if (error) console.error('[create-order] release_founders_seat err:', error); })
        .catch((e) => console.error('[create-order] release_founders_seat threw:', e));
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
}
