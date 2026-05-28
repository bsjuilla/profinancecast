// api/_lib/ai/router.js
//
// AI provider router / cascade orchestrator.
//
// This module is Phase 3 of FULL-P1-I per CEO-approved architecture:
//   Phase 0 — ToS gate cleared (Groq + Gemini + Cerebras vetted for prod use,
//             Cerebras gated to prodEnabled=false pending paid-tier signoff;
//             owner-debug may still force it).
//   Phase 1 — provider adapters (./providers/*.js) return a discriminated
//             union { ok, reply | reason, status, ... }.
//   Phase 2 — quota.js (KV-backed soft-cap + cooldown), alerts.js (Slack/email
//             with 3-in-24h CEO escalation), canonical.js (input validator).
//   Phase 3 — THIS FILE: ties them together with cascade semantics.
//
// Cascade semantics:
//   - Normal request walks getEnabledProviders() in priority order.
//   - Each provider is skipped if in cooldown, or (for non-owner) if over
//     soft-cap. Counters increment BEFORE the call to prevent overshoot under
//     concurrent load. First ok:true wins; later providers are not contacted.
//   - On QUOTA we set cooldown using upstream Retry-After (fallback 60s).
//   - Hard failures (CASCADE_EXHAUSTED) emit an alert and a CEO-escalation
//     check (alerts.js dedupes the 3-in-24h rule).
//   - Pin-mode (opts.providerPin) and owner force-mode (opts.isOwner +
//     opts.forceProvider) bypass cascade entirely — single attempt, no
//     cooldown check. forceProvider is ONLY honoured when isOwner===true
//     (CEO security decision: never trust a client-supplied header).
//
// Wall-clock budget:
//   Vercel Hobby caps function execution at 10s. WALL_CLOCK_BUDGET_MS (8000ms,
//   defined in providers.config.js) leaves ~2s headroom for response
//   serialisation and platform overhead. We refuse to start a new provider
//   attempt with <1500ms remaining, and we cap each per-call timeout by the
//   remaining budget so a slow upstream can't blow past 10s.
//
// This function NEVER throws on expected failures — every outcome is returned
// as a discriminated union so callers can branch deterministically.

import { PROVIDERS, WALL_CLOCK_BUDGET_MS, getEnabledProviders } from './providers.config.js';
import { isValidCanonical } from './canonical.js';
import { isInCooldown, setCooldown, incrementCounters, isUnderSoftCap } from './quota.js';
import { alertProviderFailure, alertCascadeExhausted, alertCeoIfRepeated } from './alerts.js';

const MIN_ATTEMPT_BUDGET_MS = 1500;
const DEFAULT_COOLDOWN_SEC = 60;

function safeAlert(fn) {
  // Alert failures must never break Sage. Caller awaits, but we swallow.
  try {
    return Promise.resolve(fn()).catch(() => {});
  } catch (_) {
    return Promise.resolve();
  }
}

function logRouter(label, status, code) {
  // Structured router log line. Keep keys stable for grep/log-parsing.
  console.error('[ai:router]', label, 'status=' + status + ' code=' + code);
}

function apiKeyFor(provider) {
  // FULL-P1-I-FIX (audit 2026-05-28, triple-verification P0 bug #1):
  // was reading provider.envKey but providers.config.js exports the field
  // as `apiKeyEnv`. The field-name mismatch silently returned null for
  // every provider → every adapter call got apiKey=undefined → every call
  // returned reason:'CONFIG' → cascade always exhausted → 100% Sage outage
  // on flag-on. Caught by V1 + V2 verifiers BEFORE ship. Fix: align to the
  // config schema field name.
  if (!provider || !provider.apiKeyEnv) return null;
  return process.env[provider.apiKeyEnv] || null;
}

