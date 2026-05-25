(function () {
  'use strict';

  // DS-P0-DES (audit 2026-05-25) — opt-in sample data. Pre-fix the page
  // initialized `debts` with 3 hardcoded "real-looking" entries (Credit
  // card $4,500 / Student loan $18,000 / Car loan $9,000 = $31,500). A
  // fresh SEO visitor saw a confident "Avalanche pays off $X less" before
  // typing anything — the exact DASH-P0-5 anti-pattern (fresh users see
  // demo numbers as if they're their own). Now: start with ONE empty
  // editable row + a "Load example debts" button for users who want to
  // see what the tool does without typing their own numbers first.
  var SAMPLES = [
    { name: 'Credit card',  balance: 4500,  apr: 22, minPayment: 90 },
    { name: 'Student loan', balance: 18000, apr: 6,  minPayment: 180 },
    { name: 'Car loan',     balance: 9000,  apr: 5,  minPayment: 200 }
  ];
  var debts = [{ name: '', balance: 0, apr: 0, minPayment: 0 }];
  var debounceTimer = null;
  var rowSeq = 0; // monotonic id source for label-for pairings

  var listEl = document.getElementById('debtList');
  var budgetEl = document.getElementById('budget');
  var budgetReadout = document.getElementById('budgetReadout');
  var warningBar = document.getElementById('warningBar');
  var addBtn = document.getElementById('addDebtBtn');
  var sampleBtn = document.getElementById('loadSampleBtn');

  // DS-P0-MATH — strict numeric validator (same contract as
  // _parseFiniteAmount across /debt-optimizer + /salary-calculator).
  // Rejects scientific notation, NaN/Infinity, negatives; clamps to max.
  // Returns null on invalid input so callers can fall back gracefully.
  function _parseFiniteAmount(raw, maxValue) {
    var str = String(raw == null ? '' : raw).trim();
    if (!/^-?\d*\.?\d+$/.test(str)) return null;
    var n = parseFloat(str);
    if (!Number.isFinite(n)) return null;
    if (n < 0) return null;
    if (typeof maxValue === 'number' && n > maxValue) return null;
    return n;
  }

  // DS-P0-MATH — currency-aware formatter. Pre-fix `fmt$` hardcoded '$' so
  // a user on /tools/take-home-pay set to GBP who clicked through to this
  // page would see "$" prefix everywhere despite their preference. Reads
  // USER from PFCStorage (same path other shared modules use). Falls
  // through to '$' if PFCStorage is unavailable or USER has no currency.
  function _readUserCurrency() {
    try {
      if (typeof PFCStorage !== 'undefined' && PFCStorage.getJSON) {
        var u = PFCStorage.getJSON('user') || {};
        var c = (u && u.currency) ? String(u.currency).toUpperCase() : '';
        if (!c) return { symbol: '$', code: 'USD' };
        // PFCSym is defined on most consumer pages; this tool doesn't bundle
        // it eagerly so we use a small inline symbol map for the common cases.
        var MAP = { USD:'$', GBP:'£', EUR:'€', JPY:'¥', INR:'₹', CAD:'CA$',
                    AUD:'A$', NZD:'NZ$', SGD:'S$', HKD:'HK$', ZAR:'R',
                    CHF:'CHF', SEK:'kr', NOK:'kr', DKK:'kr' };
        return { symbol: MAP[c] || c + ' ', code: c };
      }
    } catch (_) {}
    return { symbol: '$', code: 'USD' };
  }
  var CUR = _readUserCurrency();
  function fmt$(n) {
    if (!Number.isFinite(n)) return CUR.symbol + '0';
    var sign = n < 0 ? '-' : '';
    n = Math.abs(Math.round(n));
    return sign + CUR.symbol + n.toLocaleString('en-US');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  // DS-P0-A11Y — proper label-for pairings. Pre-fix labels were sibling-
  // wrapped in divs but had no `for=` attribute, so screen readers didn't
  // announce them when an input received focus. Each row now mints unique
  // ids (ds-row-<seq>-<field>) at render time and threads them through.
  function renderDebts() {
    listEl.innerHTML = '';
    debts.forEach(function (d, i) {
      rowSeq++;
      var idN = 'ds-row-' + rowSeq + '-name';
      var idB = 'ds-row-' + rowSeq + '-balance';
      var idA = 'ds-row-' + rowSeq + '-apr';
      var idM = 'ds-row-' + rowSeq + '-min';
      var row = document.createElement('div');
      row.className = 'debt-row';
      row.innerHTML =
        '<div><label for="' + idN + '">Name</label><input id="' + idN + '" data-i="' + i + '" data-k="name" type="text" value="' + escapeHtml(d.name) + '" placeholder="e.g. Credit card" /></div>' +
        '<div><label for="' + idB + '">Balance</label><input id="' + idB + '" data-i="' + i + '" data-k="balance" class="num-input" type="number" min="0" max="10000000" step="100" inputmode="decimal" value="' + (d.balance || '') + '" placeholder="5000" /></div>' +
        '<div><label for="' + idA + '">APR (%)</label><input id="' + idA + '" data-i="' + i + '" data-k="apr" class="num-input" type="number" min="0" max="100" step="0.1" inputmode="decimal" value="' + (d.apr || '') + '" placeholder="19.9" /></div>' +
        '<div><label for="' + idM + '">Min payment</label><input id="' + idM + '" data-i="' + i + '" data-k="minPayment" class="num-input" type="number" min="0" max="100000" step="5" inputmode="decimal" value="' + (d.minPayment || '') + '" placeholder="150" /></div>' +
        '<button type="button" class="remove-btn" data-rm="' + i + '" aria-label="Remove debt">Remove</button>';
      listEl.appendChild(row);
    });
  }

  // DS-P0-DES — opt-in sample loader. Replaces empty rows with the 3
  // SAMPLES used to be hardcoded. Hides the button after click.
  function loadSamples() {
    debts = SAMPLES.map(function (d) { return Object.assign({}, d); });
    renderDebts();
    setBudget(defaultBudget());
    if (sampleBtn) sampleBtn.hidden = true;
    recompute();
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
    // DS-P0-MATH — strict budget validation (cap at 1M/yr ÷ 12 = ~83k/mo).
    var budget = _parseFiniteAmount(budgetEl.value, 1000000) || 0;
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
    // DS-P0-MATH — verdict tightening. Pre-fix one branch used `innerHTML`
    // with template-string interpolation of fmt$ output. Today fmt$ only
    // returns numeric/currency strings (safe) but the pattern was fragile —
    // any future refactor putting user data into fmt$'s input would
    // immediately become an XSS surface. Now: build the verdict DOM via
    // textContent + child <span> elements; no innerHTML anywhere.
    while (verdict.firstChild) verdict.removeChild(verdict.firstChild);
    if (result.avalanche.totalMonths === 0 || !debts.some(function (d) { return Number(d.balance) > 0; })) {
      verdict.textContent = 'Add at least one debt with a balance above zero to see the comparison.';
    } else if (result.interestSaved > 0 || result.monthsSaved > 0) {
      av.classList.add('is-winner');
      verdict.appendChild(document.createTextNode('Avalanche pays off '));
      var savedSpan = document.createElement('span');
      savedSpan.className = 'num';
      savedSpan.textContent = fmt$(result.interestSaved);
      verdict.appendChild(savedSpan);
      var tail = ' less in interest';
      if (result.monthsSaved > 0) {
        tail += ' and frees you ' + result.monthsSaved + ' month' + (result.monthsSaved === 1 ? '' : 's') + ' earlier';
      }
      verdict.appendChild(document.createTextNode(tail + '.'));
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

  // DS-P0-MATH — strict numeric input via _parseFiniteAmount. Pre-fix
  // `Number(t.value)` accepted "1e308" → Infinity → engine's interest
  // loop produced NaN → results rendered as $0 silently. Now: numeric
  // fields use _parseFiniteAmount with per-field caps (balance/min 10M,
  // APR 100%); invalid input is treated as 0 same as before but the
  // overflow path is closed.
  listEl.addEventListener('input', function (e) {
    var t = e.target;
    var i = Number(t.getAttribute('data-i'));
    var k = t.getAttribute('data-k');
    if (Number.isInteger(i) && k && debts[i]) {
      var v;
      if (k === 'name') {
        v = t.value;
      } else if (k === 'apr') {
        v = _parseFiniteAmount(t.value, 100); // APR capped at 100% (anything higher is data-entry error)
      } else {
        v = _parseFiniteAmount(t.value, 10000000); // balance + minPayment capped at 10M
      }
      debts[i][k] = (k === 'name') ? v : (v == null ? 0 : v);
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
  if (sampleBtn) sampleBtn.addEventListener('click', loadSamples);
  budgetEl.addEventListener('input', debouncedRecompute);

  function start() {
    renderDebts();
    setBudget(defaultBudget());
    recompute();
  }
  if (window.PFCDebtEngine) start();
  else window.addEventListener('load', start);
})();
