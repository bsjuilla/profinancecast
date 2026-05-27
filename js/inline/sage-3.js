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
    // SAGE-P0-UX fix (audit 2026-05-25) — pre-fix USER_CTX.name was declared
    // as '' and never populated, so addUserBubble's avatar always rendered
    // 'Y' (the literal fallback initial). PFCUser stores name as
    // `full_name` (Supabase profile) or `name` (legacy). Promote whichever
    // exists; full_name wins on collision. fall back to email's local-part
    // if neither is set so the avatar is still personal.
    let resolvedName = stored.full_name || stored.name || '';
    if (!resolvedName && typeof PFCAuth !== 'undefined') {
      const sess = PFCAuth.getSession && PFCAuth.getSession();
      const email = sess && sess.user && sess.user.email;
      if (email) resolvedName = email.split('@')[0] || '';
    }
    USER_CTX.name = String(resolvedName || '').trim();
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
  // SAGE-P0-UX — kick off the news fetch now (lazy). The first send won't
  // wait for it (no await) — subsequent sends pick up the cached headlines
  // via _sageNewsContext.
  _ensureSageNews();
  const ws = document.getElementById('welcome-screen');
  if (ws) ws.style.display = 'none';
  if (!text) { input.value = ''; input.style.height = 'auto'; }
  // SAGE-HOTFIX (2026-05-25) — append "chars" so the per-message char
  // cap doesn't read like a contradiction with "0 / 200 messages" above.
  document.getElementById('char-count').textContent = '0 / 500 chars';
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
    // SAGE-P0-UX fix (audit 2026-05-25) — distinguish 429 quota from a
    // crash. 429 means the user has burned their monthly Sage allowance
    // and needs the upgrade wall, NOT the "having a moment" line that
    // implies a transient bug. 401 means their session lapsed mid-chat.
    // Anything else is the generic recover-and-retry copy.
    if (e && e.status === 429) {
      // FULL-P1-I-HOTFIX (audit 2026-05-28) — distinguish THREE distinct
      // 429 causes that all hit this code path:
      //
      //   (a) REAL quota-exhausted    — payload.error mentions "queries for
      //                                  this month" AND no retry_after_sec.
      //                                  → show the limit wall + upgrade CTA
      //                                  + jump queryCount to cap (legit).
      //   (b) Router CASCADE_EXHAUSTED — payload has retry_after_sec.
      //                                  → show transient-busy message; do
      //                                  NOT jump queryCount (real quota is
      //                                  fine; the upstream AI providers are
      //                                  temporarily rate-limited).
      //   (c) IP/user rate-limit      — payload.error mentions "Too many
      //                                  requests — slow down a moment".
      //                                  → same as (b) — transient.
      //
      // Pre-hotfix, ALL three rendered as (a) — which faked the user's
      // queryCount to 200/200 even when their actual ai_queries_used was
      // single-digit. Caused the "I didn't use 200 messages!" bug report
      // on commit 67ff158.
      const isTransientBusy =
        (e.retryAfterSec && e.retryAfterSec > 0) ||
        (e.serverMsg && /slow down|busy right now|every AI provider|temporarily/i.test(e.serverMsg));

      if (isTransientBusy) {
        // Transient — show a friendly retry bubble, do NOT touch quota counter
        const retryMin = e.retryAfterSec
          ? Math.max(1, Math.ceil(e.retryAfterSec / 60))
          : 5;
        addSageBubble(
          (e.serverMsg && e.serverMsg.length > 10)
            ? e.serverMsg + ` (Try again in about ${retryMin} minute${retryMin === 1 ? '' : 's'}.)`
            : `Sage is briefly unavailable. Please try again in about ${retryMin} minute${retryMin === 1 ? '' : 's'}.`
        );
      } else {
        // Real quota exhausted — show the wall + upgrade CTA + cap the counter
        const wall = document.getElementById('limit-wall');
        const wallText = document.getElementById('limit-wall-text');
        const cta = document.getElementById('limit-wall-cta');
        if (wallText) {
          wallText.textContent = e.serverMsg ||
            "You've used all your Sage messages for this 30-day window. Your quota resets 30 days after your first message in the current window.";
        }
        if (wall) wall.classList.add('show');
        if (cta) cta.style.display = e.upgrade ? 'inline-flex' : 'none';
        const limit = LIMITS[USER_CTX.plan] || 200;
        queryCount = Math.max(queryCount, limit);
        updateUsage();
      }
    } else if (e && e.status === 401) {
      addSageBubble("Your session timed out. Please refresh the page and sign back in to continue the conversation.");
    } else {
      addSageBubble("I'm having a moment — please try again. If this keeps happening, check your connection.");
    }
  }
  isTyping = false;
  document.getElementById('send-btn').disabled = false;
}

