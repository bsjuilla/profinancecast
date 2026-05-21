// api/audit-login.js — Edge runtime audit-bypass cookie issuer.
// rev: 2026-05-22-upstash-wired
//
// PURPOSE
// Lets the audit / dev agent access Pro-gated pages WITHOUT typing the
// user's real password (which is forbidden by Claude's safety rules and
// is a security smell in any AI-assisted workflow).
//
// FLOW
//   1. User sets AUDIT_BYPASS_TOKEN env var in Vercel (long random secret).
//   2. To enter audit mode, visit:
//        https://profinancecast.com/api/audit-login?t=<TOKEN>
//      - If token matches: sets `pfc_audit_session` cookie (24h), redirects to /.
//      - If token missing / wrong: 403 with generic message (no token oracle).
//   3. Subsequent page loads: js/pfc-audit-mode.js reads the cookie
//      synchronously at script-load time, sets window.__PFC_AUDIT_MODE,
//      and short-circuits PFCAuth + PFCPlan checks so pages render as Pro.
//      All data shown is SAMPLE — real user data is never accessed.
//   4. To exit: visit /api/audit-login?logout=1
//
// SECURITY POSTURE
// - Token check is constant-time (no early-exit on first mismatched char).
// - Two cookies are set on success:
//     * pfc_audit_session=<nonce>   HttpOnly  (server-only; no JS access)
//     * pfc_audit_mode_active=1     JS-readable (carries NO secret)
//   This split (added 2026-05-21 per security HIGH-1 finding) means any
//   XSS that reads document.cookie sees only the "active" flag, never
//   the nonce. The nonce is reserved for future server-side audit checks.
// - 24h max age on both cookies; auto-expire.
// - Two-step redirect on success to keep the token out of the Referer
//   header sent to the homepage (security MED-5 finding):
//     /api/audit-login?t=TOKEN  ->  /api/audit-login?_ok=1  ->  /
// - Server logs every successful login + logout (console only — no PII).
// - When env var unset, endpoint returns 503 NOT_CONFIGURED so a token
//   sniff in the URL bar can't pretend the feature exists.

import { Redis } from '@upstash/redis';

export const config = { runtime: 'edge' };

const COOKIE_NAME_NONCE  = 'pfc_audit_session';     // HttpOnly, server-only
const COOKIE_NAME_ACTIVE = 'pfc_audit_mode_active'; // JS-readable flag, no secret
const COOKIE_MAX_AGE_SEC = 24 * 60 * 60; // 24h

// Upstash Redis client — only initialized if Vercel injected the env vars
// (KV_REST_API_URL + KV_REST_API_TOKEN). Falls back to in-memory state
// gracefully if absent (e.g. preview deploys before Storage is linked).
const _redis = (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
  ? new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    })
  : null;

// Rate-limit config: 5 requests / IP / 5-minute window. Cleanly enforced
// across all Edge isolates when Upstash is available (persistent counter
// in Redis); falls back to per-isolate Map otherwise.
const RL_LIMIT = 5;
const RL_WINDOW_SEC = 5 * 60;
const _rlMap = new Map(); // fallback: ip -> { count, resetAt }

async function _rateLimit(ip) {
  if (_redis) {
    // Atomic INCR + EXPIRE via Redis. First INCR returns 1 and we set TTL;
    // subsequent INCRs increment without touching TTL. If TTL elapses, the
    // key disappears and the counter resets — same window semantics as the
    // in-memory version.
    const key = `pfc:rl:audit-login:${ip}`;
    try {
      const count = await _redis.incr(key);
      if (count === 1) {
        // Only set TTL on the first request of a new window.
        await _redis.expire(key, RL_WINDOW_SEC);
      }
      if (count > RL_LIMIT) {
        const ttl = await _redis.ttl(key);
        return { ok: false, remaining: 0, retryAfterSec: Math.max(ttl, 1) };
      }
      return { ok: true, remaining: RL_LIMIT - count, retryAfterSec: 0 };
    } catch (err) {
      // Redis hiccup — fail OPEN (allow the request) rather than locking
      // out legitimate users. The constant-time token check is still the
      // primary guard; rate-limit is defense-in-depth.
      console.warn('[audit-login] redis rate-limit unavailable:', err && err.message);
      // Fall through to in-memory fallback.
    }
  }
  // In-memory fallback (per-isolate, partial protection)
  const now = Date.now();
  const entry = _rlMap.get(ip);
  if (!entry || entry.resetAt < now) {
    _rlMap.set(ip, { count: 1, resetAt: now + RL_WINDOW_SEC * 1000 });
    return { ok: true, remaining: RL_LIMIT - 1, retryAfterSec: 0 };
  }
  if (entry.count >= RL_LIMIT) {
    return { ok: false, remaining: 0, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count += 1;
  return { ok: true, remaining: RL_LIMIT - entry.count, retryAfterSec: 0 };
}

// Nonce store — when Upstash is available we register every issued nonce
// in a key with the same 24h TTL as the cookie. This serves two future
// uses:
//   1. Server-side endpoints that want to verify a nonce is still
//      live (not revoked) can call _isNonceLive(nonce).
//   2. The logout handler DELetes the key, so a specific leaked nonce
//      can be killed in milliseconds without rotating the master token
//      (which would invalidate every audit session including the owner's).
const NONCE_KEY = (n) => `pfc:audit:nonce:${n}`;

async function _registerNonce(nonce) {
  if (!_redis) return; // No Redis -> nonce is implicit-trust until cookie expires
  try {
    await _redis.set(NONCE_KEY(nonce), '1', { ex: COOKIE_MAX_AGE_SEC });
  } catch (err) {
    console.warn('[audit-login] redis nonce register failed:', err && err.message);
  }
}

async function _revokeNonce(nonce) {
  if (!_redis || !nonce) return;
  try { await _redis.del(NONCE_KEY(nonce)); } catch (_) {}
}

// Exported for future use by other audit-aware endpoints (none yet).
// Returns true if Redis confirms the nonce is live, OR if Redis is
// unavailable (fail-open — relies on the cookie's HttpOnly + 24h TTL).
export async function _isNonceLive(nonce) {
  if (!_redis || !nonce) return true;
  try {
    const v = await _redis.get(NONCE_KEY(nonce));
    return v === '1' || v === 1;
  } catch (_) { return true; }
}

function _safeEqual(a, b) {
  // Constant-time string equality.
  //
  // The previous version had `if (a.length !== b.length) return false` which
  // leaks the token length via early-exit timing — a textbook side-channel.
  // Fixed by accumulating the length-mismatch into `diff` and always iterating
  // over max(a, b). `charCodeAt(i) || 0` returns 0 for out-of-bounds chars so
  // the XOR loop produces non-zero `diff` for unequal lengths AND for unequal
  // chars, without branching on length.
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function _redirect(url, cookieHeaders) {
  const headers = new Headers({ 'Location': url, 'Cache-Control': 'no-store' });
  // cookieHeaders may be a single string or an array — multiple Set-Cookie
  // values must each be their own header line.
  if (cookieHeaders) {
    const arr = Array.isArray(cookieHeaders) ? cookieHeaders : [cookieHeaders];
    for (const c of arr) headers.append('Set-Cookie', c);
  }
  return new Response(null, { status: 302, headers });
}

function _json(payload, status, extraHeaders) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: Object.assign({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    }, extraHeaders || {}),
  });
}

