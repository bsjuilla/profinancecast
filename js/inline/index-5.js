(function () {
  // ── 1. GSAP REVEALS ──
  var __gsapTries = 0;
  function initMotion() {
    if (!window.gsap) {
      if (++__gsapTries > 15) {
        // GSAP never loaded — force-reveal so the page isn't an empty void.
        document.querySelectorAll('.reveal, .reveal-stagger > *').forEach(function (el) {
          el.style.opacity = '1';
          el.style.transform = 'none';
        });
        return;
      }
      setTimeout(initMotion, 100);
      return;
    }
    if (window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);

    // Hero entrance: explicit start + end states. gsap.from() would animate
    // FROM opacity:0 TO the CSS opacity:0 (degenerate, hero stays invisible).
    gsap.set('.hero .reveal', { opacity: 0, y: 30 });
    gsap.to('.hero .reveal', {
      opacity: 1, y: 0,
      duration: 0.8, stagger: 0.06, ease: 'power3.out', delay: 0.08,
    });

    document.querySelectorAll('section .reveal').forEach((el) => {
      if (el.closest('.hero')) return;
      gsap.fromTo(el, { y: 30, opacity: 0 }, {
        y: 0, opacity: 1, duration: 0.9, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 85%', toggleActions: 'play none none reverse' },
      });
    });

    document.querySelectorAll('.reveal-stagger').forEach((row) => {
      gsap.fromTo(row.children, { y: 24, opacity: 0 }, {
        y: 0, opacity: 1, duration: 0.7, stagger: 0.06, ease: 'power3.out',
        scrollTrigger: { trigger: row, start: 'top 85%', toggleActions: 'play none none reverse' },
      });
    });

    document.querySelectorAll('.step').forEach((step, i) => {
      gsap.fromTo(step.children, { x: i % 2 === 0 ? -40 : 40, opacity: 0 }, {
        x: 0, opacity: 1, duration: 0.9, ease: 'power3.out',
        scrollTrigger: { trigger: step, start: 'top 80%', toggleActions: 'play none none reverse' },
      });
    });

    const nav = document.getElementById('nav');
    ScrollTrigger.create({ start: 'top -10', end: 99999, onUpdate: (s) => nav.classList.toggle('scrolled', s.scroll() > 20) });
  }

  // ── 2. BENTO HOVER GLOW THAT FOLLOWS CURSOR ──
  function initBentoCursor() {
    document.querySelectorAll('[data-bento]').forEach(card => {
      card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', ((e.clientX - r.left) / r.width  * 100) + '%');
        card.style.setProperty('--my', ((e.clientY - r.top)  / r.height * 100) + '%');
      });
    });
  }

  // ── 3. LIVE FORECAST WIDGET ──
  function initForecast() {
    const sIn   = document.getElementById('s-income');
    const sRate = document.getElementById('s-rate');
    const sDeb  = document.getElementById('s-debt');
    const sNw   = document.getElementById('s-nw');
    const vIn   = document.getElementById('v-income');
    const vRate = document.getElementById('v-rate');
    const vDeb  = document.getElementById('v-debt');
    const vNw   = document.getElementById('v-nw');
    const rNw      = document.getElementById('r-nw');
    const rDelta   = document.getElementById('r-delta');
    const rDebt    = document.getElementById('r-debt-free');
    const fcLine   = document.getElementById('fc-line');
    const fcArea   = document.getElementById('fc-area');
    const fcEnd    = document.getElementById('fc-end');
    const fcGlow   = document.getElementById('fc-end-glow');

    if (!sIn) return;

    const fmt = n => {
      // BRAND-VOICE: every dollar gets thousands separator. Never $17k.
      const sign = n < 0 ? '−' : '';
      return sign + '$' + Math.abs(Math.round(n)).toLocaleString('en-US');
    };
    function updatePct(input) {
      const min = +input.min, max = +input.max, val = +input.value;
      input.style.setProperty('--p', ((val - min) / (max - min) * 100) + '%');
    }
    function recompute() {
      const income = +sIn.value;
      const rate   = +sRate.value / 100;
      let debt     = +sDeb.value;
      let nw       = +sNw.value;
      const W = 600, H = 200;
      const monthlySave = income * rate;
      const debtPay = Math.min(debt, Math.max(150, monthlySave * 0.5));
      const points = [];
      let curNw = nw, curDebt = debt;
      let debtFreeMonth = -1;
      for (let m = 0; m <= 12; m++) {
        if (curDebt > 0) {
          const interest = curDebt * 0.012;
          curDebt = Math.max(0, curDebt + interest - debtPay);
          curNw += monthlySave - debtPay;
          if (curDebt === 0 && debtFreeMonth === -1) debtFreeMonth = m;
        } else {
          curNw += monthlySave;
        }
        points.push(curNw);
      }
      const min = Math.min(...points), max = Math.max(...points);
      const range = Math.max(1, max - min);
      const pad = 16;
      const xStep = (W - 2 * pad) / 12;
      const yScale = (v) => H - pad - ((v - min) / range) * (H - 2 * pad);
      let d = '';
      points.forEach((p, i) => {
        const x = pad + i * xStep;
        const y = yScale(p);
        d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
      });
      const last = points[points.length - 1];
      const lastX = pad + 12 * xStep;
      const lastY = yScale(last);
      fcLine.setAttribute('d', d);
      fcArea.setAttribute('d', d + 'L' + lastX + ',' + (H - pad) + ' L' + pad + ',' + (H - pad) + ' Z');
      fcEnd.setAttribute('cx', lastX); fcEnd.setAttribute('cy', lastY);
      fcGlow.setAttribute('cx', lastX); fcGlow.setAttribute('cy', lastY);

      vIn.textContent = fmt(income);
      vRate.textContent = (rate * 100).toFixed(0) + '%';
      vDeb.textContent  = fmt(+sDeb.value);
      vNw.textContent   = fmt(+sNw.value);
      rNw.textContent = fmt(last);
      const delta = last - nw;
      rDelta.textContent = (delta >= 0 ? '+' : '') + fmt(delta);
      rDelta.classList.toggle('bad', delta < 0);
      if (debt === 0) {
        rDebt.innerHTML = 'Already';
      } else if (debtFreeMonth >= 0 && debtFreeMonth <= 12) {
        rDebt.innerHTML = debtFreeMonth + '<span style="font-family:var(--font-body);font-size:18px;color:var(--ink-3);font-weight:400;"> months</span>';
      } else {
        rDebt.innerHTML = '12+<span style="font-family:var(--font-body);font-size:18px;color:var(--ink-3);font-weight:400;"> months</span>';
      }
      [sIn, sRate, sDeb, sNw].forEach(updatePct);
    }
    [sIn, sRate, sDeb, sNw].forEach(s => s.addEventListener('input', recompute));
    recompute();
  }

  // ── 4. AMBIENT BACKGROUND ANIMATIONS ──
  // Section dividers draw in once on first viewport entry (one-shot).
  // Bento ambient pulse only runs while #features is on screen.
  function initAmbient() {
    if (!('IntersectionObserver' in window)) {
      // Fallback: just show dividers in their final state.
      document.querySelectorAll('[data-divider]').forEach(d => d.classList.add('in-view'));
      return;
    }
    const dividerIO = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('in-view');
          dividerIO.unobserve(e.target); // one-shot
        }
      });
    }, { threshold: 0.3, rootMargin: '0px 0px -10% 0px' });
    document.querySelectorAll('[data-divider]').forEach(d => dividerIO.observe(d));

    // Hero anchor figure: when the figure scrolls into view, draw the
    // sparkline and the gold endpoint. Mirrors the divider IO logic —
    // once-only, ignored under prefers-reduced-motion via CSS overrides.
    const anchor = document.getElementById('hero-anchor');
    if (anchor) {
      const anchorIO = new IntersectionObserver((entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add('in-view');
            anchorIO.unobserve(e.target);
          }
        });
      }, { threshold: 0.4, rootMargin: '0px 0px -10% 0px' });
      anchorIO.observe(anchor);
    }

    const features = document.getElementById('features');
    if (features) {
      const featuresIO = new IntersectionObserver((entries) => {
        entries.forEach(e => {
          document.body.classList.toggle('features-in-view', e.isIntersecting);
        });
      }, { threshold: 0.05 });
      featuresIO.observe(features);
    }
  }

  function ready() {
    initMotion();
    initBentoCursor();
    initForecast();
    initAmbient();
    refreshFoundersCount();
  }
  // 3-state founders counter — mirrors billing.html so visitors see urgency
  // when seats run low instead of a flat "X of 500 left" regardless.
  // Throttled to one refresh per 5 minutes (matches billing) so revisits
  // don't hammer the API.
  let _foundersLastFetch = 0;
  async function refreshFoundersCount(force) {
    const el = document.getElementById('home-founders-counter');
    if (!el) return;
    const now = Date.now();
    if (!force && (now - _foundersLastFetch) < 5 * 60 * 1000) return;
    _foundersLastFetch = now;
    try {
      const r = await fetch('/api/founders-claimed', { cache: 'no-store' });
      if (!r.ok) return;
      const data = await r.json();
      if (data.claimed == null) return;
      const remaining = data.remaining, cap = data.cap;
      let copy;
      if (remaining === 0)            copy = 'All ' + cap + ' founder seats claimed. Thank you.';
      else if (remaining <= 25)       copy = 'Only ' + remaining + ' seats remaining — closes when sold out';
      else if (remaining <= 100)      copy = remaining + ' of ' + cap + ' seats remaining';
      else                            copy = data.claimed + ' of ' + cap + ' claimed';
      el.textContent = copy;
    } catch (_) { /* keep placeholder */ }
  }
  // Refresh when the tab regains focus (someone may have claimed a seat
  // while the visitor had this tab in the background).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshFoundersCount(true);
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(ready, 50));
  else setTimeout(ready, 50);
})();
