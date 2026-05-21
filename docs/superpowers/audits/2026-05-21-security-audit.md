# Security Audit — 2026-05-21
**Verdict:** has-issues. Core design is sound, but 3 structural issues need action.

## Findings (severity-ranked)

### HIGH-1 — Audit cookie not HttpOnly + 117 innerHTML sinks = XSS-to-audit-escalation
`api/audit-login.js:23` deliberately sets `HttpOnly=false` because `pfc-audit-mode.js` must read the cookie. But that means any XSS on any page can exfiltrate `pfc_audit_session` and replay it from attacker-controlled session.

Ruflo scan found **117 innerHTML assignment sites** across `js/inline/`. Most use the `escHtml` wrapper, but the `+=` concatenation pattern is fragile (e.g. `js/inline/goals-2.js:131` works only because someone remembered the wrapper).

**Fix:** Split the cookie into two:
- `pfc_audit_session=<nonce>` → HttpOnly (server-only, no JS access to secret)
- `pfc_audit_mode_active=1` → readable by JS, but carries no secret

Then `pfc-audit-mode.js` checks the active-flag cookie, the server validates the nonce on protected endpoints. Plus: add the `no-unsanitized/property` ESLint rule.

### HIGH-2 — `_safeEqual` leaks token length via early-exit
`api/audit-login.js:37-38`:
```js
if (a.length !== b.length) return false;
```
Textbook constant-time failure. Binary-search the token length in O(log N) requests, then brute-force chars. For the documented 26-lowercase token, the length oracle reduces per-char search from 95 chars to 26.

**Fix (drop-in):**
```js
function _safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;  // captures length mismatch
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}
```

### MED-3 — `script-src-attr 'unsafe-inline'` is the last gap in the CSP
`vercel.json:13` keeps `script-src-attr 'unsafe-inline'` because pages use `onload="this.media='all'"` for font-loading + `onclick=` in `auth.html:642,648,669,677`. The new `<figure>/<picture>` integration is clean (no new inline handlers).

**Fix:** Replace `onload="this.media='all'"` font-loading with a programmatic loader in pfc-config.js. Move auth.html onclick handlers to addEventListener. Then tighten `script-src-attr` to `'none'`.

### MED-4 — `pfc-audit-mode.js` overwrites real user LS data
Lines 66-67 write `pfc_user_sync` and `pfc_cash_forecast_user` unconditionally. If a logged-in user accidentally hits `/api/audit-login`, their real sync mirror gets stomped with SAMPLE_USER until PFCStorage corrects.

**Fix:**
```js
if (!localStorage.getItem('pfc_user_sync')) {
  localStorage.setItem('pfc_user_sync', json);
}
```
Or check `PFCAuth.isLoggedIn()` synchronously and skip the seed if a real user is present.

### MED-5 — Token leaks via Referer header
`GET /api/audit-login?t=<TOKEN>` → 302 to `/`. `Referrer-Policy: strict-origin-when-cross-origin` sends full URL same-origin. Plausible may capture it depending on config.

**Fix:** Two-step redirect: validate → 302 to `/api/audit-login?_ok=1` (clean URL, sets cookie) → 302 to `/`. Or convert activation to POST with CSRF.

### LOW-6 — No rate-limit on `/api/audit-login`
For 26-char token, brute-force is impractical anyway, but defense-in-depth.

**Fix:** Vercel Edge rate-limit middleware: max 5 req/IP/5min, 429 with Retry-After.

### LOW-7 — No server-side nonce revocation
If a nonce leaks, can't revoke individually — only by rotating AUDIT_BYPASS_TOKEN (kills all sessions).

**Fix:** Store issued nonces in Vercel KV with 24h TTL. Logout deletes immediately.

## Defense-in-depth
1. **Rotate the token NOW.** `qwertyuiopasdfghjklzxcvbnm` is a keyboard walk, in every dictionary. Use `openssl rand -hex 32`.
2. Switch to short-lived signed JWTs (1h expiry + `jti`).
3. Add `X-PFC-Audit: true` response header in audit mode (anomaly detection in proxy logs).
4. Enforce `no-unsanitized` ESLint rule project-wide.
5. Pursue tightening `script-src-attr` to `'none'`.