// Recent financial-news context (Marketaux). Passed to /api/sage so Gemini
// can ground answers in real-world headlines. Silent fallback to no-news
// if MARKETAUX_API_KEY isn't configured server-side.
//
// SAGE-P0-UX fix (audit 2026-05-25) — was eagerly fetched on every page
// load (even if the user just opened Sage to read history and bounced).
// Every visit hit Marketaux's quota AND ran a network call before any
// user intent existed. Now we lazy-load on the FIRST sendMessage. The
// /api/news route still caches for 1h via sessionStorage, so the second
// chat round-trip is free even though the first looks slightly slower.
let _sageNewsContext = null;
let _sageNewsPromise = null;
function _ensureSageNews() {
  if (_sageNewsContext) return Promise.resolve(_sageNewsContext);
  if (_sageNewsPromise) return _sageNewsPromise;
  if (typeof PFCNews === 'undefined' || !PFCNews.getHeadlines) {
    return Promise.resolve(null);
  }
  _sageNewsPromise = PFCNews.getHeadlines({ limit: 5 })
    .then((articles) => {
      if (Array.isArray(articles) && articles.length > 0) {
        _sageNewsContext = articles.map((a) => ({
          title: String(a.title || '').slice(0, 180),
          source: String(a.source || '').slice(0, 60),
          published_at: a.published_at || null,
        }));
      }
      return _sageNewsContext;
    })
    .catch(() => null);
  return _sageNewsPromise;
}

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
  // SAGE-P0-UX fix (audit 2026-05-25) — surface HTTP status code AND any
  // upgrade flag so sendMessage can render the right UX (quota-exceeded
  // upsell vs generic "moment" copy). Pre-fix every non-2xx threw the same
  // string and the catch always showed the same friendly-but-misleading
  // line; a Premium user out of 500 messages got the same message as
  // someone who lost wifi mid-request.
  if (!res.ok) {
    let payload = null;
    try { payload = await res.json(); } catch (_) {}
    const err = new Error('API ' + res.status);
    err.status = res.status;
    err.upgrade = !!(payload && payload.upgrade);
    err.serverMsg = (payload && typeof payload.error === 'string') ? payload.error : '';
    // FULL-P1-I-HOTFIX (audit 2026-05-28) — capture retry_after_sec so the
    // sendMessage 429-handler can distinguish router CASCADE_EXHAUSTED
    // (transient, has retry_after_sec) from real quota-exhausted (terminal,
    // no retry_after_sec). Without this, the UI couldn't tell them apart
    // and falsely rendered the user's quota as 200/200 on every router
    // cascade event.
    err.retryAfterSec = (payload && typeof payload.retry_after_sec === 'number')
      ? payload.retry_after_sec : null;
    throw err;
  }
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
    // SAGE-P0-UX fix (audit 2026-05-25) — was "Quota reached — resets on
    // the 1st" but the server uses a 30-day rolling window keyed off the
    // user's first message (see api/sage.js: ai_queries_reset_at = first
    // call + 30 days). The "1st" copy was dishonest and produced support
    // tickets every month. Honest copy now.
    document.getElementById('msg-input').placeholder = 'Quota reached — resets 30 days from your first message';
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
  // SAGE-P0-CSP fix (audit 2026-05-25) — was building click via d.onclick
  // closure. Switched to addEventListener so all event wiring follows the
  // same CSP-friendly pattern as the starters (data-pfc-on-click bus).
  // q is bound via closure; no inline handler string interpolation.
  const tail = q.length > 55 ? '…' : '';
  d.innerHTML = `<div class="history-q">${esc(q.substring(0,55))}${esc(tail)}</div><div class="history-t">${esc(now())}</div>`;
  d.addEventListener('click', () => sendStarter(q));
  list.insertBefore(d, list.firstChild);
  if (list.children.length > 5) list.removeChild(list.lastChild);
}

