// ── STATE ──
let USER = {};
let HISTORY = []; // [{ date, netWorth, assets, savings, investments, debt, source }]
let nwChart = null;
let currentPeriod = 'all';

// NW-P0-3 fix (audit 2026-05-24) — HTML-escape helper (same pattern as
// dashboard-3.js _esc). Every value flowing into innerHTML on this page
// passes through this. Primary attack vector was currency-symbol injection:
// PFCCurrency.toSymbol(USER.currency) can return whatever the user typed in
// Settings; without escaping, a payload like `<img src=x onerror=alert(1)>`
// in the currency field rendered into every fmt() output across the page.
function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// NW-P1-6 fix (audit 2026-05-24) — custom confirm modal. iOS PWA
// standalone-mode Safari has known issues with window.confirm() (some
// versions render an invisible prompt that user can't dismiss). This
// promise-based helper renders a real DOM modal that behaves identically
// across browsers and PWAs.
//
// NW-P2-9 fix (audit 2026-05-24, P1 verifier carry-over) — focus
// restoration to the trigger element on close (a11y polish) + guard
// against listener leak if caller invokes _pfcConfirm twice without
// awaiting the first.
let _pfcConfirmActive = false;
function _pfcConfirm(message, okLabel) {
  return new Promise(function (resolve) {
    // NW-P2-9: guard against double-open. If a previous confirm is still
    // in flight, treat the new call as a cancel.
    if (_pfcConfirmActive) { resolve(false); return; }
    _pfcConfirmActive = true;
    const modal = document.getElementById('confirm-modal');
    const msgEl = document.getElementById('confirm-msg');
    const okBtn = document.getElementById('confirm-ok');
    const cancelBtn = document.getElementById('confirm-cancel');
    if (!modal || !msgEl || !okBtn || !cancelBtn) {
      // Final fallback if DOM nodes missing — old confirm() still works
      // outside PWA standalone mode.
      _pfcConfirmActive = false;
      resolve(window.confirm(message));
      return;
    }
    // NW-P2-9: remember focus target so we can restore on close.
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
      // NW-P2-9: restore focus to the triggering element so keyboard
      // users don't get teleported to <body>. Wrapped in try/catch
      // because the previous element may have been removed from DOM.
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

// NW-P1-2 fix (audit 2026-05-24) — local-date helper. Pre-fix every site
// used `new Date().toISOString().slice(0,10)` which returns UTC date. A
// user in UTC-7 opening at 9pm local saw tomorrow's date stamped on their
// auto-log; the period filter cut off entries from "the wrong day". This
// helper returns YYYY-MM-DD in the user's local timezone (same format).
function _localToday(d) {
  const dt = d instanceof Date ? d : new Date();
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

// NW-P1-12 fix (audit 2026-05-24) — milestone labels are currency-aware.
// Pre-fix the `.label` was hardcoded "$1,000" etc, so EUR/GBP/MUR users
// saw "$1,000" next to a € symbol elsewhere on the page. Now `.label` is
// a function that takes the rendered currency symbol and returns the
// localized label string.
//
// NW-P2-1 fix (audit 2026-05-24) — emoji icons (🎯🌱⚡🔥💪🚀💯👑🏆💎)
// clashed with "The Archive" editorial voice (Fraunces italic, leather
// ledger hero). Replaced with a single brand-aligned SVG icon set — the
// laurel sprig style mirrors the gold-accented archival aesthetic. The
// icon size scales by milestone tier (sm/md/lg) for visual hierarchy.
const _milestoneIcon = (tier) => {
  const size = tier === 'lg' ? 18 : tier === 'md' ? 16 : 14;
  // Laurel-style SVG mark (currentColor — inherits from .milestone-icon).
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
    '<path d="M8 2v12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>' +
    '<path d="M8 5c-1.5 0-2.5-.8-3-1.5M8 5c1.5 0 2.5-.8 3-1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>' +
    '<path d="M8 8c-1.8 0-3-1-3.5-1.8M8 8c1.8 0 3-1 3.5-1.8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>' +
    '<path d="M8 11c-2 0-3.3-1.2-3.8-2M8 11c2 0 3.3-1.2 3.8-2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>' +
    '</svg>';
};
const MILESTONES = [
  { val: 0,      label: ()    => 'Break even',                                    icon: 'sm', hint: 'Assets equal liabilities' },
  { val: 1000,   label: (sym) => sym + '1,000',                                   icon: 'sm', hint: 'First thousand — the hardest one' },
  { val: 5000,   label: (sym) => sym + '5,000',                                   icon: 'sm', hint: 'Building real momentum' },
  { val: 10000,  label: (sym) => sym + '10,000',                                  icon: 'md', hint: 'Five-figure net worth' },
  { val: 25000,  label: (sym) => sym + '25,000',                                  icon: 'md', hint: 'Serious wealth foundation' },
  { val: 50000,  label: (sym) => sym + '50,000',                                  icon: 'md', hint: 'Half a century milestone' },
  { val: 100000, label: (sym) => sym + '100,000',                                 icon: 'md', hint: 'Six-figure territory' },
  { val: 250000, label: (sym) => sym + '250,000',                                 icon: 'lg', hint: 'Financial independence zone begins' },
  { val: 500000, label: (sym) => sym + '500,000',                                 icon: 'lg', hint: 'Half a million — elite tier' },
  { val: 1000000,label: (sym) => sym + '1,000,000',                               icon: 'lg', hint: 'Millionaire status' },
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

  // Auto-log today's snapshot from USER data (same as dashboard does).
  // No-op until the encrypted cache is warm (see logTodaySnapshot guard).
  logTodaySnapshot();

  // NW-P2-5: catch up any milestone crossings that happened via the
  // dashboard auto-log writer between page visits (dashboard doesn't
  // have access to net-worth's showToast). Slight delay so the toast
  // appears after the page paints.
  if (HISTORY.length) {
    setTimeout(() => {
      const maxNW = Math.max.apply(null, HISTORY.map(h => h.netWorth));
      _celebrateIfCrossed(0, maxNW);
    }, 800);
  }

  // NW-CRITICAL fix (2026-05-29) — defer the FIRST paint until the encrypted
  // cache is warm, so a logged-in user with history doesn't flash the empty-
  // state archive card before their real data decrypts. For guests / browsers
  // without Web Crypto, isReady() is true synchronously so this paints
  // immediately (no regression). The post-warm onReady handler below always
  // re-renders with the canonical decrypted data.
  if (typeof PFCStorage === 'undefined' ||
      typeof PFCStorage.isReady !== 'function' ||
      PFCStorage.isReady()) {
    renderAll();
  }
}

// NW-P2-5 fix (audit 2026-05-24) — milestone-crossed celebration. The
// single biggest delight moment on a wealth tracker is crossing $10k,
// $100k, $1M etc. Pre-fix the badge silently flipped from "57%" to
// "✓ Reached" between sessions and the user got no feedback. Now: any
// write that pushes the all-time max past a milestone threshold fires
// a celebratory toast. Keyed on max-of-history (not the new entry value
// alone) so backfilled manual entries don't false-fire for milestones
// the user is already past.
//
// Storage: `nw_celebrated_at` tracks the highest milestone value already
// celebrated so we don't re-fire on re-render or page revisit.
function _celebrateIfCrossed(_prevMaxIgnored, newMaxNW) {
  // Check is based purely on `alreadyCelebrated` vs `newMaxNW` so that a
  // milestone crossed via the dashboard auto-log writer (which doesn't
  // fire toasts) still gets celebrated when the user next opens the
  // net-worth page. The first argument is kept for caller-readability.
  try {
    const alreadyCelebrated = PFCStorage.getJSON('nw_celebrated_at') || 0;
    const crossed = MILESTONES.filter(m =>
      m.val > 0 &&
      m.val > alreadyCelebrated &&
      m.val <= newMaxNW
    );
    if (!crossed.length) return;
    // Pick the highest milestone crossed for the toast (skip-tier-safe).
    const top = crossed[crossed.length - 1];
    const sym = _esc(window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$'));
    showToast('🌿 Milestone reached: ' + top.label(sym) + ' — ' + top.hint);
    PFCStorage.setJSON('nw_celebrated_at', top.val);
  } catch (_) {}
}

// ── LOG TODAY (called on page load — same function dashboard calls) ──
function logTodaySnapshot() {
  // NW-CRITICAL fix (2026-05-29) — never read-merge-write nw_history until the
  // encrypted cache is warm. ROOT CAUSE of "Days tracked: 1 — first entry
  // today" forever: init() (line ~941) calls this SYNCHRONOUSLY at script-load,
  // BEFORE PFCStorage warms its cache AND before PFCAuth resolves the real uid.
  // At that instant PFCStorage.getJSON('nw_history') returns null (a cold cache
  // cannot decrypt the AES envelope) and PFCAuth.getUserId() still returns
  // 'guest'. The old code therefore: (a) read HISTORY as [], then (b) wrote
  // today's single entry into pfc:GUEST:nw_history (stranding it — guest→user
  // adoption refuses to overwrite an existing user key), so the user's real
  // namespace never accumulated. Confirmed in production via console diagnostic:
  // pfc:{uid}:nw_history decrypts OK but holds only today; a stray
  // pfc:guest:nw_history exists alongside it. Gating on isReady() guarantees we
  // append to the REAL decrypted history under the correct user namespace. The
  // post-warm onReady / onAuthChange / onChange handlers re-invoke this once the
  // cache is warm, so deferring here loses nothing.
  if (typeof PFCStorage === 'undefined' ||
      typeof PFCStorage.isReady !== 'function' ||
      !PFCStorage.isReady()) {
    return;
  }
  // Re-read the canonical history from the now-warm cache so we always merge
  // into the real persisted series rather than a stale cold-init snapshot.
  try {
    const canonical = PFCStorage.getJSON('nw_history');
    if (Array.isArray(canonical)) HISTORY = canonical;
  } catch (_) {}

  const savings     = USER.savings || 0;
  const investments = USER.investments || 0;
  const debt        = USER.debt || 0;
  const assets      = savings + investments;
  const netWorth    = assets - debt;

  if (assets === 0 && debt === 0) return; // nothing to log yet

  const today = _localToday(); // NW-P1-2: local-date, not UTC

  // NW-P0-2 fix (audit 2026-05-24) — guard against the "clearHistory ghost
  // re-log" race. Without this, user clicks Clear all → renderAll shows
  // empty state → any subsequent PFCUser.onChange / PFCAuth.onAuthChange
  // triggers _rehydrateFromStorage → logTodaySnapshot → today's entry
  // reappears from USER data. User reports the Clear button as broken.
  //
  // Behaviour: if the user cleared history TODAY, skip auto-logging until
  // tomorrow (next dashboard visit). Persisted in localStorage so it
  // survives page reload. Cleared flag auto-expires when today's date
  // moves past the stored cleared-on date.
  try {
    const clearedOn = PFCStorage.getJSON('nw_history_cleared_on');
    if (clearedOn === today) return;
  } catch (_) {}

  // NW-P1-1 fix (audit 2026-05-24) — one row per date invariant. Pre-fix
  // logTodaySnapshot keyed on (date, source='auto') while saveManualEntry
  // keyed on (date, source='manual'), so both could write the same date
  // and the history table showed duplicate rows. Resolution: manual entries
  // always win — if ANY entry exists for today, auto-log is a no-op. User
  // intent (manual entry) is preserved over the background auto-logger.
  const anyToday = HISTORY.findIndex(h => h.date === today);
  if (anyToday >= 0 && HISTORY[anyToday].source === 'manual') return;

  // NW-P2-5: capture pre-write max for milestone-cross detection.
  const prevMax = HISTORY.length ? Math.max.apply(null, HISTORY.map(h => h.netWorth)) : 0;

  const entry = { date: today, netWorth, assets, savings, investments, debt, source: 'auto' };
  if (anyToday >= 0) HISTORY[anyToday] = entry;
  else HISTORY.push(entry);

  // Sort by date ascending
  HISTORY.sort((a, b) => a.date.localeCompare(b.date));
  // NW-P0-1 cap: keep the 3 nw_history writers (this one,
  // saveManualEntry below, dashboard-2.js logNWSnapshot IIFE) in lockstep
  // so neither writer truncates the other's data. 3650 = 10y daily backstop.
  if (HISTORY.length > 3650) HISTORY = HISTORY.slice(-3650);
  PFCStorage.setJSON('nw_history', HISTORY);

  // NW-P2-5: fire celebration toast if this write crossed a milestone.
  _celebrateIfCrossed(prevMax, Math.max.apply(null, HISTORY.map(h => h.netWorth)));
}

// ── EMPTY vs POPULATED STATE TOGGLE ──
// When HISTORY is empty, the page collapses to a single focal CTA (the archival
// hero card). When even one entry exists, the full timeline UI returns. This is
// the core differentiator that prevents /net-worth from reading as "another
// dashboard" with broken-looking placeholder cards.
function applyEmptyOrPopulatedState() {
  const isEmpty = !HISTORY.length;
  const archiveEmpty = document.getElementById('archive-empty');
  // NW-P2-7: nw-projection-card was split out of nw-history-grid into
  // its own wrapper so the entry-history table can span full-width.
  // Both must be toggled together when the page is empty.
  const populatedIds = ['nw-strip', 'nw-chart-card', 'nw-methodology', 'nw-breakdown', 'nw-history-grid', 'nw-projection-card'];

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

  const sym = _esc(window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$'));
  const fmt = v => (v < 0 ? '-' : '') + sym + Math.abs(Math.round(v)).toLocaleString();

  const filtered = getPeriodData();
  const latest = HISTORY.length ? HISTORY[HISTORY.length - 1] : null;
  const prev    = HISTORY.length > 1 ? HISTORY[HISTORY.length - 2] : null;
  const first   = HISTORY.length ? HISTORY[0] : null;

  // Summary strip — PROD-FIX-1 (2026-05-24): wrap if-latest in try/catch
  // so any single field render error (e.g. stale-cache JS referencing a
  // removed DOM ID) degrades gracefully instead of halting renderAll
  // before renderChart / renderHistory are reached. The bug class:
  // OLD cached JS hits `document.getElementById('m-assets').textContent`
  // where new HTML has no m-assets → null.textContent → TypeError → all
  // subsequent renders skipped. Screenshot from prod showed m-current
  // populated but everything after blank — this catch preserves the
  // chart + history rendering even if one KPI block fails.
  if (latest) {
    try {
    const nw = latest.netWorth;
    const cur = document.getElementById('m-current');
    if (cur) { cur.textContent = fmt(nw); cur.style.color = nw >= 0 ? 'var(--teal)' : 'var(--red)'; }

    // NW-P2-8: Days tracked — engagement metric (replaces total assets).
    // Total assets/liabilities are still rendered in the breakdown card below.
    const daysEl = document.getElementById('m-days');
    if (daysEl && first) {
      // Use local-date diff so timezones don't shift the count.
      const firstD = new Date(first.date + 'T12:00:00');
      const todayD = new Date(latest.date + 'T12:00:00');
      const days = Math.max(1, Math.round((todayD - firstD) / 86400000) + 1);
      daysEl.textContent = days.toLocaleString();
      const subEl = document.getElementById('m-days-sub');
      if (subEl) {
        subEl.innerHTML = '<span style="font-size:12px;color:var(--text3);">' +
          (HISTORY.length === 1 ? 'first entry today' :
           HISTORY.length + ' entries logged') + '</span>';
      }
    }

    // NW-P2-8: ATH — peak achievement (replaces total liabilities).
    const athEl = document.getElementById('m-ath');
    if (athEl) {
      const athVal = Math.max.apply(null, HISTORY.map(h => h.netWorth));
      const athEntry = HISTORY.find(h => h.netWorth === athVal);
      athEl.textContent = fmt(athVal);
      const athSubEl = document.getElementById('m-ath-sub');
      if (athSubEl && athEntry) {
        const atToday = athEntry.date === latest.date;
        athSubEl.innerHTML = '<span style="font-size:12px;color:' +
          (atToday ? 'var(--teal)' : 'var(--text3)') + ';">' +
          (atToday ? 'reached today — your peak' :
           'reached ' + _esc(formatDateShort(athEntry.date))) + '</span>';
      }
    }

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
    } catch (e) {
      // PROD-FIX-1: log but don't halt — chart/history/projections below
      // must still render even if a single KPI block crashed (e.g. stale
      // cached JS hitting a removed DOM ID).
      try { console.error('[net-worth] summary render failed:', e && e.message); } catch (_) {}
    }
  } else {
    document.getElementById('topbar-sub').textContent = 'No entries yet';
    // NW-P2-8 cleanup: m-assets + m-liabilities were replaced by m-days +
    // m-ath in the KPI strip; reset path must use the new IDs. Pre-fix
    // this threw TypeError on null.textContent on every empty-state render.
    // Also guard each lookup so future ID changes don't crash this branch.
    ['m-current','m-days','m-ath','m-growth'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '—';
    });
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
      <div class="milestone-icon" style="background:${isReached ? 'rgba(43,182,125,0.12)' : isNext ? 'rgba(59,130,246,0.12)' : 'var(--bg3)'};color:${isReached ? 'var(--teal)' : isNext ? 'var(--blue)' : 'var(--text3)'};">${_milestoneIcon(m.icon)}</div>
      <div class="milestone-info">
        <div class="milestone-name">${m.label(sym)}</div>
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
      <td class="nw-row-cell" style="color:var(--text3);">${formatDateShort(h.date)}</td>
      <td class="nw-row-cell" style="font-weight:600;color:${h.netWorth >= 0 ? 'var(--teal)' : 'var(--red)'};">${fmt(h.netWorth)}</td>
      <td class="nw-row-cell">${deltaStr}</td>
      <td class="nw-row-cell" style="font-size:11px;color:var(--text3);">${h.source === 'auto' ? 'Auto' : 'Manual'}</td>
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

  // NW-P1-3 fix (audit 2026-05-24) — pre-fix, negative monthlyGain
  // projected a linear nosedive ("you'll be -$72,000 in 60 months").
  // That's mathematically true but UX-hostile: users don't actually go
  // unlimited-negative — they course-correct long before then. Reframe as
  // a "negative trajectory" callout instead of a deepening projection.
  if (monthlyGain < 0) {
    const monthsToZero = nw > 0 ? Math.ceil(nw / Math.abs(monthlyGain)) : 0;
    const burnMsg = nw > 0 && monthsToZero > 0
      ? 'At ' + fmt(Math.abs(monthlyGain)) + '/mo deficit, your runway is ~' + monthsToZero + ' month' + (monthsToZero === 1 ? '' : 's') + ' before net worth reaches zero.'
      : 'Your monthly surplus is negative. Projections will resume once you log a positive surplus.';
    el.innerHTML =
      '<div style="padding:14px 16px;background:rgba(245,166,35,0.08);border:1px solid rgba(245,166,35,0.25);border-left:3px solid var(--amber);border-radius:var(--r-sm);">' +
        '<div style="font-size:13px;font-weight:600;color:var(--amber);margin-bottom:6px;">Negative trajectory — projections paused</div>' +
        '<div style="font-size:12px;line-height:1.5;color:var(--text2);">' + _esc(burnMsg) + ' ' +
        'Open <a href="debt-optimizer.html" style="color:var(--teal);text-decoration:none;">Debt strategy</a> or <a href="dashboard.html" style="color:var(--teal);text-decoration:none;">adjust your budget</a> to course-correct.</div>' +
      '</div>';
    return;
  }

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
  const cutStr = _localToday(cutoff); // NW-P1-2: local date for filter cutoff
  return HISTORY.filter(h => h.date >= cutStr);
}

function setPeriod(p, btn) {
  currentPeriod = p;
  // NW-P1-8: keep aria-pressed in sync with .active class so screen-reader
  // users know which period is currently selected.
  document.querySelectorAll('.period-tab').forEach(t => {
    t.classList.remove('active');
    t.setAttribute('aria-pressed', 'false');
  });
  if (btn) btn.setAttribute('aria-pressed', 'true');
  btn.classList.add('active');
  renderChart(getPeriodData());
}

// NW-P2-2 fix (audit 2026-05-24) — brand-aligned Chart.js defaults.
// Pre-fix net-worth-2.js renderChart hardcoded 4 hex literals (axis
// colors, tooltip bg/borders) that would drift from the design tokens
// over time. This IIFE applies the same defaults dashboard-2.js uses
// (DASH-P1-13), so renderChart can stay free of theme literals.
function _brandChartDefaults() {
  if (typeof Chart === 'undefined' || !Chart.defaults) return;
  try {
    Chart.defaults.font.family = "'Inter Tight', 'Inter', system-ui, sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.color = '#8A988F';           // matches --ink-3 token (WCAG AA)
    Chart.defaults.borderColor = 'rgba(244,239,229,0.06)';  // matches --line
    if (Chart.defaults.plugins && Chart.defaults.plugins.tooltip) {
      Chart.defaults.plugins.tooltip.backgroundColor = '#16271F';
      Chart.defaults.plugins.tooltip.titleColor = '#F0EDE2';
      Chart.defaults.plugins.tooltip.bodyColor = '#B8C2BC';
      Chart.defaults.plugins.tooltip.borderColor = 'rgba(244,239,229,0.10)';
      Chart.defaults.plugins.tooltip.borderWidth = 1;
      Chart.defaults.plugins.tooltip.padding = 10;
      Chart.defaults.plugins.tooltip.cornerRadius = 6;
    }
  } catch (e) { /* defensive — Chart.defaults shape may change */ }
}

// ── CHART ──
function renderChart(data) {
  const canvas = document.getElementById('nwChart');
  const emptyEl = document.getElementById('chart-empty');

  // NW-P1-10 fix (audit 2026-05-24) — guard against Chart.js CDN failure
  // (offline-mode PWA, corporate firewall, jsdelivr outage). Pre-fix the
  // page threw "Chart is not defined" and broke every subsequent render
  // call. Now degrade gracefully — show the sr-only table message + keep
  // the rest of the page (summary strip, breakdown, history table) alive.
  if (typeof window.Chart === 'undefined') {
    if (canvas) canvas.style.display = 'none';
    if (emptyEl) {
      emptyEl.style.display = 'block';
      emptyEl.innerHTML =
        '<div style="font-size:32px;margin-bottom:12px;">📊</div>' +
        '<div style="font-family:var(--font-display);font-size:16px;font-weight:700;margin-bottom:6px;">Chart unavailable offline</div>' +
        '<div style="font-size:13px;color:var(--text3);max-width:360px;margin-inline:auto;">Your history is below. The chart will return when you\'re back online.</div>';
    }
    return;
  }

  // NW-P2-2: brand-align tooltip/axis defaults before chart construction.
  _brandChartDefaults();

  if (nwChart) { nwChart.destroy(); nwChart = null; }

  if (!data.length) {
    canvas.style.display = 'none';
    emptyEl.style.display = 'block';
    // NW-P0-5: keep a11y state consistent in empty-chart case.
    canvas.setAttribute('aria-label', 'Net worth chart — no data yet');
    const srBody = document.getElementById('nwChart-sr-body');
    if (srBody) srBody.innerHTML = '<tr><td colspan="4">No data yet.</td></tr>';
    return;
  }

  canvas.style.display = 'block';
  emptyEl.style.display = 'none';

  const labels = data.map(h => formatDateShort(h.date));
  const nwData  = data.map(h => h.netWorth);
  const assData = data.map(h => h.assets || (h.savings + h.investments));
  const debtData = data.map(h => h.debt || 0);

  const sym = _esc(window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$'));
  const fmt = v => sym + Math.round(Math.abs(v)).toLocaleString();

  // NW-P2-4 fix (audit 2026-05-24) — ATH (all-time-high) line. The single
  // most retention-driving signal on a wealth tracker is "you're at your
  // highest ever." Pre-fix the chart had no visual marker for this; users
  // had to eyeball the peak. Render a horizontal gold dashed line at the
  // max netWorth across the visible window, with a date-of-ATH tooltip.
  const athVal = Math.max.apply(null, nwData);
  const athIdx = nwData.indexOf(athVal);
  const athDate = data[athIdx] ? formatDateShort(data[athIdx].date) : '';
  const athLine = nwData.map(() => athVal);

  // NW-P0-5: chart a11y. Populate canvas aria-label with a one-sentence
  // summary of trajectory + populate the sr-only fallback table with the
  // full data series. WCAG 1.1.1 fail before this — canvas was inert.
  try {
    const first = data[0], last = data[data.length - 1];
    const delta = last.netWorth - first.netWorth;
    const dir = delta > 0 ? 'up' : delta < 0 ? 'down' : 'unchanged';
    const summary = 'Net worth chart, ' + data.length + ' data point' +
      (data.length === 1 ? '' : 's') + ' from ' + formatDateShort(first.date) +
      ' to ' + formatDateShort(last.date) + '. ' +
      'Started at ' + fmt(first.netWorth) + ', currently ' + fmt(last.netWorth) +
      ' (' + dir + (delta !== 0 ? ' by ' + fmt(Math.abs(delta)) : '') + ').';
    canvas.setAttribute('aria-label', summary);
    const srBody = document.getElementById('nwChart-sr-body');
    if (srBody) {
      srBody.innerHTML = data.map(h =>
        '<tr><td>' + _esc(formatDateShort(h.date)) + '</td>' +
        '<td>' + fmt(h.netWorth) + '</td>' +
        '<td>' + fmt(h.assets || (h.savings + h.investments)) + '</td>' +
        '<td>' + fmt(h.debt || 0) + '</td></tr>'
      ).join('');
    }
  } catch (_) {}

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
        // NW-P2-4: ATH horizontal line. Gold dashed, behind primary lines,
        // tooltip shows the date the peak was achieved.
        {
          label: 'ATH ' + fmt(athVal) + (athDate ? ' (' + athDate + ')' : ''),
          data: athLine,
          borderColor: '#D4AF6A',
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderDash: [2, 4],
          pointRadius: 0,
          pointHoverRadius: 0,
          tension: 0,
          fill: false,
          order: 4,
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
  const today = _localToday(); // NW-P1-2: local date
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
  const sym = _esc(window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$'));
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

  // NW-P1-1 fix — manual entry overwrites ANY same-day entry (auto or
  // manual). Pre-fix only matched on same-source, leaving an auto row
  // and a manual row both visible in the history table.
  // NW-P2-5: capture pre-write max for milestone-cross detection.
  const prevMax = HISTORY.length ? Math.max.apply(null, HISTORY.map(h => h.netWorth)) : 0;
  const idx = HISTORY.findIndex(h => h.date === date);
  if (idx >= 0) HISTORY[idx] = entry;
  else HISTORY.push(entry);

  HISTORY.sort((a, b) => a.date.localeCompare(b.date));
  // NW-P0-1 cap: must match logTodaySnapshot + dashboard-2.js logNWSnapshot.
  if (HISTORY.length > 3650) HISTORY = HISTORY.slice(-3650);
  PFCStorage.setJSON('nw_history', HISTORY);

  renderAll();
  closeModal();
  showToast('Entry saved — ' + formatDateShort(date));

  // NW-P2-5: fire celebration toast if this write crossed a milestone.
  // Slight delay so the "Entry saved" toast doesn't get clobbered.
  setTimeout(() => _celebrateIfCrossed(prevMax, Math.max.apply(null, HISTORY.map(h => h.netWorth))), 1800);
}

// ── EXPORT CSV ──
// NW-P1-4 fix (audit 2026-05-24) — CSV formula-injection guard per
// OWASP CSV-injection guidance. Excel/Sheets interpret cells starting
// with = + - @ \t \r as formulas, so an attacker-controlled `source` or
// `date` field could land =cmd|'/c calc'!A1 on someone's machine when
// they open the export. Prefix with a single quote to neutralise.
function _csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  // Also quote+escape any cell containing comma, quote, or newline (RFC 4180).
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function exportCSV() {
  if (!HISTORY.length) { showToast('No data to export'); return; }

  const rows = [];

  // NW-P2-6 fix (audit 2026-05-24) — Pro/Premium users get an editorial
  // header block above the data so the export feels like a "premium"
  // artifact, not just a raw dump. Free users still get the full data
  // (Free is never gated OUT of their own data — that would be hostile);
  // they just get the bare CSV like before. PFCPlan.get() returns
  // 'free' | 'pro' | 'premium'; safe fallback if PFCPlan undefined.
  let isPaid = false;
  try {
    if (typeof PFCPlan !== 'undefined' && typeof PFCPlan.get === 'function') {
      isPaid = PFCPlan.get() !== 'free';
    }
  } catch (_) {}

  if (isPaid) {
    const sym = window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$');
    // Note: this `sym` is NOT _esc'd because CSV is not HTML; raw symbols
    // like € £ ₨ should appear as-is in Excel.
    const fmt = v => sym + Math.round(Math.abs(v)).toLocaleString();
    const first = HISTORY[0];
    const last = HISTORY[HISTORY.length - 1];
    const athVal = Math.max.apply(null, HISTORY.map(h => h.netWorth));
    const athEntry = HISTORY.find(h => h.netWorth === athVal);
    const firstD = new Date(first.date + 'T12:00:00');
    const lastD = new Date(last.date + 'T12:00:00');
    const days = Math.max(1, Math.round((lastD - firstD) / 86400000) + 1);
    const planLabel = PFCPlan.get() === 'premium' ? 'Premium' : 'Pro';

    rows.push(['ProFinanceCast — Net Worth Archive Export']);
    rows.push(['Generated', _localToday() + ' (' + planLabel + ' plan)']);
    rows.push(['Range', formatDateShort(first.date) + ' → ' + formatDateShort(last.date)]);
    rows.push(['Days tracked', String(days)]);
    rows.push(['Entries logged', String(HISTORY.length)]);
    rows.push(['Current net worth', fmt(last.netWorth)]);
    rows.push(['All-time high', fmt(athVal) + (athEntry ? ' (' + formatDateShort(athEntry.date) + ')' : '')]);
    rows.push([]); // blank separator
  }

  rows.push(['Date','Net Worth','Assets','Savings','Investments','Debt','Source']);
  HISTORY.forEach(h => rows.push([h.date, h.netWorth, h.assets, h.savings, h.investments, h.debt, h.source]));
  // NW-P1-4: every cell now passes through _csvCell sanitiser.
  const csv = rows.map(r => r.map(_csvCell).join(',')).join('\r\n');
  // NW-P1-4: add BOM so Excel correctly opens UTF-8 currency symbols (€,£,₨).
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  // NW-P2-6: filename includes tier so Pro users can tell their exports apart.
  a.download = isPaid ? 'profinancecast-net-worth-archive.csv' : 'net-worth-history.csv';
  a.click();
  URL.revokeObjectURL(url);
  showToast(isPaid ? 'Exported Archive with summary header' : 'Exported net worth history');
}

// ── CLEAR ──
async function clearHistory() {
  // NW-P1-6 fix — was window.confirm() which silently fails in iOS PWA.
  const ok = await _pfcConfirm('Clear all net worth history? This cannot be undone.', 'Clear all');
  if (!ok) return;
  HISTORY = [];
  PFCStorage.remove('nw_history');
  // NW-P0-2 fix — set today's cleared-on flag so logTodaySnapshot won't
  // immediately re-write today's entry on the next onChange event. Auto-
  // logging resumes naturally on the user's next dashboard visit (tomorrow).
  try {
    const today = _localToday(); // NW-P1-2: local date
    PFCStorage.setJSON('nw_history_cleared_on', today);
  } catch (_) {}
  renderAll();
  showToast('History cleared — auto-logging resumes tomorrow');
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
  // NW-CRITICAL fix (2026-05-29) — PFCStorage intercepts PFCAuth.onReady so this
  // callback fires only AFTER the cache is warm AND auth has resolved the real
  // uid. We now ALWAYS rehydrate here (was: only "if changed"). Reason: the
  // synchronous init() above deliberately skips logging + first-paint while the
  // cache is cold, so this post-warm pass is what actually logs today's entry
  // into the real user namespace and paints the populated view. The previous
  // "if changed" guard could skip this pass for a brand-new user whose cold-read
  // HISTORY ([]) happened to equal their still-empty warm HISTORY, leaving today
  // unlogged. Rehydrate is idempotent (logTodaySnapshot replaces today's row in
  // place), so an unconditional call is safe.
  PFCAuth.onReady(_rehydrateFromStorage);
  PFCAuth.onAuthChange(_rehydrateFromStorage);
}
// Pick up cross-page edits (settings change, cash-forecast typed values, etc.)
if (typeof PFCUser !== 'undefined' && typeof PFCUser.onChange === 'function') {
  PFCUser.onChange(() => { try { _rehydrateFromStorage(); } catch (_) {} });
}
