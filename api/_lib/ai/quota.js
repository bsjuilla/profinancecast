// api/_lib/ai/quota.js
//
// FULL-P1-I fix — per-provider quota tracking + cooldown management for the
// AI cascade. Sibling to api/_lib/rate-limit.js (same Upstash lazy-init +
// soft-fail-open posture). This module is a SEPARATE concern from the payment
// rate limiter: it tracks per-minute / per-day call counters and records
// provider cooldowns when a 429 is received from an upstream AI API.
//
// KEY SCHEME (all TTL-bound; no manual cleanup needed):
//   ai:rpm:<provider>:<unixMin>   — TTL 70s
//   ai:rpd:<provider>:<utcDate>   — TTL 26h
//   ai:cooldown:<provider>        — TTL = Retry-After (capped 3600s)
//
// SAFETY POSTURE: NEVER block AI requests on Upstash availability.
// Soft-fail open in all error / env-unset paths.

import { Redis } from '@upstash/redis';

let _client = null;  // null = uninitialised; false = disabled this cold start
let _warnedOnce = false;

function _getClient() {
  if (_client !== null) return _client;

  const url   = process.env.UPSTASH_REDIS_REST_URL  || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    if (!_warnedOnce) {
      console.warn('[ai/quota] no Upstash/KV env vars detected — quota tracking disabled (soft-fail open). Set KV_REST_API_URL+TOKEN (Vercel KV) or UPSTASH_REDIS_REST_URL+TOKEN (standalone) to enable.');
      _warnedOnce = true;
    }
    _client = false;
    return false;
  }

  try {
    _client = new Redis({ url, token });
    return _client;
  } catch (e) {
    console.error('[ai/quota] init failed (soft-failing open):', e?.message || e);
    _client = false;
    return false;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _rpmKey(providerId) {
  const unixMin = Math.floor(Date.now() / 60_000);
  return `ai:rpm:${providerId}:${unixMin}`;
}

function _rpdKey(providerId) {
  const utcDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `ai:rpd:${providerId}:${utcDate}`;
}

function _cooldownKey(providerId) {
  return `ai:cooldown:${providerId}`;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Check if a provider is currently in cooldown (had a 429 recently).
 * Safe default: false (allow the attempt).
 *
 * @param {string} providerId
 * @returns {Promise<boolean>}
 */
export async function isInCooldown(providerId) {
  const client = _getClient();
  if (!client) return false;
  try {
    const val = await client.get(_cooldownKey(providerId));
    return val !== null;
  } catch (e) {
    console.error('[ai/quota] isInCooldown failed (soft-failing open):', e?.message || e);
    return false;
  }
}

/**
 * Mark a provider as in cooldown for retryAfterSec seconds (max 3600).
 * Called by the adapter when it receives a QUOTA / 429 response.
 *
 * @param {string} providerId
 * @param {number} retryAfterSec
 * @returns {Promise<void>}
 */
export async function setCooldown(providerId, retryAfterSec) {
  const client = _getClient();
  if (!client) return;
  const ttl = Math.min(Math.max(1, retryAfterSec), 3600);
  try {
    await client.set(_cooldownKey(providerId), '1', { ex: ttl });
  } catch (e) {
    console.error('[ai/quota] setCooldown failed (soft-failing open):', e?.message || e);
  }
}

/**
 * Increment per-minute and per-day counters for a provider.
 * Returns current values after increment.
 * Safe defaults: {rpm: 0, rpd: 0} (allow call).
 *
 * @param {string} providerId
 * @returns {Promise<{rpm: number, rpd: number}>}
 */
export async function incrementCounters(providerId) {
  const client = _getClient();
  if (!client) return { rpm: 0, rpd: 0 };
  try {
    const rpmKey = _rpmKey(providerId);
    const rpdKey = _rpdKey(providerId);
    // Pipeline: INCR + EXPIRE both keys atomically-ish (two round trips avoided)
    const pipeline = client.pipeline();
    pipeline.incr(rpmKey);
    pipeline.expire(rpmKey, 70);
    pipeline.incr(rpdKey);
    pipeline.expire(rpdKey, 60 * 60 * 26);
    const results = await pipeline.exec();
    const rpm = results[0] ?? 0;
    const rpd = results[2] ?? 0;
    return { rpm, rpd };
  } catch (e) {
    console.error('[ai/quota] incrementCounters failed (soft-failing open):', e?.message || e);
    return { rpm: 0, rpd: 0 };
  }
}

/**
 * Check if a provider is under its soft caps BEFORE making a call.
 * Returns true → proceed; false → skip this provider.
 * Safe default: true (allow call).
 *
 * @param {string} providerId
 * @param {number} rpmSoftCap   requests-per-minute ceiling
 * @param {number} rpdSoftCap   requests-per-day ceiling
 * @returns {Promise<boolean>}
 */
export async function isUnderSoftCap(providerId, rpmSoftCap, rpdSoftCap) {
  const client = _getClient();
  if (!client) return true;
  try {
    const rpmKey = _rpmKey(providerId);
    const rpdKey = _rpdKey(providerId);
    const [rpmRaw, rpdRaw] = await Promise.all([
      client.get(rpmKey),
      client.get(rpdKey),
    ]);
    const rpm = parseInt(rpmRaw ?? '0', 10) || 0;
    const rpd = parseInt(rpdRaw ?? '0', 10) || 0;
    if (rpm >= rpmSoftCap) {
      console.warn(`[ai/quota] provider=${providerId} rpm=${rpm} >= softCap=${rpmSoftCap} — skipping`);
      return false;
    }
    if (rpd >= rpdSoftCap) {
      console.warn(`[ai/quota] provider=${providerId} rpd=${rpd} >= softCap=${rpdSoftCap} — skipping`);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[ai/quota] isUnderSoftCap failed (soft-failing open):', e?.message || e);
    return true;
  }
}
