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

function fmt(v) {
  const c = window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$');
  return c + Math.abs(Math.round(v)).toLocaleString();
}

// ── FORECAST CHART ──
const MONTHS = ['Now','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
let chart;

function buildData() {
  const incChg  = parseFloat(document.getElementById('sl-income').value)   / 100;
  const extra   = parseFloat(document.getElementById('sl-extra').value);
  const infl    = parseFloat(document.getElementById('sl-inflation').value) / 100;
  const intRate = parseFloat(document.getElementById('sl-interest').value)  / 100 / 12;

  const income   = ((USER.income||0) + (USER.otherIncome||0)) * (1 + incChg);
  const expenses = (USER.housing||0) + (USER.food||0) + (USER.transport||0) + (USER.otherExp||0);
  const savings  = (USER.savings||0) + (USER.investments||0);
  const debt     = USER.debt||0;
  const debtPay  = USER.debtPay||0;

  const monthly = income - expenses + extra;
  let nw = savings - debt, nwO = nw, nwC = nw;
  let remD = debt;
  const base=[], opt=[], cons=[];

  for (let i = 0; i <= 12; i++) {
    const dp = Math.min(remD, debtPay);
    remD = Math.max(0, remD - dp + remD * intRate);
    if (i > 0) {
      nw  += monthly   - (infl * expenses / 12);
      nwO += monthly * 1.18 - (infl * expenses / 12 * 0.75);
      nwC += monthly * 0.65 - (infl * expenses / 12 * 1.4);
    }
    base.push(Math.round(nw));
    opt.push(Math.round(nwO));
    cons.push(Math.round(nwC));
  }
  return { base, opt, cons, monthly, remD };
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
  if (dbEl) dbEl.textContent = dMonths > 0 ? dMonths + ' mo' : 'Debt free!';

  // ── HEALTH SCORE recalc ──
  const savePct = income > 0 ? surplus / income : 0;
  let score = 0;
  if (savePct >= 0.2) score += 30; else if (savePct >= 0.1) score += 20; else if (savePct > 0) score += 10;
  if (surplus > 0) score += 20;
  if (USER.debt === 0) score += 25; else if (USER.debt < assets) score += 12;
  if (assets >= surplus * 3) score += 15; else if (assets > 0) score += 8;
  if (d.base[12] > d.base[0]) score += 10;
  score = Math.min(99, Math.max(5, score));

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

function initChart() {
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
          callbacks: { label: ctx => ' $' + ctx.raw.toLocaleString() }
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
            callback: v => '$' + Math.round(v / 1000) + 'k'
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
function applyEvent(btn, type) {
  document.querySelectorAll('.event-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const map = {
    raise:   { income: 15, extra: 0 },
    jobloss: { income: -100, extra: 0 },
    baby:    { income: -5, extra: -200 },
    car:     { income: 0, extra: -150 }
  };
  const e = map[type];
  document.getElementById('sl-income').value = e.income;
  document.getElementById('sl-extra').value  = Math.max(0, 0 + e.extra);
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
  const savePct  = income > 0 ? surplus / income : 0;
  let score = 0;
  if (savePct >= 0.2) score += 30; else if (savePct >= 0.1) score += 20; else if (savePct > 0) score += 10;
  if (surplus > 0) score += 20;
  if (debt === 0) score += 25; else if (debt < savings) score += 12;
  if (savings >= surplus * 3) score += 15; else if (savings > 0) score += 8;
  score = Math.min(99, Math.max(5, score));
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
  const nw       = assets - (USER.debt||0);
  const nw12     = nw + surplus * 12 * 0.9;
  const dMonths  = (USER.debtPay||0) > 0 && (USER.debt||0) > 0 ? Math.ceil((USER.debt||0) / (USER.debtPay||0)) : 0;
  const pct      = income > 0 ? Math.round((surplus/income)*100) : 0;

  // Wire the debt-breakdown table from real data (replaces hardcoded demo).
  try { renderDebtBreakdown(); } catch (_) {}

  // Health score
  const savePct = income > 0 ? surplus / income : 0;
  let score = 0;
  if (savePct >= 0.2) score += 30; else if (savePct >= 0.1) score += 20; else if (savePct > 0) score += 10;
  if (surplus > 0) score += 20;
  if (USER.debt === 0) score += 25; else if (USER.debt < assets) score += 12;
  if (assets >= surplus * 3) score += 15; else if (assets > 0) score += 8;
  score = Math.min(99, Math.max(5, score));

  // Update metric cards
  const nwEl = document.getElementById('m-networth');
  if (nwEl) { nwEl.textContent = sym + Math.round(nw12).toLocaleString(); nwEl.style.color = nw12 >= 0 ? 'var(--teal)' : 'var(--red)'; }
  const svEl = document.getElementById('m-savings');
  if (svEl) svEl.textContent = sym + Math.round(Math.max(0,surplus)).toLocaleString();
  const dbEl = document.getElementById('m-debt');
  if (dbEl) dbEl.textContent = dMonths > 0 ? dMonths + ' mo' : 'Debt free!';
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

  // Score breakdown bars
  const emergencyMo = surplus > 0 ? +(assets/Math.max(1,expenses)).toFixed(1) : 0;
  document.querySelectorAll('.score-row').forEach(row => {
    const label = row.querySelector('.score-row-label')?.textContent.toLowerCase() || '';
    const fill  = row.querySelector('.score-row-fill');
    const val   = row.querySelector('.score-row-val');
    if (!fill || !val) return;
    if (label.includes('savings')) {
      fill.style.width = Math.min(100,pct*2) + '%';
      val.textContent = pct + '%';
      val.style.color = pct >= 20 ? 'var(--teal)' : 'var(--amber)';
    } else if (label.includes('emergency')) {
      const em = Math.min(100, emergencyMo/6*100);
      fill.style.width = em + '%';
      val.textContent = emergencyMo + 'mo';
      val.style.color = emergencyMo >= 3 ? 'var(--teal)' : 'var(--amber)';
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
  renderGoals();
}

function saveGoals() {
  try { PFCStorage.setJSON('goals', GOALS); } catch(e) {}
}

function renderGoals() {
  const list    = document.getElementById('goals-list');
  const surplus = Math.max(0, ((USER.income||0) + (USER.otherIncome||0)) - ((USER.housing||0) + (USER.food||0) + (USER.transport||0) + (USER.otherExp||0)));
  const sym     = USER.currency;
  if (!list) return;

  if (GOALS.length === 0) {
    list.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text3);font-size:13px;">No goals yet — add your first one below.</div>`;
    const badge = document.querySelector('.badge-blue');
    if (badge) badge.textContent = '0 active goals';
    return;
  }

  list.innerHTML = GOALS.map((g, i) => {
    const pct      = Math.min(100, Math.round((g.current / Math.max(1, g.target)) * 100));
    const remaining = Math.max(0, g.target - g.current);
    const months   = surplus > 0 ? Math.ceil(remaining / surplus) : null;
    const barColor = g.color || 'var(--teal)';
    const pctColor = pct >= 100 ? 'var(--teal)' : barColor;
    return `
      <div style="position:relative;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
          <div>
            <div style="font-size:13.5px;font-weight:500;">${g.name}</div>
            <div style="font-size:11px;color:var(--text3);">${sym}${Math.round(g.current).toLocaleString()} of ${sym}${Math.round(g.target).toLocaleString()}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="font-size:13px;font-weight:600;color:${pctColor};">${pct}%</div>
            <div style="display:flex;gap:4px;">
              <button onclick="editGoal(${i})" style="width:22px;height:22px;border-radius:5px;background:var(--bg3);border:1px solid var(--border);cursor:pointer;font-size:11px;color:var(--text3);display:flex;align-items:center;justify-content:center;" title="Edit">✏</button>
              <button onclick="deleteGoal(${i})" style="width:22px;height:22px;border-radius:5px;background:var(--bg3);border:1px solid var(--border);cursor:pointer;font-size:11px;color:var(--red);display:flex;align-items:center;justify-content:center;" title="Delete">✕</button>
            </div>
          </div>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${barColor};"></div></div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px;">
          ${pct >= 100 ? 'Goal reached.' : months ? `~${months} month${months===1?'':'s'} to reach goal` : 'Increase your surplus to reach this goal'}
        </div>
      </div>`;
  }).join('');

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
    const barColor  = g.color || 'var(--teal)';
    const pctColor  = pct >= 100 ? 'var(--teal)' : barColor;
    return `
    <div style="padding:12px 0;border-bottom:1px solid var(--border);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:10px;height:10px;border-radius:50%;background:${barColor};flex-shrink:0;"></div>
          <div>
            <div style="font-size:13.5px;font-weight:500;">${g.name}</div>
            <div style="font-size:11px;color:var(--text3);">${sym}${Math.round(g.current||0).toLocaleString()} of ${sym}${Math.round(g.target||0).toLocaleString()}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="text-align:right;">
            <div style="font-size:14px;font-weight:700;color:${pctColor};">${pct}%</div>
            <div style="font-size:11px;color:var(--text3);">${pct>=100?'✓ Done':months?'~'+months+'mo':'-'}</div>
          </div>
          <div style="display:flex;gap:4px;">
            <button onclick="editGoal(${i})" style="width:24px;height:24px;border-radius:5px;background:var(--bg3);border:1px solid var(--border);cursor:pointer;font-size:11px;color:var(--text3);display:flex;align-items:center;justify-content:center;" title="Edit">✏</button>
            <button onclick="deleteGoal(${i})" style="width:24px;height:24px;border-radius:5px;background:var(--bg3);border:1px solid var(--border);cursor:pointer;font-size:11px;color:var(--red);display:flex;align-items:center;justify-content:center;" title="Delete">✕</button>
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
  const surplus  = Math.max(0, ((USER.income||0) + (USER.otherIncome||0)) - ((USER.housing||0) + (USER.food||0) + (USER.transport||0) + (USER.otherExp||0)));
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

  const goal = { name, current, target, color: selectedGoalColor };
  if (editingGoalIdx >= 0) {
    GOALS[editingGoalIdx] = goal;
    showDashToast('Goal updated');
  } else {
    GOALS.push(goal);
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

// ── Keyword rules ──
const KEYWORD_RULES = [
  // Income signals
  { cat: 'income', keys: ['salary','salaire','payroll','wages','pay credit','direct dep','direct credit','bank transfer in','virement recu','transfer received','freelance payment','dividend','interest earned','refund credit','cashback','commission credit'] },
  // Housing
  { cat: 'housing', keys: ['rent','loyer','mortgage','hypotheque','lease','electricite','electricity','water authority','cwma','cem ','internet','fiber','ftth','airtel','emtel','my.t','myt ','orange ','landlord','syndic','condominium','facility mgmt','facilities'] },
  // Food & groceries
  { cat: 'food', keys: ['shoprite','jumbo','super u','hyper u','winner','auchan','carrefour','happy world','casino','spar','simply','food court','kfc','mcdonalds','mc donald','pizza','burger','resto','restaurant','bistro','cafe','coffee','boulangerie','patisserie','bakery','subway','domino','hungry','wolt','bolt food','glovo','uber eat','deliveroo','takeway','takeaway','grocery','alimentation','provost','prix rite','monoprix'] },
  // Transport
  { cat: 'transport', keys: ['shell','total ','engen','caltex','petrol','diesel','fuel','esso','bp ','sinopec','parking','autopay','toll','bus ','autobus','taxi','bolt ','uber ','pick me','yango','hertz','avis','budget car','auto repair','garage','mécanique','mechanics','pneu','tyre','tire','motor vehicle','license ','registration fee','rta ','nta ','airport','sita ','air mauritius','air france','british airways','easyjet','ryanair','emirates','qatar air'] },
  // Subscriptions
  { cat: 'subscriptions', keys: ['netflix','spotify','apple ','amazon prime','deezer','canal+','canal plus','showmax','bein','sky ','microsoft 365','office 365','adobe','dropbox','google one','icloud','linkedin','canva','zoom ','slack ','notion','github','digitalocean','aws ','cloudflare','openai','anthropic','midjourney','chatgpt'] },
  // Entertainment
  { cat: 'entertainment', keys: ['cinema','cinema','cinerama','star ','bagatelle mall','phoenix mall','trianon','so ','caudan','port louis waterfront','bar ','nightclub','club ','concert','event ','billeterie','ticketing','sport ','gym ','fitness','yoga','swimming','golf','tennis','steam ','playstation','nintendo','xbox','game '] },
  // Health
  { cat: 'health', keys: ['pharmacy','pharmacie','apollo','dr ','doctor','clinic','hospital','nhosco','hcil','dentist','optician','opticien','laboratory','labo ','scan ','xray','x-ray','physiotherapy','medecin','medical','health ins','assurance sante','blue cross','axa health','swan life','sirdar','mauritius union','bmo','sham '] },
];

// ── Column header synonyms for auto-detection ──
const COL_SYNONYMS = {
  date:   ['date','transaction date','trans date','value date','posted date','posting date','txn date'],
  desc:   ['description','details','narrative','merchant','payee','reference','particulars','transaction description','libelle','trans description','memo'],
  debit:  ['debit','amount debit','withdrawal','debit amount','paid out','dr','charges'],
  credit: ['credit','amount credit','deposit','credit amount','paid in','cr','amount received'],
  amount: ['amount','net amount','transaction amount','value','montant'],
};

let CSV_TRANSACTIONS = [];
let CSV_FILTERED = [];

// ── Stage switcher ──
function csvStage(name) {
  ['upload','processing','report'].forEach(s => {
    document.getElementById('csv-stage-' + s).style.display = 'none';
  });
  document.getElementById('csv-stage-' + name).style.display = 'block';
}

function openCSV() {
  document.getElementById('csv-overlay').style.display = 'flex';
  csvStage('upload');
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

// ── MAIN ENTRY: read file → parse → categorise → Gemini → render ──
async function startCSVProcess(file) {
  if (file.size > 10 * 1024 * 1024) { alert('File too large. Max 10MB.'); return; }
  csvStage('processing');
  setProc('Reading file…', 'Detecting bank format', 5);

  const text = await file.text();
  document.getElementById('rpt-filename').textContent = file.name + ' · ' + (text.split('\n').length - 1) + ' rows detected';

  setProc('Parsing transactions…', 'Extracting dates, descriptions and amounts', 25);
  await sleep(200);

  let txns;
  try { txns = parseCSV(text); }
  catch(e) { alert('Could not parse this CSV. Try exporting again from your bank.'); csvStage('upload'); return; }

  if (!txns.length) { alert('No transactions found. Check that your file has a date, description and amount column.'); csvStage('upload'); return; }

  setProc('Categorising…', `Running keyword engine on ${txns.length} transactions`, 55);
  await sleep(150);

  // Keyword pass
  txns.forEach(t => { t.cat = keywordCategorise(t.desc); t.aiAssisted = false; });
  const unknown = txns.filter(t => !t.cat);

  setProc('AI enrichment…', `Sending ${unknown.length} unrecognised transactions to Sage`, 72);
  await sleep(100);

  // Gemini pass for unknowns
  if (unknown.length > 0) {
    try { await geminiCategorise(unknown, txns); }
    catch(e) { /* fallback: mark as other */ unknown.forEach(t => { t.cat = t.cat || 'other'; }); }
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

// ── CSV PARSER ──
function parseCSV(text) {
  // Normalize line endings
  const lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').trim().split('\n');
  if (lines.length < 2) return [];

  // Find header row (first row with recognisable column)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const row = lines[i].toLowerCase();
    if (COL_SYNONYMS.date.some(s => row.includes(s)) || COL_SYNONYMS.desc.some(s => row.includes(s))) {
      headerIdx = i; break;
    }
  }

  const headers = parseCSVRow(lines[headerIdx]).map(h => h.toLowerCase().trim().replace(/['"]/g,''));
  const colIdx = findColumns(headers);

  if (colIdx.date === -1 || colIdx.desc === -1) throw new Error('No date/desc columns');

  const txns = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const row = parseCSVRow(lines[i]);
    if (!row.length || row.every(c => !c.trim())) continue;

    const rawDate = (row[colIdx.date] || '').trim().replace(/['"]/g,'');
    const rawDesc = (row[colIdx.desc] || '').trim().replace(/['"]/g,'');
    if (!rawDate && !rawDesc) continue;

    let amount = 0;
    let isDebit = false;

    if (colIdx.amount !== -1) {
      // Single amount column — negative = debit, positive = credit
      const raw = (row[colIdx.amount] || '').replace(/['",$€£Rs\s]/g,'').replace(/,(?=\d{3})/g,'');
      amount = parseFloat(raw) || 0;
      isDebit = amount < 0;
      amount = Math.abs(amount);
    } else {
      // Separate debit/credit columns
      const dRaw = colIdx.debit !== -1 ? (row[colIdx.debit]||'').replace(/['",$€£Rs\s]/g,'') : '';
      const cRaw = colIdx.credit !== -1 ? (row[colIdx.credit]||'').replace(/['",$€£Rs\s]/g,'') : '';
      const d = parseFloat(dRaw) || 0;
      const c = parseFloat(cRaw) || 0;
      if (d > 0) { amount = d; isDebit = true; }
      else if (c > 0) { amount = c; isDebit = false; }
      else continue;
    }

    if (!amount) continue;

    txns.push({
      date: formatDate(rawDate),
      rawDate,
      desc: cleanDesc(rawDesc),
      amount,
      isDebit,
      cat: null,
      aiAssisted: false,
    });
  }
  return txns;
}

function parseCSVRow(line) {
  const result = []; let cell = ''; let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQuote = !inQuote; }
    else if ((c === ',' || c === ';' || c === '\t') && !inQuote) { result.push(cell); cell = ''; }
    else { cell += c; }
  }
  result.push(cell);
  return result;
}

function findColumns(headers) {
  const find = (synonyms) => headers.findIndex(h => synonyms.some(s => h.includes(s)));
  const colIdx = {
    date:   find(COL_SYNONYMS.date),
    desc:   find(COL_SYNONYMS.desc),
    debit:  find(COL_SYNONYMS.debit),
    credit: find(COL_SYNONYMS.credit),
    amount: find(COL_SYNONYMS.amount),
  };
  // If we have separate debit+credit prefer those; if only amount column use that
  if (colIdx.debit !== -1 || colIdx.credit !== -1) colIdx.amount = -1;
  return colIdx;
}

function formatDate(raw) {
  // Try to parse various date formats
  const s = raw.replace(/['"]/g,'').trim();
  // ISO: 2024-01-15
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
  // DD/MM/YYYY or DD-MM-YYYY
  const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`;
  // MM/DD/YYYY
  const m2 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m2) { const yr = m2[3].length===2 ? '20'+m2[3] : m2[3]; return `${yr}-${m2[1].padStart(2,'0')}-${m2[2].padStart(2,'0')}`; }
  return s;
}

function cleanDesc(d) {
  return d.replace(/\s+/g,' ').replace(/[*#]/g,'').trim().slice(0, 80);
}

// ── KEYWORD CATEGORISER ──
function keywordCategorise(desc) {
  const lower = desc.toLowerCase();
  for (const rule of KEYWORD_RULES) {
    for (const kw of rule.keys) {
      if (lower.includes(kw)) return rule.cat;
    }
  }
  return null;
}

// ── GEMINI BATCH CATEGORISER ──
async function geminiCategorise(unknownTxns, allTxns) {
  const bar = document.getElementById('rpt-ai-bar');
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

  const response = await fetch('/api/sage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px;">${name}</span>
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
      <td style="padding:9px 14px;font-size:12.5px;color:var(--text);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${t.desc}">
        ${t.desc}
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

  // Update USER object
  USER.income        = avgIncome || USER.income;
  USER.housing       = avgOf('housing') || USER.housing;
  USER.food          = avgOf('food') || USER.food;
  USER.transport     = avgOf('transport') || USER.transport;
  USER.otherExp      = (avgOf('subscriptions') + avgOf('entertainment') + avgOf('health') + avgOf('other')) || USER.otherExp;

  // Save via PFCUser so cross-page consumers (cash-forecast, net-worth) see
  // the CSV-derived values. Falls back to PFCStorage directly if PFCUser
  // failed to load.
  saveUser(USER);

  // Update dashboard
  updateAllCards();
  refreshInflBoxes();
  closeCSV();

  showDashToast('Dashboard updated from your bank statement — ' + months + ' month' + (months>1?'s':'') + ' of data applied');
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
  const isOpen = panel.style.display === 'flex';
  panel.style.display = isOpen ? 'none' : 'flex';
  panel.style.flexDirection = 'column';
  document.addEventListener('click', function handler(e) {
    if (!panel.contains(e.target) && e.target !== btn) {
      panel.style.display = 'none';
      document.removeEventListener('click', handler);
    }
  });
}
function markRead(item) {
  if (item.classList.contains('unread')) {
    item.classList.remove('unread');
    item.querySelector('.notif-dot-sm').style.opacity = '0';
    unreadCount = Math.max(0, unreadCount - 1);
    document.getElementById('notif-dot').style.display = unreadCount > 0 ? 'block' : 'none';
  }
}
function markAllRead() {
  document.querySelectorAll('.notif-item.unread').forEach(i => markRead(i));
}

// ── UPDATE DATE ──
document.getElementById('today-date').textContent = new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});

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
  srcEl.innerHTML = 'Source: <a href="' + (data.sourceUrl || 'https://data.worldbank.org') + '" target="_blank" style="color:var(--teal);text-decoration:none;">World Bank</a> · Data for ' + data.year;

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
initChart();
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

if (typeof PFCAuth !== 'undefined') {
  PFCAuth.onReady(() => {
    const fresh = loadUser();
    // Avoid a guest-mode flicker: only re-render if storage actually differs
    if (JSON.stringify(fresh) !== JSON.stringify(USER)) _rehydrateUserFromStorage();
    hideUpgradeBannerIfPro();
    _maybeFireActivation('dashboard');
  });
  // Sign-in / sign-out / account-switch after page load
  PFCAuth.onAuthChange(() => {
    _rehydrateUserFromStorage();
    hideUpgradeBannerIfPro();
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
// PFCPlan emits a custom event on its own state changes via PFCPlan.onChange.
try {
  if (window.PFCPlan && typeof PFCPlan.onChange === 'function') {
    PFCPlan.onChange(hideUpgradeBannerIfPro);
  }
} catch (_) {}
document.addEventListener('pfc:plan-changed', hideUpgradeBannerIfPro);
// Belt-and-braces: re-check shortly after load in case PFCPlan resolves
// asynchronously without firing PFCAuth.onReady (e.g. cached session).
setTimeout(hideUpgradeBannerIfPro, 800);
setTimeout(hideUpgradeBannerIfPro, 2500);

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
  const surplus     = Math.max(0,
    ((USER.income||0)+(USER.otherIncome||0)) -
    ((USER.housing||0)+(USER.food||0)+(USER.transport||0)+(USER.otherExp||0)+(USER.debtPay||0))
  );

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

  // 12-mo projection
  const proj12 = nw + (surplus * 12);
  const projEl = document.getElementById('nw-tab-proj');
  if (projEl) {
    projEl.textContent = sym + Math.round(Math.max(0, proj12)).toLocaleString();
    projEl.style.color = proj12 >= nw ? 'var(--teal)' : 'var(--amber)';
  }

  // Monthly change
  const moEl = document.getElementById('nw-tab-monthly');
  if (moEl) {
    moEl.textContent = (surplus >= 0 ? '+' : '') + sym + Math.round(surplus).toLocaleString() + '/mo';
    moEl.style.color = surplus >= 0 ? 'var(--teal)' : 'var(--red)';
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
  if (canvas) {
    if (history.length < 2) {
      if (noteEl) noteEl.textContent = 'Come back tomorrow — your chart builds automatically each day you visit.';
      if (nwTabChart) { nwTabChart.destroy(); nwTabChart = null; }
    } else {
      if (noteEl) noteEl.textContent = '';
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
  try {
    const savings     = USER.savings || 0;
    const investments = USER.investments || 0;
    const debt        = USER.debt || 0;
    const assets      = savings + investments;
    const netWorth    = assets - debt;
    if (assets === 0 && debt === 0) return;

    const today = new Date().toISOString().slice(0, 10);
    let history = [];
    try { history = PFCStorage.getJSON('nw_history') || []; } catch(e) {}

    const entry = { date: today, netWorth, assets, savings, investments, debt, source: 'auto' };
    const idx = history.findIndex(h => h.date === today && h.source === 'auto');
    if (idx >= 0) history[idx] = entry;
    else history.push(entry);

    history.sort((a, b) => a.date.localeCompare(b.date));
    PFCStorage.setJSON('nw_history', history);
  } catch(e) {}
})();
