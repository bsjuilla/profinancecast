// R-P0-8 fix (audit 2026-05-24) — HTML/CSS/numeric escape helpers.
// Promoted from local-only to documented invariant: every interpolation
// into innerHTML on this page MUST pass through one of:
//   - escHtml(r.name)              — user-typed/CSV-parsed strings
//   - _cssColor(meta.color)        — color values flowing into style="background:"
//   - Number(r.x) || 0             — numeric attribute values
//   - sym (escaped at assignment site, line ~340 USER.sym = ...)
function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// R-P0-8 fix — CSS-context whitelist (same pattern as goals-2 _cssColor).
// Allows: var(--name), #hex, rgb()/rgba(), hsl()/hsla(), named CSS colors.
// Anything else → fallback to brand teal. Prevents CSS-context breakout
// (e.g. tampered color `red"><img src=x onerror=alert(1)>`).
function _cssColor(v) {
  const s = String(v == null ? '' : v).trim();
  if (/^var\(--[a-z0-9-]+\)$/i.test(s)) return s;
  if (/^#[0-9a-f]{3,8}$/i.test(s)) return s;
  if (/^rgba?\(\s*\d+%?\s*,\s*\d+%?\s*,\s*\d+%?(\s*,\s*[\d.]+)?\s*\)$/i.test(s)) return s;
  if (/^hsla?\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%(\s*,\s*[\d.]+)?\s*\)$/i.test(s)) return s;
  if (/^(red|blue|green|orange|purple|gold|teal|cyan|magenta|yellow|black|white|gray|grey)$/i.test(s)) return s;
  return 'var(--teal)';
}

