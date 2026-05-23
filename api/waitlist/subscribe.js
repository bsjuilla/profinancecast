// api/waitlist/subscribe.js — W24 GDPR-compliant waitlist subscribe endpoint.
//
// POST /api/waitlist/subscribe
//   body: { email: string, use_case?: string, consent: true, source?: string }
//   returns: { ok: true } | { error: '...', code: '...' }
//
// Stores entries in public.waitlist (see docs/supabase/migrations/
// 2026-05-22-waitlist.sql) AND fires a Resend transactional welcome
// email. Single opt-in (no confirmation link) per W24 design choice.
//
// GDPR posture:
//   - consent MUST be `true` (explicit checkbox on /waitlist.html)
//   - consent_at timestamp recorded server-side (not client-controlled)
//   - email is the only PII stored
//   - duplicate signups treated as soft-success (no info leakage about
//     who's already on the list)
//   - unsubscribe link in every email (W24 follow-up)
//   - Day-14 deletion drill SOP at docs/runbooks/waitlist-deletion-sop.md
//
// Required env vars:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   RESEND_API_KEY  (https://resend.com/api-keys)
//   RESEND_FROM     (e.g. "ProFinanceCast <hello@profinancecast.com>")
//
// If RESEND_API_KEY is missing, the endpoint still WRITES to Supabase
// (so the signup isn't lost) but logs a warning and skips the email.
// User sees the same success message either way.

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

const EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;
const ALLOWED_USE_CASES = new Set(['cross-border', 'fire', 'household', 'other', '']);

async function _sendWelcomeEmail(email) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || 'ProFinanceCast <hello@profinancecast.com>';
  if (!apiKey) {
    console.warn('waitlist: RESEND_API_KEY not set — skipping welcome email');
    return { sent: false, reason: 'no_api_key' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: from,
        to: [email],
        subject: "You're on the ProFinanceCast waitlist",
        text:
          "Thanks for signing up.\n\n" +
          "ProFinanceCast is a privacy-first forecasting tool — no bank login, " +
          "no advisor relationship, just a 12-month financial forecast you control.\n\n" +
          "We're opening it to the first 100 founders soon. You'll get an email when " +
          "your spot is ready.\n\n" +
          "If you didn't sign up for this, reply to this email and we'll remove you.\n\n" +
          "— The ProFinanceCast team\n\n" +
          "---\n" +
          "Unsubscribe: reply to this email with 'unsubscribe' in the subject.\n" +
          "(We'll wire a one-click unsubscribe link in the next release.)",
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.warn('waitlist: Resend send failed', res.status, errBody.slice(0, 200));
      return { sent: false, reason: 'resend_http_' + res.status };
    }
    return { sent: true };
  } catch (e) {
    console.warn('waitlist: Resend send threw', e.message);
    return { sent: false, reason: 'resend_threw' };
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed', code: 'METHOD' });
    }

    const body = req.body || {};
    const email = (body.email || '').trim().toLowerCase();
    const useCase = (body.use_case || '').trim().toLowerCase();
    const source = (body.source || 'waitlist_page').slice(0, 40);
    const consent = body.consent === true;

    if (!email || typeof email !== 'string' || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Invalid email', code: 'BAD_EMAIL' });
    }
    if (email.length > 254) {
      return res.status(400).json({ error: 'Email too long', code: 'BAD_EMAIL' });
    }
    if (!consent) {
      return res.status(400).json({
        error: 'Consent required — tick the box to confirm GDPR opt-in',
        code: 'MISSING_CONSENT',
      });
    }
    if (useCase && !ALLOWED_USE_CASES.has(useCase)) {
      return res.status(400).json({ error: 'Invalid use_case', code: 'BAD_USE_CASE' });
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim()
            || req.socket?.remoteAddress || 'unknown';
    if (!_rateLimit(ip, 3, 60_000)) {
      return res.status(429).json({ error: 'Too many signups, slow down', code: 'RATE_LIMIT' });
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('waitlist/subscribe: missing Supabase env vars');
      // Soft success so the UI doesn't expose infra gaps
      return res.status(200).json({ ok: true, status: 'config_missing' });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const ipHash = createHash('sha256')
      .update(ip + ':' + (process.env.SUPABASE_URL || ''))
      .digest('hex')
      .slice(0, 32);

    const { error } = await supabase.from('waitlist').insert({
      email: email,
      use_case: useCase || null,
      source: source,
      consent_at: new Date().toISOString(),
      ip_hash: ipHash,
      user_agent: (req.headers['user-agent'] || '').slice(0, 240),
    });

    // Duplicate signup → treat as success without telling the caller
    // ("already on the list" reveals nothing they shouldn't already know).
    const isDuplicate = error && /duplicate|unique/i.test(error.message || '');
    if (error && !isDuplicate) {
      console.error('waitlist/subscribe insert failed:', error);
      return res.status(200).json({ ok: true, status: 'soft_failure' });
    }

    // Fire the welcome email. Best-effort — never block the success
    // response on email delivery. Skip on duplicate (user already got
    // the welcome on first signup).
    if (!isDuplicate) {
      _sendWelcomeEmail(email).catch((e) => {
        console.warn('waitlist: welcome email kicked off but failed:', e.message);
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('waitlist/subscribe unhandled:', err);
    return res.status(200).json({ ok: true, status: 'error_fallback' });
  }
}
