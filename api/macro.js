// api/macro.js — Edge runtime macro-data proxy via FRED (St Louis Fed).
//
// Returns the four headline macro series most relevant to a personal-finance
// audience:
//   - FEDFUNDS       Federal funds effective rate (monthly)
//   - MORTGAGE30US   30-year fixed mortgage average (weekly)
//   - DGS10          10-year Treasury constant-maturity yield (daily)
//   - CPIAUCSL       CPI All Urban Consumers (monthly index — we compute YoY %)
//
// Uses FRED's official JSON API (api.stlouisfed.org/fred/series/observations).
// We originally tried the keyless fredgraph.csv endpoint to avoid yet another
// env var, but FRED blocks Vercel's edge POPs (cloud-provider IP filtering
// plus User-Agent restrictions, and Fetch-spec rules forbid Edge runtimes
// from setting custom User-Agent headers). The JSON API requires FRED_API_KEY
// (free signup, 1000 req/day) and works reliably from Edge.
//
// Cache: 6 hours at the edge ONLY when ≥3 of 4 series are populated.
// Errored responses use no-store so transient upstream issues don't pin a
// bad payload for 6h (regression caught during sprint-3 deploy).
//
// Response shape:
//   {
//     fedFunds:    { value: 5.33,  date: "2026-04-01", series: "FEDFUNDS" },
//     mortgage30y: { value: 6.84,  date: "2026-05-15", series: "MORTGAGE30US" },
//     treasury10y: { value: 4.32,  date: "2026-05-20", series: "DGS10" },
//     cpiYoY:      { value: 3.20,  date: "2026-04-01", series: "CPIAUCSL", method: "YoY%" },
//     asOf:        "2026-05-21T10:00:00.000Z",
//     source:      "fred-stlouisfed",
//     errors:      []     // any series we failed to parse
//   }

export const config = { runtime: 'edge' };

// FRED official JSON API. We originally tried the keyless fredgraph.csv
// endpoint but FRED blocks Vercel's edge POPs (cloud-provider IP block +
// User-Agent filtering — and Fetch-spec forbidden-header rules strip our
// custom UA on Edge runtime). The JSON API with a free key works reliably.
const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

function _json(payload, status, extraHeaders) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: Object.assign({
      'Content-Type': 'application/json; charset=utf-8',
    }, extraHeaders || {}),
  });
}

// Same-origin guard — prevents bot loops from burning our 1000/day FRED key.
function _isSameOrigin(req) {
  const site = req.headers.get('sec-fetch-site') || '';
  if (!site) return true;
  return site === 'same-origin' || site === 'same-site' || site === 'none';
}

function _twoYearsAgoIso() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 2);
  return d.toISOString().slice(0, 10);
}

async function _fetchSeries(seriesId, apiKey) {
  const params = new URLSearchParams({
    series_id: seriesId,
    api_key: apiKey,
    file_type: 'json',
    sort_order: 'asc',
    observation_start: _twoYearsAgoIso(),
  });
  const url = FRED_BASE + '?' + params.toString();
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: ctrl.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return { rows: [], error: 'http_' + res.status };
    const data = await res.json();
    // FRED JSON shape: { observations: [{date:"2026-04-01", value:"5.33"}, ...] }
    if (!data || !Array.isArray(data.observations)) {
      return { rows: [], error: 'no_observations' };
    }
    const rows = [];
    for (const o of data.observations) {
      if (!o || typeof o.date !== 'string') continue;
      // FRED uses '.' for missing values — skip.
      if (o.value === '.' || o.value === '' || o.value == null) continue;
      const v = parseFloat(o.value);
      if (!isFinite(v)) continue;
      rows.push({ date: o.date, value: v });
    }
    if (rows.length === 0) return { rows: [], error: 'empty_observations' };
    return { rows, error: null };
  } catch (e) {
    clearTimeout(timeoutId);
    const reason = (e && e.name === 'AbortError') ? 'timeout_6s' : 'fetch_failed';
    return { rows: [], error: reason };
  }
}

