// ── STATE ──
let USER = {};
let HISTORY = []; // [{ date, netWorth, assets, savings, investments, debt, source }]
let nwChart = null;
let currentPeriod = 'all';

const MILESTONES = [
  { val: 0,      label: 'Break even',    emoji: '🎯', hint: 'Assets equal liabilities' },
  { val: 1000,   label: '$1,000',        emoji: '🌱', hint: 'First thousand — the hardest one' },
  { val: 5000,   label: '$5,000',        emoji: '⚡', hint: 'Building real momentum' },
  { val: 10000,  label: '$10,000',       emoji: '🔥', hint: 'Five-figure net worth' },
  { val: 25000,  label: '$25,000',       emoji: '💪', hint: 'Serious wealth foundation' },
  { val: 50000,  label: '$50,000',       emoji: '🚀', hint: 'Half a century milestone' },
  { val: 100000, label: '$100,000',      emoji: '💯', hint: 'Six-figure territory' },
  { val: 250000, label: '$250,000',      emoji: '👑', hint: 'Financial independence zone begins' },
  { val: 500000, label: '$500,000',      emoji: '🏆', hint: 'Half a million — elite tier' },
  { val: 1000000,label: '$1,000,000',    emoji: '💎', hint: 'Millionaire status' },
];

// ── INIT ──
// Centralised currency normaliser. settings.html historically wrote ISO
// codes ("USD", "MUR") while onboarding wrote symbols ("₨"). Without this
// helper, every $ display on net-worth would show as "MUR3,000" for users
// who touched Settings. Called from every USER-load path on this page.
function _normaliseUserCurrency(u) {
  if (u && typeof PFCCurrency !== 'undefined' && PFCCurrency.toSymbol) {
    u.currency = PFCCurrency.toSymbol(u.currency);
  }
  return u;
}

function init() {
  // PFCUser is the central USER store; falls back to PFCStorage if the
  // pfc-user.js tag failed to load.
  if (typeof PFCUser !== 'undefined') {
    try { USER = _normaliseUserCurrency(PFCUser.get()); } catch(e) { USER = {}; }
  } else {
    try { USER = _normaliseUserCurrency(PFCStorage.getJSON('user') || {}); } catch(e) { USER = {}; }
  }
  try { HISTORY = PFCStorage.getJSON('nw_history') || []; } catch(e) { HISTORY = []; }

  // Sidebar user-pill hydrated by js/pfc-sidebar.js;
  // plan badge by PFCPlan.applyBadges().

  // Auto-log today's snapshot from USER data (same as dashboard does)
  logTodaySnapshot();

  renderAll();
}

// ── LOG TODAY (called on page load — same function dashboard calls) ──
function logTodaySnapshot() {
  const savings     = USER.savings || 0;
  const investments = USER.investments || 0;
  const debt        = USER.debt || 0;
  const assets      = savings + investments;
  const netWorth    = assets - debt;

  if (assets === 0 && debt === 0) return; // nothing to log yet

  const today = new Date().toISOString().slice(0, 10);

  // Only log once per day (replace same-day entry)
  const idx = HISTORY.findIndex(h => h.date === today && h.source === 'auto');
  const entry = { date: today, netWorth, assets, savings, investments, debt, source: 'auto' };

  if (idx >= 0) HISTORY[idx] = entry;
  else HISTORY.push(entry);

  // Sort by date ascending
  HISTORY.sort((a, b) => a.date.localeCompare(b.date));
  PFCStorage.setJSON('nw_history', HISTORY);
}

// ── EMPTY vs POPULATED STATE TOGGLE ──
// When HISTORY is empty, the page collapses to a single focal CTA (the archival
// hero card). When even one entry exists, the full timeline UI returns. This is
// the core differentiator that prevents /net-worth from reading as "another
// dashboard" with broken-looking placeholder cards.
function applyEmptyOrPopulatedState() {
  const isEmpty = !HISTORY.length;
  const archiveEmpty = document.getElementById('archive-empty');
  const populatedIds = ['nw-strip', 'nw-chart-card', 'nw-methodology', 'nw-breakdown', 'nw-history-grid'];

  if (archiveEmpty) archiveEmpty.style.display = isEmpty ? 'block' : 'none';
  populatedIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (isEmpty) {
      el.style.display = 'none';
    } else {
      // Restore each element's natural display value (grid for the two grids,
      // block for the rest — "" lets the stylesheet decide).
      el.style.display = '';
    }
  });
}

