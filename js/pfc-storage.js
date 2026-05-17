/**
 * pfc-storage.js — Per-user namespaced localStorage with AES-256-GCM at rest.
 *
 * Key format:  pfc:{userId}:{shortKey}
 * Guest format: pfc:guest:{shortKey}  (used pre-login during onboarding)
 *
 * Public API (unchanged signatures — still SYNCHRONOUS):
 *   PFCStorage.get('user')              → string|null
 *   PFCStorage.set('user', value)       → void
 *   PFCStorage.remove('user')           → void
 *   PFCStorage.getJSON('goals')         → any|null
 *   PFCStorage.setJSON('goals', value)  → void
 *   PFCStorage.clearAll()               → clears every key for the current user
 *   PFCStorage.adoptGuestData(uid)      → moves pfc:guest:* into pfc:{uid}:*
 *
 * New:
 *   PFCStorage.isReady()                → boolean
 *   PFCStorage.onReady(fn)              → invoked once cache is warm
 *
 * ───────────────────────── Encryption design ─────────────────────────────
 * Backs the marketing claim "AES-256 encrypted, never leaves your device
 * unencrypted." See js/pfc-crypto.js for envelope format and KDF params.
 *
 * Web Crypto is async, but 80+ existing call sites are synchronous. To
 * preserve the contract without rewriting every caller, this module keeps
 * an in-memory plaintext cache:
 *
 *   • Reads return immediately from the cache.
 *   • Writes update the cache synchronously AND queue an async
 *     encrypt-and-persist into localStorage.
 *   • On script load, a warm-up pass decrypts every "pfc:{uid}:*" key
 *     under the current namespace and seeds the cache.
 *   • Until warm-up completes, reads return null. To prevent pages from
 *     rendering with the wrong (empty) state, we INTERCEPT PFCAuth.onReady
 *     and PFCAuth.onAuthChange so registered callbacks only fire AFTER
 *     storage is also warm. Existing pages already use those hooks for
 *     "re-hydrate after auth resolves", so the migration is transparent.
 *
 * Legacy migration: any "pfc:{uid}:*" value that's NOT in envelope format
 * is treated as legacy plaintext, re-encrypted, and written back. A single
 * console.info logs the event.
 */
