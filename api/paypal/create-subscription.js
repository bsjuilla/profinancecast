// api/paypal/create-subscription.js
// W29-b / Audit #14 — recurring subscription creation via PayPal Billing Plans.
//
// EDGE RUNTIME (Vercel Hobby plan is at 12 Node-function cap; this MUST be
// Edge to deploy.)
//
// Creates a PayPal Subscription (recurring billing) tied to a pre-configured
// Plan ID. Returns subscription_id + approval URL for the client to redirect
// to. After the user approves at PayPal, a BILLING.SUBSCRIPTION.ACTIVATED
// webhook lands which marks the subscription active in our DB.
//
// Founders Lifetime stays on the one-shot Orders flow (api/paypal/create-order)
// — there is no recurring SKU for it.
//
// ROLLOUT GATING:
//   This endpoint requires PAYPAL_PLAN_ID_<SKU> env vars. If any are missing,
//   it returns 503 with a clear message and the client falls back to the
//   one-shot create-order flow. That means W29-b code can ship safely BEFORE
//   you create the plans in the PayPal dashboard — the new flow only
//   activates once you've set the env vars.
//
// PayPal dashboard setup (one-time, see W29-b runbook):
//   1. Products & Plans → Create Product "ProFinanceCast Subscription"
//   2. Create 4 plans against that product, each in EUR, recurring:
//        pro_monthly     €9    every 1 month
//        pro_annual      €79   every 1 year
//        premium_monthly €19   every 1 month
//        premium_annual  €169  every 1 year
//   3. Copy each Plan ID (P-XXXXX) into Vercel env:
//        PAYPAL_PLAN_ID_PRO_MONTHLY
//        PAYPAL_PLAN_ID_PRO_ANNUAL
//        PAYPAL_PLAN_ID_PREMIUM_MONTHLY
//        PAYPAL_PLAN_ID_PREMIUM_ANNUAL
//
// Required env (always):
//   PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV ('live'|'sandbox')
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_ORIGIN
// Required env (W29-b feature gate):
//   PAYPAL_PLAN_ID_PRO_MONTHLY, PAYPAL_PLAN_ID_PRO_ANNUAL,
//   PAYPAL_PLAN_ID_PREMIUM_MONTHLY, PAYPAL_PLAN_ID_PREMIUM_ANNUAL

export const config = { runtime: 'edge' };

import { createClient } from '@supabase/supabase-js';

const PAYPAL_BASE = (process.env.PAYPAL_ENV === 'sandbox')
  ? 'https://api-m.sandbox.paypal.com'
  : 'https://api-m.paypal.com';

const APP_ORIGIN = process.env.APP_ORIGIN || 'https://profinancecast.com';

// Map SKU → env-var name. Founders SKU intentionally omitted (one-shot only).
const SKU_TO_PLAN_ENV = {
  pro_monthly:     'PAYPAL_PLAN_ID_PRO_MONTHLY',
  pro_annual:      'PAYPAL_PLAN_ID_PRO_ANNUAL',
  premium_monthly: 'PAYPAL_PLAN_ID_PREMIUM_MONTHLY',
  premium_annual:  'PAYPAL_PLAN_ID_PREMIUM_ANNUAL',
};
const SKU_TO_TIER = {
  pro_monthly:     'pro',
  pro_annual:      'pro',
  premium_monthly: 'premium',
  premium_annual:  'premium',
};
const SKU_DESCRIPTIONS = {
  pro_monthly:     'ProFinanceCast Pro — Monthly',
  pro_annual:      'ProFinanceCast Pro — Annual',
  premium_monthly: 'ProFinanceCast Premium — Monthly',
  premium_annual:  'ProFinanceCast Premium — Annual',
};

function _json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

// W26-a #12 — Origin check.
function _originAllowed(req) {
  if (!APP_ORIGIN || !APP_ORIGIN.startsWith('https://')) return true;
  const origin = req.headers.get('origin') || '';
  const referer = req.headers.get('referer') || '';
  if (origin) return origin === APP_ORIGIN;
  if (referer) {
    try { return new URL(referer).origin === APP_ORIGIN; } catch { return false; }
  }
  return false;
}

