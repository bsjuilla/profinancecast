// ── State ─────────────────────────────────────────────────────────────────
// Persistence: PFCStorage('user') is the canonical source — same key the
// dashboard, scenarios and Sage already read. Editing a row here writes
// straight back, so the data survives refresh and shows across pages.
const DEFAULT_USER = {
  income: 0, otherIncome: 0,
  housing: 0, food: 0, transport: 0, otherExp: 0,
  savings: 0, investments: 0,
  debt: 0, debtPay: 0,
  currency: '€', name: '',
  // Custom user-defined rows. Each: { id, label, amount, color }
  customIn: [], customOut: []
};

// Fixed income/expense rows — keep stable so donut colors line up with table swatches.
const IN_ROWS = [
  { key:'income',      label:'Primary income (salary)', color:'#2BB67D' },
  { key:'otherIncome', label:'Other income (side / rental / etc)', color:'#3B82F6' },
];
const OUT_ROWS = [
  { key:'housing',   label:'Housing',         color:'#F5A623' },
  { key:'food',      label:'Food & groceries', color:'#E05252' },
  { key:'transport', label:'Transport',       color:'#A78BFA' },
  { key:'otherExp',  label:'Other expenses',  color:'#B8C2BC' },
  { key:'debtPay',   label:'Debt payments',   color:'#D4AF6A' },
];
// Color palette for custom rows — picks stable colors by index so legends
// stay readable even if rows are added/removed.
const CUSTOM_IN_PALETTE  = ['#10B981','#06B6D4','#22D3EE','#34D399','#84CC16','#A3E635'];
const CUSTOM_OUT_PALETTE = ['#FB923C','#F87171','#C084FC','#F472B6','#94A3B8','#FBBF24'];

let USER = loadUser();
let inChart, outChart, barChart;

function _ensureArrays() {
  if (!Array.isArray(USER.customIn))  USER.customIn  = [];
  if (!Array.isArray(USER.customOut)) USER.customOut = [];
}
function _newId() { return 'r' + Date.now().toString(36) + Math.floor(Math.random()*1000).toString(36); }
function _pickColor(side, idx) {
  const pool = side === 'in' ? CUSTOM_IN_PALETTE : CUSTOM_OUT_PALETTE;
  return pool[idx % pool.length];
}

// Stable localStorage key used as the SYNCHRONOUS source-of-truth for the
// cash-forecast page. Decoupled from PFCStorage's per-user encrypted
// namespace (which races with PFCAuth.onReady — see persistUser below).
const CASH_FORECAST_LS_KEY = 'pfc_cash_forecast_user';

function loadUser() {
  // Primary: PFCUser is the central store and handles all 4 read precedence
  // layers (PFCStorage, LS sync mirror, cash-forecast legacy LS, pre-namespace
  // LS) plus currency normalisation. Falls back to the previous logic if
  // PFCUser hasn't loaded yet (e.g. script tag blocked).
  // FULL-P0-B3 helper (audit 2026-05-26) — prototype-pollution-safe JSON
  // parse. Pre-fix the JSON.parse(raw) below would silently mutate
  // Object.prototype on a tampered localStorage payload like
  // `{"__proto__":{"isAdmin":true}}`. Same pattern as D-SEC-13, R-SEC-17,
  // and the version now baked into scenarios-3.js (B1).
  const _safeParseJson = (str) => {
    try {
      return JSON.parse(str, (k, v) => {
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') return undefined;
        return v;
      });
    } catch (_) { return null; }
  };

  if (typeof PFCUser !== 'undefined') {
    const u = { ...DEFAULT_USER, ...PFCUser.get() };
    if (!Array.isArray(u.customIn))  u.customIn  = [];
    if (!Array.isArray(u.customOut)) u.customOut = [];
    return u;
  }
  try {
    let raw = null;
    try { raw = localStorage.getItem(CASH_FORECAST_LS_KEY); } catch (_) {}
    if (!raw && typeof PFCStorage !== 'undefined') {
      try { raw = PFCStorage.get('user'); } catch (_) {}
    }
    if (!raw) {
      try { raw = localStorage.getItem('pfc_user'); } catch (_) {}
    }
    // FULL-P0-B3 — was raw JSON.parse(raw); now routes through _safeParseJson
    // which strips __proto__ / constructor / prototype keys to block
    // prototype-pollution via a tampered localStorage payload.
    const parsed = raw ? _safeParseJson(raw) : null;
    const u = !parsed ? { ...DEFAULT_USER } : { ...DEFAULT_USER, ...parsed };
    if (!Array.isArray(u.customIn))  u.customIn  = [];
    if (!Array.isArray(u.customOut)) u.customOut = [];
    if (typeof PFCCurrency !== 'undefined' && PFCCurrency.toSymbol) {
      u.currency = PFCCurrency.toSymbol(u.currency);
    }
    return u;
  } catch(e) { return { ...DEFAULT_USER, customIn:[], customOut:[] }; }
}

