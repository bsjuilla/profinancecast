// api/history.js — Edge runtime historical-price proxy via Twelve Data.
//
// W21 (deferred-item #2). The portfolio Performance chart previously did a
// linear back-projection from (addedAt, costBasis) to (today, currentValue)
// because no historical data was available. With this endpoint, the chart
// can show REAL market-history (subject to the user having tradeable
// symbols — manual-override positions still back-project since the API
// can't price them).
//
// Free tier reality (verified May 2026):
//   Same quota as /api/quote: 8 req/min, 800/day across all symbols.
//   Time-series endpoint is metered identically to /quote (1 credit per
//   call regardless of outputsize). To stretch this, we edge-cache each
//   (symbol, interval) pair for 24 hours — historical bars for past dates
//   don't change, so daily refresh is plenty.
//
// Why monthly bars (W21 decision):
//   ~60 data points per symbol over 5 years = smooth long-term curve
//   showing compound growth, the curve users care about for a buy-and-hold
//   personal-finance app. Daily bars (252/yr) would burn ~5x the quota
//   per chart load with negligible UX benefit for non-traders.
//
// Required env:
//   TWELVE_DATA_API_KEY  (same key /api/quote uses)
//
// Request:
//   GET /api/history?symbol=AAPL
//   GET /api/history?symbol=AAPL&interval=1month&outputsize=60
//
// Accepted intervals: 1day | 1week | 1month  (limited list — others
//   would let callers brute-force the quota with high-frequency intervals)
//
// Response 200:
//   { symbol, currency, interval, bars: [{ date, close }, ...] }
//   Bars are oldest-first so consumers can plot left-to-right without sort.
//
// Response 4xx / 5xx:
//   { error: "...", code }

export const config = { runtime: 'edge' };

const TWELVE_DATA_BASE = 'https://api.twelvedata.com';

function _json(payload, status, extraHeaders) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: Object.assign({
      'Content-Type': 'application/json; charset=utf-8',
    }, extraHeaders || {}),
  });
}

// Same symbol sanitization as /api/quote.
const SYMBOL_RE = /^[A-Z0-9.\-]{1,40}$/i;
const ALLOWED_INTERVALS = new Set(['1day', '1week', '1month']);

// Same cross-site rejection as /api/quote.
function _isSameOrigin(req) {
  const site = req.headers.get('sec-fetch-site') || '';
  if (!site) return true;
  return site === 'same-origin' || site === 'same-site' || site === 'none';
}

export default async function handler(req) {
  if (req.method !== 'GET') {
    return _json({ error: 'Method not allowed', code: 'METHOD' }, 405);
  }
  if (!_isSameOrigin(req)) {
    return _json({ error: 'Cross-site not allowed', code: 'CROSS_SITE' }, 403,
      { 'Cache-Control': 'no-store' });
  }

  const url = new URL(req.url);
  const symbol = (url.searchParams.get('symbol') || '').trim().toUpperCase();
  const interval = (url.searchParams.get('interval') || '1month').trim();
  const outputsize = parseInt(url.searchParams.get('outputsize') || '60', 10);

  if (!symbol) {
    return _json({ error: 'Missing ?symbol=', code: 'MISSING_SYMBOL' }, 400);
  }
  if (!SYMBOL_RE.test(symbol)) {
    return _json({ error: 'Invalid symbol', code: 'BAD_SYMBOL' }, 400);
  }
  if (!ALLOWED_INTERVALS.has(interval)) {
    return _json({ error: 'Interval must be 1day, 1week, or 1month', code: 'BAD_INTERVAL' }, 400);
  }
  if (!Number.isFinite(outputsize) || outputsize < 1 || outputsize > 500) {
    return _json({ error: 'outputsize must be 1-500', code: 'BAD_OUTPUTSIZE' }, 400);
  }

  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) {
    return _json(
      {
        error: 'Portfolio API key not configured. Add TWELVE_DATA_API_KEY in Vercel.',
        code: 'MISSING_KEY',
      },
      503,
      { 'Cache-Control': 'no-store' }
    );
  }

  const upstream =
    `${TWELVE_DATA_BASE}/time_series` +
    `?symbol=${encodeURIComponent(symbol)}` +
    `&interval=${encodeURIComponent(interval)}` +
    `&outputsize=${outputsize}` +
    `&apikey=${encodeURIComponent(key)}`;

  let upstreamRes;
  try {
    upstreamRes = await fetch(upstream, {
      headers: { 'Accept': 'application/json' },
    });
  } catch (e) {
    return _json({ error: 'Upstream fetch failed: ' + e.message, code: 'FETCH_FAILED' }, 502);
  }

  let data;
  try { data = await upstreamRes.json(); }
  catch (_) { return _json({ error: 'Upstream returned non-JSON', code: 'BAD_RESPONSE' }, 502); }

  // Twelve Data error shape (200 + status:'error' for invalid symbols)
  if (data && data.status === 'error') {
    return _json({
      error: data.message || 'Upstream error',
      code: data.code === 404 ? 'SYMBOL_NOT_FOUND' : 'UPSTREAM_ERROR',
    }, data.code === 404 ? 404 : 502);
  }

  if (!Array.isArray(data.values)) {
    return _json({ error: 'Upstream missing values array', code: 'BAD_RESPONSE' }, 502);
  }

  // Normalise: oldest-first, drop bars with non-finite close.
  const bars = data.values
    .map((v) => ({
      date: v.datetime,
      close: parseFloat(v.close),
    }))
    .filter((b) => Number.isFinite(b.close))
    .reverse();

  return _json(
    {
      symbol,
      currency: (data.meta && data.meta.currency) || 'USD',
      interval,
      bars,
      source: 'twelve-data',
    },
    200,
    {
      // 24-hour edge cache + 1-hour stale-while-revalidate. Historical
      // bars don't change for past dates; the only bar that's volatile
      // is the most-recent one, which a 24h cache is still appropriate
      // for given monthly granularity.
      'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600',
    }
  );
}
