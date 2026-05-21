// api/macro.js — Edge runtime macro-data proxy via FRED (St Louis Fed).
//
// Returns the four headline macro series most relevant to a personal-finance
// audience:
//   - FEDFUNDS       Federal funds effective rate (monthly)
//   - MORTGAGE30US   30-year fixed mortgage average (weekly)
//   - DGS10          10-year Treasury constant-maturity yield (daily)
//   - CPIAUCSL       CPI All Urban Consumers (monthly index — we compute YoY %)
//
// We use FRED's `fredgraph.csv` endpoint instead of the JSON `/fred/series/
// observations` API because the CSV endpoint does NOT require an API key.
// (FRED has stably exposed this URL for ~10 years; their own website uses it.)
// If the URL ever changes, the page degrades gracefully — the macro widget
// just doesn't render.
//
// Cache: 6 hours at the edge (`s-maxage=21600`). FED publishes most of these
// only daily-or-slower; over-caching costs nothing and protects against bursts.
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

const FRED_BASE = 'https://fred.stlouisfed.org/graph/fredgraph.csv';

function _json(payload, status, extraHeaders) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: Object.assign({
      'Content-Type': 'application/json; charset=utf-8',
    }, extraHeaders || {}),
  });
}

// Parse FRED's two-column CSV: "observation_date,SERIES\n2026-04-01,5.33\n…"
// Returns [{date, value}] sorted oldest-first. Skips "." rows (FRED's sentinel
// for missing data). Defensive against trailing whitespace and CRLF lines.
function _parseFredCsv(text) {
  const rows = [];
  if (!text) return rows;
  const lines = text.split(/\r?\n/);
  // Skip header (lines[0]); FRED always has one.
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const comma = line.indexOf(',');
    if (comma === -1) continue;
    const date = line.slice(0, comma).trim();
    const raw = line.slice(comma + 1).trim();
    if (!date || raw === '.' || raw === '') continue;
    const v = parseFloat(raw);
    if (!isFinite(v)) continue;
    rows.push({ date, value: v });
  }
  return rows;
}

// Limit each fetch to the last 24 months. Without `cosd`, fredgraph returns
// the FULL historical series (CPIAUCSL goes back to 1947 → ~900 rows × 30KB).
// On Vercel Edge's 1s CPU budget that single parse can blow past timeout;
// 24 months is plenty for "latest value" + CPI YoY calculation (we need
// 13 months for YoY) and keeps each payload tiny.
function _twoYearsAgoIso() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 2);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

async function _fetchSeries(seriesId) {
  const url = `${FRED_BASE}?id=${encodeURIComponent(seriesId)}&cosd=${_twoYearsAgoIso()}`;
  // AbortController per fetch — if one series hangs, the others still respond.
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'text/csv', 'User-Agent': 'profinancecast-macro/1.0' },
      signal: ctrl.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return { rows: [], error: 'http_' + res.status };
    const text = await res.text();
    const rows = _parseFredCsv(text);
    if (rows.length === 0) return { rows: [], error: 'empty_csv' };
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
    return _json({ error: 'Method not allowed' }, 405);
  }

  // Fan-out: fetch all four series in parallel. Edge runtime gives us low
  // latency to FRED (US-east-2 etc); whole call typically resolves in <1s.
  const [ff, mtg, t10, cpi] = await Promise.all([
    _fetchSeries('FEDFUNDS'),
    _fetchSeries('MORTGAGE30US'),
    _fetchSeries('DGS10'),
    _fetchSeries('CPIAUCSL'),
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

  // 6h CDN cache. Even if FRED publishes new data, the dashboard widget
  // catches up on the next visit beyond the cache window.
  return _json(payload, 200, {
    'Cache-Control': 'public, s-maxage=21600, max-age=0, must-revalidate',
  });
}
