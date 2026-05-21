/**
 * pfc-macro.js — Macro-data client module backed by /api/macro (FRED).
 *
 * One headline call:
 *   PFCMacro.get() → Promise<{
 *     fedFunds:    {value, date, series},
 *     mortgage30y: {value, date, series},
 *     treasury10y: {value, date, series},
 *     cpiYoY:      {value, date, series, method},
 *     asOf, source, errors
 *   }>
 *
 * Other helpers:
 *   PFCMacro.lastUpdated() → ISO string from cache (for "as of" labels)
 *   PFCMacro.realYield(savingsRatePct) → number | null
 *     savings rate % - cpiYoY %. Negative = losing real purchasing power.
 *
 * Cache: 24h in localStorage. FRED publishes most series daily-or-slower
 * and our /api/macro Edge function already 6h-caches at the CDN, so this
 * is just a third tier of belt-and-braces caching.
 */
(function () {
  'use strict';

  const CACHE_KEY = 'pfc_macro_v1';
  const TTL_MS = 24 * 60 * 60 * 1000;
  let _inflight = null;

  function _now() { return Date.now(); }

  function _cacheGet() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const entry = JSON.parse(raw);
      if (!entry || !entry.data || !entry.fetchedAt) return null;
      if (_now() - entry.fetchedAt > TTL_MS) return null;
      return entry;
    } catch (_) { return null; }
  }

  function _cacheSet(data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ data: data, fetchedAt: _now() }));
    } catch (_) {}
  }

  async function get() {
    const cached = _cacheGet();
    if (cached) return cached.data;
    if (_inflight) return _inflight;
    _inflight = fetch('/api/macro', { credentials: 'omit' })
      .then(async (res) => {
        if (!res.ok) throw new Error('macro_http_' + res.status);
        const data = await res.json();
        _cacheSet(data);
        _inflight = null;
        return data;
      })
      .catch((e) => { _inflight = null; throw e; });
    return _inflight;
  }

  function lastUpdated() {
    const cached = _cacheGet();
    return cached && cached.data ? cached.data.asOf : null;
  }

  function realYield(savingsRatePct) {
    const cached = _cacheGet();
    const cpi = cached && cached.data && cached.data.cpiYoY && cached.data.cpiYoY.value;
    if (typeof savingsRatePct !== 'number' || !isFinite(cpi)) return null;
    return Math.round((savingsRatePct - cpi) * 100) / 100;
  }

  window.PFCMacro = {
    get: get,
    lastUpdated: lastUpdated,
    realYield: realYield,
  };
})();
