/**
 * pfc-auth.js — Shared auth module.
 *
 * Load order on every page (before any page-specific script):
 *   1. https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2
 *   2. js/pfc-config.js
 *   3. js/pfc-auth.js
 *   4. js/pfc-storage.js
 *   5. js/pfc-entitlements.js  (only on pages that gate Pro features)
 */
const PFCAuth = (() => {
  const cfg = window.PFC_CONFIG || {};
  let _client  = null;
  let _session = null;
  let _userId  = 'guest';
  let _ready   = false;
  let _failed  = false; // set when SDK/config didn't load — see requireAuth (audit L3)
  const _readyCb = [];
  const _changeCb = [];

  try {
    if (window.supabase && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY) {
      _client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
    } else {
      console.warn('[PFCAuth] Supabase SDK or config missing — auth features disabled.');
      _failed = true;
    }
  } catch (e) {
    console.error('[PFCAuth] Failed to init Supabase client:', e);
    _failed = true;
  }

  function _renderUnavailableBanner() {
    if (typeof document === 'undefined') return;
    const insert = () => {
      if (document.getElementById('pfc-auth-unavailable')) return;
      const banner = document.createElement('div');
      banner.id = 'pfc-auth-unavailable';
      banner.setAttribute('role', 'alert');
      banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;padding:12px 18px;background:#7a1f1f;color:#fff;font:500 14px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.3)';
      banner.textContent = 'Service unavailable — please refresh in a moment.';
      document.body.prepend(banner);
    };
    if (document.body) insert();
    else document.addEventListener('DOMContentLoaded', insert, { once: true });
  }

  async function _init() {
    if (!_client) { _failed = true; _ready = true; _flush(); return; }
    try {
      const { data } = await _client.auth.getSession();
      _session = data?.session ?? null;
      _userId  = _session?.user?.id ?? 'guest';

      // Stay in sync with sign-in / sign-out / token refresh
      _client.auth.onAuthStateChange((_event, session) => {
        const prev = _userId;
        _session = session;
        _userId  = session?.user?.id ?? 'guest';
        if (prev !== _userId) {
          _changeCb.forEach(fn => { try { fn(_userId, prev); } catch(_) {} });
        }
      });
    } catch (e) {
      console.warn('[PFCAuth] Could not resolve session:', e.message);
      _userId = 'guest';
    }
    _ready = true;
    _flush();
  }

  function _flush() {
    while (_readyCb.length) {
      const fn = _readyCb.shift();
      try { fn(_userId); } catch(_) {}
    }
  }

  return {
    getUserId: () => _userId,
    getSession: () => _session,
    getClient: () => _client,
    isReady: () => _ready,
    isFailed: () => _failed,
    isLoggedIn: () => _userId !== 'guest' && _session !== null,
    onReady(fn) {
      if (_ready) { try { fn(_userId); } catch(_) {} }
      else _readyCb.push(fn);
    },
    onAuthChange(fn) { _changeCb.push(fn); },
    /**
     * Redirects to auth.html if the user is not logged in.
     * Closes the auth check synchronously after init resolves.
     * Use on every Pro-gated page.
     *
     * If init failed (Supabase SDK / config didn't load — e.g. CDN flake),
     * we render an inline "service unavailable" banner instead of redirecting,
     * because auth.html itself depends on the same CDN and would loop forever.
     * (audit L3)
     */
    requireAuth() {
      this.onReady(uid => {
        if (_failed) {
          _renderUnavailableBanner();
          return;
        }
        if (uid === 'guest') {
          const here = encodeURIComponent(window.location.pathname + window.location.search);
          window.location.replace(`auth.html?next=${here}`);
        }
      });
    },
    async signOut() {
      try { if (_client) await _client.auth.signOut(); } catch(_) {}
      // Defensive: storage clear runs in pfc-storage.js via auth-change hook
      window.location.replace('auth.html');
    },
    _init,
  };
})();

PFCAuth._init();
