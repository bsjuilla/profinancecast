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

// CoinGecko's `vs_currencies` accepts ~50 fiats; many exotic ones like MUR,
// PKR, AED aren't included. When a user's local currency isn't supported,
// silently fall back to USD so the page doesn't render "Coin not found"
// for an entirely-supported coin. The client can then convert with PFCFx
// if it wants — though for crypto, USD display is most users' default
// mental model anyway.
const SUPPORTED_VS = new Set([
  'btc','eth','ltc','bch','bnb','eos','xrp','xlm','link','dot','yfi','sol',
  'usd','aed','ars','aud','bdt','bhd','bmd','brl','cad','chf','clp','cny',
  'czk','dkk','eur','gbp','gel','hkd','huf','idr','ils','inr','jpy','krw',
  'kwd','lkr','mmk','mxn','myr','ngn','nok','nzd','php','pkr','pln','rub',
  'sar','sek','sgd','thb','try','twd','uah','vef','vnd','zar',
]);

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

// Same-origin guard. CoinGecko public has no key to leak, but a bot loop
// can still burn through the 30-req/min IP cap and break the page for real
// users. Sec-Fetch-Site is browser-attached and JS cannot spoof it.
function _isSameOrigin(req) {
  const site = req.headers.get('sec-fetch-site') || '';
  if (!site) return true;
  return site === 'same-origin' || site === 'same-site' || site === 'none';
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
  if (!_isSameOrigin(req)) {
    return _json({ error: 'Cross-site not allowed', code: 'CROSS_SITE' }, 403,
      { 'Cache-Control': 'no-store' });
  }

  const url = new URL(req.url);
  const idsRaw = (url.searchParams.get('id') || '').trim();
  const vs = (url.searchParams.get('vs') || 'usd').toLowerCase();

  if (!idsRaw) return _json({ error: 'Missing ?id=', code: 'MISSING_ID' }, 400);
  if (!VS_RE.test(vs)) return _json({ error: 'Invalid vs currency', code: 'BAD_VS' }, 400);

  // Graceful fallback: CoinGecko doesn't support every fiat (MUR, PKR, AED,
  // etc are missing). Swap to USD silently and note it in the response so
  // the client can show "Displayed in USD — CoinGecko doesn't list MUR".
  let effectiveVs = vs;
  let vsFallbackFromUser = null;
  if (!SUPPORTED_VS.has(vs)) {
    vsFallbackFromUser = vs;
    effectiveVs = 'usd';
  }

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
    `&vs_currencies=${encodeURIComponent(effectiveVs)}` +
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
    if (!row || typeof row[effectiveVs] !== 'number') return null;
    return {
      coinId,
      symbol: coinId.toUpperCase(),
      price: row[effectiveVs],
      vs_currency: effectiveVs,
      // If we fell back from MUR → USD, tell the client so it can render
      // the disclaimer "Displayed in USD — CoinGecko doesn't list MUR".
      requested_vs_currency: vsFallbackFromUser,
      change_pct_24h: typeof row[effectiveVs + '_24h_change'] === 'number' ? row[effectiveVs + '_24h_change'] : null,
      market_cap: typeof row[effectiveVs + '_market_cap'] === 'number' ? row[effectiveVs + '_market_cap'] : null,
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
