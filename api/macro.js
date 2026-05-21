// api/macro.js — Node serverless macro-data proxy via FRED.
//
// HISTORY:
//   - First tried as Edge runtime (Sprint 3, May 2026): FRED's edge-POP IP
//     ranges are blocked, all 4 fetches timed out at 6s (verified in prod).
//   - Migrated to Node runtime (this version) because Vercel's serverless
//     functions egress through AWS Lambda IPs which FRED treats differently.
//   - Inflation endpoint (which was Node) was migrated to Edge in the same
//     commit to keep the 12-Serverless-Function Hobby cap intact.
//
// Returns the four headline macro series most relevant to a personal-finance
// audience:
//   - FEDFUNDS       Federal funds effective rate (monthly)
//   - MORTGAGE30US   30-year fixed mortgage average (weekly)
//   - DGS10          10-year Treasury constant-maturity yield (daily)
//   - CPIAUCSL       CPI All Urban Consumers (monthly index — we compute YoY %)
//
// Required env: FRED_API_KEY (free, https://fred.stlouisfed.org/docs/api/api_key.html)
//
// Response shape:
//   {
//     fedFunds:    { value: 5.33,  date: "2026-04-01", series: "FEDFUNDS" },
//     mortgage30y: { value: 6.84,  date: "2026-05-15", series: "MORTGAGE30US" },
//     treasury10y: { value: 4.32,  date: "2026-05-20", series: "DGS10" },
//     cpiYoY:      { value: 3.20,  date: "2026-04-01", series: "CPIAUCSL", method: "YoY%" },
//     asOf:        "2026-05-21T10:00:00.000Z",
//     source:      "fred-stlouisfed",
//     errors:      []
//   }

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

// Same-origin guard (Node-runtime variant — headers are a plain object,
// not a Headers instance). Prevents bot loops from burning our FRED key.
function _isSameOrigin(req) {
  const site = (req.headers['sec-fetch-site'] || '').toString();
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
    if (!data || !Array.isArray(data.observations)) {
      return { rows: [], error: 'no_observations' };
    }
    const rows = [];
    for (const o of data.observations) {
      if (!o || typeof o.date !== 'string') continue;
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
// the one ~12 months prior.
function _computeCpiYoY(rows) {
  if (!rows || rows.length < 13) return null;
  const latest = rows[rows.length - 1];
  if (!latest || !isFinite(latest.value)) return null;
  const latestMs = Date.parse(latest.date + 'T00:00:00Z');
  if (!isFinite(latestMs)) return null;
  const targetMs = latestMs - 11 * 30 * 24 * 60 * 60 * 1000;
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

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed', code: 'METHOD' });
  }
  if (!_isSameOrigin(req)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(403).json({ error: 'Cross-site not allowed', code: 'CROSS_SITE' });
  }

  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({
      error: 'Macro API key not configured. Add FRED_API_KEY in Vercel.',
      code: 'MISSING_KEY',
    });
  }

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
  // is flaky, no-store lets the next request retry rather than serving
  // 6 hours of cached failure to all users.
  const populated = ['fedFunds','mortgage30y','treasury10y','cpiYoY']
    .filter((k) => payload[k] && typeof payload[k].value === 'number').length;
  res.setHeader('Cache-Control', populated >= 3
    ? 'public, s-maxage=21600, max-age=0, must-revalidate'
    : 'no-store');

  return res.status(200).json(payload);
}
