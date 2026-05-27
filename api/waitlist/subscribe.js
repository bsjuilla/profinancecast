// api/waitlist/subscribe.js — W24 GDPR-compliant waitlist subscribe endpoint.
//
// EDGE RUNTIME (not Node). Switched from Node to Edge in W24-fix because
// Vercel Hobby plan caps Node serverless functions at 12; adding this one
// pushed the project to 13 and broke the deploy. Edge functions don't
// count against the Hobby cap.
//
// Edge runtime constraints applied here:
//   - Node `crypto` module unavailable → use Web Crypto (crypto.subtle)
//   - `req.body` doesn't auto-parse → `await req.json()`
//   - `req.headers['x-forwarded-for']` unavailable → `req.headers.get(...)`
//   - `res.status(...).json(...)` unavailable → `new Response(...)`
//   - Module state doesn't persist across invocations → rate limit dropped
//     (replace with Upstash Redis if abuse becomes an issue; spam already
//     mitigated by the email UNIQUE constraint + GDPR consent gate)
//
// POST /api/waitlist/subscribe
//   body: { email: string, use_case?: string, consent: true, source?: string }
//   returns: { ok: true } | { error: '...', code: '...' }
//
// Required env vars:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   RESEND_API_KEY  (https://resend.com/api-keys)
//   RESEND_FROM     (e.g. "ProFinanceCast <hello@profinancecast.com>"
//                   or temporarily "ProFinanceCast <onboarding@resend.dev>"
//                   before domain verification completes)

// FULL-P0-C3 hardening (audit 2026-05-26) — pre-fix this endpoint had
// ZERO rate limit (the W24-fix comment above admits "rate limit dropped"
// when migrating to Edge runtime). Result: a script could mass-signup
// thousands of victim emails (Joe-job attack) until Resend rate-limits
// our domain. We now apply TWO independent buckets via the shared
// Upstash helper:
//   • waitlist-ip:{ip}    → caps signup rate per source IP (anti-script)
//   • waitlist-email:{email} → caps signups for a single victim address
//                              (anti-email-bomb — a single attacker
//                              spinning new IPs can't keep hammering
//                              one victim's inbox)
// Both soft-fail open if Upstash isn't configured (same trade-off
// pattern as the PayPal endpoints — better to allow legit signups
// than block when Redis is down).
export const config = { runtime: 'edge' };

import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '../_lib/rate-limit.js';

const EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;
const ALLOWED_USE_CASES = new Set(['cross-border', 'fire', 'household', 'other', '']);

function _json(body, status, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign(
      { 'Content-Type': 'application/json; charset=utf-8' },
      extraHeaders || {}
    ),
  });
}

// Web Crypto SHA-256 → hex. Replaces Node's createHash('sha256').
async function _sha256Hex(input) {
  const buf = new TextEncoder().encode(input);
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function _sendWelcomeEmail(email) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || 'ProFinanceCast <onboarding@resend.dev>';
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
          "(One-click unsubscribe link coming in the next release.)",
      }),
    });
    if (!res.ok) {
      // FULL-P1-E (audit 2026-05-27) — drop errBody. Resend error
      // responses include the destination email and our API key prefix
      // on some error paths (auth_failed, quota_exceeded). Status code
      // is enough to classify retry-or-give-up.
      console.warn('[waitlist:resend] send failed status=' + res.status);
      return { sent: false, reason: 'resend_http_' + res.status };
    }
    return { sent: true };
  } catch (e) {
    // FULL-P1-E — redact. e.message on network errors can include the
    // destination URL with our auth header in stack frames.
    console.warn('[waitlist:resend] send threw name=' + (e?.name || 'Error') + ' code=' + (e?.code || 'UNKNOWN'));
    return { sent: false, reason: 'resend_threw' };
  }
}