async function callAdapter(provider, canonical, budgetRemaining) {
  // Lazy-load the adapter module so cold-start cost is paid only for the
  // providers we actually invoke this request.
  const mod = await provider.adapter();
  // FULL-P1-I-FIX3 (audit 2026-05-28) — defensive CJS/ESM interop. Vercel's
  // @vercel/node serverless build can wrap a dynamic-imported ESM file's
  // `export default` differently depending on the project module type
  // (package.json has no "type":"module" so CJS is the default). The
  // resolved namespace can arrive as either:
  //   { default: function }   ← standard ESM shape
  //   function                ← if Vercel converted to module.exports = fn
  //   { default: { default: fn } } ← double-wrapped (rare, but observed)
  // Original code only handled the first shape → `adapter is not a function`
  // TypeError thrown for both groq AND gemini on every Vercel cold start.
  // Caught by DEBUG2-enhanced ADAPTER_THREW capture. Fix: try every shape.
  let adapter = mod && mod.default;
  if (typeof adapter !== 'function' && typeof mod === 'function') {
    adapter = mod;
  }
  if (typeof adapter !== 'function' && adapter && typeof adapter.default === 'function') {
    adapter = adapter.default;
  }
  if (typeof adapter !== 'function') {
    // No callable function found — explicit throw with helpful diagnostic
    // so the router's ADAPTER_THREW catch surfaces it in the _debug trace
    // rather than the generic "adapter is not a function" we saw before.
    throw new TypeError('callAdapter: no default export resolved for provider=' + provider.id +
      ' (mod typeof=' + typeof mod + ', mod.default typeof=' + (mod && typeof mod.default) + ')');
  }
  const cappedTimeout = Math.min(provider.timeoutMs, budgetRemaining);
  const apiKey = apiKeyFor(provider);
  // FULL-P1-I-FIX (audit 2026-05-28, triple-verification P0 bug #2):
  // adapter call signature is (payload, apiKey) — see gemini.js / groq.js
  // / cerebras.js — but this site was passing apiKey INSIDE the payload
  // object, making the second positional argument undefined. Adapters then
  // saw apiKey===undefined → returned CONFIG → cascade exhausted. Switched
  // to the documented two-arg signature.
  const payload = {
    systemPrompt: canonical.systemPrompt,
    messages: canonical.messages,
    opts: {
      ...canonical.opts,
      timeoutMs: cappedTimeout,
      model: provider.model,
    },
  };
  return adapter(payload, apiKey);
}

function findProviderById(id) {
  // Pin-mode and owner force-mode bypass the prodEnabled filter — we want
  // the full registry so owner debugging can target Cerebras.
  if (!id) return null;
  for (const p of PROVIDERS) {
    if (p.id === id) return p;
  }
  return null;
}

async function runSingleAttempt(provider, canonical, startMs, budgetRemaining, opts) {
  // Used by pin-mode and owner force-mode. Bypasses cooldown + soft-cap.
  // Still respects wall-clock budget (refuses if too little time left).
  const label = (canonical.opts && canonical.opts.label) || 'chat';
  if (budgetRemaining < MIN_ATTEMPT_BUDGET_MS) {
    logRouter(label, 0, 'BUDGET_EXHAUSTED');
    return {
      ok: false,
      reason: 'CASCADE_EXHAUSTED',
      status: 429,
      retryAfterSec: 60,
      attempts: [{ provider: provider.id, reason: 'BUDGET_EXHAUSTED', status: 0 }],
    };
  }
  // Still increment counters so quota accounting reflects reality.
  try {
    await incrementCounters(provider.id);
  } catch (_) { /* counters are best-effort */ }

  let result;
  try {
    result = await callAdapter(provider, canonical, budgetRemaining);
  } catch (err) {
    // FULL-P1-I-DEBUG2 — capture err.name + truncated err.message so we
    // can see WHY the adapter threw at runtime. Without this, all crashes
    // surface as bare 'ADAPTER_THREW' with no diagnostic. PII-safe: error
    // messages from our own adapter code are safe to surface; if the
    // upstream provider's library leaks user data into err.message we
    // truncate to 120 chars to bound the blast radius.
    const errName = err && err.name ? String(err.name) : 'Error';
    const errMsg = err && err.message ? String(err.message).slice(0, 120) : '';
    logRouter(label, 0, 'ADAPTER_THREW name=' + errName + ' msg=' + errMsg);
    return {
      ok: false,
      reason: 'CASCADE_EXHAUSTED',
      status: 500,
      retryAfterSec: null,
      attempts: [{ provider: provider.id, reason: 'ADAPTER_THREW', status: 0, errName, errMsg }],
    };
  }

  if (result && result.ok === true) {
    const latencyMs = Date.now() - startMs;
    const providerLabel = opts && opts.forced ? provider.id + ' (forced)' : provider.id;
    return {
      ok: true,
      reply: result.reply,
      provider: providerLabel,
      modelUsed: result.modelUsed || provider.model,
      latencyMs,
    };
  }

  const reason = (result && result.reason) || 'BAD_RESPONSE';
  const status = (result && result.status) || 0;
  logRouter(label, status, reason);
  return {
    ok: false,
    reason: 'CASCADE_EXHAUSTED',
    status: 429,
    retryAfterSec: (result && result.retryAfterSec) || null,
    attempts: [{ provider: provider.id, reason, status }],
  };
}

