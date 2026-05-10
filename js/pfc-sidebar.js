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
    // Vercel serves clean URLs, so location.pathname is "/recurring" while
    // hrefs are "recurring.html" — strip the trailing .html on both sides.
    const stripHtml = (s) => s.replace(/\.html$/, '');
    const here = stripHtml(location.pathname.replace(/\/$/, '') || '/');
    const links = sidebar.querySelectorAll('a.nav-item[href]');
    let best = null;
    let bestScore = 0;
    for (const a of links) {
      // Compare on pathname so query/hash don't confuse the match.
      let p;
      try { p = new URL(a.href, location.origin).pathname; } catch (_) { continue; }
      const norm = stripHtml(p.replace(/\/$/, '') || '/');
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
    const nextName = name || 'Your account';
    const nextAvatar = (name ? name[0] : 'U').toUpperCase();
    // Idempotent: skip DOM writes when the value hasn't changed (avoids
    // a visible flicker/relayout on the auth-ready re-hydrate below).
    if (nameEl && nameEl.textContent !== nextName) nameEl.textContent = nextName;
    if (avatarEl && avatarEl.textContent !== nextAvatar) avatarEl.textContent = nextAvatar;
  }

  function injectMobileChrome(sidebar) {
    // Only inject mobile chrome on pages using the new responsive layout (pfc-sidebar / body.pfc-app). Legacy .sidebar pages keep the always-visible desktop sidebar at all viewports — no toggle needed.
    if (!sidebar.classList.contains('pfc-sidebar') && !document.body.classList.contains('pfc-app')) return;
    if (document.querySelector('[data-sidebar-toggle]')) return;
    const btn = document.createElement('button');
    btn.className = 'pfc-sidebar-toggle';
    btn.setAttribute('data-sidebar-toggle', '');
    btn.setAttribute('aria-label', 'Open menu');
    btn.setAttribute('aria-controls', sidebar.id || '');
    btn.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true"><path d="M3 6h16M3 11h16M3 16h16" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
    document.body.insertBefore(btn, document.body.firstChild);

    const backdrop = document.createElement('div');
    backdrop.className = 'pfc-sidebar-backdrop';
    document.body.insertBefore(backdrop, sidebar);
  }

  function wireMobileToggle(sidebar) {
    injectMobileChrome(sidebar);
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
    // WHY: PFCStorage namespaces by userId, but at DOMContentLoaded the
    // Supabase session may not be restored yet — so the first read can hit
    // pfc:guest:user and paint the default. Re-hydrate once auth resolves
    // (and on any subsequent sign-in/sign-out) to land on the correct value.
    if (typeof PFCAuth !== 'undefined') {
      PFCAuth.onReady(() => hydrateUserPill(sidebar));
      PFCAuth.onAuthChange(() => hydrateUserPill(sidebar));
    }
    wireMobileToggle(sidebar);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
