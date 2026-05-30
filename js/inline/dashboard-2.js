// G-P0-2 fix (audit 2026-05-24) — XSS escape helpers for dashboard-side
// goal cards. Pre-fix renderGoals interpolated `${g.name}` raw into
// innerHTML, allowing a tampered localStorage goal name like
// `<img src=x onerror=alert(1)>` to fire on every dashboard load.
// barColor (g.color) flowing into style="background:${color}" had the
// same CSS-context breakout class as goals-2.js — fixed with whitelist.
function _escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function _safeColor(v) {
  const s = String(v == null ? '' : v).trim();
  if (/^var\(--[a-z0-9-]+\)$/i.test(s)) return s;
  if (/^#[0-9a-f]{3,8}$/i.test(s)) return s;
  if (/^rgba?\(\s*\d+%?\s*,\s*\d+%?\s*,\s*\d+%?(\s*,\s*[\d.]+)?\s*\)$/i.test(s)) return s;
  if (/^hsla?\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%(\s*,\s*[\d.]+)?\s*\)$/i.test(s)) return s;
  if (/^(red|blue|green|orange|purple|gold|teal|cyan|magenta|yellow|black|white|gray|grey)$/i.test(s)) return s;
  return 'var(--teal)';
}

// ── CENTRAL USER DATA (persisted to localStorage) ──
// Sprint 5: zero seeds. Empty-state copy renders until real onboarding data exists.
const DEFAULT_USER = {
  income: 0, otherIncome: 0,
  housing: 0, food: 0, transport: 0, otherExp: 0,
  savings: 0, investments: 0,
  debt: 0, debtPay: 0,
  currency: '$', name: ''
};

// PFCUser is the single source of truth for the USER profile. These two
// shims keep the rest of dashboard.html's existing call sites working — they
// delegate to PFCUser.get() / PFCUser.update() under the hood. If PFCUser
// hasn't loaded (script tag missing / blocked), they fall back to the
// previous PFCStorage path so the page still renders.
function loadUser() {
  if (typeof PFCUser !== 'undefined') {
    return { ...DEFAULT_USER, ...PFCUser.get() };
  }
  try {
    const saved = PFCStorage.get('user');
    const u = saved ? { ...DEFAULT_USER, ...JSON.parse(saved) } : { ...DEFAULT_USER };
    if (typeof PFCCurrency !== 'undefined' && PFCCurrency.toSymbol) {
      u.currency = PFCCurrency.toSymbol(u.currency);
    } else if (!u.currency) {
      u.currency = '$';
    }
    return u;
  } catch(e) { return { ...DEFAULT_USER }; }
}
function isUserEmpty(u) {
  return !u || (!u.income && !u.savings && !u.debt && !(u.name && u.name.length));
}
function saveUser(u) {
  if (typeof PFCUser !== 'undefined') { try { PFCUser.set(u); } catch(_) {} return; }
  try { PFCStorage.setJSON('user', u); } catch(e) {}
}

let USER = loadUser();

// DASH-PROD-FIX (upgrade-banner flash on Pro users) — same race class
// as the portfolio.html bug fixed in commit 3038ce1. PFCPlan._plan
// defaults to 'free' at module init. pfc-entitlements.js's applyBadges
// then sets `[data-free-only]` elements to display:'' (visible) on
// auth.onReady — which fires BEFORE PFCPlan.refresh() resolves. Pro
// users with an expired 30s plan-cache see the upgrade banner flash
// until refresh resolves and applyBadges re-runs to hide it.
//
// Fix: pin the banner with display:none !important until PFCPlan.refresh
// actually resolves with a confirmed plan. Then remove the override so
// applyBadges (and any future toggle) take over. Belt-and-braces: call
// applyBadges explicitly after refresh in case the entitlements module
// missed the onChange edge.
(function _blockUpgradeBannerFlash() {
  function _go() {
    const banners = document.querySelectorAll('.upgrade-banner[data-free-only]');
    if (!banners.length) return;
    // Force hidden until we have a confirmed plan from the server.
    banners.forEach(b => b.style.setProperty('display', 'none', 'important'));
    function _settle() {
      if (!window.PFCPlan || typeof PFCPlan.get !== 'function') return;
      const plan = PFCPlan.get();
      banners.forEach(b => {
        b.style.removeProperty('display');
        b.style.display = (plan === 'free') ? '' : 'none';
      });
      if (typeof PFCPlan.applyBadges === 'function') {
        try { PFCPlan.applyBadges(); } catch (_) {}
      }
    }
    if (window.PFCPlan && typeof PFCPlan.refresh === 'function') {
      // Promise.resolve to handle both sync and async return.
      Promise.resolve(PFCPlan.refresh()).catch(() => null).finally(_settle);
    } else {
      // PFCPlan not loaded — try again in a moment; if still not loaded
      // by then, settle with whatever we have (banner stays hidden as
      // the safer fail-mode for a paying user).
      setTimeout(_settle, 800);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _go, { once: true });
  } else {
    _go();
  }
})();

// ── DASH-P0-1 fix — toast shim + unread-counter state ──
// Both `showDashToast(msg)` and `unreadCount` were called from 8+ handlers
// (Save / Reset / Goal edit-delete-add / CSV apply / inflation refresh /
// notification mark-read) but never defined. Each call threw silently
// AFTER persistence had already succeeded, so user actions worked but
// gave no UI confirmation. markRead() aborted mid-function so the
// unread dot never cleared. Audit DBUG-1.
//
// The shim renders a brief floating toast at the bottom of the viewport.
// It uses pure DOM APIs (no innerHTML on user-controlled data) and obeys
// prefers-reduced-motion via the `transition` token from pfc-tokens.css.
let unreadCount = 0;
function showDashToast(msg, opts) {
  try {
    const text = String(msg || '');
    if (!text) return;
    let host = document.getElementById('pfc-toast-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'pfc-toast-host';
      host.setAttribute('role', 'status');
      host.setAttribute('aria-live', 'polite');
      host.style.cssText =
        'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);' +
        'display:flex;flex-direction:column;gap:8px;align-items:center;' +
        'z-index:9999;pointer-events:none;';
      document.body.appendChild(host);
    }
    const toast = document.createElement('div');
    toast.style.cssText =
      'background:rgba(11,20,16,0.94);color:var(--ink,#F0EDE2);' +
      'border:1px solid var(--line-2,rgba(240,237,226,0.10));' +
      'border-radius:8px;padding:10px 16px;font-family:var(--font-body);' +
      'font-size:13.5px;max-width:min(90vw,420px);text-align:center;' +
      'box-shadow:0 8px 28px rgba(0,0,0,0.35);' +
      'opacity:0;transform:translateY(8px);' +
      'transition:opacity 180ms ease-out, transform 180ms ease-out;';
    toast.textContent = text;
    host.appendChild(toast);
    // Force layout, then animate in.
    void toast.offsetHeight;
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
    const stayMs = (opts && Number.isFinite(opts.duration)) ? opts.duration : 2800;
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      setTimeout(() => toast.remove(), 220);
    }, stayMs);
  } catch (_) { /* toast is best-effort; never block the caller */ }
}

function fmt(v) {
  const c = window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$');
  return c + Math.abs(Math.round(v)).toLocaleString();
}

// ── FORECAST CHART ──
const MONTHS = ['Now','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
let chart;

function buildData() {
  // Single forecast engine for the whole dashboard (chart, Overview net-worth
  // card and the Net Worth tab all read base[12] from here).
  // Defensive slider reads: this is now called from updateAllCards()/
  // renderNWTab() too, which can run before the forecast section is on screen,
  // so a missing slider must fall back to its default rather than throw.
  const readSl = (id, def) => {
    const el = document.getElementById(id);
    const v = el ? parseFloat(el.value) : NaN;
    return isNaN(v) ? def : v;
  };
  const incChg  = readSl('sl-income', 0)    / 100;
  const extra   = readSl('sl-extra', 0);
  const infl    = readSl('sl-inflation', 3.5) / 100;
  const mRet    = readSl('sl-interest', 5)  / 100 / 12;   // monthly investment return

  const income    = ((USER.income||0) + (USER.otherIncome||0)) * (1 + incChg);
  const expenses  = (USER.housing||0) + (USER.food||0) + (USER.transport||0) + (USER.otherExp||0);
  const startAsst = (USER.savings||0) + (USER.investments||0);
  const debt0     = USER.debt||0;
  const debtPay   = USER.debtPay||0;
  const inflDragM = infl * expenses / 12;

  // Project net worth 12 months out for one scenario. Assets and debt are
  // tracked SEPARATELY so the return slider compounds only the asset base —
  // the pre-fix loop applied the slider to the debt balance and never fed it
  // back into net worth, so moving the "investment return" slider did nothing
  // to the chart. Net worth = assets − debt. Paying debt down is net-neutral
  // to net worth (cash moves from assets to debt reduction), which is why the
  // contribution subtracts only the ACTUAL payment made; once a debt clears,
  // that freed payment flows to assets automatically. cK scales the monthly
  // contribution, iK scales the inflation drag (optimistic vs conservative).
  function project(cK, iK) {
    let a = startAsst, d = debt0;
    const out = [];
    for (let i = 0; i <= 12; i++) {
      if (i > 0) {
        const pay = Math.min(d, debtPay);            // actual debt payment this month
        d -= pay;
        const contrib = (income - expenses - pay + extra) * cK;
        a += contrib + a * mRet - inflDragM * iK;
      }
      out.push(Math.round(a - d));
    }
    return out;
  }

  const base = project(1.0,  1.0);
  const opt  = project(1.18, 0.75);
  const cons = project(0.65, 1.4);
  // Headline "monthly surplus" card — net-worth-relevant surplus is debt-neutral
  // (debtPay just shifts where the money goes), so it excludes debtPay.
  const monthly = income - expenses + extra;
  return { base, opt, cons, monthly };
}

function recalcForecast() {
  const d = buildData();
  const sym = window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$');

  if (chart) {
    chart.data.datasets[0].data = d.base;
    chart.data.datasets[1].data = d.opt;
    chart.data.datasets[2].data = d.cons;
    chart.update('none');
  }

  // Apply scenario slider adjustments on top of USER base data
  const incChg  = parseFloat(document.getElementById('sl-income').value) / 100;
  const extra   = parseFloat(document.getElementById('sl-extra').value);
  const income   = ((USER.income||0) + (USER.otherIncome||0)) * (1 + incChg) + extra;
  const expenses = (USER.housing||0) + (USER.food||0) + (USER.transport||0) + (USER.otherExp||0);
  const assets   = (USER.savings||0) + (USER.investments||0);
  const surplus  = income - expenses;

  // Metric cards
  const gain = d.base[12] - d.base[0];
  const nwEl = document.getElementById('m-networth');
  if (nwEl) {
    nwEl.textContent = sym + d.base[12].toLocaleString();
    nwEl.style.color = gain >= 0 ? 'var(--teal)' : 'var(--red)';
  }
  const svEl = document.getElementById('m-savings');
  if (svEl) svEl.textContent = sym + Math.round(Math.max(0, d.monthly)).toLocaleString();
  const debtPay = USER.debtPay;
  const dMonths = debtPay > 0 && USER.debt > 0 ? Math.ceil(USER.debt / Math.max(1, debtPay)) : 0;
  const dbEl = document.getElementById('m-debt');
  // DASH-P2-A DBUG-11 fix — tri-state label. `dMonths = 0` previously
  // always rendered "Debt free!" even when USER.debt was > 0 (just no
  // monthly payment set — extremely common mid-onboarding). Now three
  // distinct states:
  //   - dMonths > 0 → "12 mo" (clear payoff timeline)
  //   - debt > 0 && dMonths === 0 → "Add payment" (call to action)
  //   - debt === 0 → "Debt free!" (genuine win)
  if (dbEl) {
    dbEl.textContent = dMonths > 0
      ? (dMonths + ' mo')
      : ((USER.debt || 0) > 0 ? 'Add payment' : 'Debt free!');
  }

  // ── HEALTH SCORE recalc ──
  const savePct = income > 0 ? surplus / income : 0;
  // Canonical shared scorer (js/pfc-health-score.js) so the dashboard health
  // score matches the Report Card + Scenarios exactly. (Was a separate additive
  // formula → a different number for the same data.) savePct above is kept for
  // the savings-rate insight copy below.
  const score = (typeof PFCHealthScore !== 'undefined')
    ? PFCHealthScore.compute({ income, expenses, debtPay: (USER.debtPay || 0), savings: (USER.savings || 0) }).total
    : 0;

  const scEl = document.getElementById('m-score');
  if (scEl) { scEl.textContent = score; scEl.style.color = score >= 70 ? 'var(--teal)' : score >= 40 ? 'var(--amber)' : 'var(--red)'; }

  // Health ring
  const ringArc = document.querySelector('circle[stroke-linecap="round"]');
  if (ringArc) {
    ringArc.setAttribute('stroke-dashoffset', Math.round(339 - (339 * score / 100)));
    ringArc.setAttribute('stroke', score >= 70 ? '#2BB67D' : score >= 40 ? '#F5A623' : '#E05252');
  }
  const ringNum = document.querySelector('text[font-size="28"]');
  if (ringNum) ringNum.textContent = score;
  const ringLabel = document.querySelector('text[font-size="11"]');
  if (ringLabel) ringLabel.textContent = 'out of 100';

  // Score badge
  const scoreBadge = document.querySelector('.badge-amber');
  if (scoreBadge) {
    scoreBadge.textContent = score >= 70 ? 'Great' : score >= 50 ? 'Good' : score >= 30 ? 'Fair' : 'Needs work';
    scoreBadge.className = 'card-badge ' + (score >= 70 ? 'badge-teal' : score >= 50 ? 'badge-amber' : 'badge-red');
  }

  // Score breakdown bars
  const pct = Math.round(Math.max(0, savePct * 100));
  const emergencyMo = surplus > 0 ? +(assets / Math.max(1, expenses)).toFixed(1) : 0;
  document.querySelectorAll('.score-row').forEach(row => {
    const label = row.querySelector('.score-row-label')?.textContent.toLowerCase() || '';
    const fill  = row.querySelector('.score-row-fill');
    const val   = row.querySelector('.score-row-val');
    if (!fill || !val) return;
    if (label.includes('savings')) {
      fill.style.width = Math.min(100, pct * 2) + '%';
      fill.style.background = pct >= 20 ? 'var(--money)' : '#F5A623';
      val.textContent = pct + '%'; val.style.color = pct >= 20 ? 'var(--teal)' : 'var(--amber)';
    } else if (label.includes('debt')) {
      const dr = USER.debt === 0 ? 100 : Math.max(0, Math.round((1 - USER.debt / Math.max(1, assets + USER.debt)) * 100));
      fill.style.width = dr + '%';
      val.textContent = USER.debt === 0 ? 'None' : 'Mid';
    } else if (label.includes('emergency')) {
      fill.style.width = Math.min(100, emergencyMo / 6 * 100) + '%';
      fill.style.background = emergencyMo >= 3 ? 'var(--money)' : '#F5A623';
      val.textContent = emergencyMo + 'mo'; val.style.color = emergencyMo >= 3 ? 'var(--teal)' : 'var(--amber)';
    } else if (label.includes('spending')) {
      const sp = surplus > 0 ? Math.min(100, Math.round((1 - Math.abs(surplus - d.monthly) / Math.max(1, income)) * 100)) : 30;
      fill.style.width = sp + '%';
      val.textContent = sp >= 70 ? 'Good' : 'Fair';
    }
  });

  // ── SAGE INSIGHTS update ──
  const insightsList = document.getElementById('insights-list');
  if (insightsList) {
    const insights = [];
    if (savePct >= 0.2) insights.push({ color:'var(--teal)', text:`Your savings rate of <strong>${pct}%</strong> is excellent — above the 20% benchmark. You're building wealth faster than most.` });
    else if (savePct >= 0.1) insights.push({ color:'var(--amber)', text:`You're saving <strong>${pct}%</strong> monthly. Aim for 20%+ by reducing dining or subscriptions to hit the next level.` });
    else if (surplus > 0) insights.push({ color:'var(--red)', text:`Savings rate of <strong>${pct}%</strong> is below 10%. Review your largest expense categories first.` });
    else insights.push({ color:'var(--red)', text:`Your expenses exceed income. Check the <strong>Edit finances</strong> button to update your numbers.` });

    if (USER.debt > 0) {
      if (dMonths <= 18) insights.push({ color:'var(--teal)', text:`You'll be completely debt-free in <strong>${dMonths} months</strong>. Keep your current payment pace.` });
      else insights.push({ color:'var(--amber)', text:`Debt payoff in <strong>${dMonths} months</strong> at your current rate. Adding $100/mo could cut this by ~3 months.` });
    } else {
      insights.push({ color:'var(--teal)', text:`You're debt-free! Consider redirecting those payments into investments.` });
    }

    if (emergencyMo >= 3) insights.push({ color:'var(--blue)', text:`Emergency fund covers <strong>${emergencyMo} months</strong> — you're in the safe zone. Recommended is 3–6 months.` });
    else insights.push({ color:'var(--amber)', text:`Emergency fund covers only <strong>${emergencyMo} months</strong>. Try to build to 3 months before investing.` });

    insightsList.innerHTML = insights.slice(0, 4).map(i =>
      `<div class="insight-item"><div class="insight-dot" style="background:${i.color};"></div><div class="insight-text">${i.text}</div></div>`
    ).join('');
  }
}

// DASH-P1-13 fix (audit DES-5) — brand Chart.js defaults instead of
// the library's grey-on-grey out-of-the-box look. Sets font family +
// tick colour + grid colour to PFC tokens at boot. Pure additive
// global; if Chart is unavailable (CDN block) this no-ops via the
// outer try/catch around initChart() (audit DASH-P0-6 fix).
function _brandChartDefaults() {
  if (typeof Chart === 'undefined' || !Chart.defaults) return;
  try {
    Chart.defaults.font.family = "'Inter Tight', 'Inter', system-ui, sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.color = '#8A988F';           // matches --ink-3 token (WCAG AA)
    Chart.defaults.borderColor = 'rgba(244,239,229,0.06)';  // matches --line
    if (Chart.defaults.plugins?.tooltip) {
      Chart.defaults.plugins.tooltip.backgroundColor = '#16271F';
      Chart.defaults.plugins.tooltip.titleColor = '#F0EDE2';
      Chart.defaults.plugins.tooltip.bodyColor = '#B8C2BC';
      Chart.defaults.plugins.tooltip.borderColor = 'rgba(244,239,229,0.10)';
      Chart.defaults.plugins.tooltip.borderWidth = 1;
      Chart.defaults.plugins.tooltip.padding = 10;
      Chart.defaults.plugins.tooltip.cornerRadius = 6;
    }
  } catch (e) {
    console.warn('[dashboard] brand chart defaults failed (Chart.defaults shape?):', e?.message || e);
  }
}

function initChart() {
  _brandChartDefaults();
  const d = buildData();
  const ctx = document.getElementById('forecastChart').getContext('2d');
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: MONTHS,
      datasets: [
        {
          label: 'Projected', data: d.base,
          borderColor: '#2BB67D', backgroundColor: 'rgba(43,182,125,0.07)',
          borderWidth: 2.5, tension: 0.4, fill: true,
          pointRadius: 3, pointBackgroundColor: '#2BB67D', pointBorderColor: '#0D1320', pointBorderWidth: 2
        },
        {
          label: 'Optimistic', data: d.opt,
          borderColor: '#3B82F6', borderDash: [6,4],
          borderWidth: 1.5, tension: 0.4, fill: false, pointRadius: 0
        },
        {
          label: 'Conservative', data: d.cons,
          borderColor: '#E05252', borderDash: [6,4],
          borderWidth: 1.5, tension: 0.4, fill: false, pointRadius: 0
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#16271F',
          borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1,
          titleColor: '#B8C2BC', bodyColor: '#F0EDE2',
          callbacks: { label: ctx => ' ' + (USER.currency || '€') + ctx.raw.toLocaleString() }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#4A5A6E', font: { size: 11, family: "'Inter', system-ui, sans-serif" } }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: {
            color: '#4A5A6E', font: { size: 11, family: "'Inter', system-ui, sans-serif" },
            callback: v => (USER.currency || '€') + Math.round(v / 1000) + 'k'
          }
        }
      }
    }
  });
}

