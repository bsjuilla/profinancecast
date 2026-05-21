# ProFinanceCast — pfc-anim Animation Library (agent deliverable)

Tone: ink drying, not rocket boost. Default easing `--pfc-ease-hero` = `cubic-bezier(0.16, 1, 0.3, 1)`. Reduced-motion is inherited from the global rule in `css/pfc-tokens.css` (collapses every animation/transition duration to ~0ms). 9 of 10 animations are GPU-composited (transform/opacity/clip-path only); the 10th (Pro shimmer) paints on a small badge area only.

## 1. Ledger-pen underline (`.pfc-ink-underline`)
Fraunces italic h2 gets a hand-drawn-feel underline via `clip-path: inset(...)` slide. No width animation, no layout work.

## 2. KPI count-up (`[data-count-to]`)
Reuses existing `PFCMotion.countTo`. Element receives formatted value as textContent; `font-variant-numeric: tabular-nums` reserves space.

## 3. Card fade-in stagger (`.pfc-stagger > .card`)
CSS-only stagger via `nth-child` delays; parent gets `.is-in` on viewport-enter via shared IntersectionObserver.

## 4. Hero image patina fade (`.pfc-photo-hero picture`)
Picture starts at `opacity:0`, fades 600ms after `<img>` `load` event. Zero CLS because width/height are explicit.

## 5. Sage typing indicator (`.pfc-typing`)
Three dots, 1.4s opacity cycle staggered 200ms. Opacity only (no translate) for dignified feel.

## 6. Empty-state breath (`.pfc-empty-breath`)
3-second slow opacity oscillation 0.92 ↔ 1.0. ease-in-out, not spring.

## 7. Topbar slide-in (`.topbar.is-mounted`)
280ms fade + 4px translateY on first paint. Subtle by design.

## 8. Pro badge shimmer (`[data-pro-only].pfc-shimmer-init`)
Single brass-gradient sweep on viewport-enter, `forwards` fill so it stays gold. ~1100ms.

