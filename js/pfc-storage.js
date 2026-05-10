/**
 * pfc-storage.js — Per-user namespaced localStorage.
 *
 * Key format:  pfc:{userId}:{shortKey}
 * Guest format: pfc:guest:{shortKey}  (used pre-login during onboarding)
 *
 * Public API:
 *   PFCStorage.get('user')              → string|null
 *   PFCStorage.set('user', value)       → void
 *   PFCStorage.remove('user')           → void
 *   PFCStorage.getJSON('goals')         → any|null
 *   PFCStorage.setJSON('goals', value)  → void
 *   PFCStorage.clearAll()               → clears every key for the current user
 *   PFCStorage.adoptGuestData(uid)      → moves pfc:guest:* into pfc:{uid}:* on first login
 */
const PFCStorage = (() => {
  // Legacy unprefixed keys to migrate on first run after the namespacing rollout
  const LEGACY_KEYS = [
    'pfc_user', 'pfc_goals', 'pfc_debts', 'pfc_debt_strategy',
    'pfc_recurrings', 'pfc_scenarios', 'pfc_nw_history', 'pfc_report_history',
  ];

  function _uid() {
    return (typeof PFCAuth !== 'undefined') ? PFCAuth.getUserId() : 'guest';
  }
  function _nsKey(shortKey) { return `pfc:${_uid()}:${shortKey}`; }
  function _toShort(legacyKey) { return legacyKey.replace(/^pfc_/, ''); }

  // ── Migration: legacy unprefixed → namespaced ────────────────────────────
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

  // ── Adoption: guest → real user on first login ───────────────────────────
  // Mirrors the migration but for keys already namespaced under "guest".
  // Runs idempotently each time the user changes from guest → real uid.
  function adoptGuestData(userId) {
    if (!userId || userId === 'guest') return;
    const guestPrefix = 'pfc:guest:';
    const userPrefix  = `pfc:${userId}:`;
    const toMove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(guestPrefix)) toMove.push(k);
    }
    let adopted = 0;
    toMove.forEach(guestKey => {
      const tail = guestKey.substring(guestPrefix.length);
      const userKey = userPrefix + tail;
      const guestVal = localStorage.getItem(guestKey);
      // Don't overwrite real-user data with stale guest data.
      // Only delete the guest copy when adoption SUCCEEDS — otherwise the
      // unconditional removeItem silently destroyed fresh guest data whenever
      // a stale userKey already existed, which is the dashboard data-loss path.
      if (localStorage.getItem(userKey) === null && guestVal !== null) {
        localStorage.setItem(userKey, guestVal);
        localStorage.removeItem(guestKey);
        adopted++;
      }
    });
    if (adopted > 0) console.log(`[PFCStorage] Adopted ${adopted} guest key(s) → pfc:${userId}:*`);
  }

  // ── Public API ────────────────────────────────────────────────────────────
  function get(shortKey) { return localStorage.getItem(_nsKey(shortKey)); }
  function set(shortKey, value) {
    try { localStorage.setItem(_nsKey(shortKey), value); }
    catch (e) { console.error('[PFCStorage] set failed:', e.message); }
  }
  function remove(shortKey) { localStorage.removeItem(_nsKey(shortKey)); }
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
      if (k && k.startsWith(prefix)) toRemove.push(k);
    }
    toRemove.forEach(k => localStorage.removeItem(k));
    console.log(`[PFCStorage] Cleared ${toRemove.length} key(s) for ${_uid()}`);
  }

  // ── Wire to auth lifecycle ────────────────────────────────────────────────
  if (typeof PFCAuth !== 'undefined') {
    PFCAuth.onReady(uid => {
      _migrateLegacy(uid);
      adoptGuestData(uid);
    });
    // On sign-in (guest → real user), adopt any data captured during onboarding
    PFCAuth.onAuthChange((newUid, prevUid) => {
      if (prevUid === 'guest' && newUid !== 'guest') adoptGuestData(newUid);
    });
  }

  return { get, set, remove, getJSON, setJSON, clearAll, adoptGuestData };
})();