// Heuristic for "does USER actually contain user-entered data?" — used by
// the PFCAuth.onReady re-render so we don't clobber a user's typed values
// with an empty namespace fetch (the classic race that made every refresh
// lose data even though persistUser fired).
function _userHasData(u) {
  if (!u) return false;
  const numericKeys = ['income','otherIncome','housing','food','transport','otherExp','savings','investments','debt','debtPay'];
  if (numericKeys.some(k => parseFloat(u[k]) > 0)) return true;
  if (Array.isArray(u.customIn)  && u.customIn.length  > 0) return true;
  if (Array.isArray(u.customOut) && u.customOut.length > 0) return true;
  return false;
}
// Update the "Last saved at HH:MM" indicator next to the Save button.
// Called from persistUser() so it reflects EVERY successful save —
// debounced, blur, manual, or beforeunload.
function _updateLastSavedIndicator() {
  const el = document.getElementById('last-saved-indicator');
  if (!el) return;
  try {
    const now = new Date();
    const locale = (navigator.languages && navigator.languages[0]) || navigator.language || 'en-US';
    const time = now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    el.textContent = '· Saved ' + time;
    el.style.display = 'inline-block';
  } catch (_) {
    el.textContent = '· Saved';
    el.style.display = 'inline-block';
  }
}

function persistUser() {
  try {
    // PFCUser owns the persistence pipeline — writes to LS sync mirror
    // (immediate, plaintext), the cash-forecast legacy LS key, and the
    // encrypted PFCStorage in one call. Also handles guest→user adoption.
    if (typeof PFCUser !== 'undefined') {
      PFCUser.set(USER);
      _updateLastSavedIndicator();
      return;
    }
    // Fallback path — PFCUser script tag blocked or load failed.
    const json = JSON.stringify(USER);
    try { localStorage.setItem(CASH_FORECAST_LS_KEY, json); } catch (_) {}
    if (typeof PFCStorage !== 'undefined') {
      try { PFCStorage.setJSON('user', USER); } catch (_) {}
    } else {
      try { localStorage.setItem('pfc_user', json); } catch (_) {}
    }
    try {
      const uid = (typeof PFCAuth !== 'undefined' && PFCAuth.getUserId) ? PFCAuth.getUserId() : 'guest';
      if (uid && uid !== 'guest' && typeof PFCStorage !== 'undefined' && typeof PFCStorage.adoptGuestData === 'function') {
        PFCStorage.adoptGuestData(uid);
      }
    } catch (_) {}
    _updateLastSavedIndicator();
  } catch(e) { console.error('[cash-forecast] persist failed:', e); }
}

// Debounced persist — saves ~400ms after the user stops typing. This catches
// the "type a value then refresh immediately" case that the blur-only
// persistence used to lose silently. Also pulses the Save button via
// flashSaved() so users have visual confirmation that their typing made it
// to storage — without having to click anywhere or trust an invisible save.
let _persistDebounceTimer;
function persistUserDebounced() {
  clearTimeout(_persistDebounceTimer);
  _persistDebounceTimer = setTimeout(() => {
    persistUser();
    flashSaved();
  }, 400);
}

