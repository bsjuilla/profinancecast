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
import { rateLimitOrReject } from '../_lib/rate-limit.js';
// Geo-gate disabled per operator request 2026-05-23. To re-enable, see
// the parallel comment in api/paypal/create-order.js. File at
// api/_lib/geo-gate.js is preserved unchanged for fast re-enable.

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

// W26-a #12 + W29-c regression fix: origin/referer check accepts both
// www and apex variants. Edge-runtime header access (req.headers.get).
function _normalizeOrigin(o) {
  if (!o || typeof o !== 'string') return '';
  try {
    const u = new URL(o);
    return u.protocol + '//' + u.hostname.replace(/^www\./, '') + (u.port ? ':' + u.port : '');
  } catch { return ''; }
}
function _originAllowed(req) {
  // FULL-P0-A4 fix (audit 2026-05-26) — fail-CLOSED in production. See
  // create-order.js for the full rationale.
  const IS_PROD = (process.env.VERCEL_ENV === 'production') || (process.env.NODE_ENV === 'production');
  if (!APP_ORIGIN || !APP_ORIGIN.startsWith('https://')) {
    if (IS_PROD) {
      console.error('[origin] APP_ORIGIN missing or non-https in production — refusing request');
      return false;
    }
    return true;
  }
  const expected = _normalizeOrigin(APP_ORIGIN);
  if (!expected) return false;
  const origin = req.headers.get('origin') || '';
  const referer = req.headers.get('referer') || '';
  if (origin) return _normalizeOrigin(origin) === expected;
  if (referer) {
    try { return _normalizeOrigin(new URL(referer).origin) === expected; }
    catch { return false; }
  }
  return false;
}
// Returns the actual request origin so PayPal's return_url sends the user
// back to the same domain they started on (www or apex).
function _requestOrigin(req) {
  const origin = req.headers.get('origin') || '';
  if (origin) return origin;
  const referer = req.headers.get('referer') || '';
  if (referer) {
    try { return new URL(referer).origin; } catch { /* ignore */ }
  }
  return APP_ORIGIN;
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

  // CISO IR-runbook kill switch — set PAYMENTS_DISABLED=true in Vercel env
  // to disable subscription creation during incident response.
  if (process.env.PAYMENTS_DISABLED === 'true') {
    return _json({
      error: 'Payments are temporarily disabled for maintenance. Please try again in a few minutes.',
      maintenance: true,
    }, 503);
  }

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

  // NEW-S4 fix — per-user rate limit. Edge variant returns a Response.
  const rl = await rateLimitOrReject(null, null, `create-sub:${user.id}`);
  if (rl) return rl;

  // ── NEW-S2 fix — reuse existing pending subscription if present ────────
  //
  // Pre-fix, every render of the Subscribe button created a real PayPal
  // subscription via this endpoint. A user clicking around the checkout
  // (Pro Monthly → back → Pro Annual → back → Pro Monthly) minted three
  // separate PayPal subscriptions; only the latest mapped to our DB row.
  // The orphans stayed in PayPal in APPROVAL_PENDING and could be approved
  // out-of-band by the user, leaving our DB inconsistent.
  //
  // Fix: if the user already has a row with status='pending' for the SAME
  // plan tier, reuse its subscriptionID + approveUrl instead of creating
  // a new PayPal sub. Different plan = create new (their first attempt is
  // abandoned). Pending rows older than 24h are treated as stale and a
  // fresh subscription is created (PayPal expires unapproved subs after
  // 3 hours anyway, so a 24h+ pending is definitely abandoned).
  {
    const requestedTier = SKU_TO_TIER[plan];
    const { data: existingPending } = await supabase
      .from('subscriptions')
      .select('provider_subscription_id, plan, status, updated_at')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .eq('plan', requestedTier)
      .maybeSingle();

    if (existingPending?.provider_subscription_id) {
      const ageMs = Date.now() - new Date(existingPending.updated_at).getTime();
      const FRESH_PENDING_MS = 60 * 60 * 1000;  // 1 hour
      if (ageMs < FRESH_PENDING_MS) {
        // Try to fetch the approve URL for the existing pending sub.
        // If PayPal says the sub is already approved/cancelled/expired,
        // fall through and create a fresh one.
        try {
          const reuseToken = await _getAccessToken();
          const subFetch = await fetch(
            `${PAYPAL_BASE}/v1/billing/subscriptions/${encodeURIComponent(existingPending.provider_subscription_id)}`,
            { headers: { 'Authorization': `Bearer ${reuseToken}` } }
          );
          if (subFetch.ok) {
            const subInfo = await subFetch.json();
            const reusableStates = new Set(['APPROVAL_PENDING', 'APPROVED']);
            if (reusableStates.has(subInfo.status)) {
              const approve = (subInfo.links || []).find(l => l.rel === 'approve');
              if (approve?.href) {
                console.log(`[create-subscription] reusing pending sub ${existingPending.provider_subscription_id} for user ${user.id}`);
                return _json({
                  subscriptionID: existingPending.provider_subscription_id,
                  approveUrl:     approve.href,
                  plan,
                  reused: true,
                });
              }
            }
          }
        } catch (e) {
          // Fall through to create-fresh if anything in the reuse path
          // breaks — better to mint a duplicate than block the user.
          console.warn('[create-subscription] reuse-pending path failed, creating fresh:', e?.message || e);
        }
      }
    }
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
      // W29-c regression fix: route back to the user's actual origin
      // (www or apex) so their localStorage auth survives PayPal round-trip.
      return_url: `${_requestOrigin(req)}/billing.html?subscription=ok`,
      cancel_url: `${_requestOrigin(req)}/billing.html?subscription=cancel`,
    },
  };

  let subRes;
  try {
    // NEW-S3 fix — drop Date.now() from the Request-Id so cross-call retries
    // are actually idempotent on PayPal's side. Bucket by UTC day for a
    // 24-hour natural dedupe window. Combined with NEW-S2's pending-row
    // reuse below, this prevents a user from accidentally minting multiple
    // PayPal subscriptions by clicking Subscribe twice in quick succession.
    const todayUtc = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    subRes = await _fetchPayPalWithRetry(`${PAYPAL_BASE}/v1/billing/subscriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        // Idempotency-key style header — PayPal doesn't strictly require this
        // on subscription create but it lets retries return the same id.
        'PayPal-Request-Id': `pfc-sub-${user.id.slice(0,8)}-${plan}-${todayUtc}`,
      },
      body: JSON.stringify(reqBody),
    }, 'subscription-create');
  } catch (e) {
    console.error('[create-subscription] fetch err:', e?.message || e);
    return _json({ error: 'Could not reach PayPal' }, 502);
  }
  if (!subRes.ok) {
    // FULL-P1-F (audit 2026-05-27) — drop errText body dump. PayPal
    // error responses include debug_id + internal trace tokens + on
    // some 4xx paths partial subscription context (plan_id). Parse
    // just status + issue + debug_id (debug_id is what PayPal
    // Support asks for when escalating).
    let issue = 'UNKNOWN', debugId = 'NONE';
    try {
      const errJson = JSON.parse(await subRes.text());
      issue   = errJson?.details?.[0]?.issue || errJson?.name || 'UNKNOWN';
      debugId = errJson?.debug_id || 'NONE';
    } catch { /* PayPal returned non-JSON */ }
    console.error('[create-subscription:paypal] create failed status=' + subRes.status + ' issue=' + issue + ' debug_id=' + debugId);
    return _json({ error: 'Could not create subscription' }, 502);
  }
  const subData = await subRes.json();
  const subscriptionId = subData.id;
  const approveLink = (subData.links || []).find(l => l.rel === 'approve');

  if (!subscriptionId || !approveLink?.href) {
    // FULL-P1-F (audit 2026-05-27) — redact subData dump. The full PayPal
    // subscription response includes the approve URL with embedded
    // subscription token + plan_id + custom_id (our user_id). Log only
    // the presence flags + top-level status so on-call can tell
    // "no id" from "no approve link" without seeing the payload.
    console.error('[create-subscription:paypal] missing id or approve link' +
      ' has_id=' + (subscriptionId ? 'YES' : 'NO') +
      ' has_approve=' + (approveLink?.href ? 'YES' : 'NO') +
      ' status=' + (subData?.status || 'NONE'));
    return _json({ error: 'Subscription created but PayPal returned unexpected shape' }, 502);
  }

  // ── Pre-write a PENDING row so a flaky webhook doesn't lose track ──────
  //
  // W29-final P0 FIX: status='pending', NOT 'active'.
  //
  // Previous version used status='active' here as an "optimistic" placeholder,
  // expecting BILLING.SUBSCRIPTION.ACTIVATED to flip terminal states later.
  // That created a free-Pro exploit: a user (or attacker) could call this
  // endpoint to get a subscriptionID + approveUrl, then NEVER approve at
  // PayPal. The pre-written row had status='active' + current_period_end=null,
  // and status.js (line 113-115) treated null period_end as "not expired",
  // so the user got the plan tier for free indefinitely.
  //
  // Fix: status='pending'. status.js (line 115) treats anything != 'active'
  // as 'free', so the user has NO entitlement until BILLING.SUBSCRIPTION.
  // ACTIVATED webhook fires (which only happens after they actually approve
  // and pay at PayPal). Support visibility on the row is preserved via
  // provider_subscription_id + subscription_state='APPROVAL_PENDING'.
  //
  // Requires migration 20260523_status_pending.sql to add 'pending' to the
  // subscriptions.status CHECK constraint.
  const { error: upsertErr } = await supabase.from('subscriptions').upsert({
    user_id: user.id,
    plan: SKU_TO_TIER[plan],
    status: 'pending',         // NOT 'active' — see W29-final fix above
    provider: 'paypal',
    provider_subscription_id: subscriptionId,
    subscription_state: 'APPROVAL_PENDING',
    current_period_end: null,  // explicit — populated by ACTIVATED webhook
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (upsertErr) {
    // Don't fail the request — the user can still approve at PayPal, and the
    // webhook will fill in our DB later. But log loudly for support.
    // FULL-P1-F (audit 2026-05-27) — redact. Supabase upsert error
    // .details/.hint includes the row values (user_id + plan +
    // provider_subscription_id). Code-only is enough to triage; the
    // webhook will reconcile the row regardless.
    console.error('[create-subscription:db] pre-write upsert failed code=' + (upsertErr?.code || 'UNKNOWN'));
  }

  return _json({
    subscriptionID: subscriptionId,
    approveUrl:     approveLink.href,
    plan,
  });
}
