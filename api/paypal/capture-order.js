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

// W26-a #12 + W29-c regression fix: origin/referer check now accepts both
// www and apex variants of the same domain (strict === rejected www users
// when APP_ORIGIN was apex). Defense-in-depth against a leaked/replayed JWT
// is preserved — attacker-controlled hosts like profinancecast.com.evil.com
// still fail.
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
  const origin = req.headers.origin || '';
  const referer = req.headers.referer || '';
  if (origin) return _normalizeOrigin(origin) === expected;
  if (referer) {
    try { return _normalizeOrigin(new URL(referer).origin) === expected; }
    catch { return false; }
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

// W27-c #16 — retry-with-jittered-backoff wrapper for PayPal fetches.
// Retries only on transient failures (network errors, 502/503/504/429),
// never on 4xx auth/validation errors. Max 2 retries (3 total attempts),
// jittered exponential delay capped at ~1.5s. The PayPal-Request-Id on
// each fetch makes retries idempotent on PayPal's side — a retried
// capture POST returns the same captureId, never a double-charge.
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
    // Jittered backoff: 200ms, 600ms, then return.
    const baseMs = attempt === 0 ? 200 : 600;
    const jitter = Math.floor(Math.random() * 200);
    await new Promise(r => setTimeout(r, baseMs + jitter));
  }
  if (lastErr) throw lastErr;
  // Unreachable, satisfies TS-style flow analysis.
  return null;
}