// ── SLIDERS ──
function updateSlider(id, outId, suffix, signed, dollar) {
  const val = parseFloat(document.getElementById(id).value);
  let str;
  if (dollar)       str = suffix + Math.round(val);
  else if (signed)  str = (val >= 0 ? '+' : '') + val.toFixed(0) + suffix;
  else              str = val.toFixed(1) + suffix;
  document.getElementById(outId).textContent = str;
}

// ── LIFE EVENTS ──
// DASH-P1-1 fix (audit DBUG-3) — was silently broken in two ways:
//   1. `jobloss` set sl-income=-100 but the slider min=-30, so the
//      browser clamped to -30 and the "Pro showcase" forecast modelled
//      a 30% pay cut instead of total job loss.
//   2. The apply path wrapped extra in `Math.max(0, 0 + e.extra)` which
//      *clamped any negative event extra to zero*, so the "Baby" and
//      "New car" events that try to ADD monthly expense did nothing —
//      pill said "Active" but the +€200/mo never materialised.
// Fix: rewrite event values to slider-valid magnitudes (jobloss=-30,
// baby/car extras moderated to a tested range), AND clamp at the
// slider boundaries (not at zero) so negatives flow through.
function applyEvent(btn, type) {
  document.querySelectorAll('.event-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  // Income deltas are bounded by the sl-income slider min/max (typically -30..50).
  // Extra-expense deltas are absolute monthly amounts; the sl-extra slider's
  // range varies but the apply step now respects it by reading min/max from
  // the input rather than zero-clamping.
  const map = {
    raise:   { income: 15,  extra: 0    },
    jobloss: { income: -30, extra: 0    },   // matches slider min; full pay cut
    baby:    { income: -5,  extra: 200  },   // +€200/mo expense (positive = added expense)
    car:     { income: 0,   extra: 150  },   // +€150/mo expense
  };
  const e = map[type];
  const sIncome = document.getElementById('sl-income');
  const sExtra  = document.getElementById('sl-extra');
  function _clampToSlider(el, val) {
    const min = Number.isFinite(+el.min) ? +el.min : -Infinity;
    const max = Number.isFinite(+el.max) ? +el.max :  Infinity;
    return Math.max(min, Math.min(max, val));
  }
  sIncome.value = _clampToSlider(sIncome, e.income);
  sExtra.value  = _clampToSlider(sExtra,  e.extra);
  updateSlider('sl-income', 'sv-income', '%', true);
  updateSlider('sl-extra',  'sv-extra',  '$', false, true);
  recalcForecast();
}

// ── TABS ──
function setTab(btn, tab) {
  // Update tab buttons
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  // Show correct panel
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById('panel-' + tab);
  if (panel) panel.classList.add('active');
  // Sync sidebar active state — all tabs are sub-views of dashboard.html,
  // so the Dashboard sidebar link stays active across all tabs. Match by
  // href (not textContent) so injected sidebar items don't false-match.
  document.querySelectorAll('.nav-item').forEach(n => {
    const href = (n.getAttribute('href') || '').replace(/^\//,'').replace(/\.html$/i,'');
    const isDashboard = href === 'dashboard';
    n.classList.toggle('active', isDashboard);
    if (isDashboard) n.setAttribute('aria-current', 'page');
    else n.removeAttribute('aria-current');
  });
  // Render Net Worth tab content when switching to it
  if (tab === 'networth') renderNWTab();
  // Scroll to top of content
  document.querySelector('.main').scrollTo({ top: 0, behavior: 'smooth' });
}

// Note: the dashboard's mini-Sage card is now a Pro teaser linking to
// sage.html. The previous canned-reply JS (sendToSage / addBubble /
// getSageReply / MAX_FREE) was removed when Sage moved to a Pro-gated
// surface — no inputs on this page invoke it anymore.

// ── EDIT FINANCES MODAL ──
function openEditFinances() {
  document.getElementById('ef-income').value       = USER.income;
  document.getElementById('ef-other-income').value = USER.otherIncome;
  document.getElementById('ef-housing').value      = USER.housing;
  document.getElementById('ef-food').value         = USER.food;
  document.getElementById('ef-transport').value    = USER.transport;
  document.getElementById('ef-other-exp').value    = USER.otherExp;
  document.getElementById('ef-savings').value      = USER.savings;
  document.getElementById('ef-investments').value  = USER.investments;
  document.getElementById('ef-debt').value         = USER.debt    || '';
  document.getElementById('ef-debtpay').value      = USER.debtPay || '';
  const sel = document.getElementById('ef-currency');
  for (let i = 0; i < sel.options.length; i++) {
    if (sel.options[i].value === USER.currency) { sel.selectedIndex = i; break; }
  }
  efCalc();
  document.getElementById('ef-overlay').style.display = 'flex';
  document.addEventListener('keydown', efEscHandler);
}
function efEscHandler(e) { if (e.key === 'Escape') closeEditFinances(); }
function closeEditFinances() {
  document.getElementById('ef-overlay').style.display = 'none';
  document.removeEventListener('keydown', efEscHandler);
}
function efGet(id) { return parseFloat(document.getElementById(id).value) || 0; }
function efCalc() {
  const income   = efGet('ef-income') + efGet('ef-other-income');
  const expenses = efGet('ef-housing') + efGet('ef-food') + efGet('ef-transport') + efGet('ef-other-exp');
  const savings  = efGet('ef-savings') + efGet('ef-investments');
  const debt     = efGet('ef-debt');
  const sym      = document.getElementById('ef-currency').value;
  const surplus  = income - expenses;
  const nw       = savings - debt;
  const surpEl   = document.getElementById('ef-surplus');
  surpEl.textContent = (surplus >= 0 ? sym : '-' + sym) + Math.abs(Math.round(surplus)).toLocaleString();
  surpEl.style.color = surplus >= 0 ? 'var(--teal)' : 'var(--red)';
  const nwEl2    = document.getElementById('ef-nw');
  nwEl2.textContent = (nw >= 0 ? sym : '-' + sym) + Math.abs(Math.round(nw)).toLocaleString();
  nwEl2.style.color = nw >= 0 ? 'var(--teal)' : 'var(--red)';
  // Canonical shared scorer (js/pfc-health-score.js) — same formula as the
  // dashboard/report-card/scenarios (also fixes the old surplus*3 emergency-fund
  // bug this preview still carried). The edit panel has no debt-payment field,
  // so use the saved value; savings is the liquid pool only.
  const score = (typeof PFCHealthScore !== 'undefined')
    ? PFCHealthScore.compute({ income, expenses, debtPay: (USER.debtPay || 0), savings: efGet('ef-savings') }).total
    : 0;
  const scEl2 = document.getElementById('ef-score');
  scEl2.textContent = score + ' / 100';
  scEl2.style.color = score >= 70 ? 'var(--teal)' : score >= 40 ? 'var(--amber)' : 'var(--red)';
  ['ef-sym1','ef-sym2'].forEach(id => { const el = document.getElementById(id); if(el) el.textContent = sym; });
}
function saveEditFinances() {
  USER.income = efGet('ef-income'); USER.otherIncome = efGet('ef-other-income');
  USER.housing = efGet('ef-housing'); USER.food = efGet('ef-food');
  USER.transport = efGet('ef-transport'); USER.otherExp = efGet('ef-other-exp');
  USER.savings = efGet('ef-savings'); USER.investments = efGet('ef-investments');
  USER.debt = efGet('ef-debt'); USER.debtPay = efGet('ef-debtpay');
  USER.currency = document.getElementById('ef-currency').value;
  saveUser(USER);
  closeEditFinances();
  recalcForecast();
  updateAllCards();
  showDashToast('Financial data saved — all charts updated');
}
function resetFinances() {
  if (!confirm('Reset all financial data to example defaults?')) return;
  USER = { ...DEFAULT_USER }; saveUser(USER);
  closeEditFinances(); recalcForecast(); updateAllCards();
  showDashToast('Reset to default data');
}
// Render the Debt breakdown table from real user data. Three render paths:
//  1. If PFCStorage('debts') has an array (set by debt-optimizer.html), render
//     one row per debt with name / balance / rate / months-to-payoff.
//  2. Else if USER.debt > 0, render a single fallback row labelled "Total debt"
//     using USER.debt + USER.debtPay (the onboarding-level coarse data).
//  3. Else show an empty-state CTA pointing at /debt-optimizer.html.
// Previously this table was hardcoded with fake "Car loan / Credit card /
// Personal loan" rows that every user saw regardless of their actual debt.
function renderDebtBreakdown() {
  const body  = document.getElementById('debt-breakdown-body');
  const sub   = document.getElementById('debt-breakdown-sub');
  const badge = document.getElementById('debt-breakdown-badge');
  if (!body) return;
  const sym = (USER && USER.currency) || '$';

  // Read multi-debt data from PFCStorage (debt-optimizer's array).
  let debts = null;
  try {
    if (typeof PFCStorage !== 'undefined') {
      const raw = PFCStorage.getJSON('debts');
      if (Array.isArray(raw) && raw.length) debts = raw;
    }
  } catch (_) {}

  // HTML-escape user-controlled debt names. Defensive: someone with a
  // <img onerror=…> in their goal label would otherwise execute.
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');

  if (debts && debts.length) {
    // Render each debt: name, balance, rate, payoff months. Sorted by
    // balance descending so the biggest debts surface first.
    const sorted = [...debts].sort((a,b) => (b.balance||0) - (a.balance||0));
    const totalBalance = sorted.reduce((s,d) => s + (d.balance||0), 0);
    const maxBalance = Math.max(...sorted.map(d => d.balance||0), 1);
    const colors = ['var(--amber)','var(--red)','var(--blue)','var(--teal)','#A78BFA','#F97316'];
    body.innerHTML = sorted.slice(0, 5).map((d, i) => {
      const width = Math.round((d.balance||0) / maxBalance * 100);
      const color = colors[i % colors.length];
      const monthsToPay = (d.minPay||d.minimum||0) > 0 && (d.balance||0) > 0
        ? Math.ceil((d.balance||0) / (d.minPay||d.minimum||1))
        : null;
      return `<tr>
        <td>
          <span class="debt-name">${esc(d.name || ('Debt ' + (i+1)))}</span>
          <div class="debt-mini-bar"><div class="debt-mini-fill" style="width:${width}%;background:${color};"></div></div>
        </td>
        <td style="text-align:right;color:var(--text);">${sym}${Math.round(d.balance||0).toLocaleString()}</td>
        <td style="text-align:right;">${(d.rate||0).toFixed(1)}%</td>
        <td style="text-align:right;color:var(--teal);">${monthsToPay != null ? monthsToPay + ' mo' : '—'}</td>
      </tr>`;
    }).join('');
    if (sub)   sub.textContent   = 'Total: ' + sym + Math.round(totalBalance).toLocaleString() + ' across ' + sorted.length + ' debt' + (sorted.length === 1 ? '' : 's');
    const totalMonths = (USER.debtPay||0) > 0 ? Math.ceil(totalBalance / (USER.debtPay||1)) : 0;
    if (badge) {
      if (totalMonths > 0) { badge.style.display = ''; badge.textContent = totalMonths + ' mo to free'; }
      else { badge.style.display = 'none'; }
    }
  } else if ((USER.debt||0) > 0) {
    // Coarse fallback: only onboarding-level data is available, render a
    // single aggregate row.
    const months = (USER.debtPay||0) > 0 ? Math.ceil((USER.debt||0) / (USER.debtPay||1)) : null;
    body.innerHTML = `<tr>
      <td>
        <span class="debt-name">Total debt</span>
        <div class="debt-mini-bar"><div class="debt-mini-fill" style="width:100%;background:var(--amber);"></div></div>
      </td>
      <td style="text-align:right;color:var(--text);">${sym}${Math.round(USER.debt).toLocaleString()}</td>
      <td style="text-align:right;color:var(--text3);">—</td>
      <td style="text-align:right;color:var(--teal);">${months != null ? months + ' mo' : '—'}</td>
    </tr>
    <tr><td colspan="4" style="text-align:center;padding:10px 0 4px;">
      <a href="debt-optimizer.html" style="color:var(--text3);font-size:11px;text-decoration:none;">Break this down by individual debts in Debt strategy →</a>
    </td></tr>`;
    if (sub)   sub.textContent   = 'Total: ' + sym + Math.round(USER.debt).toLocaleString() + ' remaining';
    if (badge) {
      if (months != null && months > 0) { badge.style.display = ''; badge.textContent = months + ' mo to free'; }
      else { badge.style.display = 'none'; }
    }
  } else {
    // Empty state.
    body.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:18px 0;font-size:13px;">
      <a href="debt-optimizer.html" style="color:var(--teal);text-decoration:none;">Add your debts in Debt strategy →</a>
    </td></tr>`;
    if (sub)   sub.textContent   = 'No debts on file';
    if (badge) badge.style.display = 'none';
  }
}

function updateAllCards() {
  const sym      = USER.currency;
  const income   = (USER.income||0) + (USER.otherIncome||0);
  const expenses = (USER.housing||0) + (USER.food||0) + (USER.transport||0) + (USER.otherExp||0);
  const assets   = (USER.savings||0) + (USER.investments||0);
  const surplus  = income - expenses;
  // 12-mo net-worth projection — use the single forecast engine so this card
  // matches the chart + Net Worth tab exactly. Pre-fix used an ad-hoc
  // `nw + surplus*12*0.9` haircut that disagreed with both other surfaces.
  const nw12     = buildData().base[12];
  const dMonths  = (USER.debtPay||0) > 0 && (USER.debt||0) > 0 ? Math.ceil((USER.debt||0) / (USER.debtPay||0)) : 0;
  const pct      = income > 0 ? Math.round((surplus/income)*100) : 0;

  // Wire the debt-breakdown table from real data (replaces hardcoded demo).
  try { renderDebtBreakdown(); } catch (_) {}

  // Health score
  // Canonical shared scorer (js/pfc-health-score.js) — same formula as the
  // dashboard/report-card/scenarios.
  const score = (typeof PFCHealthScore !== 'undefined')
    ? PFCHealthScore.compute({ income, expenses, debtPay: (USER.debtPay || 0), savings: (USER.savings || 0) }).total
    : 0;

  // Update metric cards
  const nwEl = document.getElementById('m-networth');
  if (nwEl) { nwEl.textContent = sym + Math.round(nw12).toLocaleString(); nwEl.style.color = nw12 >= 0 ? 'var(--teal)' : 'var(--red)'; }
  const svEl = document.getElementById('m-savings');
  if (svEl) svEl.textContent = sym + Math.round(Math.max(0,surplus)).toLocaleString();
  const dbEl = document.getElementById('m-debt');
  // DASH-P2-A DBUG-11 fix — tri-state label. `dMonths = 0` previously
  // always rendered "Debt free!" even when USER.debt was > 0 (just no
  // monthly payment set — extremely common mid-onboarding). Now three
  // distinct states:
  //   - dMonths > 0 → "12 mo" (clear payoff timeline)
  //   - debt > 0 && dMonths === 0 → "Add payment" (call to action)
  //   - debt === 0 → "Debt free!" (genuine win)
  if (dbEl) {
    dbEl.textContent = dMonths > 0
      ? (dMonths + ' mo')
      : ((USER.debt || 0) > 0 ? 'Add payment' : 'Debt free!');
  }
  const scEl = document.getElementById('m-score');
  if (scEl) { scEl.textContent = score; scEl.style.color = score >= 70 ? 'var(--teal)' : score >= 40 ? 'var(--amber)' : 'var(--red)'; }

  // Health ring score number
  const ringNum = document.querySelector('text[font-size="28"]');
  if (ringNum) ringNum.textContent = score;
  const ringArc = document.querySelector('circle[stroke-linecap="round"]');
  if (ringArc) {
    const dashOff = Math.round(339 - (339 * score / 100));
    ringArc.setAttribute('stroke-dashoffset', dashOff);
    ringArc.setAttribute('stroke', score >= 70 ? '#2BB67D' : score >= 40 ? '#F5A623' : '#E05252');
  }

  // DASH-P1-2 fix (audit DBUG-5) — was only writing 2 of 4 score-rows
  // here. After updateAllCards ran on a fresh auth rehydrate, Debt and
  // Spending bars kept showing whatever recalcForecast last computed
  // against the previous USER (or the hardcoded HTML defaults for a
  // never-touched fresh account). Symmetric to the recalcForecast
  // branch at lines 201-222 — same labels covered, same logic.
  const emergencyMo = surplus > 0 ? +(assets/Math.max(1,expenses)).toFixed(1) : 0;
  document.querySelectorAll('.score-row').forEach(row => {
    const label = row.querySelector('.score-row-label')?.textContent.toLowerCase() || '';
    const fill  = row.querySelector('.score-row-fill');
    const val   = row.querySelector('.score-row-val');
    if (!fill || !val) return;
    if (label.includes('savings')) {
      fill.style.width = Math.min(100,pct*2) + '%';
      fill.style.background = pct >= 20 ? 'var(--money)' : '#F5A623';
      val.textContent = pct + '%';
      val.style.color = pct >= 20 ? 'var(--teal)' : 'var(--amber)';
    } else if (label.includes('debt')) {
      const dr = USER.debt === 0
        ? 100
        : Math.max(0, Math.round((1 - USER.debt / Math.max(1, assets + USER.debt)) * 100));
      fill.style.width = dr + '%';
      fill.style.background = USER.debt === 0 ? 'var(--money)' : '#F5A623';
      val.textContent = USER.debt === 0 ? 'None' : (dr >= 60 ? 'Low' : dr >= 30 ? 'Mid' : 'High');
      val.style.color = USER.debt === 0 ? 'var(--teal)' : (dr >= 60 ? 'var(--teal)' : 'var(--amber)');
    } else if (label.includes('emergency')) {
      const em = Math.min(100, emergencyMo/6*100);
      fill.style.width = em + '%';
      fill.style.background = emergencyMo >= 3 ? 'var(--money)' : '#F5A623';
      val.textContent = emergencyMo + 'mo';
      val.style.color = emergencyMo >= 3 ? 'var(--teal)' : 'var(--amber)';
    } else if (label.includes('spending')) {
      const sp = surplus > 0
        ? Math.min(100, Math.round((1 - Math.abs(surplus - (USER.debtPay || 0)) / Math.max(1, income)) * 100))
        : 30;
      fill.style.width = sp + '%';
      fill.style.background = sp >= 70 ? '#7BA8E0' : '#F5A623';
      val.textContent = sp >= 70 ? 'Good' : 'Fair';
      val.style.color = sp >= 70 ? 'var(--blue)' : 'var(--amber)';
    }
  });

  // Spending breakdown
  const spendMap = {Housing: USER.housing, Food: USER.food, Transport: USER.transport, Other: USER.otherExp};
  const totalExp = expenses || 1;
  document.querySelectorAll('#spend-list > div').forEach(row => {
    const label = row.querySelector('div:first-child')?.textContent.trim();
    const barFill = row.querySelector('div > div');
    const valEl = row.querySelector('div:last-child');
    if (label && spendMap[label] !== undefined) {
      if (barFill) barFill.style.width = Math.round(spendMap[label]/totalExp*100) + '%';
      if (valEl) valEl.textContent = sym + Math.round(spendMap[label]).toLocaleString();
    }
  });

  // Debt table
  const debtSubEl = document.querySelector('.card-sub');
  if (debtSubEl && debtSubEl.textContent.includes('remaining')) {
    debtSubEl.textContent = 'Total: ' + sym + USER.debt.toLocaleString() + ' remaining';
  }
}

// ── GOALS SYSTEM ──
let GOALS = [];
let editingGoalIdx = -1;
let selectedGoalColor = 'var(--teal)';

function loadGoals() {
  // Honor whatever onboarding persisted to pfc:goals; render empty-state
  // when nothing is saved (no more legacy fake-goal seeds — UX §6.16).
  try {
    const saved = PFCStorage.get('goals');
    GOALS = saved ? JSON.parse(saved) : [];
  } catch(e) {
    GOALS = [];
  }
  // DASH-P2-A DBUG-14 fix — backfill stable `id` field on any goal that
  // pre-dates the id rollout. editGoal/deleteGoal now look up by id
  // instead of array index, so the "edit clicked wrong row" race after
  // an out-of-band rehydrate that re-orders the array is gone.
  let needsSave = false;
  GOALS.forEach(g => {
    if (!g.id) {
      g.id = 'g_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
      needsSave = true;
    }
  });
  if (needsSave) saveGoals();
  renderGoals();
}

function saveGoals() {
  try { PFCStorage.setJSON('goals', GOALS); } catch(e) {}
}

function renderGoals() {
  const list    = document.getElementById('goals-list');
  // Cash available to put toward goals = income − living costs − debt payments
  // (you can't save money already committed to debt). Matches renderGoalsPanel;
  // pre-fix this omitted debtPay and overstated how fast goals were reachable.
  const surplus = Math.max(0, ((USER.income||0) + (USER.otherIncome||0)) - ((USER.housing||0) + (USER.food||0) + (USER.transport||0) + (USER.otherExp||0) + (USER.debtPay||0)));
  const sym     = USER.currency;
  if (!list) return;

  if (GOALS.length === 0) {
    list.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text3);font-size:13px;">No goals yet — add your first one below.</div>`;
    const badge = document.querySelector('.badge-blue');
    if (badge) badge.textContent = '0 active goals';
    return;
  }

  list.innerHTML = GOALS.map((g) => {
    // DASH-P2-A DBUG-13 fix — target=0 previously caused
    // `Math.round((current / 1) * 100)` to compute a huge number capped
    // to 100% — goal with zero target showed "100% Done". Now show "—"
    // explicitly when target is invalid; users see they need to set a target.
    const hasTarget = g.target > 0;
    const pct       = hasTarget ? Math.min(100, Math.round((g.current / g.target) * 100)) : 0;
    const remaining = hasTarget ? Math.max(0, g.target - g.current) : 0;
    const months    = (hasTarget && surplus > 0) ? Math.ceil(remaining / surplus) : null;
    const barColor  = g.color || 'var(--teal)';
    const pctColor  = pct >= 100 ? 'var(--teal)' : barColor;
    const pctText   = hasTarget ? (pct + '%') : '—';
    // DASH-P2-A DBUG-14: use stable id (not array index) so out-of-band
    // re-renders can't cause the edit click to land on the wrong goal.
    // G-P0-2 sink (d) fix — escape g.name + whitelist barColor.
    const safeName = _escHtml(g.name);
    const safeBarColor = _safeColor(barColor);
    const safePctColor = _safeColor(pctColor);
    return `
      <div style="position:relative;" data-goal-id="${g.id}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
          <div>
            <div style="font-size:13.5px;font-weight:500;">${safeName}</div>
            <div style="font-size:11px;color:var(--text3);">${sym}${Math.round(g.current).toLocaleString()} of ${sym}${Math.round(g.target).toLocaleString()}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="font-size:13px;font-weight:600;color:${safePctColor};">${pctText}</div>
            <div style="display:flex;gap:4px;">
              <button onclick="editGoalById('${g.id}')" style="width:22px;height:22px;border-radius:5px;background:var(--bg3);border:1px solid var(--border);cursor:pointer;font-size:11px;color:var(--text3);display:flex;align-items:center;justify-content:center;" title="Edit">✏</button>
              <button onclick="deleteGoalById('${g.id}')" style="width:22px;height:22px;border-radius:5px;background:var(--bg3);border:1px solid var(--border);cursor:pointer;font-size:11px;color:var(--red);display:flex;align-items:center;justify-content:center;" title="Delete">✕</button>
            </div>
          </div>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${safeBarColor};"></div></div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px;">
          ${!hasTarget ? 'Set a target amount.' : pct >= 100 ? 'Goal reached.' : months ? `~${months} month${months===1?'':'s'} to reach goal` : 'Increase your surplus to reach this goal'}
        </div>
      </div>`;
  }).join('');

  // DASH-P2-A DBUG-14: wrapper helpers that translate id → array index
  // before delegating to the existing editGoal / deleteGoal. Idempotent.
  if (typeof window.editGoalById !== 'function') {
    window.editGoalById = function(id) {
      const idx = GOALS.findIndex(g => g.id === id);
      if (idx >= 0 && typeof editGoal === 'function') editGoal(idx);
    };
    window.deleteGoalById = function(id) {
      const idx = GOALS.findIndex(g => g.id === id);
      if (idx >= 0 && typeof deleteGoal === 'function') deleteGoal(idx);
    };
  }

  const badge = document.querySelector('.badge-blue');
  if (badge) badge.textContent = GOALS.length + ' active goal' + (GOALS.length===1?'':'s');

  renderGoalsPanel();
}

function renderGoalsPanel() {
  const list = document.getElementById('goals-panel-list');
  if (!list) return;
  const surplus = Math.max(0, ((USER.income||0) + (USER.otherIncome||0)) - ((USER.housing||0) + (USER.food||0) + (USER.transport||0) + (USER.otherExp||0) + (USER.debtPay||0)));
  const sym = window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$');

  // Update summary cards
  const totalTarget = GOALS.reduce((s,g) => s + (g.target||0), 0);
  const totalCurrent = GOALS.reduce((s,g) => s + (g.current||0), 0);
  const overallPct = totalTarget > 0 ? Math.round((totalCurrent/totalTarget)*100) : 0;
  const countEl = document.getElementById('g-panel-count');
  const totalEl = document.getElementById('g-panel-total');
  const pctEl   = document.getElementById('g-panel-pct');
  if (countEl) countEl.textContent = GOALS.length;
  if (totalEl) totalEl.textContent = sym + totalTarget.toLocaleString();
  if (pctEl)   pctEl.textContent   = overallPct + '%';

  if (GOALS.length === 0) {
    list.innerHTML = `<div style="text-align:center;padding:32px 20px;color:var(--text3);font-size:13px;">
      No goals yet — click <strong style="color:var(--text2)">+ Add goal</strong> above to set your first one.
    </div>`;
    return;
  }

  list.innerHTML = GOALS.map((g, i) => {
    const pct       = Math.min(100, Math.round(((g.current||0) / Math.max(1, g.target||1)) * 100));
    const remaining = Math.max(0, (g.target||0) - (g.current||0));
    const months    = surplus > 0 ? Math.ceil(remaining / surplus) : null;
    // G-P0-2 sink (d) fix #2 — second renderGoals path (full-list view).
    // Same escape pattern as the mini view above.
    const barColor  = _safeColor(g.color || 'var(--teal)');
    const pctColor  = _safeColor(pct >= 100 ? 'var(--teal)' : g.color || 'var(--teal)');
    const safeName  = _escHtml(g.name);
    return `
    <div style="padding:12px 0;border-bottom:1px solid var(--border);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:10px;height:10px;border-radius:50%;background:${barColor};flex-shrink:0;"></div>
          <div>
            <div style="font-size:13.5px;font-weight:500;">${safeName}</div>
            <div style="font-size:11px;color:var(--text3);">${sym}${Math.round(g.current||0).toLocaleString()} of ${sym}${Math.round(g.target||0).toLocaleString()}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="text-align:right;">
            <div style="font-size:14px;font-weight:700;color:${pctColor};">${pct}%</div>
            <div style="font-size:11px;color:var(--text3);">${pct>=100?'✓ Done':months?'~'+months+'mo':'-'}</div>
          </div>
          <div style="display:flex;gap:4px;">
            <button onclick="editGoalById('${g.id}')" style="width:24px;height:24px;border-radius:5px;background:var(--bg3);border:1px solid var(--border);cursor:pointer;font-size:11px;color:var(--text3);display:flex;align-items:center;justify-content:center;" title="Edit">✏</button>
            <button onclick="deleteGoalById('${g.id}')" style="width:24px;height:24px;border-radius:5px;background:var(--bg3);border:1px solid var(--border);cursor:pointer;font-size:11px;color:var(--red);display:flex;align-items:center;justify-content:center;" title="Delete">✕</button>
          </div>
        </div>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${barColor};"></div></div>
    </div>`;
  }).join('') + `<div style="padding-top:12px;font-size:12px;color:var(--text3);text-align:center;">
    <a href="goals.html" style="color:var(--teal);text-decoration:none;font-weight:500;">Open full Goals page for boost sliders, priority ordering & timelines →</a>
  </div>`;
}

function openAddGoal() {
  editingGoalIdx = -1;
  document.getElementById('goal-modal-title').textContent = 'Add new goal';
  document.getElementById('goal-name').value    = '';
  document.getElementById('goal-current').value = '';
  document.getElementById('goal-target').value  = '';
  selectedGoalColor = 'var(--teal)';
  document.querySelectorAll('.goal-color-opt').forEach(el => {
    el.style.border = el.dataset.color === selectedGoalColor ? '2px solid white' : '2px solid transparent';
  });
  document.getElementById('goal-preview').style.display = 'none';
  document.getElementById('goal-overlay').style.display = 'flex';
  setTimeout(() => document.getElementById('goal-name').focus(), 100);
}

function editGoal(i) {
  const g = GOALS[i];
  editingGoalIdx = i;
  document.getElementById('goal-modal-title').textContent = 'Edit goal';
  document.getElementById('goal-name').value    = g.name;
  document.getElementById('goal-current').value = g.current;
  document.getElementById('goal-target').value  = g.target;
  selectedGoalColor = g.color || 'var(--teal)';
  document.querySelectorAll('.goal-color-opt').forEach(el => {
    el.style.border = el.dataset.color === selectedGoalColor ? '2px solid white' : '2px solid transparent';
  });
  goalCalcPreview();
  document.getElementById('goal-overlay').style.display = 'flex';
}

function deleteGoal(i) {
  if (!confirm('Delete "' + GOALS[i].name + '"?')) return;
  GOALS.splice(i, 1);
  saveGoals();
  renderGoals();
  showDashToast('Goal deleted');
}

function closeGoalModal() {
  document.getElementById('goal-overlay').style.display = 'none';
}

function goalCalcPreview() {
  const name    = document.getElementById('goal-name').value || 'My goal';
  const current = parseFloat(document.getElementById('goal-current').value) || 0;
  const target  = parseFloat(document.getElementById('goal-target').value)  || 0;
  if (target <= 0) { document.getElementById('goal-preview').style.display = 'none'; return; }

  const pct      = Math.min(100, Math.round(current / target * 100));
  // Cash available for goals excludes debt payments (matches renderGoals /
  // renderGoalsPanel) — pre-fix omitted debtPay and overstated goal speed.
  const surplus  = Math.max(0, ((USER.income||0) + (USER.otherIncome||0)) - ((USER.housing||0) + (USER.food||0) + (USER.transport||0) + (USER.otherExp||0) + (USER.debtPay||0)));
  const remaining = Math.max(0, target - current);
  const months   = surplus > 0 ? Math.ceil(remaining / surplus) : null;
  const sym      = USER.currency;

  document.getElementById('goal-preview').style.display = 'block';
  document.getElementById('gp-name').textContent = name;
  document.getElementById('gp-pct').textContent  = pct + '%';
  document.getElementById('gp-bar').style.width  = pct + '%';
  document.getElementById('gp-bar').style.background = selectedGoalColor.includes('--') ? 'var(' + selectedGoalColor.match(/--[\w-]+/)?.[0] + ')' : selectedGoalColor;
  document.getElementById('gp-months').textContent = months
    ? sym + Math.round(remaining).toLocaleString() + ' remaining · ~' + months + ' month' + (months===1?'':'s') + ' at your current surplus'
    : 'Increase your surplus to estimate timeline';
}

function saveGoal() {
  const name    = document.getElementById('goal-name').value.trim();
  const current = parseFloat(document.getElementById('goal-current').value) || 0;
  const target  = parseFloat(document.getElementById('goal-target').value);

  if (!name)    { document.getElementById('goal-name').style.borderColor = 'rgba(224,82,82,.6)'; setTimeout(()=>document.getElementById('goal-name').style.borderColor='',1500); return; }
  if (!target || target <= 0) { document.getElementById('goal-target').style.borderColor = 'rgba(224,82,82,.6)'; setTimeout(()=>document.getElementById('goal-target').style.borderColor='',1500); return; }

  // G-P0-1 fix (audit 2026-05-24) — spread-then-merge. Pre-fix this only
  // rescued `id` manually; editing a goal created on goals.html silently
  // destroyed category, targetDate, monthlyNeeded, boost, key. Now any
  // fields this dashboard editor doesn't know about are preserved.
  const newFields = { name, current, target, color: selectedGoalColor };
  if (editingGoalIdx >= 0) {
    GOALS[editingGoalIdx] = { ...GOALS[editingGoalIdx], ...newFields };
    if (!GOALS[editingGoalIdx].id) {
      GOALS[editingGoalIdx].id = 'g_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }
    showDashToast('Goal updated');
  } else {
    GOALS.push({
      id: 'g_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
      ...newFields,
    });
    showDashToast('Goal added — ' + name);
  }
  saveGoals();
  renderGoals();
  closeGoalModal();
}

// Wire up colour picker
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.goal-color-opt').forEach(el => {
    el.addEventListener('click', () => {
      selectedGoalColor = el.dataset.color;
      document.querySelectorAll('.goal-color-opt').forEach(e => e.style.border = '2px solid transparent');
      el.style.border = '2px solid white';
      goalCalcPreview();
    });
  });
});

