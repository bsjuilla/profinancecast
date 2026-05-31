// api/audit-verify.js — Edge runtime audit-session validator.
// rev: 2026-05-31-server-validate
//
// PURPOSE
// Closes the paywall-bypass hole where anyone could self-set the JS-readable
// `pfc_audit_mode_active=1` flag cookie (+ pfc_audit_plan) and have the client
// honour it as audit mode — getting Pro tools for free. The REAL secret is the
// HttpOnly `pfc_audit_session` nonce, which ONLY /api/audit-login (token-gated)
// can set; an attacker cannot forge it. This endpoint performs the server-side
// audit check that audit-login.js reserved the nonce for.
//
// CONTRACT
//   GET /api/audit-verify   (credentials: same-origin so the cookies are sent)
//   ->  200 { valid: boolean, plan: 'free'|'pro'|'premium' }
//
//   valid=true  ONLY if the HttpOnly pfc_audit_session nonce cookie is PRESENT
//               (an attacker can set the JS flag but NOT this HttpOnly cookie —
//               only audit-login sets it). When Upstash is configured we ALSO
//               require _isNonceLive(nonce) so revoked/expired nonces fail;
//               when Upstash is NOT configured, presence alone is sufficient
//               (it still proves the session came from token-gated audit-login).
//               _isNonceLive() already fails-open to true when Redis is absent,
//               so a single call covers both branches.
//   valid=false (and HTTP 200, NOT an error) if the nonce cookie is absent/empty.
//
//   plan = the pfc_audit_plan cookie value if it's 'pro'/'premium'/'free',
//          else 'pro' (matches audit-login's default).
//
// SECURITY POSTURE
// - HttpOnly is the whole point: JS (and any XSS payload) cannot read or set
//   pfc_audit_session, but the SERVER can read it off the request — so this
//   endpoint can tell a forged flag-cookie apart from a real audit session.
// - Cache-Control: no-store — the answer is per-request and per-cookie.
// - No token, no PII, no secret in the response body; just {valid, plan}.

import { _isNonceLive } from './audit-login.js';

export const config = { runtime: 'edge' };

const COOKIE_NAME_NONCE = 'pfc_audit_session'; // HttpOnly, server-only
const COOKIE_NAME_PLAN  = 'pfc_audit_plan';    // JS-readable, no secret

// Cookie parser. audit-login.js reads cookies via inline regex on the raw
// header (it has no shared helper); we mirror that approach. The nonce is a
// crypto.randomUUID() (hex + dashes) so [a-f0-9-] matches it exactly — the
// same character class audit-login's logout handler uses for the nonce.
function _readCookie(cookieHeader, name) {
  if (!cookieHeader) return '';
  const m = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? m[1] : '';
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

  const cookieHeader = req.headers.get('cookie') || '';
  const nonce = _readCookie(cookieHeader, COOKIE_NAME_NONCE).trim();

  // Resolve the plan the same way audit-login does: honour the JS-readable
  // pfc_audit_plan cookie if it's a known value, else default 'pro'. (We
  // resolve this even on the invalid path so the shape is stable; the client
  // ignores `plan` when valid=false.)
  const planRaw = _readCookie(cookieHeader, COOKIE_NAME_PLAN).toLowerCase();
  const plan = (planRaw === 'free' || planRaw === 'pro' || planRaw === 'premium')
    ? planRaw
    : 'pro';

  // Absent/empty HttpOnly nonce → not a real audit session. This is the path
  // an attacker who self-set only the JS flag cookie lands on: valid=false.
  // Return 200 (not an error) so the client's r.ok check still parses JSON.
  if (!nonce) {
    return _json({ valid: false, plan }, 200);
  }

  // Nonce present. If Upstash is configured, _isNonceLive enforces that the
  // nonce hasn't been revoked (logout) or expired; if Upstash is NOT
  // configured, _isNonceLive fails-open to true, so presence of the HttpOnly
  // nonce alone suffices — exactly the required design.
  let live = true;
  try {
    live = await _isNonceLive(nonce);
  } catch (_) {
    // _isNonceLive already swallows Redis errors and fails open, but guard
    // here too so a thrown import-time surprise can't 500 the endpoint and
    // block a legitimate audit session.
    live = true;
  }

  return _json({ valid: live === true, plan }, 200);
}
