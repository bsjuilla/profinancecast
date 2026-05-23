/**
 * pfc-config.js — Single source of truth for client config.
 *
 * Load this BEFORE pfc-auth.js / pfc-storage.js / pfc-entitlements.js on every page.
 * Anon keys are public by design (Supabase calls them "publishable"); RLS at the
 * database layer is what protects user data, NOT the anon key.
 *
 * If you ever rotate the Supabase anon key, change it here ONCE.
 *
 * W28-e #40 — Supply-chain hardening.
 *   The auditor flagged this file as a single point of compromise: if it's
 *   ever served from a tampered cache (CDN edge-cache poisoning,
 *   mis-deploy, accidental edit), the PAYPAL_CLIENT_ID could be swapped
 *   to point at an attacker's PayPal app and funds would flow to them.
 *
 *   For a static-HTML deploy on Vercel without a build step, the realistic
 *   defenses are:
 *     1. Validate values on load — if they fail the expected format, FREEZE
 *        the page rather than letting the SDK try to interpolate them.
 *        Pairs with W26-a #11 (which validates again at script-src
 *        interpolation time inside billing-2.js).
 *     2. Vercel response header  Cache-Control: no-cache, must-revalidate
 *        on /js/pfc-config.js so an attacker can't poison a long-lived
 *        cached version. See vercel.json.
 *     3. Reject any future config that fails the schema — defensive,
 *        prevents a developer accident (typo, copy-paste of wrong key)
 *        from shipping bad values to production.
 *
 *   W29+ follow-up: SRI hash on the script tags in every HTML file (better
 *   defense but operationally painful — drift between hash and file content
 *   is a real risk for a solo founder). Documented as TODO_w29 below.
 */
(function () {
  'use strict';

  // ── Format validators ─────────────────────────────────────────────────────
  // SUPABASE_URL: must be HTTPS, must end with .supabase.co, no trailing slash
  const SUPABASE_URL_RE      = /^https:\/\/[a-z0-9-]{8,40}\.supabase\.co$/;
  // SUPABASE_ANON_KEY: JWT, three base64url segments separated by dots
  const SUPABASE_ANON_KEY_RE = /^eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/;
  // PAYPAL_CLIENT_ID: same regex used at the SDK URL interpolation site
  const PAYPAL_CLIENT_ID_RE  = /^[A-Za-z0-9_-]{30,160}$/;

  const RAW = {
    SUPABASE_URL:     'https://hmopwxjkxqvubkifplnk.supabase.co',
    SUPABASE_ANON_KEY:'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhtb3B3eGpreHF2dWJraWZwbG5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMzAyOTMsImV4cCI6MjA5MTkwNjI5M30.wCiB9DTSa1Yxy8-3PqLS9P05rrULzcVg_kLbxVuVCUk',
    PAYPAL_CLIENT_ID: 'AfB2Q0pvmI6fTYSe-JsUn2SHz8ZaDwIcjS-ZTP2jTHnIAQ_j1lkgZHac0gH7sVOVX9GckNnFTCDEP2WN',
  };

  const ok =
    SUPABASE_URL_RE.test(RAW.SUPABASE_URL) &&
    SUPABASE_ANON_KEY_RE.test(RAW.SUPABASE_ANON_KEY) &&
    PAYPAL_CLIENT_ID_RE.test(RAW.PAYPAL_CLIENT_ID);

  if (!ok) {
    // Fail closed. If config tampering happened (or someone shipped a typo),
    // we'd rather show a hard error than let downstream code interpolate
    // attacker-controlled values into <script src> / API URLs.
    //
    // Don't echo the bad values back to the DOM — that would make the page
    // useful for testing payloads. Just freeze with a generic message.
    console.error('[pfc-config] one or more config values failed validation; refusing to load.');
    window.PFC_CONFIG = Object.freeze({ _invalid: true });
    if (typeof document !== 'undefined' && document.documentElement) {
      // Hide the page entirely. Better a blank screen than a compromised one.
      try {
        document.documentElement.style.visibility = 'hidden';
        // Schedule a visible explanation once the DOM is ready.
        const showFatal = function () {
          try {
            document.body.innerHTML =
              '<div style="font-family:system-ui,sans-serif;max-width:500px;margin:80px auto;padding:24px;line-height:1.6;color:#444;">' +
              '<h1 style="color:#900;font-size:18px;margin-bottom:12px;">Configuration error</h1>' +
              '<p>This page is temporarily unavailable. Our team has been notified. Please try again in a few minutes, or contact <a href="mailto:support@profinancecast.com">support@profinancecast.com</a> if it persists.</p>' +
              '</div>';
            document.documentElement.style.visibility = '';
          } catch (_) {}
        };
        if (document.readyState !== 'loading') showFatal();
        else document.addEventListener('DOMContentLoaded', showFatal, { once: true });
      } catch (_) {}
    }
    return;
  }

  window.PFC_CONFIG = Object.freeze({
    SUPABASE_URL:     RAW.SUPABASE_URL,
    SUPABASE_ANON_KEY:RAW.SUPABASE_ANON_KEY,
    PAYPAL_CLIENT_ID: RAW.PAYPAL_CLIENT_ID,
    // origin used for OAuth redirects — falls back to current origin so dev/preview deploys work
    APP_ORIGIN: (typeof window !== 'undefined' && window.location && window.location.origin)
      ? window.location.origin
      : 'https://profinancecast.com',
  });
})();

// TODO_w29 (#40 follow-up): add SRI integrity hashes to every
//   <script src="./js/pfc-config.js"> in every HTML file. The
//   sha384 hash must be regenerated on every legitimate edit
//   to this file — operationally painful but a stronger guarantee
//   than format validation alone.
//
// Sketch:
//   1. CI step:
//        sha384=$(openssl dgst -sha384 -binary js/pfc-config.js | base64 -A)
//   2. Replace every script tag:
//        <script src="./js/pfc-config.js"
//                integrity="sha384-${sha384}"
//                crossorigin="anonymous"></script>
//   3. Wire as a pre-commit hook so the integrity attribute is always
//      in sync with the file content. Without that hook, drift is
//      inevitable and every legitimate edit will break the deploy.
