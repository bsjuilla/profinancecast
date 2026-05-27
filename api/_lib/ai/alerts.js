// api/_lib/ai/alerts.js
//
// FULL-P1-I fix — alert sink for the AI cascade. Fires Resend email +
// Slack webhook on provider failures, cascade exhaustion, and CEO escalation.
// _alertOps/_alertViaEmail/_alertViaSlack copied verbatim from
// api/subscription/cancel.js lines 70-117.
//
// THROTTLE: Upstash SET NX EX 3600 — only sends if key was absent.
// If Upstash unset → throttle disabled, every event sends.
// If ALERT_EMAIL unset → no-op (no crash).
//
// PII-redacted logs only. ESM. 2-space indent. Single quotes.

import { Redis } from '@upstash/redis';

// ---------------------------------------------------------------------------
// Upstash lazy-init (same pattern as api/_lib/rate-limit.js)
// ---------------------------------------------------------------------------

let _redisClient = null;
let _redisWarnedOnce = false;

function _getRedis() {
  if (_redisClient !== null) return _redisClient;

  const url   = process.env.UPSTASH_REDIS_REST_URL  || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    if (!_redisWarnedOnce) {
      console.warn('[ai/alerts] no Upstash/KV env vars — alert throttle disabled (every event will send).');
      _redisWarnedOnce = true;
    }
    _redisClient = false;
    return false;
  }

  try {
    _redisClient = new Redis({ url, token });
    return _redisClient;
  } catch (e) {
    console.error('[ai/alerts] Redis init failed — alert throttle disabled:', e?.message || e);
    _redisClient = false;
    return false;
  }
}

// ---------------------------------------------------------------------------
// _alertOps / _alertViaEmail / _alertViaSlack
// Copied verbatim from api/subscription/cancel.js lines 70-117.
// ---------------------------------------------------------------------------

async function _alertOps(subject, body) {
  await Promise.allSettled([
    _alertViaEmail(subject, body),
    _alertViaSlack(subject, body),
  ]);
}

async function _alertViaEmail(subject, body) {
  const apiKey = process.env.RESEND_API_KEY;
  const to     = process.env.ALERT_EMAIL;
  const from   = process.env.ALERT_FROM_EMAIL || 'alerts@profinancecast.com';
  if (!apiKey || !to) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from, to: [to],
        subject: `[PFC alerts] ${subject}`,
        text: body,
      }),
    });
  } catch (e) {
    console.error('[ai/alerts] _alertViaEmail failed:', e?.message || e);
  }
}

async function _alertViaSlack(subject, body) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return;
  try {
    const truncated = String(body).slice(0, 2500);
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `🚨 *${subject}*\n\`\`\`${truncated}\`\`\``,
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: `🚨 ${subject}`.slice(0, 150) } },
          { type: 'section', text: { type: 'mrkdwn', text: '```' + truncated + '```' } },
          { type: 'context', elements: [{ type: 'mrkdwn', text: `_ProFinanceCast AI alert · ${new Date().toISOString()}_` }] },
        ],
      }),
    });
  } catch (e) {
    console.error('[ai/alerts] _alertViaSlack failed:', e?.message || e);
  }
}

// ---------------------------------------------------------------------------
// Throttle helper — SET key '1' NX EX 3600; returns true if we OWN the send
// ---------------------------------------------------------------------------

