let currentStep = 0;
const TOTAL_STEPS = 6;
let currencySymbol = '$';
let selectedGoals = new Set();

// Auto-detect the user's country + currency from Vercel's edge geo headers
// (free, instant, no third-party PII). Pre-selects the currency dropdown so
// the user in Mauritius doesn't have to scroll past 99 other currencies just
// to start onboarding. If the detected currency isn't in the dropdown, we
// add it on the fly with a friendly label. Fires once on DOMContentLoaded;
// completely silent on failure (USD default stands).
(function _pfcAutoDetectCurrency() {
  // Centralised currency-code → display name map for any code we don't
  // already list in the dropdown. Kept short to ~30 codes — the long tail
  // gets a "{ISO} ({ISO})" label which is functional but not pretty.
  const CURRENCY_LABELS = {
    USD:'US Dollar', EUR:'Euro', GBP:'British Pound', JPY:'Japanese Yen',
    CNY:'Chinese Yuan', INR:'Indian Rupee', AUD:'Australian Dollar',
    CAD:'Canadian Dollar', CHF:'Swiss Franc', SGD:'Singapore Dollar',
    HKD:'Hong Kong Dollar', NZD:'New Zealand Dollar', SEK:'Swedish Krona',
    NOK:'Norwegian Krone', DKK:'Danish Krone', ZAR:'South African Rand',
    BRL:'Brazilian Real', MXN:'Mexican Peso', KRW:'South Korean Won',
    NGN:'Nigerian Naira', MUR:'Mauritian Rupee', AED:'UAE Dirham',
    SAR:'Saudi Riyal', TRY:'Turkish Lira', RUB:'Russian Ruble',
    PLN:'Polish Złoty', THB:'Thai Baht', PHP:'Philippine Peso',
    IDR:'Indonesian Rupiah', MYR:'Malaysian Ringgit', VND:'Vietnamese Đồng',
    PKR:'Pakistani Rupee', BDT:'Bangladeshi Taka', EGP:'Egyptian Pound',
    KES:'Kenyan Shilling', GHS:'Ghanaian Cedi', ARS:'Argentine Peso',
    COP:'Colombian Peso', CLP:'Chilean Peso', PEN:'Peruvian Sol',
  };

  function _esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function _selectOrInsertCurrency(code, symbol) {
    const sel = document.getElementById('f-currency');
    if (!sel) return false;
    // Already in the list?
    for (const o of sel.options) {
      if (o.value === code) { sel.value = code; return true; }
    }
    // Insert at the top (right under USD) so the user sees their detected
    // currency without scrolling. The data-sym attribute is what
    // updateCurrency() reads to set the $/₨/€ prefix on every money input.
    const opt = document.createElement('option');
    opt.value = code;
    opt.dataset.sym = symbol || code;
    opt.textContent = (CURRENCY_LABELS[code] ? CURRENCY_LABELS[code] : code) + ' (' + code + ')';
    sel.insertBefore(opt, sel.options[1] || null); // after USD
    sel.value = code;
    return true;
  }

  function _showDetectedHint(countryName, currencyCode) {
    const sel = document.getElementById('f-currency');
    if (!sel || !countryName) return;
    // Don't duplicate the hint if onboarding's already been initialised once.
    if (document.getElementById('pfc-geo-hint')) return;
    const hint = document.createElement('div');
    hint.id = 'pfc-geo-hint';
    hint.setAttribute('role', 'status');
    hint.style.cssText = 'margin-top:6px;font-size:12px;color:var(--text3,#8a9189);display:flex;align-items:center;gap:6px;';
    hint.innerHTML =
      '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
      '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
      'Detected: ' + _esc(countryName) + ' &middot; <a href="#" id="pfc-geo-reset" style="color:var(--teal,#2BB67D);text-decoration:none;">change</a>';
    sel.parentNode.appendChild(hint);
    document.getElementById('pfc-geo-reset').addEventListener('click', (e) => {
      e.preventDefault();
      sel.value = 'USD';
      if (typeof updateCurrency === 'function') updateCurrency();
      hint.remove();
    });
  }

  function _apply() {
    fetch('/api/geo', { credentials: 'omit' })
      .then((res) => res.ok ? res.json() : null)
      .then((geo) => {
        if (!geo || !geo.currencyCode) return;
        // Vercel returns "fallback-usd" for localhost / Tor / VPN — leave the
        // dropdown at the default USD selection in that case.
        if (geo.source === 'fallback-usd') return;
        const inserted = _selectOrInsertCurrency(geo.currencyCode, geo.currencySymbol);
        if (inserted) {
          if (typeof updateCurrency === 'function') updateCurrency();
          _showDetectedHint(geo.countryName || geo.countryCode, geo.currencyCode);
        }
      })
      .catch(() => { /* silent: USD default still works */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _apply, { once: true });
  } else {
    _apply();
  }
})();

function getSymbol() {
  const sel = document.getElementById('f-currency');
  const opt = sel.options[sel.selectedIndex];
  return opt?.dataset?.sym || '$';
}

function updateCurrency() {
  const sym = getSymbol();
  currencySymbol = sym;
  ['income','other','housing','food','transport','other-exp','savings','invest','debt','debtpay'].forEach(id => {
    const el = document.getElementById('sym-' + id);
    if (el) el.textContent = sym;
  });
  calcLive(); calcDebt();
}

function syncName() {
  const name = document.getElementById('f-fullname').value.trim();
  if (name) {
    // First-name-only feels warmer on the completion card.
    const first = name.split(/\s+/)[0];
    document.getElementById('complete-name').textContent = `You're all set, ${first}.`;
  }
}

function n(id) { return parseFloat(document.getElementById(id)?.value) || 0; }
function fmt(v) { return currencySymbol + Math.round(Math.abs(v)).toLocaleString(); }

// Mobile auto-scroll for the live-preview panel — per CPO Wave-14 §4 mobile
// friction note. Fires only on narrow viewports (<=600px to match the existing
// @media breakpoint in onboarding.html), and only when the panel is below
// the fold. Throttled to one scroll per 1500ms so we don't yank during typing.
let _lastPreviewScroll = 0;
function scrollPreviewIntoView(panelId) {
  if (window.innerWidth > 600) return;
  const now = Date.now();
  if (now - _lastPreviewScroll < 1500) return;
  const panel = document.getElementById(panelId);
  if (!panel) return;
  const rect = panel.getBoundingClientRect();
  // Only scroll if the panel is BELOW the visible viewport (don't yank up).
  if (rect.top > window.innerHeight - 80) {
    _lastPreviewScroll = now;
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function calcLive() {
  const income   = n('f-income') + n('f-other-income');
  const expenses = n('f-housing') + n('f-food') + n('f-transport') + n('f-other-exp');
  const surplus  = income - expenses;
  const rate     = income > 0 ? Math.round((surplus / income) * 100) : 0;

  document.getElementById('lp-income').textContent   = fmt(income);
  document.getElementById('lp-expenses').textContent = fmt(expenses);
  const surpEl = document.getElementById('lp-surplus');
  surpEl.textContent = (surplus >= 0 ? '' : '-') + fmt(surplus);
  surpEl.className   = 'lp-val ' + (surplus >= 0 ? 'good' : 'bad');
  const rateEl = document.getElementById('lp-rate');
  rateEl.textContent = rate + '%';
  rateEl.className   = 'lp-val ' + (rate >= 20 ? 'good' : rate >= 10 ? 'warn' : 'bad');
  scrollPreviewIntoView('income-preview');
}

function calcDebt() {
  const assets   = n('f-savings') + n('f-investments');
  const debt     = n('f-debt');
  const debtPay  = n('f-debtpay');
  const nw       = assets - debt;
  const income   = n('f-income') + n('f-other-income');
  const expenses = n('f-housing') + n('f-food') + n('f-transport') + n('f-other-exp');
  const surplus  = Math.max(0, income - expenses - debtPay);
  const effectivePay = debtPay + surplus;
  const months   = effectivePay > 0 && debt > 0 ? Math.ceil(debt / effectivePay) : 0;

  document.getElementById('lp-assets').textContent = fmt(assets);
  document.getElementById('lp-debt-val').textContent = fmt(debt);
  const nwEl = document.getElementById('lp-networth');
  nwEl.textContent = (nw >= 0 ? '' : '-') + fmt(nw);
  nwEl.className   = 'lp-val ' + (nw >= 0 ? 'good' : 'bad');
  document.getElementById('lp-debtfree').textContent = months > 0 ? months + ' months' : debt === 0 ? 'Debt free!' : '—';
  scrollPreviewIntoView('debt-preview');
}

function toggleGoal(el, key) {
  el.classList.toggle('selected');
  if (selectedGoals.has(key)) selectedGoals.delete(key);
  else selectedGoals.add(key);
}

function togglePrivacy(btn) {
  if (btn.dataset.locked === 'true') {
    btn.style.transform = 'translateX(3px)';
    setTimeout(() => btn.style.transform = '', 200);
    return;
  }
  btn.classList.toggle('off');
}

function goToStep(step) {
  document.getElementById('step-' + currentStep)?.classList.remove('active');
  currentStep = step;
  const isComplete = step >= TOTAL_STEPS;
  if (isComplete) {
    document.getElementById('step-complete').classList.add('active');
    document.getElementById('wizard-footer').style.display = 'none';
    document.getElementById('step-dots').style.display = 'none';
    buildComplete();
    launchConfetti();
    return;
  }
  document.getElementById('step-' + step).classList.add('active');
  document.getElementById('progress-bar').style.width = ((step + 1) / TOTAL_STEPS * 100) + '%';
  document.getElementById('step-label').textContent = `Step ${step + 1} of ${TOTAL_STEPS}`;

  const hints = [
    'Your data is encrypted and never shared',
    'Use monthly averages — exact figures not needed',
    'Round numbers are fine — update anytime',
    'We need your current financial baseline',
    'Select all goals that apply to you',
    'These settings protect you by default',
    ''
  ];
  const nextLabels = ["Let's go", 'Continue', 'Continue', 'Continue', 'Continue', 'Build my forecast'];
  document.getElementById('footer-hint').textContent = hints[step] || '';
  document.getElementById('btn-next-text').textContent = nextLabels[step] || 'Continue';
  document.getElementById('btn-back').disabled = step === 0;

  document.querySelectorAll('.dot').forEach((d, i) => {
    d.classList.remove('active','done');
    if (i < step) d.classList.add('done');
    if (i === step) d.classList.add('active');
  });
}

function nextStep() {
  if (!validateStep(currentStep)) return;
  goToStep(currentStep + 1);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function prevStep() {
  if (currentStep > 0) {
    goToStep(currentStep - 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function validateStep(step) {
  if (step === 1) {
    const fullname = document.getElementById('f-fullname').value.trim();
    if (!fullname) { shake('f-fullname'); showToast('Please enter your name'); return false; }
  }
  if (step === 2) {
    const income = n('f-income');
    if (!income) { shake('f-income'); showToast('Please enter your monthly income'); return false; }
  }
  return true;
}

function shake(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.borderColor = 'rgba(224,82,82,0.6)';
  el.animate([{transform:'translateX(0)'},{transform:'translateX(-6px)'},{transform:'translateX(6px)'},{transform:'translateX(0)'}],{duration:250,iterations:2});
  setTimeout(() => el.style.borderColor = '', 1500);
}

function showToast(msg) {
  const t = document.createElement('div');
  t.style.cssText = 'position:fixed;bottom:96px;left:50%;transform:translateX(-50%);background:#16271F;border:1px solid rgba(255,255,255,0.15);color:#F0EDE2;padding:10px 20px;border-radius:8px;font-size:13.5px;z-index:200;';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

function skipOnboarding() { window.location.href = 'dashboard.html'; }

// Bug fix: the "Go to my dashboard" button used to be a plain anchor that
// navigated immediately, racing the async encrypted-write that PFCStorage
// hadn't flushed yet. On fast hardware the dashboard could load before
// the data was persisted, producing an empty-state flash and forcing the
// user to refresh. This handler intercepts the click, gives the writer
// pipeline a short window to drain, and only then navigates.
async function goToDashboard(ev) {
  if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
  const label = document.getElementById('go-dashboard-text');
  if (label) label.textContent = 'Saving your forecast…';
  try {
    // Re-adopt guest data once more in case the prior call (inside
    // buildComplete()) raced with the auth resolution.
    const uid = (typeof PFCAuth !== 'undefined' && PFCAuth.getUserId) ? PFCAuth.getUserId() : 'guest';
    if (uid && uid !== 'guest' && typeof PFCStorage !== 'undefined' && typeof PFCStorage.adoptGuestData === 'function') {
      PFCStorage.adoptGuestData(uid);
    }
    // 350ms is comfortably more than the ~100ms PBKDF2 + 100ms writer-debounce
    // cycle. Errs on the side of "definitely flushed" without making the UX
    // feel sluggish.
    await new Promise(resolve => setTimeout(resolve, 350));
  } catch (_) {}
  window.location.href = 'dashboard.html';
}

// ─────────────────────────────────────────────────────────────────────────────
// FIX: buildComplete() now saves the correct shape to localStorage('pfc_user')
// so dashboard.html can read it immediately after navigation.
// ─────────────────────────────────────────────────────────────────────────────
function buildComplete() {
  // Read every individual field so we preserve the exact shape dashboard expects
  const income      = n('f-income');
  const otherIncome = n('f-other-income');
  const housing     = n('f-housing');
  const food        = n('f-food');
  const transport   = n('f-transport');
  const otherExp    = n('f-other-exp');
  const savings     = n('f-savings');
  const investments = n('f-investments');
  const debt        = n('f-debt');
  const debtPay     = n('f-debtpay');

  const totalIncome = income + otherIncome;
  const totalExpenses = housing + food + transport + otherExp;
  // Surplus after debt payments — this is what's actually available to save
  const surplus = Math.max(0, totalIncome - totalExpenses - debtPay);
  const nw12    = (savings + investments - debt) + (surplus * 12 * 0.9);
  const score   = calcScore(surplus, totalIncome, debt, savings);

  const name = document.getElementById('f-fullname').value.trim() || 'User';

  // Update completion screen display values
  document.getElementById('cm-networth').textContent = currencySymbol + Math.round(nw12).toLocaleString();
  document.getElementById('cm-savings').textContent  = currencySymbol + Math.round(surplus).toLocaleString() + '/mo';
  const scEl = document.getElementById('cm-score');
  scEl.textContent = score + ' / 100';
  scEl.style.color = score >= 70 ? 'var(--teal)' : score >= 40 ? 'var(--amber)' : 'var(--red)';

  // Save to localStorage with the exact shape dashboard.html's DEFAULT_USER expects.
  // Previously this saved a differently-shaped summary to sessionStorage — which
  // dashboard.html never read. This is the critical fix.
  const userData = {
    name,
    currency:     currencySymbol,
    income,
    otherIncome,
    housing,
    food,
    transport,
    otherExp,
    savings,
    investments,
    debt,
    debtPay,
    plan: 'free',
  };

  try {
    // PFCUser is the central store — writes to LS sync mirror (immediate),
    // encrypted PFCStorage (async), cash-forecast legacy LS, and notifies
    // every onChange subscriber across other tabs/pages. Falls back to a
    // direct PFCStorage write if PFCUser failed to load.
    if (typeof PFCUser !== 'undefined') {
      PFCUser.set(userData);
    } else {
      PFCStorage.setJSON('user', userData);
    }
    // Persist selectedGoals (UX §6.16) so dashboard's loadGoals() shows the
    // user's real picks instead of the legacy fake-goals injection at
    // dashboard.html:2018-2025. Each goal carries a sensible default target;
    // current = 0 because nothing has been saved toward it yet.
    const GOAL_DEFAULTS = {
      emergency: { name: 'Emergency fund', target: Math.max(3 * (totalExpenses + debtPay), 5000) },
      debt:      { name: 'Pay off debt',   target: debt || 1000 },
      home:      { name: 'Home deposit',   target: 50000 },
      invest:    { name: 'Investing',      target: 25000 },
      retire:    { name: 'Retire early',   target: 500000 },
      travel:    { name: 'Travel fund',    target: 5000 },
    };
    const goalsArray = Array.from(selectedGoals).map(key => ({
      key,
      name: (GOAL_DEFAULTS[key] || {}).name || key,
      target: (GOAL_DEFAULTS[key] || {}).target || 1000,
      current: 0,
    }));
    PFCStorage.setJSON('goals', goalsArray);

    // Bug fix (May 2026): if the Supabase auth session hadn't resolved at the
    // moment we wrote the data, _uid() returned 'guest' and the data landed
    // under pfc:guest:user. Cash-forecast then reads from pfc:{realUid}:user
    // and gets empty values + the "Finish onboarding" banner. The one-shot
    // _adoptGuestDataAsync that runs at session start has already passed.
    //
    // Force a re-adoption AFTER the write so the data is promoted into the
    // authenticated namespace. This is idempotent and safe regardless of the
    // auth state at the moment buildComplete() fires.
    try {
      const uid = (typeof PFCAuth !== 'undefined' && PFCAuth.getUserId) ? PFCAuth.getUserId() : 'guest';
      if (uid && uid !== 'guest' && typeof PFCStorage.adoptGuestData === 'function') {
        PFCStorage.adoptGuestData(uid);
      }
    } catch (adoptErr) {
      console.warn('[onboarding] post-write guest adoption failed:', adoptErr && adoptErr.message);
    }
  } catch (e) {
    console.error('Could not save user data to localStorage:', e);
  }
}

function calcScore(surplus, income, debt, savings) {
  let s = 0;
  const savePct = income > 0 ? surplus / income : 0;
  if (savePct >= 0.2) s += 30;
  else if (savePct >= 0.1) s += 20;
  else if (savePct > 0) s += 10;
  if (surplus > 0) s += 20;
  if (debt === 0) s += 25;
  else if (debt < savings * 2) s += 12;
  if (savings >= surplus * 3) s += 15;
  else if (savings > 0) s += 8;
  return Math.min(99, Math.max(5, s));
}

function launchConfetti() {
  const wrap = document.getElementById('confetti');
  const colors = ['var(--money)','#3B82F6','#F5A623','#A78BFA','#22C55E'];
  for (let i = 0; i < 80; i++) {
    const p = document.createElement('div');
    const size = Math.random() * 8 + 4;
    p.style.cssText = `position:absolute;width:${size}px;height:${size}px;background:${colors[Math.floor(Math.random()*colors.length)]};
      left:${Math.random()*100}%;top:-10px;border-radius:${Math.random()>.5?'50%':'2px'};
      animation:fall ${1.5+Math.random()*2}s ${Math.random()*1}s ease-in forwards;opacity:.85;`;
    wrap.appendChild(p);
  }
  const style = document.createElement('style');
  style.textContent = `@keyframes fall{to{transform:translateY(105vh) rotate(720deg);opacity:0;}}`;
  document.head.appendChild(style);
  setTimeout(() => wrap.innerHTML = '', 4000);
}

calcLive();
calcDebt();
