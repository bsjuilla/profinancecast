// ── STATE ──
let USER = {};
let NW_HISTORY = [];
let REPORTS = [];
// H-P0-HONESTY-BILLING + H-P0-HONESTY-SAGE (audit 2026-05-25) — the BILLING
// and SAGE constants used to be loaded here from PFCStorage('billing_history')
// and PFCStorage('sage_history'). Neither key has any writer anywhere in
// the codebase, so those reads always returned [] and rendered fake "no
// activity" empty states. Both tabs are now honest static pointer cards
// (see history.html). Removed the dead state.
let nwHistoryChart = null;
let _resizeRaf = null;

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

// H-P0-MOB+A11Y+COMPAT — small SVG icons for the empty states. Pre-fix
// the empty states rendered emoji (📈 💳 📊 💬) which render differently
// across OS emoji fonts. These match the brand-aligned stroke/weight of
// PFCIcons and degrade gracefully under forced-colors mode (currentColor
// stroke). Same fix class as NW-P2-1 / G-P2-1 / SAGE-P0-E / RC-P1-1.
const EMPTY_ICONS = {
  networth: '<svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M5 24l6-8 5 4 5-9 6 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  reports:  '<svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect x="7" y="5" width="18" height="22" rx="2.5" stroke="currentColor" stroke-width="1.8"/><path d="M11 11h10M11 15h10M11 19h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
};

// ── INIT ──
// H-P0-AUTH-RACE fix (audit 2026-05-25) — pre-fix init() ran on
// DOMContentLoaded ALONE. PFCAuth had not yet resolved the user namespace,
// so PFCStorage.getJSON('nw_history') returned the GUEST namespace's empty
// array. The "no entries yet" empty state flashed for every authed user on
// every cold page-load until PFCAuth resolved, at which point NOTHING
// re-ran. Now we gate the first render on PFCAuth.onReady (when available)
// and re-render on PFCAuth.onAuthChange, exactly like NW-P0 / SAGE-P0-UX
// did for their respective surfaces.
function _loadAll() {
  USER       = (typeof PFCUser !== 'undefined' && PFCUser.get) ? (PFCUser.get() || {}) : (PFCStorage.getJSON('user') || {});
  NW_HISTORY = PFCStorage.getJSON('nw_history') || [];
  REPORTS    = PFCStorage.getJSON('report_history') || [];
}

function init() {
  _loadAll();
  bindTabs();
  activateTab(_activeTabName() || 'networth');
}

// Discover whichever tab is currently marked active in the DOM. Lets a
// re-render after PFCAuth resolves preserve the user's current tab choice.
function _activeTabName() {
  const active = document.querySelector('.tab-btn[data-tab].active');
  return active ? active.dataset.tab : null;
}

// ── TAB SWITCHING ──
// H-P0-STALE fix (audit 2026-05-25) — pre-fix renderedPanes was a Set that
// prevented any pane from re-rendering once it had been rendered ONCE per
// page load. If the user opened /net-worth in another tab, added a row,
// then came back to /history → switched away from net-worth and back, the
// chart showed stale data forever. Removed the cache: every activateTab
// call re-runs the renderer. Renderers are cheap and idempotent (Chart
// already calls .destroy() before recreating). Storage events also trigger
// a re-load + re-render (see _onStorageChanged below).
const PANE_RENDERERS = {
  networth: renderNetWorth,
  billing:  null, // H-P0-HONESTY-BILLING: pane is static HTML — no JS render
  reports:  renderReports,
  sage:     null, // H-P0-HONESTY-SAGE: pane is static HTML — no JS render
};

function bindTabs() {
  const tabs = Array.from(document.querySelectorAll('.tab-btn[data-tab]'));
  tabs.forEach((btn, idx) => {
    // H-P0-A11Y — aria-controls linking each button to its pane id.
    // The data-pane elements have no id attribute today; assign one
    // matching the data-tab name so screen readers announce the
    // relationship. Also set roving tabindex (active = 0, rest = -1).
    const paneName = btn.dataset.tab;
    const pane = document.querySelector(`.tab-pane[data-pane="${paneName}"]`);
    if (pane) {
      if (!pane.id) pane.id = 'history-pane-' + paneName;
      btn.setAttribute('aria-controls', pane.id);
    }
    btn.tabIndex = btn.classList.contains('active') ? 0 : -1;
    btn.addEventListener('click', () => activateTab(paneName));
    // H-P0-A11Y — arrow-key navigation per WAI-ARIA Authoring Practices
    // tab pattern: ArrowLeft / ArrowRight cycle through tabs, Home / End
    // jump to first / last. Activates the target tab on key press
    // (automatic activation pattern, since panes are cheap to render).
    btn.addEventListener('keydown', (e) => {
      let next = null;
      if (e.key === 'ArrowRight') next = tabs[(idx + 1) % tabs.length];
      else if (e.key === 'ArrowLeft') next = tabs[(idx - 1 + tabs.length) % tabs.length];
      else if (e.key === 'Home') next = tabs[0];
      else if (e.key === 'End') next = tabs[tabs.length - 1];
      if (next) {
        e.preventDefault();
        next.focus();
        activateTab(next.dataset.tab);
      }
    });
  });
}

