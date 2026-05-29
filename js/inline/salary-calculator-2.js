// ── STATE ──
let USER = {};
let activeRaisePct = 10;
let lifetimeChart = null;
let _calcRAF = null; // SC-PERF-2 — rAF handle for debounced calc()
let _initDone = false; // SC-AUTH-RACE — init() runs once, after DOM ready

// ── SHARED HELPERS (SC-P0 batch, 2026-05-25) ──────────────────────────────
// Inlined from /debt-optimizer + /net-worth + /goals + /recurring conventions
// so this page can match their XSS/storage/validation discipline without
// reaching outside the inline bundle. None of these helpers depend on USER
// or DOM, so they're safe to declare at module top.

// SC-SEC-1/2 — HTML-escape any string before innerHTML interpolation. Prevents
// reflected XSS via LLM reply (Sage), user-tampered storage (USER.currency),
// or future user-controlled fields (role aliases, etc.).
function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// SC-CROSS — prototype-pollution-safe JSON parse. Strips __proto__ /
// constructor / prototype keys so a tampered localStorage record can't
// mutate Object.prototype on read.
function _safeParseJson(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  let parsed;
  try { parsed = JSON.parse(raw); } catch (_) { return null; }
  const strip = (o) => {
    if (!o || typeof o !== 'object') return o;
    if (Array.isArray(o)) return o.map(strip);
    const out = Object.create(null);
    for (const k of Object.keys(o)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      out[k] = strip(o[k]);
    }
    return out;
  };
  return strip(parsed);
}

// SC-FUNC strict-finite parser (same contract as /debt-optimizer's). Rejects
// scientific notation, NaN, Infinity; clamps to [0, maxValue]. Falls back to
// returning null on any non-numeric input so the caller can handle it.
function _parseFiniteAmount(raw, maxValue) {
  const str = String(raw == null ? '' : raw).trim();
  if (!/^-?\d*\.?\d+$/.test(str)) return null;
  const n = parseFloat(str);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return null;
  if (typeof maxValue === 'number' && n > maxValue) return null;
  return n;
}

// SC-PERF-2 — debounced calc() using requestAnimationFrame. Pre-fix every
// keystroke fired a full calc + chart destroy/rebuild + raise-grid rebuild;
// on mobile this jank-stuttered. Coalescing to one calc per animation frame
// (~16ms) preserves real-time feel while eliminating wasted renders.
function calcDebounced() {
  if (_calcRAF != null) return;
  _calcRAF = requestAnimationFrame(() => {
    _calcRAF = null;
    calc();
  });
}

// SC-DES-1 — canonical currency-symbol read. Prior bug at line 828 used
// `(window.USER && USER.currency) || '$'` which always fell back to '$'
// because `window.USER` is never set (the USER global is module-scoped).
// Use this helper everywhere instead of inlining the PFCSym/USER.currency
// branch — single source of truth + auto-currency aware for €/£/etc.
function _sym() {
  return window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$');
}

// ── MARKET RATE DATABASE ──
// Multipliers relative to a $50k baseline, adjusted by exp/country/industry/company
const INDUSTRY_MULT = {
  tech:1.45, finance:1.35, consulting:1.3, legal:1.3, engineering:1.2,
  healthcare:1.15, design:1.05, marketing:1.0, hr:0.95, education:0.85,
  hospitality:0.8, retail:0.8, other:1.0,
};
// COUNTRY_MULT — converts US median (USD) to LOCAL currency equivalents for
// roles that don't have explicit per-country medians in PFC_WAGES_BY_COUNTRY.
//
// These multipliers were RECALIBRATED in May 2026 via regression against
// the 31-point tier-1 per-country dataset (national statistical office
// medians for the highest-traffic roles across GB / FR / DE / CA / AU / SG /
// IE). Method: for each country, compute the ratio of (per-country wage in
// local currency / US median in USD) for every SOC code with per-country
// data, then take the median ratio across all SOCs. This gives a robust
// central tendency that survives outliers in any single occupation.
//
// Pre-recalibration multipliers were set during the formula-baseline era
// (when EVERY country wage was derived from $50k × multiplier) and were
// systematically too generous for GB/FR/DE (because the formula was built
// to produce reasonable-looking USD-equivalents, not local-currency medians).
//
// Markets without per-country tier-1 data (ZA, MU, IN, AE, NG, KE, GH, BR,
// PH) keep their original PPP-adjusted approximations.
const COUNTRY_MULT = {
  US: 1.00,
  // Recalibrated against the 31-point per-country dataset (May 2026):
  GB: 0.47,   // was 0.82 — ONS ASHE median ratios across 31 SOCs
  IE: 0.65,   // NEW entry — CSO Earnings Survey median ratios
  FR: 0.48,   // was 0.72 — Insee/Apec median ratios
  DE: 0.62,   // was 0.78 — Destatis Verdienste median ratios
  CA: 0.89,   // was 0.85 — Statistics Canada LFS median ratios (CAD)
  AU: 1.07,   // was 0.88 — ABS Employee Earnings median ratios (AUD)
  SG: 0.85,   // was 0.80 — MOM Occupational Wages median ratios (SGD)
  // Markets without tier-1 per-country data — PPP-adjusted approximations:
  AE: 0.75, ZA: 0.35, MU: 0.28, IN: 0.22, NG: 0.25, KE: 0.22, GH: 0.20, BR: 0.32, PH: 0.25,
};
const COMPANY_MULT = { startup:0.9, small:0.95, mid:1.0, large:1.1, enterprise:1.18 };
const EXP_MULT = (y) => {
  if (y <= 1)  return 0.72;
  if (y <= 3)  return 0.88;
  if (y <= 6)  return 1.0;
  if (y <= 10) return 1.18;
  if (y <= 15) return 1.35;
  return 1.5;
};

// Seniority multiplier inferred from the role text. Real titles carry signal
// that a flat industry × country × company × experience formula misses (a
// "Director of Engineering" earns 2× a "Junior Engineer" in the same industry
// and country). Patterns are matched against the lowercased role string in
// priority order — first match wins.
const SENIORITY_PATTERNS = [
  { re: /\b(chief|c[eo]o|cfo|cto|cpo|cmo)\b/, mult: 2.5,  label: 'C-suite' },
  { re: /\b(vp|vice[\s-]?president)\b/,        mult: 2.0,  label: 'VP' },
  { re: /\bhead of\b/,                         mult: 1.8,  label: 'Head of' },
  { re: /\b(director)\b/,                      mult: 1.65, label: 'Director' },
  { re: /\b(principal|staff)\b/,               mult: 1.5,  label: 'Principal / Staff' },
  { re: /\b(manager|lead)\b/,                  mult: 1.35, label: 'Manager / Lead' },
  { re: /\b(senior|sr\.?)\b/,                  mult: 1.25, label: 'Senior' },
  { re: /\b(junior|jr\.?|associate|entry)\b/,  mult: 0.78, label: 'Junior / Associate' },
  { re: /\b(intern|trainee|apprentice|graduate|grad)\b/, mult: 0.5, label: 'Intern / Trainee' },
];
function getSeniority(roleText) {
  const t = (roleText || '').toLowerCase();
  for (const p of SENIORITY_PATTERNS) {
    if (p.re.test(t)) return { mult: p.mult, label: p.label };
  }
  return { mult: 1.0, label: 'Mid-level' };
}

