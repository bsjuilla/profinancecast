// ── STATE ──
let USER = {};
let NW_HISTORY = [];
let BILLING = [];
let REPORTS = [];
let SAGE = [];
let nwHistoryChart = null;

// ── HELPERS ──
function formatDateShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function fmtMoney(v, sym) {
  sym = sym || (window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$'));
  return (v < 0 ? '-' : '') + sym + Math.abs(Math.round(v)).toLocaleString();
}

// ── INIT ──
function init() {
  USER       = (typeof PFCUser !== 'undefined') ? PFCUser.get() : (PFCStorage.getJSON('user') || {});
  NW_HISTORY = PFCStorage.getJSON('nw_history') || [];
  BILLING    = PFCStorage.getJSON('billing_history') || [];
  REPORTS    = PFCStorage.getJSON('report_history') || [];
  SAGE       = PFCStorage.getJSON('sage_history') || [];

  bindTabs();
  activateTab('networth');
}

// ── TAB SWITCHING ──
const PANE_RENDERERS = {
  networth: () => renderNetWorth(),
  billing:  () => renderBilling(),
  reports:  () => renderReports(),
  sage:     () => renderSage(),
};
const renderedPanes = new Set();

function bindTabs() {
  document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  });
}

function activateTab(name) {
  document.querySelectorAll('.tab-btn[data-tab]').forEach(b => {
    const on = b.dataset.tab === name;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.querySelectorAll('.tab-pane[data-pane]').forEach(p => {
    p.classList.toggle('active', p.dataset.pane === name);
  });
  if (!renderedPanes.has(name)) {
    PANE_RENDERERS[name]?.();
    renderedPanes.add(name);
  } else if (name === 'networth' && nwHistoryChart) {
    setTimeout(() => nwHistoryChart.resize(), 50);
  }
}

// ── NET WORTH ──
function renderNetWorth() {
  const canvas  = document.getElementById('nw-history-chart');
  const wrap    = document.getElementById('nw-chart-wrap');
  const emptyEl = document.getElementById('nw-empty');
  const tbody   = document.getElementById('nw-history-body');

  if (!Array.isArray(NW_HISTORY) || NW_HISTORY.length === 0) {
    wrap.style.display = 'none';
    emptyEl.style.display = 'block';
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:24px 22px;">No entries yet — visit your dashboard to auto-log.</td></tr>';
    return;
  }

  wrap.style.display = 'block';
  emptyEl.style.display = 'none';

  // Sort ascending for chart
  const sorted = [...NW_HISTORY].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const labels = sorted.map(h => formatDateShort(h.date));
  const nwData = sorted.map(h => h.netWorth || 0);

  const sym = window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$');

  if (nwHistoryChart) { nwHistoryChart.destroy(); nwHistoryChart = null; }

  nwHistoryChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Net worth',
        data: nwData,
        borderColor: '#2BB67D',
        backgroundColor: 'rgba(43,182,125,0.08)',
        borderWidth: 2.5,
        pointRadius: sorted.length < 20 ? 4 : 0,
        pointHoverRadius: 6,
        pointBackgroundColor: '#2BB67D',
        pointBorderColor: '#0B0F17',
        pointBorderWidth: 2,
        tension: 0.35,
        fill: true,
      }]
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
            label: ctx => ' Net worth: ' + sym + Math.abs(Math.round(ctx.parsed.y)).toLocaleString(),
          }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#4A5A6E', font: { size: 10 }, maxTicksLimit: 10 } },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: {
            color: '#4A5A6E', font: { size: 10 },
            callback: v => {
              const abs = Math.abs(v); const prefix = v < 0 ? '-' : '';
              if (abs >= 1000000) return prefix + sym + (abs/1000000).toFixed(1) + 'M';
              if (abs >= 1000)    return prefix + sym + (abs/1000).toFixed(0) + 'k';
              return prefix + sym + abs;
            }
          }
        }
      }
    }
  });

  // Table — newest first
  const rows = [...sorted].reverse().map((h, i) => {
    const prev = sorted[sorted.length - 1 - i - 1];
    const delta = prev ? (h.netWorth || 0) - (prev.netWorth || 0) : null;
    const deltaStr = delta !== null
      ? `<span style="color:${delta >= 0 ? 'var(--teal)' : 'var(--red)'};">${delta >= 0 ? '+' : ''}${fmtMoney(delta, sym)}</span>`
      : '<span style="color:var(--text3);">—</span>';
    return `<tr>
      <td style="padding:9px 22px;color:var(--text3);">${formatDateShort(h.date)}</td>
      <td style="padding:9px 22px;font-weight:600;color:${(h.netWorth||0) >= 0 ? 'var(--teal)' : 'var(--red)'};">${fmtMoney(h.netWorth||0, sym)}</td>
      <td style="padding:9px 22px;">${deltaStr}</td>
      <td style="padding:9px 22px;font-size:11px;color:var(--text3);">${h.source === 'auto' ? 'Auto' : 'Manual'}</td>
    </tr>`;
  });
  tbody.innerHTML = rows.join('');
}

