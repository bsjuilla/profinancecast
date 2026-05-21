(function () {
  'use strict';

  var SAMPLES = [
    { name: 'Credit card',  balance: 4500,  apr: 22, minPayment: 90 },
    { name: 'Student loan', balance: 18000, apr: 6,  minPayment: 180 },
    { name: 'Car loan',     balance: 9000,  apr: 5,  minPayment: 200 }
  ];
  var debts = SAMPLES.map(function (d) { return Object.assign({}, d); });
  var debounceTimer = null;

  var listEl = document.getElementById('debtList');
  var budgetEl = document.getElementById('budget');
  var budgetReadout = document.getElementById('budgetReadout');
  var warningBar = document.getElementById('warningBar');
  var addBtn = document.getElementById('addDebtBtn');

  function fmt$(n) {
    if (!Number.isFinite(n)) return '$0';
    var sign = n < 0 ? '-' : '';
    n = Math.abs(Math.round(n));
    return sign + '$' + n.toLocaleString('en-US');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function renderDebts() {
    listEl.innerHTML = '';
    debts.forEach(function (d, i) {
      var row = document.createElement('div');
      row.className = 'debt-row';
      row.innerHTML =
        '<div><label>Name</label><input data-i="' + i + '" data-k="name" type="text" value="' + escapeHtml(d.name) + '" /></div>' +
        '<div><label>Balance</label><input data-i="' + i + '" data-k="balance" class="num-input" type="number" min="0" step="100" inputmode="decimal" value="' + d.balance + '" /></div>' +
        '<div><label>APR (%)</label><input data-i="' + i + '" data-k="apr" class="num-input" type="number" min="0" step="0.1" inputmode="decimal" value="' + d.apr + '" /></div>' +
        '<div><label>Min payment</label><input data-i="' + i + '" data-k="minPayment" class="num-input" type="number" min="0" step="5" inputmode="decimal" value="' + d.minPayment + '" /></div>' +
        '<button type="button" class="remove-btn" data-rm="' + i + '" aria-label="Remove debt">Remove</button>';
      listEl.appendChild(row);
    });
  }

  function defaultBudget() {
    var sumMins = debts.reduce(function (s, d) { return s + (Number(d.minPayment) || 0); }, 0);
    return Math.max(0, Math.round(sumMins + 200));
  }

  function setBudget(val) {
    budgetEl.value = val;
    budgetReadout.textContent = fmt$(val);
  }

  function addDebt() {
    debts.push({ name: 'Debt ' + (debts.length + 1), balance: 1000, apr: 10, minPayment: 25 });
    renderDebts();
    setBudget(defaultBudget());
    recompute();
  }

  function removeDebt(i) {
    debts.splice(i, 1);
    if (!debts.length) debts.push({ name: 'Debt 1', balance: 0, apr: 0, minPayment: 0 });
    renderDebts();
    setBudget(defaultBudget());
    recompute();
  }

  function recompute() {
    if (typeof window.PFCDebtEngine === 'undefined') return;
    var budget = Number(budgetEl.value) || 0;
    budgetReadout.textContent = fmt$(budget);
    var result = window.PFCDebtEngine.compare(debts, budget);

    if (result.warning) {
      warningBar.hidden = false;
      warningBar.textContent = result.warning;
    } else {
      warningBar.hidden = true;
      warningBar.textContent = '';
    }

    paintCard('av', result.avalanche);
    paintCard('sn', result.snowball);

    var av = document.getElementById('cardAvalanche');
    var sn = document.getElementById('cardSnowball');
    av.classList.remove('is-winner');
    sn.classList.remove('is-winner');
    var verdict = document.getElementById('verdict');
    if (result.avalanche.totalMonths === 0 || !debts.some(function (d) { return d.balance > 0; })) {
      verdict.textContent = 'Add at least one debt with a balance above zero to see the comparison.';
    } else if (result.interestSaved > 0 || result.monthsSaved > 0) {
      av.classList.add('is-winner');
      var months = result.monthsSaved;
      var monthFrag = months > 0 ? ' and frees you ' + months + ' month' + (months === 1 ? '' : 's') + ' earlier' : '';
      verdict.innerHTML = 'Avalanche pays off <span class="num">' + fmt$(result.interestSaved) + '</span> less in interest' + monthFrag + '.';
    } else if (result.avalanche.totalMonths === result.snowball.totalMonths && result.avalanche.totalInterest === result.snowball.totalInterest) {
      verdict.textContent = 'With this mix of debts, the two strategies finish in a dead heat.';
    } else {
      verdict.textContent = 'The two strategies are nearly identical for this mix — pick the one you find easier to stick with.';
    }
  }

  function paintCard(prefix, sim) {
    document.getElementById(prefix + 'Months').textContent = sim.totalMonths || '—';
    document.getElementById(prefix + 'Interest').textContent = fmt$(sim.totalInterest);
    document.getElementById(prefix + 'Paid').textContent = fmt$(sim.totalPaid);
    document.getElementById(prefix + 'Monthly').textContent = fmt$(sim.monthlyPayment) + '/mo';

    var d = new Date();
    if (sim.totalMonths > 0) {
      d.setMonth(d.getMonth() + sim.totalMonths);
      document.getElementById(prefix + 'Date').textContent = 'Debt-free by ' + d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } else {
      document.getElementById(prefix + 'Date').textContent = 'Add debts to project a payoff date.';
    }

    drawCurve(document.getElementById(prefix + 'Curve'), sim.monthlyTimeline);
  }

  function drawCurve(svg, timeline) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (!timeline || timeline.length < 2) return;
    var W = 240, H = 60, PAD = 4;
    var maxBal = 0;
    timeline.forEach(function (t) { if (t.totalRemaining > maxBal) maxBal = t.totalRemaining; });
    if (maxBal <= 0) return;
    var n = timeline.length;
    var pts = timeline.map(function (t, i) {
      var x = PAD + (W - 2 * PAD) * (i / (n - 1));
      var y = PAD + (H - 2 * PAD) * (1 - (t.totalRemaining / maxBal));
      return [x, y];
    });
    var d = pts.map(function (p, i) { return (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');
    var area = d + ' L' + pts[pts.length - 1][0].toFixed(1) + ',' + (H - PAD) + ' L' + pts[0][0].toFixed(1) + ',' + (H - PAD) + ' Z';

    var areaEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    areaEl.setAttribute('d', area);
    areaEl.setAttribute('fill', 'rgba(43,182,125,0.10)');
    svg.appendChild(areaEl);

    var line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.setAttribute('d', d);
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', '#2BB67D');
    line.setAttribute('stroke-width', '1.5');
    line.setAttribute('stroke-linejoin', 'round');
    line.setAttribute('stroke-linecap', 'round');
    svg.appendChild(line);

    if (window.PFCMotion && typeof window.PFCMotion.tween === 'function') {
      var len = line.getTotalLength();
      line.style.strokeDasharray = len;
      line.style.strokeDashoffset = len;
      window.PFCMotion.tween(700, window.PFCMotion.ease.out, function (k) {
        line.style.strokeDashoffset = String(len * (1 - k));
      });
    }
  }

  function debouncedRecompute() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(recompute, 250);
  }

  listEl.addEventListener('input', function (e) {
    var t = e.target;
    var i = Number(t.getAttribute('data-i'));
    var k = t.getAttribute('data-k');
    if (Number.isInteger(i) && k && debts[i]) {
      var v = (k === 'name') ? t.value : Number(t.value);
      debts[i][k] = (k === 'name') ? v : (Number.isFinite(v) ? v : 0);
      debouncedRecompute();
    }
  });
  listEl.addEventListener('click', function (e) {
    var t = e.target;
    if (t.matches('button[data-rm]')) {
      removeDebt(Number(t.getAttribute('data-rm')));
    }
  });
  addBtn.addEventListener('click', addDebt);
  budgetEl.addEventListener('input', debouncedRecompute);

  function start() {
    renderDebts();
    setBudget(defaultBudget());
    recompute();
  }
  if (window.PFCDebtEngine) start();
  else window.addEventListener('load', start);
})();