// Belt-and-braces: catch a refresh/navigation while a debounced save is still
// pending. Cancel the timer and write synchronously before unload.
window.addEventListener('beforeunload', () => {
  if (_persistDebounceTimer) {
    clearTimeout(_persistDebounceTimer);
    try { persistUser(); } catch (_) {}
  }
});
function currencySym() { return window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$'); }
function fmt(n) { return currencySym() + Math.abs(Math.round(n||0)).toLocaleString('en-US'); }
function fmtSigned(n) { return (n<0?'-':'') + currencySym() + Math.abs(Math.round(n||0)).toLocaleString('en-US'); }

// ── Compute totals ────────────────────────────────────────────────────────
function totals() {
  _ensureArrays();
  const fixedIn  = IN_ROWS.reduce((s,r)=>s+(parseFloat(USER[r.key])||0),0);
  const fixedOut = OUT_ROWS.reduce((s,r)=>s+(parseFloat(USER[r.key])||0),0);
  const customIn  = USER.customIn.reduce((s,r)=>s+(parseFloat(r.amount)||0),0);
  const customOut = USER.customOut.reduce((s,r)=>s+(parseFloat(r.amount)||0),0);
  const inflow = fixedIn + customIn, outflow = fixedOut + customOut;
  return { inflow, outflow, net: inflow - outflow };
}

// ── Render rows ───────────────────────────────────────────────────────────
function renderRows() {
  _ensureArrays();
  const inHost  = document.getElementById('in-rows');
  const outHost = document.getElementById('out-rows');
  inHost.innerHTML = '';
  outHost.innerHTML = '';
  IN_ROWS.forEach(r => inHost.appendChild(buildRow(r, 'in', false)));
  USER.customIn.forEach((cr, i) => inHost.appendChild(buildRow({
    key:'__c_'+cr.id, label: cr.label, color: cr.color || _pickColor('in', i), _custom:true, _side:'in', _id:cr.id
  }, 'in', true)));
  OUT_ROWS.forEach(r => outHost.appendChild(buildRow(r, 'out', false)));
  USER.customOut.forEach((cr, i) => outHost.appendChild(buildRow({
    key:'__c_'+cr.id, label: cr.label, color: cr.color || _pickColor('out', i), _custom:true, _side:'out', _id:cr.id
  }, 'out', true)));
}
function buildRow(r, side, isCustom) {
  const row = document.createElement('div');
  row.className = 'row';
  const value = isCustom
    ? (USER[side === 'in' ? 'customIn' : 'customOut'].find(x => x.id === r._id)?.amount || 0)
    : (parseFloat(USER[r.key])||0);
  row.innerHTML = `
    <div class="row-label"><span class="row-swatch" style="background:${r.color}"></span>${esc(r.label)}</div>
    <div style="display:flex;align-items:center;">
      <input class="row-input" type="number" min="0" step="1" value="${value}" aria-label="${esc(r.label)}"/>
      ${isCustom ? `<button class="row-del" aria-label="Remove ${esc(r.label)}" title="Remove row">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      </button>` : ''}
    </div>
  `;
  const input = row.querySelector('input');
  input.addEventListener('input', () => {
    const v = Math.max(0, parseFloat(input.value)||0);
    if (isCustom) {
      const arr = USER[side === 'in' ? 'customIn' : 'customOut'];
      const target = arr.find(x => x.id === r._id);
      if (target) target.amount = v;
    } else {
      USER[r.key] = v;
    }
    renderTotalsAndCharts();
    // Persist ~400ms after the user stops typing. Previously this only fired
    // on blur, so typing → refresh-without-tabbing-away silently lost data.
    persistUserDebounced();
  });
  input.addEventListener('blur', () => { persistUser(); flashSaved(); });
  if (isCustom) {
    row.querySelector('.row-del').addEventListener('click', () => removeCustomRow(side, r._id));
  }
  return row;
}

function esc(t) { return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── Add / remove custom rows ─────────────────────────────────────────────
function addCustomRow(side) {
  _ensureArrays();
  const labelEl  = document.getElementById(side === 'in' ? 'add-in-label'  : 'add-out-label');
  const amountEl = document.getElementById(side === 'in' ? 'add-in-amount' : 'add-out-amount');
  const label = (labelEl.value || '').trim();
  const amount = Math.max(0, parseFloat(amountEl.value)||0);
  if (!label) {
    labelEl.focus();
    if (typeof showToast === 'function') showToast(side === 'in' ? 'Enter a label for the income source' : 'Enter a label for the expense');
    labelEl.classList.add('input-shake');
    setTimeout(() => labelEl.classList.remove('input-shake'), 400);
    return;
  }
  if (amount <= 0) {
    amountEl.focus();
    if (typeof showToast === 'function') showToast('Enter an amount greater than 0');
    amountEl.classList.add('input-shake');
    setTimeout(() => amountEl.classList.remove('input-shake'), 400);
    return;
  }
  const arr = USER[side === 'in' ? 'customIn' : 'customOut'];
  const color = _pickColor(side, arr.length);
  arr.push({ id: _newId(), label, amount, color });
  persistUser();
  labelEl.value = ''; amountEl.value = '';
  renderRows();
  renderTotalsAndCharts();
  flashSaved();
}
function removeCustomRow(side, id) {
  const key = side === 'in' ? 'customIn' : 'customOut';
  USER[key] = (USER[key] || []).filter(r => r.id !== id);
  persistUser();
  renderRows();
  renderTotalsAndCharts();
  flashSaved();
}

// ── Totals + charts ───────────────────────────────────────────────────────
function renderTotalsAndCharts() {
  const t = totals();
  document.getElementById('kpi-in').textContent  = fmt(t.inflow);
  document.getElementById('kpi-out').textContent = fmt(t.outflow);
  document.getElementById('kpi-net').textContent = fmtSigned(t.net);
  document.getElementById('in-total').textContent  = fmt(t.inflow);
  document.getElementById('out-total').textContent = fmt(t.outflow);

  const netCard = document.getElementById('kpi-net-card');
  netCard.classList.toggle('neg', t.net < 0);
  document.getElementById('kpi-net-sub').textContent =
    t.net >= 0 ? `${fmt(t.net)} headroom after expenses` : `Shortfall of ${fmt(Math.abs(t.net))} this month`;

  document.getElementById('empty-hint').style.display =
    (t.inflow === 0 && t.outflow === 0) ? 'block' : 'none';

  drawCharts(t);
}

function drawCharts(t) {
  _ensureArrays();
  // Compose fixed + custom rows for the donuts so user-added rows get their
  // own labeled slice with a stable swatch color.
  const inSegments  = [
    ...IN_ROWS.map(r => ({ label:r.label, value:parseFloat(USER[r.key])||0, color:r.color })),
    ...USER.customIn.map((cr, i) => ({ label:cr.label, value:parseFloat(cr.amount)||0, color: cr.color || _pickColor('in', i) })),
  ];
  const outSegments = [
    ...OUT_ROWS.map(r => ({ label:r.label, value:parseFloat(USER[r.key])||0, color:r.color })),
    ...USER.customOut.map((cr, i) => ({ label:cr.label, value:parseFloat(cr.amount)||0, color: cr.color || _pickColor('out', i) })),
  ];
  const inHasData  = inSegments.some(s => s.value > 0);
  const outHasData = outSegments.some(s => s.value > 0);

  const donutOpts = {
    responsive:true, maintainAspectRatio:false,
    cutout:'62%',
    plugins:{
      legend:{
        position:'bottom',
        labels:{ color:'#B8C2BC', font:{ family:'Inter, sans-serif', size:11 }, boxWidth:10, padding:8 }
      },
      tooltip:{
        backgroundColor:'#16271F', borderColor:'rgba(255,255,255,0.13)', borderWidth:1,
        titleColor:'#F0EDE2', bodyColor:'#F0EDE2',
        callbacks:{ label:(c)=>` ${c.label}: ${fmt(c.parsed)}` }
      }
    }
  };

  // In donut — fixed rows first, then custom rows
  if (inChart) inChart.destroy();
  inChart = new Chart(document.getElementById('chart-in'), {
    type:'doughnut',
    data:{
      labels: inHasData ? inSegments.map(s=>s.label) : ['No income yet'],
      datasets:[{
        data: inHasData ? inSegments.map(s=>s.value) : [1],
        backgroundColor: inHasData ? inSegments.map(s=>s.color) : ['#1A2330'],
        borderColor:'#16271F', borderWidth:2
      }]
    },
    options: donutOpts
  });

  // Out donut — fixed rows first, then custom rows
  if (outChart) outChart.destroy();
  outChart = new Chart(document.getElementById('chart-out'), {
    type:'doughnut',
    data:{
      labels: outHasData ? outSegments.map(s=>s.label) : ['No expenses yet'],
      datasets:[{
        data: outHasData ? outSegments.map(s=>s.value) : [1],
        backgroundColor: outHasData ? outSegments.map(s=>s.color) : ['#1A2330'],
        borderColor:'#16271F', borderWidth:2
      }]
    },
    options: donutOpts
  });

  // Bar chart — Inflow / Outflow / Ending cash
  if (barChart) barChart.destroy();
  const netColor = t.net >= 0 ? '#D4AF6A' : '#E05252';
  barChart = new Chart(document.getElementById('chart-bar'), {
    type:'bar',
    data:{
      labels:['Inflow','Outflow','Ending'],
      datasets:[{
        data:[t.inflow, t.outflow, t.net],
        backgroundColor:['#2BB67D','#F5A623',netColor],
        borderRadius:6, borderSkipped:false,
        maxBarThickness:48
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{ display:false },
        tooltip:{
          backgroundColor:'#16271F', borderColor:'rgba(255,255,255,0.13)', borderWidth:1,
          titleColor:'#F0EDE2', bodyColor:'#F0EDE2',
          callbacks:{ label:(c)=>` ${fmtSigned(c.parsed.y)}` }
        }
      },
      scales:{
        x:{ grid:{ display:false }, ticks:{ color:'#B8C2BC', font:{ family:'Inter, sans-serif', size:11 } } },
        y:{ grid:{ color:'rgba(255,255,255,0.05)' }, ticks:{ color:'#B8C2BC', font:{ family:'Inter, sans-serif', size:10 }, callback:(v)=>currencySym()+v.toLocaleString() } }
      }
    }
  });
}

// ── Subscriptions cross-reference (read-only) ────────────────────────────
// FULL-P0-C1 fix (audit 2026-05-26) — pre-fix this summed EVERY entry in
// `recurrings`, ignoring the three sibling state keys that recurring-2.js
// writes (`recurrings_cancelled`, `recurrings_hidden`, `recurrings_snoozed`).
// Result: user cancels Netflix on /recurring → /cash-forecast still adds
// $15.99 to "subscription total" forever. The contract was page-local at
// the writer side; this batch makes the readers honour it too.
//
// We re-implement the three filters here (rather than exporting a helper
// from recurring-2.js) because:
//   1. cash-forecast loads independently — pages don't share globals.
//   2. The filter logic is simple: a 3-line set/map lookup. Lifting it to
//      a shared module would mean a new pfc-recurrings.js file + a script
//      tag in every page that reads recurrings. Bigger surface, same answer.
//   3. The SAME three storage keys are the canonical source of truth — both
//      writers and both readers go through PFCStorage with the same shapes
//      (array<string>, array<string>, array<[string, number]>). If a third
//      reader appears (dashboard?), it copies this same 8-line helper.

function _loadRecurringFlags() {
  const cancelled = new Set();
  const hidden    = new Set();
  const snoozed   = new Map();   // id -> snoozeUntilTimestamp
  try {
    const c = PFCStorage.getJSON('recurrings_cancelled');
    if (Array.isArray(c)) c.forEach(id => cancelled.add(id));
  } catch (_) {}
  try {
    const h = PFCStorage.getJSON('recurrings_hidden');
    if (Array.isArray(h)) h.forEach(id => hidden.add(id));
  } catch (_) {}
  try {
    const s = PFCStorage.getJSON('recurrings_snoozed');
    if (Array.isArray(s)) {
      // Each entry is [id, untilTimestamp]. Snoozed entries auto-expire
      // when until <= now — they reappear in the totals immediately,
      // matching the recurring-2._isSnoozed semantics so the two pages
      // never disagree on what "active" means.
      const now = Date.now();
      for (const tuple of s) {
        if (!Array.isArray(tuple) || tuple.length < 2) continue;
        const [id, until] = tuple;
        if (Number(until) > now) snoozed.set(id, Number(until));
      }
    }
  } catch (_) {}
  return { cancelled, hidden, snoozed };
}

function _isActiveRecurring(r, flags) {
  if (!r || !r.id) return true;  // missing id → couldn't have been flagged
  if (flags.cancelled.has(r.id)) return false;
  if (flags.hidden.has(r.id))    return false;
  if (flags.snoozed.has(r.id))   return false;
  return true;
}

function renderSubscriptions() {
  try {
    const recurrings = (typeof PFCStorage !== 'undefined') ? PFCStorage.getJSON('recurrings') : null;
    if (!Array.isArray(recurrings) || recurrings.length === 0) return;
    const flags = _loadRecurringFlags();
    const active = recurrings.filter(r => _isActiveRecurring(r, flags));
    if (active.length === 0) return;
    const total = active.reduce((s,r)=>s+(parseFloat(r.monthlyAmount)||0), 0);
    if (total <= 0) return;
    document.getElementById('subs-strip').style.display = '';
    document.getElementById('subs-total').textContent = fmt(total);
    document.getElementById('subs-count').textContent = active.length;
  } catch(_) {}
}

// ── Month selector — generated dynamically on every page load ────────────
// Window: 1 month back (for quick reference) + current month + 6 months
// forward. Computed at boot time from new Date(), so the range walks
// forward automatically as months pass — in November 2026 the dropdown
// ends at May 2027, not September 2026 like the old -1..+4 cap.
// Locale comes from navigator.language so the month names render in the
// user's language ("septembre 2026" for FR users etc.). Falls back to
// 'en-US' if the browser refuses the locale (Safari old versions).
function populateMonths() {
  const sel = document.getElementById('month-select');
  if (!sel) return;
  const today = new Date();
  const locale = (navigator.languages && navigator.languages[0]) || navigator.language || 'en-US';
  const months = [];
  for (let i = -1; i <= 6; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    let label;
    try {
      label = d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    } catch (_) {
      label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    months.push({ value: d.toISOString().slice(0,7), label: label });
  }
  sel.innerHTML = months.map(m => `<option value="${m.value}">${m.label}</option>`).join('');
  sel.value = today.toISOString().slice(0,7);
}

// ── Save UX ──────────────────────────────────────────────────────────────
let _savedTimer;
function flashSaved() {
  const btn = document.getElementById('save-btn');
  btn.classList.add('saved');
  btn.classList.add('saved-pulse');
  clearTimeout(_savedTimer);
  _savedTimer = setTimeout(() => {
    btn.classList.remove('saved');
    btn.classList.remove('saved-pulse');
  }, 1400);
}
function saveAll() {
  // Inputs already wrote into USER on `input`; persist + confirm.
  persistUser();
  flashSaved();
  showToast('Saved');
}

function showToast(msg) {
  const old = document.getElementById('pfc-toast');
  if (old) old.remove();
  const t = document.createElement('div');
  t.id = 'pfc-toast';
  t.className = 'pfc-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .25s'; }, 2200);
  setTimeout(() => t.remove(), 2600);
}

// ── Boot ─────────────────────────────────────────────────────────────────
//
// The render pipeline used to fire immediately on script-parse, which meant
// the page painted with USER=zeros for ~1-2 seconds before PFCAuth resolved
// the session and PFCStorage warmed up the encrypted cache. Users perceived
// this "zero flash" as "my data is gone." Worse, if they typed during that
// window, the onReady re-render could clobber their typed values.
//
// New boot pipeline: render the page CHROME immediately (month selector,
// add-row inputs, empty section frames), but DEFER all USER-dependent
// rendering (row values, KPI cards, charts) until BOTH:
//   1. PFCStorage.isReady() — the encrypted cache is warm + decrypted
//   2. PFCAuth has resolved the session (we know _uid())
//
// A small loading skeleton hides the value-bearing surfaces during the
// resolution window. A 3-second safety net forces a render anyway if
// either signal never fires (offline / blocked SDK / etc.), at which
// point we render what we have — possibly defaults, but at least not
// stuck on a spinner forever.

function _showCashForecastLoading() {
  const root = document.querySelector('.content');
  if (!root || root.dataset.cfLoading === '1') return;
  root.dataset.cfLoading = '1';
  const overlay = document.createElement('div');
  overlay.id = 'cf-loading-overlay';
  overlay.setAttribute('aria-live', 'polite');
  overlay.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(11,20,16,0.55);backdrop-filter:blur(6px);z-index:5;border-radius:inherit;pointer-events:none;';
  overlay.innerHTML = '<div style="display:flex;align-items:center;gap:12px;padding:12px 22px;background:rgba(11,20,16,0.92);border:1px solid var(--line-2,rgba(244,239,229,0.10));border-radius:999px;font-family:var(--font-mono,monospace);font-size:12px;color:var(--ink-2,#B8C2BC);letter-spacing:0.04em;"><div style="width:14px;height:14px;border:2px solid rgba(43,182,125,0.30);border-top-color:#2BB67D;border-radius:50%;animation:cf-spin 0.8s linear infinite;"></div>Loading your forecast…</div>';
  // Make .content positioned so the absolute overlay anchors correctly.
  const cs = getComputedStyle(root);
  if (cs.position === 'static') root.style.position = 'relative';
  root.appendChild(overlay);
  if (!document.getElementById('cf-spin-keyframes')) {
    const s = document.createElement('style');
    s.id = 'cf-spin-keyframes';
    s.textContent = '@keyframes cf-spin { to { transform: rotate(360deg); } }';
    document.head.appendChild(s);
  }
}

function _hideCashForecastLoading() {
  const overlay = document.getElementById('cf-loading-overlay');
  if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  const root = document.querySelector('.content');
  if (root) delete root.dataset.cfLoading;
}

// Wire chrome (always safe, no USER dependency)
function _bootChrome() {
  populateMonths();
  // Enter-to-add for both inflow + outflow add-row inputs.
  ['add-in-label','add-in-amount'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') addCustomRow('in'); });
  });
  ['add-out-label','add-out-amount'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') addCustomRow('out'); });
  });
}

