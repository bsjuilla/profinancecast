/**
 * pfc-portfolio-idb.js — minimal IndexedDB persistence for portfolio.
 *
 * W23. The research agent (W18-bug2 session) noted that production
 * portfolio apps use IndexedDB for client-side persistence because:
 *   - Larger quota (~50MB+ vs localStorage's ~5MB)
 *   - Async transactional writes (eliminates the warm-cache race that
 *     plagued PFCStorage in W18)
 *   - Survives "clear cookies" in some browsers where localStorage doesn't
 *
 * This module is intentionally minimal — no Dexie dependency, no schema
 * migrations, no indexed columns. We treat IDB as a key-value store
 * where the key is the user ID and the value is the full holdings array.
 * Same atomic-write semantics as localStorage but with bigger quota and
 * better durability guarantees.
 *
 * Architecture in PFCPortfolio (see pfc-portfolio.js):
 *   - In-memory _memList is the sync source of truth WITHIN a session
 *   - localStorage is the fast sync backup (survives reload)
 *   - IDB is the durable async backup (survives more clear-data events)
 *   - On boot: try localStorage first (sync), then async-load from IDB
 *     and merge if IDB has data localStorage doesn't (stale-while-revalidate)
 *   - On every write: write to all three (memory, localStorage, IDB)
 *
 * If IDB is unavailable (older browser, blocked, quota exceeded), this
 * module reports `available: false` and PFCPortfolio falls back to the
 * existing localStorage-only path. No user-visible regression.
 */
(function () {
  'use strict';

  const DB_NAME = 'pfc_portfolio';
  const DB_VERSION = 1;
  const STORE_NAME = 'holdings';

  let _dbPromise = null;

  function _uid() {
    return (typeof PFCAuth !== 'undefined' && PFCAuth.getUserId)
      ? PFCAuth.getUserId() : 'guest';
  }

  function _openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB not available in this browser'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          // Single object store, keyPath=userId. Each entry is the user's
          // entire holdings list under a single key. Atomic per-write.
          db.createObjectStore(STORE_NAME, { keyPath: 'userId' });
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error || new Error('IDB open failed'));
      req.onblocked = () => {
        console.warn('[pfc-idb] open blocked — another tab has DB open with older version');
      };
    });
    return _dbPromise;
  }

  async function list() {
    try {
      const db = await _openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_NAME], 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(_uid());
        req.onsuccess = () => {
          const result = req.result;
          resolve(result && Array.isArray(result.holdings) ? result.holdings : []);
        };
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('[pfc-idb] list failed:', e.message);
      return [];
    }
  }

  async function save(holdings) {
    if (!Array.isArray(holdings)) return false;
    try {
      const db = await _openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put({
          userId: _uid(),
          holdings: holdings,
          updatedAt: Date.now(),
        });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error || new Error('IDB write failed'));
        tx.onabort = () => reject(tx.error || new Error('IDB write aborted'));
      });
    } catch (e) {
      console.warn('[pfc-idb] save failed:', e.message);
      return false;
    }
  }

  async function clear() {
    try {
      const db = await _openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(_uid());
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('[pfc-idb] clear failed:', e.message);
      return false;
    }
  }

  window.PFCPortfolioIDB = {
    list: list,
    save: save,
    clear: clear,
    available: !!window.indexedDB,
  };
})();
