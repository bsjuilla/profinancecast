/**
 * pfc-audit-mode.js — Audit-bypass client module.
 *
 * Loaded SYNCHRONOUSLY at the very top of every Pro-gated page, BEFORE
 * pfc-auth.js and pfc-entitlements.js, so the audit-mode flag is set
 * before those modules' bootstrap code runs.
 *
 * Reads the `pfc_audit_mode_active` cookie (JS-readable flag set by
 * /api/audit-login alongside the HttpOnly nonce cookie). If present,
 * sets `window.__PFC_AUDIT_MODE = true`. The auth + entitlements
 * modules check this flag and short-circuit their redirects + return
 * Pro/Premium plan + signed-in state. Pages render as if a Pro user is
 * signed in, populated with SAMPLE data (seeded into PFCStorage).
 *
 * SECURITY (split-cookie design, 2026-05-21)
 * - The actual nonce lives in pfc_audit_session (HttpOnly, no JS access)
 *   so an XSS payload can NEVER exfiltrate the secret session identifier.
 * - We only read pfc_audit_mode_active here — a flag whose value is just
 *   "1" and carries no secret material. Reading it tells us the user
 *   passed /api/audit-login but reveals nothing else.
 * - All data shown in audit mode is SAMPLE — real user data is never
 *   loaded. A persistent yellow banner makes this obvious.
 *
 * USAGE
 *   <script src="js/pfc-audit-mode.js"></script>   <!-- BEFORE pfc-auth.js -->
 */