// Render USER-dependent surfaces once. Called when both readiness signals
// have fired, OR when the safety-net timeout elapses.
let _initialRenderDone = false;
function _doInitialUserRender(reason) {
  if (_initialRenderDone) return;
  _initialRenderDone = true;
  // Adopt guest data BEFORE the first authenticated read, so anything
  // that landed in pfc:guest:user during the resolution window gets
  // promoted to pfc:{realUid}:user.
  try {
    const uid = (typeof PFCAuth !== 'undefined' && PFCAuth.getUserId) ? PFCAuth.getUserId() : 'guest';
    if (uid && uid !== 'guest' && typeof PFCStorage !== 'undefined' && typeof PFCStorage.adoptGuestData === 'function') {
      PFCStorage.adoptGuestData(uid);
    }
  } catch (_) {}
  USER = loadUser();
  renderRows();
  renderTotalsAndCharts();
  renderSubscriptions();
  updateEmptyHintVisibility();
  _hideCashForecastLoading();
  try { _maybeFireActivation('cash-forecast'); } catch (_) {}
}

function boot() {
  _bootChrome();
  _showCashForecastLoading();

  const ready = { storage: false, auth: false };
  const maybeRender = () => {
    if (ready.storage && ready.auth) _doInitialUserRender('both-ready');
  };

  // Storage readiness
  if (typeof PFCStorage !== 'undefined' && typeof PFCStorage.isReady === 'function' && PFCStorage.isReady()) {
    ready.storage = true;
  } else if (typeof PFCStorage !== 'undefined' && typeof PFCStorage.onReady === 'function') {
    PFCStorage.onReady(() => { ready.storage = true; maybeRender(); });
  } else {
    // No PFCStorage at all — treat as ready (legacy fallback path in loadUser).
    ready.storage = true;
  }

  // Auth readiness
  if (typeof PFCAuth !== 'undefined' && typeof PFCAuth.isReady === 'function' && PFCAuth.isReady()) {
    ready.auth = true;
  } else if (typeof PFCAuth !== 'undefined' && typeof PFCAuth.onReady === 'function') {
    PFCAuth.onReady(() => { ready.auth = true; maybeRender(); });
  } else {
    // No PFCAuth — render now (single-user dev/legacy mode).
    ready.auth = true;
  }

  // Try-now in case both were ready synchronously.
  maybeRender();

  // Safety net: if neither signal fires within 3 seconds, render anyway.
  // Better to show default-zero state than a frozen spinner.
  setTimeout(() => {
    if (!_initialRenderDone) {
      ready.storage = ready.auth = true;
      _doInitialUserRender('timeout-fallback');
    }
  }, 3000);
}
boot();

