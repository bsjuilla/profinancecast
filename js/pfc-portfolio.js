/**
 * pfc-portfolio.js — Portfolio module: stocks + crypto with live prices.
 *
 * Routes all requests through /api/quote (Twelve Data, with key) and
 * /api/coin (CoinGecko, no key) so API keys stay server-side and we
 * benefit from edge-cache de-duplication.
 *
 * Holdings shape (persisted in PFCStorage('portfolio')):
 *   [
 *     { id, type:'stock'|'crypto', symbol, name, quantity, costBasis },
 *     ...
 *   ]
 *
 * Public API:
 *   PFCPortfolio.list()          → Holding[]               read from storage
 *   PFCPortfolio.add(h)          → Holding                 returns the added entry (with generated id)
 *   PFCPortfolio.update(id, p)   → Holding | null
 *   PFCPortfolio.remove(id)      → boolean
 *   PFCPortfolio.getStockQuote(symbol) → Promise<Quote>
 *   PFCPortfolio.getCoinQuote(idOrTicker, vs) → Promise<Quote>
 *   PFCPortfolio.getPortfolioValuations() → Promise<Valuation[]>
 *     [{holding, quote, value, change24h_value, change24h_pct, error?}, ...]
 *   PFCPortfolio.onChange(fn)    → unsubscribe
 *
 * Loaded AFTER pfc-storage.js and pfc-user.js.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'portfolio';
  const QUOTE_TTL_MS = 5 * 60 * 1000;     // 5-minute in-memory cache for repeated reads in a session
  const _quoteCache = {};                  // key = "stock:AAPL" or "crypto:bitcoin:usd"
  const _inflight = {};                    // same key — de-dupes parallel callers (e.g. Refresh-click during initial load)
  const _changeCb = [];

  function _now() { return Date.now(); }
  function _newId() {
    return 'h_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }

  function _fireChange() {
    const snapshot = list();
    _changeCb.forEach((fn) => { try { fn(snapshot); } catch (_) {} });
  }

  // ─── W16-bug3 — in-memory source of truth ──────────────────────────────
  //
  // Root cause of the "TSLA added but row never appears" bug:
  // PFCStorage's _warmCache() runs async after auth resolves. It reads
  // localStorage envelopes, decrypts them, and populates the internal
  // _cache map. If PFCPortfolio.add() runs BEFORE _warmCache completes,
  // our entry goes into _cache — then _warmCache later REPLACES the
  // cache with the decrypted-from-localStorage value, wiping our entry.
  // By the time _refresh() calls list(), the cache has been overwritten.
  //
  // Fix: PFCPortfolio maintains its OWN in-memory list as the source of
  // truth WITHIN the session. PFCStorage becomes a persistence backup,
  // not the primary read path. Same pattern that already works in
  // scenarios-3.js. Any add/update/remove is reflected in _memList
  // synchronously — no race possible.
  let _memList = null;       // null = not yet loaded
  let _storageWarmedAt = 0;  // timestamp of last successful storage read

  // W17-fix — primary read path is a PLAIN localStorage key, NOT the
  // encrypted PFCStorage. Reason: PFCStorage's async PBKDF2 encryption
  // races with navigation — the encrypted write may complete after the
  // user has already moved on, but on the next page load _warmCache
  // hasn't decrypted the envelope yet, so list() returns empty.
  //
  // Positions are not PII (just public ticker symbols and quantities
  // that the user already chose to track). Storing them in plain
  // localStorage is the same risk profile as keeping a brokerage
  // statement on disk. Encrypted PFCStorage remains as a backup write
  // for users who care about the brand promise.
  //
  // _localKey is namespaced by user ID so two users on the same
  // browser can't see each other's positions.
  function _localKey() {
    const uid = (typeof PFCAuth !== 'undefined' && PFCAuth.getUserId)
      ? PFCAuth.getUserId() : 'guest';
    return 'pfc_portfolio_local:' + uid;
  }

  function _loadFromStorage() {
    // 1. Try plain localStorage (sync, no race)
    try {
      const raw = localStorage.getItem(_localKey());
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (_) {}
    // 2. Fall back to encrypted PFCStorage (may return null during warm-up)
    if (typeof window.PFCStorage !== 'undefined') {
      try {
        const raw = window.PFCStorage.getJSON(STORAGE_KEY);
        if (Array.isArray(raw)) {
          // Adopt: mirror it into plain localStorage so the next read
          // is sync and race-free.
          try { localStorage.setItem(_localKey(), JSON.stringify(raw)); } catch (_) {}
          return raw;
        }
      } catch (_) {}
    }
    return [];
  }

  function _ensureLoaded() {
    if (_memList !== null) return;
    _memList = _loadFromStorage();
    if (_memList.length > 0) _storageWarmedAt = _now();
    // W22 — migrate any pre-lot holdings to single-lot shape on first read.
    // Backwards compatible: holdings stored before W22 only have
    // {quantity, costBasis, addedAt}. Synthesize a single lot derived
    // from those fields. New writes always include lots[].
    let migrated = false;
    for (let i = 0; i < _memList.length; i++) {
      const h = _memList[i];
      if (!Array.isArray(h.lots)) {
        h.lots = [{
          id: 'lot_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4),
          qty: parseFloat(h.quantity) || 0,
          costBasis: (h.costBasis != null && Number.isFinite(parseFloat(h.costBasis))) ? parseFloat(h.costBasis) : null,
          addedAt: Number.isFinite(h.addedAt) ? h.addedAt : _now(),
        }];
        migrated = true;
      }
    }
    if (migrated) _persist(_memList);
  }

  // W22 — derive aggregate quantity + weighted-avg cost basis from lots[].
  // Called whenever a lot is added/removed/edited. Mutates the holding
  // in place. Lots without a cost basis are EXCLUDED from the weighted
  // average (user didn't record cost) but still contribute to quantity.
  function _recomputeAggregates(h) {
    if (!Array.isArray(h.lots) || h.lots.length === 0) return;
    let totalQty = 0;
    let weightedCostSum = 0, weightedQty = 0;
    for (const lot of h.lots) {
      const lq = parseFloat(lot.qty) || 0;
      totalQty += lq;
      if (lot.costBasis != null && Number.isFinite(parseFloat(lot.costBasis)) && parseFloat(lot.costBasis) > 0) {
        weightedCostSum += parseFloat(lot.costBasis) * lq;
        weightedQty += lq;
      }
    }
    h.quantity = totalQty;
    h.costBasis = weightedQty > 0 ? weightedCostSum / weightedQty : null;
  }

  // Re-poll storage on first read after a storage-warm event. If our
  // _memList is empty but storage now has data (warm cache resolved
  // after our first read), adopt the storage data.
  function _maybeRehydrate() {
    if (_memList === null) return;
    if (_memList.length > 0) return; // already have data; trust _memList
    if (_storageWarmedAt > 0) return; // already attempted
    const fromStorage = _loadFromStorage();
    if (fromStorage.length > 0) {
      _memList = fromStorage;
      _storageWarmedAt = _now();
    }
  }

  function _persist(arr) {
    // W17-fix — write to PLAIN localStorage first (sync, no race).
    // This is the path that survives navigation. Encrypted PFCStorage
    // is a backup write — if it succeeds great, if it fails (or hasn't
    // completed by the time the user navigates) the plain write is
    // already on disk.
    let plainOk = false;
    try {
      localStorage.setItem(_localKey(), JSON.stringify(arr));
      plainOk = true;
    } catch (e) {
      console.error('[PFCPortfolio] plain persist failed', e);
    }
    if (typeof window.PFCStorage !== 'undefined') {
      try { window.PFCStorage.setJSON(STORAGE_KEY, arr); }
      catch (e) { console.error('[PFCPortfolio] encrypted persist failed', e); }
    }
    return plainOk;
  }

  function list() {
    _ensureLoaded();
    _maybeRehydrate();
    return _memList.slice(); // return a copy so callers can't mutate
  }

  function add(h) {
    if (!h || !h.type || !h.symbol || !(h.quantity > 0)) return null;
    const entry = {
      id: h.id || _newId(),
      type: h.type,
      symbol: String(h.symbol).trim().toUpperCase(),
      name: h.name ? String(h.name).trim() : null,
      quantity: parseFloat(h.quantity) || 0,
      costBasis: h.costBasis != null ? parseFloat(h.costBasis) : null,
      // W16 §4 — optional user-set note + tag color for organising positions
      note: h.note ? String(h.note).slice(0, 280) : null,
      tag: h.tag ? String(h.tag).slice(0, 24) : null,
      // W16 §5 — optional recurring monthly contribution (DCA). Feeds the
      // projected-value KPI. Stored in the user's currency (assumed).
      recurringMonthly: isFinite(h.recurringMonthly) && h.recurringMonthly > 0
        ? parseFloat(h.recurringMonthly) : null,
      // W19 — optional manual price override. When set, getPortfolioValuations
      // SHORT-CIRCUITS the /api/quote fetch for this position and returns a
      // synthetic quote at this price. Lets users track employer stock,
      // real estate, private equity, collectibles — anything the public
      // market APIs can't price. Cleared when set to null or 0.
      overridePrice: isFinite(h.overridePrice) && h.overridePrice > 0
        ? parseFloat(h.overridePrice) : null,
      addedAt: _now(),
    };
    // W22 — initialise lots[] with a single lot derived from the input.
    // Subsequent buys append to lots[] via PFCPortfolio.addLot().
    entry.lots = [{
      id: 'lot_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4),
      qty: entry.quantity,
      costBasis: entry.costBasis,
      addedAt: entry.addedAt,
    }];
    _ensureLoaded();
    _memList.push(entry);
    _persist(_memList);
    _fireChange();
    return entry;
  }

  function update(id, patch) {
    _ensureLoaded();
    const i = _memList.findIndex((h) => h.id === id);
    if (i === -1) return null;
    const next = Object.assign({}, _memList[i], patch || {});
    // Re-normalise numeric fields
    if (patch && patch.quantity != null) next.quantity = parseFloat(patch.quantity) || 0;
    if (patch && patch.costBasis != null) next.costBasis = parseFloat(patch.costBasis) || null;
    if (patch && patch.symbol)  next.symbol = String(patch.symbol).trim().toUpperCase();
    if (patch && 'note' in patch) next.note = patch.note ? String(patch.note).slice(0, 280) : null;
    if (patch && 'tag'  in patch) next.tag  = patch.tag  ? String(patch.tag).slice(0, 24)   : null;
    if (patch && 'recurringMonthly' in patch) {
      next.recurringMonthly = isFinite(patch.recurringMonthly) && patch.recurringMonthly > 0
        ? parseFloat(patch.recurringMonthly) : null;
    }
    if (patch && 'overridePrice' in patch) {
      next.overridePrice = isFinite(patch.overridePrice) && patch.overridePrice > 0
        ? parseFloat(patch.overridePrice) : null;
    }
    _memList[i] = next;
    _persist(_memList);
    _fireChange();
    return next;
  }

  function remove(id) {
    _ensureLoaded();
    const before = _memList.length;
    _memList = _memList.filter((h) => h.id !== id);
    if (_memList.length === before) return false;
    _persist(_memList);
    _fireChange();
    return true;
  }

  // W22 — append a new lot (additional buy) to a holding. The aggregate
  // quantity + weighted-avg cost basis is recomputed. Returns the new
  // lot object on success, null on failure.
  function addLot(holdingId, lotPatch) {
    _ensureLoaded();
    const i = _memList.findIndex((h) => h.id === holdingId);
    if (i === -1) return null;
    const qty = parseFloat(lotPatch && lotPatch.qty);
    if (!Number.isFinite(qty) || qty <= 0) return null;
    const lot = {
      id: 'lot_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4),
      qty: qty,
      costBasis: (lotPatch && lotPatch.costBasis != null && Number.isFinite(parseFloat(lotPatch.costBasis)) && parseFloat(lotPatch.costBasis) > 0)
        ? parseFloat(lotPatch.costBasis) : null,
      addedAt: (lotPatch && Number.isFinite(lotPatch.addedAt)) ? lotPatch.addedAt : _now(),
    };
    _memList[i].lots = Array.isArray(_memList[i].lots) ? _memList[i].lots : [];
    _memList[i].lots.push(lot);
    _recomputeAggregates(_memList[i]);
    _persist(_memList);
    _fireChange();
    return lot;
  }

  // W22 — remove a lot by id. Recomputes aggregates. Returns true on
  // success. If the last lot is removed, the holding's quantity becomes
  // 0 and the aggregate cost basis becomes null.
  function removeLot(holdingId, lotId) {
    _ensureLoaded();
    const i = _memList.findIndex((h) => h.id === holdingId);
    if (i === -1) return false;
    const lots = _memList[i].lots;
    if (!Array.isArray(lots)) return false;
    const before = lots.length;
    _memList[i].lots = lots.filter((l) => l.id !== lotId);
    if (_memList[i].lots.length === before) return false;
    _recomputeAggregates(_memList[i]);
    _persist(_memList);
    _fireChange();
    return true;
  }

  // Public hook so a future page can adopt storage when auth resolves
  // late. Currently unused but available for future warm-cache events.
  function reloadFromStorage() {
    _memList = _loadFromStorage();
    _storageWarmedAt = _now();
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

  // ── Quote fetching ───────────────────────────────────────────────────────
  function _cached(key) {
    const c = _quoteCache[key];
    if (!c) return null;
    if (_now() - c.at > QUOTE_TTL_MS) return null;
    return c.value;
  }
  function _cache(key, value) {
    _quoteCache[key] = { at: _now(), value: value };
  }

  // Shared fetch + de-dupe shell. Two parallel callers asking for the same
  // symbol share one fetch — important when the Refresh button fires while
  // the initial render is still resolving. Without de-dupe we'd burn the
  // /api/quote quota twice for the same data.
  function _fetchWithInflight(key, url) {
    const hit = _cached(key);
    if (hit) return Promise.resolve(hit);
    if (_inflight[key]) return _inflight[key];
    const promise = fetch(url, { credentials: 'omit' })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const err = new Error(body.error || ('HTTP ' + res.status));
          err.code = body.code || 'HTTP_' + res.status;
          throw err;
        }
        const q = await res.json();
        _cache(key, q);
        delete _inflight[key];
        return q;
      })
      .catch((e) => { delete _inflight[key]; throw e; });
    _inflight[key] = promise;
    return promise;
  }

  async function getStockQuote(symbol) {
    if (!symbol) throw new Error('Missing symbol');
    const sym = String(symbol).trim().toUpperCase();
    return _fetchWithInflight('stock:' + sym,
      '/api/quote?symbol=' + encodeURIComponent(sym));
  }

  // W21 — historical bars for a symbol. Returns { symbol, currency,
  // interval, bars: [{date, close}] } with bars oldest-first.
  // Throws on API errors; callers should fall back to back-projection.
  async function getHistory(symbol, interval, outputsize) {
    if (!symbol) throw new Error('Missing symbol');
    const sym = String(symbol).trim().toUpperCase();
    const iv = interval || '1month';
    const sz = outputsize || 60;
    const key = 'history:' + sym + ':' + iv + ':' + sz;
    return _fetchWithInflight(
      key,
      '/api/history?symbol=' + encodeURIComponent(sym)
        + '&interval=' + encodeURIComponent(iv)
        + '&outputsize=' + sz
    );
  }

  async function getCoinQuote(idOrTicker, vs) {
    if (!idOrTicker) throw new Error('Missing coin id');
    const id = String(idOrTicker).trim();
    const vsCurrency = (vs || 'usd').toLowerCase();
    return _fetchWithInflight(
      'crypto:' + id.toLowerCase() + ':' + vsCurrency,
      '/api/coin?id=' + encodeURIComponent(id) + '&vs=' + encodeURIComponent(vsCurrency)
    );
  }

  // Fetch every holding's current valuation. Resolves to an array with
  // one entry per holding; errors are attached per-holding instead of
  // failing the whole call (so one bad ticker doesn't blank the page).
  async function getPortfolioValuations(vs) {
    const holdings = list();
    const vsCur = (vs || 'usd').toLowerCase();
    const tasks = holdings.map(async (h) => {
      // W19 — manual override short-circuit. When overridePrice is set,
      // skip the API entirely and synthesise a quote at that price. Lets
      // users track positions the public market APIs can't price (real
      // estate, employer stock, private equity, collectibles). 24h change
      // is null for these since we have no time-series for them.
      if (Number.isFinite(h.overridePrice) && h.overridePrice > 0) {
        const price = h.overridePrice;
        const value = price * (h.quantity || 0);
        return {
          holding: h,
          quote: { symbol: h.symbol, name: h.name || h.symbol, price: price, source: 'manual' },
          value,
          change24h_pct: null,
          change24h_value: null,
          error: null,
        };
      }
      try {
        const quote = h.type === 'crypto'
          ? await getCoinQuote(h.symbol, vsCur)
          : await getStockQuote(h.symbol);
        const price = parseFloat(quote.price);
        const value = isFinite(price) ? price * (h.quantity || 0) : null;
        const pct = h.type === 'crypto'
          ? parseFloat(quote.change_pct_24h)
          : parseFloat(quote.change_pct);
        const change24h_value = (isFinite(value) && isFinite(pct))
          ? value * (pct / 100)
          : null;
        return {
          holding: h, quote, value,
          change24h_pct: isFinite(pct) ? pct : null,
          change24h_value,
          error: null,
        };
      } catch (e) {
        return {
          holding: h, quote: null, value: null,
          change24h_pct: null, change24h_value: null,
          error: { message: e.message || 'fetch failed', code: e.code || 'UNKNOWN' },
        };
      }
    });
    return Promise.all(tasks);
  }

  window.PFCPortfolio = {
    list: list,
    add: add,
    update: update,
    remove: remove,
    addLot: addLot,
    removeLot: removeLot,
    reloadFromStorage: reloadFromStorage,
    onChange: onChange,
    getStockQuote: getStockQuote,
    getCoinQuote: getCoinQuote,
    getHistory: getHistory,
    getPortfolioValuations: getPortfolioValuations,
  };
})();