function getMarketRange(salary) {
  const role     = (document.getElementById('i-role').value || '').trim();
  const industry = document.getElementById('i-industry').value;
  const country  = document.getElementById('i-country').value;
  const company  = document.getElementById('i-company').value;
  const exp      = parseFloat(document.getElementById('i-exp').value) || 3;

  const seniority = getSeniority(role);

  // Try to anchor the band on a REAL BLS-sourced US median for the matched role.
  // If found, multiply by COUNTRY_MULT (PPP-style adjustment) + COMPANY_MULT +
  // a smaller EXP_MULT (because seniority keywords already shifted the band
  // through getSeniority). Falls back to the original formula when no match.
  let median, source, roleMatched;
  const match = (window.PFCSalaryRoles && window.PFCSalaryRoles.findRoleMatch)
    ? window.PFCSalaryRoles.findRoleMatch(role)
    : null;

  if (match && match.role && match.role.usMedian > 0) {
    // Real-data path
    roleMatched = match.role.title;
    source = 'real';
    // Prefer per-country median when available (sourced from each country's
    // national statistical office, in that country's local currency). Falls
    // back to US median × COUNTRY_MULT for roles outside the curated
    // per-country table.
    const perCountry = (window.PFCSalaryRoles && window.PFCSalaryRoles.getCountryWage)
      ? window.PFCSalaryRoles.getCountryWage(match.role.soc, country)
      : null;
    const countryBase = (perCountry != null)
      ? perCountry
      : match.role.usMedian * (COUNTRY_MULT[country] || 0.5);
    // Track whether this was a per-country hit (for the badge text).
    source = (perCountry != null) ? 'real-country' : 'real';
    // Seniority + experience + industry shims apply on top of the role anchor.
    // "Senior X" should land above base "X" median; junior should land below.
    const seniorityShim = seniority.mult >= 1.2 ? (seniority.mult * 0.85 + 0.15)
                       : seniority.mult <= 0.8 ? (seniority.mult * 0.85 + 0.15)
                       : 1.0;
    const expShim = exp <= 1 ? 0.85 : exp <= 3 ? 0.95 : exp <= 8 ? 1.0 : 1.08;
    // Industry shim: per-country median already averages across industries,
    // so the full INDUSTRY_MULT swing (0.80–1.45 in the formula path) would
    // double-count. We dampen the deviation from 1.0 to 40% of its formula
    // value — a Software Developer in Healthcare lands ~6% below the role
    // median (instead of -15%), and in Finance/Consulting ~14% above
    // (instead of +30%). This captures real within-role industry variance
    // without overpowering the role anchor.
    const rawIndustryMult = INDUSTRY_MULT[industry] || 1;
    const industryShim = 1 + (rawIndustryMult - 1) * 0.4;
    median = countryBase
      * (COMPANY_MULT[company] || 1)
      * expShim
      * seniorityShim
      * industryShim;
  } else {
    // Formula fallback — same baseline as before the BLS taxonomy was added.
    roleMatched = null;
    source = 'estimate';
    const base = 50000;
    median = base
      * (INDUSTRY_MULT[industry] || 1)
      * (COUNTRY_MULT[country] || 0.5)
      * (COMPANY_MULT[company] || 1)
      * EXP_MULT(exp)
      * seniority.mult;
  }

  // Spread depends on seniority — junior bands are narrow, senior bands are wide
  // (a junior dev's pay sits within ±15% of median; a director's pay can range
  // ±35% depending on company stage and equity comp). Real-data bands are
  // slightly tighter because we have a stronger anchor.
  const baseSpread = seniority.mult >= 1.5 ? 0.35 : (seniority.mult >= 1.2 ? 0.28 : 0.18);
  const spread = source === 'real' ? baseSpread * 0.9 : baseSpread;

  return {
    low:    Math.round(median * (1 - spread)),
    median: Math.round(median),
    high:   Math.round(median * (1 + spread)),
    seniority: seniority.label,
    source: source,            // 'real' or 'estimate'
    roleMatched: roleMatched,  // canonical title when real, null when estimate
  };
}

// ── INIT ──
// Map browser locale → the best-matching country option in our dropdown. The
// dropdown's first <option> is MU which became a silent default for non-MU
// visitors. With this mapping a US visitor lands on US, a UK visitor on GB,
// etc. Falls back to MU only if neither the country nor language part of the
// locale matches any supported region — which is also fine because the user
// can change it.
const SUPPORTED_COUNTRIES = ['MU','US','GB','IE','FR','DE','ZA','IN','AU','CA','SG','AE','NG','KE','GH','BR','PH'];
const LANG_TO_COUNTRY = {
  'en': 'US', 'fr': 'FR', 'de': 'DE', 'pt': 'BR', 'tl': 'PH', 'fil': 'PH',
  'sw': 'KE', 'af': 'ZA', 'zu': 'ZA', 'ar': 'AE', 'hi': 'IN', 'ta': 'IN',
};
function detectCountryFromLocale() {
  try {
    const langs = (navigator.languages && navigator.languages.length)
      ? navigator.languages : [navigator.language || 'en-US'];
    for (const tag of langs) {
      if (!tag) continue;
      const parts = tag.split('-');
      const region = (parts[1] || '').toUpperCase();
      if (region && SUPPORTED_COUNTRIES.indexOf(region) !== -1) return region;
    }
    // Region didn't match — try language part
    for (const tag of langs) {
      const lang = (tag.split('-')[0] || '').toLowerCase();
      if (LANG_TO_COUNTRY[lang]) return LANG_TO_COUNTRY[lang];
    }
  } catch (_) {}
  return 'US';
}

// Populate the role autocomplete datalist from the BLS-sourced taxonomy.
// Browser-native <datalist> handles type-to-filter; we just have to seed it
// with all canonical titles once at init.
function populateRoleDatalist() {
  const dl = document.getElementById('role-suggestions');
  if (!dl || !window.PFCSalaryRoles || !window.PFCSalaryRoles.getAllTitlesForDatalist) return;
  const titles = window.PFCSalaryRoles.getAllTitlesForDatalist();
  // SC-SEC — escHtml full sweep (was: only `"` was escaped). Future-proofs
  // against title strings containing `<`, `>`, `&`, `'` if the data source
  // ever loosens from the curated static file.
  dl.innerHTML = titles.map(t => '<option value="' + escHtml(t) + '"></option>').join('');
}

function init() {
  if (_initDone) return; // SC-AUTH-RACE — guard against double-init
  _initDone = true;
  try { USER = (typeof PFCUser !== 'undefined') ? PFCUser.get() : (PFCStorage.getJSON('user') || {}); } catch(e) { USER = {}; }
  const sym = _sym();
  ['sym-label','sym-custom','sym-offer'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = sym;
  });
  populateRoleDatalist();
  // Set the country dropdown to match the browser's locale on first load.
  // If the user already saved a country via onboarding (USER.country), prefer
  // that; otherwise fall back to locale detection. Manual selection overrides
  // both because the dropdown is editable.
  const countrySelect = document.getElementById('i-country');
  if (countrySelect) {
    const preferred = (USER.country && SUPPORTED_COUNTRIES.indexOf(USER.country) !== -1)
      ? USER.country
      : detectCountryFromLocale();
    countrySelect.value = preferred;
  }
  // Sidebar user-pill hydrated by js/pfc-sidebar.js;
  // plan badge by PFCPlan.applyBadges().
  // SC-FUNC-3 (audit 2026-05-25, hardened post-verifier) — same magnitude
  // check the rehydrate path uses. USER.income is contractually monthly;
  // if any code path ever wrote annual the ×12 would balloon to 12M+. Cap
  // at 10M matches _parseFiniteAmount's max and prevents a paint of a
  // 12-million prefill before rehydrate ever fires.
  if (USER.income > 0) {
    const annualised = USER.income * 12;
    if (annualised <= 10000000) {
      const el = document.getElementById('i-salary');
      if (el) el.value = annualised;
    }
  }

  buildRaiseGrid(null, null);
  calc();
}

// ── RAISE GRID ──
// SC-SEC-2 fix (audit 2026-05-25) — inline `onclick="selectRaise(${p})"` is
// CSP-hostile (`script-src-attr 'none'` makes every click a DEAD CLICK at
// runtime). Migrated to the `data-pfc-on-click` pattern wired by
// pfc-inline-bootstrap.js — same as R-P0-6+7 / G-P0-5 on adjacent pages.
// Pct is numeric so no escHtml needed in the data attribute interpolation.
function buildRaiseGrid(salary, sym) {
  const pcts = [3, 5, 8, 10, 12, 15, 18, 20, 25];
  const grid = document.getElementById('raise-grid');
  if (!grid) return; // SC-A11Y null-guard (init runs after DOMContentLoaded but defensive)
  grid.style.gridTemplateColumns = `repeat(${pcts.length}, 1fr)`;
  grid.innerHTML = pcts.map(p => {
    const amt = salary ? Math.round(salary * p / 100) : null;
    return `<div class="raise-btn ${p === activeRaisePct ? 'active' : ''}" role="button" tabindex="0" data-pfc-on-click="selectRaise" data-pfc-arg="${p}" id="rbtn-${p}" aria-pressed="${p === activeRaisePct ? 'true' : 'false'}">
      <div class="pct">+${p}%</div>
      <div class="amt">${amt ? (sym || '$') + Math.round(amt).toLocaleString() : '—'}</div>
    </div>`;
  }).join('');
}

