// Plan gate (UX §6.26): mirror PFCPlan onto body[data-pfc-plan] so the
// watermark + invitation + greyed-buttons CSS toggle for Free users. Also
// toggle the [disabled] attribute on the share/download buttons so keyboard
// users can't bypass the visual gating via Enter/Space.
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
  apply();
  if (typeof PFCPlan !== 'undefined') {
    PFCPlan.onChange(apply);
    PFCPlan.refresh().then(apply);
  }
})();

const DEF={income:3000,otherIncome:0,housing:1200,food:540,transport:310,otherExp:380,savings:11580,investments:0,debt:8000,debtPay:550,currency:'$',name:'User'};
function loadUser(){const u=(typeof PFCUser!=='undefined')?PFCUser.get():PFCStorage.getJSON('user');return u?{...DEF,...u}:{...DEF}}
let U=loadUser();let C=U.currency||'$';
function fmt(v){return C+Math.abs(Math.round(v)).toLocaleString()}

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
  const cats=[
    {icon:'💰',bg:'rgba(43,182,125,0.12)',name:'Savings rate',score:d.savScore,desc:`Saving ${Math.round(d.savRate*100)}% of income. Target: 20%+.`},
    {icon:'💳',bg:'rgba(224,82,82,0.1)',name:'Debt load',score:d.debtScore,desc:`Debt payments = ${Math.round(d.debtRatio*100)}% of income. Ideal: under 15%.`},
    {icon:'🛡️',bg:'rgba(59,130,246,0.1)',name:'Emergency fund',score:d.emgScore,desc:`${d.emergency.toFixed(1)} months of expenses saved. Goal: 6 months.`},
    {icon:'📊',bg:'rgba(245,166,35,0.1)',name:'Spending control',score:d.spendScore,desc:`Expenses = ${Math.round(d.spendPct*100)}% of income. Aim: under 70%.`},
  ];
  document.getElementById('breakdown-list').innerHTML=cats.map(cat=>{
    const g=catGrade(cat.score);
    return`<div class="breakdown-row">
      <div class="breakdown-icon" style="background:${cat.bg}">${cat.icon}</div>
      <div class="breakdown-info"><div class="breakdown-name">${cat.name}</div><div class="breakdown-desc">${cat.desc}</div></div>
      <div class="breakdown-grade" style="color:${g.c}">${g.l}</div>
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
  document.getElementById('recs-list').innerHTML=recs.slice(0,4).map((r,i)=>`
    <div class="rec-item">
      <div class="rec-number">${i+1}</div>
      <div class="rec-body">
        <div class="rec-title">${r.title}</div>
        <div class="rec-text">${r.text}</div>
        <div class="rec-impact">&#9679; ${r.impact}</div>
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
function saveHistory(d){
  const h=loadHistory();const g=grade(d.total);
  h.unshift({date:new Date().toISOString(),score:d.total,grade:g.l,color:g.color,nw:d.nw,surplus:d.surplus});
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
function clearHistory(){if(!confirm('Clear all report history?'))return;PFCStorage.remove('report_history');renderHistory()}

function downloadCard(){
  const card=document.getElementById('rc-canvas');
  showToast('Generating image\u2026');
  // html2canvas does NOT resolve CSS vars \u2014 must pass a literal color.
  const canvasBg = getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim() || '#0F1410';
  html2canvas(card,{backgroundColor:canvasBg,scale:2.5,useCORS:true,logging:false}).then(canvas=>{
    const a=document.createElement('a');
    const name=(U.name||'user').toLowerCase().replace(/\s+/g,'-');
    a.download=`pfc-report-${name}-${new Date().toISOString().slice(0,10)}.png`;
    a.href=canvas.toDataURL('image/png');a.click();
    showToast('\u2713 Downloaded successfully!');
  }).catch(()=>showToast('\u26a0 Try right-clicking the card and saving as image'));
}
function copyLink(){
  navigator.clipboard.writeText('https://profinancecast.com/report-card.html')
    .then(()=>showToast('\u2713 Link copied!'))
    .catch(()=>showToast('profinancecast.com/report-card.html'));
}
function shareX(){
  const d=calc();const g=grade(d.total);
  const t=encodeURIComponent(`Just got a ${g.l} (${d.total}/100) on my Financial Report Card at ProFinanceCast! \uD83D\uDCCA\n\nCheck yours free at profinancecast.com #PersonalFinance #MoneyGoals`);
  window.open('https://twitter.com/intent/tweet?text='+t,'_blank');
}
function showToast(msg){
  const o=document.getElementById('pfc-toast');if(o)o.remove();
  const t=document.createElement('div');t.id='pfc-toast';t.className='toast';t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';t.style.transition='opacity .3s'},3000);
  setTimeout(()=>t.remove(),3400);
}

// INIT
document.getElementById('today-date').textContent=new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
if(U.name){document.getElementById('sidebar-name').textContent=U.name;document.getElementById('sidebar-avatar').textContent=U.name.charAt(0).toUpperCase()}
let d=calc();
renderCard(d);renderBreakdown(d);renderRecs(d);renderNextGrade(d);saveHistory(d);renderHistory();

// ── AUTH-AWARE RE-HYDRATION ──
// loadUser() ran synchronously before PFCAuth resolved the real userId — so U
// may reflect pfc:guest:* (often DEFAULT zeros). Once auth resolves and
// pfc-storage.js finishes adoptGuestData, re-read and re-render.
function _rehydrateFromStorage(){
  U=loadUser();C=U.currency||'$';
  if(U.name){
    const sn=document.getElementById('sidebar-name');
    const sa=document.getElementById('sidebar-avatar');
    if(sn)sn.textContent=U.name;
    if(sa)sa.textContent=U.name.charAt(0).toUpperCase();
  }
  d=calc();
  renderCard(d);renderBreakdown(d);renderRecs(d);renderNextGrade(d);renderHistory();
}
if(typeof PFCAuth!=='undefined'){
  PFCAuth.onReady(()=>{
    const fresh=loadUser();
    if(JSON.stringify(fresh)!==JSON.stringify(U))_rehydrateFromStorage();
  });
  PFCAuth.onAuthChange(_rehydrateFromStorage);
}
