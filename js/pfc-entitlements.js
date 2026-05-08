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
        // Fail closed: any 4xx/5xx → treat as free, never auto-upgrade
        _plan = 'free';
      }
    } catch (e) {
      console.warn('[PFCPlan] refresh failed:', e.message);
      _plan = 'free';
    }
    _fetchedAt = Date.now();
    _writeCache();
    _emit(prev, _plan);
    return _plan;
  }

  function get() { return _plan; }

  function applyBadges(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-plan-badge]').forEach(el => {
      el.textContent = `${_label(_plan)} plan`;
      el.dataset.plan = _plan;
    });
    scope.querySelectorAll('[data-pro-only]').forEach(a => {
      const allowed = (_plan === 'pro' || _plan === 'premium');
      a.classList.toggle('is-locked', !allowed);
      if (!allowed && !a.dataset.proOnlyHandlerBound) {
        a.dataset.proOnlyHandlerBound = '1';
        a.addEventListener('click', e => {
          e.preventDefault();
          window.location.href = 'billing.html?upgrade=' + encodeURIComponent(a.getAttribute('href') || '');
        });
      }
    });
    scope.querySelectorAll('[data-pro-action]').forEach(btn => {
      const allowed = (_plan === 'pro' || _plan === 'premium');
      btn.disabled = !allowed;
      btn.title = allowed ? '' : 'Upgrade to Pro to unlock';
      btn.classList.toggle('is-locked', !allowed);
    });
  }

  /**
   * Route guard for Pro-only pages.
   * Wait for auth → wait for plan → redirect free users to billing.
   * Free users never see the page contents (no flicker).
   */
  function requirePlan(allowed) {
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

  return { get, refresh, requirePlan, applyBadges, onChange };
})();
