/**
 * canonical.js
 *
 * Internal canonical message shape + structural validators + format converters.
 *
 * Batch:        FULL-P1-I
 * Spec ref:     Architect spec §6 — Canonical Message Contract
 * Decision ref: CEO-Final Phase 0/2 verification, 2026-05-28
 * Author:       BACKEND ENGINEER 1 (parallel implementation team)
 *
 * Design constraints:
 *   - Pure functions only; zero side effects
 *   - No external dependencies
 *   - No console.log / console.warn / console.error (pure transformation layer)
 *   - ESM exports only
 */

// ---------------------------------------------------------------------------
// Type documentation (JSDoc only — no runtime type system required)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} CanonicalMessage
 * @property {'user'|'assistant'} role - Speaker role
 * @property {string}             text - Message content
 */

/**
 * @typedef {Object} CanonicalRequestOpts
 * @property {number}   maxTokens    - Maximum tokens to generate
 * @property {number}   temperature  - Sampling temperature
 * @property {number}   topP         - Nucleus sampling probability
 * @property {string}   label        - Human-readable label for logging/tracing
 * @property {string}   [providerPin]    - Optional: pin to a specific provider id
 * @property {string}   [forceProvider]  - Optional: owner debug override provider id
 */

/**
 * @typedef {Object} CanonicalRequest
 * @property {string}              systemPrompt - The system prompt for the AI
 * @property {CanonicalMessage[]}  messages     - Conversation turns
 * @property {CanonicalRequestOpts} opts        - Generation options
 */

/**
 * @typedef {Object} CanonicalResponseOk
 * @property {true}   ok        - Indicates success
 * @property {string} reply     - The AI-generated text reply
 * @property {string} provider  - Provider id that produced the reply
 * @property {string} modelUsed - Exact model identifier used
 */

/**
 * @typedef {Object} CanonicalResponseErr
 * @property {false}  ok           - Indicates failure
 * @property {'QUOTA'|'TIMEOUT'|'NETWORK'|'BAD_RESPONSE'|'CONFIG'|'UPSTREAM_5XX'|'UPSTREAM_4XX'|'CASCADE_EXHAUSTED'} reason
 *                                 - Machine-readable failure category
 * @property {number}       status          - HTTP status code to return to caller
 * @property {number|null}  retryAfterSec   - Seconds until retry is safe, or null
 * @property {string|null}  provider        - Provider id that failed, or null if config error
 */

/**
 * @typedef {CanonicalResponseOk|CanonicalResponseErr} CanonicalResponse
 */

// ---------------------------------------------------------------------------
// isValidCanonical
// ---------------------------------------------------------------------------

/**
 * Structural type-check for a CanonicalRequest object.
 *
 * Validates:
 *  - req is a non-null object
 *  - req.systemPrompt is a string
 *  - req.messages is an array where every element has:
 *      role === 'user' | 'assistant'  AND  text is a string
 *
 * Does NOT validate opts — opts fields are optional/provider-specific.
 *
 * @param {unknown} req - The value to validate
 * @returns {boolean} true if req conforms to CanonicalRequest shape
 */
export function isValidCanonical(req) {
  return (
    req !== null &&
    typeof req === 'object' &&
    typeof req.systemPrompt === 'string' &&
    Array.isArray(req.messages) &&
    req.messages.every(
      (m) =>
        m !== null &&
        typeof m === 'object' &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.text === 'string',
    )
  );
}

// ---------------------------------------------------------------------------
// toOpenAIMessages
// ---------------------------------------------------------------------------

/**
 * Converts canonical systemPrompt + messages to the OpenAI chat-completions
 * message array format, as expected by Groq and Cerebras adapters.
 *
 * Output shape:
 *   [
 *     { role: 'system',    content: systemPrompt },
 *     { role: 'user',      content: '...' },
 *     { role: 'assistant', content: '...' },
 *     ...
 *   ]
 *
 * @param {string}             systemPrompt - The system prompt string
 * @param {CanonicalMessage[]} messages     - Ordered conversation turns
 * @returns {Array<{role: string, content: string}>}
 */
export function toOpenAIMessages(systemPrompt, messages) {
  return [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.text })),
  ];
}

// ---------------------------------------------------------------------------
// toGeminiContents
// ---------------------------------------------------------------------------

/**
 * Converts canonical systemPrompt + messages to the Gemini generateContent
 * `contents` array format, as expected by the Gemini adapter.
 *
 * Gemini does not support a dedicated 'system' role in `contents`; the system
 * prompt is injected as the first user turn, followed by a seeded model
 * acknowledgement ("Understood! I'm Sage, your personal financial advisor.").
 * This matches the existing sage.js implementation at lines 482-494 exactly.
 *
 * Output shape:
 *   [
 *     { role: 'user',  parts: [{ text: systemPrompt }] },
 *     { role: 'model', parts: [{ text: "Understood! I'm Sage, your personal financial advisor." }] },
 *     { role: 'user'|'model', parts: [{ text: '...' }] },
 *     ...
 *   ]
 *
 * @param {string}             systemPrompt - The system prompt string
 * @param {CanonicalMessage[]} messages     - Ordered conversation turns
 * @returns {Array<{role: string, parts: Array<{text: string}>}>}
 */
export function toGeminiContents(systemPrompt, messages) {
  return [
    { role: 'user',  parts: [{ text: systemPrompt }] },
    { role: 'model', parts: [{ text: "Understood! I'm Sage, your personal financial advisor." }] },
    ...messages.map((m) => ({
      role:  m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.text }],
    })),
  ];
}