export async function complete(canonical) {
  // 1. Input validation.
  if (!isValidCanonical(canonical)) {
    logRouter('unknown', 500, 'INVALID_CANONICAL');
    return {
      ok: false,
      reason: 'NO_PROVIDERS',
      status: 500,
      retryAfterSec: null,
      attempts: [],
    };
  }

  const opts = canonical.opts || {};
  const label = opts.label || 'chat';
  const startMs = Date.now();
  const budgetRemaining = () => WALL_CLOCK_BUDGET_MS - (Date.now() - startMs);

  // 2. Pin-mode short-circuit. Trust-me single attempt, no fallback.
  if (opts.providerPin) {
    const pinned = findProviderById(opts.providerPin);
    if (!pinned) {
      logRouter(label, 500, 'PIN_NOT_FOUND');
      return {
        ok: false,
        reason: 'NO_PROVIDERS',
        status: 500,
        retryAfterSec: null,
        attempts: [{ provider: opts.providerPin, reason: 'PIN_NOT_FOUND', status: 0 }],
      };
    }
    return runSingleAttempt(pinned, canonical, startMs, budgetRemaining(), { forced: false });
  }

  // 3. Owner force-mode short-circuit. Security: isOwner must be true.
  if (opts.isOwner === true && opts.forceProvider) {
    const forced = findProviderById(opts.forceProvider);
    if (!forced) {
      logRouter(label, 500, 'FORCE_NOT_FOUND');
      return {
        ok: false,
        reason: 'NO_PROVIDERS',
        status: 500,
        retryAfterSec: null,
        attempts: [{ provider: opts.forceProvider, reason: 'FORCE_NOT_FOUND', status: 0 }],
      };
    }
    return runSingleAttempt(forced, canonical, startMs, budgetRemaining(), { forced: true });
  }

  // 4. Normal cascade.
  const providers = getEnabledProviders({ isOwner: opts.isOwner });
  if (!providers || providers.length === 0) {
    logRouter(label, 500, 'NO_PROVIDERS');
    return {
      ok: false,
      reason: 'NO_PROVIDERS',
      status: 500,
      retryAfterSec: null,
      attempts: [],
    };
  }

  const attempts = [];
  let minRetryAfter = null;

  for (const p of providers) {
    const remaining = budgetRemaining();
    if (remaining < MIN_ATTEMPT_BUDGET_MS) {
      attempts.push({ provider: p.id, reason: 'BUDGET_EXHAUSTED', status: 0 });
      logRouter(label, 0, 'BUDGET_EXHAUSTED');
      break;
    }

    // Cooldown check — skip without contacting upstream.
    let cooling = false;
    try {
      cooling = await isInCooldown(p.id);
    } catch (_) { cooling = false; }
    if (cooling) {
      attempts.push({ provider: p.id, reason: 'COOLDOWN_SKIP', status: 0 });
      continue;
    }

    // Soft-cap check — non-owners only.
    if (!opts.isOwner) {
      let underCap = true;
      try {
        underCap = await isUnderSoftCap(p.id, p.rpmSoftCap, p.rpdSoftCap);
      } catch (_) { underCap = true; }
      if (!underCap) {
        attempts.push({ provider: p.id, reason: 'SOFT_CAP_SKIP', status: 0 });
        continue;
      }
    }

    // Increment BEFORE the call so concurrent requests can't all squeeze past
    // a soft cap at the same instant.
    try {
      await incrementCounters(p.id);
    } catch (_) { /* counter increment is best-effort */ }

    let result;
    try {
      result = await callAdapter(p, canonical, budgetRemaining());
    } catch (err) {
      // FULL-P1-I-DEBUG2 — capture err.name + truncated err.message for the
      // MAIN CASCADE LOOP catch (the one normal /chat requests hit). Same
      // rationale as the runSingleAttempt catch above: bare ADAPTER_THREW
      // is undiagnosable without the actual error class + message.
      const errName = err && err.name ? String(err.name) : 'Error';
      const errMsg = err && err.message ? String(err.message).slice(0, 120) : '';
      attempts.push({ provider: p.id, reason: 'ADAPTER_THREW', status: 0, errName, errMsg });
      logRouter(label, 0, 'ADAPTER_THREW name=' + errName + ' msg=' + errMsg);
      await safeAlert(() => alertProviderFailure(p.id, 'ADAPTER_THREW', 0, { label, errName, errMsg }));
      continue;
    }

    if (result && result.ok === true) {
      const latencyMs = Date.now() - startMs;
      return {
        ok: true,
        reply: result.reply,
        provider: p.id,
        modelUsed: result.modelUsed || p.model,
        latencyMs,
      };
    }

    const reason = (result && result.reason) || 'BAD_RESPONSE';
    const status = (result && result.status) || 0;
    attempts.push({ provider: p.id, reason, status });
    logRouter(label, status, reason);

    if (reason === 'QUOTA') {
      const retryAfterSec = (result && result.retryAfterSec) || DEFAULT_COOLDOWN_SEC;
      if (minRetryAfter === null || retryAfterSec < minRetryAfter) {
        minRetryAfter = retryAfterSec;
      }
      await safeAlert(() => setCooldown(p.id, retryAfterSec));
      await safeAlert(() => alertProviderFailure(p.id, 'QUOTA', status, { label, retryAfterSec }));
    } else if (reason === 'TIMEOUT' || reason === 'NETWORK' || reason === 'UPSTREAM_5XX') {
      await safeAlert(() => alertProviderFailure(p.id, reason, status, { label }));
    } else if (reason === 'UPSTREAM_4XX' || reason === 'BAD_RESPONSE') {
      // Our-bug signal — log only, no alert.
    } else if (reason === 'CONFIG') {
      // Provider not configured — silent skip, continue cascade.
    }
    // Continue to next provider regardless.
  }

  // 5. Cascade exhausted.
  // FULL-P1-I-FIX (audit 2026-05-28, triple-verification MED bug #3):
  // alertCascadeExhausted reads extra.activeProviders / .cooldowns /
  // .minRetryAfterSec (see alerts.js lines 175-177), not the keys this
  // call was using. Wrong keys made the email body show "[]" and
  // "unknown" — alert still fired but ops got zero diagnostic info.
  // Switched to the documented key names. attempts kept as an extra
  // diagnostic field (alerts.js JSON-stringifies any extra fields).
  await safeAlert(() => alertCascadeExhausted({
    chainState: attempts.length + '/' + providers.length + ' exhausted',
    activeProviders: providers.map((p) => p.id),
    cooldowns: attempts.reduce((acc, a) => {
      if (a.reason === 'QUOTA') acc[a.provider] = a.status + ' (cooldown set)';
      return acc;
    }, {}),
    minRetryAfterSec: minRetryAfter || DEFAULT_COOLDOWN_SEC,
    attempts,  // raw attempts array — diagnostic
  }));
  await safeAlert(() => alertCeoIfRepeated());

  return {
    ok: false,
    reason: 'CASCADE_EXHAUSTED',
    status: 429,
    retryAfterSec: minRetryAfter || DEFAULT_COOLDOWN_SEC,
    attempts,
  };
}

export default { complete };