// CPI YoY % from monthly index values: compare the latest observation against
// the one ~12 months prior. FRED dates align cleanly month-to-month so an
// index lookup by date string works without timezone arithmetic.
function _computeCpiYoY(rows) {
  if (!rows || rows.length < 13) return null;
  const latest = rows[rows.length - 1];
  if (!latest || !isFinite(latest.value)) return null;
  // Walk back to the first row whose date is ~12 months prior. FRED CPI is
  // monthly, but a small drift (some series have weekly aggregates) is
  // possible — pick the row whose date is closest to (latest minus 11 months).
  const latestMs = Date.parse(latest.date + 'T00:00:00Z');
  if (!isFinite(latestMs)) return null;
  const targetMs = latestMs - 11 * 30 * 24 * 60 * 60 * 1000; // ~11mo back
  let best = null, bestDelta = Infinity;
  for (let i = rows.length - 13; i >= 0 && i >= rows.length - 24; i--) {
    const dMs = Date.parse(rows[i].date + 'T00:00:00Z');
    if (!isFinite(dMs)) continue;
    const delta = Math.abs(dMs - targetMs);
    if (delta < bestDelta) { bestDelta = delta; best = rows[i]; }
  }
  if (!best || !isFinite(best.value) || best.value <= 0) return null;
  const yoy = ((latest.value - best.value) / best.value) * 100;
  return {
    value: Math.round(yoy * 100) / 100,
    date: latest.date,
    series: 'CPIAUCSL',
    method: 'YoY%',
  };
}

function _latest(rows, seriesId) {
  if (!rows.length) return null;
  const row = rows[rows.length - 1];
  return { value: row.value, date: row.date, series: seriesId };
}

export default async function handler(req) {
  if (req.method !== 'GET') {
    return _json({ error: 'Method not allowed', code: 'METHOD' }, 405);
  }
  if (!_isSameOrigin(req)) {
    return _json({ error: 'Cross-site not allowed', code: 'CROSS_SITE' }, 403,
      { 'Cache-Control': 'no-store' });
  }

  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    return _json(
      {
        error: 'Macro API key not configured. Add FRED_API_KEY in Vercel.',
        code: 'MISSING_KEY',
      },
      503,
      { 'Cache-Control': 'no-store' }
    );
  }

  // Fan-out: fetch all four series in parallel. JSON API is fast (~150ms
  // each typical), so even with the 6s per-fetch abort guard we're nowhere
  // close to Edge timeout.
  const [ff, mtg, t10, cpi] = await Promise.all([
    _fetchSeries('FEDFUNDS',     apiKey),
    _fetchSeries('MORTGAGE30US', apiKey),
    _fetchSeries('DGS10',        apiKey),
    _fetchSeries('CPIAUCSL',     apiKey),
  ]);

  const errors = [];
  if (ff.error)  errors.push({ series: 'FEDFUNDS',     reason: ff.error });
  if (mtg.error) errors.push({ series: 'MORTGAGE30US', reason: mtg.error });
  if (t10.error) errors.push({ series: 'DGS10',        reason: t10.error });
  if (cpi.error) errors.push({ series: 'CPIAUCSL',     reason: cpi.error });

  const payload = {
    fedFunds:    _latest(ff.rows,  'FEDFUNDS'),
    mortgage30y: _latest(mtg.rows, 'MORTGAGE30US'),
    treasury10y: _latest(t10.rows, 'DGS10'),
    cpiYoY:      _computeCpiYoY(cpi.rows),
    asOf: new Date().toISOString(),
    source: 'fred-stlouisfed',
    errors: errors,
  };

  // Cache only the happy path (≥3 of 4 series populated). When upstream
  // is flaky, returning no-store lets the next request retry rather than
  // serving 6 hours of cached failure to all users.
  const populated = ['fedFunds','mortgage30y','treasury10y','cpiYoY']
    .filter((k) => payload[k] && typeof payload[k].value === 'number').length;
  const cacheControl = populated >= 3
    ? 'public, s-maxage=21600, max-age=0, must-revalidate'
    : 'no-store';

  return _json(payload, 200, { 'Cache-Control': cacheControl });
}
