// api/newsletter/subscribe.js
//
// Stores blog newsletter signups in public.newsletter_signups.
// Public endpoint (no auth required), but rate-limited per IP.
//
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

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
    if (!_rateLimit(ip, 3, 60_000)) {
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
      console.error('newsletter/subscribe insert failed:', error);
      return res.status(200).json({ ok: true, status: 'soft_failure' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('newsletter/subscribe unhandled:', err);
    return res.status(200).json({ ok: true, status: 'error_fallback' });
  }
}