// R-P0-9 fix — custom confirm/alert modals replacing native confirm()/alert().
// Native dialogs are blocked/invisible in iOS PWA standalone mode. Promise-
// based modals work everywhere. Reuses #pfc-confirm-modal markup added in
// recurring.html (mirrors NW-P1-6 / G-P1-D pattern).
let _pfcModalActive = false;
function _pfcConfirm(message, okLabel) {
  return new Promise(function (resolve) {
    if (_pfcModalActive) { resolve(false); return; }
    _pfcModalActive = true;
    const modal = document.getElementById('rec-confirm-modal');
    const msgEl = document.getElementById('rec-confirm-msg');
    const okBtn = document.getElementById('rec-confirm-ok');
    const cancelBtn = document.getElementById('rec-confirm-cancel');
    if (!modal || !msgEl || !okBtn || !cancelBtn) {
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
  // Variant of _pfcConfirm with only an OK button (no Cancel).
  return new Promise(function (resolve) {
    if (_pfcModalActive) { resolve(); return; }
    _pfcModalActive = true;
    const modal = document.getElementById('rec-confirm-modal');
    const msgEl = document.getElementById('rec-confirm-msg');
    const okBtn = document.getElementById('rec-confirm-ok');
    const cancelBtn = document.getElementById('rec-confirm-cancel');
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

// R-P0-1 helper — stable id minting (same pattern as goals G-P0-1).
function _mintId() {
  return 'r_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// ── STATE ──
let USER = {};
let RECURRINGS = [];   // detected recurring items
// R-P0-1 fix: CANCELLED is now a Set of stable r.id strings (not array
// indices), persisted to localStorage. Pre-fix, sort + reload + manual-add
// silently de-synced cancellations.
let CANCELLED = new Set();
let currentFilter = 'all';
let catChart = null, trendChart = null;

function _loadCancelled() {
  try { return new Set(PFCStorage.getJSON('recurrings_cancelled') || []); }
  catch (_) { return new Set(); }
}
function _saveCancelled() {
  try { PFCStorage.setJSON('recurrings_cancelled', Array.from(CANCELLED)); }
  catch (_) {}
}
// R-P0-1: backfill stable id for any pre-rollout recurring entry.
function _backfillIds() {
  let needsSave = false;
  RECURRINGS.forEach(r => {
    if (!r.id) { r.id = _mintId(); needsSave = true; }
  });
  if (needsSave) { try { PFCStorage.setJSON('recurrings', RECURRINGS); } catch (_) {} }
}

const CAT_META = {
  streaming: { icon: '🎬', color: '#E05252', label: 'Streaming' },
  software:  { icon: '💻', color: '#3B82F6', label: 'Software' },
  utilities: { icon: '⚡', color: '#F5A623', label: 'Utilities' },
  insurance: { icon: '🛡️', color: '#A78BFA', label: 'Insurance' },
  finance:   { icon: '🏦', color: '#22C55E', label: 'Finance' },
  health:    { icon: '❤️', color: '#F97316', label: 'Health' },
  other:     { icon: '📄', color: '#B8C2BC', label: 'Other' },
};

// ── BRAND RECOGNITION ──
const BRAND_DB = {
  netflix:{cat:'streaming',icon:'🎬'}, 'netflix.com':{cat:'streaming',icon:'🎬'},
  spotify:{cat:'streaming',icon:'🎵'}, deezer:{cat:'streaming',icon:'🎵'},
  'apple music':{cat:'streaming',icon:'🎵'}, 'youtube premium':{cat:'streaming',icon:'🎬'},
  'canal+':{cat:'streaming',icon:'🎬'}, 'canal plus':{cat:'streaming',icon:'🎬'},
  showmax:{cat:'streaming',icon:'🎬'}, 'amazon prime':{cat:'streaming',icon:'🎬'},
  'disney+':{cat:'streaming',icon:'🎬'}, hulu:{cat:'streaming',icon:'🎬'},
  'apple tv':{cat:'streaming',icon:'🎬'}, 'bein':{cat:'streaming',icon:'📺'},
  'microsoft 365':{cat:'software',icon:'💻'}, 'office 365':{cat:'software',icon:'💻'},
  adobe:{cat:'software',icon:'🎨'}, dropbox:{cat:'software',icon:'☁️'},
  'google one':{cat:'software',icon:'☁️'}, icloud:{cat:'software',icon:'☁️'},
  notion:{cat:'software',icon:'📝'}, slack:{cat:'software',icon:'💬'},
  zoom:{cat:'software',icon:'📹'}, github:{cat:'software',icon:'💻'},
  canva:{cat:'software',icon:'🎨'}, chatgpt:{cat:'software',icon:'🤖'},
  openai:{cat:'software',icon:'🤖'}, 'anthropic':{cat:'software',icon:'🤖'},
  gym:{cat:'health',icon:'💪'}, fitness:{cat:'health',icon:'💪'},
  'health ins':{cat:'insurance',icon:'🛡️'}, 'life ins':{cat:'insurance',icon:'🛡️'},
  insurance:{cat:'insurance',icon:'🛡️'}, 'assurance':{cat:'insurance',icon:'🛡️'},
  electricity:{cat:'utilities',icon:'⚡'}, electricite:{cat:'utilities',icon:'⚡'},
  internet:{cat:'utilities',icon:'📡'}, 'my.t':{cat:'utilities',icon:'📡'},
  airtel:{cat:'utilities',icon:'📱'}, emtel:{cat:'utilities',icon:'📱'},
  'orange':{cat:'utilities',icon:'📱'}, water:{cat:'utilities',icon:'💧'},
  cwma:{cat:'utilities',icon:'💧'}, cem:{cat:'utilities',icon:'⚡'},
  loan:{cat:'finance',icon:'🏦'}, 'credit card':{cat:'finance',icon:'💳'},
  mortgage:{cat:'finance',icon:'🏠'}, 'hire purchase':{cat:'finance',icon:'🏦'},
};

// ── INIT ──
// R-P0-3 fix — wrap in DOMContentLoaded so getElementById calls in
// showResults/renderCards don't return null on cold-load. Pre-fix the
// script ran in <head> sync before body parsed → crash on cold-load
// with cached data. Also defer ensures PFCStorage/PFCAuth are loaded.
// R-P0-1 + R-P0-8 — load CANCELLED from persistence + escape sym at
// the single assignment site.
function init() {
  try { USER = (typeof PFCUser !== 'undefined') ? PFCUser.get() : (PFCStorage.getJSON('user') || {}); } catch(e) {}
  USER.sym = escHtml(window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$'));
  CANCELLED = _loadCancelled();
  try {
    const saved = PFCStorage.get('recurrings');
    if (saved) {
      RECURRINGS = JSON.parse(saved);
      _backfillIds();
      showResults();
    }
  } catch(e) {}
}

// ── FILE HANDLING ──
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('drop-area').classList.remove('drag');
  if (e.dataTransfer.files[0]) startProcess(e.dataTransfer.files[0]);
}
function handleFile(input) {
  if (input.files[0]) startProcess(input.files[0]);
  input.value = '';
}

async function startProcess(file) {
  setState('processing');
  setProc('Reading your statement…', 'Parsing CSV rows', 10);
  await sleep(200);

  let text;
  try { text = await file.text(); }
  catch(e) { setState('upload'); await _pfcAlert('Could not read file. Try a different CSV.'); return; }

  setProc('Detecting recurring patterns…', 'Grouping transactions by merchant', 40);
  await sleep(300);

  const txns = parseCSV(text);
  if (!txns.length) { setState('upload'); await _pfcAlert('No transactions found. Check your CSV format.'); return; }

  setProc('Analysing frequency…', 'Identifying subscriptions and bills', 65);
  await sleep(300);

  // R-P0-2 fix — spread-merge with existing manual entries instead of
  // wholesale replace. Pre-fix every CSV upload destroyed any manually-
  // added gym/insurance/etc. Behaviour: detected items merge with
  // existing by name match (preserving manual entries' ids + boost +
  // any user-set fields); brand-new detected items get fresh ids.
  const detected = detectRecurrings(txns);
  const existing = RECURRINGS.slice();
  const merged = [];
  const seenNames = new Set();
  detected.forEach(d => {
    const match = existing.find(e => e.name === d.name && e.cat === d.cat);
    if (match) {
      merged.push({ ...match, ...d, id: match.id }); // preserve id + spread-merge
    } else {
      merged.push({ ...d, id: _mintId() });
    }
    seenNames.add(d.name);
  });
  // Preserve manual entries that weren't re-detected (still active subs).
  existing.forEach(e => {
    if (!seenNames.has(e.name)) merged.push(e);
  });
  RECURRINGS = merged;

  setProc('Checking for price changes…', 'Comparing charge amounts over time', 85);
  await sleep(300);

  RECURRINGS = flagPriceChanges(RECURRINGS);

  setProc('Building your report…', `Found ${RECURRINGS.length} recurring items`, 100);
  await sleep(250);

  PFCStorage.setJSON('recurrings', RECURRINGS);
  showResults();
}

// ── CSV PARSER (same logic as dashboard, self-contained) ──
const COL_SYN = {
  date:   ['date','transaction date','trans date','value date','posting date','txn date'],
  desc:   ['description','details','narrative','merchant','payee','reference','particulars','memo','libelle'],
  debit:  ['debit','withdrawal','debit amount','paid out','dr','charges','amount debit'],
  credit: ['credit','deposit','credit amount','paid in','cr','amount received'],
  amount: ['amount','net amount','transaction amount','value','montant'],
};
function parseCSVRow(line) {
  const r=[]; let c=''; let q=false;
  for (let i=0;i<line.length;i++) {
    const ch=line[i];
    if(ch==='"'){q=!q;}
    else if((ch===','||ch===';'||ch==='\t')&&!q){r.push(c);c='';}
    else{c+=ch;}
  }
  r.push(c); return r;
}
function parseCSV(text) {
  const lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').trim().split('\n');
  if (lines.length < 2) return [];
  let hIdx = 0;
  for (let i=0;i<Math.min(5,lines.length);i++) {
    const r=lines[i].toLowerCase();
    if (COL_SYN.date.some(s=>r.includes(s))||COL_SYN.desc.some(s=>r.includes(s))){ hIdx=i; break; }
  }
  const headers = parseCSVRow(lines[hIdx]).map(h=>h.toLowerCase().trim().replace(/['"]/g,''));
  const find = (syns) => headers.findIndex(h=>syns.some(s=>h.includes(s)));
  const ci = { date:find(COL_SYN.date), desc:find(COL_SYN.desc), debit:find(COL_SYN.debit), credit:find(COL_SYN.credit), amount:find(COL_SYN.amount) };
  if (ci.debit!==-1||ci.credit!==-1) ci.amount=-1;
  if (ci.date===-1||ci.desc===-1) return [];
  const txns=[];
  for (let i=hIdx+1;i<lines.length;i++) {
    const row=parseCSVRow(lines[i]);
    if(!row.length||row.every(c=>!c.trim())) continue;
    const rawDate=(row[ci.date]||'').trim().replace(/['"]/g,'');
    const rawDesc=(row[ci.desc]||'').trim().replace(/['"]/g,'');
    if(!rawDate&&!rawDesc) continue;
    let amount=0,isDebit=false;
    if(ci.amount!==-1){
      const v=parseFloat((row[ci.amount]||'').replace(/['",$€£Rs\s]/g,''))||0;
      amount=Math.abs(v); isDebit=v<0;
    } else {
      const d=parseFloat((row[ci.debit]||'').replace(/['",$€£Rs\s]/g,''))||0;
      const c2=parseFloat((row[ci.credit]||'').replace(/['",$€£Rs\s]/g,''))||0;
      if(d>0){amount=d;isDebit=true;} else if(c2>0){amount=c2;isDebit=false;} else continue;
    }
    if(!amount||!isDebit) continue; // only expenses
    txns.push({ date:parseDate(rawDate), desc:rawDesc.replace(/\s+/g,' ').trim().slice(0,80), amount });
  }
  return txns;
}
function parseDate(s) {
  s=s.replace(/['"]/g,'').trim();
  // ISO 8601 YYYY-MM-DD — unambiguous, pass through directly.
  if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
  // DD/MM/YYYY or DD-MM-YYYY (day first — most non-US bank CSVs).
  // m[1]=DD, m[2]=MM, m[3]=YYYY → normalise to ISO YYYY-MM-DD.
  const m=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if(m){ const y=m[3].length===2?'20'+m[3]:m[3]; return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; }
  return s;
}

// ── CORE: DETECT RECURRINGS ──
function detectRecurrings(txns) {
  // Group by normalised merchant name
  const groups = {};
  txns.forEach(t => {
    const key = normaliseMerchant(t.desc);
    if (!groups[key]) groups[key] = { name: key, raw: t.desc, occurrences: [] };
    groups[key].occurrences.push({ date: t.date, amount: t.amount });
  });

  const recurring = [];
  Object.values(groups).forEach(g => {
    const occ = g.occurrences.sort((a,b) => a.date.localeCompare(b.date));
    if (occ.length < 2) return; // need at least 2 to be recurring

    // Check if spacing is roughly weekly/monthly/annual
    const gaps = [];
    for (let i = 1; i < occ.length; i++) {
      const d1 = new Date(occ[i-1].date), d2 = new Date(occ[i].date);
      gaps.push(Math.round((d2-d1)/(1000*60*60*24)));
    }
    const avgGap = gaps.reduce((s,g)=>s+g,0)/gaps.length;
    let freq = null, freqLabel = '', monthlyAmount = 0;

    if (avgGap <= 10)        { freq='weekly';  freqLabel='Weekly';  monthlyAmount=occ[occ.length-1].amount*4.33; }
    else if (avgGap <= 40)   { freq='monthly'; freqLabel='Monthly'; monthlyAmount=occ[occ.length-1].amount; }
    else if (avgGap <= 100)  { freq='quarterly'; freqLabel='Quarterly'; monthlyAmount=occ[occ.length-1].amount/3; }
    else if (avgGap <= 400)  { freq='annual'; freqLabel='Annual'; monthlyAmount=occ[occ.length-1].amount/12; }
    else return;

    // Brand lookup
    const brand = lookupBrand(g.raw);
    const cat   = brand?.cat || guessCategory(g.raw);
    const icon  = brand?.icon || CAT_META[cat]?.icon || '📄';

    // All amounts seen
    const amounts = occ.map(o => o.amount);

    recurring.push({
      id:            _mintId(),  // R-P0-1: stable id at every entry creation
      name:          cleanName(g.name),
      rawDesc:       g.raw,
      cat,
      icon,
      freq,
      freqLabel,
      monthlyAmount: Math.round(monthlyAmount * 100) / 100,
      annualAmount:  Math.round(monthlyAmount * 12 * 100) / 100,
      occurrences:   occ,
      amounts,
      minAmount:     Math.min(...amounts),
      maxAmount:     Math.max(...amounts),
      lastCharge:    occ[occ.length-1].date,
      firstCharge:   occ[0].date,
      priceIncreased: false, // set later
      priceDiff:     0,
    });
  });

  return recurring.sort((a,b) => b.monthlyAmount - a.monthlyAmount);
}

function normaliseMerchant(desc) {
  return desc.toLowerCase()
    .replace(/[0-9]{4,}/g,'')         // remove long number sequences (ref numbers)
    .replace(/\s+(ref|no|#|id)[\s\S]*/,'') // strip reference tails
    .replace(/[^a-z\s]/g,' ')
    .replace(/\s+/g,' ')
    .trim()
    .split(' ').slice(0,3).join(' '); // first 3 words
}
function cleanName(n) {
  return n.split(' ').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
}
function lookupBrand(desc) {
  const lower = desc.toLowerCase();
  for (const [key,val] of Object.entries(BRAND_DB)) {
    if (lower.includes(key)) return val;
  }
  return null;
}
function guessCategory(desc) {
  const d = desc.toLowerCase();
  if (/netflix|spotify|deezer|canal|disney|hulu|showmax|bein|apple tv|youtube/.test(d)) return 'streaming';
  if (/microsoft|adobe|google|icloud|dropbox|notion|slack|zoom|github|canva|openai/.test(d)) return 'software';
  if (/electric|electricity|water|internet|fibre|fiber|airtel|emtel|orange|myt|cwma|cem/.test(d)) return 'utilities';
  if (/insurance|assurance|insur|cover|protection|policy|premium/.test(d)) return 'insurance';
  if (/loan|mortgage|credit|hire purchase|leasing|bank|finance|mbl|mcb|sbm/.test(d)) return 'finance';
  if (/gym|fitness|health|clinic|doctor|medical|pharmacy|sport/.test(d)) return 'health';
  return 'other';
}

// ── FLAG PRICE CHANGES ──
function flagPriceChanges(recurrings) {
  return recurrings.map(r => {
    if (r.amounts.length < 2) return r;
    // Compare first half avg to second half avg
    const mid = Math.floor(r.amounts.length / 2);
    const early = r.amounts.slice(0, mid).reduce((s,a)=>s+a,0)/mid;
    const recent = r.amounts.slice(mid).reduce((s,a)=>s+a,0)/(r.amounts.length-mid);
    const diff = recent - early;
    const pct  = (diff / early) * 100;
    if (pct > 5) { // >5% increase = flagged
      return { ...r, priceIncreased: true, priceDiff: Math.round(diff * 100)/100, pricePct: Math.round(pct) };
    }
    return r;
  });
}

// ── SHOW RESULTS ──
function showResults() {
  setState('results');
  document.getElementById('btn-add-manual').style.display = 'flex';
  document.getElementById('btn-clear').style.display = 'flex';
  updateMetrics();
  renderAlerts();
  renderCharts();
  renderCards();
}

function updateMetrics() {
  // R-P0-8: USER.sym is escaped at the single assignment site in init();
  // every downstream interpolation is safe via textContent (auto-safe) or
  // through escHtml() in innerHTML paths.
  const sym = USER.sym || '$';
  // R-P0-1: CANCELLED is now keyed by stable r.id, not array index.
  const active = RECURRINGS.filter(r => !CANCELLED.has(r.id));
  const totalMonthly = Number(active.reduce((s,r) => s + (Number(r.monthlyAmount)||0), 0)) || 0;
  const totalAnnual  = Number(active.reduce((s,r) => s + (Number(r.annualAmount)||0), 0)) || 0;
  const flagged      = active.filter(r => r.priceIncreased);
  const savings      = flagged.reduce((s,r) => s + (Number(r.annualAmount)||0), 0);

  document.getElementById('m-monthly').textContent = sym + totalMonthly.toFixed(2);
  document.getElementById('m-monthly-hint').textContent = `across ${active.length} active subscriptions`;
  document.getElementById('m-annual').textContent  = sym + Math.round(totalAnnual).toLocaleString();
  document.getElementById('m-annual-hint').textContent = `${sym}${Math.round(totalMonthly).toLocaleString()} × 12 months`;
  document.getElementById('m-count').textContent   = RECURRINGS.length;
  document.getElementById('m-count-hint').textContent = `${flagged.length} with price increases`;
  document.getElementById('m-savings').textContent = sym + Math.round(savings).toLocaleString();

  document.getElementById('topbar-sub').textContent =
    `${RECURRINGS.length} recurring charges detected · ${sym}${totalMonthly.toFixed(2)}/mo · ${sym}${Math.round(totalAnnual).toLocaleString()}/yr`;
}

function renderAlerts() {
  // R-P0-8 + R-P0-1: sym pre-escaped at init; CANCELLED keyed by id; r.name
  // wrapped in escHtml. Pre-fix `<strong>${r.name}</strong>` was raw → CSV
  // merchant name `<img src=x onerror=alert(1)>` fired XSS on every render.
  const sym  = USER.sym || '$';
  const wrap = document.getElementById('alerts-wrap');
  wrap.innerHTML = '';

  const increased = RECURRINGS.filter(r => !CANCELLED.has(r.id) && r.priceIncreased);
  if (increased.length) {
    const names = increased.slice(0,3).map(r=>`<strong>${escHtml(r.name)}</strong>`).join(', ');
    const extra = increased.reduce((s,r)=>s+(Number(r.priceDiff)||0)*12,0);
    wrap.innerHTML += `<div class="alert-banner red">
      <div class="alert-icon">⚠️</div>
      <div class="alert-text">${increased.length} subscription${increased.length>1?'s have':' has'} quietly raised prices: ${names}${increased.length>3?' and more':''}.
      You're paying <strong>${sym}${Math.round(extra).toLocaleString()} more per year</strong> than when you first subscribed.</div>
    </div>`;
  }

  // R-P0-8 hardening: use Object.create(null) so a malicious r.cat value
  // like '__proto__' or 'constructor' can't mutate Object.prototype.
  const bycat = Object.create(null);
  RECURRINGS.filter(r => !CANCELLED.has(r.id)).forEach(r=>{ if(!bycat[r.cat]) bycat[r.cat]=[]; bycat[r.cat].push(r); });
  const dupes = Object.entries(bycat).filter(([,v])=>v.length>=3 && v[0].cat==='streaming');
  if (dupes.length) {
    const streamTotal = (bycat['streaming']||[]).reduce((s,r)=>s+r.monthlyAmount,0);
    wrap.innerHTML += `<div class="alert-banner amber">
      <div class="alert-icon">💡</div>
      <div class="alert-text">You have <strong>${bycat['streaming']?.length||0} streaming services</strong> costing <strong>${sym}${streamTotal.toFixed(2)}/mo</strong>. 
      Consider whether you need all of them — cancelling even one could save ${sym}${Math.round(streamTotal/2*12).toLocaleString()}/yr.</div>
    </div>`;
  }
}

function renderCharts() {
  // R-P0-12 fix: guard against Chart.js CDN failure. Pre-fix `new Chart(...)`
  // threw "Chart is not defined" → renderCharts aborted → rest of results
  // state (sankey, cards) broken because renderCharts is called inside
  // showResults. Now: degrade gracefully and let the rest of the page render.
  if (typeof window.Chart === 'undefined') {
    const catCv = document.getElementById('catChart');
    const trCv = document.getElementById('trendChart');
    if (catCv) catCv.style.display = 'none';
    if (trCv) trCv.style.display = 'none';
    return;
  }
  const sym = USER.sym || '$';
  // R-P0-1 fix: filter by stable id, not array index.
  const active = RECURRINGS.filter(r => !CANCELLED.has(r.id));

  // Category donut
  // R-P0-8 hardening: Object.create(null) — prototype pollution defence.
  const catTotals = Object.create(null);
  active.forEach(r=>{ catTotals[r.cat]=(catTotals[r.cat]||0)+(Number(r.monthlyAmount)||0); });
  const catEntries = Object.entries(catTotals).sort((a,b)=>b[1]-a[1]);

  // Money-flow sankey — animates ribbons from total → top categories
  const sankeySvg = document.getElementById('recurring-sankey');
  if (sankeySvg && window.PFCMotion) {
    const sankeyData = catEntries.slice(0, 6).map(([c, v]) => ({
      label: CAT_META[c]?.label || c,
      amount: v,
      color: CAT_META[c]?.color || '#B8C2BC',
    }));
    if (sankeyData.length) {
      window.PFCMotion.sankey(sankeySvg, sankeyData);
    } else {
      while (sankeySvg.firstChild) sankeySvg.removeChild(sankeySvg.firstChild);
    }
  }

  if (catChart) { catChart.destroy(); catChart=null; }
  catChart = new Chart(document.getElementById('catChart'), {
    type:'doughnut',
    data:{
      labels: catEntries.map(([c])=>CAT_META[c]?.label||c),
      datasets:[{
        data: catEntries.map(([,v])=>Math.round(v*100)/100),
        backgroundColor: catEntries.map(([c])=>CAT_META[c]?.color+'99'||'#B8C2BC99'),
        borderColor: catEntries.map(([c])=>CAT_META[c]?.color||'#B8C2BC'),
        borderWidth:1.5,
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false, cutout:'68%',
      plugins:{
        legend:{ position:'right', labels:{ color:'#B8C2BC', font:{size:11}, padding:10, boxWidth:10 } },
        tooltip:{ backgroundColor:'#16271F', borderColor:'rgba(255,255,255,0.1)', borderWidth:1,
          callbacks:{ label: ctx=>' '+sym+ctx.parsed.toFixed(2)+'/mo' } }
      }
    }
  });

  // Monthly trend line
  const monthMap = {};
  active.forEach(r=>{
    r.occurrences.forEach(o=>{
      const key=o.date.slice(0,7);
      monthMap[key]=(monthMap[key]||0)+o.amount;
    });
  });
  const months=Object.keys(monthMap).sort();
  const trendData=months.map(m=>Math.round(monthMap[m]*100)/100);

  if (trendChart) { trendChart.destroy(); trendChart=null; }
  trendChart = new Chart(document.getElementById('trendChart'), {
    type:'bar',
    data:{
      labels: months.map(m=>{ const d=new Date(m+'-01'); return d.toLocaleDateString('en-GB',{month:'short',year:'2-digit'}); }),
      datasets:[{
        label:'Recurring spend',
        data:trendData,
        backgroundColor:'rgba(43,182,125,0.2)',
        borderColor:'#2BB67D',
        borderWidth:1.5,
        borderRadius:4,
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{ backgroundColor:'#16271F', borderColor:'rgba(255,255,255,0.1)', borderWidth:1,
        callbacks:{ label: ctx=>' '+sym+ctx.parsed.y.toLocaleString() } } },
      scales:{
        x:{ grid:{color:'rgba(255,255,255,0.04)'}, ticks:{color:'#4A5A6E',font:{size:10}} },
        y:{ grid:{color:'rgba(255,255,255,0.04)'}, ticks:{color:'#4A5A6E',font:{size:10}, callback:v=>sym+(v>=1000?(v/1000).toFixed(0)+'k':v)} }
      }
    }
  });
}

function renderCards() {
  const sym  = window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$');
  const grid = document.getElementById('rec-grid');
  const filtered = RECURRINGS.filter((r,i)=>{
    // R-P0-1: filter by stable r.id, not array index. Sort-in-place no
    // longer desyncs cancellations.
    if (currentFilter==='cancelled') return CANCELLED.has(r.id);
    if (CANCELLED.has(r.id)) return false;
    if (currentFilter==='all') return true;
    if (currentFilter==='flagged') return r.priceIncreased;
    return r.cat===currentFilter;
  });

  if (!filtered.length) {
    grid.innerHTML=`<div style="grid-column:1/-1;text-align:center;padding:48px 24px;color:var(--text3);">No items match this filter.</div>`;
    return;
  }

  // R-P0-6+7 + R-P0-8: build innerHTML with escape gates, then attach
  // listeners via addEventListener post-paint (CSP-clean — no inline
  // onclick, same pattern as G-P0-5 / commit e9aa091).
  grid.innerHTML = filtered.map(r=>{
    const isCancelled = CANCELLED.has(r.id);
    const meta = CAT_META[r.cat]||CAT_META.other;
    // R-P0-8: _cssColor whitelist on every color flowing into style="...".
    const colorSafe = _cssColor(meta.color);

    // Mini bar chart — amounts over time (last 6)
    const recent = (r.amounts || []).slice(-6);
    const maxA   = recent.length ? Math.max.apply(null, recent) : 0;
    const bars   = recent.map(a=>{
      const h = maxA > 0 ? Math.max(4, Math.round(a/maxA*28)) : 4;
      const col = r.priceIncreased && a===r.maxAmount ? 'var(--red)' : colorSafe;
      return `<div class="rec-tick" style="height:${Number(h)||4}px;background:${col};opacity:0.6;"></div>`;
    }).join('');

    const lastFmt = r.lastCharge ? new Date(r.lastCharge).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '—';
    const firstFmt= r.firstCharge? new Date(r.firstCharge).toLocaleDateString('en-GB',{month:'short',year:'numeric'}) : '—';

    const badges = [];
    // R-P0-8: priceDiff coerced via Number; sym already escaped at source.
    if (r.priceIncreased) badges.push(`<span class="badge badge-red">↑ +${sym}${(Number(r.priceDiff)||0).toFixed(2)}/mo price increase</span>`);
    if (isCancelled)       badges.push(`<span class="badge badge-grey">✕ Marked cancelled</span>`);
    badges.push(`<span class="badge" style="background:${colorSafe};opacity:0.85;color:#fff;">${escHtml(r.icon||'')} ${escHtml(meta.label||'')}</span>`);
    if (r.freqLabel!=='Monthly') badges.push(`<span class="badge badge-blue">${escHtml(r.freqLabel||'')}</span>`);

    // R-P0-6+7: data-action attrs replace inline onclick — wired below.
    // r.id is escaped + used as data attribute (only-base36 from _mintId).
    const safeId = escHtml(r.id || '');
    return `<div class="rec-card ${r.priceIncreased&&!isCancelled?'price-up':''} ${isCancelled?'cancelled':''}" data-rec-id="${safeId}">
      <div class="rec-top">
        <div class="rec-icon" style="background:${colorSafe};opacity:0.5;">${escHtml(r.icon||'')}</div>
        <div class="rec-info">
          <div class="rec-name">${escHtml(r.name)}</div>
          <div class="rec-meta">Since ${firstFmt} · ${(r.occurrences||[]).length} charges · last ${lastFmt}</div>
        </div>
        <div class="rec-amount">
          <div class="rec-monthly" style="color:${colorSafe};">${sym}${(Number(r.monthlyAmount)||0).toFixed(2)}<span style="font-size:11px;color:var(--text3);font-family:var(--font-body);">/mo</span></div>
          <div class="rec-annual">${sym}${Math.round(Number(r.annualAmount)||0).toLocaleString()}/yr</div>
        </div>
      </div>
      <div class="rec-body">
        <div class="rec-badges">${badges.join('')}</div>
        ${recent.length>1?`<div class="rec-timeline">${bars}</div><div class="rec-dates"><span>${firstFmt}</span><span>Last 6 charges</span><span>${lastFmt}</span></div>`:''}
        <div class="rec-actions">
          ${!isCancelled?`<button class="rec-action-btn cancel-btn" data-action="toggleCancel" data-id="${safeId}">Mark as cancelled</button>`
                        :`<button class="rec-action-btn" data-action="toggleCancel" data-id="${safeId}" style="color:var(--teal);border-color:rgba(43,182,125,0.2);">Restore</button>`}
          ${!isCancelled?`<button class="rec-action-btn" data-action="askSage" data-id="${safeId}">Ask Sage</button>`:''}
        </div>
      </div>
    </div>`;
  }).join('');

  // R-P0-6+7: wire post-render listeners (no inline onclick = CSP clean).
  grid.querySelectorAll('[data-action]').forEach(btn => {
    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');
    if (action === 'toggleCancel') {
      btn.addEventListener('click', () => toggleCancelById(id));
    } else if (action === 'askSage') {
      btn.addEventListener('click', () => askSageById(id));
    }
  });
}

// ── ACTIONS ──
// R-P0-1: id-keyed toggleCancel. Persists CANCELLED to localStorage so
// reload preserves the marks (pre-fix every reload wiped them).
function toggleCancelById(id) {
  if (!id) return;
  if (CANCELLED.has(id)) CANCELLED.delete(id);
  else CANCELLED.add(id);
  _saveCancelled();
  updateMetrics();
  renderAlerts();
  renderCharts();
  renderCards();
  const r = RECURRINGS.find(x => x.id === id);
  if (r) showToast(CANCELLED.has(id) ? `${r.name} marked as cancelled` : `${r.name} restored`);
}
// Legacy alias for any external caller (kept for safety; new code uses ById).
function toggleCancel(arg) {
  if (typeof arg === 'string') return toggleCancelById(arg);
  if (typeof arg === 'number' && RECURRINGS[arg]) return toggleCancelById(RECURRINGS[arg].id);
}

function setFilter(f, el) {
  currentFilter = f;
  document.querySelectorAll('.filter-tab').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  renderCards();
}

function sortCards(val) {
  if (val==='amount-desc') RECURRINGS.sort((a,b)=>b.monthlyAmount-a.monthlyAmount);
  else if (val==='amount-asc') RECURRINGS.sort((a,b)=>a.monthlyAmount-b.monthlyAmount);
  else if (val==='name') RECURRINGS.sort((a,b)=>a.name.localeCompare(b.name));
  else if (val==='flagged') RECURRINGS.sort((a,b)=>(b.priceIncreased?1:0)-(a.priceIncreased?1:0));
  renderCards();
}

// R-P0-1 + R-P0-9: id-keyed Sage call + custom modal replaces native alert.
async function askSageById(id) {
  if (!id) return;
  const r = RECURRINGS.find(x => x.id === id);
  if (!r) return;
  const sym = USER.sym || '$';
  // R-P0-8: name interpolation in prompt is server-side concern (Sage may
  // be prompt-injected, but that's the LLM's input-sanitisation job — we
  // can't escape into a free-text prompt). Caller log uses textContent below.
  const prompt = `I'm paying ${sym}${(Number(r.monthlyAmount)||0).toFixed(2)}/month (${sym}${Math.round(Number(r.annualAmount)||0)}/year) for ${r.name} (${CAT_META[r.cat]?.label} category).${r.priceIncreased?` The price has increased by ${sym}${(Number(r.priceDiff)||0).toFixed(2)}/mo recently.`:''} Should I keep it, negotiate, or cancel? Give me a direct recommendation in 3-4 sentences.`;
  showToast(`Asking Sage about ${r.name}…`);
  try {
    const res = await fetch('/api/sage', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({message:prompt, csvMode:true}) });
    const data = await res.json();
    await _pfcAlert(`Sage on ${r.name}:\n\n${data.reply||'No response.'}`);
  } catch(e) { await _pfcAlert('Could not reach Sage. Try again.'); }
}
// Legacy alias for any external caller.
function askSage(arg) {
  if (typeof arg === 'string') return askSageById(arg);
  if (typeof arg === 'number' && RECURRINGS[arg]) return askSageById(RECURRINGS[arg].id);
}

// ── MANUAL ADD ──
function openManualAdd() { document.getElementById('manual-modal').classList.add('open'); }
function closeManual()   { document.getElementById('manual-modal').classList.remove('open'); }

async function saveManual() {
  const name   = document.getElementById('mm-name').value.trim();
  const amount = parseFloat(document.getElementById('mm-amount').value)||0;
  const freq   = document.getElementById('mm-freq').value;
  const cat    = document.getElementById('mm-cat').value;
  // R-P0-9: custom modal replaces alert(). R-P0-8: validation hardened.
  if (!name) { await _pfcAlert('Enter a subscription name.'); return; }
  if (!amount || !Number.isFinite(amount) || amount <= 0) { await _pfcAlert('Enter a positive amount.'); return; }
  if (amount > 999999) { await _pfcAlert('Amount too large (max 999,999).'); return; }
  if (name.length > 80) { await _pfcAlert('Name too long (max 80 characters).'); return; }

  let monthly = amount;
  if (freq==='weekly') monthly = amount * 4.33;
  if (freq==='annual') monthly = amount / 12;

  // R-P0-1: mint stable id on every new entry.
  RECURRINGS.unshift({
    id: _mintId(),
    name, rawDesc:name, cat, icon: CAT_META[cat]?.icon||'📄',
    freq, freqLabel: freq.charAt(0).toUpperCase()+freq.slice(1),
    monthlyAmount: Math.round(monthly*100)/100,
    annualAmount:  Math.round(monthly*12*100)/100,
    occurrences:[], amounts:[amount],
    minAmount:amount, maxAmount:amount,
    lastCharge:'', firstCharge:'',
    priceIncreased:false, priceDiff:0,
  });
  PFCStorage.setJSON('recurrings', RECURRINGS);
  // R-P0-2 fix-followup: saveManual now ALSO re-renders alerts + charts
  // so the metric strip + trend stay in sync with the manual add.
  updateMetrics(); renderAlerts(); renderCharts(); renderCards();
  closeManual();
  showToast(`Added ${name}`);
}

// ── DEMO DATA ──
function loadDemo() {
  RECURRINGS = [
    { name:'Netflix', rawDesc:'NETFLIX.COM', cat:'streaming', icon:'🎬', freq:'monthly', freqLabel:'Monthly', monthlyAmount:15.99, annualAmount:191.88, occurrences:[{date:'2024-01-05',amount:13.99},{date:'2024-02-05',amount:13.99},{date:'2024-03-05',amount:15.99},{date:'2024-04-05',amount:15.99},{date:'2024-05-05',amount:15.99},{date:'2024-06-05',amount:15.99}], amounts:[13.99,13.99,15.99,15.99,15.99,15.99], minAmount:13.99, maxAmount:15.99, lastCharge:'2024-06-05', firstCharge:'2024-01-05', priceIncreased:true, priceDiff:2.00, pricePct:14 },
    { name:'Spotify', rawDesc:'SPOTIFY', cat:'streaming', icon:'🎵', freq:'monthly', freqLabel:'Monthly', monthlyAmount:9.99, annualAmount:119.88, occurrences:[{date:'2024-01-12',amount:9.99},{date:'2024-02-12',amount:9.99},{date:'2024-03-12',amount:9.99},{date:'2024-04-12',amount:9.99},{date:'2024-05-12',amount:9.99},{date:'2024-06-12',amount:9.99}], amounts:[9.99,9.99,9.99,9.99,9.99,9.99], minAmount:9.99, maxAmount:9.99, lastCharge:'2024-06-12', firstCharge:'2024-01-12', priceIncreased:false, priceDiff:0 },
    { name:'Microsoft 365', rawDesc:'MICROSOFT 365', cat:'software', icon:'💻', freq:'monthly', freqLabel:'Monthly', monthlyAmount:8.99, annualAmount:107.88, occurrences:[{date:'2024-01-18',amount:6.99},{date:'2024-02-18',amount:6.99},{date:'2024-03-18',amount:8.99},{date:'2024-04-18',amount:8.99},{date:'2024-05-18',amount:8.99},{date:'2024-06-18',amount:8.99}], amounts:[6.99,6.99,8.99,8.99,8.99,8.99], minAmount:6.99, maxAmount:8.99, lastCharge:'2024-06-18', firstCharge:'2024-01-18', priceIncreased:true, priceDiff:2.00, pricePct:29 },
    { name:'Internet Airtel', rawDesc:'AIRTEL INTERNET', cat:'utilities', icon:'📡', freq:'monthly', freqLabel:'Monthly', monthlyAmount:49.99, annualAmount:599.88, occurrences:[{date:'2024-01-01',amount:49.99},{date:'2024-02-01',amount:49.99},{date:'2024-03-01',amount:49.99},{date:'2024-04-01',amount:49.99},{date:'2024-05-01',amount:49.99},{date:'2024-06-01',amount:49.99}], amounts:[49.99,49.99,49.99,49.99,49.99,49.99], minAmount:49.99, maxAmount:49.99, lastCharge:'2024-06-01', firstCharge:'2024-01-01', priceIncreased:false, priceDiff:0 },
    { name:'Health Insurance', rawDesc:'HEALTH INSURANCE PREMIUM', cat:'insurance', icon:'🛡️', freq:'monthly', freqLabel:'Monthly', monthlyAmount:85.00, annualAmount:1020.00, occurrences:[{date:'2024-01-10',amount:75.00},{date:'2024-02-10',amount:75.00},{date:'2024-03-10',amount:85.00},{date:'2024-04-10',amount:85.00},{date:'2024-05-10',amount:85.00},{date:'2024-06-10',amount:85.00}], amounts:[75,75,85,85,85,85], minAmount:75, maxAmount:85, lastCharge:'2024-06-10', firstCharge:'2024-01-10', priceIncreased:true, priceDiff:10, pricePct:13 },
    { name:'Canal Plus', rawDesc:'CANAL+ ABONNEMENT', cat:'streaming', icon:'📺', freq:'monthly', freqLabel:'Monthly', monthlyAmount:24.99, annualAmount:299.88, occurrences:[{date:'2024-01-20',amount:24.99},{date:'2024-02-20',amount:24.99},{date:'2024-03-20',amount:24.99},{date:'2024-04-20',amount:24.99},{date:'2024-05-20',amount:24.99},{date:'2024-06-20',amount:24.99}], amounts:[24.99,24.99,24.99,24.99,24.99,24.99], minAmount:24.99, maxAmount:24.99, lastCharge:'2024-06-20', firstCharge:'2024-01-20', priceIncreased:false, priceDiff:0 },
    { name:'Loan Repayment', rawDesc:'MCB PERSONAL LOAN', cat:'finance', icon:'🏦', freq:'monthly', freqLabel:'Monthly', monthlyAmount:320.00, annualAmount:3840.00, occurrences:[{date:'2024-01-25',amount:320},{date:'2024-02-25',amount:320},{date:'2024-03-25',amount:320},{date:'2024-04-25',amount:320},{date:'2024-05-25',amount:320},{date:'2024-06-25',amount:320}], amounts:[320,320,320,320,320,320], minAmount:320, maxAmount:320, lastCharge:'2024-06-25', firstCharge:'2024-01-25', priceIncreased:false, priceDiff:0 },
    { name:'Gym Membership', rawDesc:'ANYTIME FITNESS', cat:'health', icon:'💪', freq:'monthly', freqLabel:'Monthly', monthlyAmount:35.00, annualAmount:420.00, occurrences:[{date:'2024-01-03',amount:35},{date:'2024-02-03',amount:35},{date:'2024-03-03',amount:35},{date:'2024-04-03',amount:35},{date:'2024-05-03',amount:35},{date:'2024-06-03',amount:35}], amounts:[35,35,35,35,35,35], minAmount:35, maxAmount:35, lastCharge:'2024-06-03', firstCharge:'2024-01-03', priceIncreased:false, priceDiff:0 },
    { name:'Adobe Creative', rawDesc:'ADOBE CREATIVE CLOUD', cat:'software', icon:'🎨', freq:'monthly', freqLabel:'Monthly', monthlyAmount:59.99, annualAmount:719.88, occurrences:[{date:'2024-01-22',amount:54.99},{date:'2024-02-22',amount:54.99},{date:'2024-03-22',amount:59.99},{date:'2024-04-22',amount:59.99},{date:'2024-05-22',amount:59.99},{date:'2024-06-22',amount:59.99}], amounts:[54.99,54.99,59.99,59.99,59.99,59.99], minAmount:54.99, maxAmount:59.99, lastCharge:'2024-06-22', firstCharge:'2024-01-22', priceIncreased:true, priceDiff:5.00, pricePct:9 },
    { name:'Disney Plus', rawDesc:'DISNEY+', cat:'streaming', icon:'🎬', freq:'monthly', freqLabel:'Monthly', monthlyAmount:7.99, annualAmount:95.88, occurrences:[{date:'2024-01-08',amount:7.99},{date:'2024-02-08',amount:7.99},{date:'2024-03-08',amount:7.99},{date:'2024-04-08',amount:7.99},{date:'2024-05-08',amount:7.99},{date:'2024-06-08',amount:7.99}], amounts:[7.99,7.99,7.99,7.99,7.99,7.99], minAmount:7.99, maxAmount:7.99, lastCharge:'2024-06-08', firstCharge:'2024-01-08', priceIncreased:false, priceDiff:0 },
  ];
  // R-P0-1: stable id on every demo entry so cancellations persist across
  // reload and survive sort-in-place. Without this, loadDemo entries had
  // r.id === undefined and CANCELLED.has(undefined) collisions broke filter.
  RECURRINGS.forEach(r => { r.id = _mintId(); });
  PFCStorage.setJSON('recurrings', RECURRINGS);
  showResults();
  showToast('Demo data loaded — 10 recurring items');
}

// ── UTILS ──
function setState(s) {
  ['upload','processing','results'].forEach(n=>{
    document.getElementById('state-'+n).style.display = n===s ? 'block' : 'none';
  });
}
function setProc(title,sub,pct) {
  document.getElementById('proc-title').textContent=title;
  document.getElementById('proc-sub').textContent=sub;
  document.getElementById('proc-bar').style.width=pct+'%';
}
async function clearAll() {
  // R-P0-9: custom modal replaces native confirm (iOS PWA reliable).
  const ok = await _pfcConfirm('Clear all recurring data and re-upload? This cannot be undone.', 'Clear all');
  if (!ok) return;
  RECURRINGS=[]; CANCELLED=new Set();
  PFCStorage.remove('recurrings');
  // R-P0-1: clear CANCELLED persistence too (was orphaned key after wipe).
  PFCStorage.remove('recurrings_cancelled');
  document.getElementById('btn-add-manual').style.display='none';
  document.getElementById('btn-clear').style.display='none';
  setState('upload');
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function showToast(msg){
  const t=document.createElement('div');
  t.className='toast'; t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';t.style.transition='opacity .3s';},2800);
  setTimeout(()=>t.remove(),3200);
}

document.addEventListener('keydown',e=>{if(e.key==='Escape')closeManual();});
init();

// ── AUTH-AWARE RE-HYDRATION ──
// init() ran synchronously before PFCAuth resolved the real userId — so USER/
// RECURRINGS may reflect pfc:guest:* (often empty). Once auth resolves and pfc-
// storage.js finishes adoptGuestData, re-read from the now-correct namespace.
function _rehydrateFromStorage() {
  try { USER = (typeof PFCUser !== 'undefined') ? PFCUser.get() : (PFCStorage.getJSON('user') || {}); } catch(e) {}
  USER.sym = escHtml(window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$'));
  // R-P0-1: reload CANCELLED from the *new* namespace after auth resolves
  // (pre-fix CANCELLED stayed empty because the guest-namespace read in init()
  // returned nothing; once we flip to pfc:{uid}:* we need to re-read).
  CANCELLED = _loadCancelled();
  try {
    const saved = PFCStorage.get('recurrings');
    if (saved) {
      RECURRINGS = JSON.parse(saved);
      _backfillIds();
      // Don't yank the user out of an in-progress upload flow.
      const processing = document.getElementById('state-processing');
      if (!processing || processing.style.display !== 'block') showResults();
    } else if (RECURRINGS.length) {
      // Storage cleared (e.g. sign-out) — drop back to upload state.
      RECURRINGS = [];
      setState('upload');
      document.getElementById('btn-add-manual').style.display='none';
      document.getElementById('btn-clear').style.display='none';
    } else {
      // Still empty after auth resolve — at least refresh currency in any
      // already-rendered metrics. Cheap no-op when nothing's mounted.
      const resultsState = document.getElementById('state-results');
      if (resultsState && resultsState.style.display === 'block') {
        updateMetrics(); renderCards();
      }
    }
  } catch(e) {}
}
if (typeof PFCAuth !== 'undefined') {
  PFCAuth.onReady(_rehydrateFromStorage);
  PFCAuth.onAuthChange(_rehydrateFromStorage);
}