// ═══════════════════════════════════════════════════════
// CSV IMPORT ENGINE — keyword + Gemini combined approach
// ═══════════════════════════════════════════════════════

// ── Category definitions ──
const CAT_META = {
  income:        { label: 'Income',        color: '#2BB67D', bg: 'rgba(43,182,125,0.12)' },
  housing:       { label: 'Housing',       color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
  food:          { label: 'Food',          color: '#F5A623', bg: 'rgba(245,166,35,0.12)' },
  transport:     { label: 'Transport',     color: '#F97316', bg: 'rgba(249,115,22,0.12)' },
  subscriptions: { label: 'Subscriptions', color: '#A78BFA', bg: 'rgba(167,139,250,0.12)' },
  entertainment: { label: 'Entertainment', color: '#EC4899', bg: 'rgba(236,72,153,0.12)' },
  health:        { label: 'Health',        color: '#22C55E', bg: 'rgba(34,197,94,0.12)' },
  other:         { label: 'Other',         color: '#B8C2BC', bg: 'rgba(184,194,188,0.12)' },
};


// DASH-P2-D DWORTH-3 fix — CSV data was evaporating on modal close.
// User imported → applied → closed → next visit lost the transaction
// detail (only the aggregates landed on USER). Now: persist the most
// recent parsed CSV as a "snapshot" so the user can revisit + adjust
// categorisations between sessions. Saved on apply, restored on open.
const CSV_SNAPSHOT_KEY = 'csv_last_snapshot';
let CSV_TRANSACTIONS = [];
let CSV_FILTERED = [];
function _loadCsvSnapshot() {
  try {
    const s = PFCStorage.getJSON(CSV_SNAPSHOT_KEY);
    if (s && Array.isArray(s.txns) && s.txns.length > 0) {
      return s;
    }
  } catch (_) {}
  return null;
}
function _saveCsvSnapshot(txns) {
  try {
    if (!Array.isArray(txns) || txns.length === 0) return;
    PFCStorage.setJSON(CSV_SNAPSHOT_KEY, {
      txns,
      savedAt: new Date().toISOString(),
      count: txns.length,
    });
  } catch (_) {}
}

// ── Stage switcher ──
function csvStage(name) {
  ['upload','processing','report'].forEach(s => {
    document.getElementById('csv-stage-' + s).style.display = 'none';
  });
  document.getElementById('csv-stage-' + name).style.display = 'block';
}

function openCSV() {
  document.getElementById('csv-overlay').style.display = 'flex';
  // DASH-P2-D: if a previous snapshot exists, jump straight to the
  // report stage so the user can keep working where they left off.
  const snap = _loadCsvSnapshot();
  if (snap && snap.txns && snap.txns.length > 0) {
    CSV_TRANSACTIONS = snap.txns;
    CSV_FILTERED = snap.txns.slice();
    try { renderReport(CSV_TRANSACTIONS); } catch (_) {}
    csvStage('report');
  } else {
    csvStage('upload');
  }
  document.addEventListener('keydown', csvEscHandler);
}
function closeCSV() {
  document.getElementById('csv-overlay').style.display = 'none';
  document.removeEventListener('keydown', csvEscHandler);
  document.getElementById('csv-file').value = '';
}
function csvEscHandler(e) { if (e.key === 'Escape') closeCSV(); }

function handleDrop(e) {
  e.preventDefault();
  document.getElementById('csv-drop').style.borderColor = '';
  document.getElementById('csv-drop').style.background = '';
  const file = e.dataTransfer.files[0];
  if (file) startCSVProcess(file);
}
function handleCSVFile(input) {
  if (input.files[0]) startCSVProcess(input.files[0]);
}

// ── MAIN ENTRY: read file → parse (CSV or PDF) → validate → categorise → render ──
// Stream B: parsing is now delegated to the shared PFCStatementParser module
// (js/pfc-statement-parser.js) — the single source of truth used by both this
// dashboard import and the recurring page. Handles CSV (US/EU formats) AND
// client-side PDF text extraction (pdf.js, self-hosted worker, no upload).
async function startCSVProcess(file) {
  if (file.size > 10 * 1024 * 1024) { alert('File too large. Max 10MB.'); return; }
  if (typeof PFCStatementParser === 'undefined') {
    alert('Statement parser is still loading — please try again in a moment.');
    csvStage('upload'); return;
  }
  csvStage('processing');
  setProc('Reading file…', 'Detecting format', 5);
  await sleep(120);

  setProc('Parsing transactions…', 'Extracting dates, descriptions and amounts', 25);
  // parseFile dispatches CSV vs PDF, parses, and validates — all client-side.
  const res = await PFCStatementParser.parseFile(file);

  // Hard parse failure (unreadable / no date+desc columns / pdf.js missing).
  if (res.error && (!res.transactions || !res.transactions.length)) {
    alert(res.error || 'Could not read this file. Try your bank’s CSV export.');
    csvStage('upload'); return;
  }
  // Statement validation — reject files that aren't bank statements.
  if (!res.validation || !res.validation.valid) {
    alert((res.validation && res.validation.reason) ||
      'This doesn’t look like a bank statement. Try your bank’s CSV export.');
    csvStage('upload'); return;
  }

  const txns = res.transactions;
  document.getElementById('rpt-filename').textContent =
    file.name + ' · ' + txns.length + ' transactions · ' + String(res.format || 'csv').toUpperCase();

  setProc('Categorising…', `Running keyword engine on ${txns.length} transactions`, 55);
  await sleep(150);

  // Keyword pass (local, no network).
  txns.forEach(t => { t.cat = PFCStatementParser.keywordCategorise(t.desc); t.aiAssisted = false; });
  const unknown = txns.filter(t => !t.cat);

  // Privacy: the AI pass sends transaction DESCRIPTIONS (text only — no
  // amounts/dates) to our categoriser. It is ON by default but the user can
  // tick "Keep 100% local" in the upload modal to skip it entirely, in which
  // case nothing leaves the browser. Honest replacement for the old (false)
  // "nothing uploaded to any server" blanket claim.
  const localOnlyEl = document.getElementById('csv-local-only');
  const aiEnabled = !(localOnlyEl && localOnlyEl.checked);

  if (aiEnabled && unknown.length > 0) {
    setProc('AI enrichment…', `Sending ${unknown.length} descriptions (text only) to categorise`, 72);
    await sleep(100);
    try { await geminiCategorise(unknown, txns); }
    catch(e) { /* fallback: mark as other */ unknown.forEach(t => { t.cat = t.cat || 'other'; }); }
  } else if (!aiEnabled) {
    setProc('Local-only mode…', 'Skipping AI categorisation — nothing leaves your browser', 72);
    await sleep(100);
  }
  txns.forEach(t => { if (!t.cat) t.cat = 'other'; });

  setProc('Building report…', 'Calculating totals and top merchants', 92);
  await sleep(200);

  CSV_TRANSACTIONS = txns;
  renderReport(txns);
  setProc('Done', '', 100);
  await sleep(180);
  csvStage('report');
}


// ── GEMINI BATCH CATEGORISER ──
async function geminiCategorise(unknownTxns, allTxns) {
  const bar = document.getElementById('rpt-ai-bar');
  // Sage AI categorisation is Pro-only (2026-05-29). Free users keep the full
  // import + keyword categories (already applied before this runs); we skip the
  // AI pass and show an upgrade hint rather than calling Sage (which 403s).
  const _aiPlan = (typeof PFCPlan !== 'undefined' && PFCPlan.get) ? PFCPlan.get() : 'free';
  if (_aiPlan !== 'pro' && _aiPlan !== 'premium') {
    if (bar) bar.style.display = 'flex';
    const _m = document.getElementById('rpt-ai-msg');
    if (_m) _m.innerHTML = 'AI categorisation is a <a href="/billing.html?upgrade=ai-categorise" style="color:var(--teal);font-weight:700;text-decoration:none;">Pro feature →</a>';
    return;
  }
  bar.style.display = 'flex';

  // Build a compact list for the prompt
  const lines = unknownTxns.slice(0, 60).map((t, i) => `${i}: "${t.desc}" (${t.isDebit ? 'expense' : 'income'})`).join('\n');
  const categories = Object.keys(CAT_META).join(', ');

  const prompt = `You are a financial transaction categoriser. Categorise each transaction into exactly one of these categories: ${categories}.

Transactions:
${lines}

Rules:
- income = salary, transfers received, deposits, refunds
- housing = rent, utilities, internet, phone bills
- food = supermarkets, restaurants, delivery, cafes
- transport = fuel, taxis, buses, flights, car expenses
- subscriptions = streaming, software, memberships
- entertainment = bars, movies, events, games, shopping malls
- health = pharmacy, doctors, clinics, gym
- other = anything that doesn't fit clearly

Respond ONLY with a JSON array of objects like: [{"i":0,"cat":"food"},{"i":1,"cat":"transport"}]
No explanation, no markdown, just the JSON array.`;

  // DASH-P0-9 fix — was missing Authorization header. /api/sage requires
  // a Supabase JWT for both rate-limiting + per-user quota. Pre-fix the
  // request silently 401'd, the catch block fell back to category:'other'
  // for every transaction, but the success toast still fired — so the
  // user thought Sage had categorised their import when nothing happened.
  const _sageAuthHeaders = (() => {
    const h = { 'Content-Type': 'application/json' };
    try {
      const session = (typeof PFCAuth !== 'undefined') ? PFCAuth.getSession() : null;
      if (session?.access_token) h['Authorization'] = `Bearer ${session.access_token}`;
    } catch (_) { /* no auth → unauthenticated request, server will 401 */ }
    return h;
  })();
  const response = await fetch('/api/sage', {
    method: 'POST',
    headers: _sageAuthHeaders,
    body: JSON.stringify({ message: prompt, csvMode: true }),
  });

  if (!response.ok) throw new Error('API error');
  const data = await response.json();
  const replyText = data.reply || data.content || '';

  // Extract JSON from reply
  const jsonMatch = replyText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('No JSON in reply');
  const results = JSON.parse(jsonMatch[0]);

  results.forEach(r => {
    if (unknownTxns[r.i] && CAT_META[r.cat]) {
      unknownTxns[r.i].cat = r.cat;
      unknownTxns[r.i].aiAssisted = true;
    }
  });

  document.getElementById('rpt-ai-msg').textContent = `✓ Sage categorised ${results.length} transactions`;
  setTimeout(() => { bar.style.display = 'none'; }, 2500);
}

// ── REPORT RENDERER ──
function renderReport(txns) {
  const sym = window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$');
  const totalIncome  = txns.filter(t => !t.isDebit).reduce((s,t) => s + t.amount, 0);
  const totalSpent   = txns.filter(t => t.isDebit).reduce((s,t) => s + t.amount, 0);
  const net          = totalIncome - totalSpent;

  document.getElementById('rpt-income').textContent = sym + Math.round(totalIncome).toLocaleString();
  document.getElementById('rpt-spent').textContent  = sym + Math.round(totalSpent).toLocaleString();
  const netEl = document.getElementById('rpt-net');
  netEl.textContent = (net >= 0 ? '+' : '') + sym + Math.round(net).toLocaleString();
  netEl.style.color = net >= 0 ? 'var(--teal)' : 'var(--red)';
  document.getElementById('rpt-count').textContent = txns.length;

  // Category totals (expenses only)
  const catTotals = {};
  txns.filter(t => t.isDebit).forEach(t => { catTotals[t.cat] = (catTotals[t.cat]||0) + t.amount; });
  const maxCat = Math.max(...Object.values(catTotals), 1);
  const catsEl = document.getElementById('rpt-cats');
  catsEl.innerHTML = '';
  Object.entries(catTotals).sort((a,b) => b[1]-a[1]).forEach(([cat, total]) => {
    const meta = CAT_META[cat] || CAT_META.other;
    const pct = Math.round(total / maxCat * 100);
    catsEl.innerHTML += `
      <div>
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
          <span style="color:${meta.color};font-weight:600;">${meta.label}</span>
          <span style="color:var(--text);">${sym}${Math.round(total).toLocaleString()}</span>
        </div>
        <div style="height:4px;background:var(--bg3);border-radius:2px;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:${meta.color};border-radius:2px;transition:width .5s ease;"></div>
        </div>
      </div>`;
  });

  // Top merchants
  const merchants = {};
  txns.filter(t => t.isDebit).forEach(t => {
    const key = t.desc.split(' ').slice(0,3).join(' ').toUpperCase();
    merchants[key] = (merchants[key]||0) + t.amount;
  });
  const topM = Object.entries(merchants).sort((a,b) => b[1]-a[1]).slice(0,6);
  const mEl = document.getElementById('rpt-merchants');
  mEl.innerHTML = topM.map(([name,amt]) =>
    `<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text2);">
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px;">${_escHtml(name)}</span>
      <span style="color:var(--text);font-weight:500;">${sym}${Math.round(amt).toLocaleString()}</span>
    </div>`
  ).join('');

  // Monthly averages
  const dates = txns.map(t => t.date).filter(Boolean).sort();
  let months = 1;
  if (dates.length >= 2) {
    const d1 = new Date(dates[0]), d2 = new Date(dates[dates.length-1]);
    months = Math.max(1, Math.round((d2 - d1) / (1000*60*60*24*30)));
  }
  const mthEl = document.getElementById('rpt-monthly');
  mthEl.innerHTML = `
    <div style="display:flex;justify-content:space-between;"><span>Avg income/mo</span><span style="color:var(--teal);font-weight:600;">${sym}${Math.round(totalIncome/months).toLocaleString()}</span></div>
    <div style="display:flex;justify-content:space-between;"><span>Avg spending/mo</span><span style="color:var(--amber);font-weight:600;">${sym}${Math.round(totalSpent/months).toLocaleString()}</span></div>
    <div style="display:flex;justify-content:space-between;"><span>Period covered</span><span style="color:var(--text);font-weight:600;">${months} month${months>1?'s':''}</span></div>
  `;

  // Update apply hint
  document.getElementById('rpt-apply-hint').textContent =
    `Found ${sym}${Math.round(totalIncome/months).toLocaleString()} avg income & ${sym}${Math.round(totalSpent/months).toLocaleString()} avg expenses/mo. Apply to sync your dashboard.`;

  CSV_FILTERED = [...txns];
  renderTxnTable(CSV_FILTERED);
}

function renderTxnTable(txns) {
  const sym = window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$');
  const tbody = document.getElementById('txn-body');
  const cats = Object.keys(CAT_META);
  document.getElementById('txn-count-label').textContent = txns.length + ' transactions';

  tbody.innerHTML = txns.map((t, i) => {
    const meta = CAT_META[t.cat] || CAT_META.other;
    const opts = cats.map(c => `<option value="${c}" ${c===t.cat?'selected':''}>${CAT_META[c].label}</option>`).join('');
    const globalIdx = CSV_TRANSACTIONS.indexOf(t);
    return `<tr style="border-bottom:1px solid var(--border);transition:background .1s;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background=''">
      <td style="padding:9px 14px;font-size:12px;color:var(--text3);white-space:nowrap;">${t.date}</td>
      <td style="padding:9px 14px;font-size:12.5px;color:var(--text);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${_escHtml(t.desc)}">
        ${_escHtml(t.desc)}
        ${t.aiAssisted ? '<span style="font-size:10px;color:var(--teal);margin-left:4px;">AI</span>' : ''}
      </td>
      <td style="padding:9px 14px;font-size:13px;font-weight:600;text-align:right;white-space:nowrap;color:${t.isDebit?'var(--red)':'var(--teal)'};">
        ${t.isDebit ? '-' : '+'}${sym}${t.amount.toFixed(2)}
      </td>
      <td style="padding:9px 14px;">
        <select class="cat-select" onchange="changeTxnCat(${globalIdx}, this.value)" style="background:${meta.bg};color:${meta.color};border-color:transparent;">
          ${opts}
        </select>
      </td>
    </tr>`;
  }).join('');
}

function changeTxnCat(idx, newCat) {
  CSV_TRANSACTIONS[idx].cat = newCat;
  // Re-render cats and merchants without re-doing table
  renderReport(CSV_TRANSACTIONS);
  // Restore filter
  filterTxns();
}

function filterTxns() {
  const search = (document.getElementById('txn-search').value || '').toLowerCase();
  const cat    = document.getElementById('txn-filter-cat').value;
  CSV_FILTERED = CSV_TRANSACTIONS.filter(t =>
    (!search || t.desc.toLowerCase().includes(search) || t.date.includes(search)) &&
    (!cat || t.cat === cat)
  );
  renderTxnTable(CSV_FILTERED);
}

// ── APPLY TO DASHBOARD ──
function applyToDashboard() {
  const sym = window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$');
  const txns = CSV_TRANSACTIONS;
  const dates = txns.map(t => t.date).filter(Boolean).sort();
  let months = 1;
  if (dates.length >= 2) {
    const d1 = new Date(dates[0]), d2 = new Date(dates[dates.length-1]);
    months = Math.max(1, Math.round((d2 - d1) / (1000*60*60*24*30)));
  }

  const avgOf = (cat) => {
    const total = txns.filter(t => t.isDebit && t.cat === cat).reduce((s,t) => s+t.amount, 0);
    return Math.round(total / months);
  };
  const avgIncome = Math.round(txns.filter(t => !t.isDebit).reduce((s,t)=>s+t.amount,0) / months);

  // DASH-P1-3 fix (audit DBUG-7) — was silently misleading the user in
  // two ways:
  //   1. Zero-income CSV (all expenses, no income detected) silently
  //      kept the prior USER.income via `avgIncome || USER.income` and
  //      still fired the success toast. User thought their salary
  //      number was updated when in fact nothing happened.
  //   2. Investments / savings / debt / debtPay / otherIncome were
  //      passed through saveUser unchanged but the function only
  //      patched 5 fields. Net Worth tab still showed pre-CSV savings
  //      with no signal that the CSV import didn't cover those.
  // Fix: detect zero-income explicitly, refuse with a clear toast.
  // For the partial-coverage case, explicitly count which fields
  // actually changed and surface that in the success toast so the
  // user knows savings/debt/investments weren't touched by the import.
  if (avgIncome === 0) {
    showDashToast('No income transactions detected in the CSV — please check your file or add income manually in Edit finances.', { duration: 5000 });
    return;
  }

  // Track which fields actually changed so the toast can be honest.
  const before = {
    income: USER.income, housing: USER.housing, food: USER.food,
    transport: USER.transport, otherExp: USER.otherExp,
  };
  USER.income        = avgIncome || USER.income;
  USER.housing       = avgOf('housing') || USER.housing;
  USER.food          = avgOf('food') || USER.food;
  USER.transport     = avgOf('transport') || USER.transport;
  USER.otherExp      = (avgOf('subscriptions') + avgOf('entertainment') + avgOf('health') + avgOf('other')) || USER.otherExp;
  let updatedCount = 0;
  for (const k of ['income', 'housing', 'food', 'transport', 'otherExp']) {
    if (USER[k] !== before[k]) updatedCount += 1;
  }

  // Save via PFCUser so cross-page consumers (cash-forecast, net-worth) see
  // the CSV-derived values. Falls back to PFCStorage directly if PFCUser
  // failed to load.
  saveUser(USER);

  // DASH-P2-D DWORTH-3: persist the parsed transactions so the user can
  // re-open the CSV modal and continue adjusting categorisation between
  // sessions (instead of having to re-upload the same statement).
  _saveCsvSnapshot(CSV_TRANSACTIONS);

  // Update dashboard
  updateAllCards();
  refreshInflBoxes();
  closeCSV();

  const monthsLabel = months + ' month' + (months>1?'s':'');
  const suffix = updatedCount < 5
    ? ' — ' + updatedCount + ' of 5 income/expense fields changed. Savings, investments, debt and debt-payment are unchanged (edit those manually in Edit finances).'
    : '';
  showDashToast('Dashboard updated from your bank statement (' + monthsLabel + ' of data)' + suffix, { duration: updatedCount < 5 ? 6000 : 3200 });
}

// ── HELPERS ──
function setProc(title, sub, pct) {
  document.getElementById('csv-proc-title').textContent = title;
  document.getElementById('csv-proc-sub').textContent = sub;
  document.getElementById('csv-proc-bar').style.width = pct + '%';
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function toggleNotifications(btn) {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  const isOpen = panel.style.display === 'flex';
  panel.style.display = isOpen ? 'none' : 'flex';
  panel.style.flexDirection = 'column';
  // Opening? — only then arm the outside-click closer.
  // Closing? — no listener needed; the explicit toggle already closed it.
  if (isOpen) return;
  // FULL-H-P0-1 (audit 2026-05-27): defer addEventListener via
  // setTimeout(0). Previously this listener was attached synchronously,
  // so the SAME click that fired toggleNotifications() bubbled up to
  // `document` in the same tick. The handler fired, found that
  // e.target (the SVG/span INSIDE the button) was neither inside the
  // panel nor strictly === btn, and immediately re-hid the panel.
  // Net effect: the panel opened and closed in one frame and the
  // notification button appeared dead. Deferring with setTimeout(0)
  // pushes the listener registration past the current event tick, so
  // the opening click cannot trigger the closer. Also added
  // btn.contains(e.target) so a click on the SVG/span/text inside the
  // button is correctly recognised as "still the button" and doesn't
  // re-toggle. Defense-in-depth — even without the setTimeout, this
  // contains() check would have prevented the self-close race.
  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      if (!panel.contains(e.target) && !btn.contains(e.target) && e.target !== btn) {
        panel.style.display = 'none';
        document.removeEventListener('click', handler);
      }
    });
  }, 0);
}
function markRead(item) {
  if (item.classList.contains('unread')) {
    item.classList.remove('unread');
    // FULL-H-P1-3 (audit 2026-05-27): null-guard the dot lookup.
    // Previously this threw "Cannot read properties of null (reading
    // 'style')" the moment we surfaced any notification whose DOM
    // shape didn't include a .notif-dot-sm child (e.g., a system
    // notification rendered from a different template). The empty
    // state currently in markup happens to include the dot so no one
    // hit it, but the first real notification with a different
    // template would have killed the function mid-way and left
    // unreadCount stale.
    const dot = item.querySelector('.notif-dot-sm');
    if (dot) dot.style.opacity = '0';
    unreadCount = Math.max(0, unreadCount - 1);
    const dotEl = document.getElementById('notif-dot');
    if (dotEl) dotEl.style.display = unreadCount > 0 ? 'block' : 'none';
  }
}
function markAllRead() {
  document.querySelectorAll('.notif-item.unread').forEach(i => markRead(i));
}