function selectRaise(pct) {
  activeRaisePct = pct;
  const salary = parseFloat(document.getElementById('i-salary').value) || 0;
  const target = salary ? Math.round(salary * (1 + pct / 100)) : '';
  document.getElementById('i-target').value = target || '';
  document.querySelectorAll('.raise-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('rbtn-' + pct)?.classList.add('active');
  calc();
}

function setCustomTarget() {
  document.querySelectorAll('.raise-btn').forEach(b => b.classList.remove('active'));
  activeRaisePct = null;
  calc();
}

// ── MAIN CALC ──
// SC-FUNC-3 (2026-05-25) — clamp salary at 10M (mortgages worldwide). Pre-fix
// `parseFloat` accepted "1e308" → Infinity → lifetime chart axis broke and
// metric cards showed "$Infinity". The strict validator returns null on
// non-numeric / overflow input; we fall back to 0 (same as the prior || 0).
function calc() {
  const salary  = _parseFiniteAmount(document.getElementById('i-salary').value, 10000000) || 0;
  const sym     = _sym();
  const expRaw  = _parseFiniteAmount(document.getElementById('i-exp').value, 50);
  const exp     = expRaw == null ? 0 : expRaw;

  // Rebuild raise grid with amounts
  buildRaiseGrid(salary, sym);
  if (activeRaisePct) document.getElementById('rbtn-' + activeRaisePct)?.classList.add('active');

  // Target salary
  let target = _parseFiniteAmount(document.getElementById('i-target').value, 10000000) || 0;
  if (!target && salary && activeRaisePct) {
    target = Math.round(salary * (1 + activeRaisePct / 100));
    document.getElementById('i-target').value = target;
  }

  // Market range
  const range = getMarketRange(salary);
  updateMarketRange(range, salary, target, sym);
  updateTakeHomeCta();

  if (!salary || !target || target <= salary) {
    clearMetrics(sym);
    return;
  }

  const raise      = target - salary;
  const raisePct   = raise / salary * 100;
  const monthly    = Math.round(raise / 12);
  const careerYrs  = Math.max(5, 40 - exp);

  // 5-year compounding (3% annual raise each year on new base)
  let curr = salary, newB = target, cumGain = 0;
  const yrRows = [];
  for (let yr = 1; yr <= 5; yr++) {
    curr  = Math.round(curr  * 1.03);
    newB  = Math.round(newB  * 1.03);
    const gain = newB - curr;
    cumGain += gain;
    yrRows.push({ yr, curr, newB, gain, cumGain });
  }
  const fiveYrExtra = cumGain;

  // Lifetime compounding
  let lCurr = salary, lNew = target, lifetimeGain = 0;
  const ltCurr = [], ltNew = [];
  for (let yr = 0; yr < careerYrs; yr++) {
    ltCurr.push(Math.round(lCurr));
    ltNew.push(Math.round(lNew));
    lifetimeGain += lNew - lCurr;
    lCurr *= 1.03;
    lNew  *= 1.03;
  }

  // Update metrics
  document.getElementById('m-raise').textContent  = sym + raise.toLocaleString();
  document.getElementById('m-raise-hint').textContent = '+' + raisePct.toFixed(1) + '% per year';
  document.getElementById('m-monthly').textContent = sym + monthly.toLocaleString();
  document.getElementById('m-5yr').textContent    = sym + fiveYrExtra.toLocaleString();
  document.getElementById('m-lifetime').textContent = sym + Math.round(lifetimeGain / 1000) + 'k';
  document.getElementById('m-lifetime-hint').textContent = `over ~${careerYrs} more career years`;

  // Topbar
  const role = document.getElementById('i-role').value.trim() || 'your role';
  document.getElementById('topbar-sub').textContent =
    `${role} · ${sym}${salary.toLocaleString()} → ${sym}${target.toLocaleString()} · +${raisePct.toFixed(1)}% · ${sym}${monthly.toLocaleString()}/mo more`;

  // 5-year table
  const tbody = document.getElementById('yr-body');
  tbody.innerHTML = yrRows.map(r => `
    <tr class="${r.yr === 5 ? 'highlight-row' : ''}">
      <td>Year ${r.yr}</td>
      <td style="color:var(--text3);">${sym}${r.curr.toLocaleString()}</td>
      <td style="color:var(--text);">${sym}${r.newB.toLocaleString()}</td>
      <td class="gain">+${sym}${r.cumGain.toLocaleString()}</td>
    </tr>`
  ).join('');

  // Lifetime chart
  renderLifetimeChart(ltCurr, ltNew, sym, careerYrs);

  // DEF-4 (2026-05-25) — "Your raise, applied" cross-link insight card.
  // Translates the abstract lifetime-impact number into concrete months-
  // sooner outcomes on /goals + /debt-optimizer. Silent skip when no
  // goals/debts in storage. Pure-browser closed-form math (no PFCDebtEngine
  // import needed — it isn't loaded on this page).
  renderRaiseApplied(monthly, sym);

  // Benefits base
  calcBenefits();

  // Counter-offer
  calcCounter();
}

// DEF-4 helper — "Your raise, applied" cross-link card.
function renderRaiseApplied(monthly, sym) {
  const card = document.getElementById('raise-applied-card');
  if (!card) return;
  const rowsEl = document.getElementById('raise-applied-rows');
  if (!rowsEl) return;
  if (!monthly || monthly <= 0) { card.style.display = 'none'; return; }

  // Storage reads — defensive: never throw, never leak across users.
  let goals = [], debts = [];
  try {
    const g = (typeof PFCStorage !== 'undefined') ? PFCStorage.getJSON('goals') : null;
    if (Array.isArray(g)) goals = g;
  } catch (_) {}
  try {
    const d = (typeof PFCStorage !== 'undefined') ? PFCStorage.getJSON('debts') : null;
    if (Array.isArray(d)) debts = d;
  } catch (_) {}

  const rows = [];

  // ── Top goal — "X months sooner" ──────────────────────────────────────
  // Pick the goal with the LARGEST remaining shortfall and a positive
  // monthlyNeeded. Skip 100%-funded or untargeted goals. Math: months
  // sooner = remaining / monthlyNeeded - remaining / (monthlyNeeded + monthly).
  if (goals.length > 0) {
    let top = null;
    let topRemaining = 0;
    for (const g of goals) {
      const target = Number(g.target) || 0;
      const current = Number(g.current) || 0;
      const mn = Number(g.monthlyNeeded) || 0;
      const remaining = target - current;
      if (target <= 0 || remaining <= 0 || mn <= 0) continue;
      if (remaining > topRemaining) { top = g; topRemaining = remaining; }
    }
    if (top) {
      const mn = Number(top.monthlyNeeded) || 0;
      const remaining = (Number(top.target) || 0) - (Number(top.current) || 0);
      const currentMonths = remaining / mn;
      const newMonths = remaining / (mn + monthly);
      const sooner = Math.max(0, Math.round(currentMonths - newMonths));
      if (sooner >= 1) {
        rows.push(_raiseAppliedRowHtml({
          icon: '◎',
          label: escHtml(top.name || 'your top goal'),
          insight: `Funded <strong style="color:var(--teal);">${sooner} month${sooner !== 1 ? 's' : ''} sooner</strong> (was ${Math.round(currentMonths)} mo, now ${Math.round(newMonths)} mo at ${sym}${Math.round(mn + monthly).toLocaleString()}/mo)`,
          ctaLabel: 'Open Goals',
          ctaHref: '/goals.html'
        }));
      }
    }
  }

  // ── Top debt — "X months earlier debt-free" ──────────────────────────
  // Pick the HIGHEST-rate debt with positive balance + minPay. Closed-form
  // NPER differential: months = -log(1 - r*PV/PMT) / log(1+r) per period.
  // Guards: rate=0 → straight balance / minPay. minPay+monthly not covering
  // monthly interest → cannot pay off, skip silently.
  if (debts.length > 0) {
    let top = null;
    let topRate = -1;
    for (const d of debts) {
      const balance = Number(d.balance) || 0;
      const rate = Number(d.rate) || 0;
      const minPay = Number(d.minPay) || 0;
      if (balance <= 0 || minPay <= 0) continue;
      if (rate > topRate) { top = d; topRate = rate; }
    }
    if (top) {
      const balance = Number(top.balance) || 0;
      const minPay = Number(top.minPay) || 0;
      const rate = Number(top.rate) || 0;
      const monthlyRate = rate / 100 / 12;
      const newPay = minPay + monthly;
      const nper = (pmt, pv, r) => {
        if (r === 0) return pv / pmt;
        if (pmt <= pv * r) return null; // payment doesn't cover interest
        return -Math.log(1 - r * pv / pmt) / Math.log(1 + r);
      };
      const currentMonths = nper(minPay, balance, monthlyRate);
      const newMonthsCalc = nper(newPay, balance, monthlyRate);
      if (currentMonths != null && newMonthsCalc != null && isFinite(currentMonths) && isFinite(newMonthsCalc)) {
        const sooner = Math.max(0, Math.round(currentMonths - newMonthsCalc));
        if (sooner >= 1) {
          rows.push(_raiseAppliedRowHtml({
            icon: '◈',
            label: escHtml(top.name || 'your highest-rate debt'),
            insight: `Paid off <strong style="color:var(--teal);">${sooner} month${sooner !== 1 ? 's' : ''} sooner</strong> (was ${Math.round(currentMonths)} mo, now ${Math.round(newMonthsCalc)} mo at ${sym}${Math.round(newPay).toLocaleString()}/mo)`,
            ctaLabel: 'Open Debt Strategy',
            ctaHref: '/debt-optimizer.html'
          }));
        }
      }
    }
  }

  if (rows.length === 0) {
    card.style.display = 'none';
    return;
  }
  rowsEl.innerHTML = rows.join('');
  card.style.display = 'block';
}

// DEF2-2 (Senior Designer 2026-05-25) — Compare two offers feature. Reads
// 14 inputs (7 per offer), computes total-comp per offer, surfaces verdict
// with delta + plain-English recommendation. Approximates net delta via
// the country's effective rate (no cross-page tax engine call needed —
// effective rate is good enough for a "which offer is better" decision).
//
// Total-comp formula per offer:
//   total = base + (base × bonusPct/100) + equity + health + (base × pensionPct/100) + wfh + (base/260 × ptoDays)
//
// PTO valuation = days × daily base rate (base / 260 working days). This
// matches the formula already used in calcBenefits() for consistency.
//
// Verdict copy: leads with the bigger number, names the delta, and uses
// the editorial Fraunces italic — matches the post-DTI-banner voice.
// DEF4 (2026-05-25) — async because PFCTaxLibrary.calculate is now async
// (ensureCountry awaits the lazy region load). Library call sites that
// fail (network drop, country file 404) gracefully fall back to pre-tax-
// only verdict — never throw user-visible errors.
async function compareOffers() {
  const verdict = document.getElementById('compare-verdict');
  if (!verdict) return;
  function readOffer(prefix) {
    const get = (id) => _parseFiniteAmount(document.getElementById(prefix + id).value, 10000000) || 0;
    const getPct = (id) => _parseFiniteAmount(document.getElementById(prefix + id).value, 500) || 0;
    const getDays = (id) => _parseFiniteAmount(document.getElementById(prefix + id).value, 365) || 0;
    const base = get('base');
    const bonusPct = getPct('bonus');
    const equity = get('equity');
    const health = get('health');
    const pensionPct = getPct('pension');
    const wfh = get('wfh');
    const ptoDays = getDays('pto');
    const bonus = base * bonusPct / 100;
    const pension = base * pensionPct / 100;
    const ptoValue = ptoDays * (base / 260);
    const total = Math.round(base + bonus + equity + health + pension + wfh + ptoValue);
    return { base, bonusPct, bonus, equity, health, pensionPct, pension, wfh, ptoDays, ptoValue, total };
  }
  const A = readOffer('cmpA-');
  const B = readOffer('cmpB-');

  // If neither offer has a base, leave the empty-state copy intact.
  if (A.base <= 0 && B.base <= 0) {
    verdict.style.display = 'none';
    return;
  }
  verdict.style.display = 'block';
  const sym = _sym();

  // DEF3-2 (2026-05-25) — net-tax delta. Route each offer's TAXABLE
  // portion (base + bonus, not equity/health/wfh/PTO which are non-cash
  // or in-kind) through PFCTaxLibrary if available. Falls back to the
  // pre-tax comparison if the library isn't on the page (salary-calc
  // doesn't currently bundle the tax library — this is the lift this batch).
  // For now we approximate net via the country dropdown's selected
  // country code, which we read from the SAME #i-country select that
  // drives the market range — already on the page.
  const countryCode = (document.getElementById('i-country') && document.getElementById('i-country').value) || '';
  let netA = null, netB = null;
  if (typeof window.PFCTaxLibrary !== 'undefined' && PFCTaxLibrary.calculate && countryCode) {
    try {
      // Tax the cash portion only (base + bonus). Equity, benefits, PTO
      // valuation, WFH commute-saved are not cash earned this year.
      const cashA = A.base + A.bonus + A.pension;
      const cashB = B.base + B.bonus + B.pension;
      // DEF4 — await both calculates. Same countryCode means second call
      // hits the cached region file; only the first call triggers any
      // network round-trip (~50ms typical).
      const tA = await PFCTaxLibrary.calculate({ countryCode, salary: cashA });
      const tB = await PFCTaxLibrary.calculate({ countryCode, salary: cashB });
      netA = tA.takeHome + A.equity + A.health + A.wfh + A.ptoValue;
      netB = tB.takeHome + B.equity + B.health + B.wfh + B.ptoValue;
    } catch (_) { netA = null; netB = null; }
  }

  document.getElementById('cmp-totalA').textContent = A.base > 0 ? sym + A.total.toLocaleString() : '—';
  document.getElementById('cmp-totalB').textContent = B.base > 0 ? sym + B.total.toLocaleString() : '—';

  // Delta + recommendation only when BOTH offers have a base
  const deltaEl = document.getElementById('cmp-delta');
  const verdictEl = document.getElementById('cmp-verdict-text');
  if (A.base <= 0 || B.base <= 0) {
    deltaEl.textContent = '—';
    deltaEl.style.color = 'var(--text3)';
    verdictEl.textContent = 'Fill in both columns above to see the side-by-side verdict.';
    return;
  }
  const delta = B.total - A.total;
  const absDelta = Math.abs(delta);
  const winner = delta > 0 ? 'Offer B' : delta < 0 ? 'Offer A' : 'Tied';
  const winnerColor = delta > 0 ? 'var(--amber)' : delta < 0 ? 'var(--teal)' : 'var(--text2)';
  deltaEl.textContent = (delta > 0 ? '+' : delta < 0 ? '−' : '') + sym + absDelta.toLocaleString();
  deltaEl.style.color = winnerColor;

  // Editorial verdict — name the bigger number, the gap, and the lever
  // that drove it (base vs equity vs benefits) so the user sees WHY.
  let lever = '';
  if (absDelta > 0) {
    const baseDelta = B.base - A.base;
    const equityDelta = B.equity - A.equity;
    const benefitDelta = (B.health + B.pension + B.wfh + B.ptoValue) - (A.health + A.pension + A.wfh + A.ptoValue);
    const driver = Math.max(Math.abs(baseDelta), Math.abs(equityDelta), Math.abs(benefitDelta));
    if (driver === Math.abs(baseDelta) && baseDelta !== 0) {
      lever = ' driven mostly by a ' + sym + Math.abs(Math.round(baseDelta)).toLocaleString() + ' difference in base';
    } else if (driver === Math.abs(equityDelta) && equityDelta !== 0) {
      lever = ' driven mostly by equity (' + sym + Math.abs(Math.round(equityDelta)).toLocaleString() + ' delta — remember equity is a 4-year promise, not cash today)';
    } else if (driver === Math.abs(benefitDelta) && benefitDelta !== 0) {
      lever = ' driven mostly by benefits + PTO (' + sym + Math.abs(Math.round(benefitDelta)).toLocaleString() + ' delta — non-cash but real)';
    }
  }
  // DEF3-2 — append the AFTER-TAX delta when the library produced it.
  // Pre-tax delta is what most calculators stop at; after-tax is the
  // number that actually hits your bank. The two often disagree because
  // higher base pushes more income into a higher marginal bracket.
  let netSentence = '';
  if (netA != null && netB != null && A.base > 0 && B.base > 0) {
    const netDelta = Math.round(netB - netA);
    const netAbs = Math.abs(netDelta);
    const netWinner = netDelta > 0 ? 'Offer B' : netDelta < 0 ? 'Offer A' : 'still tied';
    if (netDelta === 0) {
      netSentence = ' After tax, the offers are still even.';
    } else if (Math.sign(netDelta) === Math.sign(delta)) {
      // Same winner pre and post tax — reinforce
      netSentence = ' After tax, ' + netWinner + ' is still ahead — by ' + sym + netAbs.toLocaleString() + '/yr (' + sym + Math.round(netAbs / 12).toLocaleString() + '/mo).';
    } else {
      // FLIPPED — most useful insight (high-base offer can lose to better-benefits offer once tax bites)
      netSentence = ' But after tax, the winner FLIPS: ' + netWinner + ' actually nets ' + sym + netAbs.toLocaleString() + '/yr more because the higher base pushes ' + (delta > 0 ? 'Offer B' : 'Offer A') + ' into a higher tax bracket.';
    }
  }

  if (delta === 0) {
    verdictEl.textContent = 'The two offers are exactly even on total comp. Decide on fit, team, and growth trajectory instead.' + netSentence;
  } else {
    verdictEl.textContent = winner + ' is worth ' + sym + absDelta.toLocaleString() + ' more per year' + lever + '.' + netSentence;
  }
}

// Pure presentation — each row in the raise-applied card. All user-controlled
// text already escHtml'd by caller; CTA href is a hardcoded route.
function _raiseAppliedRowHtml({ icon, label, insight, ctaLabel, ctaHref }) {
  return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:12px 14px;background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:var(--r-sm);">
    <div style="display:flex;align-items:flex-start;gap:10px;flex:1;min-width:200px;">
      <span style="font-size:18px;line-height:1;color:var(--teal);">${icon}</span>
      <div style="flex:1;font-size:13px;line-height:1.55;color:var(--text2);">
        <strong style="color:var(--text);">${label}</strong> — ${insight}
      </div>
    </div>
    <a href="${ctaHref}" style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;background:transparent;color:var(--text);font-weight:600;font-size:12px;border:1px solid var(--border2);border-radius:var(--r-sm);text-decoration:none;font-family:var(--font-body);white-space:nowrap;">
      ${ctaLabel}
      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3 7h8m-3-3l3 3-3 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </a>
  </div>`;
}

function clearMetrics(sym) {
  ['m-raise','m-monthly','m-5yr','m-lifetime'].forEach(id => document.getElementById(id).textContent = '—');
  document.getElementById('yr-body').innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:20px 0;">Enter your salary and target above</td></tr>';
  if (lifetimeChart) { lifetimeChart.destroy(); lifetimeChart = null; }
  // DEF-4 — hide the raise-applied card too when there's nothing to apply.
  const raiseCard = document.getElementById('raise-applied-card');
  if (raiseCard) raiseCard.style.display = 'none';
}

// ── MARKET RANGE UI ──
function updateMarketRange(range, salary, target, sym) {
  document.getElementById('r-low').textContent  = sym + range.low.toLocaleString();
  document.getElementById('r-mid').textContent  = sym + range.median.toLocaleString();
  document.getElementById('r-high').textContent = sym + range.high.toLocaleString();

  // Show the detected seniority label so users can verify the role input is
  // actually influencing the band. Falls back to 'Mid-level' for any role
  // without seniority keywords (which is fine — that's still real signal).
  const senBadge = document.getElementById('seniority-badge');
  if (senBadge) {
    const roleText = (document.getElementById('i-role').value || '').trim();
    if (roleText && range.seniority) {
      senBadge.textContent = range.seniority;
      senBadge.style.display = 'inline-block';
    } else {
      senBadge.style.display = 'none';
    }
  }

  // Source badge: green "Real data" when the role text matched a BLS-sourced
  // entry; gold "Estimate" otherwise. Lets the user know whether they're
  // looking at a real anchor or the fallback formula.
  const srcBadge = document.getElementById('source-badge');
  if (srcBadge) {
    if (range.source === 'real-country') {
      // Best case: per-country median from ONS/Insee/Destatis/etc.
      srcBadge.textContent = 'Real ' + ((document.getElementById('i-country').value || '').toUpperCase()) + ' data';
      srcBadge.style.background = 'rgba(43,182,125,0.16)';
      srcBadge.style.color = 'var(--money, #2BB67D)';
      srcBadge.style.borderColor = 'rgba(43,182,125,0.40)';
      srcBadge.style.display = 'inline-block';
    } else if (range.source === 'real') {
      // BLS US median + COUNTRY_MULT adjustment (no per-country entry yet)
      srcBadge.textContent = 'BLS · adjusted';
      srcBadge.style.background = 'rgba(43,182,125,0.10)';
      srcBadge.style.color = 'var(--money, #2BB67D)';
      srcBadge.style.borderColor = 'rgba(43,182,125,0.25)';
      srcBadge.style.display = 'inline-block';
    } else if ((document.getElementById('i-role').value || '').trim()) {
      srcBadge.textContent = 'Estimate · formula';
      srcBadge.style.background = 'var(--gold-soft)';
      srcBadge.style.color = 'var(--gold)';
      srcBadge.style.borderColor = 'rgba(212,175,106,0.25)';
      srcBadge.style.display = 'inline-block';
    } else {
      srcBadge.style.display = 'none';
    }
  }

  if (!salary) { document.getElementById('position-box').style.display = 'none'; return; }

  // Position markers on bar
  const span = range.high - range.low;
  const youPct  = span > 0 ? Math.min(95, Math.max(5, (salary - range.low) / span * 100)) : 50;
  const targPct = target && span > 0 ? Math.min(95, Math.max(5, (target - range.low) / span * 100)) : null;

  document.getElementById('you-marker').style.left  = youPct + '%';
  if (targPct !== null) {
    document.getElementById('target-marker').style.left    = targPct + '%';
    document.getElementById('target-marker').style.display = 'block';
  } else {
    document.getElementById('target-marker').style.display = 'none';
  }

  // Market-position gauge — needle climbs from 25th (left) to 75th (right) percentile
  const gaugeSvg = document.getElementById('market-gauge');
  const gaugeLabel = document.getElementById('market-gauge-label');
  if (gaugeSvg && gaugeLabel) {
    const gPct = targPct !== null ? Math.max(0, Math.min(100, targPct)) : 0;
    if (window.PFCMotion) {
      window.PFCMotion.gaugeNeedle(gaugeSvg, window._lastSalaryGaugePct || 0, gPct, {
        minAngle: -90, maxAngle: 90, cx: 100, cy: 110, duration: 720
      });
    } else {
      const a = -90 + 180 * (gPct / 100);
      const needle = gaugeSvg.querySelector('#pfc-needle');
      if (needle) needle.setAttribute('transform', 'rotate(' + a.toFixed(2) + ' 100 110)');
    }
    window._lastSalaryGaugePct = gPct;
    if (target == null) gaugeLabel.textContent = 'Pick a target above to see your market position.';
    else if (target < range.low) gaugeLabel.textContent = 'Below the 25th percentile — strong case for a raise.';
    else if (target < range.median) gaugeLabel.textContent = 'Below median — a reasonable, well-supported ask.';
    else if (target < range.high) gaugeLabel.textContent = 'Above median — defensible with strong evidence.';
    else gaugeLabel.textContent = 'Top of market — focus negotiation on total comp.';
  }

  // Position assessment — emoji + malformed border both fixed (SC-VIS-1 + SC-DES-2).
  // Pre-fix the border read `${color.replace(...) === color ? color + '40' : color}22`
  // which evaluated to literal `var(--red)22` for every CSS variable color —
  // browsers ignored it, so the box border never painted. Replaced with a
  // rgba() with the brand color's RGB hex inline. Emoji ⚠️📊✅🏆 replaced by
  // status SVGs from PFCIcons (matches G-P2-1 / NW-P2-1 emoji-purge convention).
  const box = document.getElementById('position-box');
  let msg = '', bg = '', borderRgb = '', iconKey = 'other';
  if (salary < range.low) {
    msg = `You're earning <strong>${sym}${(range.low - salary).toLocaleString()} below</strong> the 25th percentile for your role. You have a strong case for a significant raise — market data strongly supports you.`;
    bg = 'rgba(224,82,82,0.08)'; borderRgb = 'rgba(224,82,82,0.30)'; iconKey = 'health'; // shield-cross subtle alert
  } else if (salary < range.median) {
    msg = `You're <strong>below the market median</strong> by ${sym}${(range.median - salary).toLocaleString()}. Asking to move to median is a very reasonable and data-backed request.`;
    bg = 'rgba(245,166,35,0.08)'; borderRgb = 'rgba(245,166,35,0.30)'; iconKey = 'finance';
  } else if (salary < range.high) {
    msg = `You're <strong>above median</strong> and in the upper-mid range. To push to the 75th percentile, emphasise specialised skills and impact. This is achievable.`;
    bg = 'rgba(43,182,125,0.08)'; borderRgb = 'rgba(43,182,125,0.30)'; iconKey = 'finance';
  } else {
    msg = `You're <strong>at or above the 75th percentile</strong> for your role. Focus your negotiation on total comp — bonus, equity, benefits, and flexibility rather than base.`;
    bg = 'rgba(59,130,246,0.08)'; borderRgb = 'rgba(59,130,246,0.30)'; iconKey = 'finance';
  }
  box.style.display = 'flex';
  box.style.alignItems = 'flex-start';
  box.style.gap = '10px';
  box.style.background = bg;
  box.style.border = '1px solid ' + borderRgb;
  box.style.color = 'var(--text2)';
  // PFCIcons.get returns a hardcoded SVG string (safe to interpolate); msg
  // contains only static template literals + numbers; no user input reaches
  // innerHTML here.
  const iconHtml = (typeof PFCIcons !== 'undefined' && PFCIcons.get) ? PFCIcons.get(iconKey) : '';
  box.innerHTML = '<span style="flex-shrink:0;display:inline-flex;color:' + borderRgb.replace('0.30', '0.80') + ';">' + iconHtml + '</span><span style="flex:1;">' + msg + '</span>';
}

