/**
 * pfc-motion.js — Finance-themed motion helpers.
 *
 * Each helper takes an SVG element and animates it in a way that
 * communicates a financial concept (compounding, money flow, goal progress,
 * net-worth movement, time passing). Pages just call these instead of
 * inventing one-off animations.
 *
 * All helpers respect prefers-reduced-motion automatically.
 *
 * API:
 *   PFCMotion.compoundCurve(svg, opts)
 *   PFCMotion.gaugeNeedle(svg, fromPct, toPct, opts)
 *   PFCMotion.goalRing(svg, fromPct, toPct, opts)
 *   PFCMotion.sankey(svg, data, opts)
 *   PFCMotion.calendarFlip(el, fromMonth, toMonth)
 *   PFCMotion.countTo(el, fromN, toN, opts)
 *   PFCMotion.observe(el, fn)        ← runs fn(el) when el scrolls into view
 *
 * No external dependencies (intentionally — works without GSAP loaded).
 */
(function () {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── Easing functions ─────────────────────────────────────────────────
  const ease = {
    out:     t => 1 - Math.pow(1 - t, 3),
    inOut:   t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    spring:  t => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2),
    sigmoid: t => {
      // Compounding-like curve — slow then accelerates, then settles
      const s = 6;
      const x = (t - 0.5) * s;
      return 1 / (1 + Math.exp(-x));
    },
  };

  function tween(durMs, easing, frame) {
    if (reduce) { frame(1); return Promise.resolve(); }
    return new Promise(resolve => {
      const start = performance.now();
      function loop(now) {
        const t = Math.min(1, (now - start) / durMs);
        frame(easing(t));
        if (t < 1) requestAnimationFrame(loop);
        else resolve();
      }
      requestAnimationFrame(loop);
    });
  }

  // ── 1. Compound-growth curve drawing in ──────────────────────────────
  /**
   * Animates a path stroke as if a pen is drawing the curve from origin
   * to endpoint. The curve itself uses a sigmoid shape so it visually
   * communicates compounding (slow, then fast, then settles).
   *
   * Pass an <svg> with a <path id="pfc-curve">. We rewrite its `d` and
   * stroke-dash to do the draw-in.
   */
  function compoundCurve(svg, opts = {}) {
    const cfg = Object.assign({
      duration: 1400,
      points:   24,           // resolution
      // Curve start/end in viewBox space — caller can override
      x0: 0, y0: 180,
      x1: 600, y1: 22,
      pathSelector: '#pfc-curve',
      areaSelector: '#pfc-area',
      endDot:       '#pfc-end',
      endGlow:      '#pfc-glow',
    }, opts);

    const path = svg.querySelector(cfg.pathSelector);
    if (!path) return Promise.resolve();
    const area = svg.querySelector(cfg.areaSelector);
    const dot  = svg.querySelector(cfg.endDot);
    const glow = svg.querySelector(cfg.endGlow);

    // Build sigmoid curve points
    const pts = [];
    for (let i = 0; i <= cfg.points; i++) {
      const t = i / cfg.points;
      const e = ease.sigmoid(t);
      pts.push([
        cfg.x0 + (cfg.x1 - cfg.x0) * t,
        cfg.y0 + (cfg.y1 - cfg.y0) * e,
      ]);
    }
    const d = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    path.setAttribute('d', d);
    if (area) {
      area.setAttribute('d',
        d + ` L${cfg.x1},${cfg.y0 + 20} L${cfg.x0},${cfg.y0 + 20} Z`
      );
    }

    // Draw-in via stroke-dash
    const len = path.getTotalLength();
    path.style.strokeDasharray  = len;
    path.style.strokeDashoffset = len;
    if (area) area.style.opacity = '0';
    if (dot)  dot.style.opacity  = '0';
    if (glow) glow.style.opacity = '0';

    return tween(cfg.duration, ease.out, k => {
      path.style.strokeDashoffset = String(len * (1 - k));
      if (area) area.style.opacity = String(k);
    }).then(() => {
      // Pulse the endpoint
      if (dot)  dot.style.opacity  = '1';
      if (glow) glow.style.opacity = '0.4';
      if (dot && !reduce) {
        dot.animate(
          [{ r: 5 }, { r: 7 }, { r: 5 }],
          { duration: 1400, iterations: Infinity, easing: 'ease-in-out' }
        );
      }
    });
  }

  // ── 2. Gauge needle climbing ─────────────────────────────────────────
  /**
   * Animates a needle (an SVG <line> or <g>) from one angle to another.
   * Angles are in percentage of the gauge arc (0 = far left, 100 = far right).
   * Caller is responsible for the gauge background/track.
   */
  function gaugeNeedle(svg, fromPct, toPct, opts = {}) {
    const cfg = Object.assign({
      duration: 1200,
      needleSelector: '#pfc-needle',
      // Angle range — default is -120deg to +120deg (240deg arc)
      minAngle: -120,
      maxAngle: 120,
      // Optional pivot point — when set, emits SVG `rotate(angle cx cy)`
      // so the needle rotates around (cx,cy) in viewBox space instead of (0,0).
      cx: null,
      cy: null,
    }, opts);

    const needle = svg.querySelector(cfg.needleSelector);
    if (!needle) return Promise.resolve();

    const a = (pct) => cfg.minAngle + (cfg.maxAngle - cfg.minAngle) * (pct / 100);
    const hasPivot = cfg.cx != null && cfg.cy != null;

    return tween(cfg.duration, ease.out, k => {
      const angle = a(fromPct + (toPct - fromPct) * k);
      const t = hasPivot
        ? `rotate(${angle.toFixed(2)} ${cfg.cx} ${cfg.cy})`
        : `rotate(${angle.toFixed(2)})`;
      needle.setAttribute('transform', t);
    });
  }

  // ── 3. Goal ring filling ─────────────────────────────────────────────
  /**
   * Animates a circular SVG ring from 0% to a target %.
   * The element should be a <circle> with stroke-dasharray = circumference.
   */
  function goalRing(circleEl, toPct, opts = {}) {
    const cfg = Object.assign({ duration: 1100, fromPct: 0, autoColor: true }, opts);
    if (!circleEl) return Promise.resolve();
    const r = parseFloat(circleEl.getAttribute('r')) || 0;
    const circ = 2 * Math.PI * r;
    circleEl.style.strokeDasharray = circ;

    // Choose color band based on target (champagne → emerald). Pass autoColor:false
    // to preserve a caller-provided per-goal color.
    if (cfg.autoColor) {
      if (toPct >= 100)      circleEl.setAttribute('stroke', getCss('--money'));
      else if (toPct >= 50)  circleEl.setAttribute('stroke', getCss('--gold'));
      else                   circleEl.setAttribute('stroke', getCss('--sage'));
    }

    return tween(cfg.duration, ease.out, k => {
      const pct = cfg.fromPct + (toPct - cfg.fromPct) * k;
      circleEl.style.strokeDashoffset = String(circ * (1 - pct / 100));
    });
  }

  // ── 4. Money-flow Sankey (simplified ribbon) ─────────────────────────
  /**
   * Renders animated ribbons from a single source on the left to N targets
   * on the right. Each ribbon's vertical extent is proportional to its share.
   *
   * data = [
   *   { label: 'Savings',     amount: 1500, color: 'var(--money)' },
   *   { label: 'Debt repay',  amount:  600, color: 'var(--gold)'  },
   *   { label: 'Discretionary', amount: 1200, color: 'var(--sage)'  },
   *   …
   * ]
   */
  function sankey(svg, data, opts = {}) {
    const cfg = Object.assign({
      width: 600, height: 240,
      sourceX: 60, targetX: 540,
      duration: 900,
    }, opts);

    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute('viewBox', `0 0 ${cfg.width} ${cfg.height}`);

    const total = data.reduce((s, d) => s + d.amount, 0);
    if (total <= 0) return Promise.resolve();

    const sourceH = cfg.height - 60;
    let yL = 30;
    let totalRendered = 0;

    const ribbons = data.map((d) => {
      const pct = d.amount / total;
      const h   = Math.max(8, sourceH * pct);
      const yR  = 30 + totalRendered;
      totalRendered += h;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const x1 = cfg.sourceX, x2 = cfg.targetX;
      const cx = (x1 + x2) / 2;
      // Source vertical span: same as full sourceH; target span: h
      const ySrcTop = 30 + sankey._srcOffset(data, d, sourceH);
      const ySrcBot = ySrcTop + h;
      const yTgtTop = yR;
      const yTgtBot = yR + h;
      const dStr =
        `M${x1},${ySrcTop} ` +
        `C${cx},${ySrcTop} ${cx},${yTgtTop} ${x2},${yTgtTop} ` +
        `L${x2},${yTgtBot} ` +
        `C${cx},${yTgtBot} ${cx},${ySrcBot} ${x1},${ySrcBot} Z`;
      path.setAttribute('d', dStr);
      path.setAttribute('fill', d.color || getCss('--money'));
      path.setAttribute('opacity', '0');
      svg.appendChild(path);

      // Target labels
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', x2 + 8);
      text.setAttribute('y', (yTgtTop + yTgtBot) / 2);
      text.setAttribute('dominant-baseline', 'central');
      text.setAttribute('fill', getCss('--ink-2'));
      text.setAttribute('font-family', 'Inter, sans-serif');
      text.setAttribute('font-size', '12');
      text.setAttribute('opacity', '0');
      text.textContent = `${d.label} · ${pct >= 0.005 ? Math.round(pct * 100) : 0}%`;
      svg.appendChild(text);
      return { path, text };
    });

    // Source pillar
    const pillar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    pillar.setAttribute('x', cfg.sourceX - 4);
    pillar.setAttribute('y', 30);
    pillar.setAttribute('width', '4');
    pillar.setAttribute('height', String(sourceH));
    pillar.setAttribute('fill', getCss('--gold'));
    pillar.setAttribute('opacity', '0.7');
    svg.appendChild(pillar);

    // Stagger fade-in
    return new Promise(resolve => {
      let done = 0;
      ribbons.forEach((r, i) => {
        setTimeout(() => {
          tween(cfg.duration, ease.out, k => {
            r.path.setAttribute('opacity', String(0.55 * k));
            r.text.setAttribute('opacity', String(k));
          }).then(() => { if (++done === ribbons.length) resolve(); });
        }, i * 90);
      });
    });
  }
  // Helper: the cumulative offset along the source pillar before this datum
  sankey._srcOffset = function (data, d, sourceH) {
    const total = data.reduce((s, x) => s + x.amount, 0);
    let off = 0;
    for (const x of data) {
      if (x === d) return off;
      off += sourceH * (x.amount / total);
    }
    return off;
  };

  // ── 5. Calendar page flip ────────────────────────────────────────────
  /**
   * Flips the visible month label like a Rolodex card. `el` is any block
   * element (e.g. <div class="month-card">). `toLabel` replaces the text.
   */
  function calendarFlip(el, toLabel) {
    if (!el) return Promise.resolve();
    if (reduce) { el.textContent = toLabel; return Promise.resolve(); }
    el.style.transition = 'transform 280ms var(--ease-in-out, ease)';
    el.style.transformOrigin = '50% 100%';
    el.style.transform = 'perspective(400px) rotateX(-90deg)';
    el.style.opacity = '0.2';
    return new Promise(resolve => {
      setTimeout(() => {
        el.textContent = toLabel;
        el.style.transform = 'perspective(400px) rotateX(0deg)';
        el.style.opacity = '1';
        setTimeout(resolve, 280);
      }, 280);
    });
  }

  // ── 6. Animated number counter ───────────────────────────────────────
  /**
   * Counts an element's text from `from` to `to`. Honors a formatter so
   * dollar amounts come out as $12,400 etc. Use formatter: 'money' for
   * the standard money format, or pass a function.
   */
  function countTo(el, fromN, toN, opts = {}) {
    const cfg = Object.assign({ duration: 900, formatter: 'money' }, opts);
    if (!el) return Promise.resolve();
    const fmt = typeof cfg.formatter === 'function'
      ? cfg.formatter
      : (n) => {
          if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
          if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'k';
          return '$' + Math.round(n).toLocaleString();
        };
    return tween(cfg.duration, ease.out, k => {
      el.textContent = fmt(fromN + (toN - fromN) * k);
    });
  }

  // ── 7. Scroll-trigger observer ───────────────────────────────────────
  function observe(el, fn, opts = {}) {
    if (!('IntersectionObserver' in window)) { fn(el); return; }
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          fn(e.target);
          io.unobserve(e.target);
        }
      });
    }, { threshold: opts.threshold ?? 0.25 });
    io.observe(el);
  }

  // ── Helpers ──────────────────────────────────────────────────────────
  function getCss(varName) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }

  // ── Public API ───────────────────────────────────────────────────────
  window.PFCMotion = {
    compoundCurve,
    gaugeNeedle,
    goalRing,
    sankey,
    calendarFlip,
    countTo,
    observe,
    ease,
    tween,
  };
})();
