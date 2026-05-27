// api/fx.js — Node serverless Frankfurter (ECB FX rates) proxy.
//
// FULL-P1-G (audit 2026-05-27) — replaces the previous direct browser-side
// call from js/pfc-fx.js to https://api.frankfurter.dev/v1/latest. Why we
// proxy:
//
//   1. CI flake elimination. The smoke-test on commit 526d778 (FULL-P1-F)
//      caught a transient `net::ERR_FAILED` on the dashboard load when
//      Frankfurter / their Cloudflare edge had a brief blip. Browser
//      reports it as "blocked by CORS policy" because that's how Chrome
//      describes any cross-origin response without an
//      Access-Control-Allow-Origin header — including responses that
//      never arrived. Proxying through our own origin makes the
//      dashboard same-origin for FX, so a 3rd-party blip can no longer
//      trigger a "console errors during dashboard load" CI assertion.
//
//   2. Quota / cost containment. A cross-site <img src="...api/fx?base=
//      USD"> or scraper hot-linking our endpoint would burn Frankfurter
//      quota AND our Vercel compute. Same-origin guard rejects those
//      same as inflation.js (Batch D).
//
//   3. Cache control. Vercel CDN absorbs identical-URL hits via the
//      Cache-Control header below — Frankfurter rates change at most
//      once per business day (ECB publishes weekdays ~16:00 CET), so a
//      6-hour s-maxage with 24-hour stale-while-revalidate means most
//      requests never reach Frankfurter at all, and even Frankfurter
//      outages serve stale rates instead of failing.
//
//   4. Consistent CORS posture. The browser only ever talks to
//      profinancecast.com. No 3rd-party CORS surprises.
//
// USAGE: GET /api/fx?base=USD
//   base = 3-letter ISO 4217 currency code (uppercase enforced)
//
// Response shape (pass-through from Frankfurter, see js/pfc-fx.js
// line 71-75 for the consumer contract):
//   { amount: 1, base: "USD", date: "2026-05-27", rates: {...} }
//
// SUPPORTED bases (ECB-tracked, ~30 currencies) — must stay in sync
// with the SUPPORTED set in js/pfc-fx.js. The client-side check filters
// before the request even fires, but server-side validation here is
// defense in depth (catches a stale-cached pfc-fx.js asking for a base
// we've removed, or a manually-crafted curl).
const SUPPORTED_BASES = new Set([
  'AUD','BGN','BRL','CAD','CHF','CNY','CZK','DKK','EUR','GBP','HKD','HUF',
  'IDR','ILS','INR','ISK','JPY','KRW','MXN','MYR','NOK','NZD','PHP','PLN',
  'RON','SEK','SGD','THB','TRY','USD','ZAR',
]);

const FRANKFURTER_ENDPOINT = 'https://api.frankfurter.dev/v1/latest';

// FULL-P1-G — same-origin guard. Identical pattern to api/inflation.js
// (Batch D) — a public-data 3rd-party proxy that should only serve our
// own dashboard. Reject cross-site GETs (Origin + Referer both missing
// or non-matching) so a hot-linked <img> on a malicious site can't
// burn Frankfurter quota + our Vercel compute.
const APP_ORIGIN_FX = process.env.APP_ORIGIN || 'https://profinancecast.com';

function _normOrig(o) {
  if (!o || typeof o !== 'string') return '';
  try {
    const u = new URL(o);
    return u.protocol + '//' + u.hostname.replace(/^www\./, '') + (u.port ? ':' + u.port : '');
  } catch { return ''; }
}

function _isSameOriginRequest(req) {
  const expected = _normOrig(APP_ORIGIN_FX);
  if (!expected) return true; // dev / preview without APP_ORIGIN — allow
  const origin  = req.headers.origin  || '';
  const referer = req.headers.referer || '';
  if (origin)  return _normOrig(origin)  === expected;
  if (referer) { try { return _normOrig(new URL(referer).origin) === expected; } catch { return false; } }
  return false; // no Origin AND no Referer = reject (hot-linked img / scraper pattern)
}

