/**
 * pfc-sentry-scrub.js — PII redaction for Sentry beforeSend / beforeBreadcrumb.
 *
 * Loads BEFORE pfc-sentry.js. Exposes globals on window (no module — Sentry's
 * onLoad needs them synchronously):
 *   PFC_scrubPII(event, hint)        → mutated event or null to drop
 *   PFC_scrubBreadcrumb(crumb, hint) → mutated crumb or null to drop
 *   PFC_PII_KEY_RE                   → shared regex (consumed by analytics)
 *   PFC_isPiiKey(name)               → boolean predicate
 *
 * The deny-list is the privacy-policy invariant — loosening it requires a
 * paired policy update. event.user is deleted entirely: anonymous error
 * reporting only. Recursion is depth-limited and cycle-safe so an adversarial
 * Sentry payload can't blow the stack.
 */
(function (root) {
  'use strict';

  const PII_KEY = /^(email|e_mail|name|first_?name|last_?name|full_?name|phone|password|pw|pw2|token|access_token|refresh_token|address|street|city|zip|postcode|dob|date_of_birth|ssn|tax_id|account_id|user_id|ip|ip_address|customer_id|stripe_customer|referral_code)$/i;

  const EMAIL_LIKE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

  const SENSITIVE_HEADER = /^(cookie|authorization)$/i;

  const MAX_DEPTH = 8;

  function isPiiKey(k) { return typeof k === 'string' && PII_KEY.test(k); }

  function redactObject(obj, depth, seen) {
    if (!obj || typeof obj !== 'object') return obj;
    if (depth >= MAX_DEPTH || seen.has(obj)) return obj;
    seen.add(obj);
    for (const k of Object.keys(obj)) {
      if (isPiiKey(k)) { obj[k] = '[redacted]'; continue; }
      const v = obj[k];
      if (typeof v === 'string' && EMAIL_LIKE.test(v)) {
        obj[k] = '[redacted-email]';
      } else if (v && typeof v === 'object') {
        redactObject(v, depth + 1, seen);
      }
    }
    return obj;
  }

  function redact(obj) { return redactObject(obj, 0, new WeakSet()); }

  function stripQueryString(urlStr) {
    if (typeof urlStr !== 'string' || urlStr.indexOf('?') < 0) return urlStr;
    try {
      const u = new URL(urlStr, location.origin);
      const params = u.searchParams;
      let touched = false;
      for (const k of Array.from(params.keys())) {
        if (isPiiKey(k) || EMAIL_LIKE.test(params.get(k) || '')) {
          params.set(k, '[redacted]');
          touched = true;
        }
      }
      if (touched) {
        u.search = params.toString();
        return u.toString();
      }
    } catch (_) { /* fall through */ }
    return urlStr;
  }

  function PFC_scrubPII(event /* , hint */) {
    if (!event) return event;

    if (event.user) delete event.user;

    if (event.request) {
      const req = event.request;
      if (req.headers) {
        for (const k of Object.keys(req.headers)) {
          if (SENSITIVE_HEADER.test(k)) delete req.headers[k];
        }
        redact(req.headers);
      }
      if (req.cookies) delete req.cookies;
      if (req.url) req.url = stripQueryString(req.url);
      if (req.query_string) {
        // Sentry ships query_string as either a string or object — handle both.
        if (typeof req.query_string === 'string') {
          req.query_string = stripQueryString('?' + req.query_string).replace(/^\?/, '');
        } else {
          redact(req.query_string);
        }
      }
      if (req.data) {
        if (typeof req.data === 'string') {
          if (EMAIL_LIKE.test(req.data) || /password|token/i.test(req.data)) {
            req.data = '[redacted]';
          }
        } else {
          redact(req.data);
        }
      }
    }

    if (event.tags) redact(event.tags);
    if (event.extra) redact(event.extra);
    if (event.contexts) redact(event.contexts);

    if (typeof event.message === 'string' && EMAIL_LIKE.test(event.message)) {
      event.message = event.message.replace(EMAIL_LIKE, '[redacted-email]');
    }
    if (event.exception && event.exception.values) {
      for (const ex of event.exception.values) {
        if (ex && typeof ex.value === 'string' && EMAIL_LIKE.test(ex.value)) {
          ex.value = ex.value.replace(EMAIL_LIKE, '[redacted-email]');
        }
      }
    }

    return event;
  }

  function PFC_scrubBreadcrumb(crumb /* , hint */) {
    if (!crumb) return crumb;

    // ui.input + ui.click on auth/billing forms leak typed characters into
    // breadcrumbs as `value`. Redact the value, keep the selector for triage.
    if (crumb.category === 'ui.input' || crumb.category === 'ui.click') {
      const sel = (crumb.message || '') + ' ' + ((crumb.data && crumb.data.target) || '');
      if (/input\[type=(email|password|text)\]|#email|#password|#pw|#signup-name|#signup-email|name=("|')(email|password|pw|name)\2/i.test(sel)) {
        if (crumb.message) crumb.message = '[redacted]';
        if (crumb.data) {
          if ('value' in crumb.data) crumb.data.value = '[redacted]';
          redact(crumb.data);
        }
      }
    }

    if (crumb.category === 'fetch' || crumb.category === 'xhr') {
      if (crumb.data && crumb.data.url) {
        crumb.data.url = stripQueryString(crumb.data.url);
      }
    }

    if (crumb.category === 'console' && crumb.message && EMAIL_LIKE.test(crumb.message)) {
      crumb.message = crumb.message.replace(EMAIL_LIKE, '[redacted-email]');
    }

    return crumb;
  }

  root.PFC_PII_KEY_RE = PII_KEY;
  root.PFC_isPiiKey = isPiiKey;
  root.PFC_scrubPII = PFC_scrubPII;
  root.PFC_scrubBreadcrumb = PFC_scrubBreadcrumb;
})(typeof window !== 'undefined' ? window : globalThis);
