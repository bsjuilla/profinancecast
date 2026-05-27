/**
 * pfc-fx.js — Live foreign-exchange rates via Frankfurter (frankfurter.dev).
 *
 * Why Frankfurter:
 *   - No API key, no signup, no monthly cap.
 *   - Sourced from the European Central Bank (published weekdays ~16:00 CET).
 *   - 30+ major currencies, full history since 1999.
 *   - JSON, supports any base currency on the fly.
 *
 * The data only changes once per business day, so we cache aggressively in
 * localStorage (24h validity) — most users never hit the network.
 *
 * FULL-P1-G (audit 2026-05-27) — endpoint moved from direct browser fetch
 * to a same-origin proxy at /api/fx. Three reasons:
 *   1. CI smoke test on commit 526d778 caught a `net::ERR_FAILED` from
 *      Frankfurter/Cloudflare that the browser reported as "blocked by
 *      CORS policy" (Chrome's catch-all label for any cross-origin
 *      response without an Access-Control-Allow-Origin header — including
 *      responses that never arrived). Proxying through same-origin makes
 *      this class of 3rd-party blip invisible to the dashboard.
 *   2. Vercel CDN now absorbs identical-URL hits (s-maxage 6h, swr 24h)
 *      instead of every user hitting Frankfurter directly.
 *   3. Frankfurter outages serve stale rates via SWR rather than failing.
 *
 * Public API (unchanged — all 6 dashboard-3.js callers continue to work):
 *   PFCFx.getRate(from, to) → Promise<number>      e.g. PFCFx.getRate('USD','EUR')
 *   PFCFx.convert(amount, from, to) → Promise<number>
 *   PFCFx.getRates(base) → Promise<{[code]: rate}>  all rates against the base
 *   PFCFx.isSupported(code) → boolean              quick local check
 *   PFCFx.lastUpdated() → ISO timestamp of cache
 *
 * Loaded AFTER pfc-currency.js so we can fall back to ISO-code resolution.
 */
(function () {
  'use strict';

  // FULL-P1-G — was 'https://api.frankfurter.dev/v1/latest' (direct).
  // Now hits our own /api/fx Node serverless endpoint which proxies
  // Frankfurter with same-origin guard + rate-limit + CDN caching.
  // Response shape is pass-through (still { rates, base, date }).
  const ENDPOINT = '/api/fx';
  const CACHE_KEY_PREFIX = 'pfc_fx_v1_';
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — ECB publishes once per business day

  // Frankfurter ships these ECB-tracked currencies (~30). Anything outside this
  // list returns 404 from the API; we surface a "not supported" signal to the
  // caller so they can fall back to a static rate or skip the conversion.
  const SUPPORTED = new Set([
    'AUD','BGN','BRL','CAD','CHF','CNY','CZK','DKK','EUR','GBP','HKD','HUF',
    'IDR','ILS','INR','ISK','JPY','KRW','MXN','MYR','NOK','NZD','PHP','PLN',
    'RON','SEK','SGD','THB','TRY','USD','ZAR',
  ]);

  function _now() { return Date.now(); }

  function _cacheGet(base) {
    try {
      const raw = localStorage.getItem(CACHE_KEY_PREFIX + base);
      if (!raw) return null;
      const entry = JSON.parse(raw);
      if (!entry || !entry.fetchedAt) return null;
      if (_now() - entry.fetchedAt > CACHE_TTL_MS) return null;
      return entry;
    } catch (_) { return null; }
  }

  function _cacheSet(base, rates, apiDate) {
    try {
      localStorage.setItem(
        CACHE_KEY_PREFIX + base,
        JSON.stringify({ base: base, rates: rates, date: apiDate, fetchedAt: _now() })
      );
    } catch (_) {}
  }

  // In-memory de-dupe so concurrent callers share the same request.
  // Frankfurter returns the same payload to all parallel callers anyway,
  // but this avoids spamming the API during a render burst.
  const _inflight = {};

  async function _fetchRates(base) {
    if (_inflight[base]) return _inflight[base];
    const url = ENDPOINT + '?base=' + encodeURIComponent(base);
    const promise = fetch(url, { credentials: 'omit' })
      .then(async (res) => {
        if (!res.ok) throw new Error('pfc-fx: api/fx ' + res.status);
        const data = await res.json();
        if (!data || !data.rates) throw new Error('pfc-fx: missing rates');
        // Frankfurter doesn't include the base currency in `rates`, but
        // consumers expect rate-from-base-to-base = 1. Patch that in.
        data.rates[data.base || base] = 1;
        _cacheSet(base, data.rates, data.date || null);
        delete _inflight[base];
        return data.rates;
      })
      .catch((e) => {
        delete _inflight[base];
        throw e;
      });
    _inflight[base] = promise;
    return promise;
  }

  // ── Public API ─────────────────────────────────────────────────────────
  async function getRates(base) {
    base = (base || 'USD').toUpperCase();
    if (!SUPPORTED.has(base)) {
      // Caller asked for an unsupported base — return a single-row stub
      // (only the trivial self-conversion). Lets convert() short-circuit
      // cleanly instead of throwing on every call.
      return { [base]: 1 };
    }
    const cached = _cacheGet(base);
    if (cached && cached.rates) return cached.rates;
    return _fetchRates(base);
  }

  async function getRate(from, to) {
    from = (from || 'USD').toUpperCase();
    to   = (to   || 'USD').toUpperCase();
    if (from === to) return 1;
    // If either side is not Frankfurter-supported, signal NaN so consumers
    // can skip the conversion (e.g. a user with currency = MUR — not in the
    // ECB feed — should see their native values, not a half-converted hybrid).
    if (!SUPPORTED.has(from) || !SUPPORTED.has(to)) return NaN;
    const rates = await getRates(from);
    const r = rates[to];
    return typeof r === 'number' ? r : NaN;
  }

  async function convert(amount, from, to) {
    const n = parseFloat(amount);
    if (!isFinite(n)) return NaN;
    const r = await getRate(from, to);
    if (!isFinite(r)) return NaN;
    return n * r;
  }

  function isSupported(code) {
    return SUPPORTED.has(String(code || '').toUpperCase());
  }

  function lastUpdated(base) {
    base = (base || 'USD').toUpperCase();
    const cached = _cacheGet(base);
    return cached ? cached.date : null;
  }

  window.PFCFx = {
    getRate: getRate,
    getRates: getRates,
    convert: convert,
    isSupported: isSupported,
    lastUpdated: lastUpdated,
    SUPPORTED: SUPPORTED,
  };
})();
