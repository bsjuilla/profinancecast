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
// - Cookie is HttpOnly=false (client JS must read it) but Secure + SameSite=Lax.
// - 24h max age; auto-expires.
// - Server logs every successful login + logout (console only — no PII).
// - When env var unset, endpoint returns 503 NOT_CONFIGURED so a token
//   sniff in the URL bar can't pretend the feature exists.

export const config = { runtime: 'edge' };

const COOKIE_NAME = 'pfc_audit_session';
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

function _redirect(url, cookieHeader) {
  const headers = new Headers({ 'Location': url, 'Cache-Control': 'no-store' });
  if (cookieHeader) headers.append('Set-Cookie', cookieHeader);
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

  // Logout path — explicit clear, regardless of current token state.
  if (url.searchParams.has('logout')) {
    const clear = `${COOKIE_NAME}=; Path=/; Max-Age=0; Secure; SameSite=Lax`;
    console.log('[audit-login] logout');
    return _redirect('/', clear);
  }

  const supplied = url.searchParams.get('t') || '';
  if (!supplied || !_safeEqual(supplied, expected)) {
    // Generic 403 — don't differentiate "missing" from "wrong" in the body
    // (preserves whatever timing leakage the constant-time compare prevents).
    return _json({ error: 'Forbidden', code: 'FORBIDDEN' }, 403);
  }

  // Token matched. Issue audit cookie. We use a server-generated nonce as
  // the cookie value rather than the token itself — so even if the cookie
  // leaks (browser dev tools / proxy log), it can't be replayed against
  // this endpoint to re-enter audit mode.
  const nonce = crypto.randomUUID();
  const cookie = `${COOKIE_NAME}=${nonce}; Path=/; Max-Age=${COOKIE_MAX_AGE_SEC}; Secure; SameSite=Lax`;
  console.log('[audit-login] success — nonce=' + nonce.slice(0, 8) + '...');

  // Redirect to root after issuing the cookie so the URL bar no longer
  // contains the secret token (history hygiene).
  return _redirect('/', cookie);
}
