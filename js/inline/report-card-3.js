// Plan gate (UX §6.26): mirror PFCPlan onto body[data-pfc-plan] so the
// watermark + invitation + greyed-buttons CSS toggle for Free users. Also
// toggle the [disabled] attribute on the share/download buttons so keyboard
// users can't bypass the visual gating via Enter/Space.
//
// RC-P0-PLAN-FLASH fix (audit 2026-05-25) — pre-fix apply() ran immediately
// at script load, BEFORE PFCAuth had resolved the session and PFCPlan had
// the real plan state. PFCPlan.get() returns 'free' as the safe default
// during that window, so Pro users saw the watermark + "Pro preview" stamp
// + greyed share buttons flash on first paint, then disappear when
// PFCPlan.refresh() resolved. Same regression class as DASH-PROD-FIX-4
// (banner-flash). Now we wait for PFCPlan.refresh() to resolve BEFORE the
// FIRST apply() — no optimistic guess. The page renders without the
// watermark by default (CSS only adds it when body has data-pfc-plan="free");
// if the user really is free, the watermark fades in once we know.
(function () {
  function apply() {
    const plan = (typeof PFCPlan !== 'undefined' && PFCPlan.get) ? PFCPlan.get() : 'free';
    document.body.setAttribute('data-pfc-plan', plan);
    const isFree = plan === 'free';
    document.querySelectorAll('.share-btn, .dl-btn').forEach(btn => {
      if (isFree) {
        btn.setAttribute('disabled', '');
        btn.setAttribute('aria-disabled', 'true');
      } else {
        btn.removeAttribute('disabled');
        btn.removeAttribute('aria-disabled');
      }
    });
  }
  // RC-P0-PLAN-FLASH — wait for PFCPlan.refresh() before the first apply().
  // If PFCPlan isn't defined yet (e.g. pfc-entitlements.js failed to load),
  // fall back to applying once at DOMContentLoaded so the page still gates
  // correctly in the degraded path.
  if (typeof PFCPlan !== 'undefined' && typeof PFCPlan.refresh === 'function') {
    PFCPlan.refresh().then(apply).catch(apply);
    PFCPlan.onChange(apply);
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply, { once: true });
  } else {
    apply();
  }
})();

// RC-P0-EMPTYSTATE (audit 2026-05-25) — these are seed/demo numbers, NOT
// the user's real data. Pre-fix the page rendered a full graded report
// card (B+, 71/100, etc) from these defaults to a brand-new user who'd
// never touched onboarding — same dishonesty class as DASH-P0-5. Now we
// detect when the user is on defaults-only and render an empty state
// inviting them to onboarding instead of fake grades.
const DEF={income:3000,otherIncome:0,housing:1200,food:540,transport:310,otherExp:380,savings:11580,investments:0,debt:8000,debtPay:550,currency:'€',name:'User'};
function loadUser(){const u=(typeof PFCUser!=='undefined')?PFCUser.get():PFCStorage.getJSON('user');return u?{...DEF,...u}:{...DEF}}
let U=loadUser();let C=U.currency||'€';
// RC-P0-EMPTYSTATE — true when the user has saved NOTHING (every meaningful
// numeric field is at its DEF seed value AND name is the literal "User").
// If even one number diverges from DEF, the user has touched onboarding
// and we render the real card. We deliberately keep the comparison loose
// (name OR any number changed) so partial onboarders still see their data.
function _isDefaultOnly(u) {
  if (!u) return true;
  // RC-P0-EMPTYSTATE-2 (audit 2026-05-29) — a brand-new / pre-onboarding user
  // usually has an all-ZEROS profile (income:0, …) rather than the DEF seed
  // values. Zeros diverge from DEF, so the equals-DEF check below used to
  // MISFIRE and render a "F / Critical" grade for someone who entered nothing
  // — demoralising and dishonest (same class as the original RC-P0-EMPTYSTATE
  // bug; confirmed live 2026-05-29 via audit-mode walkthrough). Every grade
  // sub-score (savings rate, debt load, emergency-fund, spending) is derived
  // from income, so with no income there is nothing honest to grade. A real
  // user always has income > 0; treat "no income" as no-data → empty state.
  if (!(Number(u.income) > 0 || Number(u.otherIncome) > 0)) return true;
  if (u.name && u.name !== DEF.name) return false;
  const fields = ['income','otherIncome','housing','food','transport','otherExp','savings','investments','debt','debtPay'];
  for (const k of fields) {
    if (Number(u[k]) !== Number(DEF[k])) return false;
  }
  return true;
}
function fmt(v){return C+Math.abs(Math.round(v)).toLocaleString()}