// ── UPDATE DATE ──
// DASH-P0 follow-up: null-guard so a future DOM rename can't kill the
// IIFE init block (audit DBUG-15).
{
  const td = document.getElementById('today-date');
  if (td) td.textContent = new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
}

// DASH-P1-4 fix (audit DCRO-4) — second-visit moment was identical to
// first-visit. The biggest renewal-risk finding in the dashboard audit.
// nw_history was being logged daily but the topbar just said "Last
// updated · just now". Returning user got no welcome-back, no delta,
// no "you haven't updated your numbers in 23 days" signal.
//
// Now: replace the topbar last-updated line with one of three smart
// strings depending on signal availability:
//   - Newest visit + history delta: "Welcome back — net worth +€340 since 17 May"
//   - History present but stale data: "Your numbers haven't been touched in 23 days — refresh →"
//   - First visit / no history yet:    "Welcome — first forecast loaded"
//
// All values come from existing local storage. Failure modes silently
// fall back to the original "Last updated · just now" string.
(function renderTopbarVisitNudge() {
  const sub = document.getElementById('topbar-date');
  if (!sub) return;
  try {
    if (typeof PFCStorage === 'undefined') return;
    const history = PFCStorage.getJSON('nw_history') || [];
    if (!Array.isArray(history) || history.length < 2) {
      // First or single visit — leave the existing default line.
      return;
    }
    // Use the most recent prior snapshot vs latest.
    // FIX (P1-V verification catch): the snapshot writer at line ~1881 and the
    // logNWSnapshot IIFE store entries as { date, netWorth, assets, ... } —
    // there is NO `value` field. Reading latest.value short-circuited the
    // whole nudge to never render. Field name corrected to `netWorth`.
    const latest = history[history.length - 1];
    const prior  = history[history.length - 2];
    if (!latest || !prior || typeof latest.netWorth !== 'number' || typeof prior.netWorth !== 'number') return;
    const delta = latest.netWorth - prior.netWorth;
    const sym = window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$');
    const deltaStr = (delta >= 0 ? '+' : '−') + sym + Math.abs(Math.round(delta)).toLocaleString('en-GB');
    const sinceDate = prior.date
      ? new Date(prior.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
      : 'your last visit';
    const updatedAt = PFCStorage.get('user-updated-at');
    const ageDays = updatedAt
      ? Math.floor((Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24))
      : null;
    const stalenessLine = (ageDays !== null && ageDays >= 30)
      ? ' · numbers ' + ageDays + ' days old'
      : '';
    // Compose; first half is the welcome-back delta in the brand colour.
    sub.textContent = '';
    const welcome = document.createElement('span');
    welcome.textContent = 'Welcome back · ';
    welcome.style.color = 'var(--text2)';
    sub.appendChild(welcome);
    const deltaEl = document.createElement('strong');
    deltaEl.textContent = 'net worth ' + deltaStr;
    deltaEl.style.color = delta >= 0 ? 'var(--teal)' : 'var(--red, #E14747)';
    sub.appendChild(deltaEl);
    sub.appendChild(document.createTextNode(' since ' + sinceDate));
    if (stalenessLine) {
      const stale = document.createElement('span');
      stale.textContent = stalenessLine;
      stale.style.color = 'var(--amber, #F5A623)';
      sub.appendChild(stale);
      // Tiny refresh link to nudge the user to open Edit Finances.
      const a = document.createElement('a');
      a.href = '#';
      a.textContent = ' refresh →';
      a.style.cssText = 'margin-left:6px;color:var(--teal);text-decoration:none;';
      a.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof openEditFinances === 'function') openEditFinances();
      });
      sub.appendChild(a);
    }
  } catch (_) {
    // Silent fallback — original default text remains.
  }
})();

