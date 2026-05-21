/**
 * pfc-holidays.js — Public-holiday awareness via Nager.Date (date.nager.at).
 *
 * Why Nager.Date:
 *   - No API key, no rate limit, no signup.
 *   - 100+ countries, all 2026 data already loaded.
 *   - Open-source dataset; types are tagged (Public / Bank / Observance) so
 *     we can distinguish a bank-closed day (matters for cash forecasts)
 *     from a religious observance (doesn't move money).
 *
 * Holidays don't change once published, so we cache permanently in
 * localStorage keyed by (year, countryCode). One fetch per country per year.
 *
 * Public API
 *   PFCHolidays.get(year, countryCode)
 *     → Promise<Holiday[]>   [{date, name, types, global, counties}, ...]
 *   PFCHolidays.getForMonth(year, monthIdx, countryCode)
 *     → Promise<Holiday[]>   filtered to that month (monthIdx is 0-11)
 *   PFCHolidays.businessDaysInMonth(year, monthIdx, countryCode)
 *     → Promise<number>      Mon-Fri minus public holidays
 *   PFCHolidays.isSupported(countryCode) → boolean (synchronous check)
 *
 * Loaded AFTER pfc-config.js. No other dependencies.
 */
(function () {
  'use strict';

  const ENDPOINT = 'https://date.nager.at/api/v3/PublicHolidays';
  const CACHE_KEY = (year, cc) => `pfc_hols_v1_${year}_${cc}`;
  // Holidays for a past year are immutable. For the current or future year
  // they could in principle be amended by the API, so we re-fetch monthly
  // for the current year — but never for past years.
  const CURRENT_YEAR_TTL_MS = 30 * 24 * 60 * 60 * 1000;

  // Best-effort ISO 3166-1 alpha-2 list that Nager.Date supports (as of
  // 2026). We only use this for the synchronous isSupported() check; the
  // async fetches will still 404 gracefully for anything outside the list.
  const SUPPORTED = new Set([
    'AD','AL','AM','AR','AT','AU','AX','BA','BB','BE','BG','BJ','BO','BR',
    'BS','BW','BY','BZ','CA','CH','CL','CN','CO','CR','CU','CY','CZ','DE',
    'DK','DO','EC','EE','EG','ES','FI','FO','FR','GA','GB','GD','GE','GG',
    'GI','GL','GR','GT','GY','HK','HN','HR','HT','HU','ID','IE','IM','IS',
    'IT','JE','JM','JP','KR','KZ','LI','LS','LT','LU','LV','MA','MC','MD',
    'ME','MG','MK','MN','MS','MT','MX','MZ','NA','NE','NG','NI','NL','NO',
    'NZ','PA','PE','PG','PH','PL','PR','PT','PY','RO','RS','RU','SE','SG',
    'SI','SJ','SK','SM','SR','SV','TN','TR','UA','US','UY','VA','VE','VN',
    'ZA','ZM','ZW',
  ]);

  const _now = () => Date.now();

  function _cacheGet(year, cc) {
    try {
      const raw = localStorage.getItem(CACHE_KEY(year, cc));
      if (!raw) return null;
      const entry = JSON.parse(raw);
      if (!entry || !Array.isArray(entry.holidays)) return null;
      const isCurrentYear = year === new Date().getFullYear();
      if (isCurrentYear && (_now() - (entry.fetchedAt || 0) > CURRENT_YEAR_TTL_MS)) {
        return null; // refresh stale current-year data
      }
      return entry.holidays;
    } catch (_) { return null; }
  }

  function _cacheSet(year, cc, holidays) {
    try {
      localStorage.setItem(
        CACHE_KEY(year, cc),
        JSON.stringify({ holidays: holidays, fetchedAt: _now() })
      );
    } catch (_) {}
  }

  const _inflight = {};
  function _fetchYear(year, cc) {
    const key = `${year}_${cc}`;
    if (_inflight[key]) return _inflight[key];
    const url = `${ENDPOINT}/${year}/${encodeURIComponent(cc)}`;
    const p = fetch(url, { credentials: 'omit' })
      .then(async (res) => {
        // 204/404 means the country isn't supported — return empty array
        // so callers can branch on .length instead of catching.
        if (res.status === 404 || res.status === 204) {
          _cacheSet(year, cc, []);
          delete _inflight[key];
          return [];
        }
        if (!res.ok) throw new Error('nager ' + res.status);
        const data = await res.json();
        const arr = Array.isArray(data) ? data : [];
        _cacheSet(year, cc, arr);
        delete _inflight[key];
        return arr;
      })
      .catch((e) => { delete _inflight[key]; throw e; });
    _inflight[key] = p;
    return p;
  }

  async function get(year, cc) {
    year = parseInt(year, 10);
    cc = String(cc || '').toUpperCase();
    if (!year || !cc) return [];
    const cached = _cacheGet(year, cc);
    if (cached) return cached;
    return _fetchYear(year, cc);
  }

  async function getForMonth(year, monthIdx, cc) {
    const all = await get(year, cc);
    // Nager dates are ISO YYYY-MM-DD. monthIdx is 0-11; the API uses 1-12.
    const m = String(monthIdx + 1).padStart(2, '0');
    const prefix = `${year}-${m}`;
    return all.filter((h) => typeof h.date === 'string' && h.date.startsWith(prefix));
  }

  async function businessDaysInMonth(year, monthIdx, cc) {
    const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
    // Build a set of YYYY-MM-DD strings for public holidays this month so we
    // don't double-count a holiday that falls on a weekend.
    const hols = await getForMonth(year, monthIdx, cc);
    // Only count Public types as bank-closed (not Observance).
    const publicHolidays = new Set(
      hols
        .filter((h) => {
          if (!h.types || !Array.isArray(h.types)) return true; // legacy entries
          return h.types.includes('Public') || h.types.includes('Bank');
        })
        .map((h) => h.date)
    );
    let business = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(year, monthIdx, d);
      const dow = dt.getDay(); // 0=Sun, 6=Sat
      if (dow === 0 || dow === 6) continue;
      const iso = `${year}-${String(monthIdx + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      if (publicHolidays.has(iso)) continue;
      business++;
    }
    return business;
  }

  function isSupported(cc) {
    return SUPPORTED.has(String(cc || '').toUpperCase());
  }

  window.PFCHolidays = {
    get: get,
    getForMonth: getForMonth,
    businessDaysInMonth: businessDaysInMonth,
    isSupported: isSupported,
    SUPPORTED: SUPPORTED,
  };
})();
