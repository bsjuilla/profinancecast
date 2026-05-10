/**
 * pfc-sidebar.js — Behavior for the unified app sidebar.
 *
 * The sidebar HTML is inlined identically on every app page (vanilla
 * constraint; no template-include step). This module wires the parts that
 * vary by page or session:
 *
 *   1. Marks the link matching location.pathname as the current page —
 *      sets `.active` (legacy class for cascade) and aria-current="page".
 *   2. Hydrates the user pill (#sidebar-name + #sidebar-avatar) from
 *      PFCStorage('user') on first paint.
 *   3. Wires the mobile toggle: any element with [data-sidebar-toggle]
 *      flips `.is-open` on the sidebar; clicking the backdrop closes it.
 *
 * No-ops gracefully if the sidebar isn't on the current page (e.g., index,
 * about, blog, auth).
 */
(function () {
  'use strict';

  function activeLink(sidebar) {
    const here = location.pathname.replace(/\/$/, '') || '/';
    const links = sidebar.querySelectorAll('a.nav-item[href]');
    let best = null;
    let bestScore = -1;
    for (const a of links) {
      // Compare on pathname so query/hash don't confuse the match.
      let p;
      try { p = new URL(a.href, location.origin).pathname; } catch (_) { continue; }
      const norm = p.replace(/\/$/, '') || '/';
      // Score: exact match wins; otherwise pick the longest prefix match so
      // sub-pages (if any are added later) still light up the parent.
      let score = 0;
      if (norm === here) score = 1000;
      else if (here.startsWith(norm + '/')) score = norm.length;
      if (score > bestScore) { best = a; bestScore = score; }
    }
    if (best) {
      best.classList.add('active');
      best.setAttribute('aria-current', 'page');
    }
  }

  function hydrateUserPill(sidebar) {
    const nameEl = sidebar.querySelector('#sidebar-name');
    const avatarEl = sidebar.querySelector('#sidebar-avatar');
    if (!nameEl && !avatarEl) return;
    let name = '';
    if (typeof PFCStorage !== 'undefined') {
      const raw = PFCStorage.get('user');
      if (raw) {
        try { name = (JSON.parse(raw).name || '').trim(); } catch (_) {}
      }
    }
    if (nameEl) nameEl.textContent = name || 'Your account';
    if (avatarEl) avatarEl.textContent = (name ? name[0] : 'U').toUpperCase();
  }

  function wireMobileToggle(sidebar) {
    const toggles = document.querySelectorAll('[data-sidebar-toggle]');
    if (!toggles.length) return;
    const close = () => {
      sidebar.classList.remove('is-open');
      document.body.classList.remove('pfc-sidebar-open');
    };
    const open = () => {
      sidebar.classList.add('is-open');
      document.body.classList.add('pfc-sidebar-open');
    };
    toggles.forEach(btn => btn.addEventListener('click', () => {
      if (sidebar.classList.contains('is-open')) close(); else open();
    }));
    // Click anywhere on the page (outside the sidebar) closes the drawer.
    document.addEventListener('click', (e) => {
      if (!sidebar.classList.contains('is-open')) return;
      if (sidebar.contains(e.target)) return;
      if (e.target.closest('[data-sidebar-toggle]')) return;
      close();
    });
    // ESC closes.
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && sidebar.classList.contains('is-open')) close();
    });
    // Following any nav-item link should close (don't strand the user with
    // a half-open drawer when they navigate).
    sidebar.querySelectorAll('a.nav-item').forEach(a => {
      a.addEventListener('click', () => {
        if (sidebar.classList.contains('is-open')) close();
      });
    });
  }

  function init() {
    const sidebar = document.querySelector('nav.sidebar, aside.sidebar');
    if (!sidebar) return;
    activeLink(sidebar);
    hydrateUserPill(sidebar);
    wireMobileToggle(sidebar);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