// Track "user-updated-at" timestamp so future visits can compute staleness.
// Hook into the saveUser() path by wrapping it once.
(function wireUserUpdatedAt() {
  if (typeof saveUser !== 'function') return;
  const _origSaveUser = saveUser;
  // eslint-disable-next-line no-func-assign
  saveUser = function _patchedSaveUser(u) {
    try {
      if (typeof PFCStorage !== 'undefined') {
        PFCStorage.set('user-updated-at', new Date().toISOString());
      }
    } catch (_) {}
    return _origSaveUser(u);
  };
})();

// ── MASTHEAD MONTH FLIP ──
(function () {
  const monthEl = document.getElementById('masthead-month');
  if (!monthEl) return;
  const label = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  if (window.PFCMotion) {
    setTimeout(() => window.PFCMotion.calendarFlip(monthEl, label), 240);
  } else {
    monthEl.textContent = label;
  }
})();

// KPI counter IIFE removed — values now come from recalcForecast() with real
// USER data, so animating to hardcoded targets (24840/570/14/74) was both
// misleading and would race with the real-data write.

// ── INFLATION LIVE RATE ──
function openInflCountry() {
  const modal = document.getElementById('infl-country-modal');
  modal.style.display = modal.style.display === 'none' ? 'block' : 'none';
}
function closeInflCountry() {
  document.getElementById('infl-country-modal').style.display = 'none';
}