// ── BILLING ──
function renderBilling() {
  const tbody   = document.getElementById('billing-body');
  const emptyEl = document.getElementById('billing-empty');
  const wrap    = tbody.closest('div[style*="overflow-x"]');

  if (!Array.isArray(BILLING) || BILLING.length === 0) {
    if (wrap) wrap.style.display = 'none';
    emptyEl.style.display = 'block';
    return;
  }

  if (wrap) wrap.style.display = 'block';
  emptyEl.style.display = 'none';

  const sorted = [...BILLING].sort((a, b) =>
    String(b.date || b.created_at || '').localeCompare(String(a.date || a.created_at || ''))
  );

  const sym = window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$');
  tbody.innerHTML = sorted.map(b => {
    const date   = b.date || b.created_at || '';
    const plan   = b.plan || b.product || '—';
    const amount = (b.amount != null) ? fmtMoney(b.amount, b.currency || sym) : '—';
    const status = (b.status || 'paid').toLowerCase();
    const STATUS_PILL = { paid: '', failed: 'red', refunded: 'amber' };
    const pillClass = STATUS_PILL[status] ?? 'blue';
    return `<tr>
      <td style="padding:11px 22px;color:var(--text3);">${escapeHtml(formatDateShort(date))}</td>
      <td style="padding:11px 22px;color:var(--text);font-weight:500;">${escapeHtml(plan)}</td>
      <td style="padding:11px 22px;color:var(--text);font-weight:600;">${escapeHtml(amount)}</td>
      <td style="padding:11px 22px;"><span class="pill ${pillClass}">${escapeHtml(status)}</span></td>
    </tr>`;
  }).join('');
}

// ── REPORTS ──
function renderReports() {
  const list    = document.getElementById('reports-list');
  const emptyEl = document.getElementById('reports-empty');

  if (!Array.isArray(REPORTS) || REPORTS.length === 0) {
    list.innerHTML = '';
    emptyEl.style.display = 'block';
    return;
  }

  emptyEl.style.display = 'none';

  const sorted = [...REPORTS].sort((a, b) =>
    String(b.date || b.created_at || '').localeCompare(String(a.date || a.created_at || ''))
  );

  list.innerHTML = sorted.map((r, idx) => {
    const date  = r.date || r.created_at || '';
    const score = (r.score != null) ? r.score : (r.overall != null ? r.overall : null);
    const grade = r.grade || (score != null ? scoreToGrade(score) : '—');
    const id    = encodeURIComponent(r.id != null ? r.id : idx);
    const scoreStr = score != null ? `${score}/100` : '—';
    return `<div class="list-row">
      <div class="list-row-meta">
        <div class="list-row-title">Report Card · ${escapeHtml(grade)} · ${escapeHtml(scoreStr)}</div>
        <div class="list-row-sub">${escapeHtml(formatDateTime(date))}</div>
      </div>
      <div class="list-row-action">
        <a href="report-card.html?id=${id}" class="btn">View →</a>
      </div>
    </div>`;
  }).join('');
}

function scoreToGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

// ── SAGE CHATS ──
function renderSage() {
  const list    = document.getElementById('sage-list');
  const emptyEl = document.getElementById('sage-empty');

  if (!Array.isArray(SAGE) || SAGE.length === 0) {
    list.innerHTML = '';
    emptyEl.style.display = 'block';
    return;
  }

  emptyEl.style.display = 'none';

  const sorted = [...SAGE].sort((a, b) =>
    String(b.date || b.created_at || b.updated_at || '').localeCompare(String(a.date || a.created_at || a.updated_at || ''))
  );

  list.innerHTML = sorted.map((c, idx) => {
    const date = c.date || c.created_at || c.updated_at || '';
    // Find the first user/opening message
    let opening = c.opening || c.title || '';
    if (!opening && Array.isArray(c.messages) && c.messages.length) {
      const first = c.messages.find(m => (m.role === 'user' || m.from === 'user')) || c.messages[0];
      opening = first ? (first.content || first.text || '') : '';
    }
    if (!opening) opening = '(empty conversation)';
    const preview = opening.length > 80 ? opening.slice(0, 80) + '…' : opening;
    const id = encodeURIComponent(c.id != null ? c.id : idx);
    return `<div class="list-row">
      <div class="list-row-meta">
        <div class="list-row-title">${escapeHtml(preview)}</div>
        <div class="list-row-sub">${escapeHtml(formatDateTime(date))}</div>
      </div>
      <div class="list-row-action">
        <a href="sage.html?chat=${id}" class="btn">Reopen →</a>
      </div>
    </div>`;
  }).join('');
}

// ── START ──
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
