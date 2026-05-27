/**
 * Gemini provider adapter — FULL-P1-I
 *
 * Port of `_callGeminiWithFallback` from api/sage.js lines 87-116, preserving
 * the gemini-2.5-flash → gemini-2.0-flash fallback exactly (fall back only on
 * HTTP 429 or 5xx; break immediately on other 4xx errors).
 *
 * PII-redaction discipline from FULL-P1-D2/E/F is maintained throughout:
 * - No raw error objects are logged or serialised
 * - No JSON.stringify(err) anywhere in this file
 * - console.error uses only safe scalar fields (status, errCode)
 */

import { toGeminiContents } from '../canonical.js';

// Same model list as sage.js line 87
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];

function _geminiUrl(model, apiKey) {
  return (
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(model) +
    ':generateContent?key=' +
    encodeURIComponent(apiKey)
  );
}

/**
 * Call Gemini with 2.5-flash → 2.0-flash fallback.
 *
 * @param {{ systemPrompt: string, messages: Array<{role:string, text:string}>, opts: object }} input
 * @param {string} apiKey
 * @returns {Promise<
 *   { ok: true,  reply: string, modelUsed: string } |
 *   { ok: false, reason: string, status: number, retryAfterSec: number|null }
 * >}
 */
export default async function callGemini({ systemPrompt, messages, opts = {} }, apiKey) {
  const {
    maxTokens = 600,
    temperature = 0.7,
    topP = 0.9,
    timeoutMs = 6000,
    label = 'gemini',
  } = opts;

  // Guard — no key, no call
  if (!apiKey) {
    return { ok: false, reason: 'CONFIG', status: 0, retryAfterSec: null };
  }

  // Build request body matching sage.js lines 496-504
  const geminiBody = {
    contents: toGeminiContents(systemPrompt, messages),
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature,
      topP,
      stopSequences: [],
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  };

  let lastStatus = 0;
  let lastRetryAfter = null;
  let networkFailures = 0;

  // Fallback loop — mirrors sage.js lines 94-115 exactly
  for (let i = 0; i < GEMINI_MODELS.length; i++) {
    const model = GEMINI_MODELS[i];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res;
    try {
      res = await fetch(_geminiUrl(model, apiKey), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      if (e && e.name === 'AbortError') {
        // Timeout — do not retry on timeout
        console.error('[ai:gemini]', label, 'status=0 code=TIMEOUT model=' + model);
        return { ok: false, reason: 'TIMEOUT', status: 0, retryAfterSec: null };
      }
      // Network error — log safely, continue to next model
      console.error('[ai:gemini]', label, 'status=0 code=NETWORK model=' + model);
      networkFailures++;
      lastStatus = 0;
      continue;
    }
    clearTimeout(timer);

    if (res.ok) {
      // Parse and validate response body
      let data;
      try {
        data = await res.json();
      } catch (_parseErr) {
        console.error('[ai:gemini]', label, 'status=200 code=PARSE_ERROR model=' + model);
        return { ok: false, reason: 'BAD_RESPONSE', status: 200, retryAfterSec: null };
      }

      // Extraction matches sage.js line 512
      const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!reply) {
        console.error('[ai:gemini]', label, 'status=200 code=EMPTY_REPLY model=' + model);
        return { ok: false, reason: 'BAD_RESPONSE', status: 200, retryAfterSec: null };
      }

      return { ok: true, reply, modelUsed: model };
    }

    // Non-OK response
    lastStatus = res.status;
    const errCode = 'GEMINI_' + res.status;
    console.error('[ai:gemini]', label, 'status=' + res.status + ' code=' + (errCode || 'UNKNOWN') + ' model=' + model);

    if (res.status === 429) {
      // Capture Retry-After for final return, but still try fallback model
      lastRetryAfter = parseInt(res.headers.get('Retry-After') || '60', 10);
    }

    // Mirror sage.js line 113: only fall back on 429 or 5xx
    if (res.status < 500 && res.status !== 429) {
      // 4xx (not 429) — our bug, stop immediately
      return { ok: false, reason: 'UPSTREAM_4XX', status: res.status, retryAfterSec: null };
    }

    // 429 or 5xx — continue to next model (fallback)
  }

  // All models exhausted — classify final failure
  if (networkFailures === GEMINI_MODELS.length) {
    return { ok: false, reason: 'NETWORK', status: 0, retryAfterSec: null };
  }

  if (lastStatus === 429) {
    return { ok: false, reason: 'QUOTA', status: 429, retryAfterSec: lastRetryAfter ?? 60 };
  }

  if (lastStatus >= 500) {
    return { ok: false, reason: 'UPSTREAM_5XX', status: lastStatus, retryAfterSec: null };
  }

  // Fallback catch-all (e.g. mixed network + 429 exhaustion)
  return { ok: false, reason: 'NETWORK', status: lastStatus, retryAfterSec: null };
}
