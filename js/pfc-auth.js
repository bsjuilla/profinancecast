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
  const _readyCb = [];
  const _changeCb = [];

  try {
    if (window.supabase && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY) {
      _client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
    } else {
      console.warn('[PFCAuth] Supabase SDK or config missing — auth features disabled.');
    }
  } catch (e) {
    console.error('[PFCAuth] Failed to init Supabase client:', e);
  }

  async function _init() {
    if (!_client) { _ready = true; _flush(); return; }
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
     */
    requireAuth() {
      this.onReady(uid => {
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
