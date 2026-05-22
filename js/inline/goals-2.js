// ── DATA ──
let USER = {};
let GOALS = [];
let editingIdx = -1;
let selectedCat = 'emergency';
let selectedColor = 'var(--money)';

const GOAL_COLORS = ['var(--money)','#3B82F6','#F5A623','#A78BFA','#E05252','#22C55E'];
const PALETTE = ['var(--money)','#3B82F6','#F5A623','#A78BFA','#E05252','#22C55E','#F97316','#EC4899'];

// HTML-escape helper. Used to wrap user-controlled strings (goal names)
// before they get interpolated into innerHTML template literals. Without
// this, a goal name like '<img src=x onerror=alert(1)>' would execute as
// script in the legend renderer.
function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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

const CAT_ICONS = {
  emergency:'🛡️', home:'🏠', car:'🚗', travel:'✈️',
  invest:'📈', retire:'🌅', education:'🎓', wedding:'💍', custom:'⭐'
};

// ── LOAD ──
function load() {
  try { USER = (typeof PFCUser !== 'undefined') ? PFCUser.get() : (PFCStorage.getJSON('user') || {}); } catch(e) { USER = {}; }
  try { GOALS = PFCStorage.getJSON('goals') || []; } catch(e) { GOALS = []; }

  // Compute surplus
  USER.surplus = Math.max(0,
    ((USER.income||0) + (USER.otherIncome||0)) -
    ((USER.housing||0) + (USER.food||0) + (USER.transport||0) + (USER.otherExp||0) + (USER.debtPay||0))
  );
  USER.sym = window.PFCSym ? PFCSym(USER.currency) : (USER.currency || '$');

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

  if (!GOALS.length) {
    empty.classList.add('show');
    allocWrap.style.display = 'none';
    document.getElementById('s-needed').textContent = sym + '0';
    document.getElementById('conflict-banner').classList.remove('show');
    return;
  }
  empty.classList.remove('show');

  // Allocate surplus across goals by priority
  let remainingSurplus = USER.surplus || 0;
  const allocations = GOALS.map((g, i) => {
    const rem = Math.max(0, (g.target||0) - (g.current||0));
    const needed = g.monthlyNeeded || Math.ceil(rem / 24); // default 24 months if no date
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
    document.getElementById('conflict-text').innerHTML =
      `<strong>Goal conflict detected</strong> — your goals need ${sym}${shortfall.toLocaleString()}/mo more than your current surplus. Upgrade to Pro to see the optimal reallocation plan.`;
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
    const color = g.color || PALETTE[i % PALETTE.length];
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
    const color = g.color || PALETTE[i % PALETTE.length];
    const rem = Math.max(0, (g.target||0) - (g.current||0));
    const months = alloc.allocated > 0 ? Math.ceil(rem / alloc.allocated) : null;
    const monthsWithBoost = g.boost > 0 ? Math.ceil(rem / (alloc.allocated + g.boost)) : null;

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
    card.innerHTML = `
      <div class="goal-card-top">
        <div class="goal-ring-wrap">
          <svg width="80" height="80" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="${ringR}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="8"/>
            <circle class="goal-ring-fill" cx="40" cy="40" r="${ringR}" fill="none" stroke="${color}" stroke-width="8"
              stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${circ.toFixed(1)}"
              stroke-linecap="round" transform="rotate(-90 40 40)"/>
            <text x="40" y="37" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="15" font-weight="800" fill="#F0F4F8">${pct}%</text>
            <text x="40" y="51" text-anchor="middle" font-family="Inter,sans-serif" font-size="9" fill="#4A5A6E">${icon}</text>
          </svg>
        </div>
        <div class="goal-info">
          <div class="goal-name" title="${escHtml(g.name)}">${escHtml(g.name)}</div>
          <div class="goal-amounts">${USER.sym}${Math.round(g.current||0).toLocaleString()} of ${USER.sym}${Math.round(g.target||0).toLocaleString()}</div>
          <div class="goal-status-badge ${statusClass}">${statusLabel}</div>
        </div>
        <div class="priority-badge" title="Priority ${i+1}">${i + 1}</div>
      </div>

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
            <span class="boost-result" id="boost-result-${i}">${g.boost > 0 ? `+${USER.sym}${g.boost}/mo → ${monthsWithBoost} months` : 'move slider to see impact'}</span>
          </div>
          <input type="range" class="boost-track" min="0" max="${Math.max(200, Math.round(USER.surplus||200))}" step="10" value="${g.boost||0}"
            oninput="updateBoost(${i}, this.value, ${rem}, ${alloc.allocated})">
        </div>

        <div class="goal-actions">
          <button class="goal-action-btn boost-btn" onclick="toggleBoost(${i})">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5l4.5-4.5 4.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            Boost
          </button>
          <button class="goal-action-btn" onclick="editGoal(${i})">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M7.5 1.5l2 2L3 10l-2.5.5.5-2.5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
            Edit
          </button>
          ${i > 0 ? `<button class="goal-action-btn" onclick="moveGoal(${i},-1)" title="Increase priority">↑</button>` : ''}
          ${i < GOALS.length-1 ? `<button class="goal-action-btn" onclick="moveGoal(${i},1)" title="Decrease priority">↓</button>` : ''}
          <button class="goal-action-btn delete-btn" onclick="deleteGoal(${i})">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M1 2.5h9M3.5 2.5V2a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v.5M7.5 4.5v4M5.5 4.5v4M3.5 4.5v4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
            Delete
          </button>
        </div>
      </div>

      ${completed ? '<div class="completed-strip">Goal reached. Add funds or set a new target.</div>' : ''}
    `;

    grid.appendChild(card);

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

function updateBoost(idx, val, rem, baseAlloc) {
  val = parseInt(val) || 0;
  GOALS[idx].boost = val;
  save();
  const total = baseAlloc + val;
  const months = total > 0 ? Math.ceil(rem / total) : null;
  document.getElementById('boost-result-' + idx).textContent =
    val > 0
      ? `+${USER.sym}${val}/mo → ${months ? months + ' months' : '—'}`
      : 'move slider to see impact';
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
const shownMilestones = new Set();
function checkMilestone(g, pct, idx) {
  const key = g.name + '-' + Math.floor(pct / 25) * 25;
  if (shownMilestones.has(key)) return;
  if (pct >= 100 && !shownMilestones.has(g.name + '-100')) {
    shownMilestones.add(g.name + '-100');
    showMilestone('★', g.name + ' — Complete', 'You reached your goal.');
  } else if (pct >= 75 && pct < 100 && !shownMilestones.has(g.name + '-75')) {
    shownMilestones.add(g.name + '-75');
    showMilestone('🔥', '75% there!', `Just ${USER.sym}${Math.round((g.target - g.current)).toLocaleString()} left on ${g.name}.`);
  } else if (pct >= 50 && pct < 75 && !shownMilestones.has(g.name + '-50')) {
    shownMilestones.add(g.name + '-50');
    showMilestone('⚡', 'Halfway there!', `${g.name} is 50% funded. Keep going!`);
  }
}
function showMilestone(emoji, title, sub) {
  const f = document.getElementById('milestone-flash');
  document.getElementById('milestone-emoji').textContent = emoji;
  document.getElementById('milestone-title').textContent = title;
  document.getElementById('milestone-sub').textContent = sub;
  f.classList.add('show');
  setTimeout(() => f.classList.remove('show'), 3500);
}

// ── MODAL ──
function openAddGoal() {
  editingIdx = -1;
  document.getElementById('modal-title').textContent = 'Add new goal';
  document.getElementById('m-name').value = '';
  document.getElementById('m-current').value = '';
  document.getElementById('m-target').value = '';
  document.getElementById('m-date').value = '';
  selectedCat = 'emergency';
  selectedColor = 'var(--money)';
  document.querySelectorAll('.cat-opt').forEach(o => o.classList.remove('selected'));
  document.querySelector('[data-cat="emergency"]').classList.add('selected');
  document.querySelectorAll('.color-opt').forEach(o => o.classList.remove('selected'));
  document.querySelector('[data-color="var(--money)"]').classList.add('selected');
  document.getElementById('modal-preview').classList.remove('show');
  updateSmartHint();
  document.getElementById('goal-modal').classList.add('open');
}

function editGoal(idx) {
  editingIdx = idx;
  const g = GOALS[idx];
  document.getElementById('modal-title').textContent = 'Edit goal';
  document.getElementById('m-name').value = g.name || '';
  document.getElementById('m-current').value = g.current || '';
  document.getElementById('m-target').value = g.target || '';
  document.getElementById('m-date').value = g.targetDate || '';
  selectedCat = g.category || 'custom';
  selectedColor = g.color || 'var(--money)';
  document.querySelectorAll('.cat-opt').forEach(o => o.classList.remove('selected'));
  const catEl = document.querySelector(`[data-cat="${selectedCat}"]`);
  if (catEl) catEl.classList.add('selected');
  document.querySelectorAll('.color-opt').forEach(o => o.classList.remove('selected'));
  const colEl = document.querySelector(`[data-color="${selectedColor}"]`);
  if (colEl) colEl.classList.add('selected');
  updateSmartHint();
  modalCalc();
  document.getElementById('goal-modal').classList.add('open');
}

function closeModal() {
  document.getElementById('goal-modal').classList.remove('open');
}

function selectCat(el) {
  document.querySelectorAll('.cat-opt').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  selectedCat = el.dataset.cat;
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
    const targetDate = new Date(dateVal + '-01');
    const now = new Date();
    const diffMonths = (targetDate.getFullYear() - now.getFullYear()) * 12 + (targetDate.getMonth() - now.getMonth());
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

  if (!name) { flash('m-name'); return; }
  if (!target || target <= 0) { flash('m-target'); return; }

  // Calculate monthlyNeeded from date if provided
  let monthlyNeeded = null;
  if (dateVal) {
    const targetDate = new Date(dateVal + '-01');
    const now = new Date();
    const diffMonths = (targetDate.getFullYear() - now.getFullYear()) * 12 + (targetDate.getMonth() - now.getMonth());
    if (diffMonths > 0) monthlyNeeded = Math.ceil(Math.max(0, target - current) / diffMonths);
  }

  const goal = { name, current, target, color: selectedColor, category: selectedCat, targetDate: dateVal || null, monthlyNeeded, boost: 0 };

  if (editingIdx >= 0) {
    goal.boost = GOALS[editingIdx].boost || 0;
    GOALS[editingIdx] = goal;
    showToast('Goal updated — ' + name);
  } else {
    GOALS.push(goal);
    showToast('Goal added — ' + name);
  }
  save();
  render();
  closeModal();
}

function deleteGoal(idx) {
  if (!confirm(`Delete "${GOALS[idx].name}"?`)) return;
  const name = GOALS[idx].name;
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
function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = '✓ ' + msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 2800);
  setTimeout(() => t.remove(), 3200);
}

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
