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

  function _persist(arr) {
    if (typeof window.PFCStorage === 'undefined') return false;
    try { window.PFCStorage.setJSON(STORAGE_KEY, arr); return true; }
    catch (e) { console.error('[PFCPortfolio] persist failed', e); return false; }
  }

  function list() {
    if (typeof window.PFCStorage === 'undefined') return [];
    try {
      const raw = window.PFCStorage.getJSON(STORAGE_KEY);
      return Array.isArray(raw) ? raw : [];
    } catch (_) { return []; }
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
      addedAt: _now(),
    };
    const all = list();
    all.push(entry);
    _persist(all);
    _fireChange();
    return entry;
  }

  function update(id, patch) {
    const all = list();
    const i = all.findIndex((h) => h.id === id);
    if (i === -1) return null;
    const next = Object.assign({}, all[i], patch || {});
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
    all[i] = next;
    _persist(all);
    _fireChange();
    return next;
  }

  function remove(id) {
    const all = list();
    const next = all.filter((h) => h.id !== id);
    if (next.length === all.length) return false;
    _persist(next);
    _fireChange();
    return true;
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
    onChange: onChange,
    getStockQuote: getStockQuote,
    getCoinQuote: getCoinQuote,
    getPortfolioValuations: getPortfolioValuations,
  };
})();