// ── LIFETIME CHART ──
// SC-PERF-3 fix (2026-05-25) — typeof Chart guard. If the Chart.js CDN fails
// (network/CSP/blocked), without this guard renderLifetimeChart throws and
// the rest of calc() never completes, so the metric cards + table never
// update either. Now we silently skip the chart and surface a fallback text
// in the canvas's aria-label container (canvas itself stays inert for SR).
//
// SC-PERF-2 perf — chart.update() vs destroy/recreate. Pre-fix every keystroke
// destroyed the entire Chart instance + allocated a new one (heavy on mobile).
// Now we reuse the existing chart, swap labels + dataset data in place, then
// call .update('none') (no animation) for instant rendering.
function renderLifetimeChart(curr, newB, sym, years) {
  if (typeof Chart === 'undefined') {
    // Surface fallback so SR users still get the trend; remember last data
    // so the canvas re-render on reconnection has something to draw.
    const canvas = document.getElementById('lifetimeChart');
    if (canvas) canvas.setAttribute('aria-label', 'Lifetime earnings chart unavailable — Chart.js failed to load.');
    return;
  }
  const canvas = document.getElementById('lifetimeChart');
  if (!canvas) return;

  const labels = Array.from({ length: years }, (_, i) => 'Yr ' + (i + 1));

  // SC-A11Y-2 — sync aria-label with the data so screen readers hear the
  // headline takeaway even though the canvas itself is decorative pixels.
  const totalCurr = curr[curr.length - 1] || 0;
  const totalNew = newB[newB.length - 1] || 0;
  canvas.setAttribute('aria-label',
    'Lifetime earnings trajectory over ' + years + ' years. Without the raise, year ' + years + ' salary ' +
    sym + Math.round(totalCurr).toLocaleString() + '. With the raise, year ' + years + ' salary ' +
    sym + Math.round(totalNew).toLocaleString() + '. The widening gap is the raise compounding.');

  // SC-PERF — reuse existing chart instance when possible
  if (lifetimeChart) {
    lifetimeChart.data.labels = labels;
    lifetimeChart.data.datasets[0].data = curr;
    lifetimeChart.data.datasets[1].data = newB;
    // Tooltip callback closes over sym — refresh it each call to track currency changes.
    lifetimeChart.options.plugins.tooltip.callbacks.label = ctx =>
      ' ' + ctx.dataset.label + ': ' + sym + ctx.parsed.y.toLocaleString();
    lifetimeChart.options.scales.y.ticks.callback = v => sym + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v);
    lifetimeChart.update('none'); // no transition — keystroke-paced updates
    return;
  }

  lifetimeChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Without raise',
          data: curr,
          borderColor: '#E05252',
          backgroundColor: 'rgba(224,82,82,0.05)',
          borderWidth: 1.5,
          borderDash: [4,3],
          pointRadius: 0,
          tension: 0.3,
          fill: true,
        },
        {
          label: 'With raise',
          data: newB,
          borderColor: '#2BB67D',
          backgroundColor: 'rgba(43,182,125,0.07)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
          fill: true,
        },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: false, // SC-PERF — kill the entrance animation; tooltips still animate
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#16271F',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleColor: '#F0EDE2',
          bodyColor: '#B8C2BC',
          callbacks: { label: ctx => ' ' + ctx.dataset.label + ': ' + sym + ctx.parsed.y.toLocaleString() }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#4A5A6E', font: { size: 10 }, maxTicksLimit: 10 } },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#4A5A6E', font: { size: 10 }, callback: v => sym + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v) }
        }
      }
    }
  });
}