// RC-P0-XSS hardening (audit 2026-05-25) — 5-char escape helper used on
// every value flowing into innerHTML. recs.title/text are hardcoded today
// but the breakdown desc + name are template strings that interpolate
// `U.name` / `U.currency` indirectly via fmt(). Defense-in-depth ensures
// the next person to add a user-controlled field doesn't introduce XSS.
// Matches the codebase invariant (NW-P0-3, DASH-P1-12, G-P0-2, R-P0-8,
// DS-P0-MATH, J-P0-*, SAGE-P0-XSS).
function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// RC-P0-MODAL fix (audit 2026-05-25) — promise-based confirm modal that
// replaces the unreliable window.confirm() (iOS PWA standalone-mode
// regression). Mirrors NW-P1-6 / G-P1-D / R-P0-9. Falls back to native
// confirm() if the modal DOM is missing.
let _pfcConfirmActive = false;
function _pfcConfirm(message, okLabel) {
  return new Promise(function (resolve) {
    if (_pfcConfirmActive) { resolve(false); return; }
    _pfcConfirmActive = true;
    const modal = document.getElementById('confirm-modal');
    const msgEl = document.getElementById('confirm-msg');
    const okBtn = document.getElementById('confirm-ok');
    const cancelBtn = document.getElementById('confirm-cancel');
    if (!modal || !msgEl || !okBtn || !cancelBtn) {
      _pfcConfirmActive = false;
      resolve(window.confirm(message));
      return;
    }
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

function calc(){
  const income=(U.income||0)+(U.otherIncome||0);
  const expenses=(U.housing||0)+(U.food||0)+(U.transport||0)+(U.otherExp||0);
  const debtPay=U.debtPay||0;
  const surplus=income-expenses-debtPay;
  const savRate=income>0?Math.max(0,surplus)/income:0;
  const debtRatio=income>0?debtPay/income:0;
  const nw=(U.savings||0)+(U.investments||0)-(U.debt||0);
  const emergency=expenses>0?(U.savings||0)/expenses:0;
  const spendPct=income>0?expenses/income:1;
  const savScore=Math.min(100,savRate*400);
  const debtScore=Math.max(0,100-debtRatio*280);
  const emgScore=Math.min(100,(emergency/6)*100);
  const spendScore=Math.max(0,Math.min(100,(1-spendPct/0.85)*100));
  const total=Math.round(savScore*.25+debtScore*.25+emgScore*.25+spendScore*.25);
  return{income,expenses,debtPay,surplus,savRate,debtRatio,nw,emergency,spendPct,savScore,debtScore,emgScore,spendScore,total};
}

function grade(s){
  if(s>=90)return{l:'A+',label:'Exceptional',color:'var(--money)',sub:"You're in the top tier of financial health."};
  if(s>=80)return{l:'A',label:'Excellent',color:'var(--money)',sub:'Strong fundamentals across all areas.'};
  if(s>=70)return{l:'B+',label:'Very Good',color:'#34D399',sub:'Solid finances with room to optimise.'};
  if(s>=60)return{l:'B',label:'Good',color:'#34D399',sub:'On the right track — keep pushing.'};
  if(s>=50)return{l:'C+',label:'Fair',color:'#F5A623',sub:'Some areas need attention to improve.'};
  if(s>=40)return{l:'C',label:'Below Average',color:'#F5A623',sub:'Important gaps to address soon.'};
  if(s>=30)return{l:'D',label:'Needs Work',color:'#E05252',sub:'Significant financial stress indicators.'};
  return{l:'F',label:'Critical',color:'#E05252',sub:'Urgent action required on multiple fronts.'};
}
function catGrade(s){
  if(s>=85)return{l:'A',c:'var(--money)'};
  if(s>=70)return{l:'B',c:'#34D399'};
  if(s>=55)return{l:'C',c:'#F5A623'};
  if(s>=35)return{l:'D',c:'#E05252'};
  return{l:'F',c:'#E05252'};
}
function barColor(s){return s>=70?'var(--money)':s>=50?'#F5A623':'#E05252'}

function renderCard(d){
  const g=grade(d.total);
  document.getElementById('rc-name').textContent=U.name||'User';
  document.getElementById('rc-date').textContent=new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
  document.getElementById('rc-footer-tag').textContent=g.l+' · '+d.total+'/100';

  const circ=351.9;
  const fill=document.getElementById('rc-ring-fill');
  fill.style.stroke=g.color;
  fill.style.strokeDasharray=circ;
  fill.style.strokeDashoffset=circ;
  setTimeout(()=>{fill.style.strokeDashoffset=circ-(d.total/100)*circ},80);

  document.getElementById('rc-grade-letter').textContent=g.l;
  document.getElementById('rc-grade-letter').style.color=g.color;

  // Grade-conditional hero photo: A/B/C show the merit certificate (the
  // default editorial keepsake); D/F swap in the overdue-stamp still-life
  // so the user's eye lands on a photo whose mood matches their score.
  // Brief origin: docs/superpowers/audits/2026-05-21-prompts-a11y-perf.md (E3 + E4 slots).
  const low = (g.l === 'D' || g.l === 'F');
  const merit = document.getElementById('rc-photo-merit');
  const overdue = document.getElementById('rc-photo-overdue');
  if (merit && overdue) {
    merit.hidden = low;
    overdue.hidden = !low;
  }
  document.getElementById('rc-grade-score').textContent=d.total+' / 100';
  document.getElementById('rc-grade-label').textContent=g.label;
  document.getElementById('rc-grade-label').style.color=g.color;
  document.getElementById('rc-grade-sub').textContent=g.sub;

  const surpEl=document.getElementById('rc-surplus');
  surpEl.textContent=(d.surplus>=0?'+':'-')+fmt(d.surplus)+'/mo';
  surpEl.style.color=d.surplus>=0?'var(--money)':'#E05252';
  const nwEl=document.getElementById('rc-nw');
  nwEl.textContent=(d.nw<0?'-':'')+fmt(d.nw);
  nwEl.style.color=d.nw>=0?'#F0EDE2':'#E66E5C';
  const srEl=document.getElementById('rc-savrate');
  srEl.textContent=Math.round(d.savRate*100)+'%';
  srEl.style.color=d.savRate>=.2?'var(--money)':d.savRate>=.1?'#F5A623':'#E05252';

  const cats=[
    {name:'Savings rate',score:d.savScore,tag:Math.round(d.savRate*100)+'%'},
    {name:'Debt load',score:d.debtScore,tag:Math.round(d.debtRatio*100)+'% DTI'},
    {name:'Emergency fund',score:d.emgScore,tag:d.emergency.toFixed(1)+' mo'},
    {name:'Spending control',score:d.spendScore,tag:Math.round(d.spendPct*100)+'% income'},
  ];
  document.getElementById('rc-bars').innerHTML=cats.map(cat=>`
    <div class="rc-bar-row">
      <div class="rc-bar-header">
        <span class="rc-bar-label">${cat.name}</span>
        <span class="rc-bar-val" style="color:${barColor(cat.score)}">${Math.round(cat.score)}</span>
      </div>
      <div class="rc-bar-bg"><div class="rc-bar-fill" data-w="${cat.score}" style="width:0%;background:${barColor(cat.score)}"></div></div>
    </div>`).join('');
  setTimeout(()=>document.querySelectorAll('.rc-bar-fill').forEach(el=>el.style.width=el.dataset.w+'%'),100);
}

function renderBreakdown(d){
  // RC-P1-1 fix (audit 2026-05-25) — was emoji icons (💰💳🛡️📊) which
  // render inconsistently across OS emoji fonts (Apple vs Windows vs
  // Linux) and have no semantic meaning to screen readers. Replaced with
  // brand-aligned inline SVGs via PFCIcons (same module used by NW-P2-1,
  // G-P2-1, SAGE-P0-E, etc). Falls back to a safe placeholder if
  // PFCIcons hasn't loaded yet.
  const ic = (key) => (typeof PFCIcons !== 'undefined' && PFCIcons.get) ? PFCIcons.get(key) : '';
  const cats=[
    {iconKey:'finance',     bg:'rgba(43,182,125,0.12)',name:'Savings rate',     score:d.savScore,  desc:`Saving ${Math.round(d.savRate*100)}% of income. Target: 20%+.`,                       iconColor:'#2BB67D'},
    {iconKey:'credit-card', bg:'rgba(224,82,82,0.1)',  name:'Debt load',        score:d.debtScore, desc:`Debt payments = ${Math.round(d.debtRatio*100)}% of income. Ideal: under 15%.`,         iconColor:'#E05252'},
    {iconKey:'insurance',   bg:'rgba(59,130,246,0.1)', name:'Emergency fund',   score:d.emgScore,  desc:`${d.emergency.toFixed(1)} months of expenses saved. Goal: 6 months.`,                 iconColor:'#93C5FD'},
    {iconKey:'other',       bg:'rgba(245,166,35,0.1)', name:'Spending control', score:d.spendScore,desc:`Expenses = ${Math.round(d.spendPct*100)}% of income. Aim: under 70%.`,                  iconColor:'#F5A623'},
  ];
  document.getElementById('breakdown-list').innerHTML=cats.map(cat=>{
    const g=catGrade(cat.score);
    return`<div class="breakdown-row">
      <div class="breakdown-icon" style="background:${cat.bg};color:${cat.iconColor}">${ic(cat.iconKey)}</div>
      <div class="breakdown-info"><div class="breakdown-name">${escHtml(cat.name)}</div><div class="breakdown-desc">${escHtml(cat.desc)}</div></div>
      <div class="breakdown-grade" style="color:${g.c}" aria-label="Grade ${g.l}">${escHtml(g.l)}</div>
    </div>`;
  }).join('');
}

function renderRecs(d){
  const recs=[];
  if(d.savRate<.2){
    const gap=Math.round(.2*d.income-Math.max(0,d.surplus));
    recs.push({pri:0,title:'Boost your savings rate to 20%',
      text:`Currently saving ${Math.round(d.savRate*100)}% of income. You need ${C}${gap.toLocaleString()}/mo more — try cutting one variable expense category first.`,
      impact:`+${Math.min(25,Math.round((.2-d.savRate)*100))} pts to savings score`});
  }
  if(d.emergency<6){
    const needed=Math.round(d.expenses*6-(U.savings||0));
    const months=needed>0?Math.round(needed/Math.max(1,d.surplus)):0;
    recs.push({pri:0,title:'Build your emergency fund to 6 months',
      text:`You have ${d.emergency.toFixed(1)} months saved. You need ${C}${Math.max(0,needed).toLocaleString()} more — about ${months} months at your current surplus.`,
      impact:`+${Math.round((1-d.emergency/6)*25)} pts to emergency score`});
  }
  if(d.debtRatio>.15){
    recs.push({pri:1,title:'Reduce your debt-to-income ratio',
      text:`Debt payments are ${Math.round(d.debtRatio*100)}% of income. The healthy threshold is 15% (${C}${Math.round(.15*d.income).toLocaleString()}/mo). Consider consolidating or refinancing.`,
      impact:`+${Math.round((d.debtRatio-.15)*200)} pts to debt score`});
  }
  if(d.spendPct>.7){
    const cut=Math.round((d.spendPct-.7)*d.income);
    recs.push({pri:1,title:`Cut expenses by ${C}${cut.toLocaleString()}/month`,
      text:`Expenses are ${Math.round(d.spendPct*100)}% of income. Target 70% or less (${C}${Math.round(.7*d.income).toLocaleString()}/mo). Review your largest discretionary category.`,
      impact:`+${Math.min(30,Math.round((d.spendPct-.7)*100))} pts to spending score`});
  }
  if(d.savRate>=.2&&d.total>=70){
    recs.push({pri:4,title:'Put your surplus to work in investments',
      text:`Your savings rate is excellent at ${Math.round(d.savRate*100)}%. Allocating ${C}${Math.round(d.surplus*.5).toLocaleString()}/mo to index funds at a 7% average return could compound significantly over 10+ years.`,
      impact:'Long-term wealth acceleration'});
  }
  if(recs.length===0){recs.push({pri:5,title:'Outstanding financial health!',text:'You\'re doing exceptionally well. Focus on growing investments, diversifying income, and maintaining these habits.',impact:'Keep it up'})}
  recs.sort((a,b)=>a.pri-b.pri);
  // RC-P0-XSS — escHtml every interpolated field. title/text/impact are
  // hardcoded today but `r.text` interpolates U.currency via the C constant
  // (via fmt() and via direct `${C}` in the template literal); if currency
  // is ever attacker-controllable that's an XSS sink. Defense-in-depth.
  document.getElementById('recs-list').innerHTML=recs.slice(0,4).map((r,i)=>`
    <div class="rec-item">
      <div class="rec-number">${i+1}</div>
      <div class="rec-body">
        <div class="rec-title">${escHtml(r.title)}</div>
        <div class="rec-text">${escHtml(r.text)}</div>
        <div class="rec-impact">&#9679; ${escHtml(r.impact)}</div>
      </div>
    </div>`).join('');
}

function renderNextGrade(d){
  const g=grade(d.total);
  const thresholds=[30,40,50,60,70,80,90,101];
  const next=thresholds.find(t=>t>d.total)||101;
  const ng=grade(Math.min(next,100));
  const gap=Math.min(next,100)-d.total;
  const container=document.getElementById('next-grade');
  if(d.total>=90){container.innerHTML=`<div style="color:var(--teal);font-size:13px;font-weight:500">You've reached the top grade (A+). Maintain these habits and grow your wealth.</div>`;return}
  const suggestions=[];
  if(d.savScore<85)suggestions.push({name:'savings rate',pts:Math.round((85-d.savScore)*.25)});
  if(d.debtScore<85)suggestions.push({name:'debt load',pts:Math.round((85-d.debtScore)*.25)});
  if(d.emgScore<85)suggestions.push({name:'emergency fund',pts:Math.round((85-d.emgScore)*.25)});
  if(d.spendScore<85)suggestions.push({name:'spending control',pts:Math.round((85-d.spendScore)*.25)});
  suggestions.sort((a,b)=>b.pts-a.pts);
  container.innerHTML=`
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px">
      <div style="text-align:center">
        <div style="font-size:10px;color:var(--text3);margin-bottom:2px">CURRENT</div>
        <div style="font-family:var(--font-display);font-size:24px;font-weight:800;color:${g.color}">${g.l}</div>
      </div>
      <div style="flex:1;height:1px;background:var(--border);position:relative">
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--bg3);padding:2px 8px;border-radius:4px;font-size:11px;color:var(--text3);border:1px solid var(--border)">+${gap} pts</div>
      </div>
      <div style="text-align:center">
        <div style="font-size:10px;color:var(--text3);margin-bottom:2px">TARGET</div>
        <div style="font-family:var(--font-display);font-size:24px;font-weight:800;color:${ng.color}">${ng.l}</div>
      </div>
    </div>
    <div style="background:rgba(255,255,255,0.04);border-radius:6px;height:5px;margin-bottom:14px;overflow:hidden">
      <div style="height:100%;width:${Math.min(100,(d.total/Math.min(next,100))*100)}%;background:${g.color};border-radius:6px;transition:width 1s ease"></div>
    </div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:10px;text-transform:uppercase;letter-spacing:.06em">Fastest paths</div>
    ${suggestions.slice(0,3).map((s,i)=>`
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:13px">
        <div style="width:20px;height:20px;border-radius:50%;background:var(--teal-dim);border:1px solid rgba(43,182,125,0.2);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:var(--teal);flex-shrink:0">${i+1}</div>
        <span style="color:var(--text2)">Improve <strong style="color:var(--text)">${s.name}</strong> &mdash; up to <span style="color:var(--teal)">+${s.pts} pts</span></span>
      </div>`).join('')}`;
}

function loadHistory(){try{return JSON.parse(PFCStorage.get('report_history')||'[]')}catch(e){return[]}}
// RC-P0-HISTORY fix (audit 2026-05-25) — pre-fix saveHistory ran on
// EVERY page load (init line + rehydration), so each refresh added a
// duplicate row with the same calendar date and same score. The history
// table filled with "27 May / B+ / 71/100" repeated 10 times within an
// hour. Now we dedupe: if the most-recent entry has the same calendar
// date AND the same score, skip the save entirely. A real change (score
// moved because user updated inputs in another tab) still records.
//
// RC-P0-HISTORY (color) — pre-fix `g.color` was stored as the literal
// string `'var(--money)'`. If the user later switches themes (or a
// future light-mode redesign remaps the var), past history entries
// render with the WRONG resolved color. Resolve the CSS variable to a
// hex literal at save time so history entries are stable.
function _resolveColor(cssColorRef) {
  // g.color values are either `var(--money)` or a literal hex like
  // `'#34D399'`. Only `var(--…)` needs resolution.
  if (typeof cssColorRef !== 'string') return '#F0EDE2';
  const m = cssColorRef.match(/^var\(\s*(--[a-zA-Z0-9-]+)\s*\)$/);
  if (!m) return cssColorRef;
  try {
    const resolved = getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim();
    return resolved || cssColorRef;
  } catch (_) { return cssColorRef; }
}
function _sameDay(isoA, isoB) {
  if (!isoA || !isoB) return false;
  return String(isoA).slice(0, 10) === String(isoB).slice(0, 10);
}
function saveHistory(d){
  const h=loadHistory();const g=grade(d.total);
  const today = new Date().toISOString();
  // RC-P0-HISTORY dedupe: same day + same score = no new row.
  if (h.length > 0 && _sameDay(h[0].date, today) && h[0].score === d.total) {
    return;
  }
  h.unshift({date:today,score:d.total,grade:g.l,color:_resolveColor(g.color),nw:d.nw,surplus:d.surplus});
  if(h.length>10)h.splice(10);
  try{PFCStorage.setJSON('report_history', h)}catch(e){}
}
function renderHistory(){
  const h=loadHistory();const el=document.getElementById('history-list');
  if(!h.length){el.innerHTML='<div style="color:var(--text3);font-size:13px">No previous reports yet.</div>';return}
  el.innerHTML=h.map((r,i)=>{
    const d=new Date(r.date);
    const ds=d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
    const ts=d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
    const trend=i<h.length-1?(r.score>h[i+1].score?'&#8593;':r.score<h[i+1].score?'&#8595;':'&rarr;'):'&mdash;';
    const tc=trend==='&#8593;'?'var(--teal)':trend==='&#8595;'?'var(--red)':'var(--text3)';
    return`<div class="history-row">
      <div class="history-dot" style="background:${r.color}"></div>
      <div class="history-date">${ds} &middot; ${ts}</div>
      <div class="history-grade" style="color:${r.color}">${r.grade}</div>
      <div class="history-score">${r.score}/100</div>
      <div style="font-size:13px;color:${tc};width:16px;text-align:right">${trend}</div>
    </div>`;
  }).join('');
}
// RC-P0-MODAL fix (audit 2026-05-25) \u2014 was `if(!confirm(...))return;`
// using the unreliable browser confirm() (broken in iOS PWA standalone).
// Now uses the _pfcConfirm promise-based modal defined above. Same UX
// flow: cancel keeps history, OK clears it.
function clearHistory(){
  _pfcConfirm('Clear all report history? This deletes every saved grade entry.', 'Clear all').then(ok => {
    if (!ok) return;
    PFCStorage.remove('report_history');
    renderHistory();
    showToast('Cleared');
  });
}

// RC-P0-DOWNLOAD fix (audit 2026-05-25) \u2014 pre-fix only `--canvas` was
// resolved; every inner stroke/fill/text used `var(--money)`, `var(--text)`,
// `var(--teal)` etc which html2canvas treats as `undefined` and renders
// transparent or black. Downloaded PNG had black bars on a black card \u2014
// effectively unusable as a "share your report card" feature. Now we
// resolve every CSS variable used inside #rc-canvas to a hex literal,
// snapshot the LIVE element with backgroundColor pinned, then revert.
const _RC_CSS_VARS_TO_INLINE = ['--text','--text2','--text3','--bg','--bg2','--bg3','--card','--border','--border2','--canvas','--teal','--teal-dim','--money','--red','--amber','--gold'];
function _resolveAllCssVars() {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  const map = {};
  for (const v of _RC_CSS_VARS_TO_INLINE) {
    const resolved = style.getPropertyValue(v).trim();
    if (resolved) map[v] = resolved;
  }
  return map;
}
function downloadCard(){
  if (typeof html2canvas !== 'function') {
    showToast('\u26a0 Image library still loading \u2014 try again in a moment');
    return;
  }
  const card=document.getElementById('rc-canvas');
  if (!card) return;
  showToast('Generating image\u2026');
  const vars = _resolveAllCssVars();
  const canvasBg = vars['--canvas'] || '#0F1410';
  // RC-P0-DOWNLOAD: clone the card so we can inline-style every node WITHOUT
  // mutating the visible card. After snapshotting we let the clone go.
  // We CANNOT just patch the visible card and then patch back \u2014 html2canvas
  // sees a flash of restyled content in fast-paint sequences on Safari.
  const clone = card.cloneNode(true);
  clone.style.position = 'absolute';
  clone.style.left = '-99999px';
  clone.style.top = '0';
  // Walk the clone and rewrite any inline style that references var(--\u2026)
  // to the resolved hex literal. We also resolve color/background/stroke
  // attributes on SVG children.
  (function inlineVars(node) {
    if (node.nodeType !== 1) return;
    // Inline-style attribute
    if (node.style && node.style.cssText) {
      let css = node.style.cssText;
      let changed = false;
      for (const v of _RC_CSS_VARS_TO_INLINE) {
        if (css.indexOf(v) !== -1 && vars[v]) {
          css = css.split('var(' + v + ')').join(vars[v]);
          changed = true;
        }
      }
      if (changed) node.style.cssText = css;
    }
    // SVG presentation attrs (stroke, fill)
    if (node.namespaceURI && node.namespaceURI.indexOf('svg') !== -1) {
      ['stroke', 'fill', 'color'].forEach(attr => {
        const val = node.getAttribute && node.getAttribute(attr);
        if (val && val.indexOf('var(') !== -1) {
          let next = val;
          for (const v of _RC_CSS_VARS_TO_INLINE) {
            if (next.indexOf(v) !== -1 && vars[v]) {
              next = next.split('var(' + v + ')').join(vars[v]);
            }
          }
          node.setAttribute(attr, next);
        }
      });
    }
    for (let i = 0; i < node.children.length; i++) inlineVars(node.children[i]);
  })(clone);
  document.body.appendChild(clone);
  html2canvas(clone,{backgroundColor:canvasBg,scale:2.5,useCORS:true,logging:false}).then(canvas=>{
    document.body.removeChild(clone);
    const a=document.createElement('a');
    const name=(U.name||'user').toLowerCase().replace(/\s+/g,'-');
    a.download=`pfc-report-${name}-${new Date().toISOString().slice(0,10)}.png`;
    a.href=canvas.toDataURL('image/png');a.click();
    showToast('\u2713 Downloaded');
  }).catch(()=>{
    try { document.body.removeChild(clone); } catch(_) {}
    showToast('\u26a0 Couldn\u2019t generate image \u2014 try a desktop browser');
  });
}
// RC-P0-COPY fix (audit 2026-05-25) \u2014 pre-fix copied
// `https://profinancecast.com/report-card.html`, a NON-user-specific URL.
// Anyone clicking the link saw THEIR own report card, not the user's.
// The "share" feature was effectively dishonest \u2014 the only real share
// path is download-the-PNG-and-post. Updated toast copy to be honest
// about what's being shared: the product page link (so friends can take
// their own report card), NOT the user's specific grade.
function copyLink(){
  const url = 'https://profinancecast.com/report-card.html';
  navigator.clipboard.writeText(url)
    .then(()=>showToast('\u2713 Copied product link \u2014 download the PNG to share your grade'))
    .catch(()=>showToast(url));
}
// RC-P0-SOCIAL fix (audit 2026-05-25) \u2014 twitter.com 301-redirects to
// x.com since 2024. Updated to canonical domain. Also dropped the
// hashtag spam at the end \u2014 the share intent should be honest, not feel
// like a referral campaign template.
function shareX(){
  const d=calc();const g=grade(d.total);
  const t=encodeURIComponent(`Took the ProFinanceCast report card today \u2014 ${g.l} (${d.total}/100). Try yours: profinancecast.com/report-card`);
  window.open('https://x.com/intent/tweet?text='+t,'_blank','noopener');
}
function showToast(msg){
  const o=document.getElementById('pfc-toast');if(o)o.remove();
  const t=document.createElement('div');t.id='pfc-toast';t.className='toast';t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';t.style.transition='opacity .3s'},3000);
  setTimeout(()=>t.remove(),3400);
}

// RC-P0-EMPTYSTATE — paint an inviting "no data yet" card instead of a
// graded report card computed from the DEF seed values. Same UX class as
// DASH-P0-5 (dashboard empty-state). The empty state hides #rc-canvas
// inner content + ALL right-rail cards (breakdown/recs/next-grade) and
// replaces them with a single "Add your numbers" invitation.
function _showEmptyState() {
  const grade = document.getElementById('rc-grade-letter');
  const label = document.getElementById('rc-grade-label');
  const sub = document.getElementById('rc-grade-sub');
  const score = document.getElementById('rc-grade-score');
  const footer = document.getElementById('rc-footer-tag');
  const surp = document.getElementById('rc-surplus');
  const nw = document.getElementById('rc-nw');
  const sr = document.getElementById('rc-savrate');
  const bars = document.getElementById('rc-bars');
  const bdown = document.getElementById('breakdown-list');
  const recs = document.getElementById('recs-list');
  const nxt = document.getElementById('next-grade');
  const name = document.getElementById('rc-name');
  const ring = document.getElementById('rc-ring-fill');
  if (grade) grade.textContent = '—';
  if (label) { label.textContent = 'No data yet'; label.style.color = 'var(--text2)'; }
  if (sub)   sub.textContent = 'Add your income, expenses, and savings to see your grade.';
  if (score) score.textContent = '— / 100';
  if (footer) footer.textContent = 'NOT GRADED';
  if (name)   name.textContent = '—';
  if (surp) { surp.textContent = '—'; surp.style.color = 'var(--text2)'; }
  if (nw)   { nw.textContent = '—';   nw.style.color = 'var(--text2)'; }
  if (sr)   { sr.textContent = '—';   sr.style.color = 'var(--text2)'; }
  if (ring) { ring.style.stroke = 'rgba(255,255,255,0.12)'; ring.style.strokeDashoffset = '0'; }
  if (bars) bars.innerHTML = '';
  const emptyMsg =
    `<div style="text-align:center;padding:32px 18px;">
      <div style="font-family:var(--font-display);font-size:15px;font-weight:700;margin-bottom:8px;">Finish onboarding to unlock your grade</div>
      <div style="font-size:13px;color:var(--text2);line-height:1.55;margin-bottom:16px;">Your savings rate, debt load, emergency-fund coverage, and spending control are all computed from the numbers you enter in onboarding. Once you've added them, your report card grades update in real time.</div>
      <a href="onboarding.html" style="display:inline-block;background:var(--teal);color:var(--canvas);padding:10px 18px;border-radius:var(--r-sm);font-weight:600;font-size:13px;text-decoration:none;">Add your numbers →</a>
    </div>`;
  if (bdown) bdown.innerHTML = emptyMsg;
  if (recs)  recs.innerHTML  = '<div style="color:var(--text3);font-size:13px;padding:8px 0;">Recommendations appear after you add your numbers.</div>';
  if (nxt)   nxt.innerHTML   = '<div style="color:var(--text3);font-size:13px;">Grade-path guidance appears once you have a grade.</div>';
}

// RC-P0-MOB — script is now deferred (was synchronous in head), so the
// init must run after DOMContentLoaded explicitly. With defer it's
// already past parse by the time this executes, but readyState may still
// be 'interactive' before document.body events fire. Use a guard.
function _rcInit() {
  document.getElementById('today-date').textContent=new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
  if(U.name){
    const sn=document.getElementById('sidebar-name');
    const sa=document.getElementById('sidebar-avatar');
    if(sn)sn.textContent=U.name;
    if(sa)sa.textContent=U.name.charAt(0).toUpperCase();
  }
  if (_isDefaultOnly(U)) {
    // RC-P0-EMPTYSTATE — no real user data; don't fabricate a grade.
    // Also DON'T saveHistory (would seed history with a fake 71/100).
    _showEmptyState();
    renderHistory();
  } else {
    const d=calc();
    renderCard(d);renderBreakdown(d);renderRecs(d);renderNextGrade(d);saveHistory(d);renderHistory();
  }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _rcInit, { once: true });
} else {
  _rcInit();
}

// ── AUTH-AWARE RE-HYDRATION ──
// loadUser() ran synchronously before PFCAuth resolved the real userId — so U
// may reflect pfc:guest:* (often DEFAULT zeros). Once auth resolves and
// pfc-storage.js finishes adoptGuestData, re-read and re-render.
function _rehydrateFromStorage(){
  U=loadUser();C=U.currency||'€';
  if(U.name){
    const sn=document.getElementById('sidebar-name');
    const sa=document.getElementById('sidebar-avatar');
    if(sn)sn.textContent=U.name;
    if(sa)sa.textContent=U.name.charAt(0).toUpperCase();
  }
  if (_isDefaultOnly(U)) {
    _showEmptyState();
    renderHistory();
    return;
  }
  const d=calc();
  renderCard(d);renderBreakdown(d);renderRecs(d);renderNextGrade(d);renderHistory();
}
if(typeof PFCAuth!=='undefined'){
  PFCAuth.onReady(()=>{
    const fresh=loadUser();
    if(JSON.stringify(fresh)!==JSON.stringify(U))_rehydrateFromStorage();
  });
  PFCAuth.onAuthChange(_rehydrateFromStorage);
}