// W27-c #21 — best-effort auto-refund when a captured amount doesn't match
// the expected plan price. Money is already with PayPal at this point;
// refusing to upgrade the user without ALSO returning the money creates a
// support ticket and an angry customer. This calls PayPal's /refund endpoint
// directly so the funds bounce back automatically.
async function _autoRefund(captureId, amount, currency, token, reason) {
  try {
    const res = await fetch(
      `https://api-m.${process.env.PAYPAL_ENV === 'sandbox' ? 'sandbox.' : ''}paypal.com/v2/payments/captures/${captureId}/refund`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'PayPal-Request-Id': `pfc-autorefund-${captureId}`,
        },
        body: JSON.stringify({
          amount: { value: String(amount), currency_code: currency },
          note_to_payer: reason || 'Auto-refund: price mismatch on capture.',
        }),
      }
    );
    return { ok: res.ok, status: res.status, body: res.ok ? null : await res.text() };
  } catch (e) {
    return { ok: false, status: 0, body: String(e?.message || e) };
  }
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
  // W27-c #16: retry on transient 5xx/429 — PayPal's auth endpoint is
  // documented to have transient outages.
  const res = await _fetchPayPalWithRetry(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  }, 'oauth2/token');
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
    // W27-c #16: retry on transient PayPal 5xx for the preflight too.
    const preflightRes = await _fetchPayPalWithRetry(
      `${PAYPAL_BASE}/v2/checkout/orders/${orderID}`,
      { headers: { 'Authorization': `Bearer ${token}` } },
      'order-preflight'
    );
    if (!preflightRes.ok) {
      // FULL-P1-E (audit 2026-05-27) — redact. orderID is a PayPal token
      // that can be used to GET capture details from PayPal dashboards;
      // keeping it in plaintext logs exposes a correlation channel if
      // logs leak. Status alone is enough to triage 404 vs 5xx.
      console.error('[capture-order:preflight] failed status=' + preflightRes.status);
      return res.status(404).json({ error: 'Order not found' });
    }
    const preflightData = await preflightRes.json();
    const orderCustomId = preflightData.purchase_units?.[0]?.custom_id;
    if (orderCustomId && orderCustomId !== user.id) {
      // Don't leak who the order belongs to — generic 403.
      // FULL-P1-E (audit 2026-05-27) — keep the audit trail (this is a
      // genuine security event worth investigating) but mask user IDs
      // to 8-char prefix so a log breach can't be replayed against
      // Supabase admin endpoints. orderID dropped — PayPal correlation
      // surface, not needed for incident triage.
      console.warn('[capture-order:audit] cross-user capture attempt' +
        ' attempting_uid=' + String(user.id).slice(0, 8) +
        ' order_uid=' + String(orderCustomId).slice(0, 8));
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
    // W27-c #16: retry the capture call on transient 5xx. The
    // PayPal-Request-Id header keeps the retry idempotent on PayPal's
    // side — a replayed capture returns the same captureId rather than
    // double-charging.
    const capRes = await _fetchPayPalWithRetry(
      `${PAYPAL_BASE}/v2/checkout/orders/${orderID}/capture`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'PayPal-Request-Id': `pfc-capture-${orderID}`,
        },
      },
      'capture'
    );
    if (!capRes.ok) {
      // FULL-P1-E (audit 2026-05-27) — `err` was the FULL PayPal response
      // body (HTML or JSON depending on the failure mode), which can
      // contain debug_id, internal trace tokens, and even truncated
      // payer details on some 4xx paths. Parse just the issue + status
      // and drop the body. debug_id is logged here in the spirit of
      // capture-order's CAPTURED-BUT-NOT-UPGRADED log: on-call needs it
      // for PayPal support escalation.
      let issue = 'UNKNOWN', debugId = 'NONE';
      try {
        const errJson = JSON.parse(await capRes.text());
        issue   = errJson?.details?.[0]?.issue || errJson?.name || 'UNKNOWN';
        debugId = errJson?.debug_id || 'NONE';
      } catch { /* PayPal returned non-JSON; status alone is fine */ }
      console.error('[capture-order:paypal] capture failed status=' + capRes.status + ' issue=' + issue + ' debug_id=' + debugId);
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
      // FULL-P1-E (audit 2026-05-27) — KEPT as-is. This is a security
      // audit log for an attempted payment-amount tamper; values are
      // numeric (not PII), the plan is a SKU enum (public), and the
      // subscription_events insert below records the full row to the
      // canonical audit table. Operators triaging the alert need to see
      // these values inline without a database round-trip.
      console.error(`[capture-order:audit] amount mismatch paid=${amountPaid} ${currencyPaid} expected=${PLAN_PRICES[plan]} EUR plan=${plan}`);
      // W27-c #21 — auto-refund. Previously we refused to upgrade and left
      // the money sitting in PayPal awaiting manual reconciliation. Now we
      // fire an auto-refund and log the outcome to subscription_events so
      // the user gets their money back without a support ticket.
      const refund = await _autoRefund(capture?.id, amountPaid, currencyPaid, token,
        `Auto-refund: captured ${amountPaid} ${currencyPaid}, expected ${PLAN_PRICES[plan]} EUR for plan ${plan}.`);
      try {
        await supabase.from('subscription_events').insert({
          user_id: user.id,
          event_type: refund.ok ? 'auto_refund_on_amount_mismatch' : 'auto_refund_failed',
          provider: 'paypal',
          provider_id: capture?.id || null,
          amount: amountPaid,
          currency: currencyPaid,
          raw_payload: {
            expected_amount: PLAN_PRICES[plan],
            expected_currency: 'EUR',
            refund_status: refund.status,
            refund_body: refund.ok ? null : refund.body,
            orderID,
            plan,
          },
        });
      } catch (logErr) {
        // FULL-P1-E — redact. Supabase insert errors include row values
        // on details/hint fields.
        console.error('[capture-order:audit] subscription_events insert failed code=' + (logErr?.code || 'UNKNOWN'));
      }
      const userMsg = refund.ok
        ? 'Payment amount didn\'t match the expected price — we\'ve issued an automatic refund. It should appear in 3-5 business days.'
        : 'Payment amount didn\'t match the expected price. Our team has been notified and will issue a manual refund within 24 hours.';
      return res.status(409).json({
        error: userMsg,
        refundIssued: refund.ok,
        captureID: capture?.id,
      });
    }

    // 4. Upsert the subscription row (server is source of truth).
    // The SKU determines billing interval; the *plan* column on subscriptions
    // is normalized to 'pro' so all entitlement code (status.js, PFCPlan,
    // requirePlan) stays SKU-agnostic.
    const sku = plan;
    const dbPlan = SKU_TO_PLAN[sku];
    // W27-a #15: calendar-correct period_end via _periodEndForSku.
    const periodEnd = _periodEndForSku(sku);
    const nowIso = new Date().toISOString();

    // W29-a #13: append a row to subscription_periods BEFORE the current-
    // state upsert. ON CONFLICT(provider_capture_id) DO NOTHING makes this
    // idempotent across webhook+capture-order races (e.g., capture-order
    // succeeds, then PAYMENT.CAPTURE.COMPLETED webhook tries to insert
    // the same captureId — the second insert is a no-op). The unique
    // constraint at the DB level is the canonical guard.
    const { error: periodErr } = await supabase
      .from('subscription_periods')
      .insert({
        user_id: user.id,
        sku,
        tier: dbPlan,
        provider: 'paypal',
        provider_capture_id: capture?.id || orderID,
        provider_order_id: orderID,
        amount: amountPaid,
        currency: currencyPaid,
        period_start: nowIso,
        period_end: periodEnd,
      });
    if (periodErr && periodErr.code !== '23505') {
      // 23505 = unique_violation (this capture already logged). Anything
      // else is a real error worth logging — but DON'T fail the upgrade,
      // the subscriptions upsert below is the entitlement source of truth.
      // FULL-P1-E — redact. periodErr.details can include row values.
      console.error('[capture-order:seat] subscription_periods insert failed code=' + (periodErr?.code || 'UNKNOWN'));
    }

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
        updated_at: nowIso,
      }, { onConflict: 'user_id' });

    if (upsertErr) {
      // Audit H2 fix: payment captured but DB write failed.
      // Previously we returned 200 + warning, leaving paid users on Free with
      // NO recovery path (the configured webhook list doesn't include
      // PAYMENT.CAPTURE.COMPLETED). Now: 5xx so the client retries, and the
      // captureID is logged loudly for support reconciliation via the PayPal
      // dashboard until the webhook fallback ships in Phase B.
      //
      // FULL-P1-E (audit 2026-05-27) — KEEP the captureId (on-call MUST
      // have it to find the money in PayPal dashboard), but mask the
      // userId to 8-char prefix and DROP upsertErr.message/.details
      // (Supabase error details include the row values being upserted,
      // which here means amount + plan + provider_capture_id — the same
      // captureId we're already logging cleanly above). The error code
      // is enough for SQL-level triage.
      console.error('[capture-order:seat] CAPTURED-BUT-NOT-UPGRADED' +
        ' uid=' + String(user.id).slice(0, 8) +
        ' sku=' + sku +
        ' tier=' + dbPlan +
        ' capture_id=' + (capture?.id || 'MISSING') +
        ' amount=' + amountPaid + ' ' + currencyPaid +
        ' db_code=' + (upsertErr?.code || 'UNKNOWN'));
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
        // FULL-P1-E — redact. finErr.details from Supabase RPC includes
        // the params we passed in (user_id, capture_id).
        console.error('[capture-order:seat] finalize_founders_seat failed code=' + (finErr?.code || 'UNKNOWN'));
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
    // FULL-P1-E — redact stack. Unhandled errors throw mid-flow and
    // the stack contains the parsed body (orderID + plan) + JWT
    // remnants from the Bearer header.
    console.error('[capture-order] unhandled name=' + (err?.name || 'Error') + ' code=' + (err?.code || 'UNKNOWN'));
    return res.status(500).json({ error: 'Internal server error' });
  }
}