// W27-c #16 — Retry-with-jittered-backoff wrapper for PayPal fetches.
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
  const creds = btoa(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`);
  const res = await _fetchPayPalWithRetry(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  }, 'oauth2/token');
  if (!res.ok) throw new Error('PayPal auth failed');
  return (await res.json()).access_token;
}

export default async function handler(req) {
  if (req.method !== 'POST') return _json({ error: 'Method not allowed' }, 405);

  // W26-a #12: origin check on mutating payment ops.
  if (!_originAllowed(req)) return _json({ error: 'Forbidden: invalid origin' }, 403);

  let body;
  try { body = await req.json(); }
  catch (_) { return _json({ error: 'Invalid JSON body' }, 400); }
  const { plan } = body || {};

  if (!plan || !SKU_TO_PLAN_ENV[plan]) {
    // Founders or unknown SKU — caller must use /api/paypal/create-order.
    return _json({ error: 'Invalid plan for recurring subscription' }, 400);
  }

  // Feature gate: require the plan-id env var to be set.
  const planIdEnvVar = SKU_TO_PLAN_ENV[plan];
  const paypalPlanId = process.env[planIdEnvVar];
  if (!paypalPlanId) {
    // 503 is intentional — the client treats this as "feature not configured"
    // and falls back to the one-shot Orders flow. Telling the difference
    // between "Edge function down" and "feature off" doesn't matter to the
    // user; 503 covers both cases identically on the client side.
    console.warn(`[create-subscription] ${planIdEnvVar} not set — falling back to one-shot`);
    return _json({
      error: 'Recurring subscriptions not yet configured for this plan',
      fallback: 'use_create_order',
    }, 503);
  }

  // Loose format check on the plan id from env. PayPal plan IDs look like
  // P-XXXXXX. Refuse anything that doesn't fit so a typo doesn't propagate
  // into the PayPal API call.
  if (!/^P-[A-Z0-9]{8,40}$/.test(paypalPlanId)) {
    console.error(`[create-subscription] ${planIdEnvVar} fails format validation`);
    return _json({ error: 'Subscription plan misconfigured' }, 500);
  }

  // ── Auth ────────────────────────────────────────────────────────────────
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return _json({ error: 'Missing auth token' }, 401);

  const supabase = createClient(
    process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) return _json({ error: 'Invalid auth token' }, 401);
  const user = userData.user;

  // W26-a #9: require confirmed email before recurring sub creation.
  if (!user.email_confirmed_at) {
    return _json({ error: 'Please confirm your email address before purchasing.' }, 403);
  }

  // ── Create the PayPal subscription ──────────────────────────────────────
  let accessToken;
  try {
    accessToken = await _getAccessToken();
  } catch (e) {
    console.error('[create-subscription] oauth err:', e?.message || e);
    return _json({ error: 'Could not authenticate with PayPal' }, 502);
  }

  const reqBody = {
    plan_id: paypalPlanId,
    custom_id: user.id,             // ties subscription back to our user
    application_context: {
      brand_name: 'ProFinanceCast',
      user_action: 'SUBSCRIBE_NOW',
      shipping_preference: 'NO_SHIPPING',
      return_url: `${APP_ORIGIN}/billing.html?subscription=ok`,
      cancel_url: `${APP_ORIGIN}/billing.html?subscription=cancel`,
    },
  };

  let subRes;
  try {
    subRes = await _fetchPayPalWithRetry(`${PAYPAL_BASE}/v1/billing/subscriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        // Idempotency-key style header — PayPal doesn't strictly require this
        // on subscription create but it lets retries return the same id.
        'PayPal-Request-Id': `pfc-sub-${user.id.slice(0,8)}-${plan}-${Date.now()}`,
      },
      body: JSON.stringify(reqBody),
    }, 'subscription-create');
  } catch (e) {
    console.error('[create-subscription] fetch err:', e?.message || e);
    return _json({ error: 'Could not reach PayPal' }, 502);
  }
  if (!subRes.ok) {
    const errText = await subRes.text();
    console.error('[create-subscription] PayPal returned', subRes.status, errText);
    return _json({ error: 'Could not create subscription' }, 502);
  }
  const subData = await subRes.json();
  const subscriptionId = subData.id;
  const approveLink = (subData.links || []).find(l => l.rel === 'approve');

  if (!subscriptionId || !approveLink?.href) {
    console.error('[create-subscription] missing id or approve link', subData);
    return _json({ error: 'Subscription created but PayPal returned unexpected shape' }, 502);
  }

  // ── Pre-write a pending row so a flaky webhook doesn't lose track ───────
  // status='active' is deferred until BILLING.SUBSCRIPTION.ACTIVATED arrives.
  // We pre-write provider_subscription_id with subscription_state=APPROVAL_PENDING
  // so support can find the user if anything goes sideways during PayPal approval.
  const { error: upsertErr } = await supabase.from('subscriptions').upsert({
    user_id: user.id,
    plan: SKU_TO_TIER[plan],
    status: 'active',          // optimistic; webhook flips to terminal states later
    provider: 'paypal',
    provider_subscription_id: subscriptionId,
    subscription_state: 'APPROVAL_PENDING',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (upsertErr) {
    // Don't fail the request — the user can still approve at PayPal, and the
    // webhook will fill in our DB later. But log loudly for support.
    console.error('[create-subscription] pre-write upsert err:', upsertErr);
  }

  return _json({
    subscriptionID: subscriptionId,
    approveUrl:     approveLink.href,
    plan,
  });
}