// Reveal/hide the "Finish onboarding" banner based on whether the user
// actually has data. We only call this AFTER auth + storage have resolved
// so we never show a false-positive banner to someone who already onboarded.
function updateEmptyHintVisibility() {
  const hint = document.getElementById('empty-hint');
  if (!hint) return;
  const meaningfulKeys = ['income','otherIncome','housing','food','transport','otherExp','savings','investments','debt','debtPay'];
  const hasAnyValue = meaningfulKeys.some(k => parseFloat(USER[k]) > 0);
  const hasCustomRows = (Array.isArray(USER.customIn) && USER.customIn.length > 0)
                     || (Array.isArray(USER.customOut) && USER.customOut.length > 0);
  hint.style.display = (hasAnyValue || hasCustomRows) ? 'none' : 'block';
}

// PFCStorage namespaces by userId. At DOMContentLoaded the Supabase session
// may not be restored yet, so re-load once auth resolves to land on the
// right namespace (otherwise we'd render the guest snapshot forever).
//
// CRITICAL: the re-render must NOT clobber USER if the user has already
// typed values during the auth-resolution window. The classic bug was:
//   t=0    boot() — loads from guest namespace (empty) → USER = zeros
//   t=500  user types Primary income = 5000 → USER.income = 5000
//   t=1200 PFCAuth.onReady fires → loadUser() reads pfc:{realUid}:user
//          (also empty) → USER = zeros → renderRows() draws zeros over
//          the user's 5000. User sees value disappear.
//
// Fix: only overwrite USER when (a) the loaded data has values OR
// (b) the current in-memory USER is empty (legitimate first-load).
// Note: PFCAuth.onReady is now handled inside boot() via the maybeRender
// gate — that's the single source of truth for the initial render. We only
// hook onAuthChange here for the sign-in / sign-out / account-switch cases
// that happen AFTER the page is alive.
if (typeof PFCAuth !== 'undefined') {
  PFCAuth.onAuthChange(() => {
    // Sign-in / sign-out / account-switch — here we DO want a full reload
    // because the user identity changed. Preserving in-memory edits from
    // the previous identity would be wrong (their data, your inputs).
    USER = loadUser();
    renderRows();
    renderTotalsAndCharts();
    renderSubscriptions();
    updateEmptyHintVisibility();
  });
} else {
  // No PFCAuth on the page (legacy / fallback) — evaluate immediately.
  updateEmptyHintVisibility();
}

