// Sprint 8: Sage is Pro-only. Free users never reach this script (PFCPlan
// .requirePlan redirects them at the top of the page). USER_CTX is built
// from real onboarding data; LIMITS only contains paid tiers.
const USER_CTX = {
  name:'', income:0, expenses:0, savings:0,
  debt:0, debtPayment:0, healthScore:0, monthlySavings:0,
  netWorth:0, forecast12mo:0, plan:'pro',
  goals:[], debts:[]
};
const LIMITS = { pro:200, premium:500 };

// Derive the snapshot metrics (netWorth, monthlySavings, healthScore,
// forecast12mo) from the raw onboarding inputs. PFCUser stores raw fields
// (income, housing, food, ..., savings, debt) — the dashboard recomputes
// these derived numbers on every render. Sage was reading them directly
// from PFCUser, which doesn't store them, so every value rendered as 0.
function _deriveSnapshot(u) {
  u = u || {};
  const n = (v) => (typeof v === 'number' && Number.isFinite(v)) ? v : (parseFloat(v) || 0);
  const income     = n(u.income) + n(u.otherIncome);
  const expenses   = n(u.housing) + n(u.food) + n(u.transport) + n(u.otherExp);
  const monthlySavings = income - expenses;
  const netWorth   = n(u.savings) + n(u.investments) - n(u.debt);
  const debt       = n(u.debt);
  const forecast12mo = netWorth + (monthlySavings * 12);
  // Simple 0-100 health: positive savings rate weighted 60, low debt-to-income weighted 40.
  const savingsRate = income > 0 ? Math.max(0, Math.min(1, monthlySavings / income)) : 0;
  const dti         = income > 0 ? Math.max(0, Math.min(1, debt / (income * 12))) : 1;
  const healthScore = Math.round((savingsRate * 60) + ((1 - dti) * 40));
  return { netWorth, monthlySavings, debt, healthScore, forecast12mo };
}

function hydrateContext(){
  try {
    // PFCUser is the canonical store; prefer it over the legacy window.PFC
    // shim and over a direct PFCStorage read (which may be pre-warm).
    const stored = (window.PFCUser && window.PFCUser.get && window.PFCUser.get()) ||
                   (window.PFC && window.PFC.user) ||
                   null;
    if (!stored) return; // empty state stays until PFCUser resolves
    Object.assign(USER_CTX, stored, _deriveSnapshot(stored));
    // Reveal the panel when ANY meaningful input field is set, not just
    // income. A user who hasn't entered income yet but has set savings/debt
    // should still see their snapshot.
    const hasData = stored.income || stored.savings || stored.investments ||
                    stored.debt   || stored.housing || stored.food ||
                    stored.transport || stored.otherExp;
    const empty = document.getElementById('snapshot-empty');
    const stats = document.getElementById('snapshot-stats');
    if (!hasData) {
      if (empty) empty.style.display = '';
      if (stats) stats.style.display = 'none';
      return;
    }
    if (empty) empty.style.display = 'none';
    if (stats) stats.style.display = '';
    document.querySelectorAll('[data-snap]').forEach(el => {
      const key = el.dataset.snap;
      const v = USER_CTX[key];
      if (typeof v === 'number' && Number.isFinite(v)) {
        el.textContent = (key === 'healthScore'
          ? Math.round(v) + ' / 100'
          : '$' + Math.round(v).toLocaleString('en-US'));
      }
    });
  } catch(_) {}
}
function hydratePlanInfo(){
  try {
    const plan = (typeof PFCPlan !== 'undefined' && PFCPlan.get) ? PFCPlan.get() : 'pro';
    USER_CTX.plan = (plan === 'premium' ? 'premium' : 'pro');
    const limit = LIMITS[USER_CTX.plan];
    const pill = document.getElementById('usage-pill');
    if (pill) pill.style.display = '';
    document.getElementById('usage-label').textContent = queryCount + ' / ' + limit + ' messages';
  } catch(_){}
}
let queryCount = 0, history = [], isTyping = false;
hydrateContext();

