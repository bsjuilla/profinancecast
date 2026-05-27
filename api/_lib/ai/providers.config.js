/**
 * providers.config.js
 *
 * Single-source-of-truth ESM config for the AI provider chain.
 *
 * Batch:        FULL-P1-I
 * Decision ref: CEO-Final Phase 0/2 verification, 2026-05-28
 * Author:       BACKEND ENGINEER 1 (parallel implementation team)
 *
 * IMPORTANT — Cerebras RPM correction:
 *   The architect's original spec listed Cerebras rpmCap:30.
 *   The Opus verifier caught this as wrong; the actual Cerebras free-tier
 *   hard limit is 5 RPM. This file records the VERIFIED value of 5.
 *
 * prodEnabled:false providers are accessible only via owner debug-header
 * (opts.isOwner + opts.forceProvider). Never exposed to end-users in prod.
 */

// ---------------------------------------------------------------------------
// Global router constants
// ---------------------------------------------------------------------------

/** Hard ceiling for the entire router run. Must stay below Vercel 10 s limit. */
export const WALL_CLOCK_BUDGET_MS = 8000;

/** Minimum gap between identical alert emissions to avoid alert-storm spam. */
export const ALERT_THROTTLE_SEC = 3600;

// ---------------------------------------------------------------------------
// Provider definitions
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ProviderConfig
 * @property {string}   id          - Provider identifier: 'groq' | 'gemini' | 'cerebras'
 * @property {number}   priority    - Routing priority; 1 = primary, ascending
 * @property {string}   apiKeyEnv   - Environment variable NAME (not the value)
 * @property {string}   model       - Upstream model identifier
 * @property {function(): Promise<{default: Function}>} adapter
 *                                  - Lazy dynamic import returning the adapter module
 * @property {number}   rpmCap      - Hard rate-limit per minute (from provider docs)
 * @property {number}   rpdCap      - Hard rate-limit per day
 * @property {number}   rpmSoftCap  - 90 % of rpmCap; router skips provider when reached
 * @property {number}   rpdSoftCap  - 90 % of rpdCap; router skips provider when reached
 * @property {number}   timeoutMs   - Per-call timeout in milliseconds
 * @property {boolean}  prodEnabled - false = dev/QA only via owner debug-header
 */

/** @type {ProviderConfig[]} */
export const PROVIDERS = [
  {
    id:          'groq',
    priority:    1,
    apiKeyEnv:   'GROQ_API_KEY',
    model:       'llama-3.3-70b-versatile',
    adapter:     () => import('./providers/groq.js'),
    rpmCap:      30,
    rpdCap:      14400,
    rpmSoftCap:  27,
    rpdSoftCap:  13000,
    timeoutMs:   4000,
    prodEnabled: true,
  },
  {
    id:          'gemini',
    priority:    2,
    apiKeyEnv:   'GEMINI_API_KEY',
    model:       'gemini-2.5-flash',
    adapter:     () => import('./providers/gemini.js'),
    rpmCap:      15,
    rpdCap:      1500,
    rpmSoftCap:  13,
    rpdSoftCap:  1350,
    timeoutMs:   6000,
    prodEnabled: true,
  },
  {
    id:          'cerebras',
    priority:    3,
    apiKeyEnv:   'CEREBRAS_API_KEY',
    model:       'llama-3.3-70b',
    adapter:     () => import('./providers/cerebras.js'),
    rpmCap:      5,      // VERIFIED 5 RPM — architect draft said 30, Opus verifier corrected
    rpdCap:      14400,
    rpmSoftCap:  4,
    rpdSoftCap:  13000,
    timeoutMs:   6000,
    prodEnabled: false,  // dev/QA only; requires owner debug-header to activate
  },
];

// ---------------------------------------------------------------------------
// getEnabledProviders
// ---------------------------------------------------------------------------

/**
 * Returns the filtered list of providers available for a given request context.
 *
 * Rules (in priority order):
 *  1. If `opts.isOwner && opts.forceProvider` is set, return ONLY that provider
 *     (debug override — allows testing any provider including prodEnabled:false).
 *  2. Otherwise return PROVIDERS filtered to those where:
 *     - `prodEnabled === true`
 *     - the corresponding env var is non-empty at runtime
 *
 * Emits a single console.warn (startup-time catastrophic config error) if
 * both Groq and Gemini keys are absent — the service cannot handle real
 * traffic without at least one prod-enabled provider.
 *
 * @param {{ isOwner?: boolean, forceProvider?: string }} [opts={}]
 * @returns {ProviderConfig[]}
 */
export function getEnabledProviders(opts = {}) {
  const { isOwner = false, forceProvider } = opts;

  // Debug override: owner can pin any provider (including prodEnabled:false).
  if (isOwner && forceProvider) {
    const pinned = PROVIDERS.find((p) => p.id === forceProvider);
    return pinned ? [pinned] : [];
  }

  // Standard path: prod-enabled + key present.
  const enabled = PROVIDERS.filter(
    (p) => p.prodEnabled === true && Boolean(process.env[p.apiKeyEnv]),
  );

  // Catastrophic config guard: warn once if no prod provider has a key.
  const groqOk   = Boolean(process.env['GROQ_API_KEY']);
  const geminiOk = Boolean(process.env['GEMINI_API_KEY']);
  if (!groqOk && !geminiOk) {
    console.warn(
      '[providers.config] CATASTROPHIC CONFIG: Both GROQ_API_KEY and GEMINI_API_KEY ' +
      'are missing. The AI router has no production-enabled providers. ' +
      'Set at least one key before serving live traffic.',
    );
  }

  return enabled;
}