async function _acquireThrottleSlot(key, ttlSec = 3600) {
  const redis = _getRedis();
  if (!redis) return true;  // no throttle → always send
  try {
    // SET NX EX: returns 'OK' if set (slot acquired), null if key existed
    const result = await redis.set(key, '1', { nx: true, ex: ttlSec });
    return result === 'OK';
  } catch (e) {
    console.error('[ai/alerts] throttle check failed — sending anyway:', e?.message || e);
    return true;
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Fire an alert for a single provider failure (throttled 1/hour per provider+reason).
 *
 * @param {string} providerId
 * @param {'QUOTA'|'TIMEOUT'|'NETWORK'|'UPSTREAM_5XX'} reason
 * @param {number|null} status   HTTP status code (may be null for network errors)
 * @param {object} extra         chainState, nextProvider, cooldownSec, activeCooldowns
 * @returns {Promise<void>}
 */
export async function alertProviderFailure(providerId, reason, status, extra = {}) {
  const throttleKey = `ai:alert:${providerId}:${reason}`;
  const shouldSend = await _acquireThrottleSlot(throttleKey, 3600);
  if (!shouldSend) return;

  const subject = `AI provider failure — ${providerId} / ${reason}`;
  const body = [
    `Provider: ${providerId}`,
    `Reason: ${reason}`,
    `HTTP status: ${status ?? 'N/A'}`,
    `Timestamp: ${new Date().toISOString()}`,
    `Chain state: ${extra.chainState ?? 'unknown'}`,
    `Next provider: ${extra.nextProvider ?? 'NONE (cascade)'}`,
    `Active cooldowns: ${JSON.stringify(extra.activeCooldowns ?? {})}`,
    '',
    extra.cooldownSec != null
      ? `If cooldown is set, recovery in: ${extra.cooldownSec}s`
      : 'No cooldown set.',
    'No further alerts for this provider+reason for 1 hour.',
  ].join('\n');

  await _alertOps(subject, body);
}

/**
 * Fire the severity-2 cascade-exhausted alert (separate throttle, 1/hour).
 *
 * @param {object} extra   activeProviders, cooldowns, minRetryAfterSec
 * @returns {Promise<void>}
 */
export async function alertCascadeExhausted(extra = {}) {
  const throttleKey = 'ai:alert:cascade';
  const shouldSend = await _acquireThrottleSlot(throttleKey, 3600);
  if (!shouldSend) return;

  // Increment 24h cascade counter (used by alertCeoIfRepeated)
  await _increment24hCascadeCounter();

  const subject = 'ALL AI PROVIDERS EXHAUSTED — Sage AI degraded';
  const body = [
    '🚨 ALL AI PROVIDERS EXHAUSTED 🚨',
    '',
    'Sage AI is degraded. Cascade reached terminal state.',
    `Active providers: ${JSON.stringify(extra.activeProviders ?? [])}`,
    `Cooldowns: ${JSON.stringify(extra.cooldowns ?? {})}`,
    `Min retry-after across providers: ${extra.minRetryAfterSec ?? 'unknown'}s`,
    '',
    'If this fires 3+ times in 24h, the system will email CEO_ALERT_EMAIL with a higher-priority escalation.',
    '',
    'Investigate: are we hitting genuine limits, or are providers failing?',
  ].join('\n');

  await _alertOps(subject, body);
}

/**
 * CEO escalation: if cascade has fired 3+ times in 24h, email CEO_ALERT_EMAIL.
 * Reads the 24h counter set by alertCascadeExhausted.
 *
 * @returns {Promise<void>}
 */
export async function alertCeoIfRepeated() {
  const redis = _getRedis();
  if (!redis) return;

  try {
    const raw = await redis.get('ai:alert:cascade:24h-counter');
    const count = parseInt(raw ?? '0', 10) || 0;
    if (count < 3) return;

    // Throttle the CEO email itself — only once per 24h counter window
    const ceoThrottleKey = 'ai:alert:cascade:ceo-sent';
    const slot = await _acquireThrottleSlot(ceoThrottleKey, 60 * 60 * 24);
    if (!slot) return;

    const ceoEmail = process.env.CEO_ALERT_EMAIL;
    const apiKey   = process.env.RESEND_API_KEY;
    const from     = process.env.ALERT_FROM_EMAIL || 'alerts@profinancecast.com';
    if (!ceoEmail || !apiKey) return;

    const subject = 'PFC: Sage AI down 3x in 24h — review provider strategy';
    const body = [
      '🚨🚨 PFC: Sage AI down 3x in 24h — review provider strategy',
      '',
      'Cascade-exhausted has fired 3+ times in the last 24 hours.',
      'This suggests sustained capacity issues, not transient ones.',
      '',
      'Action required:',
      '1. Review provider rate-limit health',
      '2. Consider upgrading Groq plan or adding paid Gemini',
      '3. Check Sage usage patterns for anomalies (bot abuse?)',
    ].join('\n');

    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [ceoEmail],
          subject: `[PFC CEO ALERT] ${subject}`,
          text: body,
        }),
      });
      console.warn('[ai/alerts] CEO escalation email sent — cascade fired 3+ times in 24h');
    } catch (e) {
      console.error('[ai/alerts] CEO escalation email failed:', e?.message || e);
    }
  } catch (e) {
    console.error('[ai/alerts] alertCeoIfRepeated check failed:', e?.message || e);
  }
}

// ---------------------------------------------------------------------------
// Internal: increment the 24h cascade counter (TTL 24h, set on first incr)
// ---------------------------------------------------------------------------

async function _increment24hCascadeCounter() {
  const redis = _getRedis();
  if (!redis) return;
  try {
    const key = 'ai:alert:cascade:24h-counter';
    const pipeline = redis.pipeline();
    pipeline.incr(key);
    pipeline.expire(key, 60 * 60 * 24);
    await pipeline.exec();
  } catch (e) {
    console.error('[ai/alerts] cascade counter increment failed:', e?.message || e);
  }
}