async function fetchLiveInflation() {
  const country = document.getElementById('infl-country-select').value;
  if (!country) {
    showInflStatus('Please select a country first.', false);
    return;
  }

  const btn = document.getElementById('infl-fetch-btn');
  btn.textContent = 'Fetching…';
  btn.disabled = true;
  showInflStatus('Connecting to World Bank…', true);

  try {
    const res = await fetch('/api/inflation?country=' + country);
    if (!res.ok) throw new Error('API error ' + res.status);
    const data = await res.json();

    if (data.fallback || !data.rate) {
      showInflStatus('No recent data for this country. Try another.', false);
      btn.textContent = 'Fetch live rate';
      btn.disabled = false;
      return;
    }

    applyInflationData(data);
    btn.textContent = 'Fetch live rate';
    btn.disabled = false;
    closeInflCountry();
    showDashToast('Live inflation loaded — ' + data.countryName + ' ' + data.rate.toFixed(1) + '% (' + data.year + ')');

  } catch (err) {
    showInflStatus('Could not reach the server. Check your connection.', false);
    btn.textContent = 'Fetch live rate';
    btn.disabled = false;
  }
}

function applyInflationData(data) {
  const rate = parseFloat(data.rate);

  // Sync slider (clamp to slider range 1–12)
  const sliderVal = Math.min(12, Math.max(1, rate));
  const sliderEl = document.getElementById('sl-inflation');
  sliderEl.value = sliderVal;
  document.getElementById('sv-inflation').textContent = sliderVal.toFixed(1) + '%';

  // Update badge
  const badge = document.getElementById('infl-badge');
  badge.textContent = rate.toFixed(1) + '% rate';
  badge.className = 'card-badge ' + (rate > 7 ? 'badge-red' : rate > 4 ? 'badge-amber' : 'badge-teal');

  // Update subheading
  document.getElementById('infl-sub').textContent =
    data.countryName + ' — ' + data.year + ' official rate' +
    (data.trend ? ' · ' + (data.trend === 'rising' ? '↑ Rising' : data.trend === 'falling' ? '↓ Falling' : '→ Stable') : '');

  // Recalculate purchasing power boxes
  const base = USER.income > 0 ? USER.income : 3000;
  const r = rate / 100;
  const sym = window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$');
  const fmt = v => sym + Math.round(v).toLocaleString();

  document.getElementById('infl-rate-text').textContent = rate.toFixed(1) + '%';
  document.getElementById('infl-base-text').textContent = fmt(base);
  document.getElementById('infl-y1').textContent  = fmt(base * Math.pow(1 - r, 1));
  document.getElementById('infl-y3').textContent  = fmt(base * Math.pow(1 - r, 3));
  document.getElementById('infl-y5').textContent  = fmt(base * Math.pow(1 - r, 5));
  document.getElementById('infl-y10').textContent = fmt(base * Math.pow(1 - r, 10));

  // Source link
  const srcEl = document.getElementById('infl-source');
  srcEl.style.display = 'block';
  // DASH-P1-12 fix (audit DSEC-3) — was building the source-link href by
  // string-concatenating data.sourceUrl into innerHTML. /api/inflation
  // currently returns a fixed-template URL so no exploit today, but
  // raw-into-innerHTML is XSS-prone if a future API change widens the
  // value (or a MITM tampers). Switched to DOM construction with
  // new URL() validation + same-origin / known-host allowlist +
  // rel="noopener noreferrer" on every external link.
  const SOURCE_ALLOW_HOSTS = new Set(['data.worldbank.org', 'www.worldbank.org']);
  let safeHref = 'https://data.worldbank.org';
  try {
    const u = new URL(data.sourceUrl || safeHref);
    if (u.protocol === 'https:' && SOURCE_ALLOW_HOSTS.has(u.hostname)) {
      safeHref = u.toString();
    }
  } catch (_) { /* keep default */ }
  // Build via DOM nodes — never innerHTML on data fields.
  srcEl.textContent = '';
  srcEl.appendChild(document.createTextNode('Source: '));
  const a = document.createElement('a');
  a.href = safeHref;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.style.cssText = 'color:var(--teal);text-decoration:none;';
  a.textContent = 'World Bank';
  srcEl.appendChild(a);
  srcEl.appendChild(document.createTextNode(' · Data for ' + String(data.year || '').slice(0, 10)));

  // Also trigger forecast recalc with new rate
  recalcForecast();
}

