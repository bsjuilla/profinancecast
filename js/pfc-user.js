/**
 * pfc-user.js — Central USER state module.
 *
 * Problem this solves:
 *   Prior to this module, USER state (profile + income + expenses + savings
 *   summary) lived in FIVE places that drifted apart:
 *     1. PFCStorage('user')                  encrypted, per-user namespaced
 *     2. localStorage 'pfc_cash_forecast_user'  plaintext sync mirror (cash-forecast only)
 *     3. localStorage 'pfc_user'             legacy plaintext (pre-namespace)
 *     4. PFCStorage 'pfc:guest:user'         pre-auth guest namespace
 *     5. Supabase user_metadata              for full_name + first/last name
 *   No single source of truth. Each page wrote to a subset; reads from a
 *   different subset. Whack-a-mole bugs followed (the "set up profile"
 *   flash, the cash-forecast clobber-on-refresh, currency rendered as
 *   "MUR 3,000" instead of "₨3,000", etc).
 *
 * PFCUser owns ONE in-memory canonical object. Reads return a fresh copy.
 * Writes go to ALL relevant sinks atomically (LS sync mirror immediately,
 * encrypted PFCStorage async, guest→user adoption nudged on every write).
 * Subscribers get notified on every change. Auth flips trigger a re-hydrate.
 *
 * Public API:
 *   PFCUser.get()              → object (always a copy; never null)
 *   PFCUser.update(patch)      → void; shallow-merge; persists; fires onChange
 *   PFCUser.set(obj)           → void; replaces entirely; persists; fires onChange
 *   PFCUser.onChange(fn)       → unsubscribe fn; fires after every change
 *   PFCUser.onReady(fn)        → fn(USER) once initial hydration done
 *   PFCUser.isReady()          → boolean
 *   PFCUser.isEmpty()          → heuristic — true if no meaningful numeric data
 *   PFCUser.flush()            → write any pending state synchronously (for beforeunload)
 *
 * Load order (in HTML):
 *   1. pfc-config.js
 *   2. pfc-auth.js
 *   3. pfc-crypto.js
 *   4. pfc-storage.js
 *   5. pfc-currency.js
 *   6. pfc-user.js  ← THIS FILE
 */