(function () {
  'use strict';

  function _hasAuditCookie() {
    try {
      return typeof document !== 'undefined'
          && typeof document.cookie === 'string'
          // Only the JS-readable flag — the actual nonce is HttpOnly and we
          // deliberately can't see it. Reading pfc_audit_mode_active=1 tells
          // us we're in audit mode without exposing any secret to XSS.
          && /(^|;\s*)pfc_audit_mode_active=1(?:;|$)/.test(document.cookie);
    } catch (_) { return false; }
  }

  if (!_hasAuditCookie()) return;

  // SECURITY (2026-05-31 paywall-bypass fix)
  // We do NOT set window.__PFC_AUDIT_MODE synchronously from the JS-readable
  // flag cookie anymore: that flag carries no secret, so anyone could paste
  //   document.cookie='pfc_audit_mode_active=1'
  // and self-grant Pro tools. Instead we ask the SERVER to validate the
  // HttpOnly pfc_audit_session nonce (which an attacker cannot forge — only
  // the token-gated /api/audit-login sets it). __PFC_AUDIT_MODE is set ONLY
  // after the server confirms a real audit session.
  //
  // __PFC_AUDIT_PENDING tells the auth + entitlements gates "an audit cookie
  // is present — await __PFC_AUDIT_READY before deciding". A user with NO
  // audit cookie never reaches this code (we returned above), so those gates
  // see __PFC_AUDIT_PENDING === undefined and behave EXACTLY as before
  // (no await, no fetch).
  window.__PFC_AUDIT_PENDING = true;
  window.__PFC_AUDIT_READY = fetch('/api/audit-verify', { credentials: 'same-origin' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (d && d.valid) {
        window.__PFC_AUDIT_MODE = true;
        window.__PFC_AUDIT_PLAN = (typeof d.plan === 'string' ? d.plan : 'pro');
        // Cosmetic audit UI (banner/log) is gated behind THIS server-validated
        // branch, so a forged flag cookie produces zero observable effect.
        _activateAuditUI();
      }
    })
    .catch(function () {});

  // Optional plan override carried in the JS-readable pfc_audit_plan cookie
  // (set by /api/audit-login?plan=free|pro|premium). Used ONLY to render the
  // seeded SAMPLE view below (cosmetic) — the SERVER (audit-verify) is the
  // authority for the gate-relevant __PFC_AUDIT_PLAN above. Carries no secret;
  // the HttpOnly audit nonce is the actual gate.
  var _auditPlan = 'pro';
  try {
    var _pm = document.cookie.match(/(?:^|;\s*)pfc_audit_plan=(free|pro|premium)(?:;|$)/);
    if (_pm) _auditPlan = _pm[1];
  } catch (_) {}

  // Sample profile shown in audit mode. Numbers designed to exercise every
  // dashboard widget meaningfully — not so big they break formatting, not
  // so small they look like zero-state.
  const SAMPLE_USER = {
    name: 'Audit User',
    firstName: 'Audit',
    lastName: 'User',
    email: 'audit@profinancecast.local',
    age: '30-39',
    currency: '€',
    currencyCode: 'EUR',
    country: 'PT',
    income: 4500, otherIncome: 200,
    housing: 1100, food: 480, transport: 220, otherExp: 340,
    savings: 12500, investments: 8800,
    debt: 5400, debtPay: 320,
    customIn: [], customOut: [],
    plan: _auditPlan,
  };

  // Seed PFCStorage with sample data so every consumer page renders
  // realistically. We use the LS sync mirror (synchronous, no encryption
  // dependency) so the data is visible before PFCStorage's async warm-up.
  try {
    const json = JSON.stringify(SAMPLE_USER);
    // GUARD: only seed the LS sync mirrors if they're empty. A logged-in user
    // who accidentally hits /api/audit-login would otherwise have their real
    // sync mirror stomped by SAMPLE_USER until PFCStorage corrects the race
    // (visible as a brief fake-data flash on slow connections). Security
    // finding MED-4 from the 2026-05-21 audit.
    if (!localStorage.getItem('pfc_user_sync')) {
      localStorage.setItem('pfc_user_sync', json);
    }
    if (!localStorage.getItem('pfc_cash_forecast_user')) {
      localStorage.setItem('pfc_cash_forecast_user', json);
    }
    // Also seed a fake auth session so anything that calls
    // PFCAuth.getSession() gets a plausible response.
    window.__PFC_AUDIT_SAMPLE_USER = SAMPLE_USER;
  } catch (_) {}

  // Render the audit-mode banner. Yellow / amber stripe at the top of
  // every page, persistent until logout. Click handler routes to logout.
  // (Cannot use addEventListener at module-load time because <body> isn't
  // built yet — defer to DOMContentLoaded.)
  function _renderBanner() {
    if (document.getElementById('pfc-audit-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'pfc-audit-banner';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    banner.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:99999',
      'padding:6px 14px',
      'background:rgba(245,166,35,0.95)',
      'color:#1a1408', 'font:600 12px/1.4 system-ui,-apple-system,Segoe UI,sans-serif',
      'letter-spacing:0.02em', 'text-align:center',
      'box-shadow:0 2px 6px rgba(0,0,0,0.20)',
      'cursor:default',
    ].join(';');
    banner.innerHTML =
      '<span aria-hidden="true" style="margin-right:8px">⚠</span>' +
      '<strong>AUDIT MODE</strong> &middot; sample data shown &middot; ' +
      'real user data is NOT visible &middot; ' +
      '<a href="/api/audit-login?logout=1" style="color:inherit;text-decoration:underline;font-weight:700;">exit audit</a>';
    // Push body content down so the banner doesn't cover the page.
    if (document.body) {
      banner.style.position = 'fixed';
      document.body.style.paddingTop = '34px';
      document.body.appendChild(banner);
    } else {
      // body not built yet — defer
      document.addEventListener('DOMContentLoaded', _renderBanner, { once: true });
    }
  }
  // Cosmetic audit-mode UI — banner + devtools helper + console marker.
  // SECURITY (2026-05-31 fast-follow): invoked ONLY from the server-validated
  // .then branch above (d.valid === true), so a forged `pfc_audit_mode_active=1`
  // cookie with no HttpOnly nonce produces ZERO observable effect — audit-verify
  // returns valid:false, this never runs, and the auth/plan gates redirect.
  //
  // The SAMPLE_USER seeding above stays SYNCHRONOUS on purpose: it is invisible
  // to a forged cookie (the gates redirect such a session before any seeded data
  // is rendered, and the MED-4 guard never overwrites a real user's mirror);
  // __PFC_AUDIT_SAMPLE_USER must exist synchronously for PFCAuth.getSession();
  // and the CI screenshot harness needs the sample data in storage BEFORE page
  // render code reads it (moving it behind the fetch would risk empty captures).
  // _activateAuditUI / _renderBanner are function declarations (hoisted), so the
  // async .then can call them even though they're defined here.
  function _activateAuditUI() {
    _renderBanner();
    // Expose a tiny helper for debugging in DevTools.
    window.PFCAuditMode = {
      active: true,
      sampleUser: SAMPLE_USER,
      logout: function () { window.location.href = '/api/audit-login?logout=1'; },
    };
    // One log line in console so it's obvious what's going on if anyone
    // peeks at the network panel and wonders why /api/subscription/status
    // doesn't fire.
    try { console.info('%c[PFC] AUDIT MODE ACTIVE — sample data', 'background:#F5A623;color:#1a1408;padding:2px 6px;border-radius:3px;font-weight:600'); } catch (_) {}
  }
})();