// ── RENDER ALL ──
function renderAll() {
  applyEmptyOrPopulatedState();

  const sym = window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$');
  const fmt = v => (v < 0 ? '-' : '') + sym + Math.abs(Math.round(v)).toLocaleString();

  const filtered = getPeriodData();
  const latest = HISTORY.length ? HISTORY[HISTORY.length - 1] : null;
  const prev    = HISTORY.length > 1 ? HISTORY[HISTORY.length - 2] : null;
  const first   = HISTORY.length ? HISTORY[0] : null;

  // Summary strip
  if (latest) {
    const nw = latest.netWorth;
    document.getElementById('m-current').textContent = fmt(nw);
    document.getElementById('m-current').style.color = nw >= 0 ? 'var(--teal)' : 'var(--red)';
    document.getElementById('m-assets').textContent = fmt(latest.assets || 0);
    document.getElementById('m-liabilities').textContent = fmt(latest.debt || 0);

    const growth = first ? nw - first.netWorth : 0;
    document.getElementById('m-growth').textContent = (growth >= 0 ? '+' : '') + fmt(growth);
    document.getElementById('m-growth').style.color = growth >= 0 ? 'var(--amber)' : 'var(--red)';

    if (prev) {
      const delta = nw - prev.netWorth;
      const deltaEl = document.getElementById('m-current-delta');
      deltaEl.innerHTML = `<span class="${delta >= 0 ? 'delta-up' : 'delta-down'}">${delta >= 0 ? '↑' : '↓'} ${fmt(Math.abs(delta))} since last entry</span>`;
    } else {
      document.getElementById('m-current-delta').innerHTML = '<span class="delta-flat">First entry recorded</span>';
    }

    // Topbar
    const since = first && first.date !== latest.date
      ? ` · +${fmt(growth)} since ${formatDateShort(first.date)}`
      : '';
    document.getElementById('topbar-sub').textContent = `Current: ${fmt(nw)}${since}`;

    // Breakdown
    renderBreakdown(latest, sym, fmt, prev);
  } else {
    document.getElementById('topbar-sub').textContent = 'No entries yet';
    ['m-current','m-assets','m-liabilities','m-growth'].forEach(id => document.getElementById(id).textContent = '—');
  }

  // Chart
  renderChart(filtered);

  // Milestones
  renderMilestones(latest?.netWorth ?? null, sym);

  // History table
  renderHistory(sym, fmt);

  // Projections
  renderProjections(latest, sym, fmt);
}

// ── BREAKDOWN ──
function renderBreakdown(latest, sym, fmt, prev) {
  const savings = latest.savings || 0;
  const invest  = latest.investments || 0;
  const debt    = latest.debt || 0;
  const total   = Math.max(savings + invest + debt, 1);

  document.getElementById('b-savings').textContent = fmt(savings);
  document.getElementById('b-invest').textContent  = fmt(invest);
  document.getElementById('b-debt').textContent    = fmt(debt);

  document.getElementById('b-savings-bar').style.width = Math.round(savings / total * 100) + '%';
  document.getElementById('b-invest-bar').style.width  = Math.round(invest  / total * 100) + '%';
  document.getElementById('b-debt-bar').style.width    = Math.min(100, Math.round(debt / total * 100)) + '%';

  const ratio = debt > 0 ? ((savings + invest) / debt).toFixed(2) + 'x' : '∞';
  const ratioEl = document.getElementById('b-ratio');
  ratioEl.textContent = ratio;
  ratioEl.style.color = debt === 0 ? 'var(--teal)' : parseFloat(ratio) >= 1 ? 'var(--teal)' : 'var(--amber)';

  const monthlyChange = prev ? latest.netWorth - prev.netWorth : null;
  const mcEl = document.getElementById('b-monthly-change');
  if (monthlyChange !== null) {
    mcEl.textContent = (monthlyChange >= 0 ? '+' : '') + fmt(monthlyChange);
    mcEl.style.color = monthlyChange >= 0 ? 'var(--teal)' : 'var(--red)';
  } else {
    mcEl.textContent = '—';
    mcEl.style.color = 'var(--text3)';
  }
}

