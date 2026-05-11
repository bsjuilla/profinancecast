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

  function wireUserPill(sidebar) {
    const pill = sidebar.querySelector('.user-pill');
    if (!pill) return;
    if (pill.dataset.pfcWired === '1') return;          // idempotent
    pill.dataset.pfcWired = '1';
    pill.addEventListener('click', (e) => {
      // Don't hijack clicks on nested interactive elements (none today, but defensive)
      if (e.target.closest('a, button')) return;
      window.location.href = 'settings.html';
    });
    // Make accessibility match the visual affordance
    pill.setAttribute('role', 'button');
    pill.setAttribute('tabindex', '0');
    pill.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        window.location.href = 'settings.html';
      }
    });
  }

  function injectToolsSection(sidebar) {
    // Idempotent: skip if we've already injected
    if (sidebar.querySelector('[data-pfc-tools-section]')) return;

    // Anchor: the Insights section header — we insert BEFORE it (so order becomes
    // Overview · Planning · Tools · Insights · Account)
    const sections = sidebar.querySelectorAll('.sidebar-section');
    let insightsHeader = null;
    for (const s of sections) {
      if (s.textContent.trim().toLowerCase() === 'insights') {
        insightsHeader = s;
        break;
      }
    }
    if (!insightsHeader) return;

    // Root-relative hrefs so links resolve correctly from any depth (including
    // pages already inside /tools/ — page-relative would 404 as /tools/tools/X).
    const items = [
      { href: '/tools/take-home-pay.html', label: 'Take-home pay',
        svg: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M2 6h12" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="9.5" r="1.4" stroke="currentColor" stroke-width="1.3"/></svg>' },
      { href: '/tools/debt-strategy.html', label: 'Debt comparator',
        svg: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 13L6 6l3 4 5-9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
      { href: '/journal.html', label: 'Journal',
        svg: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 2h7l3 3v9a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M5 8h6M5 11h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>' },
    ];

    const frag = document.createDocumentFragment();

    const header = document.createElement('div');
    header.className = 'sidebar-section';
    header.setAttribute('data-pfc-tools-section', '');
    header.textContent = 'Tools';
    frag.appendChild(header);

    for (const it of items) {
      const a = document.createElement('a');
      a.className = 'nav-item';
      a.setAttribute('href', it.href);
      a.innerHTML = it.svg + ' ' + it.label;
      frag.appendChild(a);
    }

    insightsHeader.parentNode.insertBefore(frag, insightsHeader);
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
    injectToolsSection(sidebar);   // BEFORE activeLink so the new links are eligible
    activeLink(sidebar);
    hydrateUserPill(sidebar);
    wireUserPill(sidebar);
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
