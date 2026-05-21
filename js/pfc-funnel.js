/**
 * pfc-funnel.js — Privacy-preserving funnel-event emitter.
 *
 * Six events that let the founder answer "what's our conversion rate by
 * funnel step?" WITHOUT contradicting the privacy-first brand promise.
 * Per CDO Wave-13 plan. Backed by Plausible custom events (already in
 * the CSP allowlist) — NOT Google Analytics, NOT Mixpanel, NOT Hotjar.
 *
 * Hard rules (CDO §1):
 *   - No PII in any event payload (no email, no name, no income figure)
 *   - No IP-derived geo
 *   - Per-event payload <200 bytes
 *   - Event names use dot-namespace prefix: `pfc.X`
 *
 * Events (CDO §1):
 *   pfc.landing_viewed    — any landing page renders
 *   pfc.signup_started    — Get Started / signup CTA clicked
 *   pfc.onboarding_step   — each wizard step transition (param: step number)
 *   pfc.activation_done   — first 12-month forecast rendered with real inputs
 *   pfc.scenario_saved    — first scenario saved (Pro-tier value moment)
 *   pfc.pro_intent        — See Pro plans / upgrade CTA clicked
 *
 * Exposed on window so per-page inline scripts can call without imports
 * (matches the rest of this codebase's globals pattern).
 *
 * Plausible loads via the existing <script async src="...plausible.io/...">
 * tag. We call window.plausible(eventName, { props }) — Plausible buffers
 * events until the script loads.
 */
(function () {
  'use strict';

  // Allowlist of events we will accept. Any caller passing an event name
  // not in this list is rejected at runtime. Prevents drift / typos.
  var ALLOWED_EVENTS = {
    'pfc.landing_viewed':  { propAllowlist: ['path'] },
    'pfc.signup_started':  { propAllowlist: ['source'] },
    'pfc.onboarding_step': { propAllowlist: ['step'] },
    'pfc.activation_done': { propAllowlist: [] },
    'pfc.scenario_saved':  { propAllowlist: [] },
    'pfc.pro_intent':      { propAllowlist: ['source'] }
  };

  // Forbidden value patterns. If a prop value matches any of these, the
  // event is rejected at runtime with a console.warn. Defense in depth
  // against accidental PII leakage.
  var FORBIDDEN_VALUE_PATTERNS = [
    /@/,                                            // email
    /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/,   // card number
    /\b[A-Z]{2}\d{2}\s?[A-Z\d]{4}\s?[A-Z\d]{4}/,    // IBAN starts
    /\b\d{3,}\b/                                    // 3+ digit raw number (income, balance, etc.)
  ];

  function safeProps(eventName, props) {
    var allowed = ALLOWED_EVENTS[eventName].propAllowlist;
    var out = {};
    if (!props) return out;
    for (var k in props) {
      if (allowed.indexOf(k) === -1) continue;        // drop unknown keys
      var v = String(props[k]);
      if (v.length > 80) continue;                    // payload size guard
      // PII scan
      var bad = false;
      for (var i = 0; i < FORBIDDEN_VALUE_PATTERNS.length; i++) {
        if (FORBIDDEN_VALUE_PATTERNS[i].test(v)) { bad = true; break; }
      }
      if (bad) {
        try { console.warn('[pfc-funnel] PII-shaped value rejected for prop: ' + k); } catch (_) {}
        continue;
      }
      out[k] = v;
    }
    return out;
  }

  /**
   * Fire a funnel event. Silent on failure (no exception bubbles up — never
   * blocks a user action because telemetry hiccuped).
   *
   * @param {string} eventName  - Must be in ALLOWED_EVENTS
   * @param {Object} [props]    - Optional, only keys in propAllowlist survive
   */
  function track(eventName, props) {
    try {
      if (!ALLOWED_EVENTS[eventName]) {
        console.warn('[pfc-funnel] Unknown event: ' + eventName);
        return;
      }
      var clean = safeProps(eventName, props);
      // Plausible's call signature: plausible(eventName, { props: {...} })
      // If Plausible hasn't loaded yet, it queues to plausible.q.
      if (typeof window.plausible === 'function') {
        window.plausible(eventName, { props: clean });
      } else {
        // Buffer manually — Plausible's loader script picks this up on init.
        window.plausible = window.plausible || function () {
          (window.plausible.q = window.plausible.q || []).push(arguments);
        };
        window.plausible(eventName, { props: clean });
      }
    } catch (_) { /* never block on telemetry */ }
  }

  // Auto-fire pfc.landing_viewed on every page load. Path is the full
  // pathname (no query, no hash, no PII) and is allowlisted under
  // pfc.landing_viewed's propAllowlist above.
  if (document.readyState !== 'loading') {
    track('pfc.landing_viewed', { path: location.pathname });
  } else {
    document.addEventListener('DOMContentLoaded', function () {
      track('pfc.landing_viewed', { path: location.pathname });
    }, { once: true });
  }

  window.PFCFunnel = {
    track: track,
    // Exposed for debugging in DevTools
    _allowed: ALLOWED_EVENTS
  };
})();
