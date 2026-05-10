/**
 * pfc-analytics.js — PFC.track() wrapper + 18 wired events.
 *
 * Public API:
 *   PFC.track(name, props)  → strips PII keys, queues to window._cfa
 *                             (Cloudflare Analytics convention).
 *
 * Auto-wires the 18 events from QA-BRIEF §3 on DOMContentLoaded. Handlers
 * skip silently when the target element isn't on the current page, so this
 * file is safe to load on every page.
 *
 * IntersectionObserver triggers route through PFCMotion.observe (no raw `new
 * IntersectionObserver`). Numeric values are bucketed before send. PII regex
 * is shared with pfc-sentry-scrub.js when present.
 *
 * Loaded after pfc-motion.js + pfc-storage.js. Safe before Cloudflare beacon
 * loads (queue persists; beacon flushes when ready).
 */
(function () {
  'use strict';

  const T0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;

  // Reuse pfc-sentry-scrub.js's regex when loaded; fall back to a local copy
  // for pages that ship analytics without sentry-scrub.
  const FALLBACK_PII = /email|name|phone|password|token|address|street|city|zip|postcode|ip|dob|account_id|user_id|customer_id|referral_code/i;
  function isPii(k) {
    if (typeof window.PFC_isPiiKey === 'function') return window.PFC_isPiiKey(k);
    return FALLBACK_PII.test(k);
  }

  function scrub(props) {
    if (!props || typeof props !== 'object') return {};
    const out = {};
    for (const k in props) {
      if (!Object.prototype.hasOwnProperty.call(props, k)) continue;
      if (isPii(k)) continue;
      const v = props[k];
      if (v === undefined || typeof v === 'function' || typeof v === 'symbol') continue;
      out[k] = v;
    }
    return out;
  }

  // Bucketing rule per QA-BRIEF: never ship raw $ or counts.
  const DOLLAR_BANDS = [
    [5e3,    '<5k'],
    [1e4,    '5-10k'],
    [2.5e4,  '10-25k'],
    [1e5,    '25-100k'],
    [5e5,    '100-500k'],
    [1e6,    '500k-1M'],
  ];
  function bucketDollars(n) {
    if (typeof n !== 'number' || !isFinite(n)) return 'unknown';
    const a = Math.abs(n);
    for (const [threshold, label] of DOLLAR_BANDS) if (a < threshold) return label;
    return '1M+';
  }

  function bucketRemaining(n) {
    if (typeof n !== 'number' || n <= 0) return 'sold-out';
    if (n > 100) return '500-100';
    if (n > 25)  return '100-25';
    return '24-1';
  }

  function track(name, props) {
    if (!name || typeof name !== 'string') return;
    window._cfa = window._cfa || [];
    window._cfa.push(['event', name, scrub(props || {})]);
  }

  window.PFC = window.PFC || {};
  window.PFC.track = track;

  function onceVisible(selector, fn, threshold) {
    const el = document.querySelector(selector);
    if (!el) return;
    if (typeof PFCMotion !== 'undefined' && PFCMotion.observe) {
      PFCMotion.observe(el, fn, { threshold: threshold || 0.5 });
    } else {
      fn(el);
    }
  }

  const SURFACE_RULES = [
    [/billing/,      'billing'],
    [/scenarios/,    'scenarios'],
    [/report-card/,  'report-card'],
    [/sage/,         'sage'],
    [/dashboard/,    'dashboard'],
    [/blog\b/,       'blog'],
    [/auth/,         'auth'],
    [/onboarding/,   'onboarding'],
  ];
  function detectSurface() {
    const path = location.pathname.replace(/\.html$/, '') || '/';
    const hit = SURFACE_RULES.find(([re]) => re.test(path));
    return hit ? hit[1] : 'index';
  }

  function wire() {
    const surface = detectSurface();

    // 1. founders_counter_view
    onceVisible('[data-founders-counter], #founders-counter', (el) => {
      const remaining = parseInt(el.getAttribute('data-remaining') || '', 10);
      const state = el.getAttribute('data-failclosed') === '1' ? 'failclosed' : 'live';
      track('founders_counter_view', { remaining_bucket: bucketRemaining(remaining), state });
    });

    // 2. founders_cta_click
    document.querySelectorAll('[data-cta="founders-claim"]').forEach(btn => {
      btn.addEventListener('click', () => {
        track('founders_cta_click', { price: 149, currency: 'USD', placement: surface });
      });
    });

    // 3-4. Surfaces dispatch CustomEvents on the document for these.
    document.addEventListener('pfc:founders-render', (e) => {
      if (e.detail && e.detail.remaining === 0) {
        track('founders_seat_sold_out', { source: e.detail.source || 'page-load' });
      }
    });
    document.addEventListener('pfc:founders-claim-success', (e) => {
      const after = e.detail && typeof e.detail.seats_remaining_after === 'number'
        ? Math.max(0, e.detail.seats_remaining_after) : null;
      track('founders_claim_success', { price: 149, currency: 'USD', seats_remaining_after: after });
    });

    // 5. blog_card_click
    document.querySelectorAll('.blog-card').forEach((card, idx) => {
      const link = card.querySelector('a[href]');
      if (!link) return;
      link.addEventListener('click', () => {
        track('blog_card_click', {
          slug: card.getAttribute('data-slug') || '',
          category: card.getAttribute('data-category') || 'planning',
          position: idx + 1,
        });
      });
    });

    // 6. blog_50_percent_scroll — requires the blog page to render a hidden
    // sentinel at #blog-50pct. Time is elapsed-ms since this script's IIFE.
    onceVisible('#blog-50pct', () => {
      track('blog_50_percent_scroll', {
        slug: document.body.getAttribute('data-slug') || '',
        time_to_50pct_ms: Math.max(0, Math.round(performance.now() - T0)),
      });
    });

    // 7. sticky_mobile_cta_tap
    document.querySelectorAll('.pfc-sticky-cta').forEach(el => {
      el.addEventListener('click', () => {
        let dismissed = 0;
        if (typeof PFCStorage !== 'undefined') {
          const raw = PFCStorage.get('sticky-cta-dismissed-count');
          dismissed = Math.min(30, parseInt(raw || '0', 10) || 0);
        }
        track('sticky_mobile_cta_tap', { surface, dismissed_count: dismissed });
      });
    });

    // 8. scenario_gallery_view — only for Free users seeing the editorial preview.
    onceVisible('.scenarios-preview', () => {
      const plan = (typeof PFCPlan !== 'undefined' && PFCPlan.get) ? PFCPlan.get() : 'free';
      if (plan !== 'free') return;
      track('scenario_gallery_view', { plan: 'free', preview_count: 2 });
    });

    // 9. scenario_pro_pill_click
    document.querySelectorAll('[data-cta="pro-pill"]').forEach(el => {
      el.addEventListener('click', () => track('scenario_pro_pill_click', { surface }));
    });

    // 10. hero_credibility_strip_view (index only)
    if (surface === 'index') {
      onceVisible('section.credibility', () => {
        track('hero_credibility_strip_view', { surface: 'index' });
      });
    }

    // 11-12. Slider drag + settle. Per-slider state via WeakMap so dragging
    // a different slider doesn't clobber a pending event from the first.
    const sliders = document.querySelectorAll('.pfc-slider, .hero-slider input[type="range"]');
    const lastDragAt = new WeakMap();
    const settleTimers = new WeakMap();

    function bucketSliderName(slider) {
      const named = slider.getAttribute('data-slider');
      if (named) return named;
      const id = slider.id || '';
      if (/sav/.test(id)) return 'savings';
      if (/horiz|year/.test(id)) return 'horizon';
      return 'income';
    }

    sliders.forEach(slider => {
      slider.addEventListener('pointerup', () => {
        const now = Date.now();
        const last = lastDragAt.get(slider) || 0;
        if (now - last < 500) return;
        lastDragAt.set(slider, now);
        track('demo_slider_drag', {
          slider: bucketSliderName(slider),
          final_value_bucket: bucketDollars(parseFloat(slider.value)),
        });
      });
      slider.addEventListener('input', () => {
        const t = settleTimers.get(slider);
        if (t) clearTimeout(t);
        settleTimers.set(slider, setTimeout(() => {
          const horizonEl = document.querySelector('[data-slider="horizon"]');
          const horizon = horizonEl ? parseInt(horizonEl.value || '10', 10) : 10;
          const projected = parseFloat(slider.getAttribute('data-projected-nw') || '0');
          track('demo_final_value', {
            projected_nw_bucket: bucketDollars(projected),
            horizon_years: isFinite(horizon) ? horizon : 10,
          });
        }, 3000));
      });
    });

    // 13. signup_default_view
    if (surface === 'auth') {
      const signup = document.querySelector('.view-signup.active, #view-signup.active');
      if (signup) {
        let ref = '';
        try { if (document.referrer) ref = new URL(document.referrer).pathname || ''; } catch (_) {}
        track('signup_default_view', { referrer_path: ref });
      }
    }

    // 14. signup_defer_verify_success — auth.html dispatches this.
    document.addEventListener('pfc:signup-defer-verify-success', (e) => {
      const method = (e.detail && e.detail.method === 'google') ? 'google' : 'email';
      track('signup_defer_verify_success', { method });
    });

    // 15. newsletter_signup
    document.addEventListener('pfc:newsletter-signup', (e) => {
      const props = { placement: (e.detail && e.detail.placement) || 'footer' };
      const magnet = e.detail && e.detail.magnet_id;
      if (magnet) props.magnet_id = magnet;
      track('newsletter_signup', props);
    });

    // 16. referral_link_share
    document.querySelectorAll('[data-cta="referral-share"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const method = btn.getAttribute('data-method') === 'native-share' ? 'native-share' : 'copy';
        track('referral_link_share', { method });
      });
    });

    // 17. referral_link_claim
    document.addEventListener('pfc:referral-claim', () => {
      track('referral_link_claim', { ref_code_present: true });
    });

    // 18. exit_popup_ban — never fires. The rule itself is in QA-BRIEF.
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire, { once: true });
  } else {
    wire();
  }
})();
