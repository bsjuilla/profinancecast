// api/quote.js — Edge runtime stock-quote proxy via Twelve Data.
//
// Free tier reality (verified May 2026):
//   8 req/min, 800/day across all symbols. To stretch this across many
//   users, this proxy caches each symbol's response at the CDN for 15
//   minutes (s-maxage=900). 10 active users sharing FAANG-style tickers
//   then cost ~1 req per ticker per 15 min, easily under cap.
//
// Why Edge runtime:
//   - Doesn't count against the 12-Serverless-Function Hobby cap.
//   - Sub-50ms latency, zero cold start.
//   - Cache headers respected by Vercel's edge network.
//
// Required env (set in Vercel project → Settings → Environment Variables):
//   TWELVE_DATA_API_KEY  (free signup at twelvedata.com)
//
// Request:
//   GET /api/quote?symbol=AAPL
//   GET /api/quote?symbol=VWRL.LON     (international ETFs via ".EXCHANGE")
//   GET /api/quote?symbol=AAPL,MSFT    (batch — comma-separated, cheaper)
//
// Response 200:
//   { symbol, name, price, currency, change, change_pct, timestamp,
//     exchange, source: "twelve-data" }
//   or for batch:
//   { quotes: [ {symbol, ...}, ... ] }
//
// Response 4xx:
//   { error: "...", code }
// Response 503 (no key configured):
//   { error: "Portfolio API key not configured. Add TWELVE_DATA_API_KEY in Vercel.",
//     code: "MISSING_KEY" }

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

// Light symbol sanitization. Twelve Data accepts symbols like AAPL, VWRL.LON,
// 7203.TYO. We allow letters, digits, ".", "-", and comma (for batch).
// Anything else returns a 400 — prevents key leakage via malformed URLs.
const SYMBOL_RE = /^[A-Z0-9.\-,]{1,80}$/i;

// Block cross-site callers from burning our Twelve Data quota via cache-busted
// hot-loops. Browsers attach Sec-Fetch-Site automatically and JS cannot spoof
// it. We accept 'same-origin' (our pages), 'same-site' (subdomain hop),
// 'none' (typed URL bar, curl) and reject 'cross-site'. Absent header = older
// browser or non-browser client; accept so curl-debugging still works.
function _isSameOrigin(req) {
  const site = req.headers.get('sec-fetch-site') || '';
  if (!site) return true;
  return site === 'same-origin' || site === 'same-site' || site === 'none';
}

function _normaliseQuote(q) {
  if (!q || typeof q !== 'object') return null;
  const price = parseFloat(q.price || q.close);
  const change = parseFloat(q.change);
  const changePct = parseFloat(q.percent_change);
  return {
    symbol: String(q.symbol || '').toUpperCase(),
    name: q.name || null,
    price: isFinite(price) ? price : null,
    currency: q.currency || 'USD',
    change: isFinite(change) ? change : null,
    change_pct: isFinite(changePct) ? changePct : null,
    timestamp: q.timestamp || q.datetime || null,
    exchange: q.exchange || null,
    source: 'twelve-data',
  };
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
  const symbol = (url.searchParams.get('symbol') || '').trim();
  if (!symbol) {
    return _json({ error: 'Missing ?symbol=', code: 'MISSING_SYMBOL' }, 400);
  }
  if (!SYMBOL_RE.test(symbol)) {
    return _json({ error: 'Invalid symbol', code: 'BAD_SYMBOL' }, 400);
  }

  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) {
    // Surface a clear admin-facing error AND a cache header so the
    // misconfiguration doesn't burn cap on retries.
    return _json(
      {
        error: 'Portfolio API key not configured. Add TWELVE_DATA_API_KEY in Vercel.',
        code: 'MISSING_KEY',
      },
      503,
      { 'Cache-Control': 'no-store' }
    );
  }

  const isBatch = symbol.includes(',');
  const upstream = `${TWELVE_DATA_BASE}/quote?symbol=${encodeURIComponent(symbol.toUpperCase())}&apikey=${encodeURIComponent(key)}`;

  let upstreamRes;
  try {
    upstreamRes = await fetch(upstream, {
      headers: { 'Accept': 'application/json' },
    });
  } catch (e) {
    return _json({ error: 'Upstream fetch failed', code: 'NETWORK' }, 502);
  }

  if (!upstreamRes.ok) {
    // Twelve Data returns 4xx as JSON {status:"error", message:"..."}.
    // We DO NOT relay the message to the client — Twelve Data error bodies
    // occasionally echo the offending query parameters back, which could
    // include "apikey=<key>" if the request was malformed. Surface a
    // generic message; full detail is in server logs only.
    try { const _ = await upstreamRes.text(); } catch (_) {}
    return _json(
      { error: 'Upstream rejected request', code: 'UPSTREAM_' + upstreamRes.status },
      upstreamRes.status === 429 ? 429 : 502,
      { 'Cache-Control': 'no-store' }
    );
  }

  let data;
  try { data = await upstreamRes.json(); }
  catch (e) { return _json({ error: 'Bad upstream JSON', code: 'PARSE' }, 502); }

  // Twelve Data uses an inline "status":"error" pattern even on 200s.
  if (data && data.status === 'error') {
    // Re-map: invalid-symbol (e.g. ZZZZZZ) returns 200 + status:error + code 404
    const td_code = data.code || 0;
    if (td_code === 404 || /not found/i.test(data.message || '')) {
      return _json({ error: 'Symbol not found', code: 'SYMBOL_NOT_FOUND' }, 404);
    }
    return _json(
      { error: String(data.message || 'Upstream error').slice(0, 200), code: 'UPSTREAM_INLINE' },
      502,
      { 'Cache-Control': 'no-store' }
    );
  }

  // Build response
  let body;
  if (isBatch) {
    // Twelve Data batch returns { "AAPL": {...}, "MSFT": {...} }
    const quotes = [];
    if (data && typeof data === 'object') {
      for (const sym of Object.keys(data)) {
        const q = _normaliseQuote(data[sym]);
        if (q) quotes.push(q);
      }
    }
    body = { quotes };
  } else {
    body = _normaliseQuote(data) || { error: 'Empty response', code: 'EMPTY' };
  }

  // 15-minute CDN cache. Quote data is delayed 15 min on the free tier
  // anyway, so caching at the edge has zero freshness cost while massively
  // multiplying our effective request budget.
  return _json(body, 200, {
    'Cache-Control': 'public, s-maxage=900, max-age=0, must-revalidate',
  });
}