// ── COUNTER OFFER ──
function calcCounter() {
  const sym    = _sym();
  const offer  = _parseFiniteAmount(document.getElementById('i-offer').value, 10000000) || 0;
  const target = _parseFiniteAmount(document.getElementById('i-target').value, 10000000) || 0;
  const salary = _parseFiniteAmount(document.getElementById('i-salary').value, 10000000) || 0;

  document.getElementById('counter-results').style.display = offer ? 'block' : 'none';
  document.getElementById('counter-empty').style.display   = offer ? 'none' : 'block';

  if (!offer) return;

  // Floor the anchor at three sensible reference points so the counter is
  // ALWAYS above the offer:
  //   1. your target (if set) or current salary +15%
  //   2. the market median for the role
  //   3. their offer + 5% (a polite counter must exceed the offer)
  // Without this, a low current salary against a high offer used to produce
  // a counter LESS than the offer and a negative "above" gap.
  const range     = getMarketRange(salary);
  const rawAnchor = target || (salary * 1.15);
  const anchor    = Math.max(rawAnchor, range.median, offer * 1.05);
  const walkaway  = Math.max(offer, salary * 1.02);
  const counter   = Math.round(offer + (anchor - offer) * 0.65);
  const dream     = Math.round(anchor * 1.05);

  document.getElementById('c-offer').textContent    = sym + offer.toLocaleString();
  document.getElementById('c-offer').style.color    = offer < (salary * 1.05) ? 'var(--red)' : 'var(--amber)';
  document.getElementById('c-walkaway').textContent = sym + walkaway.toLocaleString();
  document.getElementById('c-counter').textContent  = sym + counter.toLocaleString();
  document.getElementById('c-dream').textContent    = sym + dream.toLocaleString();

  // Zone bar (offer=0%, anchor=100%)
  const span = anchor - offer;
  const walkPct    = span > 0 ? ((walkaway - offer) / span * 100) : 5;
  const counterPct = span > 0 ? ((counter - offer) / span * 100) : 65;
  document.getElementById('counter-zone').style.cssText =
    `left:${walkPct.toFixed(0)}%;width:${(counterPct - walkPct).toFixed(0)}%;position:absolute;height:100%;border-radius:4px;background:linear-gradient(90deg,rgba(245,166,35,0.4),rgba(43,182,125,0.4));transition:all .4s;`;

  const gap = counter - offer;
  document.getElementById('counter-advice').innerHTML =
    `Counter with <strong style="color:var(--teal)">${sym}${counter.toLocaleString()}</strong> — that's ${sym}${gap.toLocaleString()} above their offer and leaves room to meet in the middle at ~${sym}${Math.round((offer+counter)/2).toLocaleString()}.
Your absolute minimum is ${sym}${walkaway.toLocaleString()} — don't accept below this.`;
}

