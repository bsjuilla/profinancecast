// api/og.js
//
// Dynamic Open Graph image generator. Renders a 1200x630 PNG for any page
// based on URL params. Each HTML page sets <meta property="og:image"> to
// /api/og?title=...&eyebrow=...&subtitle=... so social-share previews
// show a brand-consistent card with the page's actual content.
//
// Free on Vercel Hobby (Edge runtime). No build step required.
//
// Implementation note: this file is plain JavaScript — NOT JSX/TSX. The
// previous .tsx version failed to deploy because Vercel's default TS
// compile profile doesn't enable JSX, and adding a tsconfig+React peer
// dep is a heavier change than necessary. Satori (the engine inside
// @vercel/og) accepts plain objects with shape { type, props } so a
// tiny `h()` helper gives us JSX-equivalent ergonomics with zero build
// complexity.
//
// USAGE:
//   /api/og                                  → default ProFinanceCast card
//   /api/og?title=The%20rule%20of%2050-30-20 → custom title
//   /api/og?eyebrow=Blog%20%C2%B7%20Budgeting&title=...&subtitle=...

import { ImageResponse } from '@vercel/og';
import { checkRateLimit } from './_lib/rate-limit.js';

export const config = { runtime: 'edge' };

// Lightweight createElement-style helper. Builds plain objects in the
// shape Satori expects: { type, key, props: { children, style, ... } }.
const h = (type, props, ...children) => ({
  type,
  key: null,
  props: {
    ...(props || {}),
    children: children.length === 0 ? undefined
            : children.length === 1 ? children[0]
            : children,
  },
});

// FULL-P1-D4 (audit 2026-05-27) — per-IP rate limit. og.js is the only
// Edge-runtime function we ship and the only one that does real CPU
// work per request (Satori SVG layout + PNG encode = ~150–300ms each).
// The Cache-Control header below (public, s-maxage=2592000 immutable)
// makes Vercel's CDN absorb repeated identical URLs, but an attacker
// can trivially bypass that by varying the query string:
//   /api/og?title=spam_1, /api/og?title=spam_2, ...
// Each unique URL is a cache miss → real compute → real $$$ on our
// @vercel/og minutes. At 5 req/s sustained from one IP that's ~430k
// renders/day — well into Vercel's per-function compute budget on
// Hobby. Cap at 60 renders/minute per IP (10/min default in the
// shared limiter × 6) — generous for any legit social-card scraper
// (Twitter/Facebook/LinkedIn re-fetch maybe 2-3x/page) but enough to
// stop quota-burn abuse.
//
// Soft-fails OPEN when Upstash isn't configured — same trade-off as
// the payment endpoints. Better to let social cards render than to
// brick OG previews during a Redis outage.
function _ipFromEdgeReq(req) {
  const xff = req.headers.get('x-forwarded-for') || '';
  const first = xff.split(',')[0].trim();
  return first || req.headers.get('x-real-ip') || 'unknown';
}

export default async function handler(req) {
  // FULL-P1-D4 — rate-limit BEFORE we spend any CPU on Satori.
  const ip = _ipFromEdgeReq(req);
  const rl = await checkRateLimit('og:' + ip);
  if (!rl.allowed) {
    return new Response(
      JSON.stringify({ error: 'Too many og-image requests. Slow down.', retry_after_sec: rl.retryAfterSec }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Retry-After': String(rl.retryAfterSec || 60),
          // Tell CDN NOT to cache the 429 — once the window expires
          // the IP should be able to retry without waiting for any
          // stale negative cache to evict.
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  const url = new URL(req.url);
  const title    = (url.searchParams.get('title')    || 'See where your money lands in 2036.').slice(0, 140);
  const eyebrow  = (url.searchParams.get('eyebrow')  || 'ProFinanceCast').slice(0, 40);
  const subtitle = (url.searchParams.get('subtitle') || 'The forecast your bank should give you. Free, no bank login.').slice(0, 220);

  return new ImageResponse(
    h('div', {
        style: {
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(135deg, #0B1410 0%, #1A2520 100%)',
          padding: '80px',
          position: 'relative',
          color: '#F0EDE2',
          fontFamily: 'sans-serif',
        },
      },
      // Gold hairline at top
      h('div', {
        style: {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '4px',
          background: 'linear-gradient(90deg, transparent 0%, #D4AF6A 50%, transparent 100%)',
          display: 'flex',
        },
      }),
      // Eyebrow
      h('div', {
        style: {
          display: 'flex',
          fontSize: 22,
          color: '#D4AF6A',
          textTransform: 'uppercase',
          letterSpacing: '0.18em',
          fontFamily: 'monospace',
        },
      }, eyebrow),
      // Title
      h('div', {
        style: {
          display: 'flex',
          fontSize: title.length > 60 ? 64 : 80,
          fontStyle: 'italic',
          fontWeight: 500,
          lineHeight: 1.05,
          color: '#F0EDE2',
          maxWidth: '1040px',
          marginTop: 'auto',
          fontFamily: 'serif',
          letterSpacing: '-0.01em',
        },
      }, title),
      // Subtitle
      h('div', {
        style: {
          display: 'flex',
          fontSize: 28,
          color: '#B8C2BC',
          lineHeight: 1.4,
          maxWidth: '1040px',
          marginTop: 24,
          fontFamily: 'sans-serif',
        },
      }, subtitle),
      // Logo + domain
      h('div', {
          style: {
            position: 'absolute',
            bottom: 80,
            right: 80,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          },
        },
        h('div', {
          style: {
            width: 40,
            height: 40,
            background: '#2BB67D',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 17,
            fontWeight: 700,
            color: '#0B1410',
            fontFamily: 'sans-serif',
          },
        }, 'PF'),
        h('div', {
          style: {
            display: 'flex',
            fontSize: 22,
            color: '#B8C2BC',
            fontFamily: 'monospace',
          },
        }, 'profinancecast.com'),
      ),
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        'Cache-Control': 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400, immutable',
      },
    }
  );
}
