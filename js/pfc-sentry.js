/**
 * pfc-sentry.js — Sentry init wrapper.
 *
 * Loads AFTER pfc-sentry-scrub.js (which exposes PFC_scrubPII +
 * PFC_scrubBreadcrumb on window). The Sentry loader script is loaded with
 * `data-lazy="no"` so that Sentry.onLoad is available synchronously at
 * page-load.
 *
 * Source: QA-BRIEF §4 (paste-ready). Keeping this in its own file (vs
 * inline) lets the CSP keep `script-src` tight and gives a single place
 * to bump the release SHA + sample rates.
 *
 * Replays + tracing are OFF — both can capture PII / DOM contents and
 * the moat is "we never see your bank credentials." Errors-only.
 */
(function () {
  'use strict';
  if (typeof Sentry === 'undefined' || !Sentry.onLoad) return;

  Sentry.onLoad(function () {
    Sentry.init({
      environment: location.hostname === 'profinancecast.com' ? 'production' : 'preview',
      release: 'profinancecast@' + (window.PFC_BUILD_SHA || 'dev'),
      sampleRate: 1.0,
      tracesSampleRate: 0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      ignoreErrors: [
        'ResizeObserver loop limit exceeded',
        'ResizeObserver loop completed with undelivered notifications',
        'Non-Error promise rejection captured',
        'Script error.',
        /^Network request failed.*cloudflareinsights/i,
      ],
      denyUrls: [
        /chrome-extension:\/\//,
        /moz-extension:\/\//,
        /safari-extension:\/\//,
        /static\.cloudflareinsights\.com/,
      ],
      beforeSend: typeof PFC_scrubPII === 'function' ? PFC_scrubPII : undefined,
      beforeBreadcrumb: typeof PFC_scrubBreadcrumb === 'function' ? PFC_scrubBreadcrumb : undefined,
    });
  });
})();
