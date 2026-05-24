/* pfc-mobile-sidebar.js — shared mobile drawer toggle.
 *
 * Extracted from inline <script> blocks on dashboard.html, net-worth.html,
 * and goals.html to comply with CSP `script-src-elem 'self'` (no
 * 'unsafe-inline'). E2E smoke test was failing with:
 *   "Executing inline script violates the following Content Security
 *    Policy directive 'script-src-elem 'self' ...'"
 *
 * All 3 pages share the EXACT same toggle behavior, so DRY-ing into one
 * file removes ~120 lines of duplicate inline script and lets the same
 * CSP profile apply to every surface.
 *
 * Expected DOM:
 *   #primary-sidebar      (the <nav> drawer)
 *   #pfc-mobile-menu-btn  (hamburger trigger)
 *   #pfc-sidebar-scrim    (backdrop)
 *
 * Loaded with `defer` so it runs after the DOM is parsed.
 *
 * CSP-friendly: zero inline handlers, addEventListener only.
 */
(function () {
  'use strict';
  var btn   = document.getElementById('pfc-mobile-menu-btn');
  var nav   = document.getElementById('primary-sidebar');
  var scrim = document.getElementById('pfc-sidebar-scrim');
  if (!btn || !nav || !scrim) return;

  function open() {
    nav.classList.add('is-open');
    scrim.classList.add('is-open');
    btn.setAttribute('aria-expanded', 'true');
    scrim.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function close() {
    nav.classList.remove('is-open');
    scrim.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
    scrim.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
  function toggle() {
    if (nav.classList.contains('is-open')) close(); else open();
  }

  btn.addEventListener('click', toggle);
  scrim.addEventListener('click', close);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) close();
  });
  nav.querySelectorAll('.nav-item').forEach(function (a) {
    a.addEventListener('click', function () {
      if (window.matchMedia('(max-width: 800px)').matches) close();
    });
  });
  window.addEventListener('resize', function () {
    if (!window.matchMedia('(max-width: 800px)').matches) close();
  });
})();
