// ── DATA ──
let USER = {};
let GOALS = [];
let editingIdx = -1;
let selectedCat = 'emergency';
let selectedColor = 'var(--money)';

// G-P2-2 fix (audit 2026-05-24) — centralized color palette. Pre-fix the
// 8 hex literals were duplicated across GOAL_COLORS + PALETTE; tweaks
// required hunting two arrays. Now: GOAL_PALETTE is the single source,
// GOAL_COLORS/PALETTE are aliases (kept for backwards-compat with any
// external reader). Each entry carries a comment naming the brand role.
const GOAL_PALETTE = [
  'var(--money)', // brand teal — default
  '#3B82F6',      // brand blue   — home / aspiration
  '#F5A623',      // brand amber  — travel / leisure
  '#A78BFA',      // brand violet — invest / future
  '#E05252',      // brand red    — debt / urgent
  '#22C55E',      // brand emerald — emergency / safety
  '#F97316',      // brand orange — wedding / milestone
  '#EC4899',      // brand pink   — education / custom
];
const GOAL_COLORS = GOAL_PALETTE.slice(0, 6);
const PALETTE = GOAL_PALETTE;

// G-P1-D fix (audit 2026-05-24) — custom confirm modal helper. Pre-fix
// deleteGoal used window.confirm() which is unreliable / invisible in iOS
// PWA standalone mode (some versions render an undismissable prompt).
// Promise-based modal mirrors NW-P1-6 + NW-P2-9 hardening.
let _pfcConfirmActive = false;
function _pfcConfirm(message, okLabel) {
  return new Promise(function (resolve) {
    if (_pfcConfirmActive) { resolve(false); return; }
    _pfcConfirmActive = true;
    const modal = document.getElementById('gl-confirm-modal');
    const msgEl = document.getElementById('gl-confirm-msg');
    const okBtn = document.getElementById('gl-confirm-ok');
    const cancelBtn = document.getElementById('gl-confirm-cancel');
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

// G-P0-7 fix (audit 2026-05-24) — local-date helpers for month-input math.
// Pre-fix `new Date(dateVal + '-01')` parsed the YYYY-MM-DD-01 string as
// UTC while `new Date()` returned local time. For a user east of UTC, a
// targetDate of "2027-01-01" at month boundary read as Dec 31 local, so
// the diffMonths calc was off by a month — silent overstatement of how
// much they need to save per month. Mirror NW-P1-2 _localToday pattern.
function _localDateFromYM(ymStr) {
  // ymStr is "YYYY-MM" from <input type="month">.
  const parts = String(ymStr || '').split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (!y || !m) return null;
  // Local-time constructor — interprets as user's timezone, not UTC.
  return new Date(y, m - 1, 1, 12, 0, 0);
}
function _monthDiff(targetDate, fromDate) {
  if (!targetDate || !fromDate) return 0;
  return (targetDate.getFullYear() - fromDate.getFullYear()) * 12 +
         (targetDate.getMonth() - fromDate.getMonth());
}

// HTML-escape helper. Used to wrap user-controlled strings (goal names)
// before they get interpolated into innerHTML template literals. Without
// this, a goal name like '<img src=x onerror=alert(1)>' would execute as
// script in the legend renderer.
function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// G-P2-11 fix (audit 2026-05-24) — escHtml/_cssColor/Number consistency
// invariant. Every interpolation into innerHTML in this file MUST pass
// through one of these gates:
//   - escHtml(g.name)              — user-typed strings
//   - _cssColor(g.color || ...)    — color values flowing into style="..."
//   - Number(g.boost) || 0         — numeric attribute values
//   - USER.sym                     — already escaped at assignment site (L182)
//   - Math.round(...)/toLocaleString — purely numeric values
// Any new sink that breaks this invariant is a regression. textContent
// sinks are auto-safe and don't need explicit escape.

// G-P0-2 fix (audit 2026-05-24) — CSS-context escape for color values that
// flow into `style="background:${color}"`. HTML escape isn't enough here:
// a value of `red"><img src=x onerror=alert(1)>` breaks out of the style
// attribute. Whitelist approach: only allow known-safe CSS color forms
// (hex, rgb/rgba, var(--*), named CSS colors). Anything else falls back
// to the brand teal. This means a tampered g.color CAN'T inject anything,
// even via CSS context.
function _cssColor(v) {
  const s = String(v == null ? '' : v).trim();
  // var(--name) — token usage (the most common form in this codebase)
  if (/^var\(--[a-z0-9-]+\)$/i.test(s)) return s;
  // #rgb / #rrggbb / #rrggbbaa
  if (/^#[0-9a-f]{3,8}$/i.test(s)) return s;
  // rgb(r,g,b) / rgba(r,g,b,a) — digits, commas, spaces, decimal, percent
  if (/^rgba?\(\s*\d+%?\s*,\s*\d+%?\s*,\s*\d+%?(\s*,\s*[\d.]+)?\s*\)$/i.test(s)) return s;
  // hsl()/hsla()
  if (/^hsla?\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%(\s*,\s*[\d.]+)?\s*\)$/i.test(s)) return s;
  // Named CSS colors (subset — extend as needed)
  if (/^(red|blue|green|orange|purple|gold|teal|cyan|magenta|yellow|black|white|gray|grey)$/i.test(s)) return s;
  // Anything else — fallback to brand teal
  return 'var(--teal)';
}

const CAT_DEFAULTS = {
  emergency: { name: 'Emergency fund', hint: (u) => `Recommended: 6× your monthly expenses = ${u.sym}${Math.round((u.housing+u.food+u.transport+u.otherExp)*6).toLocaleString()}` },
  home:      { name: 'Home deposit', hint: () => 'Typical deposit: 10–20% of property value' },
  car:       { name: 'Car fund', hint: () => 'Include insurance, registration, and running costs' },
  travel:    { name: 'Holiday fund', hint: () => 'Include flights, accommodation, and spending money' },
  invest:    { name: 'Investment fund', hint: () => 'Even small regular amounts compound significantly' },
  retire:    { name: 'Retirement fund', hint: () => 'Target: 25× your annual expenses (the 4% rule)' },
  education: { name: 'Education fund', hint: () => 'Include tuition, books, and living costs' },
  wedding:   { name: 'Wedding fund', hint: () => 'Average wedding costs vary widely by region' },
  custom:    { name: '', hint: () => '' },
};

// G-P1-H fix (audit 2026-05-24) — cross-tool links per category. Pre-fix
// goals were siloed; a debt goal didn't link to /debt-optimizer where the
// user could attack the principal directly, an emergency goal didn't link
// to /salary-calculator for raise-impact modeling, etc. Now each card
// surfaces a "Open in <tool>" link based on category.
const CAT_LINKS = {
  emergency: { href: 'salary-calculator.html', label: 'Model raise impact →' },
  debt:      { href: 'debt-optimizer.html',    label: 'Open Debt strategy →' },
  home:      { href: 'dashboard.html',         label: 'See full forecast →' },
  car:       { href: 'dashboard.html',         label: 'See full forecast →' },
  travel:    { href: 'recurring.html',         label: 'Find subs to cut →' },
  invest:    { href: 'portfolio.html',         label: 'View portfolio →' },
  retire:    { href: 'dashboard.html',         label: 'See retirement forecast →' },
  education: { href: 'dashboard.html',         label: 'See full forecast →' },
  wedding:   { href: 'recurring.html',         label: 'Find subs to cut →' },
  custom:    { href: 'sage.html',              label: 'Ask Sage for advice →' },
};

// G-P2-8 fix (audit 2026-05-24) — why-bother framing per category. Each
// goal card needs a concrete payoff line, not just "% saved". Loss-aversion
// + concrete-benefit framing per marketing-psychology principles.
// Functions receive { rem, surplus, months } so the line is contextual.
const CAT_WHY = {
  emergency: ({months}) => months ? months + ' months of runway if income stops.' : 'A cash buffer between you and any nasty surprise.',
  debt:      ({months}) => months ? 'Debt-free ~' + months + ' months sooner than minimum payments.' : 'Every extra dollar here saves you interest.',
  home:      ({months}) => months ? 'Keys in hand in ~' + months + ' months.' : 'The down-payment that turns rent into ownership.',
  car:       ({months}) => months ? 'On the road in ~' + months + ' months — no monthly finance bill.' : 'Buying outright beats financing every time.',
  travel:    ({months}) => months ? 'Boarding pass in ~' + months + ' months — no post-trip credit-card hangover.' : 'A trip without debt is twice the holiday.',
  invest:    ({months}) => months ? months + ' months of contributions = decades of compounding.' : 'Money invested today is worth ~10× in 30 years.',
  retire:    ({months}) => months ? '~' + Math.round(months/12) + ' years closer to the day work is optional.' : 'The earlier you start, the smaller the monthly bite.',
  education: ({months}) => months ? '~' + months + ' months to the next degree — no student loan.' : 'Education paid up-front is education without interest.',
  wedding:   ({months}) => months ? '~' + months + ' months to the big day, debt-free.' : 'Start married life with savings, not a wedding loan.',
  custom:    ({months}) => months ? 'On track in ~' + months + ' months.' : 'Named the goal — now the maths does the rest.',
};

const CAT_ICONS = {
  emergency:'🛡️', home:'🏠', car:'🚗', travel:'✈️',
  invest:'📈', retire:'🌅', education:'🎓', wedding:'💍', custom:'⭐'
};

// G-P0-1 fix (audit 2026-05-24) — canonical Goal shape (documented):
//   { id: 'g_<base36>_<rand>', name, target, current,
//     color?, category?, targetDate?, monthlyNeeded?, boost?, key? }
//
// 3 writers (onboarding-2 seed, this file's saveGoal, dashboard-2 saveGoal)
// historically used construct-fresh-then-overwrite which silently destroyed
// any field the editor didn't know about. Resolution:
//   (a) all writers use spread-then-merge to preserve unknown fields
//   (b) all writers mint id if missing (defense-in-depth Layer 1)
//   (c) loader backfills id for any pre-rollout goal (Layer 2)

// ── LOAD ──
function load() {
  try { USER = (typeof PFCUser !== 'undefined') ? PFCUser.get() : (PFCStorage.getJSON('user') || {}); } catch(e) { USER = {}; }
  try { GOALS = PFCStorage.getJSON('goals') || []; } catch(e) { GOALS = []; }

  // G-P0-1 defense-in-depth Layer 2: backfill id on any goal without one
  // (e.g. legacy onboarding seeds pre-id-rollout). Mirrors dashboard-2.js
  // loadGoals pattern so cross-page edit/delete works on every goal.
  let _needsResave = false;
  GOALS.forEach(g => {
    if (!g.id) {
      g.id = 'g_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
      _needsResave = true;
    }
  });
  if (_needsResave) { try { PFCStorage.setJSON('goals', GOALS); } catch(e) {} }

  // Compute surplus
  USER.surplus = Math.max(0,
    ((USER.income||0) + (USER.otherIncome||0)) -
    ((USER.housing||0) + (USER.food||0) + (USER.transport||0) + (USER.otherExp||0) + (USER.debtPay||0))
  );
  // G-P0-2 sink (a) fix — escape sym at the single assignment site so
  // every downstream interpolation into innerHTML is safe. USER.currency
  // is user-controllable via Settings; without escape, `<img src=x
  // onerror=alert(1)>` in the currency field renders as live HTML across
  // the entire page (conflict banner, goal cards, allocations, modal).
  USER.sym = escHtml(window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$'));

  // Sidebar user-pill hydrated by js/pfc-sidebar.js;
  // plan badge by PFCPlan.applyBadges().

  render();
}

// ── SAVE ──
function save() {
  PFCStorage.setJSON('goals', GOALS);
}

// ── RENDER ──
function render() {
  const grid = document.getElementById('goals-grid');
  const empty = document.getElementById('empty-state');
  const allocWrap = document.getElementById('alloc-wrap');
  grid.innerHTML = '';

  // Summary
  const totalTarget = GOALS.reduce((s,g) => s + (g.target||0), 0);
  const totalCurrent = GOALS.reduce((s,g) => s + (g.current||0), 0);
  const sym = USER.sym || '$';
  document.getElementById('s-total').textContent = sym + totalTarget.toLocaleString();
  document.getElementById('s-total-hint').textContent = `across ${GOALS.length} goal${GOALS.length!==1?'s':''}`;
  document.getElementById('s-surplus').textContent = sym + Math.round(USER.surplus||0).toLocaleString();
  const overallPct = totalTarget > 0 ? Math.min(100, Math.round(totalCurrent / totalTarget * 100)) : 0;
  document.getElementById('s-progress').textContent = overallPct + '%';
  document.getElementById('s-progress-hint').textContent = sym + totalCurrent.toLocaleString() + ' of ' + sym + totalTarget.toLocaleString();
  document.getElementById('topbar-sub').textContent = GOALS.length
    ? `${GOALS.length} active goal${GOALS.length!==1?'s':''} · ${overallPct}% funded overall`
    : 'No goals yet — add your first one';

  // G-P0-4 fix — gate lighthouse photo on empty state. Pre-fix it
  // rendered unconditionally above the grid even when user had goals.
  const lighthousePhoto = document.getElementById('lighthouse-photo');
  if (!GOALS.length) {
    empty.classList.add('show');
    allocWrap.style.display = 'none';
    document.getElementById('s-needed').textContent = sym + '0';
    document.getElementById('conflict-banner').classList.remove('show');
    if (lighthousePhoto) lighthousePhoto.style.display = '';
    return;
  }
  empty.classList.remove('show');
  if (lighthousePhoto) lighthousePhoto.style.display = 'none';

  // Allocate surplus across goals by priority.
  // G-P1-A fix (audit 2026-05-24) — recompute monthlyNeeded at render time
  // instead of trusting the stale value frozen at saveGoal. Pre-fix the
  // value never updated as current grew, so a goal with $200 target and
  // $190 current still showed "$50/mo needed for 12 months". Now: if
  // targetDate exists, compute monthly-to-deadline using local-date diff;
  // otherwise default to 24-month even pace.
  let remainingSurplus = USER.surplus || 0;
  const today = new Date();
  const allocations = GOALS.map((g, i) => {
    const rem = Math.max(0, (g.target||0) - (g.current||0));
    let needed;
    if (g.targetDate) {
      const diffMonths = _monthDiff(_localDateFromYM(g.targetDate), today);
      needed = diffMonths > 0 ? Math.ceil(rem / diffMonths) : rem; // past deadline → all-at-once
    } else {
      needed = Math.ceil(rem / 24); // default 24-month pace
    }
    const allocated = Math.min(remainingSurplus, needed);
    remainingSurplus = Math.max(0, remainingSurplus - allocated);
    return { allocated, needed, shortfall: Math.max(0, needed - allocated) };
  });

  // Total needed
  const totalNeeded = GOALS.reduce((s, g, i) => s + allocations[i].needed, 0);
  document.getElementById('s-needed').textContent = sym + Math.round(totalNeeded).toLocaleString();
  const hasConflict = totalNeeded > (USER.surplus || 0) * 1.05;
  document.getElementById('conflict-banner').classList.toggle('show', hasConflict);
  if (hasConflict) {
    const shortfall = Math.round(totalNeeded - (USER.surplus||0));
    // G-WORTH-1 / G-P0-8 fix (audit 2026-05-24, operator option 1) — Pro
    // upsell removed; conflict resolver now surfaces actionable reallocation
    // info to every tier per pricing.md "full goals" Free promise. Note
    // sym is already _escHtml'd at USER.sym assignment site (G-P0-2 sink a).
    // Identify which goal has the largest contribution-vs-need gap and
    // suggest deprioritising it — concrete next step instead of just "you
    // have a shortfall".
    let worstIdx = 0, worstGap = 0;
    allocations.forEach((a, i) => {
      const gap = a.needed - a.allocated;
      if (gap > worstGap) { worstGap = gap; worstIdx = i; }
    });
    const worstGoal = GOALS[worstIdx];
    const worstName = worstGoal ? escHtml(worstGoal.name) : 'one goal';
    document.getElementById('conflict-text').innerHTML =
      `<strong>Goal conflict — short by ${sym}${shortfall.toLocaleString()}/mo.</strong> ` +
      `Try lowering the target on <em>${worstName}</em>, extending its deadline, or pausing the lowest-priority goal until your surplus catches up.`;
  }

  // Allocation bar
  allocWrap.style.display = 'block';
  const barEl = document.getElementById('alloc-bar');
  const legendEl = document.getElementById('alloc-legend');
  const totalSurplus = USER.surplus || 1;
  barEl.innerHTML = '';
  legendEl.innerHTML = '';
  document.getElementById('alloc-total-label').textContent = `Distributing ${sym}${Math.round(USER.surplus||0).toLocaleString()} / month`;

  GOALS.forEach((g, i) => {
    const alloc = allocations[i].allocated;
    const pct = Math.min(100, alloc / totalSurplus * 100);
    const color = _cssColor(g.color || PALETTE[i % PALETTE.length]); // G-P0-2 sink (b)
    if (pct > 0) {
      const seg = document.createElement('div');
      seg.className = 'alloc-segment';
      seg.style.cssText = `width:${pct}%;background:${color};`;
      barEl.appendChild(seg);
    }
    legendEl.innerHTML += `<div class="alloc-legend-item"><div class="alloc-dot" style="background:${color};"></div>${escHtml(g.name)} — ${sym}${Math.round(alloc).toLocaleString()}/mo</div>`;
  });
  // Unallocated
  const unallocPct = Math.max(0, (remainingSurplus / totalSurplus) * 100);
  if (unallocPct > 1) {
    const seg = document.createElement('div');
    seg.className = 'alloc-segment';
    seg.style.cssText = `width:${unallocPct}%;background:var(--bg3);`;
    barEl.appendChild(seg);
    legendEl.innerHTML += `<div class="alloc-legend-item"><div class="alloc-dot" style="background:var(--bg3);border:1px solid var(--border2);"></div>Unallocated — ${sym}${Math.round(remainingSurplus).toLocaleString()}/mo</div>`;
  }

  // Render cards
  GOALS.forEach((g, i) => {
    const pct = Math.min(100, g.target > 0 ? Math.round(g.current / g.target * 100) : 0);
    const alloc = allocations[i];
    const color = _cssColor(g.color || PALETTE[i % PALETTE.length]); // G-P0-2 sink (b)
    const rem = Math.max(0, (g.target||0) - (g.current||0));
    const months = alloc.allocated > 0 ? Math.ceil(rem / alloc.allocated) : null;
    // G-P0-2 sink (c) defense-in-depth — also coerce boost in math/render path
    const boost = Number(g.boost) || 0;
    const monthsWithBoost = boost > 0 ? Math.ceil(rem / (alloc.allocated + boost)) : null;

    // Status
    let statusClass, statusLabel;
    if (pct >= 100) { statusClass = 'status-done'; statusLabel = '✓ Completed'; }
    else if (alloc.shortfall === 0 && alloc.allocated > 0) { statusClass = 'status-funded'; statusLabel = '● Fully funded'; }
    else if (alloc.allocated > 0) { statusClass = 'status-ontrack'; statusLabel = '◗ Partially funded'; }
    else if (alloc.needed > 0) { statusClass = 'status-starved'; statusLabel = '⚠ Needs funding'; }
    else { statusClass = 'status-ontrack'; statusLabel = '◎ On track'; }

    const icon = CAT_ICONS[g.category || 'custom'] || '⭐';
    const completed = pct >= 100;

    // SVG ring
    const ringR = 34, ringC = 40;
    const circ = 2 * Math.PI * ringR;

    const card = document.createElement('div');
    card.className = 'goal-card' + (completed ? ' completed' : '');
    card.style.setProperty('--goal-color', color);
    card.style.animationDelay = (i * 0.06) + 's';

    // Render with empty ring; PFCMotion.goalRing fills it when the card scrolls into view.
    // G-P1-C fix — role=img + aria-label on SVG ring so screen readers
    // hear "Emergency fund — 57% funded" instead of "graphic". Pre-fix
    // the canvas was inert to AT.
    const ringAriaLabel = escHtml(g.name) + ' progress: ' + pct + '% of target funded.';
    card.innerHTML = `
      <div class="goal-card-top">
        <div class="goal-ring-wrap">
          <svg width="80" height="80" viewBox="0 0 80 80" role="img" aria-label="${ringAriaLabel}">
            <circle cx="40" cy="40" r="${ringR}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="8"/>
            <circle class="goal-ring-fill" cx="40" cy="40" r="${ringR}" fill="none" stroke="${color}" stroke-width="8"
              stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${circ.toFixed(1)}"
              stroke-linecap="round" transform="rotate(-90 40 40)"/>
            <text x="40" y="37" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="15" font-weight="800" fill="#F0F4F8" aria-hidden="true">${pct}%</text>
            <text x="40" y="51" text-anchor="middle" font-family="Inter,sans-serif" font-size="9" fill="#4A5A6E" aria-hidden="true">${icon}</text>
          </svg>
        </div>
        <div class="goal-info">
          <div class="goal-name" title="${escHtml(g.name)}">${escHtml(g.name)}</div>
          <div class="goal-amounts">${USER.sym}${Math.round(g.current||0).toLocaleString()} of ${USER.sym}${Math.round(g.target||0).toLocaleString()}</div>
          <div class="goal-status-badge ${statusClass}">${statusLabel}</div>
        </div>
        <div class="priority-badge" title="Priority ${i+1}">${i + 1}</div>
      </div>

      <!-- G-P2-8 fix — why-bother framing per category. Concrete payoff
           line that makes the goal feel real, not abstract. -->
      ${(() => {
        const why = (CAT_WHY[g.category || 'custom'] || CAT_WHY.custom)({ rem, surplus: USER.surplus || 0, months });
        return why ? '<div class="goal-why" style="margin:6px 0 12px;padding:8px 12px;background:var(--gold-soft,rgba(212,175,106,0.06));border-left:2px solid var(--gold,#D4AF6A);border-radius:4px;font-size:12px;line-height:1.45;color:var(--text2);font-style:italic;">' + escHtml(why) + '</div>' : '';
      })()}

      <div class="goal-card-body">
        <div class="goal-timeline">
          <span class="goal-timeline-label">Est. completion</span>
          <span class="goal-timeline-val">${completed ? 'Done.' : months ? months + ' month' + (months===1?'':'s') : '—'}</span>
        </div>

        <div class="goal-alloc-row">
          <div class="goal-alloc-label">Monthly allocation</div>
          <div class="goal-alloc-vals">
            <div class="goal-alloc-num" style="color:${color};">${USER.sym}${Math.round(alloc.allocated).toLocaleString()}/mo</div>
            <div class="goal-alloc-sub">need ${USER.sym}${Math.round(alloc.needed).toLocaleString()}/mo ${alloc.shortfall > 0 ? '· <span style="color:var(--red);">-'+USER.sym+Math.round(alloc.shortfall).toLocaleString()+'</span>' : '· <span style="color:var(--teal);">✓ covered</span>'}</div>
          </div>
        </div>

        <!-- Boost slider -->
        <div class="boost-wrap" id="boost-${i}">
          <div class="boost-header">
            <span>Extra monthly boost</span>
            <span class="boost-result" id="boost-result-${i}">${(Number(g.boost) || 0) > 0 ? `+${USER.sym}${Number(g.boost) || 0}/mo → ${monthsWithBoost} months` : 'move slider to see impact'}</span>
          </div>
          <!-- G-P0-2 sink (c) fix — coerce g.boost via Number() so a tampered
               localStorage value like '"><script>...' can't break out of
               the value="" attribute. Numbers are safe in attribute context.
               G-P0-5 fix — data-action attrs replace inline oninput= for CSP. -->
          <input type="range" class="boost-track" min="0" max="${Math.max(200, Math.round(USER.surplus||200))}" step="10" value="${Number(g.boost) || 0}"
            data-action="updateBoost" data-idx="${i}" data-rem="${rem}" data-alloc="${alloc.allocated}">
        </div>

        <!-- G-P0-5 fix — data-action attrs replace inline onclick= for CSP. -->
        <div class="goal-actions">
          <button class="goal-action-btn boost-btn" data-action="toggleBoost" data-idx="${i}">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5l4.5-4.5 4.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            Boost
          </button>
          <button class="goal-action-btn" data-action="editGoal" data-idx="${i}">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M7.5 1.5l2 2L3 10l-2.5.5.5-2.5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
            Edit
          </button>
          ${i > 0 ? `<button class="goal-action-btn" data-action="moveGoal" data-idx="${i}" data-dir="-1" title="Increase priority">↑</button>` : ''}
          ${i < GOALS.length-1 ? `<button class="goal-action-btn" data-action="moveGoal" data-idx="${i}" data-dir="1" title="Decrease priority">↓</button>` : ''}
          <button class="goal-action-btn delete-btn" data-action="deleteGoal" data-idx="${i}">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M1 2.5h9M3.5 2.5V2a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v.5M7.5 4.5v4M5.5 4.5v4M3.5 4.5v4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
            Delete
          </button>
        </div>
        ${(() => {
          // G-P1-H — cross-tool link (CRO bundle). Category drives the link.
          const link = CAT_LINKS[g.category || 'custom'] || CAT_LINKS.custom;
          return '<a href="' + link.href + '" style="display:inline-block;margin-top:10px;font-size:12px;color:var(--teal);text-decoration:none;">' + escHtml(link.label) + '</a>';
        })()}
      </div>

      ${completed ? '<div class="completed-strip">Goal reached. Add funds or set a new target.</div>' : ''}
    `;

    grid.appendChild(card);

    // G-P0-5 fix (audit 2026-05-24) — CSP-safe handler wiring. Pre-fix the
    // card template injected raw onclick=/oninput= via innerHTML which blocks
    // any CSP `script-src 'self'`. Now data-action attrs are wired via
    // addEventListener after the card is in the DOM.
    card.querySelectorAll('[data-action]').forEach(function(el) {
      const action = el.getAttribute('data-action');
      const idx = parseInt(el.getAttribute('data-idx'), 10);
      if (action === 'updateBoost') {
        const rem = parseFloat(el.getAttribute('data-rem')) || 0;
        const allocAmt = parseFloat(el.getAttribute('data-alloc')) || 0;
        el.addEventListener('input', function() {
          updateBoost(idx, el.value, rem, allocAmt);
        });
      } else if (action === 'moveGoal') {
        const dir = parseInt(el.getAttribute('data-dir'), 10);
        el.addEventListener('click', function() { moveGoal(idx, dir); });
      } else if (action === 'toggleBoost') {
        el.addEventListener('click', function() { toggleBoost(idx); });
      } else if (action === 'editGoal') {
        el.addEventListener('click', function() { editGoal(idx); });
      } else if (action === 'deleteGoal') {
        el.addEventListener('click', function() { deleteGoal(idx); });
      }
    });

    // Animate ring fill when the card scrolls into view
    if (window.PFCMotion) {
      const ringFill = card.querySelector('.goal-ring-fill');
      window.PFCMotion.observe(card, () => {
        window.PFCMotion.goalRing(ringFill, pct, { autoColor: false, duration: 1100 });
      });
    }

    // Check milestones
    checkMilestone(g, pct, i);
  });
}

// ── BOOST ──
function toggleBoost(idx) {
  const el = document.getElementById('boost-' + idx);
  el.classList.toggle('open');
}

// G-P1-G fix (audit 2026-05-24) — debounce save() on boost slider input.
// Pre-fix every slider tick (≥10 fires/sec on drag) triggered a full
// PFCStorage.setJSON('goals', ...) which re-encrypts the entire goals
// payload. Visible jank on slower hardware + battery drain. Now: update
// UI immediately, persist via 250ms trailing debounce.
let _boostSaveTimer = null;
function updateBoost(idx, val, rem, baseAlloc) {
  val = parseInt(val) || 0;
  if (GOALS[idx]) GOALS[idx].boost = val;
  // Immediate visual feedback — no debounce on the display update.
  const total = baseAlloc + val;
  const months = total > 0 ? Math.ceil(rem / total) : null;
  const el = document.getElementById('boost-result-' + idx);
  if (el) el.textContent = val > 0
    ? '+' + USER.sym + val + '/mo → ' + (months ? months + ' months' : '—')
    : 'move slider to see impact';
  // Debounced persistence — only the final value after the user stops dragging.
  if (_boostSaveTimer) clearTimeout(_boostSaveTimer);
  _boostSaveTimer = setTimeout(() => { save(); _boostSaveTimer = null; }, 250);
}

// ── PRIORITY REORDER ──
function moveGoal(idx, dir) {
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= GOALS.length) return;
  [GOALS[idx], GOALS[newIdx]] = [GOALS[newIdx], GOALS[idx]];
  save();
  render();
  showToast(dir < 0 ? '↑ Priority increased' : '↓ Priority decreased');
}

// ── MILESTONES ──
// G-P1-A fix (audit 2026-05-24) — milestone celebrations persisted across
// page visits + keyed on g.id (not g.name). Pre-fix the in-memory Set
// fired on EVERY page load (annoying noise) AND keyed on g.name so a
// rename re-fired every milestone for the renamed goal. New behaviour:
// goals_celebrated = { goalId: highestBucketReached } in localStorage.
// Mirrors NW-P2-5 nw_celebrated_at pattern.
function _loadCelebrated() {
  try { return PFCStorage.getJSON('goals_celebrated') || {}; } catch(_) { return {}; }
}
function _saveCelebrated(map) {
  try { PFCStorage.setJSON('goals_celebrated', map); } catch(_) {}
}
function checkMilestone(g, pct, idx) {
  if (!g.id) return; // defensive — shouldn't happen post G-P0-1 backfill
  const map = _loadCelebrated();
  const alreadyAt = map[g.id] || 0;
  // Compute highest bucket newly reached (50 / 75 / 100)
  let bucket = 0;
  if (pct >= 100) bucket = 100;
  else if (pct >= 75) bucket = 75;
  else if (pct >= 50) bucket = 50;
  if (bucket === 0 || bucket <= alreadyAt) return; // not new
  // Use escaped name in text since showMilestone uses textContent (safe)
  // but defensive in case future refactor switches to innerHTML.
  const safeName = String(g.name || '').slice(0, 80);
  // G-P2-1 fix — brand SVGs replace emoji (consistent rendering across OS).
  // SVG strings are hardcoded literals so safe to .innerHTML in showMilestone.
  const ICON_COMPLETE = '<svg width="40" height="40" viewBox="0 0 40 40" fill="none"><circle cx="20" cy="20" r="17" stroke="currentColor" stroke-width="1.6"/><path d="M13 21l5 5 10-12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON_75 = '<svg width="40" height="40" viewBox="0 0 40 40" fill="none"><path d="M20 6c5 4 8 8 8 13a8 8 0 11-16 0c0-3 1-6 3-8 1 2 2 3 4 3-1-3 0-6 1-8z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  const ICON_50 = '<svg width="40" height="40" viewBox="0 0 40 40" fill="none"><path d="M22 4L10 22h8l-2 14 14-20h-8l2-12z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  if (bucket === 100) {
    showMilestone(ICON_COMPLETE, safeName + ' — Complete', 'You reached your goal.');
  } else if (bucket === 75) {
    showMilestone(ICON_75, '75% there!', 'Just ' + USER.sym + Math.round(g.target - g.current).toLocaleString() + ' left on ' + safeName + '.');
  } else {
    showMilestone(ICON_50, 'Halfway there!', safeName + ' is 50% funded. Keep going!');
  }
  map[g.id] = bucket;
  _saveCelebrated(map);
}
function showMilestone(iconSvg, title, sub) {
  // G-P2-1: iconSvg is a hardcoded SVG string from the call site (no user
  // data); innerHTML is safe here. title + sub still use textContent (safe).
  const f = document.getElementById('milestone-flash');
  document.getElementById('milestone-emoji').innerHTML = iconSvg;
  document.getElementById('milestone-title').textContent = title;
  document.getElementById('milestone-sub').textContent = sub;
  f.classList.add('show');
  setTimeout(() => f.classList.remove('show'), 3500);
}

// ── MODAL ──
// G-P1-C fix (audit 2026-05-24) — focus capture + restore for modal a11y.
let _modalPrevFocus = null;
function openAddGoal() {
  editingIdx = -1;
  _modalPrevFocus = document.activeElement;
  document.getElementById('modal-title').textContent = 'Add new goal';
  document.getElementById('m-name').value = '';
  document.getElementById('m-current').value = '';
  document.getElementById('m-target').value = '';
  document.getElementById('m-date').value = '';
  selectedCat = 'emergency';
  selectedColor = 'var(--money)';
  _syncCatA11y('emergency');
  document.querySelectorAll('.color-opt').forEach(o => o.classList.remove('selected'));
  const colEl = document.querySelector('[data-color="var(--money)"]');
  if (colEl) colEl.classList.add('selected');
  document.getElementById('modal-preview').classList.remove('show');
  updateSmartHint();
  document.getElementById('goal-modal').classList.add('open');
  // G-P1-C: initial focus into name input; modal Esc/backdrop wired below.
  setTimeout(() => { const n = document.getElementById('m-name'); if (n) n.focus(); }, 50);
}

function editGoal(idx) {
  editingIdx = idx;
  _modalPrevFocus = document.activeElement;
  const g = GOALS[idx];
  document.getElementById('modal-title').textContent = 'Edit goal';
  document.getElementById('m-name').value = g.name || '';
  document.getElementById('m-current').value = g.current || '';
  document.getElementById('m-target').value = g.target || '';
  document.getElementById('m-date').value = g.targetDate || '';
  selectedCat = g.category || 'custom';
  selectedColor = g.color || 'var(--money)';
  _syncCatA11y(selectedCat);
  document.querySelectorAll('.color-opt').forEach(o => o.classList.remove('selected'));
  const colEl = document.querySelector(`[data-color="${selectedColor}"]`);
  if (colEl) colEl.classList.add('selected');
  updateSmartHint();
  modalCalc();
  document.getElementById('goal-modal').classList.add('open');
  setTimeout(() => { const n = document.getElementById('m-name'); if (n) n.focus(); }, 50);
}

function closeModal() {
  document.getElementById('goal-modal').classList.remove('open');
  // G-P1-C: restore focus to whatever opened the modal (a11y polish).
  try { if (_modalPrevFocus && _modalPrevFocus.focus) _modalPrevFocus.focus(); } catch(_) {}
}

// G-P1-C: keep aria-checked + tabindex roving-focus state in sync with
// the visual `.selected` class on category radio cells.
function _syncCatA11y(cat) {
  document.querySelectorAll('.cat-opt').forEach(o => {
    const isSelected = o.dataset.cat === cat;
    o.classList.toggle('selected', isSelected);
    o.setAttribute('aria-checked', isSelected ? 'true' : 'false');
    o.setAttribute('tabindex', isSelected ? '0' : '-1');
  });
}

function selectCat(el) {
  selectedCat = el.dataset.cat;
  _syncCatA11y(selectedCat);
  // Auto-fill name if empty
  const nameEl = document.getElementById('m-name');
  if (!nameEl.value && CAT_DEFAULTS[selectedCat]?.name) {
    nameEl.value = CAT_DEFAULTS[selectedCat].name;
  }
  // Auto-fill emergency fund target
  if (selectedCat === 'emergency' && !document.getElementById('m-target').value) {
    const rec = Math.round(((USER.housing||0)+(USER.food||0)+(USER.transport||0)+(USER.otherExp||0)) * 6);
    if (rec > 0) document.getElementById('m-target').value = rec;
  }
  updateSmartHint();
  modalCalc();
}

function updateSmartHint() {
  const hint = CAT_DEFAULTS[selectedCat]?.hint;
  const hintEl = document.getElementById('smart-hint');
  if (hint) {
    const txt = hint({ sym: USER.sym||'$', housing: USER.housing||0, food: USER.food||0, transport: USER.transport||0, otherExp: USER.otherExp||0 });
    if (txt) { hintEl.textContent = '💡 ' + txt; hintEl.style.display = 'block'; return; }
  }
  hintEl.style.display = 'none';
}

function selectColor(el) {
  document.querySelectorAll('.color-opt').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  selectedColor = el.dataset.color;
}

function modalCalc() {
  const current = parseFloat(document.getElementById('m-current').value) || 0;
  const target  = parseFloat(document.getElementById('m-target').value) || 0;
  const dateVal = document.getElementById('m-date').value;
  if (!target) { document.getElementById('modal-preview').classList.remove('show'); return; }

  const pct = Math.min(100, Math.round(current / target * 100));
  const rem = Math.max(0, target - current);
  const surplus = USER.surplus || 0;
  const months = surplus > 0 ? Math.ceil(rem / surplus) : null;

  document.getElementById('modal-preview').classList.add('show');
  document.getElementById('prev-pct').textContent = pct + '% saved';
  document.getElementById('prev-pct').style.color = pct >= 50 ? 'var(--teal)' : pct >= 25 ? 'var(--amber)' : 'var(--text)';
  document.getElementById('prev-surplus').textContent = (USER.sym||'$') + Math.round(surplus).toLocaleString() + '/mo available';
  document.getElementById('prev-months').textContent = months ? months + ' months' : 'Add income data in dashboard';

  const dateRow = document.getElementById('prev-date-row');
  if (dateVal && surplus > 0) {
    // G-P0-7 fix — local-time parse so timezones don't shift the month diff.
    const targetDate = _localDateFromYM(dateVal);
    const diffMonths = _monthDiff(targetDate, new Date());
    if (diffMonths > 0) {
      const needed = Math.ceil(rem / diffMonths);
      document.getElementById('prev-date-needed').textContent = (USER.sym||'$') + needed.toLocaleString() + '/mo';
      document.getElementById('prev-date-needed').style.color = needed > surplus ? 'var(--red)' : 'var(--teal)';
      dateRow.style.display = 'flex';
    } else { dateRow.style.display = 'none'; }
  } else { dateRow.style.display = 'none'; }
}

function saveGoal() {
  const name    = document.getElementById('m-name').value.trim();
  const current = parseFloat(document.getElementById('m-current').value) || 0;
  const target  = parseFloat(document.getElementById('m-target').value);
  const dateVal = document.getElementById('m-date').value;

  // G-P1-B fix (audit 2026-05-24) — input validation hardening. Pre-fix
  // saveGoal accepted: empty whitespace-only name (passed .trim() check
  // because `name` was already trimmed, but emoji-only / zero-width chars
  // slipped through), negative current, target overflow (1e308 → all math
  // returns NaN), current > target (rendered as 100% but the diff math
  // would silently produce nonsense), past targetDate (renders "0 months
  // to go" then "—"). Each case now flashes the offending input.
  if (!name || name.length < 1) { flash('m-name'); return; }
  if (name.length > 80) { flash('m-name'); showToast('Goal name too long (80 chars max)'); return; }
  if (!target || target <= 0 || !Number.isFinite(target)) { flash('m-target'); return; }
  if (target > 999999999) { flash('m-target'); showToast('Target too large (max 999,999,999)'); return; }
  if (current < 0 || !Number.isFinite(current)) { flash('m-current'); showToast('Already-saved must be 0 or more'); return; }
  if (current > target) { flash('m-current'); showToast('Already-saved exceeds target — adjust target instead'); return; }
  if (dateVal) {
    const diffMonths = _monthDiff(_localDateFromYM(dateVal), new Date());
    if (diffMonths < 0) { flash('m-date'); showToast('Target date is in the past'); return; }
  }

  // Calculate monthlyNeeded from date if provided.
  // G-P0-7 fix — local-time parse via helpers (see file top).
  let monthlyNeeded = null;
  if (dateVal) {
    const diffMonths = _monthDiff(_localDateFromYM(dateVal), new Date());
    if (diffMonths > 0) monthlyNeeded = Math.ceil(Math.max(0, target - current) / diffMonths);
  }

  // G-P0-1 fix — spread-then-merge so any field this editor doesn't know
  // about (e.g. dashboard-side `id`, legacy onboarding `key`, future fields
  // added by a Sage AI or Pro feature) is preserved across edits. Pre-fix
  // this rebuilt the goal from scratch and only manually rescued `boost`,
  // silently destroying id, key, and any other field on every edit.
  const newFields = { name, current, target, color: selectedColor, category: selectedCat, targetDate: dateVal || null, monthlyNeeded };

  if (editingIdx >= 0) {
    GOALS[editingIdx] = { ...GOALS[editingIdx], ...newFields };
    // Ensure id exists (defense-in-depth Layer 1 — should already be set
    // by loader backfill, but cheap to re-confirm).
    if (!GOALS[editingIdx].id) {
      GOALS[editingIdx].id = 'g_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }
    showToast('Goal updated — ' + name);
  } else {
    // Mint id and default boost on new goals (Layer 1).
    GOALS.push({
      id: 'g_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
      ...newFields,
      boost: 0,
    });
    showToast('Goal added — ' + name);
  }
  save();
  render();
  closeModal();
}

async function deleteGoal(idx) {
  // G-P1-D fix — was window.confirm() which silently fails in iOS PWA.
  const name = GOALS[idx] ? GOALS[idx].name : '';
  const ok = await _pfcConfirm('Delete "' + name + '"? This cannot be undone.', 'Delete goal');
  if (!ok) return;
  GOALS.splice(idx, 1);
  save();
  render();
  showToast('Goal removed — ' + name);
}

function flash(id) {
  const el = document.getElementById(id);
  el.style.borderColor = 'rgba(224,82,82,.6)';
  setTimeout(() => el.style.borderColor = '', 1500);
}

// ── TOAST ──
// G-P2-12 fix (audit 2026-05-24) — replace-instead-of-append. Pre-fix
// each showToast() appended a fresh .toast div without removing prior
// ones, so rapid actions (e.g. delete 3 goals in quick succession)
// stacked toasts on top of each other. Now: remove any existing toast
// first so only the latest message is visible.
let _toastTimer = null;
function showToast(msg) {
  // Remove any in-flight toast + clear its hide-timer.
  document.querySelectorAll('.toast').forEach(t => t.remove());
  if (_toastTimer) { clearTimeout(_toastTimer); _toastTimer = null; }
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = '✓ ' + msg;
  document.body.appendChild(t);
  _toastTimer = setTimeout(() => {
    t.style.opacity = '0';
    t.style.transition = 'opacity .3s';
    setTimeout(() => t.remove(), 350);
    _toastTimer = null;
  }, 2800);
}

// G-P1-C fix (audit 2026-05-24) — global keyboard handlers for modal a11y:
// Escape closes; backdrop click closes; category radio-group arrow-key
// roving-focus (Right/Down → next, Left/Up → prev) with Space/Enter
// activation. Once-only setup at module init.
(function _wireModalKbdA11y() {
  document.addEventListener('keydown', function(e) {
    const modal = document.getElementById('goal-modal');
    if (!modal || !modal.classList.contains('open')) return;
    if (e.key === 'Escape') { closeModal(); return; }
    // Category radio-group keyboard nav (only when focus inside cat-grid)
    if (e.target && e.target.classList && e.target.classList.contains('cat-opt')) {
      const opts = Array.from(document.querySelectorAll('.cat-opt'));
      const cur = opts.indexOf(e.target);
      if (cur < 0) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const next = opts[(cur + 1) % opts.length];
        selectCat(next); next.focus();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = opts[(cur - 1 + opts.length) % opts.length];
        selectCat(prev); prev.focus();
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        selectCat(e.target);
      }
    }
  });
  // Backdrop click — closes when target is the overlay itself (not the box)
  document.addEventListener('click', function(e) {
    const modal = document.getElementById('goal-modal');
    if (!modal || !modal.classList.contains('open')) return;
    if (e.target === modal) closeModal();
  });
})();

// ── INIT ──
load();

// ── AUTH-AWARE RE-HYDRATION ──
// load() ran synchronously before PFCAuth resolved the real userId — so USER/
// GOALS may reflect pfc:guest:* (often empty). Once auth resolves and pfc-
// storage.js finishes adoptGuestData, re-read from the now-correct namespace.
function _rehydrateFromStorage() {
  load();
}
if (typeof PFCAuth !== 'undefined') {
  PFCAuth.onReady(() => {
    let freshUser = {}, freshGoals = [];
    try { freshUser = (typeof PFCUser !== 'undefined') ? PFCUser.get() : (PFCStorage.getJSON('user') || {}); } catch(e) {}
    try { freshGoals = PFCStorage.getJSON('goals') || []; } catch(e) {}
    if (JSON.stringify(freshGoals) !== JSON.stringify(GOALS) ||
        (freshUser.currency || '$') !== (USER.sym || '$') ||
        JSON.stringify(freshUser.income) !== JSON.stringify(USER.income)) {
      _rehydrateFromStorage();
    }
  });
  PFCAuth.onAuthChange(_rehydrateFromStorage);
}
