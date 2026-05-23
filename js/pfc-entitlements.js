/**
 * pfc-entitlements.js — Plan / Pro feature gating.
 *
 * Source of truth is the server (api/subscription/status), with a short-lived
 * client cache so navigation doesn't hammer the API.
 *
 * Public API:
 *   PFCPlan.get()                              → 'free' | 'pro' | 'premium' (cached or 'free')
 *   await PFCPlan.refresh()                    → forces a fresh server fetch
 *   PFCPlan.requirePlan(['pro','premium'])     → on Pro pages: redirects free users to billing
 *   PFCPlan.applyBadges(rootEl?)               → fills any element with [data-plan-badge]
 *   PFCPlan.onChange(fn)                       → subscribe to plan changes
 *
 * Element conventions:
 *   <span data-plan-badge>Free plan</span>     ← auto-updated to "Pro plan", "Premium plan"
 *   <a data-pro-only href="scenarios.html">    ← gets a lock icon + redirects free users
 *   <button data-pro-action="export">          ← disabled for free users with upgrade tooltip
 */
const PFCPlan = (() => {
  const CACHE_TTL_MS = 30 * 1000;     // 30s — short window so webhook downgrades propagate quickly (audit M2)
  const STORAGE_KEY  = 'plan_cache';

  let _plan = 'free';
  let _fetchedAt = 0;
  const _changeCb = [];

  function _label(p) {
    return p === 'pro' ? 'Pro' : p === 'premium' ? 'Premium' : 'Free';
  }

  function _emit(prev, next) {
    if (prev === next) return;
    _changeCb.forEach(fn => { try { fn(next, prev); } catch(_) {} });
  }

  function _readCache() {
    try {
      if (typeof PFCStorage === 'undefined') return null;
      const c = PFCStorage.getJSON(STORAGE_KEY);
      if (!c || !c.plan || !c.fetchedAt) return null;
      if (Date.now() - c.fetchedAt > CACHE_TTL_MS) return null;
      return c;
    } catch(_) { return null; }
  }

  // Like _readCache, but ignores TTL — used on fetch failure to recover a
  // stale entry rather than silently demoting a Pro user to 'free' (audit #18).
  function _readCacheAnyAge() {
    try {
      if (typeof PFCStorage === 'undefined') return null;
      const c = PFCStorage.getJSON(STORAGE_KEY);
      if (!c || !c.plan || !c.fetchedAt) return null;
      return c;
    } catch(_) { return null; }
  }

  function _writeCache() {
    try {
      if (typeof PFCStorage !== 'undefined') {
        PFCStorage.setJSON(STORAGE_KEY, { plan: _plan, fetchedAt: _fetchedAt });
      }
    } catch(_) {}
  }

  async function refresh() {
    const prev = _plan;
    if (typeof PFCAuth === 'undefined' || !PFCAuth.isLoggedIn()) {
      _plan = 'free';
      _fetchedAt = Date.now();
      _writeCache();
      _emit(prev, _plan);
      return _plan;
    }
    let fetchFailed = false;
    try {
      const session = PFCAuth.getSession();
      const token = session?.access_token;
      const res = await fetch('/api/subscription/status', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        _plan = (data && typeof data.plan === 'string') ? data.plan : 'free';
      } else {
        // Treat 4xx/5xx as a transient fetch failure rather than authoritative
        // "free": a 500 / 502 / 429 from /api/subscription/status MUST NOT
        // demote a paying user. We fall through to the cache-recovery branch
        // below. (audit #18)
        fetchFailed = true;
      }
    } catch (e) {
      console.warn('[PFCPlan] refresh failed:', e.message);
      fetchFailed = true;
    }
    if (fetchFailed) {
      // Network failures must not demote Pro users — return stale cache if
      // available, only fall back to 'free' as last resort. Critically we do
      // NOT _writeCache() on failure: that would persist 'free' under the
      // 30s TTL and silently downgrade the user across navigations.
      const stale = _readCacheAnyAge();
      if (stale && stale.plan) {
        _plan = stale.plan;
        // Don't touch _fetchedAt — leave it as whenever the successful fetch
        // last landed so the next call still treats this entry as needing
        // a refresh on the normal cadence.
        _emit(prev, _plan);
      } else {
        // No prior cache → safest default is 'free' (fail closed).
        _plan = 'free';
        _fetchedAt = Date.now();
        _writeCache();
        _emit(prev, _plan);
      }
      return _plan;
    }
    _fetchedAt = Date.now();
    _writeCache();
    _emit(prev, _plan);
    return _plan;
  }

  function get() {
    // Audit-mode bypass: js/pfc-audit-mode.js sets the flag synchronously
    // before this module loads when the pfc_audit_session cookie is present.
    if (typeof window !== 'undefined' && window.__PFC_AUDIT_MODE === true) return 'pro';
    return _plan;
  }

  function applyBadges(root) {
    const scope = root || document;
    const isPaid = (_plan === 'pro' || _plan === 'premium');

    scope.querySelectorAll('[data-plan-badge]').forEach(el => {
      el.textContent = `${_label(_plan)} plan`;
      el.dataset.plan = _plan;
    });
    scope.querySelectorAll('[data-pro-only]').forEach(a => {
      a.classList.toggle('is-locked', !isPaid);
      if (!isPaid && !a.dataset.proOnlyHandlerBound) {
        a.dataset.proOnlyHandlerBound = '1';
        a.addEventListener('click', e => {
          e.preventDefault();
          window.location.href = 'billing.html?upgrade=' + encodeURIComponent(a.getAttribute('href') || '');
        });
      }
    });
    scope.querySelectorAll('[data-pro-action]').forEach(btn => {
      btn.disabled = !isPaid;
      btn.title = isPaid ? '' : 'Upgrade to Pro to unlock';
      btn.classList.toggle('is-locked', !isPaid);
    });

    // Free-only UI (upgrade banners, "Upgrade to Pro" buttons): hidden when
    // user is paid. Previously this was driven by dashboard-2.js's
    // hideUpgradeBannerIfPro() listening on a custom 'pfc:plan-changed'
    // event — but that event was NEVER dispatched, so the function only
    // ran on the initial PFCAuth.onReady tick and via setTimeout fallbacks.
    // Race result: applyBadges wrote "Pro plan" in the sidebar, but the
    // upgrade banner stayed visible because no event fired to re-evaluate.
    // Folding the toggle into applyBadges (which runs after every refresh)
    // eliminates the race — every plan-resolution updates the banner state
    // even when _plan === prev (no _emit) or the listener was registered
    // after the initial _emit fired.
    scope.querySelectorAll('[data-free-only]').forEach(el => {
      if (isPaid) {
        el.style.display = 'none';
      } else {
        // Restore the element's documented show-state (default: empty
        // string, which lets the CSS rule for the element class take over).
        el.style.display = el.dataset.freeOnlyShow || '';
      }
    });
  }

  /**
   * Route guard for Pro-only pages.
   * Wait for auth → wait for plan → redirect free users to billing.
   * Free users never see the page contents (no flicker).
   */
  function requirePlan(allowed) {
    // Audit-mode bypass — page renders as Pro, no redirects.
    if (typeof window !== 'undefined' && window.__PFC_AUDIT_MODE === true) {
      _plan = 'pro';
      applyBadges();
      return;
    }
    const allowSet = new Set(Array.isArray(allowed) ? allowed : [allowed]);
    document.documentElement.style.visibility = 'hidden';

    const proceed = async () => {
      if (typeof PFCAuth === 'undefined' || !PFCAuth.isLoggedIn()) {
        const here = encodeURIComponent(window.location.pathname);
        window.location.replace(`auth.html?next=${here}`);
        return;
      }
      // Try cache first for instant render, then verify in background
      const cached = _readCache();
      if (cached) {
        _plan = cached.plan;
        _fetchedAt = cached.fetchedAt;
      }
      if (!cached || !allowSet.has(_plan)) {
        await refresh();
      }
      if (!allowSet.has(_plan)) {
        const here = encodeURIComponent(window.location.pathname);
        window.location.replace(`billing.html?upgrade=${here}`);
        return;
      }
      document.documentElement.style.visibility = '';
      applyBadges();
      // Verify in background even on cache hit, in case plan was downgraded server-side
      if (cached) refresh().then(() => applyBadges());
    };

    if (typeof PFCAuth !== 'undefined') PFCAuth.onReady(proceed);
    else proceed();
  }

  function onChange(fn) { _changeCb.push(fn); }

  // Boot: pick up cached plan immediately, then refresh once auth resolves
  const cached = _readCache();
  if (cached) { _plan = cached.plan; _fetchedAt = cached.fetchedAt; }

  if (typeof PFCAuth !== 'undefined') {
    PFCAuth.onReady(() => { refresh().then(() => applyBadges()); });
    PFCAuth.onAuthChange(() => { refresh().then(() => applyBadges()); });
  }

  // Revalidate plan when the user returns to the tab — catches webhook-driven
  // downgrades/upgrades that happened while the tab was backgrounded (audit M2).
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        refresh().then(() => applyBadges());
      }
    });
  }

  // W27-c #22 — periodic refresh for paying users while the tab is open.
  // visibilitychange catches background→foreground transitions, but a user
  // who keeps the tab focused for hours can keep using Pro UI after a
  // webhook-driven refund downgrade has landed server-side. A 10-minute
  // poll closes that window. We only run it for paid plans (the typical
  // browse session for a free user shouldn't poll the API) and skip
  // when the tab is hidden (visibilitychange already covers re-entry).
  if (typeof window !== 'undefined' && typeof setInterval === 'function') {
    const PAID = (p) => p === 'pro' || p === 'premium';
    setInterval(() => {
      try {
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
        if (!PAID(_plan)) return;
        refresh().then(() => applyBadges());
      } catch (_) { /* never throw out of a setInterval */ }
    }, 10 * 60 * 1000);
  }

  return { get, refresh, requirePlan, applyBadges, onChange };
})();