function activateTab(name) {
  const tabs = Array.from(document.querySelectorAll('.tab-btn[data-tab]'));
  tabs.forEach(b => {
    const on = b.dataset.tab === name;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
    b.tabIndex = on ? 0 : -1; // H-P0-A11Y roving tabindex
  });
  document.querySelectorAll('.tab-pane[data-pane]').forEach(p => {
    p.classList.toggle('active', p.dataset.pane === name);
  });
  const renderer = PANE_RENDERERS[name];
  if (renderer) {
    renderer();
  } else if (!(name in PANE_RENDERERS)) {
    // H-P0-POLISH — warn loudly if someone adds a new tab without
    // wiring a renderer. Static panes (billing/sage) are intentionally
    // null and don't trigger this.
    // eslint-disable-next-line no-console
    console.warn('[history] No renderer mapping for tab "' + name + '"');
  }
  // H-P0-POLISH — was `setTimeout(resize, 50)` (a magic number that
  // raced fast tab switches). rAF runs on the next paint frame — strictly
  // after layout — so resize happens against the correct pane dimensions.
  if (name === 'networth' && nwHistoryChart) {
    if (_resizeRaf) cancelAnimationFrame(_resizeRaf);
    _resizeRaf = requestAnimationFrame(() => {
      _resizeRaf = null;
      try { nwHistoryChart.resize(); } catch (_) {}
    });
  }
}

// ── NET WORTH ──
function renderNetWorth() {
  // H-P0-PERF guard — Chart.js is now deferred, which means it's
  // guaranteed loaded by DOMContentLoaded, BUT a CDN failure would leave
  // `Chart` undefined. Render the table either way; only the chart bails.
  const canvas  = document.getElementById('nw-history-chart');
  const wrap    = document.getElementById('nw-chart-wrap');
  const emptyEl = document.getElementById('nw-empty');
  const tbody   = document.getElementById('nw-history-body');

  if (!Array.isArray(NW_HISTORY) || NW_HISTORY.length === 0) {
    if (wrap) wrap.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'block';
    if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:24px 22px;">No entries yet — visit your dashboard to auto-log.</td></tr>';
    return;
  }

  if (wrap) wrap.style.display = 'block';
  if (emptyEl) emptyEl.style.display = 'none';

  // Sort ascending for chart
  const sorted = [...NW_HISTORY].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const labels = sorted.map(h => formatDateShort(h.date));
  const nwData = sorted.map(h => h.netWorth || 0);

  const sym = window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$');

  if (typeof Chart === 'function' && canvas) {
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
  } else if (wrap) {
    // Chart.js failed to load — silent fallback, table still renders.
    wrap.style.display = 'none';
  }

  // Table — newest first
  if (tbody) {
    const rows = [...sorted].reverse().map((h, i) => {
      const prev = sorted[sorted.length - 1 - i - 1];
      const delta = prev ? (h.netWorth || 0) - (prev.netWorth || 0) : null;
      const deltaStr = delta !== null
        ? `<span style="color:${delta >= 0 ? 'var(--teal)' : 'var(--red)'};">${delta >= 0 ? '+' : ''}${escapeHtml(fmtMoney(delta, sym))}</span>`
        : '<span style="color:var(--text3);">—</span>';
      return `<tr>
        <td style="padding:9px 22px;color:var(--text3);">${escapeHtml(formatDateShort(h.date))}</td>
        <td style="padding:9px 22px;font-weight:600;color:${(h.netWorth||0) >= 0 ? 'var(--teal)' : 'var(--red)'};">${escapeHtml(fmtMoney(h.netWorth||0, sym))}</td>
        <td style="padding:9px 22px;">${deltaStr}</td>
        <td style="padding:9px 22px;font-size:11px;color:var(--text3);">${escapeHtml(h.source === 'auto' ? 'Auto' : 'Manual')}</td>
      </tr>`;
    });
    tbody.innerHTML = rows.join('');
  }
}