// ── MILESTONES ──
function renderMilestones(currentNW, sym) {
  const el = document.getElementById('milestone-list');
  if (currentNW === null) { el.innerHTML = '<div style="color:var(--text3);font-size:13px;">Add entries to track milestone progress</div>'; return; }

  const reached = MILESTONES.filter(m => currentNW >= m.val);
  const lastReached = reached[reached.length - 1];
  const next = MILESTONES.find(m => currentNW < m.val);

  const items = [];

  // Show last 2 reached + next 3 upcoming
  const show = [...reached.slice(-2), ...(next ? MILESTONES.filter(m => currentNW < m.val).slice(0, 3) : [])];

  show.forEach(m => {
    const isReached = currentNW >= m.val;
    const isNext = m === next;
    const pct = isNext && lastReached ? Math.min(100, Math.round((currentNW - lastReached.val) / (m.val - lastReached.val) * 100)) : 0;
    const remaining = isNext ? m.val - currentNW : 0;

    items.push(`<div class="milestone-item ${isReached ? 'reached' : isNext ? 'next' : ''}">
      <div class="milestone-icon" style="background:${isReached ? 'rgba(43,182,125,0.12)' : isNext ? 'rgba(59,130,246,0.12)' : 'var(--bg3)'};">${m.emoji}</div>
      <div class="milestone-info">
        <div class="milestone-name">${m.label}</div>
        <div class="milestone-hint">${isNext ? sym + Math.round(remaining).toLocaleString() + ' to go · ' : ''}${m.hint}</div>
        ${isNext ? `<div class="milestone-progress-bar"><div class="milestone-progress-fill" style="width:${pct}%;"></div></div>` : ''}
      </div>
      <div class="milestone-badge" style="background:${isReached ? 'rgba(43,182,125,0.12)' : isNext ? 'rgba(59,130,246,0.12)' : 'var(--bg3)'};color:${isReached ? 'var(--teal)' : isNext ? 'var(--blue)' : 'var(--text3)'};">
        ${isReached ? '✓ Reached' : isNext ? `${pct}%` : 'Upcoming'}
      </div>
    </div>`);
  });

  el.innerHTML = items.join('');
}

// ── HISTORY TABLE ──
function renderHistory(sym, fmt) {
  const tbody = document.getElementById('history-body');
  if (!HISTORY.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:24px 20px;">No entries yet</td></tr>';
    return;
  }

  const reversedHistory = [...HISTORY].reverse();
  const rows = reversedHistory.map((h, i) => {
    const prev = reversedHistory[i + 1];
    const delta = prev ? h.netWorth - prev.netWorth : null;
    const deltaStr = delta !== null
      ? `<span style="color:${delta >= 0 ? 'var(--teal)' : 'var(--red)'};">${delta >= 0 ? '+' : ''}${fmt(delta)}</span>`
      : '<span style="color:var(--text3);">—</span>';

    return `<tr>
      <td style="padding:9px 20px;color:var(--text3);">${formatDateShort(h.date)}</td>
      <td style="padding:9px 20px;font-weight:600;color:${h.netWorth >= 0 ? 'var(--teal)' : 'var(--red)'};">${fmt(h.netWorth)}</td>
      <td style="padding:9px 20px;">${deltaStr}</td>
      <td style="padding:9px 20px;font-size:11px;color:var(--text3);">${h.source === 'auto' ? 'Auto' : 'Manual'}</td>
    </tr>`;
  });
  tbody.innerHTML = rows.join('');
}