// ── BENEFITS ──
function calcBenefits() {
  const sym    = _sym();
  const salary = (_parseFiniteAmount(document.getElementById('i-target').value, 10000000) || _parseFiniteAmount(document.getElementById('i-salary').value, 10000000) || 0);
  if (!salary) return;

  // All benefit fields clamped — bonus/pension are %, others are absolute.
  const bonusPctRaw = _parseFiniteAmount(document.getElementById('b-bonus').value, 500) || 0;
  const bonus   = bonusPctRaw / 100 * salary;
  const equity  = _parseFiniteAmount(document.getElementById('b-equity').value, 10000000) || 0;
  const health  = _parseFiniteAmount(document.getElementById('b-health').value, 100000) || 0;
  const pension = (_parseFiniteAmount(document.getElementById('b-pension').value, 100) || 0) / 100 * salary;
  const remote  = _parseFiniteAmount(document.getElementById('b-remote').value, 100000) || 0;
  const leave   = (_parseFiniteAmount(document.getElementById('b-leave').value, 365) || 0) * (salary / 260);

  // Other benefits = everything that's not base/bonus/equity, lumped for
  // visual brevity in the breakdown card.
  const otherBenefits = Math.round(health + pension + remote + leave);
  const totalComp = Math.round(salary + bonus + equity + otherBenefits);

  // Update breakdown rows
  document.getElementById('tc-base').textContent     = sym + salary.toLocaleString();
  document.getElementById('tc-bonus').textContent    = sym + Math.round(bonus).toLocaleString();
  document.getElementById('tc-bonus-pct').textContent = bonusPctRaw > 0 ? ' (' + bonusPctRaw + '% of base)' : '';
  document.getElementById('tc-equity').textContent   = sym + equity.toLocaleString();
  document.getElementById('tc-benefits').textContent = sym + otherBenefits.toLocaleString();
  document.getElementById('tc-total').textContent    = sym + totalComp.toLocaleString();

  // Composition bar — proportional widths summing to 100%. Width zeroes out
  // for any component that contributes nothing, so the bar visually compresses
  // (e.g. if equity is $0 the equity segment disappears and the others fill in).
  if (totalComp > 0) {
    const basePct    = (salary       / totalComp * 100).toFixed(2);
    const bonusPctW  = (bonus        / totalComp * 100).toFixed(2);
    const equityPctW = (equity       / totalComp * 100).toFixed(2);
    const benefPctW  = (otherBenefits / totalComp * 100).toFixed(2);
    const segs = [
      ['tc-mix-base',     basePct],
      ['tc-mix-bonus',    bonusPctW],
      ['tc-mix-equity',   equityPctW],
      ['tc-mix-benefits', benefPctW],
    ];
    segs.forEach(([id, pct]) => {
      const el = document.getElementById(id);
      if (el) { el.style.width = pct + '%'; el.style.transition = 'width 220ms ease-out'; }
    });
  }
}

// Tiny helper for percentile phrasing — 1st, 2nd, 3rd, 4th, … 21st, 22nd, …
function ordinalSuffix(n) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