## 9. Chart.js enter config (`window.PFCAnim.chartEnterOptions`)
900ms easeOutQuart stroke-in; explicit `animation: false` for reduced-motion (Chart.js doesn't read CSS).

## 10. Save-button success pulse (`.save-btn.saved`)
Single 350ms scale 1→1.04→1 + color flash to money-soft.

---

## css/pfc-anim.css

```css
/* ════════════════════════════════════════════════════════════════════════
   pfc-anim.css — Subtle motion library for ProFinanceCast.
   Tone: ink drying. Default easing: var(--pfc-ease-hero).
   Reduced-motion: inherited from pfc-tokens.css (global *, *::before, *::after rule).
   All animations transform/opacity/clip-path only — GPU-composited.
   ════════════════════════════════════════════════════════════════════════ */

/* 1 ─ Ledger-pen underline */
.pfc-ink-underline { position: relative; display: inline-block; }
.pfc-ink-underline::after {
  content: ""; position: absolute;
  left: 0; right: 0; bottom: -6px; height: 2px;
  background: linear-gradient(90deg,
    transparent 0%, var(--gold) 6%, var(--gold) 94%, transparent 100%);
  clip-path: inset(0 100% 0 0);
  transition: clip-path 1200ms var(--pfc-ease-hero);
  will-change: clip-path;
}
.pfc-ink-underline.is-inked::after { clip-path: inset(0 0 0 0); }

/* 2 ─ KPI count-up: no CSS, see pfc-anim.js */

/* 3 ─ Card fade-in stagger */
.pfc-stagger > .card {
  opacity: 0; transform: translateY(8px);
  transition:
    opacity 480ms var(--pfc-ease-hero),
    transform 480ms var(--pfc-ease-hero);
  will-change: opacity, transform;
}
.pfc-stagger.is-in > .card { opacity: 1; transform: none; }
.pfc-stagger.is-in > .card:nth-child(1) { transition-delay:   0ms; }
.pfc-stagger.is-in > .card:nth-child(2) { transition-delay:  80ms; }
.pfc-stagger.is-in > .card:nth-child(3) { transition-delay: 160ms; }
.pfc-stagger.is-in > .card:nth-child(4) { transition-delay: 240ms; }
.pfc-stagger.is-in > .card:nth-child(5) { transition-delay: 320ms; }
.pfc-stagger.is-in > .card:nth-child(6) { transition-delay: 400ms; }
.pfc-stagger.is-in > .card:nth-child(n+7) { transition-delay: 480ms; }

/* 4 ─ Hero image patina fade */
.pfc-photo-hero picture {
  opacity: 0;
  transition: opacity 600ms var(--pfc-ease-hero);
}
.pfc-photo-hero.is-loaded picture { opacity: 1; }

/* 5 ─ Sage typing indicator */
.pfc-typing {
  display: inline-flex; gap: 4px; align-items: center; height: 1em;
}
.pfc-typing span {
  width: 5px; height: 5px; border-radius: 50%;
  background: var(--sage); opacity: 0.25;
  animation: pfc-typing-dot 1400ms var(--pfc-ease-micro) infinite;
}
.pfc-typing span:nth-child(2) { animation-delay: 200ms; }
.pfc-typing span:nth-child(3) { animation-delay: 400ms; }
@keyframes pfc-typing-dot {
  0%, 60%, 100% { opacity: 0.25; }
  30%           { opacity: 1; }
}

/* 6 ─ Empty-state breath */
.pfc-empty-breath {
  animation: pfc-breath 3000ms ease-in-out infinite;
  will-change: opacity;
}
@keyframes pfc-breath {
  0%, 100% { opacity: 0.92; }
  50%      { opacity: 1.00; }
}

/* 7 ─ Topbar slide-in */
.topbar {
  opacity: 0; transform: translateY(-4px);
  transition:
    opacity 280ms var(--pfc-ease-hero),
    transform 280ms var(--pfc-ease-hero);
  will-change: opacity, transform;
}
.topbar.is-mounted { opacity: 1; transform: none; }

/* 8 ─ Pro badge shimmer */
[data-pro-only].pfc-shimmer-init {
  background-image: linear-gradient(100deg,
    var(--gold-soft) 0%, var(--gold-soft) 40%,
    rgba(212,175,106,0.55) 50%,
    var(--gold-soft) 60%, var(--gold-soft) 100%);
  background-size: 220% 100%;
  background-position: 100% 0;
  animation: pfc-shimmer 1100ms var(--pfc-ease-hero) 1 forwards;
}
@keyframes pfc-shimmer {
  from { background-position: 100% 0; }
  to   { background-position:   0% 0; }
}

/* 9 ─ Chart enter: no CSS — see PFCAnim.chartEnterOptions in pfc-anim.js */

/* 10 ─ Save-button success pulse */
.save-btn {
  transition: background-color 240ms var(--pfc-ease-hero);
}
.save-btn.saved {
  animation: pfc-save-pulse 350ms var(--pfc-ease-hero) 1;
  background-color: var(--money-soft);
}
@keyframes pfc-save-pulse {
  0%   { transform: scale(1);    background-color: var(--surface-2); }
  45%  { transform: scale(1.04); background-color: var(--money); }
  100% { transform: scale(1);    background-color: var(--money-soft); }
}
```

## js/pfc-anim.js

```js
/**
 * pfc-anim.js — Wires the IntersectionObserver-based animations from pfc-anim.css.
 * Reuses PFCMotion.observe and PFCMotion.countTo from pfc-motion.js.
 */
(function () {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const euroFmt = (n) => '€' + Math.round(n).toLocaleString('de-DE');

  // 1 — Ledger-pen underline on viewport-enter
  document.querySelectorAll('[data-anim="underline"], .pfc-ink-underline').forEach((el) => {
    PFCMotion.observe(el, (t) => t.classList.add('is-inked'), { threshold: 0.4 });
  });

  // 2 — KPI count-up
  document.querySelectorAll('[data-count-to]').forEach((el) => {
    const to   = parseFloat(el.dataset.countTo);
    const from = parseFloat(el.dataset.countFrom || '0');
    const fmt  = el.dataset.countFmt === 'euro' ? euroFmt : 'money';
    PFCMotion.observe(el, () => PFCMotion.countTo(el, from, to,
      { duration: 1400, formatter: fmt }), { threshold: 0.5 });
  });

  // 3 — Card stagger
  document.querySelectorAll('[data-anim="stagger"], .pfc-stagger').forEach((el) => {
    PFCMotion.observe(el, (t) => t.classList.add('is-in'), { threshold: 0.2 });
  });

  // 4 — Hero image patina
  document.querySelectorAll('.pfc-photo-hero').forEach((fig) => {
    const img = fig.querySelector('img');
    if (!img) return;
    if (img.complete && img.naturalWidth) fig.classList.add('is-loaded');
    else img.addEventListener('load',  () => fig.classList.add('is-loaded'), { once: true });
    img.addEventListener('error', () => fig.classList.add('is-loaded'), { once: true });
  });

  // 7 — Topbar slide-in on first paint
  const mountTopbar = () => document.querySelectorAll('.topbar').forEach((b) => b.classList.add('is-mounted'));
  if (document.readyState !== 'loading') requestAnimationFrame(mountTopbar);
  else document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(mountTopbar));

  // 8 — Pro badge shimmer
  document.querySelectorAll('[data-pro-only]').forEach((el) => {
    PFCMotion.observe(el, (t) => t.classList.add('pfc-shimmer-init'), { threshold: 0.6 });
  });

  // 9 — Chart enter config
  const chartEnterOptions = {
    animation: reduce ? false : {
      duration: 900,
      easing: 'easeOutQuart',
      x: { from: 0 },
      y: { from: (ctx) => ctx.chart.scales.y.getPixelForValue(0) },
    },
    animations: { tension: { duration: 0 } },
    transitions: { active: { animation: { duration: 0 } } },
  };

  // 10 — Save-button pulse helper
  function pulseSave(btn) {
    btn.classList.remove('saved');
    void btn.offsetWidth;
    btn.classList.add('saved');
  }

  window.PFCAnim = { chartEnterOptions, pulseSave };
})();
```

## Integration notes
- Load order: `pfc-tokens.css` → `pfc-anim.css` → page CSS; `pfc-motion.js` → `pfc-anim.js` → page JS
- Depends on existing `PFCMotion.observe` + `PFCMotion.countTo` (reuse, no duplication)
- Reduced-motion centralised in pfc-tokens.css (lines 264–286); only Chart.js needs an explicit check
- `will-change` applied only to long-running animations to keep GPU memory in check across 27 pages