function sendStarter(t) { sendMessage(t); }
function handleKey(e) { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();} }
function autoResize(el) { el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,120)+'px'; const l=el.value.length; document.getElementById('char-count').textContent=l+' / 500 chars'; if(l>500)el.value=el.value.substring(0,500); }
// SAGE-P0-CSP fix (audit 2026-05-25) — STARTERS are now defined ONCE here
// and reused by both initial render (NOT injected by JS since the HTML
// already ships them) and clearChat. The pre-fix clearChat re-injected the
// six buttons via innerHTML with inline `onclick="sendStarter(...)"` —
// six CSP violations per Clear-Chat click and the only place on the
// surface that still relied on inline handlers. All renders now use
// data-pfc-on-click="sendStarter" + data-pfc-arg='"..."' which is dispatched
// by pfc-inline-bootstrap (same pattern as G-P0-5, R-P0-6+7, DASH-PROD-FIX).
const _SAGE_STARTERS = [
  { q:'Can I afford a holiday in 3 months?', label:'Can I afford a holiday in 3 months?',
    svg:'<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1v11M1 6.5h11" stroke="#8A9BB0" stroke-width="1.4" stroke-linecap="round"/></svg>' },
  { q:'When will I be completely debt-free?', label:'When will I be debt-free?',
    svg:'<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 9l3-4 2.5 2L11 3" stroke="#8A9BB0" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
  { q:'How does a 10% salary raise change my net worth forecast?', label:'How does a 10% raise change my forecast?',
    svg:'<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="5.5" r="2.5" stroke="#8A9BB0" stroke-width="1.3"/><path d="M1 12c0-2 2.5-3.5 5.5-3.5s5.5 1.5 5.5 3.5" stroke="#8A9BB0" stroke-width="1.3" stroke-linecap="round"/></svg>' },
  { q:'Am I on track for my savings goals?', label:'Am I on track for my goals?',
    svg:'<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 6.5l2.5 2.5L11 3" stroke="#8A9BB0" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
  { q:'Should I pay off debt or save more money first?', label:'Pay off debt or save more first?',
    svg:'<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1.5" y="3" width="10" height="7" rx="1.5" stroke="#8A9BB0" stroke-width="1.3"/><path d="M4.5 3V2a2 2 0 014 0v1" stroke="#8A9BB0" stroke-width="1.3" stroke-linecap="round"/></svg>' },
  { q:'What happens to my finances if inflation rises to 6%?', label:'What if inflation rises to 6%?',
    svg:'<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M3 10L10 3M7.5 3h2.5v2.5" stroke="#8A9BB0" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
];
function clearChat() {
  const m=document.getElementById('messages');
  m.innerHTML='';
  const w=document.createElement('div');
  w.id='welcome-screen'; w.className='welcome';
  // Avatar + headline + starter grid. Each starter button gets a direct
  // addEventListener AFTER append (the pfc-inline-bootstrap dispatcher
  // runs once at script load and exposes no public re-bind hook, so a
  // closure-bound listener is the cleanest local fix). esc() runs over
  // every interpolated value to keep parity with the rest of the surface.
  const startersHtml = _SAGE_STARTERS.map((s, i) =>
    `<button class="starter" data-sage-starter="${i}" type="button">${s.svg}${esc(s.label)}</button>`
  ).join('');
  w.innerHTML =
    `<div class="welcome-avatar">S</div>` +
    `<h2>What can Sage forecast for you today?</h2>` +
    `<p class="welcome-sub">Sage works from your real numbers — income, expenses, debt, goals, and your 12-month forecast. Ask anything; answers cite your data.</p>` +
    `<div class="starters">${startersHtml}</div>`;
  m.appendChild(w);
  // Wire each starter button — closure-bound, idempotent (the buttons are
  // freshly created so no prior listener exists). NO inline onclick = CSP safe.
  w.querySelectorAll('[data-sage-starter]').forEach((btn) => {
    const idx = parseInt(btn.getAttribute('data-sage-starter'), 10);
    const starter = _SAGE_STARTERS[idx];
    if (starter) btn.addEventListener('click', () => sendStarter(starter.q));
  });
  history=[];
  document.getElementById('limit-wall').classList.remove('show');
  document.getElementById('history-card').style.display='none';
  document.getElementById('history-list').innerHTML='';
}
function now() { return new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}); }
// SAGE-P0-XSS fix (audit 2026-05-25) — was the 3-char escape
// (& < >) only. Sage user-bubble text comes from the message input which
// then gets re-rendered through this function (addUserBubble line ~227) AND
// the history pill (addHistory). A payload like `" onmouseover="alert(1)`
// inside an attribute context would have slipped through the 3-char escape;
// the bubble is a text node now but defense in depth + parity with the
// 5-char escHtml invariant used across the codebase (NW-P0-3, DASH-P1-12,
// G-P0-2, R-P0-8, DS-P0-MATH, J-P0-* — same regex everywhere) means we
// upgrade. Matches _safeSageMarkdown which already does all five.
function esc(t) {
  return String(t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
