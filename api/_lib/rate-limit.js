// api/_lib/rate-limit.js
//
// NEW-S4 fix — shared rate limiter for payment endpoints.
//
// Why: pre-fix, a signed-in user could hammer /api/paypal/create-subscription
// endlessly. Each call mints a real PayPal subscription (see NEW-S2). At
// PayPal's per-merchant rate-limit ceiling, the merchant account auto-
// suspends — all revenue stops. The CISO pass flagged this as a launch-
// blocker; @upstash/redis was already a project dep but unused.
//
// Behaviour:
//   - Returns { allowed: true }  if under threshold
//   - Returns { allowed: false, retryAfterSec } if over
//   - **Soft-fails OPEN** when UPSTASH_REDIS_REST_URL/TOKEN are unset OR
//     Redis is unreachable: we don't want a rate-limiter outage to block
//     legitimate payments. The trade-off: an attacker during a Redis
//     outage gets a free pass. This is the same trade-off Stripe + most
//     production rate limiters make.
//
// Setup (operator action):
//   Option A — Vercel KV marketplace integration (you already have this):
//     KV_REST_API_URL + KV_REST_API_TOKEN are set automatically when you
//     provision Vercel KV / Upstash via Vercel → Storage → Connect Store.
//     No further action needed — this module auto-detects those names.
//   Option B — standalone Upstash:
//     Create a Redis DB at https://console.upstash.com → copy REST URL + token.
//     Add to Vercel env:
//        UPSTASH_REDIS_REST_URL  = https://....upstash.io
//        UPSTASH_REDIS_REST_TOKEN = AX...
//
// Without either pair set, this module soft-fails open (rate limit is a
// no-op; payments still work but unprotected). A console warning is logged
// once per cold start to surface the misconfiguration without breaking.

import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

let _limiterCache = null;

function _getLimiter() {
  if (_limiterCache !== null) return _limiterCache;
  // Accept either the standalone Upstash names OR the Vercel KV marketplace
  // names. Vercel KV is just Upstash Redis under the hood, so the REST URL
  // + token work identically with @upstash/redis.
  const url   = process.env.UPSTASH_REDIS_REST_URL  || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    console.warn('[rate-limit] no Upstash/KV env vars detected — soft-failing open. Set KV_REST_API_URL+TOKEN (Vercel KV) or UPSTASH_REDIS_REST_URL+TOKEN (standalone) to enable.');
    _limiterCache = false;  // permanently disabled this cold start
    return false;
  }
  try {
    const redis = new Redis({ url, token });
    _limiterCache = new Ratelimit({
      redis,
      // 10 requests per 60s sliding window. Generous enough that a legit
      // user clicking around checkout won't hit it; tight enough that a
      // scripted attacker mints orders/subs slowly enough that PayPal
      // doesn't auto-suspend us.
      limiter: Ratelimit.slidingWindow(10, '60 s'),
      analytics: true,
      prefix: 'pfc:paypal',
    });
    return _limiterCache;
  } catch (e) {
    console.error('[rate-limit] init failed (soft-failing open):', e?.message || e);
    _limiterCache = false;
    return false;
  }
}

/**
 * Check the per-user rate limit for a PayPal-touching endpoint.
 *
 * @param {string} key — typically `${endpointLabel}:${userId}`. Distinct
 *                       endpoint labels keep buckets separate so cancel
 *                       doesn't burn the create-order budget.
 * @returns {Promise<{ allowed: true } | { allowed: false, retryAfterSec: number }>}
 */
export async function checkRateLimit(key) {
  const limiter = _getLimiter();
  if (!limiter) return { allowed: true };  // soft-fail open
  try {
    const { success, reset } = await limiter.limit(key);
    if (success) return { allowed: true };
    const retryAfterSec = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
    return { allowed: false, retryAfterSec };
  } catch (e) {
    console.error('[rate-limit] check failed (soft-failing open):', e?.message || e);
    return { allowed: true };
  }
}

/**
 * One-liner for handlers: returns a Response (Edge) or sends one (Node)
 * if rate-limited; otherwise returns null and the caller proceeds.
 *
 * Usage in NODE handler:
 *   const rl = await rateLimitOrReject(req, res, `create-order:${user.id}`);
 *   if (rl) return;  // already responded with 429
 *
 * Usage in EDGE handler:
 *   const rl = await rateLimitOrReject(null, null, `create-sub:${user.id}`);
 *   if (rl) return rl;  // Response object
 */
export async function rateLimitOrReject(req, res, key) {
  const check = await checkRateLimit(key);
  if (check.allowed) return null;
  const body = {
    error: 'Too many requests. Please wait before trying again.',
    retry_after_sec: check.retryAfterSec,
  };
  if (res && typeof res.status === 'function') {
    // Node runtime
    res.setHeader('Retry-After', String(check.retryAfterSec));
    res.status(429).json(body);
    return true;
  }
  // Edge runtime — return a Response the caller forwards
  return new Response(JSON.stringify(body), {
    status: 429,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Retry-After': String(check.retryAfterSec),
    },
  });
}