// ── GENERATE SCRIPT ──
// Accept letters, spaces, hyphens, slashes, ampersands, and apostrophes (covers
// 99% of real job titles: "Senior Software Engineer", "Head of People & Culture",
// "C++ Developer", "PR/Comms Lead"). Rejects gibberish like "rgbteybrt".
const ROLE_REGEX = /^[a-zA-Z][a-zA-Z\s\-\/&'.+]{1,79}$/;
function looksLikeRealRole(s) {
  if (!ROLE_REGEX.test(s)) return false;
  // Reject strings with no vowels (random keyboard mashing) — every real English
  // job title has at least one vowel in every 6-char window.
  const words = s.toLowerCase().split(/\s+/).filter(Boolean);
  return words.every(w => /[aeiouy]/.test(w));
}

async function generateScript() {
  const salary  = _parseFiniteAmount(document.getElementById('i-salary').value, 10000000) || 0;
  const target  = _parseFiniteAmount(document.getElementById('i-target').value, 10000000) || 0;
  const roleRaw = document.getElementById('i-role').value.trim();
  const expNum  = _parseFiniteAmount(document.getElementById('i-exp').value, 50);
  const exp     = (expNum != null) ? expNum : 3;
  const sym     = _sym();

  if (!salary) { showToast('Enter your current salary first'); return; }
  if (!roleRaw || !looksLikeRealRole(roleRaw)) {
    showToast('Enter a real job title (letters only) before generating the script');
    document.getElementById('i-role').focus();
    return;
  }
  const role = roleRaw;

  const scriptBox = document.getElementById('script-box');
  const copyBtn = document.getElementById('copy-btn');

  // DEF2-3 (Senior Designer 2026-05-25) — Pro-gate copy rewrite. Was: "AI-
  // generated scripts are a Pro feature. Upgrade to get..." — lock-first
  // framing with no specifics. Now leads with what the script CONTAINS:
  // opening ask, two fallback positions, the line for equity pushback. Same
  // 53-word draft the Designer signed off on. Matches the restrained
  // editorial voice in the position-box copy ("strong case", "data-backed
  // request") — specific, second-person, no superlatives.
  const plan = (typeof PFCPlan !== 'undefined' && PFCPlan.get) ? PFCPlan.get() : 'free';
  if (plan === 'free') {
    if (copyBtn) copyBtn.style.display = 'none';
    scriptBox.innerHTML = '<div style="padding:8px 0;color:var(--text2);line-height:1.65;">'
      + 'Pro unlocks a negotiation script written for your role, your market band, and the gap between your offer and target — including the opening ask, two fallback positions, and the line to use when they push back on equity.'
      + '<br><br>'
      + '<a href="/billing.html?upgrade=salary-script" style="display:inline-block;padding:8px 16px;background:var(--teal);color:var(--canvas);font-weight:700;border-radius:var(--r-sm);text-decoration:none;font-family:var(--font-body);">Unlock with Pro &rarr;</a>'
      + '</div>';
    return;
  }

  const range   = getMarketRange(salary);
  const raisePct = salary ? ((target - salary) / salary * 100).toFixed(1) : '10';
  const industry = document.getElementById('i-industry').options[document.getElementById('i-industry').selectedIndex].text;
  const country  = document.getElementById('i-country').options[document.getElementById('i-country').selectedIndex].text;
  const countryCode = document.getElementById('i-country').value;

  if (copyBtn) copyBtn.style.display = 'none';
  scriptBox.innerHTML = `<div class="script-loading"><div class="spin"></div> Sage is writing your personalised negotiation script…</div>`;

  const targetNum = target || range.median;
  const askAmount = targetNum - salary;
  const askPct    = salary ? ((targetNum - salary) / salary * 100).toFixed(1) : '10';

  // ── Percentile computation ──────────────────────────────────────────────
  // Assume the band is 25th/50th/75th percentile (matches the spread logic
  // in getMarketRange). Linear-interpolate between the three anchor points;
  // clamp above 95th and below 5th so we never claim implausible extremes.
  function computePercentile(value, low, median, high) {
    if (!Number.isFinite(value) || value <= 0) return null;
    if (value <= low) {
      // Below 25th — extrapolate down to 5th, floor at 5
      const ratio = low > 0 ? value / low : 0;
      return Math.max(5, Math.round(25 * ratio));
    }
    if (value <= median) {
      return Math.round(25 + 25 * (value - low) / (median - low));
    }
    if (value <= high) {
      return Math.round(50 + 25 * (value - median) / (high - median));
    }
    // Above 75th — extrapolate up to 95th, cap at 95
    const overshoot = (value - high) / (high - median);
    return Math.min(95, Math.round(75 + 25 * Math.min(1, overshoot)));
  }
  const targetPct = computePercentile(targetNum, range.low, range.median, range.high);
  const currentPct = salary > 0 ? computePercentile(salary, range.low, range.median, range.high) : null;

  // ── Statistical source attribution ──────────────────────────────────────
  // Each country gets the actual name of the national statistical office
  // dataset its per-country median comes from. For roles without a per-
  // country entry, the prompt cites BLS OEWS as the US baseline + the
  // country adjustment factor (PPP-style multiplier from COUNTRY_MULT).
  const STAT_SOURCE = {
    US: 'BLS OEWS May 2024',
    GB: 'UK ONS ASHE 2024',
    FR: 'Insee / Apec 2024',
    DE: 'Destatis Verdienste 2024',
    CA: 'Statistics Canada LFS 2024',
    AU: 'ABS Employee Earnings May 2024',
    SG: 'Singapore MOM Occupational Wages 2024',
    IE: 'CSO Earnings & Labour Costs 2024',
  };
  let sourceLine;
  if (range.source === 'real-country') {
    sourceLine = `${STAT_SOURCE[countryCode] || 'national statistics'} — median for ${range.roleMatched || role} in ${country}`;
  } else if (range.source === 'real') {
    sourceLine = `BLS OEWS May 2024 — US median for ${range.roleMatched || role}, adjusted to ${country} via official wage-ratio data`;
  } else {
    sourceLine = `industry/country/experience benchmarks (rough estimate — no role-specific data available)`;
  }

  // Percentile phrasing for the prompt — falls back gracefully if the
  // computation returned null (no current salary entered).
  const targetPctPhrase = targetPct != null
    ? `Their target sits at approximately the ${targetPct}${ordinalSuffix(targetPct)} percentile of the band.`
    : '';
  const currentPctPhrase = currentPct != null
    ? `Their CURRENT salary sits at approximately the ${currentPct}${ordinalSuffix(currentPct)} percentile of the band.`
    : '';

  const prompt = `You are writing a salary negotiation script that the user will read aloud almost verbatim in a real conversation. Write it for THIS specific person:

ROLE: ${role}
INDUSTRY: ${industry}
COUNTRY: ${country}
YEARS OF EXPERIENCE: ${exp}
CURRENT SALARY: ${sym}${salary.toLocaleString()}
TARGET SALARY: ${sym}${targetNum.toLocaleString()} (a ${askPct}% raise, ${sym}${askAmount.toLocaleString()} more per year)
MARKET MEDIAN for this role/country/experience: ${sym}${range.median.toLocaleString()}
MARKET BAND (25th–75th percentile): ${sym}${range.low.toLocaleString()} – ${sym}${range.high.toLocaleString()}
DATA SOURCE: ${sourceLine}
${currentPctPhrase}
${targetPctPhrase}

WRITE A COMPLETE SPOKEN SCRIPT, NOT A TEMPLATE.

Hard rules (failing any of these means the script is unusable):
1. DO NOT start with meta phrases like "Here is a script" or "Below you'll find". Start directly with the user's first line, as if they're speaking.
2. DO NOT use markdown headers (###, ##) or bullet lists. Use plain spoken language. If you need section breaks, use a bracketed cue on its own line: [OPENING], [THE ASK], [JUSTIFICATION], [HANDLING PUSHBACK], [CLOSING].
3. DO NOT use placeholders like [your achievement] or [insert specific example]. Invent plausible specifics that fit a ${exp}-year ${role} in ${industry}.
4. Cite the SPECIFIC data source by name at least once in [JUSTIFICATION] — say "${sourceLine.split(' — ')[0]}" verbatim, not "market data" or "industry benchmarks". The credibility of the script depends on naming the source the user can verify.
5. Cite the SPECIFIC PERCENTILE at least once: ${targetPctPhrase ? `state that their target sits at the ${targetPct}${ordinalSuffix(targetPct)} percentile of ${country} pay for this role` : 'reference the percentile if computable'}. Numbers are persuasive; vague claims are not.
6. Use the actual currency-formatted numbers from the inputs above — the target ${sym}${targetNum.toLocaleString()} must appear at least once, the market median ${sym}${range.median.toLocaleString()} must be referenced as evidence.
7. Tone: confident but understated. No hyperbole. No "I'm thrilled" or "I'm so passionate". Calm and factual. The user is presenting a case, not begging.
8. Total length: 300–380 words. Don't pad. The source citation + percentile mention will add some length over a generic script — that's by design.
9. The [HANDLING PUSHBACK] section must address ONE specific objection: "we don't have budget right now" — and the response should pivot to non-cash levers (signing bonus, equity refresh, accelerated review, remote/flex days, professional-development budget) rather than capitulating.
10. End with one line the user can use if the answer is "no": polite, professional, leaves the door open.

Write the script now. Just the script — no preamble, no afterword.`;

  try {
    const session = (typeof PFCAuth !== 'undefined') ? PFCAuth.getSession() : null;
    const headers = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers.Authorization = 'Bearer ' + session.access_token;

    // csvMode:false routes through the full Sage chat path with proper temperature
    // (0.7) and the rich system prompt. csvMode:true used a deterministic 0.1-temp
    // path that bypassed the system prompt and produced templated/amateur output.
    const res = await fetch('/api/sage', {
      method: 'POST',
      headers,
      body: JSON.stringify({ message: prompt, csvMode: false, intent: 'salary_script' }),
    });
    const data = await res.json();
    // Surface the real failure instead of a bare "BAD_REQUEST": include the
    // server's `reason` for 400s, and render the Pro 403 as a friendly upsell.
    let textRaw;
    if (data.reply) {
      textRaw = data.reply;
    } else if (res.status === 403 && data.upgrade) {
      textRaw = 'The AI negotiation script is a Pro feature — upgrade to unlock it.';
    } else if (data.error) {
      textRaw = data.error + (data.reason ? ' (' + data.reason + ')' : '');
    } else {
      textRaw = 'Could not generate script. Try again.';
    }

    // SC-SEC-1 fix (audit 2026-05-25) — CRITICAL XSS hardening. Pre-fix the
    // LLM reply went straight into innerHTML through 5 markdown regexes —
    // any raw `<img src=x onerror=…>` / `<script>` / `<svg onload>` in the
    // model output rendered as live HTML in the authenticated user's session.
    // The role field is user-controlled and feeds the prompt, so prompt-
    // injection that gets the model to echo HTML = reflected XSS.
    //
    // Fix: escape FIRST, then apply markdown regexes against the escaped
    // string. The regex patterns operate on character classes that survive
    // escaping (** stays **, ## stays ##, digits + dots stay digits + dots,
    // - stays -, \n stays \n) so the formatting still works — but any raw
    // HTML is now inert `&lt;img...` text instead of an active img tag.
    const text = escHtml(textRaw);
    const formatted = text
      .replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--text)">$1</strong>')
      .replace(/^##\s(.+)$/gm, '<div style="font-size:12px;font-weight:700;color:var(--teal);letter-spacing:.06em;text-transform:uppercase;margin:14px 0 6px;">$1</div>')
      .replace(/^#\s(.+)$/gm,  '<div style="font-size:13px;font-weight:700;color:var(--text);margin:12px 0 5px;">$1</div>')
      .replace(/^\d\.\s(.+)$/gm, '<div style="margin:5px 0;padding-left:14px;border-left:2px solid rgba(43,182,125,0.3);color:var(--text2);">$1</div>')
      .replace(/^-\s(.+)$/gm,   '<div style="margin:4px 0;padding-left:14px;border-left:2px solid rgba(43,182,125,0.3);color:var(--text2);">• $1</div>')
      .replace(/\n/g, '<br>');

    scriptBox.innerHTML = formatted;
    const cb = document.getElementById('copy-btn');
    if (cb) cb.style.display = 'block';
  } catch(e) {
    scriptBox.innerHTML = '<span style="color:var(--red)">Could not reach Sage. Check your connection and try again.</span>';
  }
}

// ── TAKE-HOME PAY CROSS-LINK ──
// Hands off to /tools/take-home-pay with the user's target salary (or
// current salary if no target set) and selected country pre-filled via URL
// params. take-home-pay.html reads them at init. Falls back to a plain
// navigation if no salary is available — the destination still works
// without params.
function goToTakeHome() {
  const target  = parseFloat(document.getElementById('i-target').value) || 0;
  const current = parseFloat(document.getElementById('i-salary').value) || 0;
  const salary  = target || current;
  const country = document.getElementById('i-country').value || 'US';
  // THP-P0-CROSS (audit 2026-05-25) — send the user's CURRENT currency so the
  // destination /take-home-pay page can warn on mismatch. Pre-fix the handoff
  // sent only salary + country, so USD $80k handed to country=DE silently
  // became €80k. With this param the take-home page renders a one-line
  // amber warning when destCountry.currency !== sentCurrency.
  const currency = (USER && USER.currency) ? String(USER.currency).toUpperCase() : '';
  const params = [];
  if (salary > 0) params.push('salary=' + Math.round(salary));
  if (country)    params.push('country=' + encodeURIComponent(country));
  if (currency)   params.push('currency=' + encodeURIComponent(currency));
  const qs = params.length ? '?' + params.join('&') : '';
  window.location.href = '/tools/take-home-pay' + qs;
}

// Update the CTA label + sub-text reactively when the target/salary changes
// so users know what number is about to get carried over.
function updateTakeHomeCta() {
  // SC-DES-1 fix (audit 2026-05-25) — `window.USER` is never set anywhere in
  // the codebase (USER is module-scoped at the top of this file), so the
  // prior `(window.USER && USER.currency) || '$'` always fell through to
  // '$' for €/£/etc. users. The fixed _sym() helper threads through PFCSym
  // → USER.currency the same way every other render path does.
  const sym    = _sym();
  const target = _parseFiniteAmount(document.getElementById('i-target').value, 10000000) || 0;
  const salary = _parseFiniteAmount(document.getElementById('i-salary').value, 10000000) || 0;
  const amount = target || salary;
  const label  = document.getElementById('takehome-cta-label');
  const sub    = document.getElementById('takehome-cta-sub');
  if (!label || !sub) return;
  if (amount > 0) {
    label.textContent = 'See take-home on ' + sym + amount.toLocaleString();
    sub.textContent = 'We’ll carry the ' + sym + amount.toLocaleString() + ' across and break it down by income tax, social charges, and pension. Numbers stay in your browser.';
  } else {
    label.textContent = 'See your take-home pay';
    sub.textContent = 'Pick a target above, then run it through the take-home pay calculator to see net pay after income tax, social charges, and pension contributions in your country.';
  }
}

function copyScript() {
  const text = document.getElementById('script-box').innerText;
  navigator.clipboard.writeText(text).then(() => showToast('Script copied to clipboard'));
}

// ── TOAST ──
function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 2800);
  setTimeout(() => t.remove(), 3200);
}

