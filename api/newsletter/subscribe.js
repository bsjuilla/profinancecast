// api/newsletter/subscribe.js
//
// Stores blog newsletter signups in public.newsletter_signups.
// Public endpoint (no auth required), but rate-limited per IP.
//
// FULL-P0-C4 hardening (audit 2026-05-26) — pre-fix the rate limit was
// `new Map()` scoped to the function module, which is per-isolate on
// Vercel. An attacker could trivially bypass by triggering cold starts
// (random query strings, distributed IPs, parallel connections). The
// in-memory check is kept as a defense-in-depth fast path (catches the
// dumbest abuse without a Redis round-trip), but the authoritative
// cross-isolate check now goes through the shared Upstash helper.
// EITHER bucket trip = 429. Both soft-fail open if Upstash is missing.
//
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional (recommended in prod): UPSTASH_REDIS_REST_URL / KV_REST_API_URL
//                                  for cross-isolate rate-limit enforcement

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { checkRateLimit } from '../_lib/rate-limit.js';

const _rateBuckets = new Map();
function _rateLimit(key, max = 3, windowMs = 60_000) {
  if (!key) return true;
  const now = Date.now();
  const bucket = (_rateBuckets.get(key) || []).filter(t => now - t < windowMs);
  if (bucket.length >= max) return false;
  bucket.push(now);
  _rateBuckets.set(key, bucket);
  if (_rateBuckets.size > 5000) {
    for (const [k, v] of _rateBuckets) {
      if (!v.length || (now - v[v.length - 1]) > 5 * 60_000) _rateBuckets.delete(k);
    }
  }
  return true;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { email, source } = req.body || {};
    if (!email || typeof email !== 'string' ||
        !/^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/.test(email.trim())) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim()
            || req.socket?.remoteAddress || 'unknown';

    // FULL-P0-C4 — two-layer rate limit. The in-memory check is a free
    // fast-path; the Upstash check is the authoritative cross-isolate
    // gate. Run them in parallel so the worst case is one Redis round-
    // trip instead of two. EITHER tripping = 429.
    const normalizedEmail = email.trim().toLowerCase();
    const [memOk, ipUpstash, emailUpstash] = await Promise.all([
      Promise.resolve(_rateLimit(ip, 3, 60_000)),
      checkRateLimit('newsletter-ip:' + ip),
      checkRateLimit('newsletter-email:' + normalizedEmail),
    ]);
    if (!memOk || !ipUpstash.allowed || !emailUpstash.allowed) {
      const retryAfter = Math.max(
        ipUpstash.retryAfterSec || 0,
        emailUpstash.retryAfterSec || 0,
        memOk ? 0 : 60
      );
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Too many signups, slow down' });
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('newsletter/subscribe: missing Supabase env vars');
      // Soft success so the UI doesn't expose config gaps to the user
      return res.status(200).json({ ok: true, status: 'config_missing' });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const ipHash = createHash('sha256').update(ip + ':' + (process.env.SUPABASE_URL || '')).digest('hex').slice(0, 32);

    const { error } = await supabase.from('newsletter_signups').insert({
      email: email.trim().toLowerCase(),
      source: (source || 'blog').slice(0, 40),
      user_agent: (req.headers['user-agent'] || '').slice(0, 240),
      ip_hash: ipHash,
    });

    // Treat unique-violation as success ("already subscribed" is fine for UX)
    if (error && !/duplicate|unique/i.test(error.message || '')) {
      // FULL-P1-D2 (audit 2026-05-27) — redact. The Supabase error object
      // can include row-level details (the email being inserted ends up
      // in error.details on uniqueness conflicts or RLS denials). Logging
      // it raw means newsletter emails land in our log aggregator in
      // plain text. code-only keeps clustering useful without PII.
      console.error('[newsletter/subscribe] insert failed code=' + (error?.code || 'UNKNOWN'));
      return res.status(200).json({ ok: true, status: 'soft_failure' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    // FULL-P1-D2 — redact stack. Unhandled errors can include the parsed
    // body (email + source) in their stack frames depending on where they
    // throw. Log only error name + code.
    console.error('[newsletter/subscribe] unhandled name=' + (err?.name || 'Error') + ' code=' + (err?.code || 'UNKNOWN'));
    return res.status(200).json({ ok: true, status: 'error_fallback' });
  }
}
