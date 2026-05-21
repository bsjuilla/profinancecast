/**
 * pfc-anim.js — Wires the IntersectionObserver-based animations from
 * css/pfc-anim.css. Reuses PFCMotion.observe and PFCMotion.countTo from
 * pfc-motion.js (already in every page).
 *
 * Load order: pfc-motion.js → pfc-anim.js → page JS. If PFCMotion is
 * absent (e.g. lighter blog pages), this module no-ops gracefully.
 *
 * Origin: docs/superpowers/audits/2026-05-21-anim-library.md (agent deliverable).
 */
(function () {
  'use strict';

  const reduce = (typeof matchMedia === 'function')
    && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // PFCMotion may not be present on every page — degrade gracefully.
  const M = (typeof window !== 'undefined' && window.PFCMotion) || null;

  function observe(el, fn, opts) {
    if (M && typeof M.observe === 'function') {
      M.observe(el, fn, opts || {});
      return;
    }
    // Fallback: fire immediately if no IO available.
    try { fn(el); } catch (_) {}
  }

  function countTo(el, from, to, opts) {
    if (M && typeof M.countTo === 'function') {
      M.countTo(el, from, to, opts || {});
      return;
    }
    el.textContent = String(to);
  }

  const euroFmt = (n) => '€' + Math.round(n).toLocaleString('de-DE');
  const numFmt  = (n) => Math.round(n).toLocaleString('en-GB');

  // 1 — Ledger-pen underline on viewport-enter
  document.querySelectorAll('[data-anim="underline"], .pfc-ink-underline').forEach((el) => {
    observe(el, (t) => t.classList.add('is-inked'), { threshold: 0.4 });
  });

  // 2 — KPI count-up
  document.querySelectorAll('[data-count-to]').forEach((el) => {
    const to   = parseFloat(el.dataset.countTo);
    const from = parseFloat(el.dataset.countFrom || '0');
    const fmt  = el.dataset.countFmt === 'euro' ? euroFmt : numFmt;
    observe(el, () => countTo(el, from, to, { duration: 1400, formatter: fmt }),
      { threshold: 0.5 });
  });

  // 3 — Card stagger
  document.querySelectorAll('[data-anim="stagger"], .pfc-stagger').forEach((el) => {
    observe(el, (t) => t.classList.add('is-in'), { threshold: 0.2 });
  });

  // 4 — Hero image patina (every photo-figure / photo-hero)
  document.querySelectorAll('.pfc-photo-hero, .pfc-photo-figure').forEach((fig) => {
    const img = fig.querySelector('img');
    if (!img) { fig.classList.add('is-loaded'); return; }
    if (img.complete && img.naturalWidth) fig.classList.add('is-loaded');
    else img.addEventListener('load',  () => fig.classList.add('is-loaded'), { once: true });
    img.addEventListener('error', () => fig.classList.add('is-loaded'), { once: true });
  });

  // 7 — Topbar slide-in on first paint
  function mountTopbar() {
    document.querySelectorAll('.topbar').forEach((b) => b.classList.add('is-mounted'));
  }
  if (document.readyState !== 'loading') requestAnimationFrame(mountTopbar);
  else document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(mountTopbar));

  // 8 — Pro badge shimmer (one-shot on viewport-enter)
  document.querySelectorAll('[data-pro-only]').forEach((el) => {
    observe(el, (t) => t.classList.add('pfc-shimmer-init'), { threshold: 0.6 });
  });

  // 9 — Chart enter config (consumed by chart-rendering inline scripts)
  const chartEnterOptions = {
    animation: reduce ? false : {
      duration: 900,
      easing: 'easeOutQuart',
    },
    animations: { tension: { duration: 0 } },
    transitions: { active: { animation: { duration: 0 } } },
  };

  // 10 — Save-button pulse helper
  function pulseSave(btn) {
    if (!btn) return;
    btn.classList.remove('saved');
    void btn.offsetWidth; // reflow → animation restarts
    btn.classList.add('saved');
  }

  window.PFCAnim = { chartEnterOptions, pulseSave };
})();
