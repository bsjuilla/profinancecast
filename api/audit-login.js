// api/audit-login.js — Edge runtime audit-bypass cookie issuer.
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

export const config = { runtime: 'edge' };

const COOKIE_NAME_NONCE  = 'pfc_audit_session';     // HttpOnly, server-only
const COOKIE_NAME_ACTIVE = 'pfc_audit_mode_active'; // JS-readable flag, no secret
const COOKIE_MAX_AGE_SEC = 24 * 60 * 60; // 24h

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

export default function handler(req) {
  if (req.method !== 'GET') {
    return _json({ error: 'Method not allowed', code: 'METHOD' }, 405);
  }

  const url = new URL(req.url);
  const expected = process.env.AUDIT_BYPASS_TOKEN;
  if (!expected) {
    return _json({ error: 'Audit mode not configured', code: 'NOT_CONFIGURED' }, 503);
  }

  // Logout path — clear BOTH cookies (nonce + active flag).
  if (url.searchParams.has('logout')) {
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
  const cookieNonce  = `${COOKIE_NAME_NONCE}=${nonce}; Path=/; Max-Age=${COOKIE_MAX_AGE_SEC}; HttpOnly; Secure; SameSite=Lax`;
  const cookieActive = `${COOKIE_NAME_ACTIVE}=1; Path=/; Max-Age=${COOKIE_MAX_AGE_SEC}; Secure; SameSite=Lax`;
  console.log('[audit-login] success — nonce=' + nonce.slice(0, 8) + '...');

  // Step 1 of the two-step redirect: hop to /api/audit-login?_ok=1
  // (clean URL, no token) so the URL bar / history / Referer header
  // never carry the secret.
  return _redirect('/api/audit-login?_ok=1', [cookieNonce, cookieActive]);
}
