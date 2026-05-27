/**
 * ai/providers/groq.js
 *
 * Groq Llama-3.3-70B adapter — OpenAI-compatible chat/completions.
 *
 * Architecture: FULL-P1-I · CEO Phase-0 approved.
 * Groq is the PRIMARY production AI provider per CEO Phase-0 decision.
 *
 * Signature:
 *   async (payload, apiKey) => { ok, reply, modelUsed } | { ok, reason, status, retryAfterSec }
 *   reason ∈ 'QUOTA'|'TIMEOUT'|'NETWORK'|'BAD_RESPONSE'|'CONFIG'|'UPSTREAM_5XX'|'UPSTREAM_4XX'
 */

import { toOpenAIMessages } from '../canonical.js';

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const DEFAULT_TIMEOUT_MS = 4000;

function classifyError(status, errCode) {
  if (status === 429) return 'QUOTA';
  if (status === 408 || status === 504) return 'TIMEOUT';
  if (status >= 500) return 'UPSTREAM_5XX';
  if (status >= 400) return 'UPSTREAM_4XX';
  return 'BAD_RESPONSE';
}

function parseRetryAfter(headers) {
  const raw = headers?.get?.('retry-after');
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export default async function groqAdapter({ systemPrompt, messages, opts = {} }, apiKey) {
  if (!apiKey) return { ok: false, reason: 'CONFIG', status: 0, retryAfterSec: null };

  const model = opts.model || DEFAULT_MODEL;
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;

  const body = JSON.stringify({
    model,
    messages: toOpenAIMessages(systemPrompt, messages),
    max_tokens: opts.maxTokens || 600,
    temperature: opts.temperature ?? 0.7,
    top_p: opts.topP ?? 0.9,
    stream: false,
  });

  let signal;
  let timerId;
  if (typeof AbortSignal.timeout === 'function') {
    signal = AbortSignal.timeout(timeoutMs);
  } else {
    const ctrl = new AbortController();
    timerId = setTimeout(() => ctrl.abort(), timeoutMs);
    signal = ctrl.signal;
  }

  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body,
      signal,
    });
  } catch (fetchErr) {
    if (timerId) clearTimeout(timerId);
    const isTimeout =
      fetchErr?.name === 'TimeoutError' ||
      fetchErr?.name === 'AbortError';
    const reason = isTimeout ? 'TIMEOUT' : 'NETWORK';
    console.error('[ai:groq]', reason, 'status=0 code=fetch_error');
    return { ok: false, reason, status: 0, retryAfterSec: null };
  }
  if (timerId) clearTimeout(timerId);

  const status = res.status;

  if (!res.ok) {
    let errCode = 'unknown';
    try {
      const errBody = await res.json();
      errCode = errBody?.error?.code ?? errBody?.error?.type ?? 'unknown';
    } catch (_) {
      // ignore parse failure
    }
    const reason = classifyError(status, errCode);
    console.error('[ai:groq]', reason, 'status=' + status + ' code=' + errCode);
    return {
      ok: false,
      reason,
      status,
      retryAfterSec: reason === 'QUOTA' ? parseRetryAfter(res.headers) : null,
    };
  }

  let data;
  try {
    data = await res.json();
  } catch (_) {
    console.error('[ai:groq]', 'BAD_RESPONSE', 'status=' + status + ' code=json_parse_error');
    return { ok: false, reason: 'BAD_RESPONSE', status, retryAfterSec: null };
  }

  const reply = data?.choices?.[0]?.message?.content;
  if (typeof reply !== 'string' || !reply.trim()) {
    console.error('[ai:groq]', 'BAD_RESPONSE', 'status=' + status + ' code=empty_content');
    return { ok: false, reason: 'BAD_RESPONSE', status, retryAfterSec: null };
  }

  return { ok: true, reply, modelUsed: model };
}