export default async function handler(req) {
  try {
    if (req.method !== 'POST') {
      return _json({ error: 'Method not allowed', code: 'METHOD' }, 405);
    }

    let body;
    try { body = await req.json(); } catch (_) { body = {}; }

    const email = String(body.email || '').trim().toLowerCase();
    const useCase = String(body.use_case || '').trim().toLowerCase();
    const source = String(body.source || 'waitlist_page').slice(0, 40);
    const consent = body.consent === true;

    if (!email || !EMAIL_RE.test(email)) {
      return _json({ error: 'Invalid email', code: 'BAD_EMAIL' }, 400);
    }
    if (email.length > 254) {
      return _json({ error: 'Email too long', code: 'BAD_EMAIL' }, 400);
    }
    if (!consent) {
      return _json({
        error: 'Consent required — tick the box to confirm GDPR opt-in',
        code: 'MISSING_CONSENT',
      }, 400);
    }
    if (useCase && !ALLOWED_USE_CASES.has(useCase)) {
      return _json({ error: 'Invalid use_case', code: 'BAD_USE_CASE' }, 400);
    }

    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim()
            || req.headers.get('x-real-ip')
            || 'unknown';

    // FULL-P0-C3 — IP + email rate limits, checked BEFORE the Resend send
    // so we never email a victim that's being targeted. We return a
    // soft-success (ok:true) on rate-limit hits to avoid telling the
    // attacker whether the bucket is actually blocking — same posture as
    // the duplicate-email path below. Sliding window is 10/60s per the
    // shared helper config; per the audit math that's well above legit
    // user behaviour (one signup per session) but tight enough to
    // throttle scripted abuse to manageable bounds.
    const [ipCheck, emailCheck] = await Promise.all([
      checkRateLimit('waitlist-ip:' + ip),
      checkRateLimit('waitlist-email:' + email),
    ]);
    if (!ipCheck.allowed || !emailCheck.allowed) {
      const retryAfter = Math.max(ipCheck.retryAfterSec || 0, emailCheck.retryAfterSec || 0);
      return _json(
        { ok: true, status: 'rate_limited' },
        200,
        retryAfter ? { 'Retry-After': String(retryAfter) } : null
      );
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('waitlist/subscribe: missing Supabase env vars');
      // Soft success so the UI doesn't expose infra gaps
      return _json({ ok: true, status: 'config_missing' }, 200);
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const ipHash = (await _sha256Hex(ip + ':' + (process.env.SUPABASE_URL || ''))).slice(0, 32);

    const { error } = await supabase.from('waitlist').insert({
      email: email,
      use_case: useCase || null,
      source: source,
      consent_at: new Date().toISOString(),
      ip_hash: ipHash,
      user_agent: (req.headers.get('user-agent') || '').slice(0, 240),
    });

    // Duplicate signup → soft success (no PII leakage about who's on the list)
    const isDuplicate = error && /duplicate|unique/i.test(error.message || '');
    if (error && !isDuplicate) {
      // FULL-P1-E (audit 2026-05-27) — redact. The Supabase error object
      // for an INSERT INTO waitlist can include the email being inserted
      // on error.details / error.hint depending on the constraint
      // violated. Same pattern as newsletter/subscribe.js D2.
      console.error('[waitlist/subscribe] insert failed code=' + (error?.code || 'UNKNOWN'));
      return _json({ ok: true, status: 'soft_failure' }, 200);
    }

    // Welcome email — best-effort. Awaited in Edge runtime because the
    // function instance terminates when the response is returned;
    // non-awaited promises get cancelled. Small latency cost (~200ms)
    // is acceptable for a once-per-signup transactional email.
    if (!isDuplicate) {
      try { await _sendWelcomeEmail(email); }
      // FULL-P1-E — redact e.message; can leak email or Resend token.
      catch (e) { console.warn('[waitlist] welcome email failed name=' + (e?.name || 'Error') + ' code=' + (e?.code || 'UNKNOWN')); }
    }

    return _json({ ok: true }, 200);
  } catch (err) {
    // FULL-P1-E — redact stack. Unhandled in this handler means the
    // stack contains parsed body fields (email + use_case + source).
    console.error('[waitlist/subscribe] unhandled name=' + (err?.name || 'Error') + ' code=' + (err?.code || 'UNKNOWN'));
    return _json({ ok: true, status: 'error_fallback' }, 200);
  }
}
