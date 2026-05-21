/**
 * pfc-audit-mode.js — Audit-bypass client module.
 *
 * Loaded SYNCHRONOUSLY at the very top of every Pro-gated page, BEFORE
 * pfc-auth.js and pfc-entitlements.js, so the audit-mode flag is set
 * before those modules' bootstrap code runs.
 *
 * Reads the `pfc_audit_session` cookie (set by /api/audit-login). If
 * present, sets `window.__PFC_AUDIT_MODE = true`. The auth + entitlements
 * modules check this flag and short-circuit their redirects + return
 * Pro/Premium plan + signed-in state. Pages render as if a Pro user is
 * signed in, populated with SAMPLE data (seeded into PFCStorage).
 *
 * SECURITY
 * - Reading the cookie is read-only. No token data is exposed.
 * - The cookie value is an opaque nonce generated server-side by
 *   /api/audit-login — not the audit secret token itself.
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
          && /(^|;\s*)pfc_audit_session=[^;]+/.test(document.cookie);
    } catch (_) { return false; }
  }

  if (!_hasAuditCookie()) return;

  // Set the global flag IMMEDIATELY (synchronous) so PFCAuth + PFCPlan
  // can see it when they boot a few milliseconds later.
  window.__PFC_AUDIT_MODE = true;

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
    plan: 'pro',
  };

  // Seed PFCStorage with sample data so every consumer page renders
  // realistically. We use the LS sync mirror (synchronous, no encryption
  // dependency) so the data is visible before PFCStorage's async warm-up.
  try {
    const json = JSON.stringify(SAMPLE_USER);
    localStorage.setItem('pfc_user_sync', json);
    localStorage.setItem('pfc_cash_forecast_user', json);
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
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _renderBanner, { once: true });
  } else {
    _renderBanner();
  }

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
})();
