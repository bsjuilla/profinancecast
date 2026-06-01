/* dashboard-firstrun.js — additive first-run welcome card.
 *
 * PURPOSE
 * A brand-new user who SKIPS onboarding ("Skip setup →") or doesn't finish it
 * lands on a dashboard that is all €0 — a weak first impression. This shows a
 * single guided welcome card, ONLY when the signed-in user has no financial
 * data yet, pointing them to the two-minute setup. Once they have any income /
 * savings / debt / name, the card never renders again.
 *
 * SAFETY (deliberate design)
 * - PURELY ADDITIVE. It does NOT touch the forecast engine (dashboard-2.js /
 *   dashboard-3.js): it only reads the profile and, if empty, inserts one DOM
 *   node. It cannot break rendering — every step is wrapped in try/catch and
 *   the whole thing is a no-op on any error.
 * - Reuses the dashboard's OWN emptiness rule (isUserEmpty in dashboard-2.js)
 *   and the same 'user' storage key, so "empty" means exactly what the
 *   dashboard already means by it.
 * - Skips audit/sample mode (sample data is seeded there).
 * - CSP-safe: external file, styles set via element.style (no inline <script>,
 *   no injected <style>).
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  function _getUser() {
    try {
      if (typeof PFCUser !== 'undefined' && typeof PFCUser.get === 'function') {
        return PFCUser.get() || null;
      }
    } catch (_) {}
    try {
      if (typeof PFCStorage !== 'undefined' && typeof PFCStorage.get === 'function') {
        var raw = PFCStorage.get('user');
        return raw ? JSON.parse(raw) : null;
      }
    } catch (_) {}
    return null;
  }

  // Identical rule to dashboard-2.js isUserEmpty(u).
  function _isEmpty(u) {
    return !u || (!u.income && !u.savings && !u.debt && !(u.name && u.name.length));
  }

  function _build() {
    if (document.getElementById('pfc-firstrun')) return;          // already shown
    if (window.__PFC_AUDIT_MODE === true) return;                 // sample-data mode
    var u = _getUser();
    if (!_isEmpty(u)) return;                                     // user has data → nothing to do

    var main = document.querySelector('main.main') || document.querySelector('main');
    if (!main) return;

    var card = document.createElement('section');
    card.id = 'pfc-firstrun';
    card.setAttribute('aria-label', 'Get started');
    card.style.cssText = [
      'margin:18px 0 6px', 'padding:22px 24px',
      'border:1px solid var(--line,rgba(244,239,229,0.10))',
      'border-radius:var(--r-md,14px)',
      'background:linear-gradient(180deg,var(--teal-dim,rgba(43,182,125,0.08)) 0%,var(--surface,rgba(244,239,229,0.02)) 100%)',
      'display:flex', 'flex-wrap:wrap', 'align-items:center',
      'gap:16px', 'justify-content:space-between'
    ].join(';');

    var txt = document.createElement('div');
    txt.style.cssText = 'flex:1 1 280px;min-width:0';

    var h = document.createElement('div');
    h.textContent = 'Welcome — let’s build your first forecast.';
    h.style.cssText = 'font-family:var(--font-display,Georgia,serif);font-style:italic;font-size:20px;font-weight:500;line-height:1.2;margin-bottom:6px;color:var(--text,var(--ink,#f4efe5))';

    var p = document.createElement('div');
    p.textContent = 'Add your monthly numbers and ProFinanceCast projects the next ten years — your net worth, your debt-free month, the goals you’ll hit. About two minutes.';
    p.style.cssText = 'font-size:14px;line-height:1.55;max-width:60ch;color:var(--text2,var(--ink-2,#b8c0bc))';

    txt.appendChild(h);
    txt.appendChild(p);

    var cta = document.createElement('a');
    cta.href = 'onboarding.html';
    cta.textContent = 'Set up my forecast →';
    cta.setAttribute('data-pfc-track', 'firstrun_setup_click');
    cta.style.cssText = 'flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;padding:11px 20px;border-radius:var(--r-pill,999px);background:var(--teal,var(--money,#2bb67d));color:#06130d;font-weight:600;font-size:14px;text-decoration:none;white-space:nowrap';

    card.appendChild(txt);
    card.appendChild(cta);

    // Insert just below the topbar so the greeting/header stays on top; else
    // prepend to main.
    var topbar = main.querySelector('.topbar');
    if (topbar && topbar.parentNode === main) {
      if (topbar.nextSibling) main.insertBefore(card, topbar.nextSibling);
      else main.appendChild(card);
    } else {
      main.insertBefore(card, main.firstChild);
    }
  }

  function _safeBuild() { try { _build(); } catch (_) {} }

  function _schedule() {
    try {
      if (typeof PFCUser !== 'undefined' && typeof PFCUser.onReady === 'function') {
        PFCUser.onReady(_safeBuild); return;
      }
      if (typeof PFCStorage !== 'undefined' && typeof PFCStorage.onReady === 'function') {
        PFCStorage.onReady(_safeBuild); return;
      }
    } catch (_) {}
    setTimeout(_safeBuild, 1200); // fallback if neither ready-hook exists
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _schedule, { once: true });
  } else {
    _schedule();
  }
})();