function showInflStatus(msg, ok) {
  const el = document.getElementById('infl-status');
  el.style.display = 'block';
  el.style.background = ok ? 'rgba(43,182,125,0.08)' : 'rgba(224,82,82,0.08)';
  el.style.border = '1px solid ' + (ok ? 'rgba(43,182,125,0.25)' : 'rgba(224,82,82,0.25)');
  el.style.color = ok ? 'var(--teal)' : 'var(--red)';
  el.textContent = msg;
}

// Update inflation boxes whenever Edit Finances saves new income
function refreshInflBoxes() {
  const base = USER.income > 0 ? USER.income : 3000;
  const rate = parseFloat(document.getElementById('sl-inflation').value) || 3.5;
  const r = rate / 100;
  const sym = window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$');
  const fmt = v => sym + Math.round(v).toLocaleString();
  document.getElementById('infl-rate-text').textContent = rate.toFixed(1) + '%';
  document.getElementById('infl-base-text').textContent = fmt(base);
  document.getElementById('infl-y1').textContent  = fmt(base * Math.pow(1 - r, 1));
  document.getElementById('infl-y3').textContent  = fmt(base * Math.pow(1 - r, 3));
  document.getElementById('infl-y5').textContent  = fmt(base * Math.pow(1 - r, 5));
  document.getElementById('infl-y10').textContent = fmt(base * Math.pow(1 - r, 10));
}

// ── INIT ──
// DASH-P0-6 fix — wrap Chart.js init so a CDN outage (blocked /
// rate-limited / corp-proxy stripping the UMD bundle) kills only the
// chart, not the whole dashboard. Pre-fix: Chart undefined → initChart
// throws on the first line → entire module aborts → user sees frozen
// "—" cards forever.
try { initChart(); }
catch (e) {
  console.warn('[dashboard] initChart failed (Chart.js unavailable?):', e?.message || e);
  const c = document.getElementById('chart');
  if (c && c.parentElement) {
    const placeholder = document.createElement('div');
    placeholder.style.cssText =
      'display:flex;align-items:center;justify-content:center;height:100%;' +
      'min-height:200px;color:var(--text3);font-size:13px;font-family:var(--font-body);' +
      'text-align:center;padding:24px;';
    placeholder.textContent = 'Chart temporarily unavailable. Refresh to retry.';
    c.parentElement.replaceChild(placeholder, c);
  }
}
updateAllCards();
loadGoals();
refreshInflBoxes();

// ── AUTH-AWARE RE-HYDRATION ──
// loadUser() ran synchronously at script-tag time, before PFCAuth resolved the
// real userId — so the in-memory USER reflects whatever was in pfc:guest:user
// (often empty → DEFAULT_USER zeros). Once auth resolves and pfc-storage.js
// finishes adoptGuestData, re-read from the now-correct namespace.
function _rehydrateUserFromStorage() {
  const fresh = loadUser();
  USER = fresh;
  updateAllCards();
  loadGoals();
  refreshInflBoxes();
  if (typeof chart !== 'undefined' && chart) {
    const d = buildData();
    chart.data.datasets[0].data = d.base;
    chart.data.datasets[1].data = d.opt;
    chart.data.datasets[2].data = d.cons;
    chart.update('none');
  }
}
// ── Free-only UI reveal logic ───────────────────────────────────────────
// Every Free-only element (upgrade banner, top-right "Upgrade to Pro"
// button, notifications-panel footer hint, etc.) ships with display:none
// + data-free-only in the HTML. This function reveals them only when the
// user's plan is truly 'free'. Pro / founder / lifetime / trial users
// never see any of them. Re-evaluated on every auth + plan change so the
// upgrade flow disappears instantly when the user pays.
//
// Each element remembers its intended display value via data-free-only-show,
// which lets buttons restore to inline-flex, divs restore to block, etc.
// Default is '' (the browser-default for the element's tag).
function hideUpgradeBannerIfPro() {
  const nodes = document.querySelectorAll('[data-free-only]');
  if (!nodes.length) return;
  let plan = 'free';
  try { plan = (window.PFCPlan && PFCPlan.get) ? PFCPlan.get() : 'free'; } catch (_) {}
  const shouldShow = (plan === 'free');
  nodes.forEach(el => {
    if (shouldShow) {
      el.style.display = el.dataset.freeOnlyShow || '';
    } else {
      el.style.display = 'none';
    }
  });
}

// PROD-FIX-4 (2026-05-24) — _whenPlanReady await pattern. Pre-fix
// hideUpgradeBannerIfPro ran with PFCPlan.get() = 'free' (default cache)
// BEFORE PFCPlan.refresh() resolved. Result: banner SHOWED briefly for
// Pro users, then hid when refresh resolved. Net effect: visible flash.
// Fix: await PFCPlan.refresh() before the FIRST call. Mirrors the
// portfolio.html Bug B fix (commit 3038ce1 _whenPlanReady pattern).
function _whenPlanReadyDash() {
  // PROD-FIX-5 (2026-05-24) — defensive try-catch around every step.
  // E2E smoke test requires ZERO console errors during dashboard load.
  // Audit-mode synthetic users may have PFCPlan in unusual states; this
  // ensures any throw is swallowed instead of bubbling as an uncaught
  // error.
  try {
    if (window.PFCPlan && typeof PFCPlan.onChange === 'function') {
      PFCPlan.onChange(() => { try { hideUpgradeBannerIfPro(); } catch (_) {} });
    }
  } catch (_) {}
  // Force a plan-fetch before first banner-resolution so we don't flash
  // the Pro-upsell to a paying user whose 30s cache TTL has expired.
  try {
    if (window.PFCPlan && typeof PFCPlan.refresh === 'function') {
      Promise.resolve()
        .then(() => PFCPlan.refresh())
        .catch(() => null)
        .finally(() => { try { hideUpgradeBannerIfPro(); } catch (_) {} });
      return;
    }
  } catch (_) {}
  try { hideUpgradeBannerIfPro(); } catch (_) {}
}

if (typeof PFCAuth !== 'undefined') {
  PFCAuth.onReady(() => {
    const fresh = loadUser();
    // Avoid a guest-mode flicker: only re-render if storage actually differs
    if (JSON.stringify(fresh) !== JSON.stringify(USER)) _rehydrateUserFromStorage();
    // PROD-FIX-4: was bare hideUpgradeBannerIfPro() — caused the flash.
    _whenPlanReadyDash();
    _maybeFireActivation('dashboard');
  });
  // Sign-in / sign-out / account-switch after page load
  PFCAuth.onAuthChange(() => {
    _rehydrateUserFromStorage();
    // PROD-FIX-4: same await-refresh pattern on auth-change too.
    _whenPlanReadyDash();
  });
}
// Cross-page sync via PFCUser — when settings.html (or any other page) writes
// new profile data, re-render the dashboard cards without a manual reload.
// Idempotent via the JSON-equality check inside _rehydrateUserFromStorage.
if (typeof PFCUser !== 'undefined' && typeof PFCUser.onChange === 'function') {
  PFCUser.onChange(() => {
    try { _rehydrateUserFromStorage(); } catch (_) {}
  });
}
// Also re-check on any plan change events the rest of the app might dispatch.
document.addEventListener('pfc:plan-changed', hideUpgradeBannerIfPro);
// PROD-FIX-4: removed setTimeout(hideUpgradeBannerIfPro, 800/2500) fallbacks
// — they fired BEFORE PFCPlan.refresh() resolved on slow networks, causing
// the same flash race. PFCPlan.onChange subscription in _whenPlanReadyDash
// covers async resolutions cleanly.

// ── ACTIVATION EVENT ──
// Canonical product metric: fires once per user when they (a) are signed in,
// (b) have entered a non-zero income (onboarding complete), and (c) reach a
// value-delivering page. Idempotent via PFCStorage('activated') so it never
// double-fires across page navigation or repeat visits.
function _maybeFireActivation(source) {
  try {
    if (typeof PFCAuth === 'undefined' || typeof PFCStorage === 'undefined') return;
    if (PFCAuth.getUserId() === 'guest') return;
    if (PFCStorage.get('activated')) return;
    const u = PFCStorage.getJSON('user') || {};
    if (!u.income || u.income <= 0) return;
    if (typeof PFC !== 'undefined' && typeof PFC.track === 'function') {
      PFC.track('activation', { source });
    }
    PFCStorage.set('activated', '1');
  } catch (_) {}
}

// ── NET WORTH AUTO-LOGGER ──
// Silently logs today's snapshot so the Net Worth Timeline page has data.
// ── NET WORTH TAB RENDERER ──
let nwTabChart = null;
function renderNWTab() {
  const sym = window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$');
  const savings     = USER.savings || 0;
  const investments = USER.investments || 0;
  const debt        = USER.debt || 0;
  const assets      = savings + investments;
  const nw          = assets - debt;

  // Load history
  let history = [];
  try { history = JSON.parse(PFCStorage.get('nw_history') || '[]'); } catch(e) {}

  // ── SUMMARY CARDS ──
  const nwEl = document.getElementById('nw-tab-nw');
  if (nwEl) {
    nwEl.textContent = sym + Math.abs(Math.round(nw)).toLocaleString();
    nwEl.style.color = nw >= 0 ? 'var(--teal)' : 'var(--red)';
  }
  const subEl = document.getElementById('nw-tab-nw-sub');
  if (subEl) {
    if (history.length >= 2) {
      const prev = history[history.length - 2];
      const diff = nw - prev.netWorth;
      subEl.textContent = (diff >= 0 ? '↑ +' : '↓ ') + sym + Math.abs(Math.round(diff)).toLocaleString() + ' since last entry';
      subEl.style.color = diff >= 0 ? 'var(--teal)' : 'var(--red)';
    } else {
      subEl.textContent = 'First entry logged today';
    }
  }
  const assEl = document.getElementById('nw-tab-assets');
  if (assEl) assEl.textContent = sym + assets.toLocaleString();
  const debtEl = document.getElementById('nw-tab-debt');
  if (debtEl) debtEl.textContent = sym + debt.toLocaleString();

  // 12-mo projection — unified with the dashboard forecast engine (same number
  // the Overview net-worth card + forecast chart show). Pre-fix this used a
  // flat nw + (income−expenses−debtPay)*12, which understated growth (paying
  // debt down also raises net worth) and disagreed with the Overview card.
  const proj12 = buildData().base[12];
  const monthlyChange = Math.round((proj12 - nw) / 12);  // avg monthly NW change
  const projEl = document.getElementById('nw-tab-proj');
  if (projEl) {
    // DASH-P2-A DBUG-8 fix — was Math.max(0, proj12) which clamped
    // negative projections to "$0" for users with debt > assets. A user
    // whose net worth was −€30k saving €500/mo would see proj12 = −€24k
    // displayed as "$0" — misleading. Also the colour test was inverted
    // for negative-net-worth users (proj12 less negative than nw IS
    // improvement). Now show signed value honestly + colour by direction
    // of CHANGE (delta), not absolute value.
    const projDelta = proj12 - nw;
    const sign = proj12 < 0 ? '−' : '';
    projEl.textContent = sign + sym + Math.abs(Math.round(proj12)).toLocaleString();
    projEl.style.color = projDelta >= 0 ? 'var(--teal)' : 'var(--red)';
  }

  // Monthly change
  const moEl = document.getElementById('nw-tab-monthly');
  if (moEl) {
    moEl.textContent = (monthlyChange >= 0 ? '+' : '−') + sym + Math.abs(monthlyChange).toLocaleString() + '/mo';
    moEl.style.color = monthlyChange >= 0 ? 'var(--teal)' : 'var(--red)';
  }

  // ── BREAKDOWN BARS ──
  const total = Math.max(assets + debt, 1);
  const svEl  = document.getElementById('nw-tab-savings-val');
  const sbEl  = document.getElementById('nw-tab-savings-bar');
  const ivEl  = document.getElementById('nw-tab-inv-val');
  const ibEl  = document.getElementById('nw-tab-inv-bar');
  const dvEl  = document.getElementById('nw-tab-debt-val');
  const dbEl  = document.getElementById('nw-tab-debt-bar');
  if (svEl) svEl.textContent = sym + savings.toLocaleString();
  if (sbEl) setTimeout(() => { sbEl.style.width = Math.round((savings/total)*100) + '%'; }, 100);
  if (ivEl) ivEl.textContent = sym + investments.toLocaleString();
  if (ibEl) setTimeout(() => { ibEl.style.width = Math.round((investments/total)*100) + '%'; }, 100);
  if (dvEl) dvEl.textContent = sym + debt.toLocaleString();
  if (dbEl) setTimeout(() => { dbEl.style.width = Math.round((debt/total)*100) + '%'; }, 100);

  // ── HISTORY CHART ──
  const noteEl = document.getElementById('nw-tab-chart-note');
  const canvas = document.getElementById('nw-tab-chart');
  // FULL-J-1 (audit 2026-05-28) — toggle the inline backfill form visibility
  // based on history length. Form lives in dashboard.html (#nw-backfill-form),
  // shown ONLY when we lack the 2 entries Chart.js needs to draw a line. Once
  // user backfills (or auto-logger accumulates entries over multiple days),
  // the form disappears and the chart renders normally.
  const bfFormEl = document.getElementById('nw-backfill-form');
  if (canvas) {
    if (history.length < 2) {
      // FULL-J-1 — empty chart note now reinforces the form below it. The
      // form does the actual heavy lifting; the note just sets context.
      if (noteEl) noteEl.textContent = (history.length === 0)
        ? 'No entries yet — add some past entries below, or come back tomorrow.'
        : 'Chart needs at least 2 entries — add one or more past entries below.';
      if (nwTabChart) { nwTabChart.destroy(); nwTabChart = null; }
      if (bfFormEl) bfFormEl.style.display = 'block';
    } else {
      if (noteEl) noteEl.textContent = '';
      // FULL-J-1 — hide the backfill form; chart renders below.
      if (bfFormEl) bfFormEl.style.display = 'none';
      const labels = history.map(h => {
        const d = new Date(h.date);
        return d.toLocaleDateString('en-GB', { day:'numeric', month:'short' });
      });
      const nwData     = history.map(h => h.netWorth);
      const assetsData = history.map(h => h.assets);
      const debtData   = history.map(h => h.debt);

      if (nwTabChart) nwTabChart.destroy();
      nwTabChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Net worth',
              data: nwData,
              borderColor: '#2BB67D',
              backgroundColor: 'rgba(43,182,125,0.08)',
              borderWidth: 2,
              pointRadius: 3,
              pointHoverRadius: 5,
              pointBackgroundColor: '#2BB67D',
              tension: 0.4,
              fill: true,
            },
            {
              label: 'Assets',
              data: assetsData,
              borderColor: '#3B82F6',
              borderWidth: 1.5,
              borderDash: [4, 3],
              pointRadius: 0,
              tension: 0.4,
              fill: false,
            },
            {
              label: 'Debt',
              data: debtData,
              borderColor: '#E05252',
              borderWidth: 1.5,
              borderDash: [4, 3],
              pointRadius: 0,
              tension: 0.4,
              fill: false,
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              display: true,
              position: 'top',
              align: 'end',
              labels: { color: '#B8C2BC', font: { size: 11 }, boxWidth: 12, boxHeight: 2, padding: 10 }
            },
            tooltip: {
              backgroundColor: '#16271F',
              borderColor: 'rgba(255,255,255,0.1)',
              borderWidth: 1,
              titleColor: '#F0EDE2',
              bodyColor: '#B8C2BC',
              callbacks: {
                label: ctx => ' ' + ctx.dataset.label + ': ' + sym + Math.round(ctx.parsed.y).toLocaleString()
              }
            }
          },
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#4A5A6E', font: { size: 10 } } },
            y: {
              grid: { color: 'rgba(255,255,255,0.04)' },
              ticks: { color: '#4A5A6E', font: { size: 10 },
                callback: v => sym + (Math.abs(v) >= 1000 ? (v/1000).toFixed(0)+'k' : v)
              }
            }
          }
        }
      });
    }
  }

  // ── MILESTONES ──
  const milestonesEl = document.getElementById('nw-tab-milestones');
  if (milestonesEl) {
    const milestones = [0, 1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000];
    const labels_ms  = ['Break even','$1K','$5K','$10K','$25K','$50K','$100K','$250K','$500K','$1M'];
    milestonesEl.innerHTML = milestones.map((m, i) => {
      const reached = nw >= m;
      const isNext  = !reached && milestones.slice(0, i).every((prev, pi) => nw >= prev);
      const pct     = isNext && i > 0 ? Math.min(100, Math.round(((nw - milestones[i-1]) / (m - milestones[i-1])) * 100)) : 0;
      return `<div style="background:${reached ? 'rgba(43,182,125,0.08)' : isNext ? 'rgba(245,166,35,0.07)' : 'rgba(255,255,255,0.03)'};border:1px solid ${reached ? 'rgba(43,182,125,0.2)' : isNext ? 'rgba(245,166,35,0.2)' : 'rgba(255,255,255,0.06)'};border-radius:10px;padding:10px 14px;min-width:90px;flex:1;">
        <div style="font-size:10px;color:${reached ? 'var(--teal)' : isNext ? 'var(--amber)' : 'var(--text3)'};margin-bottom:3px;">${reached ? '✓' : isNext ? '→' : '○'} ${labels_ms[i]}</div>
        <div style="font-size:11px;color:var(--text3);">${reached ? 'Reached' : isNext ? pct + '% there' : 'Locked'}</div>
        ${isNext ? `<div style="height:3px;background:rgba(255,255,255,0.06);border-radius:2px;margin-top:5px;overflow:hidden;"><div style="height:100%;width:${pct}%;background:var(--amber);border-radius:2px;"></div></div>` : ''}
      </div>`;
    }).join('');
  }
}