// FULL-P1-G — lazy import of rate-limit helper (same shape as og.js).
// We keep it lightweight; on cold start with no Upstash env the helper
// soft-fails open (see api/_lib/rate-limit.js — same trade-off as
// payment endpoints; better to serve FX than break the dashboard
// during a Redis outage).
let _rateLimitCheck = null;
async function _checkRateLimit(key) {
  if (!_rateLimitCheck) {
    const mod = await import('./_lib/rate-limit.js');
    _rateLimitCheck = mod.checkRateLimit;
  }
  return _rateLimitCheck(key);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // FULL-P1-G — origin gate BEFORE any compute or upstream call.
  if (!_isSameOriginRequest(req)) {
    return res.status(403).json({ error: 'Forbidden: same-origin only' });
  }

  // FULL-P1-G — per-IP rate limit. Bucket key prefix 'fx:' isolates
  // from PayPal + og buckets. 10/min per IP is generous (a normal
  // dashboard render hits us once and then the localStorage cache in
  // pfc-fx.js holds for 24h) but caps any script abuse to a small
  // multiple of legitimate-user behaviour. Soft-fails open when
  // Upstash isn't configured.
  const xff = req.headers['x-forwarded-for'] || '';
  const ip = (typeof xff === 'string' ? xff.split(',')[0].trim() : '')
          || req.headers['x-real-ip']
          || req.socket?.remoteAddress
          || 'unknown';
  const rl = await _checkRateLimit('fx:' + ip);
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfterSec || 60));
    res.setHeader('Cache-Control', 'no-store'); // don't let CDN cache the 429 past the window
    return res.status(429).json({
      error: 'Too many FX requests. Slow down.',
      retry_after_sec: rl.retryAfterSec,
    });
  }

  // FULL-P1-G — strict base validation. Frankfurter accepts 3-letter
  // ISO 4217; the regex below catches injection attempts and the
  // SUPPORTED_BASES check rejects anything outside the ECB feed before
  // we even hit Frankfurter. This also bounds the CDN cache key space
  // to ~30 entries (one per supported base) so cache poisoning via
  // query-string variation is impossible.
  const rawBase = (req.query.base || 'USD');
  const base = String(rawBase).toUpperCase().trim();
  if (!/^[A-Z]{3}$/.test(base)) {
    return res.status(400).json({ error: 'Invalid base. Use 3-letter ISO 4217 code e.g. USD, EUR.' });
  }
  if (!SUPPORTED_BASES.has(base)) {
    return res.status(400).json({
      error: 'Base currency not in ECB feed. Supported: ' + Array.from(SUPPORTED_BASES).sort().join(', '),
    });
  }

  // Upstream call to Frankfurter. We deliberately do NOT pass any
  // headers that could de-anonymise our users (no x-forwarded-for, no
  // referer, no user-agent) — Frankfurter only needs the URL.
  try {
    const upstreamUrl = FRANKFURTER_ENDPOINT + '?base=' + encodeURIComponent(base);
    const upstream = await fetch(upstreamUrl, {
      headers: { 'Accept': 'application/json' },
      // Node 18+ on Vercel honours AbortSignal.timeout — protect against
      // a hung Frankfurter blocking our function past Vercel's
      // function timeout (which would be a much worse failure mode
      // than a clean 502).
      signal: AbortSignal.timeout(8000),
    });

    if (!upstream.ok) {
      // FULL-P1-G — redact. Frankfurter error bodies can include
      // request-id headers in HTML error pages. Status alone is
      // enough to triage (404 = base unsupported despite our check,
      // 5xx = upstream issue).
      console.error('[fx:upstream] frankfurter returned status=' + upstream.status);
      return res.status(502).json({
        error: 'Upstream FX provider unavailable. Please try again.',
        fallback: true,
      });
    }

    const data = await upstream.json();
    if (!data || typeof data !== 'object' || !data.rates || typeof data.rates !== 'object') {
      console.error('[fx:upstream] frankfurter returned unexpected shape');
      return res.status(502).json({ error: 'Unexpected response shape from FX provider', fallback: true });
    }

    // FULL-P1-G — cache control. ECB publishes once per business day
    // (~16:00 CET weekdays). 6h s-maxage means Vercel CDN serves the
    // same payload to every user for 6 hours before re-fetching.
    // stale-while-revalidate 24h means if Frankfurter is down at
    // revalidation time we keep serving the last known rates instead
    // of failing. Browser max-age is short (5 min) because pfc-fx.js
    // has its own 24h localStorage cache layered on top — no need to
    // also burn HTTP cache space client-side.
    //
    // Vary: Origin keeps the cache key per-origin so a stale Origin
    // can't poison the cache for new ones.
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=21600, stale-while-revalidate=86400');
    res.setHeader('Vary', 'Origin');
    return res.status(200).json(data);

  } catch (err) {
    // FULL-P1-G — redact. AbortSignal.timeout throws TimeoutError;
    // network errors throw with .name = TypeError / FetchError;
    // canonical D2 redaction shape so this is clusterable in Sentry
    // without leaking any caller context.
    console.error('[fx] fetch failed name=' + (err?.name || 'Error') + ' code=' + (err?.code || 'UNKNOWN'));
    return res.status(500).json({
      error: 'Could not fetch FX rates. Please try again.',
      fallback: true,
    });
  }
}