// ── REPORTS ──
function renderReports() {
  const list    = document.getElementById('reports-list');
  const emptyEl = document.getElementById('reports-empty');
  if (!list) return;

  if (!Array.isArray(REPORTS) || REPORTS.length === 0) {
    list.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';

  const sorted = [...REPORTS].sort((a, b) =>
    String(b.date || b.created_at || '').localeCompare(String(a.date || a.created_at || ''))
  );

  const sym = window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$');

  // H-P0-HONESTY-REPORTS fix (audit 2026-05-25) — pre-fix each row had a
  // "View →" link to `report-card.html?id=<idx>`. report-card.html does
  // NOT parse `?id=` (verified by grep — no URLSearchParams in
  // report-card-3.js). The link was a dead affordance. Replaced with an
  // inline snapshot rendering all the saved fields (date, grade, score,
  // net worth, surplus) so the entry is self-contained. Same UX class
  // as RC-P0-COPY (don't ship dishonest affordances).
  //
  // H-P0-SCORE-GRADE fix — respect r.grade if present (report-card-3.js
  // stores the full 12-grade scale: A+/A/A-/B+/...). Only fall back to
  // scoreToGrade() for legacy entries that lack the grade field. Pre-fix
  // history-2.js's 5-grade scoreToGrade() OVERWROTE the stored grade
  // when the field was missing, so an 'A+' report stored before this
  // batch could render 'A' on /history but 'A+' on /report-card.
  list.innerHTML = sorted.map((r) => {
    const date  = r.date || r.created_at || '';
    const score = (r.score != null) ? r.score : (r.overall != null ? r.overall : null);
    const grade = (typeof r.grade === 'string' && r.grade.trim())
      ? r.grade.trim()
      : (score != null ? scoreToGrade(score) : '—');
    const scoreStr = score != null ? `${score}/100` : '—';
    const nw      = (typeof r.nw === 'number' && Number.isFinite(r.nw)) ? r.nw : null;
    const surplus = (typeof r.surplus === 'number' && Number.isFinite(r.surplus)) ? r.surplus : null;
    const gradeColor = (typeof r.color === 'string' && r.color.charAt(0) === '#') ? r.color : 'var(--teal)';
    const nwLine = (nw !== null)
      ? `Net worth ${escapeHtml(fmtMoney(nw, sym))}`
      : '';
    const surplusLine = (surplus !== null)
      ? `Monthly surplus ${escapeHtml(fmtMoney(surplus, sym))}`
      : '';
    const meta = [escapeHtml(formatDateTime(date)), nwLine, surplusLine].filter(Boolean).join(' · ');
    return `<div class="list-row">
      <div style="font-family:var(--font-display);font-size:22px;font-weight:800;width:48px;text-align:center;color:${escapeHtml(gradeColor)};flex-shrink:0;" aria-label="Grade ${escapeHtml(grade)}">${escapeHtml(grade)}</div>
      <div class="list-row-meta">
        <div class="list-row-title">Report Card · ${escapeHtml(scoreStr)}</div>
        <div class="list-row-sub">${meta}</div>
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

// H-P0-STALE — Cross-page sync: when another tab writes to nw_history or
// report_history, refresh state + re-render. PFCStorage events fire
// across same-origin tabs natively via the `storage` window event.
function _onStorageChanged(e) {
  if (!e || !e.key) return;
  if (e.key.indexOf('nw_history') === -1 &&
      e.key.indexOf('report_history') === -1 &&
      e.key.indexOf('user') === -1) {
    return;
  }
  _loadAll();
  const active = _activeTabName();
  if (active && PANE_RENDERERS[active]) PANE_RENDERERS[active]();
}

// ── START ──
// H-P0-AUTH-RACE — prefer PFCAuth.onReady (resolved user namespace) over
// raw DOMContentLoaded. If PFCAuth is missing (degraded path), still
// init on DOMContentLoaded as the fallback. PFCAuth.onAuthChange catches
// later sign-in/sign-out transitions and re-renders cleanly.
function _startWhenReady() {
  if (typeof PFCAuth !== 'undefined' && typeof PFCAuth.onReady === 'function') {
    PFCAuth.onReady(init);
    if (typeof PFCAuth.onAuthChange === 'function') {
      PFCAuth.onAuthChange(() => {
        _loadAll();
        const active = _activeTabName();
        if (active && PANE_RENDERERS[active]) PANE_RENDERERS[active]();
      });
    }
  } else {
    init();
  }
  window.addEventListener('storage', _onStorageChanged);
  // PFCUser.onChange handles same-tab user updates (settings, currency).
  if (typeof PFCUser !== 'undefined' && typeof PFCUser.onChange === 'function') {
    PFCUser.onChange(() => {
      _loadAll();
      const active = _activeTabName();
      if (active && PANE_RENDERERS[active]) PANE_RENDERERS[active]();
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _startWhenReady, { once: true });
} else {
  _startWhenReady();
}