(function logNWSnapshot() {
  // NW-CRITICAL fix (2026-05-29) — defer until the encrypted cache is warm and
  // the canonical user profile is loaded. Pre-fix this IIFE ran SYNCHRONOUSLY at
  // page load, when getJSON('nw_history') returns null (a cold cache cannot
  // decrypt the AES envelope) and PFCAuth.getUserId() may still be 'guest'. The
  // merged single-entry write then clobbered the real history (via
  // PFCStorage.set()'s synchronous plaintext mirror) or stranded it in
  // pfc:guest:nw_history, so /net-worth showed "Days tracked: 1" forever.
  // PFCUser.onReady fires only after BOTH auth resolves AND storage warms,
  // guaranteeing the correct user namespace + a decryptable cache.
  function run() {
  try {
    const u           = (typeof loadUser === 'function') ? loadUser() : USER;
    const savings     = u.savings || 0;
    const investments = u.investments || 0;
    const debt        = u.debt || 0;
    const assets      = savings + investments;
    const netWorth    = assets - debt;
    if (assets === 0 && debt === 0) return;

    // NW-P1-2 fix — local date, not UTC. Pre-fix toISOString slice gave a
    // UTC date that disagreed with net-worth-2.js's _localToday on the
    // cleared-on string compare, leaving cross-page ghost re-log possible
    // for users in non-UTC zones. Now both writers compute the same local
    // YYYY-MM-DD string.
    const _d = new Date();
    const today = _d.getFullYear() + '-' +
      String(_d.getMonth() + 1).padStart(2, '0') + '-' +
      String(_d.getDate()).padStart(2, '0');
    // NW-P0-2 cross-page guard — if the user just cleared history (from
    // net-worth.html clearHistory), don't re-log today's entry from the
    // dashboard auto-logger either. Must match the same guard in
    // net-worth-2.js logTodaySnapshot to prevent cross-page ghost-re-log.
    try {
      const clearedOn = PFCStorage.getJSON('nw_history_cleared_on');
      if (clearedOn === today) return;
    } catch (_) {}
    let history = [];
    try { history = PFCStorage.getJSON('nw_history') || []; } catch(e) {}

    // NW-P1-1 cross-page guard — manual entries always win. Pre-fix the
    // dashboard writer keyed on (date, source='auto') so a manual entry
    // logged on net-worth.html would coexist with this auto row on the
    // same day, producing duplicate rows in the history table.
    const entry = { date: today, netWorth, assets, savings, investments, debt, source: 'auto' };
    const anyToday = history.findIndex(h => h.date === today);
    if (anyToday >= 0 && history[anyToday].source === 'manual') return;
    if (anyToday >= 0) history[anyToday] = entry;
    else history.push(entry);

    history.sort((a, b) => a.date.localeCompare(b.date));
    // NW-P0-1 fix (audit 2026-05-24) — the 365-cap silently truncated
    // backfilled manual entries written by net-worth-2.js saveManualEntry
    // (which had no cap of its own). User reports: "I added an entry for
    // 2024-01-15 and it disappeared after reloading dashboard." Pro/Founders
    // were also sold "forever history" on the landing page, but the cap
    // contradicted that promise.
    //
    // Resolution: 10-year backstop (3650 daily entries). At 10y the encrypted
    // payload is ~440KB — sub-ms to re-encrypt on modern hardware, well under
    // localStorage's 5MB cap. All 3 nw_history writers (this one,
    // net-worth-2.js logTodaySnapshot, net-worth-2.js saveManualEntry) now
    // share the same cap to prevent one writer truncating another's data.
    if (history.length > 3650) history = history.slice(-3650);
    PFCStorage.setJSON('nw_history', history);
  } catch(e) {}
  }
  // Schedule run() once the user profile + encrypted storage are both ready.
  // PFCUser.onReady fires after _onBothReady (auth + storage). The fallbacks
  // keep the logger working on pages/builds where PFCUser is absent.
  if (typeof PFCUser !== 'undefined' && typeof PFCUser.onReady === 'function') {
    PFCUser.onReady(run);
  } else if (typeof PFCStorage !== 'undefined' && typeof PFCStorage.onReady === 'function') {
    PFCStorage.onReady(run);
  } else if (typeof PFCStorage !== 'undefined' && typeof PFCStorage.isReady === 'function' && PFCStorage.isReady()) {
    // Explicit (security-review finding #2): only run synchronously if storage
    // is actually present AND warm. If PFCStorage is absent/cold here, skip
    // logging entirely rather than risk an unguarded write — the next page load
    // with a warm cache will capture today's snapshot.
    run();
  }
})();

// FULL-J-1 (audit 2026-05-28) — inline backfill handler. Wired from
// dashboard.html via `data-pfc-on-click="nwBackfillSubmit"` (pfc-inline-
// bootstrap.js resolves the name to `window.nwBackfillSubmit` per its
// canonical pattern at line 28: `var fn = window[name]`).
//
// Contract:
//   - Reads 3 (date, amount) rows from the form
//   - Empty rows are silently skipped (user fills 1-3 as needed)
//   - Validates each non-empty row: ISO date format, date strictly < today,
//     date >= 2000-01-01, amount finite + non-negative + under 1 trillion
//   - On any row failing validation: error message, NO writes (atomic-or-nothing)
//   - On success: merges into nw_history using the SAME canonical pattern as
//     the logNWSnapshot IIFE above — manual entries replace existing same-date
//     entries (manual wins over auto, matching net-worth-2.js saveManualEntry)
//   - Sorts + caps at 3650 entries (10y), matching the auto-logger
//   - Re-renders the dashboard via renderNWTab() so the chart appears immediately
//
// Security review (FULL-J-1):
//   - User input never reaches innerHTML (all DOM writes use textContent or
//     value, both safe from XSS)
//   - Amount cap at 1e12 prevents number overflow / display breakage
//   - Date regex prevents prototype-pollution-style keys
//   - No network call — purely client-side localStorage write
//   - No PII in any console output (we don't log)
window.nwBackfillSubmit = function nwBackfillSubmit() {
  var msgEl = document.getElementById('nw-backfill-msg');
  function setMsg(text, isErr) {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.style.color = isErr ? 'var(--red)' : 'var(--teal)';
  }

  // Gather non-empty rows. We accept partial fills (e.g. only row 1 + row 3).
  var rows = [];
  for (var i = 1; i <= 3; i++) {
    var dateEl   = document.querySelector('[data-bf-date="' + i + '"]');
    var amountEl = document.querySelector('[data-bf-amount="' + i + '"]');
    if (!dateEl || !amountEl) continue;
    var dateRaw   = String(dateEl.value || '').trim();
    var amountRaw = String(amountEl.value || '').trim();
    if (!dateRaw && !amountRaw) continue; // both blank — skip
    rows.push({ index: i, dateRaw: dateRaw, amountRaw: amountRaw });
  }
  if (rows.length === 0) {
    setMsg('Fill at least one row to backfill (need 2+ total entries for chart).', true);
    return;
  }

  // Build today's local YYYY-MM-DD the same way the IIFE does (NW-P1-2 fix).
  var _d = new Date();
  var todayStr = _d.getFullYear() + '-' +
    String(_d.getMonth() + 1).padStart(2, '0') + '-' +
    String(_d.getDate()).padStart(2, '0');
  var ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  var MIN_DATE = '2000-01-01';
  var MAX_AMOUNT = 1e12;

  // Validate every non-empty row BEFORE any write (atomic).
  var entries = [];
  for (var k = 0; k < rows.length; k++) {
    var row = rows[k];
    if (!row.dateRaw || !ISO_DATE_RE.test(row.dateRaw)) {
      setMsg('Row ' + row.index + ': pick a valid date.', true);
      return;
    }
    if (row.dateRaw >= todayStr) {
      setMsg('Row ' + row.index + ': date must be in the past (today is auto-logged).', true);
      return;
    }
    if (row.dateRaw < MIN_DATE) {
      setMsg('Row ' + row.index + ': date must be after ' + MIN_DATE + '.', true);
      return;
    }
    if (!row.amountRaw) {
      setMsg('Row ' + row.index + ': enter a net worth amount.', true);
      return;
    }
    var amount = parseFloat(row.amountRaw);
    if (!isFinite(amount) || amount < 0 || amount > MAX_AMOUNT) {
      setMsg('Row ' + row.index + ': enter a positive number under 1 trillion.', true);
      return;
    }
    // Round to 2 decimal places (avoid floating-point cruft in storage).
    amount = Math.round(amount * 100) / 100;
    entries.push({
      date: row.dateRaw,
      netWorth: amount,
      assets: amount,
      savings: amount,
      investments: 0,
      debt: 0,
      source: 'manual',
    });
  }

  // NW-CRITICAL fix (2026-05-29) — same isReady gate as the auto-loggers
  // (security-review finding #4). nwBackfillSubmit reads-merges-writes
  // nw_history directly; if the encrypted cache were still cold (the AES
  // envelope can't be decrypted → get() returns null), the merge would start
  // from [] and the setJSON below would CLOBBER the real history. In practice
  // this fires only from a user form submit (post-warm), but guarding here
  // closes the TOCTOU window and gives the user a clear retry message instead
  // of silent data loss.
  if (typeof PFCStorage === 'undefined' ||
      typeof PFCStorage.isReady !== 'function' || !PFCStorage.isReady()) {
    setMsg('Still loading your secure data — please wait a moment and try again.', true);
    return;
  }

  // Merge into existing history (canonical pattern from logNWSnapshot IIFE
  // above). Manual entries replace existing entries on the same date,
  // matching net-worth-2.js saveManualEntry semantics.
  var history = [];
  try { history = JSON.parse(PFCStorage.get('nw_history') || '[]'); } catch (e) {}
  for (var j = 0; j < entries.length; j++) {
    var entry = entries[j];
    var existing = -1;
    for (var m = 0; m < history.length; m++) {
      if (history[m].date === entry.date) { existing = m; break; }
    }
    if (existing >= 0) history[existing] = entry;
    else history.push(entry);
  }
  history.sort(function (a, b) { return a.date.localeCompare(b.date); });
  // Same 3650-day cap as the auto-logger (NW-P0-1).
  if (history.length > 3650) history = history.slice(-3650);
  try {
    PFCStorage.setJSON('nw_history', history);
  } catch (e) {
    setMsg('Could not save entries (storage error). Try again.', true);
    return;
  }

  setMsg('Added ' + entries.length + ' ' + (entries.length === 1 ? 'entry' : 'entries') + '. Chart updating...', false);

  // Clear inputs so user knows it worked.
  for (var n = 1; n <= 3; n++) {
    var de = document.querySelector('[data-bf-date="' + n + '"]');
    var ae = document.querySelector('[data-bf-amount="' + n + '"]');
    if (de) de.value = '';
    if (ae) ae.value = '';
  }

  // Trigger dashboard re-render so the chart appears immediately.
  // setTimeout 50ms gives the success message a tick to render before
  // renderNWTab() potentially hides this whole form (history >= 2 now).
  setTimeout(function () {
    try {
      if (typeof renderNWTab === 'function') renderNWTab();
    } catch (_) { /* swallow */ }
  }, 50);
};