(function () {
  'use strict';

  // ── Storage key constants ────────────────────────────────────────────────
  const PFC_STORAGE_KEY = 'user';                       // PFCStorage short-key
  const LS_SYNC_KEY     = 'pfc_user_sync';              // primary LS mirror (sync plaintext)
  const LS_LEGACY_CF    = 'pfc_cash_forecast_user';     // cash-forecast's old canonical LS
  const LS_LEGACY_PFCU  = 'pfc_user';                   // pre-namespace legacy LS

  // Default shape — every page reads these keys, so we provide them up front
  // so consumers don't NaN on missing fields.
  const DEFAULTS = Object.freeze({
    name: '', firstName: '', lastName: '', email: '', age: '',
    currency: '$', currencyCode: 'USD', country: '',
    income: 0, otherIncome: 0,
    housing: 0, food: 0, transport: 0, otherExp: 0,
    savings: 0, investments: 0,
    debt: 0, debtPay: 0,
    customIn: [], customOut: [],
    plan: 'free',
  });

  // ── Internal state ───────────────────────────────────────────────────────
  let _user = Object.assign({}, DEFAULTS);
  let _ready = false;
  const _readyCb = [];
  const _changeCb = [];
  // Heuristic flag: did a consumer write to USER during the
  // hydration window? Used to guard against the classic "auth ready clobber".
  let _consumerWroteDuringHydration = false;

  // ── Helpers ──────────────────────────────────────────────────────────────
  function _safeParse(raw) {
    if (raw == null || raw === '') return null;
    try { return JSON.parse(raw); }
    catch (_) { return null; }
  }
  function _readLS(key) {
    try { return localStorage.getItem(key); }
    catch (_) { return null; }
  }
  function _writeLS(key, value) {
    try { localStorage.setItem(key, value); return true; }
    catch (_) { return false; }
  }
  function _hasMeaningfulData(u) {
    if (!u || typeof u !== 'object') return false;
    const numericKeys = [
      'income','otherIncome','housing','food','transport','otherExp',
      'savings','investments','debt','debtPay'
    ];
    if (numericKeys.some(k => parseFloat(u[k]) > 0)) return true;
    if (Array.isArray(u.customIn)  && u.customIn.length  > 0) return true;
    if (Array.isArray(u.customOut) && u.customOut.length > 0) return true;
    if (u.name && String(u.name).trim().length > 0) return true;
    return false;
  }
  function _normaliseCurrency(u) {
    if (!u) return u;
    if (typeof window.PFCCurrency !== 'undefined' && window.PFCCurrency.toSymbol) {
      // currency always stored as a SYMBOL ("$","₨","€") for display.
      // currencyCode kept as ISO ("USD","MUR","EUR") for dropdowns.
      if (u.currency) u.currency = window.PFCCurrency.toSymbol(u.currency);
      if (!u.currencyCode && u.currency && window.PFCCurrency.toISO) {
        u.currencyCode = window.PFCCurrency.toISO(u.currency);
      }
    }
    return u;
  }
  function _withDefaults(u) {
    const merged = Object.assign({}, DEFAULTS, u || {});
    if (!Array.isArray(merged.customIn))  merged.customIn  = [];
    if (!Array.isArray(merged.customOut)) merged.customOut = [];
    return _normaliseCurrency(merged);
  }

  // ── Source reads ─────────────────────────────────────────────────────────
  // Priority: PFCStorage (when warm) → LS_SYNC_KEY → LS_LEGACY_CF → LS_LEGACY_PFCU
  // We always merge over DEFAULTS so missing fields don't NaN.
  function _readBestAvailable() {
    let candidate = null;

    // 1. PFCStorage encrypted canonical (returns null pre-warm, that's fine)
    if (typeof window.PFCStorage !== 'undefined') {
      try {
        const parsed = window.PFCStorage.getJSON(PFC_STORAGE_KEY);
        if (parsed && typeof parsed === 'object') candidate = parsed;
      } catch (_) {}
    }

    // 2. LS sync mirror (sync plaintext — survives encrypt-window crashes)
    if (!candidate) {
      const parsed = _safeParse(_readLS(LS_SYNC_KEY));
      if (parsed && typeof parsed === 'object') candidate = parsed;
    }

    // 3. Cash-forecast legacy LS key (older mirror)
    if (!candidate) {
      const parsed = _safeParse(_readLS(LS_LEGACY_CF));
      if (parsed && typeof parsed === 'object') candidate = parsed;
    }

    // 4. Pre-namespace legacy LS key (oldest format)
    if (!candidate) {
      const parsed = _safeParse(_readLS(LS_LEGACY_PFCU));
      if (parsed && typeof parsed === 'object') candidate = parsed;
    }

    return _withDefaults(candidate);
  }

  // Augment with Supabase user_metadata as a LAST-RESORT for name/email only.
  // Numeric fields (income, expenses, etc.) are NEVER pulled from auth metadata
  // because they live in our storage. user_metadata can fill in name+email
  // when storage is empty (first page load post-signup).
  function _augmentFromAuth(u) {
    try {
      if (typeof window.PFCAuth === 'undefined' || !window.PFCAuth.getSession) return u;
      const session = window.PFCAuth.getSession();
      const sUser = session && session.user;
      if (!sUser) return u;
      if (!u.email && sUser.email) u.email = sUser.email;
      const meta = sUser.user_metadata || {};
      if (!u.name) {
        const fromMeta = (meta.full_name || meta.name ||
                          (meta.first_name && meta.last_name && (meta.first_name + ' ' + meta.last_name)) ||
                          meta.first_name || '').trim();
        if (fromMeta) u.name = fromMeta;
      }
      if (!u.firstName && meta.first_name) u.firstName = meta.first_name;
      if (!u.lastName  && meta.last_name)  u.lastName  = meta.last_name;
    } catch (_) {}
    return u;
  }

  // ── Writes ───────────────────────────────────────────────────────────────
  // Persist to ALL sinks. The LS keys are written synchronously so an
  // immediate refresh after the write doesn't lose data. PFCStorage is
  // queued async (encrypted on the writer loop).
  function _persistAll() {
    let json;
    try { json = JSON.stringify(_user); }
    catch (e) { console.error('[PFCUser] JSON stringify failed:', e); return; }

    // Sync mirrors (survive immediate refresh)
    _writeLS(LS_SYNC_KEY, json);
    // Keep the cash-forecast legacy key in sync until cash-forecast is fully
    // migrated off it. Costs nothing extra.
    _writeLS(LS_LEGACY_CF, json);

    // Async encrypted write
    if (typeof window.PFCStorage !== 'undefined') {
      try { window.PFCStorage.setJSON(PFC_STORAGE_KEY, _user); }
      catch (e) { console.warn('[PFCUser] PFCStorage write failed:', e && e.message); }
    } else {
      // No PFCStorage — write to pre-namespace legacy LS so old code can still find it.
      _writeLS(LS_LEGACY_PFCU, json);
    }

    // Nudge guest→user adoption so any data that landed in pfc:guest:user
    // during the auth-resolution window gets promoted to the right namespace.
    try {
      if (typeof window.PFCAuth !== 'undefined' && window.PFCAuth.getUserId
          && typeof window.PFCStorage !== 'undefined'
          && typeof window.PFCStorage.adoptGuestData === 'function') {
        const uid = window.PFCAuth.getUserId();
        if (uid && uid !== 'guest') window.PFCStorage.adoptGuestData(uid);
      }
    } catch (_) {}
  }

  function _fireChange() {
    const snapshot = get();
    _changeCb.forEach(fn => { try { fn(snapshot); } catch (_) {} });
  }

  // ── Public API ───────────────────────────────────────────────────────────
  function get() {
    // Always return a copy so consumers can't mutate _user behind our back
    // (mutations bypass onChange and break cross-page sync).
    return Object.assign({}, _user, {
      customIn:  Array.isArray(_user.customIn)  ? _user.customIn.slice()  : [],
      customOut: Array.isArray(_user.customOut) ? _user.customOut.slice() : [],
    });
  }

  function update(patch) {
    if (!patch || typeof patch !== 'object') return;
    if (!_ready) _consumerWroteDuringHydration = true;
    Object.assign(_user, patch);
    _user = _withDefaults(_user);
    _persistAll();
    _fireChange();
  }

  function set(obj) {
    if (!_ready) _consumerWroteDuringHydration = true;
    _user = _withDefaults(obj || {});
    _persistAll();
    _fireChange();
  }

  function onChange(fn) {
    if (typeof fn !== 'function') return function () {};
    _changeCb.push(fn);
    return function unsubscribe() {
      const i = _changeCb.indexOf(fn);
      if (i !== -1) _changeCb.splice(i, 1);
    };
  }

  function onReady(fn) {
    if (typeof fn !== 'function') return;
    if (_ready) { try { fn(get()); } catch (_) {} }
    else _readyCb.push(fn);
  }

  function isReady() { return _ready; }
  function isEmpty() { return !_hasMeaningfulData(_user); }

  function flush() {
    _persistAll();
  }

  function _flushReady() {
    while (_readyCb.length) {
      const fn = _readyCb.shift();
      try { fn(get()); } catch (_) {}
    }
  }

  // ── Hydration ────────────────────────────────────────────────────────────
  // First read on script load is synchronous — best-effort against whatever's
  // in localStorage at this instant. This is what pages get when they call
  // PFCUser.get() before PFCAuth has resolved. May come up empty if the user
  // has signed in but PFCStorage hasn't warmed yet — we'll re-hydrate as soon
  // as it does.
  _user = _readBestAvailable();
  _user = _augmentFromAuth(_user);

  // Re-hydrate when auth + storage are both ready. At that point PFCStorage
  // can decrypt the namespaced user blob and we get the canonical value.
  // CRITICAL: if a consumer wrote during the hydration window, we MERGE the
  // post-warm canonical value with the in-memory edits (consumer values win
  // on conflict, so a user typing "income = 5000" before auth resolves
  // isn't clobbered by an empty-namespace fetch).
  function _onBothReady() {
    if (_ready) return;
    const inMemoryHadEdits = _consumerWroteDuringHydration;
    const inMemorySnapshot = Object.assign({}, _user);

    let canonical = null;
    if (typeof window.PFCStorage !== 'undefined') {
      try { canonical = window.PFCStorage.getJSON(PFC_STORAGE_KEY); } catch (_) {}
    }
    canonical = _withDefaults(canonical || {});

    let merged;
    if (inMemoryHadEdits) {
      // Consumer typed values — keep them. Backfill missing fields from canonical.
      merged = Object.assign({}, canonical, inMemorySnapshot);
    } else if (_hasMeaningfulData(canonical)) {
      // No consumer edits yet — canonical wins (richest source).
      merged = canonical;
    } else if (_hasMeaningfulData(inMemorySnapshot)) {
      // No canonical data — keep whatever LS gave us.
      merged = inMemorySnapshot;
    } else {
      // Both empty — defaults, but augment from auth metadata if available.
      merged = _augmentFromAuth(_withDefaults({}));
    }

    _user = _withDefaults(_augmentFromAuth(merged));
    _ready = true;
    _flushReady();
    _fireChange();
  }

  // Wait for both PFCAuth.onReady AND PFCStorage.onReady.
  // PFCStorage wraps PFCAuth.onReady so we get a SINGLE signal that means
  // "both auth and storage have resolved" — but it's safer to wait on both
  // independently in case the wrapping changes.
  const _signals = { storage: false, auth: false };
  function _maybeReady() {
    if (_signals.storage && _signals.auth) _onBothReady();
  }
  if (typeof window.PFCStorage !== 'undefined' && typeof window.PFCStorage.onReady === 'function') {
    window.PFCStorage.onReady(() => { _signals.storage = true; _maybeReady(); });
  } else { _signals.storage = true; }
  if (typeof window.PFCAuth !== 'undefined' && typeof window.PFCAuth.onReady === 'function') {
    window.PFCAuth.onReady(() => { _signals.auth = true; _maybeReady(); });
  } else { _signals.auth = true; }
  _maybeReady();

  // Re-hydrate on sign-in / sign-out — the namespaced storage changes under
  // our feet, so the cached _user is no longer valid.
  // FULL-P0-B4 helper (audit 2026-05-26) — clears the three global LS
  // mirrors (LS_SYNC_KEY, LS_LEGACY_CF, LS_LEGACY_PFCU). Used by the
  // sign-out / user-switch path below to PREVENT cross-user data leak
  // on shared devices. Without this, User A logs out, User B logs in,
  // and during the brief window before PFCStorage warms up under User
  // B's namespace, _readBestAvailable would fall through to LS_SYNC_KEY
  // — which still contains User A's plaintext income/expenses/name. The
  // multi-user landlord-and-tenant case is the worst scenario: the
  // tenant momentarily sees the landlord's finances, or vice versa.
  function _clearGlobalLSMirrors() {
    try { window.localStorage.removeItem(LS_SYNC_KEY); } catch (_) {}
    try { window.localStorage.removeItem(LS_LEGACY_CF); } catch (_) {}
    try { window.localStorage.removeItem(LS_LEGACY_PFCU); } catch (_) {}
  }

  if (typeof window.PFCAuth !== 'undefined' && typeof window.PFCAuth.onAuthChange === 'function') {
    window.PFCAuth.onAuthChange((newUid, prevUid) => {
      // FULL-P0-B4 — clear the global LS mirrors on every real user
      // transition (sign-out OR user-switch). Specifically:
      //   • prevUid = a real user id AND newUid = guest/null  → sign-out
      //   • prevUid = userA      AND newUid = userB (different) → switch
      // Skip the clear on the initial guest→user signal (prevUid is
      // unset / 'guest' / falsy AND newUid is the first real id) — that
      // path benefits from the LS sync mirror surviving the encrypt
      // window, AND there's no other user's data to leak in.
      const isRealUidTransition = (prevUid && prevUid !== 'guest') &&
                                   prevUid !== newUid;
      if (isRealUidTransition) {
        _clearGlobalLSMirrors();
      }
      // The namespace just flipped. Re-read everything and notify consumers.
      _ready = false;
      _consumerWroteDuringHydration = false;
      _user = _readBestAvailable();
      _user = _augmentFromAuth(_user);
      // PFCStorage's onAuthChange wrapper re-warms the cache and fires its
      // own callbacks AFTER warm-up; piggyback on that so canonical data is
      // available when we publish.
      if (typeof window.PFCStorage !== 'undefined' && typeof window.PFCStorage.onReady === 'function') {
        // Brief race window: PFCStorage hasn't toggled _ready to false yet
        // (it does that inside its own onAuthChange handler). Wait one tick
        // so our onReady call lands AFTER PFCStorage's internal reset.
        setTimeout(() => {
          window.PFCStorage.onReady(() => { _onBothReady(); });
        }, 0);
      } else {
        _onBothReady();
      }
    });
  }

  // Safety net for beforeunload — if a debounced consumer write hasn't been
  // flushed, write it now before the page goes away.
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('beforeunload', () => {
      try { _persistAll(); } catch (_) {}
    });
  }

  window.PFCUser = {
    get: get,
    update: update,
    set: set,
    onChange: onChange,
    onReady: onReady,
    isReady: isReady,
    isEmpty: isEmpty,
    flush: flush,
    DEFAULTS: DEFAULTS,
  };
})();
