/**
 * pfc-auth.js — ProFinanceCast shared auth module
 *
 * Provides a single Supabase client instance and auth helpers
 * used by every page. Load this before pfc-storage.js.
 *
 * Usage (in any page):
 *   const userId = PFCAuth.getUserId();   // sync after init
 *   const session = PFCAuth.getSession(); // sync after init
 */

const PFCAuth = (() => {
  // ── Config ────────────────────────────────────────────────────────────────
  const SUPABASE_URL      = 'https://hmopwxjkxqvubkifplnk.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhtb3B3eGpreHF2dWJraWZwbG5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMzAyOTMsImV4cCI6MjA5MTkwNjI5M30.wCiB9DTSa1Yxy8-3PqLS9P05rrULzcVg_kLbxVuVCUk';

  // ── Internal state ────────────────────────────────────────────────────────
  let _client  = null;
  let _session = null;
  let _userId  = 'guest'; // safe default before async init completes
  let _ready   = false;
  const _callbacks = [];

  // ── Init Supabase client ──────────────────────────────────────────────────
  try {
    if (window.supabase) {
      _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
  } catch (e) {
    console.warn('[PFCAuth] Supabase not available — running in guest mode');
  }

  // ── Resolve session on load ───────────────────────────────────────────────
  async function _init() {
    if (!_client) {
      _ready = true;
      _flush();
      return;
    }
    try {
      const { data } = await _client.auth.getSession();
      _session = data?.session ?? null;
      _userId  = _session?.user?.id ?? 'guest';
    } catch (e) {
      console.warn('[PFCAuth] Could not resolve session:', e.message);
      _userId = 'guest';
    }
    _ready = true;
    _flush();
  }

  // ── Run queued callbacks once ready ──────────────────────────────────────
  function _flush() {
    _callbacks.forEach(fn => { try { fn(_userId); } catch(e) {} });
    _callbacks.length = 0;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Returns the resolved userId synchronously.
   * Will be 'guest' if called before init completes.
   * Use onReady() to guarantee post-init execution.
   */
  function getUserId() {
    return _userId;
  }

  /**
   * Returns the current Supabase session object (may be null).
   */
  function getSession() {
    return _session;
  }

  /**
   * Returns the raw Supabase client for advanced usage.
   */
  function getClient() {
    return _client;
  }

  /**
   * Returns true if the user is authenticated (not guest).
   */
  function isLoggedIn() {
    return _userId !== 'guest' && _session !== null;
  }

  /**
   * Runs `fn(userId)` once the auth state is resolved.
   * If already resolved, runs immediately.
   */
  function onReady(fn) {
    if (_ready) {
      try { fn(_userId); } catch(e) {}
    } else {
      _callbacks.push(fn);
    }
  }

  /**
   * Redirects to auth.html if the user is not logged in.
   * Call on Pro-gated pages.
   */
  function requireAuth() {
    onReady(uid => {
      if (uid === 'guest') {
        window.location.href = 'auth.html';
      }
    });
  }

  // Start init immediately
  _init();

  return { getUserId, getSession, getClient, isLoggedIn, onReady, requireAuth };
})();