// Workstream 0 Task 0.2 (restored): the system prompt is still built
// server-side from the authenticated profile — no client-supplied prompt
// text reaches the model. Multi-turn conversation and numeric
// personalisation are now re-enabled via strictly-typed fields:
//   • history     — array of ≤10 {role:'user'|'assistant', text:'…' ≤500ch}.
//                   No 'system' / 'tool' / arbitrary roles. No prompt text.
//   • userContext — numbers-only block, every field clamped to a fixed
//                   range. No currency strings, no names, no asset
//                   breakdowns. The server templates the numbers into a
//                   "USER FINANCIAL CONTEXT (numbers only):" block.
// systemPrompt remains rejected with a 400.

// Build the numbers-only userContext object from PFCStorage. Anything that
// fails the number/range checks is dropped (the server would 400 on it).
// Returns null if no usable figures are present.
function buildUserContext() {
  try {
    const ctx = USER_CTX || {};
    const out = {};
    const num = (v) => (typeof v === 'number' && Number.isFinite(v)) ? v : null;
    const clamp = (v, min, max) => (v !== null && v >= min && v <= max) ? v : null;

    const monthlyIncome   = clamp(num(ctx.income),                0, 1_000_000);
    const monthlyExpenses = clamp(num(ctx.expenses),              0, 1_000_000);
    const totalDebt       = clamp(num(ctx.debt),                  0, 100_000_000);
    const totalSavings    = clamp(num(ctx.savings ?? ctx.netWorth), 0, 100_000_000);
    const age             = clamp(num(ctx.age),                  18, 100);
    const goalsCountRaw   = Array.isArray(ctx.goals) ? ctx.goals.length : num(ctx.goalsCount);
    const goalsCount      = (Number.isInteger(goalsCountRaw) && goalsCountRaw >= 0 && goalsCountRaw <= 50) ? goalsCountRaw : null;

    // Derive savings rate from income+expenses if available.
    let savingsRate = null;
    if (monthlyIncome !== null && monthlyIncome > 0 && monthlyExpenses !== null) {
      const rate = ((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100;
      if (Number.isFinite(rate) && rate >= -100 && rate <= 100) {
        // Round to one decimal to keep payload tidy.
        savingsRate = Math.round(rate * 10) / 10;
      }
    }

    if (monthlyIncome   !== null) out.monthlyIncome   = monthlyIncome;
    if (monthlyExpenses !== null) out.monthlyExpenses = monthlyExpenses;
    if (totalDebt       !== null) out.totalDebt       = totalDebt;
    if (totalSavings    !== null) out.totalSavings    = totalSavings;
    if (savingsRate     !== null) out.savingsRate     = savingsRate;
    if (age             !== null) out.age             = age;
    if (goalsCount      !== null) out.goalsCount      = goalsCount;
    return Object.keys(out).length ? out : null;
  } catch (_) {
    return null;
  }
}

async function sendMessage(text) {
  const input = document.getElementById('msg-input');
  const msg   = text || input.value.trim();
  if (!msg || isTyping) return;
  const limit = LIMITS[USER_CTX.plan] || 200;
  if (queryCount >= limit) { document.getElementById('limit-wall').classList.add('show'); return; }
  const ws = document.getElementById('welcome-screen');
  if (ws) ws.style.display = 'none';
  if (!text) { input.value = ''; input.style.height = 'auto'; }
  document.getElementById('char-count').textContent = '0 / 500';
  addUserBubble(msg);
  addHistory(msg);
  showTyping();
  isTyping = true;
  document.getElementById('send-btn').disabled = true;
  try {
    const reply = await callSage(msg);
    hideTyping();
    addSageBubble(reply);
    // Append BOTH turns only after a successful round-trip so a failed call
    // doesn't poison the next request with an unanswered user turn.
    history.push({ role: 'user',      text: msg });
    history.push({ role: 'assistant', text: reply });
    queryCount++;
    updateUsage();
  } catch(e) {
    hideTyping();
    addSageBubble("I'm having a moment — please try again. If this keeps happening, check your connection.");
  }
  isTyping = false;
  document.getElementById('send-btn').disabled = false;
}

// Recent financial-news context (Marketaux). Fetched once at page load
// (1h cache in sessionStorage via PFCNews), passed to /api/sage so Gemini
// can ground answers in real-world headlines. Silent fallback to no-news
// if MARKETAUX_API_KEY isn't configured server-side.
let _sageNewsContext = null;
(function _preloadNews() {
  if (typeof PFCNews === 'undefined' || !PFCNews.getHeadlines) return;
  PFCNews.getHeadlines({ limit: 5 })
    .then((articles) => {
      if (Array.isArray(articles) && articles.length > 0) {
        _sageNewsContext = articles.map((a) => ({
          title: String(a.title || '').slice(0, 180),
          source: String(a.source || '').slice(0, 60),
          published_at: a.published_at || null,
        }));
      }
    })
    .catch(() => { /* silent — Sage works fine without news context */ });
})();

async function callSage(msg) {
  const session = (typeof PFCAuth !== 'undefined') ? PFCAuth.getSession() : null;
  const headers = { 'Content-Type': 'application/json' };
  if (session?.access_token) headers.Authorization = 'Bearer ' + session.access_token;

  // Bounded history: last 10 turns max, each text trimmed + capped to 500ch.
  // Server independently re-validates everything; this is just a friendly
  // pre-flight so we don't 400 on our own request.
  const histPayload = history
    .slice(-10)
    .map(t => ({ role: t.role, text: String(t.text || '').trim().slice(0, 500) }))
    .filter(t => t.text && (t.role === 'user' || t.role === 'assistant'));

  const userContext = buildUserContext();

  const body = { message: msg };
  if (histPayload.length) body.history = histPayload;
  if (userContext)        body.userContext = userContext;
  // Attach recent news context. Server validates structure + caps length
  // independently so the client just sends best-effort.
  if (Array.isArray(_sageNewsContext) && _sageNewsContext.length > 0) {
    body.news_context = _sageNewsContext;
  }

  const res = await fetch('/api/sage', {
    method:'POST',
    headers,
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error('API ' + res.status);
  const d = await res.json();
  return d.reply;
}

function addUserBubble(text) {
  const m = document.getElementById('messages');
  const t = now();
  const d = document.createElement('div');
  d.className = 'msg-row user';
  const initial = (USER_CTX.name ? USER_CTX.name[0] : 'Y').toUpperCase();
  d.innerHTML = `<div class="msg-avatar user-av">${esc(initial)}</div><div class="msg-content"><div class="msg-meta"><span class="msg-name">You</span><span class="msg-time">${t}</span></div><div class="bubble user-b">${esc(text)}</div></div>`;
  m.appendChild(d); m.scrollTop = m.scrollHeight;
}

// Audit H3 fix: Gemini output is HTML-escaped FIRST, then explicit markdown
// transformations are applied to the escaped string — provably script-free.
function _safeSageMarkdown(text) {
  const escaped = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  return escaped
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
}
function addSageBubble(text) {
  const m = document.getElementById('messages');
  const t = now();
  const d = document.createElement('div');
  d.className = 'msg-row';
  const html = _safeSageMarkdown(text);
  d.innerHTML = `<div class="msg-avatar sage-av">S</div><div class="msg-content"><div class="msg-meta"><span class="msg-name" style="color:var(--teal);">Sage</span><span class="msg-time">${t}</span></div><div class="bubble sage-b"><p>${html}</p></div></div>`;
  m.appendChild(d); m.scrollTop = m.scrollHeight;
}

function showTyping() {
  const m = document.getElementById('messages');
  const d = document.createElement('div');
  d.className = 'typing-row'; d.id = 'typing-ind';
  d.innerHTML = `<div class="msg-avatar sage-av">S</div><div class="typing-bubble"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>`;
  m.appendChild(d); m.scrollTop = m.scrollHeight;
}
function hideTyping() { const t = document.getElementById('typing-ind'); if(t) t.remove(); }

function updateUsage() {
  const limit = LIMITS[USER_CTX.plan] || 200;
  const pct   = Math.min(100,(queryCount/limit)*100);
  const lbl = document.getElementById('usage-label');
  if (lbl) lbl.textContent = queryCount+' / '+limit+' messages';
  const bar = document.getElementById('usage-bar');
  if (bar) {
    bar.style.width = pct+'%';
    bar.style.background = pct>80?'var(--red)':pct>60?'var(--amber)':'var(--teal)';
  }
  if (queryCount >= limit) {
    document.getElementById('limit-wall').classList.add('show');
    document.getElementById('send-btn').disabled = true;
    document.getElementById('msg-input').placeholder = 'Quota reached — resets on the 1st';
    // Show Premium CTA only to Pro users (Premium has nowhere to upgrade to).
    const cta = document.getElementById('limit-wall-cta');
    if (cta) cta.style.display = (USER_CTX.plan === 'pro') ? 'inline-flex' : 'none';
  }
}

function addHistory(q) {
  const card = document.getElementById('history-card');
  const list = document.getElementById('history-list');
  card.style.display = 'block';
  const d = document.createElement('div');
  d.className = 'history-item';
  d.innerHTML = `<div class="history-q">${esc(q.substring(0,55))}${q.length>55?'…':''}</div><div class="history-t">${now()}</div>`;
  d.onclick = () => sendStarter(q);
  list.insertBefore(d, list.firstChild);
  if (list.children.length > 5) list.removeChild(list.lastChild);
}

function sendStarter(t) { sendMessage(t); }
function handleKey(e) { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();} }
function autoResize(el) { el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,120)+'px'; const l=el.value.length; document.getElementById('char-count').textContent=l+' / 500'; if(l>500)el.value=el.value.substring(0,500); }
function clearChat() {
  const m=document.getElementById('messages');
  m.innerHTML='';
  const w=document.createElement('div');
  w.id='welcome-screen'; w.className='welcome';
  w.innerHTML=`<div class="welcome-avatar">S</div>
<h2>What can Sage forecast for you today?</h2>
<p class="welcome-sub">Sage works from your real numbers — income, expenses, debt, goals, and your 12-month forecast. Ask anything; answers cite your data.</p>
<div class="starters">
  <button class="starter" onclick="sendStarter('Can I afford a holiday in 3 months?')"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1v11M1 6.5h11" stroke="#8A9BB0" stroke-width="1.4" stroke-linecap="round"/></svg>Can I afford a holiday in 3 months?</button>
  <button class="starter" onclick="sendStarter('When will I be completely debt-free?')"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 9l3-4 2.5 2L11 3" stroke="#8A9BB0" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>When will I be debt-free?</button>
  <button class="starter" onclick="sendStarter('How does a 10% salary raise change my net worth forecast?')"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="5.5" r="2.5" stroke="#8A9BB0" stroke-width="1.3"/><path d="M1 12c0-2 2.5-3.5 5.5-3.5s5.5 1.5 5.5 3.5" stroke="#8A9BB0" stroke-width="1.3" stroke-linecap="round"/></svg>How does a 10% raise change my forecast?</button>
  <button class="starter" onclick="sendStarter('Am I on track for my savings goals?')"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 6.5l2.5 2.5L11 3" stroke="#8A9BB0" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>Am I on track for my goals?</button>
  <button class="starter" onclick="sendStarter('Should I pay off debt or save more money first?')"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1.5" y="3" width="10" height="7" rx="1.5" stroke="#8A9BB0" stroke-width="1.3"/><path d="M4.5 3V2a2 2 0 014 0v1" stroke="#8A9BB0" stroke-width="1.3" stroke-linecap="round"/></svg>Pay off debt or save more first?</button>
  <button class="starter" onclick="sendStarter('What happens to my finances if inflation rises to 6%?')"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M3 10L10 3M7.5 3h2.5v2.5" stroke="#8A9BB0" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>What if inflation rises to 6%?</button>
</div>`;
  m.appendChild(w);
  history=[];
  document.getElementById('limit-wall').classList.remove('show');
  document.getElementById('history-card').style.display='none';
  document.getElementById('history-list').innerHTML='';
}
function now() { return new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}); }
function esc(t) { return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── AUTH-AWARE RE-HYDRATION ──
function _rehydrateFromStorage() { hydrateContext(); hydratePlanInfo(); updateUsage(); }
if (typeof PFCAuth !== 'undefined') {
  PFCAuth.onReady(_rehydrateFromStorage);
  PFCAuth.onAuthChange(_rehydrateFromStorage);
}
// Cross-page state sync: when settings.html / dashboard / cash-forecast
// writes USER updates, the snapshot panel should refresh. Without this,
// the panel reads a stale local PFCUser snapshot from page-load.
if (typeof PFCUser !== 'undefined' && PFCUser.onChange) {
  PFCUser.onChange(_rehydrateFromStorage);
  if (PFCUser.onReady) PFCUser.onReady(_rehydrateFromStorage);
}
if (typeof PFCPlan !== 'undefined' && PFCPlan.onChange) {
  PFCPlan.onChange(() => { hydratePlanInfo(); updateUsage(); });
}
