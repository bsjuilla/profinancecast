/* PFC_INLINE_BOOTSTRAP_v4 — wires data-pfc-on-* attributes to addEventListener.
 *
 * EXTERNAL file (CSP compliant): script-src-elem 'self' allows loading
 * this from /js/. v1-v3 were inline <script> blocks per page, which
 * silently failed under the Wave-11 tight CSP (script-src-elem 'self'
 * blocks ALL inline scripts). The visual-regression workflow still
 * passed because the pages render fine; the e2e-smoke workflow caught
 * the dead handlers immediately on its first run.
 *
 * Wave-12 Wave-11-fix: extract to this file, load via <script src>.
 *
 * Loaded with `defer` after pfc-anim.js. By DOMContentLoaded all
 * data-pfc-on-* attrs are in the DOM, so a single pass at script load
 * is enough — no need for IntersectionObserver or MutationObserver.
 *
 * Generated function-body is mechanical (scripts/convert-inline-handlers.js
 * walks the codebase and rewrites on*= attrs to data-pfc-on-*=). The
 * runtime dispatcher below is the single source of truth for how those
 * attributes are interpreted.
 *
 * Sets window.__PFC_BOOTSTRAP_READY__ = true at end so pfc-sentry.js
 * can tag events with the bootstrap status.
 */
(function () {
  'use strict';

  function callFn(name, args) {
    var fn = window[name];
    if (typeof fn === 'function') {
      try { return fn.apply(null, args); }
      catch (e) { console.error('[pfc-inline] ' + name + ': ' + e.message); }
    } else if (name.charAt(0) !== '_') {
      console.warn('[pfc-inline] handler not defined: ' + name);
    }
  }

  // Internal handlers prefixed `_pfc_` — these don't collide with page
  // functions because no page-defined handler starts with an underscore.
  var INTERNAL = {
    _pfc_nav: function (el) {
      window.location.href = el.getAttribute('data-pfc-href');
    },
    _pfc_settext: function (el) {
      var tgt = document.getElementById(el.getAttribute('data-pfc-target'));
      if (tgt) tgt.textContent = el.value;
    },
    _pfc_trigger_click: function (el) {
      var tgt = document.getElementById(el.getAttribute('data-pfc-target'));
      if (tgt) tgt.click();
    },
    _pfc_style: function (el) {
      el.style[el.getAttribute('data-pfc-style-prop')] =
        el.getAttribute('data-pfc-style-value');
    },
    _pfc_style2: function (el) {
      try {
        var spec = JSON.parse(el.getAttribute('data-pfc-style'));
        for (var k in spec) el.style[k] = spec[k];
      } catch (_) {}
    }
  };

  var EV = ['click', 'input', 'change', 'submit', 'keyup', 'keydown', 'keypress',
            'focus', 'blur', 'mouseover', 'mouseout', 'mouseenter', 'mouseleave',
            'wheel'];

  function wireAll() {
    EV.forEach(function (ev) {
      var attr = 'data-pfc-on-' + ev;
      document.querySelectorAll('[' + attr + ']').forEach(function (el) {
        // Idempotency guard: if this element already has a listener wired
        // by us, skip. We set a sentinel attribute after wiring; the
        // browser's addEventListener dedupes function identity but not
        // anonymous-callback identity, so we need our own guard.
        if (el.__pfc_inline_wired_evs && el.__pfc_inline_wired_evs[ev]) return;
        el.__pfc_inline_wired_evs = el.__pfc_inline_wired_evs || {};
        el.__pfc_inline_wired_evs[ev] = 1;

        el.addEventListener(ev, function (e) {
          var fn = el.getAttribute(attr);
          // Key-guarded handlers — only fire on matching event.key
          var requiredKey = el.getAttribute('data-pfc-key');
          if (requiredKey && e.key !== requiredKey) return;

          // Dispatch to internal handler if name matches a _pfc_X helper
          if (INTERNAL[fn]) return INTERNAL[fn](el);

          // Build args list. Order rules:
          //   data-pfc-arg-event           => e (event object) FIRST
          //   data-pfc-arg-this            => el (DOM element) FIRST
          //   data-pfc-arg-this-value      => el.value FIRST
          //   data-pfc-arg (JSON, splat array) appends
          //   data-pfc-arg-this-trailing   => el goes LAST (after data-pfc-arg)
          var args = [];
          if (el.hasAttribute('data-pfc-arg-event')) args.push(e);
          else if (el.hasAttribute('data-pfc-arg-this')) args.push(el);
          else if (el.hasAttribute('data-pfc-arg-this-value')) args.push(el.value);
          if (el.hasAttribute('data-pfc-arg')) {
            var raw = el.getAttribute('data-pfc-arg');
            try {
              var parsed = JSON.parse(raw);
              if (Array.isArray(parsed) && !el.hasAttribute('data-pfc-arg-this')) {
                args = args.concat(parsed);
              } else {
                args.push(parsed);
              }
            } catch (_) { args.push(raw); }
          }
          if (el.hasAttribute('data-pfc-arg-this-trailing')) args.push(el);

          var rv = callFn(fn, args);
          // Chained side-effect calls (data-pfc-then="fn1,fn2") run after
          // the main call. No-arg fn names only — used for the multi-statement
          // pattern updateSlider(args); recalcForecast(); refreshInflBoxes().
          var then = el.getAttribute('data-pfc-then');
          if (then) {
            then.split(',').forEach(function (name) {
              name = name.trim();
              if (name) callFn(name, []);
            });
          }
          return rv;
        });
      });
    });
  }

  // `defer` means the script runs after HTML parsing — DOM is fully built.
  // Belt-and-braces: also wire on DOMContentLoaded for the unlikely case
  // someone loads this file without `defer`.
  if (document.readyState !== 'loading') wireAll();
  else document.addEventListener('DOMContentLoaded', wireAll, { once: true });

  // Sentry release-health diagnostic: pfc-sentry.js tags every event with
  // `pfc.bootstrap` so a new-issue email is diagnosable from the email
  // alone. If the bootstrap dispatcher itself fails to run, the tag
  // value stays `not-ready` — a strong signal to investigate CSP /
  // load-order regressions before chasing individual errors.
  window.__PFC_BOOTSTRAP_READY__ = true;
})();
