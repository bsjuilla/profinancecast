/**
 * pfc-storage.js — ProFinanceCast namespaced storage
 *
 * Drop-in replacement for raw localStorage calls.
 * Namespaces every key by the authenticated Supabase user ID,
 * so two accounts on the same browser never share data.
 *
 * Requires pfc-auth.js to be loaded first.
 *
 * API — mirrors the old localStorage pattern exactly:
 *   PFCStorage.get('user')           → replaces localStorage.getItem('pfc_user')
 *   PFCStorage.set('user', data)     → replaces localStorage.setItem('pfc_user', data)
 *   PFCStorage.remove('user')        → replaces localStorage.removeItem('pfc_user')
 *   PFCStorage.getJSON('goals')      → get + JSON.parse with null fallback
 *   PFCStorage.setJSON('goals', arr) → JSON.stringify + set
 *
 * Key format:  pfc:{userId}:{key}
 * Examples:
 *   pfc:abc-123-def:user
 *   pfc:abc-123-def:goals
 *   pfc:guest:user          ← used during onboarding before login
 */

const PFCStorage = (() => {

  // All legacy keys that may exist without a namespace
  const LEGACY_KEYS = [
    'pfc_user',
    'pfc_goals',
    'pfc_debts',
    'pfc_debt_strategy',
    'pfc_recurrings',
    'pfc_scenarios',
    'pfc_nw_history',
    'pfc_report_history',
  ];

  // ── Internal helpers ──────────────────────────────────────────────────────

  function _nsKey(shortKey) {
    const uid = (typeof PFCAuth !== 'undefined') ? PFCAuth.getUserId() : 'guest';
    return `pfc:${uid}:${shortKey}`;
  }

  // Map old-style full key (e.g. 'pfc_user') to short key (e.g. 'user')
  function _toShort(legacyKey) {
    return legacyKey.replace(/^pfc_/, '');
  }

  // ── Migration: copy legacy keys into namespaced keys ─────────────────────
  // Called once per session when the user ID is resolved.
  // Safe to call multiple times — skips keys that are already migrated.

  function _migrate(userId) {
    if (!userId || userId === 'guest') return;

    let migrated = 0;
    LEGACY_KEYS.forEach(legacyKey => {
      const raw = localStorage.getItem(legacyKey);
      if (raw === null) return; // nothing to migrate

      const nsKey = `pfc:${userId}:${_toShort(legacyKey)}`;

      // Only copy if the namespaced key doesn't already exist
      // (avoids overwriting newer data with old data on re-login)
      if (localStorage.getItem(nsKey) === null) {
        localStorage.setItem(nsKey, raw);
        migrated++;
      }

      // Remove the legacy key so future reads use the namespaced version
      localStorage.removeItem(legacyKey);
    });

    if (migrated > 0) {
      console.log(`[PFCStorage] Migrated ${migrated} legacy key(s) to namespace pfc:${userId}:`);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Get a raw string value.
   * @param {string} shortKey  e.g. 'user', 'goals', 'debts'
   * @returns {string|null}
   */
  function get(shortKey) {
    return localStorage.getItem(_nsKey(shortKey));
  }

  /**
   * Set a raw string value.
   * @param {string} shortKey
   * @param {string} value
   */
  function set(shortKey, value) {
    try {
      localStorage.setItem(_nsKey(shortKey), value);
    } catch (e) {
      console.error('[PFCStorage] set failed:', e.message);
    }
  }

  /**
   * Remove a key.
   * @param {string} shortKey
   */
  function remove(shortKey) {
    localStorage.removeItem(_nsKey(shortKey));
  }

  /**
   * Get and JSON.parse a value. Returns null if missing or unparseable.
   * @param {string} shortKey
   * @returns {any|null}
   */
  function getJSON(shortKey) {
    const raw = get(shortKey);
    if (raw === null) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.warn(`[PFCStorage] getJSON('${shortKey}') parse error:`, e.message);
      return null;
    }
  }

  /**
   * JSON.stringify and set a value.
   * @param {string} shortKey
   * @param {any} value
   */
  function setJSON(shortKey, value) {
    try {
      set(shortKey, JSON.stringify(value));
    } catch (e) {
      console.error('[PFCStorage] setJSON failed:', e.message);
    }
  }

  /**
   * Clear ALL keys for the current user.
   * Used on account deletion / reset.
   */
  function clearAll() {
    const uid = (typeof PFCAuth !== 'undefined') ? PFCAuth.getUserId() : 'guest';
    const prefix = `pfc:${uid}:`;
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) toRemove.push(k);
    }
    toRemove.forEach(k => localStorage.removeItem(k));
    console.log(`[PFCStorage] Cleared ${toRemove.length} key(s) for user ${uid}`);
  }

  // ── Run migration when auth is ready ─────────────────────────────────────
  if (typeof PFCAuth !== 'undefined') {
    PFCAuth.onReady(uid => _migrate(uid));
  }

  return { get, set, remove, getJSON, setJSON, clearAll };
})();
