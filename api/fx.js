// api/fx.js — EDGE-runtime Frankfurter (ECB FX rates) proxy.
//
// FULL-P1-G (audit 2026-05-27) — replaces the previous direct browser-side
// call from js/pfc-fx.js to https://api.frankfurter.dev/v1/latest. Why we
// proxy:
//
//   1. CI flake elimination. The smoke-test on commit 526d778 (FULL-P1-F)
//      caught a transient `net::ERR_FAILED` on dashboard load when
//      Frankfurter/Cloudflare had a brief blip. Browser reports it as
//      "blocked by CORS policy" because that's how Chrome describes any
//      cross-origin response without an Access-Control-Allow-Origin
//      header — including responses that never arrived. Proxying through
//      same-origin makes the dashboard immune to 3rd-party CORS surprises.
//
//   2. Quota / cost containment. A cross-site <img src="...api/fx?base=
//      USD"> or scraper hot-linking our endpoint would burn Frankfurter
//      quota AND our Vercel compute. Same-origin guard rejects those.
//
//   3. Cache control. Vercel CDN absorbs identical-URL hits (s-maxage
//      6h, swr 24h). ECB publishes once per business day so the vast
//      majority of requests never reach Frankfurter at all. SWR keeps
//      serving stale rates if Frankfurter is down at revalidation.
//
//   4. Consistent CORS posture. Browser only ever talks to
//      profinancecast.com.
//
// FULL-P1-G-HOTFIX (audit 2026-05-27) — converted from Node runtime to
// EDGE runtime. Vercel Hobby plan caps Node serverless functions at 12
// and this file was the 13th, blocking the deploy with "No more than 12
// Serverless Functions can be added to a Deployment on the Hobby plan."
// Edge functions don't count against the cap. Frankfurter is Cloudflare-
// fronted with no IP filtering (unlike World Bank — see api/inflation.js
// top comment for that contrast); independent research-agent probe
// confirmed Edge POP IPs are accepted. The other Edge precedents in
// this repo (api/waitlist/subscribe.js makes Resend outbound API calls;
// api/og.js does CPU work via Satori) prove Edge connectivity is
// reliable for this class of upstream.
//
// USAGE: GET /api/fx?base=USD
//   base = 3-letter ISO 4217 currency code (uppercase enforced)
//
// Response shape (pass-through from Frankfurter — see js/pfc-fx.js
// line 88-92 for the consumer contract):
//   { amount, base, date, rates }

import { checkRateLimit } from './_lib/rate-limit.js';

export const config = { runtime: 'edge' };

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

const APP_ORIGIN_FX = (typeof process !== 'undefined' && process.env && process.env.APP_ORIGIN)
  || 'https://profinancecast.com';

function _normOrig(o) {
  if (!o || typeof o !== 'string') return '';
  try {
    const u = new URL(o);
    return u.protocol + '//' + u.hostname.replace(/^www\./, '') + (u.port ? ':' + u.port : '');
  } catch { return ''; }
}

// FULL-P1-G — same-origin guard. Edge-runtime variant: req.headers is a
// Headers object (not a plain dict), so we use .get() instead of bracket
// access. Reject when both Origin AND Referer are missing or non-matching.
function _isSameOriginRequest(req) {
  const expected = _normOrig(APP_ORIGIN_FX);
  if (!expected) return true; // dev / preview without APP_ORIGIN — allow
  const origin  = req.headers.get('origin')  || '';
  const referer = req.headers.get('referer') || '';
  if (origin)  return _normOrig(origin)  === expected;
  if (referer) { try { return _normOrig(new URL(referer).origin) === expected; } catch { return false; } }
  return false; // no Origin AND no Referer = reject (hot-linked img / scraper pattern)
}

// Tiny JSON-Response helper — Edge can't use res.status().json(), it
// returns Response objects directly. Centralised so every error path
// uses the same Content-Type + Cache-Control posture.
function _json(body, status, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign(
      { 'Content-Type': 'application/json; charset=utf-8' },
      extraHeaders || {}
    ),
  });
}