// ── START ──
// SC-AUTH-RACE fix (audit 2026-05-25) — defer init until DOMContentLoaded.
// Pre-fix init() ran synchronously at end-of-script, BEFORE DOMContentLoaded
// fired. That meant init's getElementById calls could race against late-
// parsed DOM, AND PFCAuth's adoptGuestData wouldn't have completed so any
// guest-bucket data prefilled the salary input visually before the
// rehydrate path arrived. Same root cause as G-P0-6 on /goals.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// ── AUTH-AWARE RE-HYDRATION ──
// Once PFCAuth resolves the real userId and pfc-storage.js finishes
// adoptGuestData, re-read USER and re-prefill any inputs the user hasn't
// touched. Idempotent — safe to call multiple times across auth state changes.
function _rehydrateFromStorage() {
  const prevSalaryPrefill = USER.income ? USER.income * 12 : null;
  try { USER = (typeof PFCUser !== 'undefined') ? PFCUser.get() : (PFCStorage.getJSON('user') || {}); } catch(e) { USER = {}; }
  const sym = _sym();
  ['sym-label','sym-custom','sym-offer'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = sym;
  });
  // SC-FUNC-3 (2026-05-25) — defensive sanity on income×12. USER.income is
  // SUPPOSED to be monthly (per the onboarding contract documented elsewhere)
  // but if any code path ever wrote annual, the ×12 prefill would show
  // 12-million when the user makes 1M/yr. Clamp the prefill below 10M.
  const salaryInput = document.getElementById('i-salary');
  if (salaryInput && USER.income > 0) {
    const annualised = USER.income * 12;
    // Sanity: cap at 10M to catch any monthly-vs-annual confusion silently
    // (this is the same magnitude cap _parseFiniteAmount enforces on save).
    if (annualised <= 10000000) {
      const curr = salaryInput.value.trim();
      if (curr === '' || (prevSalaryPrefill !== null && Number(curr) === prevSalaryPrefill)) {
        salaryInput.value = annualised;
      }
    }
  }
  calc();
}
if (typeof PFCAuth !== 'undefined') {
  PFCAuth.onReady(() => {
    let fresh = {};
    try { fresh = (typeof PFCUser !== 'undefined') ? PFCUser.get() : (PFCStorage.getJSON('user') || {}); } catch(e) {}
    if (JSON.stringify(fresh) !== JSON.stringify(USER)) _rehydrateFromStorage();
  });
  PFCAuth.onAuthChange(_rehydrateFromStorage);
}
