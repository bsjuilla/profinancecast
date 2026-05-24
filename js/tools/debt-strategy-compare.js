// js/tools/debt-strategy-compare.js — debt snowball vs avalanche comparator.
// Reads country params from window.PFC_TOOLS_COUNTRY (set via <body data-pfc-country="…">).
// Debounce: 250ms (heavier compute than compound-interest).
// Chart lives under window._pfcCharts.ds.
//
// ─────────────────────────────────────────────────────────────────────────────
// CROSS-TOOL DRIFT WARNING (D-WORTH-2 CEO call 2026-05-24)
// ─────────────────────────────────────────────────────────────────────────────
// `js/inline/debt-optimizer-2.js` hosts a PARALLEL engine for the same
// problem with DIFFERENT field names:
//   - This file (/tools page): `apr`, `minimum`
//   - debt-optimizer-2.js (logged-in page): `rate`, `minPay`
// This is INTENTIONAL: this /tools page is the unauth SEO funnel (no save,
// no Pro features, lighter scope); the logged-in /debt-optimizer is the
// deep persistent tool. Do NOT consolidate without explicit operator
// approval — this surface is Google-indexed and any URL or field rename
// hits search rankings. Mirror block lives at the top of
// `js/inline/debt-optimizer-2.js`.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  var T = window.PFCTools;
  var fmtCurrency = T.fmtCurrency;
  var payoffSimulate = T.payoffSimulate;
  var makeLineChart = T.makeLineChart;
  var updateChartData = T.updateChartData;
  var runSelfTests = T.runSelfTests;
  var debounce = T.debounce;
  var country = T.country;

  var MAX_ROWS = 8;
  var rowCount = 0;

  // ── Row management ──────────────────────────────────────────────────────

  function createDebtRow(balance, apr, minimum) {
    rowCount++;
    var id = rowCount;
    var row = document.createElement('div');
    row.className = 'ds-debt-row';
    row.dataset.rowId = id;
    row.innerHTML =
      '<div class="ds-row-inputs">' +
        '<div class="pfc-field">' +
          '<label for="ds-bal-' + id + '">Balance</label>' +
          '<div class="with-symbol"><span class="sym">' + country.symbol + '</span>' +
          '<input id="ds-bal-' + id + '" type="number" min="0" step="100" value="' + balance + '" aria-label="Debt balance"></div>' +
        '</div>' +
        '<div class="pfc-field">' +
          '<label for="ds-apr-' + id + '">APR %</label>' +
          '<input id="ds-apr-' + id + '" type="number" min="0" max="100" step="0.1" value="' + apr + '" aria-label="Annual interest rate">' +
        '</div>' +
        '<div class="pfc-field">' +
          '<label for="ds-min-' + id + '">Min payment</label>' +
          '<div class="with-symbol"><span class="sym">' + country.symbol + '</span>' +
          '<input id="ds-min-' + id + '" type="number" min="0" step="5" value="' + minimum + '" aria-label="Minimum monthly payment"></div>' +
        '</div>' +
        '<button type="button" class="ds-remove-row" aria-label="Remove this debt" data-row-id="' + id + '">&#x2715;</button>' +
      '</div>';
    return row;
  }

  function addRow(balance, apr, minimum) {
    var container = document.getElementById('ds-debt-rows');
    if (!container) return;
    var rows = container.querySelectorAll('.ds-debt-row');
    if (rows.length >= MAX_ROWS) return;
    var row = createDebtRow(balance || 0, apr || country.typicalCardAPR || 22, minimum || 50);
    container.appendChild(row);
    row.querySelectorAll('input').forEach(function (inp) {
      inp.addEventListener('input', debouncedCompute);
    });
    row.querySelector('.ds-remove-row').addEventListener('click', function () {
      removeRow(row);
    });
    updateAddButton();
    debouncedCompute();
  }

  function removeRow(row) {
    var container = document.getElementById('ds-debt-rows');
    if (!container) return;
    var rows = container.querySelectorAll('.ds-debt-row');
    if (rows.length <= 1) return; // keep at least one
    container.removeChild(row);
    updateAddButton();
    debouncedCompute();
  }

  function updateAddButton() {
    var container = document.getElementById('ds-debt-rows');
    var btn = document.getElementById('ds-add-row');
    if (!container || !btn) return;
    var rows = container.querySelectorAll('.ds-debt-row');
    btn.disabled = rows.length >= MAX_ROWS;
    btn.textContent = rows.length >= MAX_ROWS ? '+ Add debt (max 8)' : '+ Add debt';
  }

  function readDebts() {
    var container = document.getElementById('ds-debt-rows');
    if (!container) return [];
    var debts = [];
    container.querySelectorAll('.ds-debt-row').forEach(function (row) {
      var id = row.dataset.rowId;
      var balance = +document.getElementById('ds-bal-' + id).value || 0;
      var apr = +document.getElementById('ds-apr-' + id).value || 0;
      var minimum = +document.getElementById('ds-min-' + id).value || 0;
      if (balance > 0) {
        debts.push({ balance: balance, apr: apr, minimum: minimum });
      }
    });
    return debts;
  }

  // ── Compute & render ────────────────────────────────────────────────────

  function compute() {
    var budget = +document.getElementById('ds-budget').value || 0;
    var debts = readDebts();

    if (debts.length === 0) {
      clearOutputs();
      return;
    }

    var avalanche = payoffSimulate(debts, budget, 'avalanche');
    var snowball = payoffSimulate(debts, budget, 'snowball');

    renderResults(avalanche, snowball, budget, debts);
  }

  function clearOutputs() {
    setText('ds-avalanche-months', '—');
    setText('ds-avalanche-interest', '—');
    setText('ds-snowball-months', '—');
    setText('ds-snowball-interest', '—');
    setText('ds-savings', '—');
    var verdict = document.getElementById('ds-verdict');
    if (verdict) { verdict.textContent = ''; verdict.className = 'pfc-verdict'; }
  }

  function renderResults(avalanche, snowball, budget, debts) {
    var verdict = document.getElementById('ds-verdict');

    // Infeasible: budget below minimums
    if (avalanche.infeasible && avalanche.reason === 'budget_below_minimums') {
      clearOutputs();
      if (verdict) {
        var totalMinimums = avalanche.totalMinimums;
        var shortfall = avalanche.shortfall;
        verdict.className = 'pfc-verdict warn';
        verdict.textContent =
          'Your budget of ' + fmtCurrency(budget) +
          ' is below the sum of minimum payments (' + fmtCurrency(totalMinimums) + '). ' +
          'You\'re short ' + fmtCurrency(shortfall) + '/month — ' +
          'payments cannot cover even the minimums and balances will grow.';
      }
      return;
    }

    // Both feasible
    setText('ds-avalanche-months', isFinite(avalanche.months) ? avalanche.months + ' mo' : '> 50 yrs');
    setText('ds-avalanche-interest', isFinite(avalanche.totalInterest) ? fmtCurrency(avalanche.totalInterest) : '—');
    setText('ds-snowball-months', isFinite(snowball.months) ? snowball.months + ' mo' : '> 50 yrs');
    setText('ds-snowball-interest', isFinite(snowball.totalInterest) ? fmtCurrency(snowball.totalInterest) : '—');

    var savings = isFinite(snowball.totalInterest) && isFinite(avalanche.totalInterest)
      ? snowball.totalInterest - avalanche.totalInterest
      : NaN;
    setText('ds-savings', isFinite(savings) ? fmtCurrency(Math.abs(savings)) : '—');

    if (verdict) {
      if (isFinite(savings) && savings > 0.01) {
        verdict.className = 'pfc-verdict good';
        verdict.textContent =
          'Avalanche saves you ' + fmtCurrency(savings) +
          ' in interest compared to the snowball method. Pay the highest-rate debt first.';
      } else if (isFinite(savings) && savings < -0.01) {
        verdict.className = 'pfc-verdict good';
        verdict.textContent =
          'In this scenario the snowball method pays slightly less interest. ' +
          'With similar balances, the strategies converge — choose whichever keeps you motivated.';
      } else {
        verdict.className = 'pfc-verdict';
        verdict.textContent =
          'Both strategies produce the same result here. ' +
          'Choose whichever helps you stay on track.';
      }
    }

    renderChart(avalanche, snowball);
  }

  function renderChart(avalanche, snowball) {
    var canvas = document.getElementById('ds-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    var avSched = (avalanche.schedule || []);
    var snSched = (snowball.schedule || []);
    var len = Math.max(avSched.length, snSched.length);
    var labels = [];
    var avData = [];
    var snData = [];
    for (var i = 0; i < len; i++) {
      labels.push('M' + (i + 1));
      avData.push(avSched[i] != null ? avSched[i] : 0);
      snData.push(snSched[i] != null ? snSched[i] : 0);
    }

    if (window._pfcCharts.ds) {
      updateChartData(window._pfcCharts.ds, labels, [
        { data: avData },
        { data: snData },
      ]);
    } else {
      window._pfcCharts.ds = makeLineChart(canvas, labels, [
        {
          label: 'Avalanche balance',
          data: avData,
          borderColor: '#2BB67D',
          backgroundColor: 'rgba(43,182,125,0.10)',
          fill: true, tension: 0.3, borderWidth: 2, pointRadius: 0,
        },
        {
          label: 'Snowball balance',
          data: snData,
          borderColor: '#D4AF6A',
          borderDash: [5, 4],
          borderWidth: 1.8, pointRadius: 0, fill: false,
        },
      ]);
    }
  }

  function setText(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  // ── Init ────────────────────────────────────────────────────────────────

  var debouncedCompute = debounce(compute, 250);

  function init() {
    var budgetInput = document.getElementById('ds-budget');
    if (budgetInput) {
      budgetInput.addEventListener('input', debouncedCompute);
    }

    var addBtn = document.getElementById('ds-add-row');
    if (addBtn) {
      addBtn.addEventListener('click', function () { addRow(); });
    }

    // Seed 3 default rows with country-appropriate APR
    var apr = country.typicalCardAPR || 22;
    addRow(5000, apr, 100);
    addRow(3000, apr, 75);
    addRow(8000, Math.max(apr - 4, 10), 160);

    // Self-tests (URL ?selftest=1)
    runSelfTests(function (t) {
      // Test 1: 1 debt $5k @20% APR $100 min, $500 budget → avalanche 11–14 months, interest < $700
      var r1 = payoffSimulate([{ balance: 5000, apr: 20, minimum: 100 }], 500, 'avalanche');
      t.assert(!r1.infeasible, 'Test 1: feasible with $500 budget');
      t.assert(r1.months >= 11 && r1.months <= 14, 'Test 1: $5k @20% $100min $500budget → 11–14 months (got ' + r1.months + ')');
      t.assert(r1.totalInterest < 700, 'Test 1: totalInterest < $700 (got ' + r1.totalInterest.toFixed(2) + ')');

      // Test 2: same debt with budget $50 → infeasible, reason='budget_below_minimums', shortfall=50
      var r2 = payoffSimulate([{ balance: 5000, apr: 20, minimum: 100 }], 50, 'avalanche');
      t.assert(r2.infeasible === true, 'Test 2: infeasible:true when budget < minimums');
      t.assert(r2.reason === 'budget_below_minimums', 'Test 2: reason=budget_below_minimums');
      t.assert(r2.shortfall === 50, 'Test 2: shortfall=50 (got ' + r2.shortfall + ')');

      // Test 3: 2 debts $3k @25% min $75; $7k @15% min $140 — budget $500. Avalanche <= snowball interest; both feasible.
      var debts3 = [
        { balance: 3000, apr: 25, minimum: 75 },
        { balance: 7000, apr: 15, minimum: 140 },
      ];
      var r3av = payoffSimulate(debts3, 500, 'avalanche');
      var r3sn = payoffSimulate(debts3, 500, 'snowball');
      t.assert(!r3av.infeasible && !r3sn.infeasible, 'Test 3: both feasible');
      t.assert(r3av.totalInterest <= r3sn.totalInterest + 0.01,
        'Test 3: avalanche interest ≤ snowball interest (av=' + r3av.totalInterest.toFixed(2) + ' sn=' + r3sn.totalInterest.toFixed(2) + ')');
    });
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
