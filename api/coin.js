// api/coin.js — Edge runtime crypto-quote proxy via CoinGecko's free public API.
//
// CoinGecko's free public endpoint (api.coingecko.com) doesn't require a key
// but is IP-throttled to ~10-30 req/min. We proxy it so:
//   1. CDN edge cache (s-maxage=300) shields the upstream from per-user spam.
//   2. The user's IP is never exposed to CoinGecko.
//   3. Response is normalized to match /api/quote — clients call one shape.
//
// No env vars required. Edge runtime — doesn't count against Hobby's
// 12-Serverless-Function cap.
//
// Request:
//   GET /api/coin?id=bitcoin&vs=usd
//   GET /api/coin?id=bitcoin,ethereum&vs=usd     (batch)
//
// Response 200:
//   { coinId, symbol, price, vs_currency, change_pct_24h, market_cap,
//     last_updated_at, source: "coingecko" }
//   or for batch:
//   { quotes: [ {coinId, ...}, ... ] }

export const config = { runtime: 'edge' };

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

// CoinGecko uses URL-friendly slugs (bitcoin, ethereum, solana). We allow
// lowercase letters, digits, "-", and comma (for batch). Reject anything
// else to avoid open-redirect-style URL injection.
const ID_RE = /^[a-z0-9\-,]{1,200}$/;
const VS_RE = /^[a-z]{3}$/;

// Map common ticker symbols → CoinGecko slugs for convenience, since the
// portfolio UI lets users type "BTC" or "ETH" naturally. Unknown tickers
// pass through as-is and CoinGecko will 404 if invalid.
const TICKER_TO_ID = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', ADA: 'cardano',
  XRP: 'ripple', DOGE: 'dogecoin', DOT: 'polkadot', MATIC: 'matic-network',
  LTC: 'litecoin', LINK: 'chainlink', UNI: 'uniswap', AVAX: 'avalanche-2',
  ATOM: 'cosmos', XLM: 'stellar', BCH: 'bitcoin-cash', ALGO: 'algorand',
  NEAR: 'near', FIL: 'filecoin', TRX: 'tron', SHIB: 'shiba-inu',
  USDT: 'tether', USDC: 'usd-coin', DAI: 'dai',
};

function _json(payload, status, extraHeaders) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: Object.assign({
      'Content-Type': 'application/json; charset=utf-8',
    }, extraHeaders || {}),
  });
}

function _resolveId(raw) {
  const u = raw.toUpperCase();
  if (TICKER_TO_ID[u]) return TICKER_TO_ID[u];
  return raw.toLowerCase();
}

export default async function handler(req) {
  if (req.method !== 'GET') {
    return _json({ error: 'Method not allowed', code: 'METHOD' }, 405);
  }

  const url = new URL(req.url);
  const idsRaw = (url.searchParams.get('id') || '').trim();
  const vs = (url.searchParams.get('vs') || 'usd').toLowerCase();

  if (!idsRaw) return _json({ error: 'Missing ?id=', code: 'MISSING_ID' }, 400);
  if (!VS_RE.test(vs)) return _json({ error: 'Invalid vs currency', code: 'BAD_VS' }, 400);

  // Resolve any tickers ("BTC,ETH") to CoinGecko ids ("bitcoin,ethereum").
  const ids = idsRaw
    .split(',')
    .map((s) => _resolveId(s.trim()))
    .filter(Boolean);

  const joined = ids.join(',');
  if (!ID_RE.test(joined)) {
    return _json({ error: 'Invalid id', code: 'BAD_ID' }, 400);
  }
  const isBatch = ids.length > 1;

  // /simple/price gives us price + 24h change + market cap in one call.
  const upstream =
    `${COINGECKO_BASE}/simple/price` +
    `?ids=${encodeURIComponent(joined)}` +
    `&vs_currencies=${encodeURIComponent(vs)}` +
    `&include_24hr_change=true` +
    `&include_market_cap=true` +
    `&include_last_updated_at=true`;

  let res;
  try {
    res = await fetch(upstream, { headers: { 'Accept': 'application/json' } });
  } catch (e) {
    return _json({ error: 'Upstream fetch failed', code: 'NETWORK' }, 502);
  }

  if (!res.ok) {
    return _json(
      { error: 'Upstream error', code: 'UPSTREAM_' + res.status },
      res.status === 429 ? 429 : 502,
      { 'Cache-Control': 'no-store' }
    );
  }

  let data;
  try { data = await res.json(); }
  catch (e) { return _json({ error: 'Bad upstream JSON', code: 'PARSE' }, 502); }

  // CoinGecko response shape:
  //   { "bitcoin": { "usd": 65000, "usd_market_cap": ..., "usd_24h_change": 1.5, "last_updated_at": 1716000000 } }
  function _mapOne(coinId) {
    const row = data[coinId];
    if (!row || typeof row[vs] !== 'number') return null;
    return {
      coinId,
      symbol: coinId.toUpperCase(), // not strictly the symbol but works for display fallback
      price: row[vs],
      vs_currency: vs,
      change_pct_24h: typeof row[vs + '_24h_change'] === 'number' ? row[vs + '_24h_change'] : null,
      market_cap: typeof row[vs + '_market_cap'] === 'number' ? row[vs + '_market_cap'] : null,
      last_updated_at: row.last_updated_at || null,
      source: 'coingecko',
    };
  }

  let body;
  if (isBatch) {
    const quotes = ids.map(_mapOne).filter(Boolean);
    body = { quotes };
  } else {
    const one = _mapOne(ids[0]);
    if (!one) return _json({ error: 'Coin not found', code: 'COIN_NOT_FOUND' }, 404);
    body = one;
  }

  // 5-minute CDN cache — crypto moves faster than stocks; 5 minutes is
  // the sweet spot between accuracy and CoinGecko's public-tier limits.
  return _json(body, 200, {
    'Cache-Control': 'public, s-maxage=300, max-age=0, must-revalidate',
  });
}
