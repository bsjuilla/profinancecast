// api/_lib/email/send.js
//
// Shared transactional email sender for customer-facing receipts and
// notifications (payment receipt, refund confirmation, cancellation,
// account deletion goodbye). Built on the canonical Resend pattern from
// api/_lib/ai/alerts.js — same fetch shape, same fail-open discipline,
// same PII-redacted logging.
//
// Caller responsibility: resolve the recipient email BEFORE calling
// this helper (e.g. via supabase.auth.admin.getUserById in webhook
// handlers, or from userData.user.email in JWT-authed handlers).
// This module never touches Supabase.
//
// Failure mode is FAIL-OPEN: if RESEND_API_KEY is missing, if the
// recipient is invalid, or if Resend returns non-2xx, this function
// returns { sent: false, reason } and never throws. The caller's
// business logic (capturing a payment, cancelling a subscription,
// deleting an account) must NEVER be blocked by an email failure.
//
// Env vars:
//   RESEND_API_KEY        — required; absent → silent no-op.
//   RESEND_RECEIPTS_FROM  — optional From: header for customer receipts.
//                           Defaults to 'ProFinanceCast <receipts@profinancecast.com>'.
//                           NOTE: the domain MUST be DNS-verified in Resend
//                           (SPF + DKIM) or messages bounce with 422.
//   RESEND_REPLY_TO       — optional Reply-To: header. Defaults to
//                           'support@profinancecast.com'. Every template
//                           tells the user to "reply to this email" so
//                           replies MUST land in a monitored mailbox,
//                           not the no-reply 'receipts@' sender alias.

// Default reply-to so customer replies land in the support mailbox
// rather than the no-reply 'receipts@' sender alias (review finding #4).
const DEFAULT_REPLY_TO = 'support@profinancecast.com';

// 5-second wall-clock cap on the Resend fetch (review finding #8). If
// Resend hangs (TLS handshake completes but body never arrives), this
// trips before Vercel's function-level kill, so the caller gets a
// `{sent:false, reason:'timeout'}` and can return its HTTP response
// cleanly — no orphaned function executions, no 502s to the customer.
const RESEND_FETCH_TIMEOUT_MS = 5000;

export async function sendTransactionalEmail({
  to,
  subject,
  text,
  tag,
  replyTo,
  idempotencyKey,
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from   = process.env.RESEND_RECEIPTS_FROM
                 || 'ProFinanceCast <receipts@profinancecast.com>';
  const reply  = replyTo
                 || process.env.RESEND_REPLY_TO
                 || DEFAULT_REPLY_TO;

  // Guard rails. Each check fails-open: no key / no recipient / malformed
  // input all return { sent: false } so the caller's business logic
  // proceeds. Errors are logged with redaction.
  if (!apiKey) {
    return { sent: false, reason: 'no_api_key' };
  }
  // Stricter than a naive `.includes('@')` check (security review patch A):
  // reject whitespace, commas, semicolons, angle brackets, and any other
  // character that could change the semantics of the recipient envelope
  // even if Resend's server-side validation is lenient. This is
  // belt-and-braces — Resend itself rejects malformed addresses with 4xx
  // — but the stricter local check keeps the log signal clean (we won't
  // see noisy "resend_400" lines for addresses that are obviously
  // malformed before they leave the function).
  if (!to || typeof to !== 'string'
      || !/^[^\s@,;<>"\\]+@[^\s@,;<>"\\]+\.[^\s@,;<>"\\]+$/.test(to)) {
    return { sent: false, reason: 'invalid_recipient' };
  }
  if (!subject || !text) {
    return { sent: false, reason: 'missing_subject_or_text' };
  }

  const tagLabel = tag || 'transactional';

  // AbortController-based timeout (review finding #8) — Resend's docs
  // promise sub-second normal latency; 5s is generous and only trips on
  // genuine network/upstream hangs.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESEND_FETCH_TIMEOUT_MS);

  try {
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
    // Resend's per-request idempotency key (review finding #5/#6/#7) —
    // when present, Resend deduplicates identical sends server-side, so
    // a double-click on the checkout button, a PayPal-webhook retry,
    // and a capture-order/webhook fallback race all collapse to one
    // delivered email. Caller passes the stable identifier (typically
    // 'receipt:<captureId>' or 'refund:<refundId>').
    if (idempotencyKey && typeof idempotencyKey === 'string') {
      headers['Idempotency-Key'] = idempotencyKey;
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: reply,
        subject,
        text,
        // Resend tag for delivery analytics + bounce attribution.
        // Tag value is the category label only — never the recipient.
        tags: [{ name: 'category', value: tagLabel }],
      }),
    });

    if (!res.ok) {
      // PII redaction: log status only. Resend error bodies sometimes
      // echo the recipient address back, and verbose error envelopes
      // can include partial API-key fragments. Status is enough to
      // tell us 4xx vs 5xx for ops paging.
      console.warn(`[email:${tagLabel}] send failed status=${res.status}`);
      return { sent: false, reason: `resend_${res.status}` };
    }

    return { sent: true };
  } catch (e) {
    // Specific cause for the timeout-aborted case so ops can distinguish
    // "Resend is down" from "Resend was slow" in the log aggregator.
    if (e?.name === 'AbortError') {
      console.warn(`[email:${tagLabel}] send timed out after ${RESEND_FETCH_TIMEOUT_MS}ms`);
      return { sent: false, reason: 'timeout' };
    }
    // PII redaction: log error NAME only. Network error messages can
    // contain URL strings with embedded auth or recipient addresses
    // depending on the runtime's TLS layer.
    console.warn(`[email:${tagLabel}] send threw name=${e?.name || 'Error'}`);
    return { sent: false, reason: 'network' };
  } finally {
    clearTimeout(timer);
  }
}
