// api/macro.js — Edge runtime macro-data proxy.
//
// HISTORY:
//   - Originally proxied FRED for 4 series (Fed funds, mortgage, 10Y Treasury,
//     CPI YoY). FRED blocks Vercel's IP ranges (both Edge POP IPs AND Node
//     Lambda IPs — verified by deploy probes May 2026). Same with World Bank
//     from Edge, but World Bank works from Node.
//   - Pivoted: macro endpoint now returns ONLY CPI YoY, sourced from World
//     Bank via the /api/inflation endpoint (which runs on Node runtime). This
//     Edge proxy adds the per-country lookup logic and uniform error contract
//     consistent with other Sprint-3 endpoints.
//   - Fed funds / 30Y mortgage / 10Y Treasury are dropped until we find a
//     macro source that works from Vercel. They're documented in the response
//     payload as `null` so the client can still render the shape.
//
// USAGE:
//   GET /api/macro                    → CPI YoY for user's country (from geo)
//   GET /api/macro?country=US         → CPI YoY for explicit country
//
// Response shape (preserved for client compatibility):
//   {
//     fedFunds:    null,
//     mortgage30y: null,
//     treasury10y: null,
//     cpiYoY:      { value: 3.6, date: "2024", series: "FP.CPI.TOTL.ZG",
//                    method: "annual%", country: "MU", countryName: "Mauritius" },
//     asOf:        "2026-05-21T10:00:00.000Z",
//     source:      "world-bank",
//     note:        "FRED unreachable from Vercel; sourced via World Bank"
//   }

export const config = { runtime: 'edge' };

function _json(payload, status, extraHeaders) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: Object.assign({
      'Content-Type': 'application/json; charset=utf-8',
    }, extraHeaders || {}),
  });
}

function _isSameOrigin(req) {
  const site = req.headers.get('sec-fetch-site') || '';
  if (!site) return true;
  return site === 'same-origin' || site === 'same-site' || site === 'none';
}

// Best-effort country resolution: explicit ?country= param wins, else
// fall through to the Vercel geo header that's already attached to every
// request. Default US so the macro shape never returns empty.
function _resolveCountry(req) {
  const url = new URL(req.url);
  const explicit = (url.searchParams.get('country') || '').toUpperCase().trim();
  if (/^[A-Z]{2}$/.test(explicit)) return explicit;
  const geo = (req.headers.get('x-vercel-ip-country') || '').toUpperCase();
  if (/^[A-Z]{2}$/.test(geo)) return geo;
  return 'US';
}

export default async function handler(req) {
  if (req.method !== 'GET') {
    return _json({ error: 'Method not allowed', code: 'METHOD' }, 405);
  }
  if (!_isSameOrigin(req)) {
    return _json({ error: 'Cross-site not allowed', code: 'CROSS_SITE' }, 403,
      { 'Cache-Control': 'no-store' });
  }

  const country = _resolveCountry(req);

  // Same-origin call to our Node /api/inflation endpoint. World Bank itself
  // blocks Vercel Edge POPs, but the Node lambda CAN reach World Bank — so
  // we proxy through it. The internal call adds ~50-150ms latency but
  // sidesteps the cloud-IP block entirely.
  const origin = new URL(req.url).origin;
  const infUrl = `${origin}/api/inflation?country=${encodeURIComponent(country)}`;

  let cpiYoY = null;
  try {
    // Forward a same-origin Referer so /api/inflation's anti-hotlink guard
    // (FULL-P1-D3) accepts this INTERNAL proxy call. A bare server-side fetch
    // sends no Origin/Referer, so the guard 403s us and cpiYoY comes back null
    // → "Macro context temporarily unavailable" on the dashboard. We forward
    // the browser's own (already same-origin) Referer when present, else our
    // own origin; the guard normalises away the www. prefix so both match.
    const _ref = req.headers.get('referer') || `${origin}/api/macro`;
    const res = await fetch(infUrl, {
      headers: { 'Accept': 'application/json', 'Referer': _ref, 'Origin': origin },
    });
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.rate === 'number' && isFinite(data.rate)) {
        cpiYoY = {
          value: data.rate,
          date: String(data.year || ''),
          series: 'FP.CPI.TOTL.ZG',
          method: 'annual%',
          country: data.countryCode || country,
          countryName: data.countryName || null,
          trend: data.trend || null,
          severity: data.severity || null,
        };
      }
    }
  } catch (_) { /* silent — widget will hide if cpiYoY remains null */ }

  const payload = {
    // Fed funds / mortgage / Treasury intentionally null — no working
    // source from Vercel as of May 2026. The shape is preserved so the
    // client doesn't need to change its render logic.
    fedFunds: null,
    mortgage30y: null,
    treasury10y: null,
    cpiYoY: cpiYoY,
    asOf: new Date().toISOString(),
    source: 'world-bank',
    note: 'FRED unreachable from Vercel; macro now sources CPI YoY via World Bank',
  };

  // Cache only the happy path (cpiYoY populated). World Bank refreshes
  // inflation data annually — 24h CDN cache is conservative.
  const cacheControl = cpiYoY
    ? 'public, s-maxage=86400, max-age=0, must-revalidate'
    : 'no-store';

  return _json(payload, 200, { 'Cache-Control': cacheControl });
}