const PFCStorage = (() => {
  // Legacy unprefixed keys to migrate on first run after the namespacing rollout
  const LEGACY_KEYS = [
    'pfc_user', 'pfc_goals', 'pfc_debts', 'pfc_debt_strategy',
    'pfc_recurrings', 'pfc_scenarios', 'pfc_nw_history', 'pfc_report_history',
  ];

  // Keys to skip when warming/encrypting — these are infra, not user data.
  // pfc:guest:_k holds the guest-mode encryption seed (a random byte string,
  // not financial data) and MUST remain plaintext for crypto bootstrap.
  const SKIP_KEYS = new Set(['pfc:guest:_k']);

  // ── In-memory plaintext cache ─────────────────────────────────────────────
  // Key: full namespaced key (e.g. "pfc:abc-123:user"). Value: plaintext string.
  const _cache = new Map();
  let _ready = false;
  const _readyCb = [];
  let _migratedLegacyOnce = false; // console.info gate

  // ── Pending-write queue (serialises encrypt operations per key) ──────────
  // For each namespaced key, we keep a "latest plaintext" pointer AND the
  // uid that was active at write time. The writer loop encrypts with the
  // matching uid's secret, so a write queued just before sign-in still
  // lands in the old (guest) namespace under the old key. If a newer write
  // lands before the encrypt completes, the loop encrypts the newer value
  // next round.
  const _pending = new Map(); // nsKey -> { uid, plaintext|null }
  let _writerRunning = false;

  function _hasCrypto() {
    return typeof window !== 'undefined'
      && window.PFCCrypto
      && typeof window.PFCCrypto.encrypt === 'function'
      && window.PFCCrypto.isAvailable();
  }

  function _uid() {
    return (typeof PFCAuth !== 'undefined') ? PFCAuth.getUserId() : 'guest';
  }
  function _nsKey(shortKey) { return `pfc:${_uid()}:${shortKey}`; }
  function _toShort(legacyKey) { return legacyKey.replace(/^pfc_/, ''); }

  // ── Legacy unprefixed → namespaced migration ─────────────────────────────
  function _migrateLegacy(userId) {
    if (!userId || userId === 'guest') return;
    let migrated = 0;
    LEGACY_KEYS.forEach(legacyKey => {
      const raw = localStorage.getItem(legacyKey);
      if (raw === null) return;
      const nsKey = `pfc:${userId}:${_toShort(legacyKey)}`;
      // Only adopt legacy data when nothing newer already exists
      if (localStorage.getItem(nsKey) === null) {
        localStorage.setItem(nsKey, raw);
        migrated++;
      }
      localStorage.removeItem(legacyKey);
    });
    if (migrated > 0) console.log(`[PFCStorage] Migrated ${migrated} legacy key(s) → pfc:${userId}:*`);
  }

  // ── Guest → real-user adoption on first login ────────────────────────────
  // We move CIPHERTEXT, not plaintext, but the two namespaces are encrypted
  // with different secrets, so we have to decrypt-with-guest-secret then
  // re-encrypt-with-user-secret. If decrypt fails (corrupted, or key drift),
  // we skip rather than destroy data.
  async function _adoptGuestDataAsync(userId) {
    if (!userId || userId === 'guest') return;
    if (!_hasCrypto()) return;
    const guestPrefix = 'pfc:guest:';
    const userPrefix  = `pfc:${userId}:`;

    // Snapshot keys first (localStorage iteration is unstable under mutation)
    const guestKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(guestPrefix) && !SKIP_KEYS.has(k)) guestKeys.push(k);
    }
    if (guestKeys.length === 0) return;

    // Derive both secrets. For the guest secret we override the session check
    // by reading the guest seed directly — at the moment of adoption, PFCAuth
    // already reports the new user, so deriveSecret() would return the user
    // secret. We need both.
    const userSecret  = await _deriveSecretForUser(userId);
    const guestSecret = _deriveGuestSecret();

    let adopted = 0;
    for (const guestKey of guestKeys) {
      const tail = guestKey.substring(guestPrefix.length);
      const userKey = userPrefix + tail;
      // Don't overwrite real-user data with stale guest data.
      if (localStorage.getItem(userKey) !== null) continue;

      const guestVal = localStorage.getItem(guestKey);
      if (guestVal === null) continue;

      let plaintext = null;
      try {
        if (window.PFCCrypto.isEnvelope(guestVal)) {
          plaintext = await window.PFCCrypto.decrypt(guestVal, guestSecret);
        } else {
          // Legacy plaintext value still sitting in guest namespace
          plaintext = guestVal;
        }
      } catch (e) {
        console.warn(`[PFCStorage] could not decrypt guest key '${guestKey}' during adoption:`, e.message);
        continue;
      }

      try {
        const reEnc = await window.PFCCrypto.encrypt(plaintext, userSecret);
        localStorage.setItem(userKey, reEnc);
        _cache.set(userKey, plaintext);
        localStorage.removeItem(guestKey);
        adopted++;
      } catch (e) {
        console.warn(`[PFCStorage] re-encryption failed for '${guestKey}':`, e.message);
      }
    }
    if (adopted > 0) console.log(`[PFCStorage] Adopted ${adopted} guest key(s) → pfc:${userId}:*`);
  }

  // Public sync wrapper that fires the async adoption and returns immediately.
  // Existing callers don't await this.
  function adoptGuestData(userId) {
    _adoptGuestDataAsync(userId).catch(e => {
      console.warn('[PFCStorage] adoptGuestData failed:', e && e.message);
    });
  }

  // ── Secret derivation helpers ───────────────────────────────────────────
  // We can't call PFCCrypto.deriveSecret() during adoption because that
  // reads the CURRENT PFCAuth state, which may have already flipped to the
  // new user. So we have two helpers that take a uid explicitly.
  // Synchronous guest-seed access. Mirrors PFCCrypto._ensureGuestSecret so
  // that adoption (which needs the seed before PFCCrypto has a chance to
  // run its own derivation) sees the same value PFCCrypto would write.
  function _deriveGuestSecret() {
    let v = null;
    try { v = localStorage.getItem('pfc:guest:_k'); } catch (_) {}
    if (!v || v.length < 32) {
      try {
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        v = btoa(bin);
        localStorage.setItem('pfc:guest:_k', v);
      } catch (_) {
        // localStorage blocked — fall back to a per-call ephemeral value.
        // Without persistence the user has no encrypted data to recover
        // anyway, so this only affects in-session reads.
        v = 'ephemeral-' + Math.random();
      }
    }
    return 'pfc-v1|guest|' + v;
  }

  async function _deriveSecretForUser(uid) {
    // When uid matches the current session, prefer the live derivation
    // (which uses the stable user-id + created-at pair).
    try {
      if (typeof PFCAuth !== 'undefined' && PFCAuth.getSession) {
        const session = PFCAuth.getSession();
        if (session && session.user && session.user.id === uid && session.user.created_at) {
          return 'pfc-v1|' + uid + '|' + session.user.created_at;
        }
      }
    } catch (_) {}
    // Fallback: at minimum we need a stable per-user secret. Without
    // created_at we can't reproduce the canonical secret, so refuse to
    // guess — caller should retry once PFCAuth.getSession() returns the
    // matching user.
    throw new Error('cannot derive user secret without an active matching session');
  }

  // ── Cache warm-up ────────────────────────────────────────────────────────
  // For the current uid, read every "pfc:{uid}:*" key, decrypt, and seed
  // the cache. Legacy unencrypted JSON values are migrated in-place.
  async function _warmCache() {
    if (!_hasCrypto()) {
      // No crypto support → cache stays empty, reads return null. Page
      // can still function with empty state; the marketing claim becomes
      // a no-op for that one user, which is the safest failure mode.
      _ready = true;
      _flushReady();
      return;
    }

    const uid = _uid();
    const prefix = `pfc:${uid}:`;
    // PFCCrypto.deriveSecret() consults PFCAuth — safe here because we're
    // called from PFCAuth.onReady, which means PFCAuth has resolved.
    let secret;
    try {
      secret = await window.PFCCrypto.deriveSecret();
    } catch (e) {
      console.error('[PFCStorage] secret derivation failed:', e.message);
      _ready = true;
      _flushReady();
      return;
    }

    // Snapshot keys first (localStorage iteration is unstable under mutation)
    const nsKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix) && !SKIP_KEYS.has(k)) nsKeys.push(k);
    }

    let migratedCount = 0;
    for (const k of nsKeys) {
      const raw = localStorage.getItem(k);
      if (raw === null) continue;
      if (window.PFCCrypto.isEnvelope(raw)) {
        try {
          const pt = await window.PFCCrypto.decrypt(raw, secret);
          _cache.set(k, pt);
        } catch (e) {
          // Likely a key drift (e.g. user signed in with a different account
          // under the same uid namespace, which shouldn't happen, or a corrupted
          // entry). Surface but don't delete — let the user recover manually.
          console.warn(`[PFCStorage] decrypt failed for '${k}':`, e.message);
        }
      } else {
        // Legacy plaintext (likely JSON). Treat as plaintext and re-encrypt.
        _cache.set(k, raw);
        try {
          const env = await window.PFCCrypto.encrypt(raw, secret);
          localStorage.setItem(k, env);
          migratedCount++;
        } catch (e) {
          console.warn(`[PFCStorage] migration encrypt failed for '${k}':`, e.message);
        }
      }
    }

    if (migratedCount > 0 && !_migratedLegacyOnce) {
      _migratedLegacyOnce = true;
      console.info('[PFC] migrating legacy storage to encrypted format');
    }

    _ready = true;
    _flushReady();
  }

  function _flushReady() {
    while (_readyCb.length) {
      const fn = _readyCb.shift();
      try { fn(_uid()); } catch (_) {}
    }
  }

  // ── Async writer loop ────────────────────────────────────────────────────
  // Drains _pending one entry at a time, encrypting the latest plaintext
  // and writing it to localStorage. This serialises crypto ops (Web Crypto
  // is fast but parallel encrypt() calls add no value here) and ensures
  // the on-disk ciphertext eventually matches the in-memory plaintext.
  async function _runWriter() {
    if (_writerRunning) return;
    _writerRunning = true;
    try {
      while (_pending.size > 0) {
        // Grab one entry
        const it = _pending.entries().next();
        if (it.done) break;
        const [nsKey, entry] = it.value;
        _pending.delete(nsKey);
        const { uid: writeUid, plaintext } = entry;

        if (plaintext === null) {
          try { localStorage.removeItem(nsKey); }
          catch (e) { console.error('[PFCStorage] remove failed:', e.message); }
          continue;
        }

        if (!_hasCrypto()) {
          // No crypto → degrade to plaintext write so the app keeps working
          // (the marketing claim isn't honoured for this browser, but we
          // surfaced that loudly in PFCCrypto's self-test).
          try { localStorage.setItem(nsKey, plaintext); }
          catch (e) { console.error('[PFCStorage] set failed:', e.message); }
          continue;
        }

        try {
          // Resolve the secret matching the uid that was active at queue time.
          // This protects writes that were queued just before sign-in from
          // being encrypted under the WRONG (newly-signed-in) user's key.
          const secret = await _secretForWriteUid(writeUid);
          const env = await window.PFCCrypto.encrypt(plaintext, secret);
          localStorage.setItem(nsKey, env);
        } catch (e) {
          console.error('[PFCStorage] encrypt-and-persist failed for', nsKey, ':', e.message);
        }
      }
    } finally {
      _writerRunning = false;
    }
  }

  // Resolve the encryption secret for a given write's uid (recorded at queue
  // time). For 'guest' we use the guest seed; for a real uid we expect the
  // session to still match — otherwise we fall back to PFCCrypto.deriveSecret().
  async function _secretForWriteUid(writeUid) {
    if (writeUid === 'guest') {
      return _deriveGuestSecret();
    }
    try {
      return await _deriveSecretForUser(writeUid);
    } catch (_) {
      // The session no longer matches the write uid (rare: user signed out
      // between set() and the writer running). Fall back to the live
      // derivation so the write still persists somewhere readable.
      return await window.PFCCrypto.deriveSecret();
    }
  }

  function _queueWrite(nsKey, plaintextOrNull) {
    _pending.set(nsKey, { uid: _uid(), plaintext: plaintextOrNull });
    _runWriter();
  }

  // ── Public API ───────────────────────────────────────────────────────────
  function get(shortKey) {
    const k = _nsKey(shortKey);
    if (_cache.has(k)) return _cache.get(k);
    // Cache miss BEFORE warm-up: try to read & detect plaintext fallback.
    // If localStorage has a non-envelope value, return it directly so that
    // the very first synchronous render after page load still sees legacy
    // unencrypted data even if PFCAuth.onReady hasn't fired yet.
    const raw = localStorage.getItem(k);
    if (raw === null) return null;
    if (_hasCrypto() && window.PFCCrypto.isEnvelope(raw)) {
      // Encrypted, but cache not yet warm. Can't decrypt sync.
      return null;
    }
    // Legacy plaintext — seed cache so subsequent reads are consistent.
    _cache.set(k, raw);
    return raw;
  }

  function set(shortKey, value) {
    if (typeof value !== 'string') {
      // Match historical behaviour: setItem coerces, but our consumers
      // generally hand us a string. Coerce defensively.
      try { value = String(value); } catch (_) { return; }
    }
    const k = _nsKey(shortKey);
    _cache.set(k, value);
    _queueWrite(k, value);
  }

  function remove(shortKey) {
    const k = _nsKey(shortKey);
    _cache.delete(k);
    _queueWrite(k, null);
  }

  function getJSON(shortKey) {
    const raw = get(shortKey);
    if (raw === null) return null;
    try { return JSON.parse(raw); }
    catch (e) {
      console.warn(`[PFCStorage] getJSON('${shortKey}') parse error:`, e.message);
      return null;
    }
  }

  function setJSON(shortKey, value) {
    try { set(shortKey, JSON.stringify(value)); }
    catch (e) { console.error('[PFCStorage] setJSON failed:', e.message); }
  }

  /**
   * Clear ALL keys for the current user.
   * Bug-fix: collect first, delete after — `localStorage.length` shrinks during
   * iteration so the original code skipped half the keys.
   */
  function clearAll() {
    const prefix = `pfc:${_uid()}:`;
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix) && !SKIP_KEYS.has(k)) toRemove.push(k);
    }
    toRemove.forEach(k => {
      _cache.delete(k);
      _pending.delete(k);
      localStorage.removeItem(k);
    });
    console.log(`[PFCStorage] Cleared ${toRemove.length} key(s) for ${_uid()}`);
  }

  function isReady() { return _ready; }
  function onReady(fn) {
    if (_ready) { try { fn(_uid()); } catch (_) {} }
    else _readyCb.push(fn);
  }

  // ── Wire to auth lifecycle ───────────────────────────────────────────────
  // We intercept PFCAuth.onReady / onAuthChange so that ALL page-level
  // callbacks fire only after BOTH auth ready AND storage warm. Existing
  // pages rely on PFCAuth.onReady to "re-hydrate after auth resolves";
  // without this gating they'd re-render with an empty cache and clobber
  // the UI before decryption finishes.
  //
  // CRITICAL: we wire ONE internal handler to the underlying PFCAuth
  // events and fan out to page-level callbacks ourselves. Wiring N
  // independent handlers (one per consumer) would race the warm-up.
  const _changeCb = [];
  if (typeof PFCAuth !== 'undefined') {
    const _origOnReady = PFCAuth.onReady.bind(PFCAuth);
    const _origOnAuthChange = PFCAuth.onAuthChange.bind(PFCAuth);

    PFCAuth.onReady = function (fn) {
      // Defer the consumer callback until storage is warm.
      onReady(uid => { try { fn(uid); } catch (_) {} });
    };

    PFCAuth.onAuthChange = function (fn) {
      _changeCb.push(fn);
    };

    // Single internal subscriber. When auth flips, drain pending writes
    // under the OLD uid before clearing the cache, then run adoption +
    // warm-up under the NEW uid, then fan out to consumers.
    _origOnAuthChange(async (newUid, prevUid) => {
      try {
        // Flush any in-flight writes BEFORE we mutate uid-derived state.
        // The writer loop will use the queued entry's recorded uid, so
        // even after PFCAuth has flipped, the queued writes go to the
        // right namespace under the right key.
        await _drainWriter();
      } catch (_) {}

      _ready = false;
      _cache.clear();

      try {
        if (prevUid === 'guest' && newUid !== 'guest') {
          await _adoptGuestDataAsync(newUid);
        }
      } catch (e) {
        console.warn('[PFCStorage] adopt during auth change failed:', e && e.message);
      }
      await _warmCache();
      // Fan out to consumer onAuthChange callbacks AFTER warm-up.
      _changeCb.forEach(fn => { try { fn(newUid, prevUid); } catch (_) {} });
    });

    // Initial boot: when auth resolves, run legacy migration + guest
    // adoption + cache warm-up, then flush deferred onReady callbacks.
    _origOnReady(async (uid) => {
      _migrateLegacy(uid);
      try {
        if (uid !== 'guest') await _adoptGuestDataAsync(uid);
      } catch (e) {
        console.warn('[PFCStorage] adopt on boot failed:', e && e.message);
      }
      await _warmCache();
    });
  } else {
    // No PFCAuth on this page (e.g. about.html) — warm up under 'guest'
    // immediately.
    _warmCache();
  }

  // Await any in-flight writer to drain. We can't easily await the loop
  // itself, so we busy-poll a microtask-based deferred.
  async function _drainWriter() {
    // If nothing is queued and the writer isn't active, return immediately.
    while (_writerRunning || _pending.size > 0) {
      await new Promise(r => setTimeout(r, 0));
    }
  }

  return {
    get, set, remove, getJSON, setJSON, clearAll, adoptGuestData,
    isReady, onReady,
  };
})();