// ── PROJECTIONS ──
function renderProjections(latest, sym, fmt) {
  const el = document.getElementById('projection-list');
  if (!latest) { el.innerHTML = '<div style="color:var(--text3);font-size:13px;">No data yet</div>'; return; }

  const monthlyGain = ((USER.income || 0) + (USER.otherIncome || 0)) -
    ((USER.housing || 0) + (USER.food || 0) + (USER.transport || 0) + (USER.otherExp || 0) + (USER.debtPay || 0));

  const nw = latest.netWorth;
  const milestones = [6, 12, 24, 36, 60];

  el.innerHTML = milestones.map(months => {
    const projected = nw + monthlyGain * months;
    const date = new Date(); date.setMonth(date.getMonth() + months);
    const dateStr = date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
    const change = projected - nw;
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--bg3);border-radius:var(--r-sm);">
      <div>
        <div style="font-size:13px;font-weight:600;">${dateStr}</div>
        <div style="font-size:11px;color:var(--text3);">in ${months} month${months>1?'s':''}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-family:var(--font-display);font-size:16px;font-weight:700;color:${projected >= 0 ? 'var(--teal)' : 'var(--red)'};">${fmt(projected)}</div>
        <div style="font-size:11px;color:${change >= 0 ? 'var(--teal)' : 'var(--red)'};">${change >= 0 ? '+' : ''}${fmt(change)}</div>
      </div>
    </div>`;
  }).join('');
}

// ── PERIOD FILTER ──
function getPeriodData() {
  if (currentPeriod === 'all' || !HISTORY.length) return HISTORY;
  const now = new Date();
  const cutoff = new Date();
  if (currentPeriod === '1m') cutoff.setMonth(now.getMonth() - 1);
  if (currentPeriod === '3m') cutoff.setMonth(now.getMonth() - 3);
  if (currentPeriod === '6m') cutoff.setMonth(now.getMonth() - 6);
  const cutStr = cutoff.toISOString().slice(0, 10);
  return HISTORY.filter(h => h.date >= cutStr);
}

function setPeriod(p, btn) {
  currentPeriod = p;
  document.querySelectorAll('.period-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  renderChart(getPeriodData());
}

// ── CHART ──
function renderChart(data) {
  const canvas = document.getElementById('nwChart');
  const emptyEl = document.getElementById('chart-empty');

  if (nwChart) { nwChart.destroy(); nwChart = null; }

  if (!data.length) {
    canvas.style.display = 'none';
    emptyEl.style.display = 'block';
    return;
  }

  canvas.style.display = 'block';
  emptyEl.style.display = 'none';

  const labels = data.map(h => formatDateShort(h.date));
  const nwData  = data.map(h => h.netWorth);
  const assData = data.map(h => h.assets || (h.savings + h.investments));
  const debtData = data.map(h => h.debt || 0);

  const sym = window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$');
  const fmt = v => sym + Math.round(Math.abs(v)).toLocaleString();

  nwChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Net worth',
          data: nwData,
          borderColor: '#2BB67D',
          backgroundColor: 'rgba(43,182,125,0.08)',
          borderWidth: 2.5,
          pointRadius: data.length < 20 ? 4 : 0,
          pointHoverRadius: 6,
          pointBackgroundColor: '#2BB67D',
          pointBorderColor: '#0F1410',
          pointBorderWidth: 2,
          tension: 0.35,
          fill: true,
          order: 1,
        },
        {
          label: 'Assets',
          data: assData,
          borderColor: '#3B82F6',
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderDash: [4, 3],
          pointRadius: 0,
          tension: 0.35,
          fill: false,
          order: 2,
        },
        {
          label: 'Debt',
          data: debtData,
          borderColor: '#E05252',
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderDash: [4, 3],
          pointRadius: 0,
          tension: 0.35,
          fill: false,
          order: 3,
        },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#16271F',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleColor: '#F0EDE2',
          bodyColor: '#B8C2BC',
          padding: 12,
          callbacks: {
            label: ctx => ' ' + ctx.dataset.label + ': ' + sym + Math.abs(Math.round(ctx.parsed.y)).toLocaleString(),
          }
        },
        // Milestone annotations drawn as horizontal lines
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#4A5A6E', font: { size: 10 }, maxTicksLimit: 10 }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: {
            color: '#4A5A6E', font: { size: 10 },
            callback: v => {
              const abs = Math.abs(v);
              const prefix = v < 0 ? '-' : '';
              if (abs >= 1000000) return prefix + sym + (abs/1000000).toFixed(1) + 'M';
              if (abs >= 1000)    return prefix + sym + (abs/1000).toFixed(0) + 'k';
              return prefix + sym + abs;
            }
          }
        }
      }
    }
  });
}

// ── MANUAL ENTRY MODAL ──
function openManualEntry() {
  // Pre-fill with current USER data
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('m-date').value = today;
  document.getElementById('m-savings').value = USER.savings || '';
  document.getElementById('m-invest').value = USER.investments || '';
  document.getElementById('m-debt').value = USER.debt || '';
  modalCalcNW();
  document.getElementById('manual-modal').classList.add('open');
}

function closeModal() {
  document.getElementById('manual-modal').classList.remove('open');
}

function modalCalcNW() {
  const savings = parseFloat(document.getElementById('m-savings').value) || 0;
  const invest  = parseFloat(document.getElementById('m-invest').value)  || 0;
  const debt    = parseFloat(document.getElementById('m-debt').value)    || 0;
  const nw = savings + invest - debt;
  const sym = window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$');
  const previewEl = document.getElementById('m-nw-preview');
  previewEl.textContent = (nw < 0 ? '-' : '') + sym + Math.abs(Math.round(nw)).toLocaleString();
  previewEl.style.color = nw >= 0 ? 'var(--teal)' : 'var(--red)';
  document.getElementById('m-preview').style.display = 'block';
}

function saveManualEntry() {
  const date    = document.getElementById('m-date').value;
  const savings = parseFloat(document.getElementById('m-savings').value) || 0;
  const invest  = parseFloat(document.getElementById('m-invest').value)  || 0;
  const debt    = parseFloat(document.getElementById('m-debt').value)    || 0;

  if (!date) { document.getElementById('m-date').style.borderColor = 'rgba(224,82,82,.5)'; return; }

  const entry = {
    date,
    netWorth: savings + invest - debt,
    assets: savings + invest,
    savings, investments: invest, debt,
    source: 'manual'
  };

  const idx = HISTORY.findIndex(h => h.date === date && h.source === 'manual');
  if (idx >= 0) HISTORY[idx] = entry;
  else HISTORY.push(entry);

  HISTORY.sort((a, b) => a.date.localeCompare(b.date));
  PFCStorage.setJSON('nw_history', HISTORY);

  renderAll();
  closeModal();
  showToast('Entry saved — ' + formatDateShort(date));
}

// ── EXPORT CSV ──
function exportCSV() {
  if (!HISTORY.length) { showToast('No data to export'); return; }
  const sym = window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$');
  const rows = [['Date','Net Worth','Assets','Savings','Investments','Debt','Source']];
  HISTORY.forEach(h => rows.push([h.date, h.netWorth, h.assets, h.savings, h.investments, h.debt, h.source]));
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'net-worth-history.csv'; a.click();
  URL.revokeObjectURL(url);
  showToast('Exported net worth history');
}

// ── CLEAR ──
function clearHistory() {
  if (!confirm('Clear all net worth history? This cannot be undone.')) return;
  HISTORY = [];
  PFCStorage.remove('nw_history');
  renderAll();
  showToast('History cleared');
}

// ── HELPERS ──
function formatDateShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = '✓ ' + msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 2800);
  setTimeout(() => t.remove(), 3200);
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ── START ──
init();

// ── AUTH-AWARE RE-HYDRATION ──
// init() ran synchronously at script-tag time, before PFCAuth resolved the real
// userId — so USER/HISTORY may reflect pfc:guest:* (often empty). Once auth
// resolves and pfc-storage.js finishes adoptGuestData, re-read from the now-
// correct namespace and re-render in place.
function _rehydrateFromStorage() {
  if (typeof PFCUser !== 'undefined') {
    try { USER = _normaliseUserCurrency(PFCUser.get()); } catch(e) { USER = {}; }
  } else {
    try { USER = _normaliseUserCurrency(PFCStorage.getJSON('user') || {}); } catch(e) { USER = {}; }
  }
  try { HISTORY = PFCStorage.getJSON('nw_history') || []; } catch(e) { HISTORY = []; }
  logTodaySnapshot();
  renderAll();
}
if (typeof PFCAuth !== 'undefined') {
  PFCAuth.onReady(() => {
    let freshUser = {}, freshHistory = [];
    try { freshUser = (typeof PFCUser !== 'undefined') ? PFCUser.get() : (PFCStorage.getJSON('user') || {}); } catch(e) {}
    try { freshHistory = PFCStorage.getJSON('nw_history') || []; } catch(e) {}
    if (JSON.stringify(freshUser) !== JSON.stringify(USER) ||
        JSON.stringify(freshHistory) !== JSON.stringify(HISTORY)) {
      _rehydrateFromStorage();
    }
  });
  PFCAuth.onAuthChange(_rehydrateFromStorage);
}
// Pick up cross-page edits (settings change, cash-forecast typed values, etc.)
if (typeof PFCUser !== 'undefined' && typeof PFCUser.onChange === 'function') {
  PFCUser.onChange(() => { try { _rehydrateFromStorage(); } catch (_) {} });
}