export default async function handler(req) {
  if (req.method !== 'GET') {
    return _json({ error: 'Method not allowed' }, 405, { 'Allow': 'GET' });
  }

  // FULL-P1-G — origin gate BEFORE any compute or upstream call.
  if (!_isSameOriginRequest(req)) {
    return _json({ error: 'Forbidden: same-origin only' }, 403);
  }

  // Edge IP derivation: x-forwarded-for header set by Vercel's edge.
  // Soft-fall to 'unknown' if missing so the limiter still buckets
  // (worst case: all unknown-IP callers share a bucket, which is fine).
  const xff = req.headers.get('x-forwarded-for') || '';
  const ip = xff.split(',')[0].trim()
          || req.headers.get('x-real-ip')
          || 'unknown';

  // FULL-P1-G — per-IP rate limit. Bucket key prefix 'fx:' isolates
  // from PayPal + og + email buckets in the shared limiter. 10/min per
  // IP is generous (dashboard renders once, pfc-fx.js then caches in
  // localStorage for 24h) but bounds scripted abuse. Soft-fails open
  // when Upstash isn't configured (same trade-off as the payment
  // endpoints — better to serve FX than break dashboard during a
  // Redis outage).
  const rl = await checkRateLimit('fx:' + ip);
  if (!rl.allowed) {
    return _json(
      { error: 'Too many FX requests. Slow down.', retry_after_sec: rl.retryAfterSec },
      429,
      {
        'Retry-After': String(rl.retryAfterSec || 60),
        // Don't let CDN cache the 429 past the rate window.
        'Cache-Control': 'no-store',
      }
    );
  }

  // FULL-P1-G — strict base validation. Frankfurter accepts 3-letter
  // ISO 4217; the regex below catches injection attempts and the
  // SUPPORTED_BASES check rejects anything outside the ECB feed before
  // we even hit Frankfurter. This also bounds the CDN cache-key space
  // to ~30 entries (one per supported base) so cache poisoning via
  // query-string variation is impossible.
  let base;
  try {
    const url = new URL(req.url);
    base = (url.searchParams.get('base') || 'USD').toUpperCase().trim();
  } catch {
    return _json({ error: 'Could not parse request URL' }, 400);
  }
  if (!/^[A-Z]{3}$/.test(base)) {
    return _json({ error: 'Invalid base. Use 3-letter ISO 4217 code e.g. USD, EUR.' }, 400);
  }
  if (!SUPPORTED_BASES.has(base)) {
    return _json({
      error: 'Base currency not in ECB feed. Supported: ' + Array.from(SUPPORTED_BASES).sort().join(', '),
    }, 400);
  }

  // Upstream call to Frankfurter. We deliberately do NOT pass any
  // headers that could de-anonymise our users (no x-forwarded-for, no
  // referer, no user-agent) — Frankfurter only needs the URL.
  try {
    const upstreamUrl = FRANKFURTER_ENDPOINT + '?base=' + encodeURIComponent(base);
    const upstream = await fetch(upstreamUrl, {
      headers: { 'Accept': 'application/json' },
      // AbortSignal.timeout is supported in Edge runtime (it's a Web
      // standard, not a Node-only API). Protect against a hung
      // Frankfurter blocking past Vercel's function timeout.
      signal: AbortSignal.timeout(8000),
    });

    if (!upstream.ok) {
      // FULL-P1-G — redact. Frankfurter error bodies can include
      // request-id headers in HTML error pages. Status alone is
      // enough to triage (404 = base unsupported despite our check,
      // 5xx = upstream issue).
      console.error('[fx:upstream] frankfurter returned status=' + upstream.status);
      return _json({
        error: 'Upstream FX provider unavailable. Please try again.',
        fallback: true,
      }, 502);
    }

    const data = await upstream.json();
    if (!data || typeof data !== 'object' || !data.rates || typeof data.rates !== 'object') {
      console.error('[fx:upstream] frankfurter returned unexpected shape');
      return _json({ error: 'Unexpected response shape from FX provider', fallback: true }, 502);
    }

    // FULL-P1-G — cache control. ECB publishes once per business day
    // (~16:00 CET weekdays). 6h s-maxage means Vercel CDN serves the
    // same payload for 6 hours before re-fetching. stale-while-
    // revalidate 24h means if Frankfurter is down at revalidation
    // time we keep serving last-known rates instead of failing.
    // Browser max-age is short (5 min) because pfc-fx.js has its own
    // 24h localStorage cache layered on top.
    //
    // Vary: Origin keeps the cache key per-origin so a stale Origin
    // can't poison the cache for new ones.
    return _json(data, 200, {
      'Cache-Control': 'public, max-age=300, s-maxage=21600, stale-while-revalidate=86400',
      'Vary': 'Origin',
    });

  } catch (err) {
    // FULL-P1-G — redact. AbortSignal.timeout throws TimeoutError;
    // network errors throw with .name = TypeError / FetchError;
    // canonical D2 redaction shape so this is clusterable in Sentry
    // without leaking any caller context.
    console.error('[fx] fetch failed name=' + (err?.name || 'Error') + ' code=' + (err?.code || 'UNKNOWN'));
    return _json({
      error: 'Could not fetch FX rates. Please try again.',
      fallback: true,
    }, 500);
  }
}