export default async function handler(req) {
  if (req.method !== 'GET') {
    return _json({ error: 'Method not allowed', code: 'METHOD' }, 405);
  }

  const url = new URL(req.url);
  const expected = process.env.AUDIT_BYPASS_TOKEN;
  if (!expected) {
    return _json({ error: 'Audit mode not configured', code: 'NOT_CONFIGURED' }, 503);
  }

  // Logout path — clear BOTH cookies AND revoke the nonce in Redis (if
  // present) so the same nonce can't be replayed even before the cookie
  // expires. Parse the existing cookie header to find the nonce value.
  if (url.searchParams.has('logout')) {
    const cookieHeader = req.headers.get('cookie') || '';
    const nonceMatch = cookieHeader.match(new RegExp(`${COOKIE_NAME_NONCE}=([a-f0-9-]+)`));
    if (nonceMatch) await _revokeNonce(nonceMatch[1]);
    const clearNonce  = `${COOKIE_NAME_NONCE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
    const clearActive = `${COOKIE_NAME_ACTIVE}=; Path=/; Max-Age=0; Secure; SameSite=Lax`;
    console.log('[audit-login] logout');
    return _redirect('/', [clearNonce, clearActive]);
  }

  // Step 2 of the two-step redirect: clean URL has no token, so the
  // Referer header on the next request to / carries no secret. No work
  // here — just hop to /.
  if (url.searchParams.get('_ok') === '1') {
    return _redirect('/', null);
  }

  // Apply rate-limit BEFORE the constant-time compare so an attacker can't
  // mount a high-throughput brute force. Use the Vercel-provided real-IP
  // header when present (X-Forwarded-For, X-Real-IP), fall back to a
  // catch-all bucket if no IP is available (still limits in aggregate).
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim()
          || req.headers.get('x-real-ip')
          || 'unknown';
  const rl = await _rateLimit(ip);
  if (!rl.ok) {
    return _json(
      { error: 'Too many attempts', code: 'RATE_LIMITED' },
      429,
      { 'Retry-After': String(rl.retryAfterSec) }
    );
  }

  const supplied = url.searchParams.get('t') || '';
  if (!supplied || !_safeEqual(supplied, expected)) {
    // Generic 403 — don't differentiate "missing" from "wrong" in the body
    // (preserves whatever timing leakage the constant-time compare prevents).
    return _json({ error: 'Forbidden', code: 'FORBIDDEN' }, 403);
  }

  // Token matched. Issue BOTH cookies. The server-generated nonce stays
  // HttpOnly so JS (and any XSS payload) can't read it. The active flag
  // is JS-readable but carries no secret — it's just a 1.
  const nonce = crypto.randomUUID();
  // Register the nonce in Redis with matching TTL so it can be revoked
  // (on logout) or queried (by future audit-aware endpoints).
  await _registerNonce(nonce);
  const cookieNonce  = `${COOKIE_NAME_NONCE}=${nonce}; Path=/; Max-Age=${COOKIE_MAX_AGE_SEC}; HttpOnly; Secure; SameSite=Lax`;
  const cookieActive = `${COOKIE_NAME_ACTIVE}=1; Path=/; Max-Age=${COOKIE_MAX_AGE_SEC}; Secure; SameSite=Lax`;
  console.log('[audit-login] success — nonce=' + nonce.slice(0, 8) + '...');

  // Step 1 of the two-step redirect: hop to /api/audit-login?_ok=1
  // (clean URL, no token) so the URL bar / history / Referer header
  // never carry the secret.
  return _redirect('/api/audit-login?_ok=1', [cookieNonce, cookieActive]);
}