// Also re-evaluate on any user input, so the banner disappears the moment
// the user starts editing the rows directly.
document.addEventListener('input', (e) => {
  if (e.target && e.target.closest && e.target.closest('.content')) {
    setTimeout(updateEmptyHintVisibility, 50);
  }
});

// ── ACTIVATION EVENT ──
// Same idempotency contract as dashboard.html — fires once per user when
// they're signed in + have non-zero income + reach a value page.
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

// Cross-tab sync — if another page (dashboard, onboarding) updates user data,
// reflect the change here on visibility-return without forcing a manual reload.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    const fresh = loadUser();
    const keys = [...IN_ROWS, ...OUT_ROWS].map(r=>r.key);
    const fixedChanged  = keys.some(k => (fresh[k]||0) !== (USER[k]||0));
    const customChanged = JSON.stringify(fresh.customIn||[])  !== JSON.stringify(USER.customIn||[]) ||
                          JSON.stringify(fresh.customOut||[]) !== JSON.stringify(USER.customOut||[]);
    if (fixedChanged || customChanged) { USER = fresh; renderRows(); renderTotalsAndCharts(); }
  }
});

// ── Holiday-aware business-day chip ──────────────────────────────────────
// Shows the user "April 2026 · 22 business days · 1 bank holiday: Good Friday"
// based on the current month-selector value and the user's country (detected
// from Vercel geo headers). Silent if Nager.Date doesn't support the country
// or geo lookup fails.
(function _bootHolidayInfo() {
  const el = document.getElementById('cf-holiday-info');
  if (!el || typeof PFCHolidays === 'undefined') return;

  let _country = null;

  function _esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function _getSelectedMonth() {
    const sel = document.getElementById('month-select');
    if (!sel || !sel.value) return null;
    const m = /^(\d{4})-(\d{2})$/.exec(sel.value);
    if (!m) return null;
    return { year: parseInt(m[1], 10), monthIdx: parseInt(m[2], 10) - 1 };
  }

  function _typicalBusinessDays(year, monthIdx) {
    const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
    let n = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dow = new Date(year, monthIdx, d).getDay();
      if (dow !== 0 && dow !== 6) n++;
    }
    return n;
  }

  function _monthName(year, monthIdx) {
    try {
      return new Date(year, monthIdx, 1).toLocaleDateString(navigator.language || 'en-US',
        { month: 'long', year: 'numeric' });
    } catch (_) {
      return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][monthIdx] + ' ' + year;
    }
  }

  async function _render() {
    if (!_country) { el.style.display = 'none'; return; }
    const sel = _getSelectedMonth();
    if (!sel) { el.style.display = 'none'; return; }
    try {
      const [bizDays, hols] = await Promise.all([
        PFCHolidays.businessDaysInMonth(sel.year, sel.monthIdx, _country),
        PFCHolidays.getForMonth(sel.year, sel.monthIdx, _country),
      ]);
      const typical = _typicalBusinessDays(sel.year, sel.monthIdx);
      const monthLabel = _monthName(sel.year, sel.monthIdx);
      const delta = bizDays - typical;
      const deltaTxt = delta === 0 ? ''
        : delta < 0 ? ' <span style="color:var(--amber,#F5A623);">(' + Math.abs(delta) + ' fewer than usual)</span>'
        : ' <span style="color:var(--teal,#2BB67D);">(' + delta + ' more than usual)</span>';
      const bankClosed = hols.filter((h) => {
        if (!h.types || !Array.isArray(h.types)) return true;
        return h.types.includes('Public') || h.types.includes('Bank');
      });
      let holidaysTxt = '';
      if (bankClosed.length > 0) {
        const list = bankClosed.slice(0, 3).map((h) => _esc(h.localName || h.name) + ' (' + h.date.slice(5) + ')').join(', ');
        const more = bankClosed.length > 3 ? ' +' + (bankClosed.length - 3) + ' more' : '';
        holidaysTxt = ' &middot; ' + bankClosed.length + ' bank holiday' + (bankClosed.length>1?'s':'') + ': ' + list + more;
      }
      el.innerHTML = '<strong style="color:var(--ink,#F0EDE2);font-weight:600;">' +
        _esc(monthLabel) + '</strong> &middot; ' + bizDays + ' business day' +
        (bizDays === 1 ? '' : 's') + deltaTxt + holidaysTxt;
      el.style.display = 'block';
    } catch (_) { el.style.display = 'none'; }
  }

  function _resolveCountry() {
    try {
      const cached = sessionStorage.getItem('pfc_geo_country');
      if (cached) { _country = cached; _render(); return; }
    } catch (_) {}
    fetch('/api/geo', { credentials: 'omit' })
      .then((res) => res.ok ? res.json() : null)
      .then((geo) => {
        if (!geo || !geo.countryCode) return;
        if (geo.source === 'fallback-usd') return;
        if (!PFCHolidays.isSupported(geo.countryCode)) return;
        _country = geo.countryCode;
        try { sessionStorage.setItem('pfc_geo_country', _country); } catch (_) {}
        _render();
      })
      .catch(() => { /* silent */ });
  }

  const sel = document.getElementById('month-select');
  if (sel) sel.addEventListener('change', _render);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _resolveCountry, { once: true });
  } else {
    _resolveCountry();
  }
})();
