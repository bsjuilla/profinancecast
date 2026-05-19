// js/tools/mortgage-affordability.js — global + per-country mortgage affordability calculator.
// Reads country params from window.PFC_TOOLS_COUNTRY (set via <body data-pfc-country="…">).
// 28/36 rule: housing payment ≤ 28% gross income; total debt ≤ 36% gross income.

(function () {
  var T = window.PFCTools;
  var fmtCurrency = T.fmtCurrency;
  var fmtPercent  = T.fmtPercent;
  var monthlyMortgagePayment = T.monthlyMortgagePayment;
  var affordableLoan         = T.affordableLoan;
  var makeLineChart           = T.makeLineChart;
  var updateChartData         = T.updateChartData;
  var runSelfTests            = T.runSelfTests;
  var debounce                = T.debounce;
  var country                 = T.country;

  // Default term per country (years)
  var TERM_DEFAULTS = { us: 30, ca: 25, uk: 25, ie: 25, au: 25, fr: 20, de: 20, sg: 25, global: 30 };

  function getDefaultTerm() {
    return TERM_DEFAULTS[country.code] || 30;
  }

  function compute() {
    var income   = +document.getElementById('ma-income').value  || 0;
    var debts    = +document.getElementById('ma-debts').value   || 0;
    var down     = +document.getElementById('ma-down').value    || 0;
    var target   = +document.getElementById('ma-target').value  || 0;
    var rate     = +document.getElementById('ma-rate').value    || 0;
    var term     = +document.getElementById('ma-term').value    || getDefaultTerm();

    // 28/36 rule
    var maxHousingPayment  = income * 0.28;
    var maxTotalDebt36     = income * 0.36 - debts;
    var effectiveMaxPmt    = Math.min(maxHousingPayment, maxTotalDebt36);
    var maxLoan            = affordableLoan({ monthlyPayment: Math.max(effectiveMaxPmt, 0), annualRate: rate, years: term });
    var maxPrice           = maxLoan + down;

    // Target calcs
    var targetLoan    = Math.max(target - down, 0);
    var targetMonthly = (target > 0 && term > 0)
      ? monthlyMortgagePayment({ loan: targetLoan, annualRate: rate, years: term })
      : 0;
    var housingDTI = (income > 0) ? targetMonthly / income : 0;
    var totalDTI   = (income > 0) ? (targetMonthly + debts) / income : 0;

    // Outputs
    document.getElementById('ma-maxPrice').textContent  = fmtCurrency(maxPrice);
    document.getElementById('ma-monthly').textContent   = fmtCurrency(targetMonthly);
    document.getElementById('ma-dti').textContent       = fmtPercent(totalDTI * 100, 1)
      + ' (' + fmtPercent(housingDTI * 100, 1) + ' housing)';

    // Verdict
    var verdictEl = document.getElementById('ma-verdict');
    if (target > 0 && maxPrice > 0) {
      var diff = target - maxPrice;
      if (diff <= 0) {
        verdictEl.className = 'pfc-verdict good';
        verdictEl.textContent = 'Affordable. Your target is '
          + fmtCurrency(Math.abs(diff)) + ' below the max of ' + fmtCurrency(maxPrice) + '.';
      } else {
        verdictEl.className = 'pfc-verdict warn';
        verdictEl.textContent = 'Over budget. Your target exceeds the 28/36-rule max by '
          + fmtCurrency(diff) + '. Max affordable: ' + fmtCurrency(maxPrice) + '.';
      }
    } else {
      verdictEl.className = 'pfc-verdict';
      verdictEl.textContent = 'Enter a target price to see the verdict.';
    }

    // Chart: principal vs interest paid month-by-month over the term
    updateMortgageChart(targetLoan, rate, term);
  }

  function buildAmortisationSeries(loan, annualRate, years) {
    var r = annualRate / 100 / 12;
    var n = years * 12;
    var payment = (r === 0) ? loan / n : loan * r / (1 - Math.pow(1 + r, -n));
    var balance = loan;
    var labels = [], principalSeries = [], interestSeries = [];
    var step = Math.max(1, Math.round(n / 120)); // max 120 data points

    for (var m = 0; m < n; m++) {
      var interest   = (r === 0) ? 0 : balance * r;
      var principal  = payment - interest;
      balance        = Math.max(0, balance - principal);

      if (m % step === 0 || m === n - 1) {
        labels.push('M' + (m + 1));
        principalSeries.push(+(payment - interest).toFixed(2));
        interestSeries.push(+interest.toFixed(2));
      }
    }
    return { labels: labels, principalSeries: principalSeries, interestSeries: interestSeries };
  }

  function updateMortgageChart(loan, rate, term) {
    if (loan <= 0 || term <= 0) return;
    var d = buildAmortisationSeries(loan, rate, term);

    if (!window._pfcCharts.ma) {
      var canvas = document.getElementById('ma-chart');
      if (!canvas) return;
      window._pfcCharts.ma = makeLineChart(canvas, d.labels, [
        { label: 'Principal', data: d.principalSeries,
          borderColor: '#2BB67D', backgroundColor: 'rgba(43,182,125,0.10)',
          fill: true, tension: 0.3, borderWidth: 2, pointRadius: 0 },
        { label: 'Interest',  data: d.interestSeries,
          borderColor: '#D4AF6A', borderDash: [4, 3],
          borderWidth: 1.5, pointRadius: 0, fill: false },
      ]);
    } else {
      updateChartData(window._pfcCharts.ma, d.labels, [
        { data: d.principalSeries },
        { data: d.interestSeries  },
      ]);
    }
  }

  var debouncedCompute = debounce(compute, 150);

  function init() {
    // Set defaults from country config
    var rateInput = document.getElementById('ma-rate');
    var termInput = document.getElementById('ma-term');
    var downInput = document.getElementById('ma-down');
    var targetInput = document.getElementById('ma-target');

    if (rateInput && !rateInput.value) rateInput.value = country.mortgageRate || 6.8;
    if (termInput && !termInput.value) termInput.value = getDefaultTerm();
    if (downInput && !downInput.value) {
      downInput.value = Math.round(country.propertyDefault * 0.2 / 1000) * 1000;
    }
    if (targetInput && !targetInput.value) targetInput.value = country.propertyDefault || 420000;

    ['ma-income','ma-debts','ma-down','ma-target','ma-rate','ma-term'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('input', debouncedCompute);
    });

    compute();

    // Self-tests
    runSelfTests(function (t) {
      // Test 1: $200k loan @6% × 30y → ~$1199/mo
      var pmt = monthlyMortgagePayment({ loan: 200000, annualRate: 6, years: 30 });
      t.assert(Math.abs(pmt - 1199.10) < 1, '$200k @6% × 30y ≈ $1199/mo');

      // Test 2: 28/36 rule — $10k/mo income, $0 debts, $50k down, 6% rate, 30y
      var income2 = 10000, debts2 = 0, down2 = 50000, rate2 = 6, term2 = 30;
      var maxHousing2 = income2 * 0.28;
      var maxTotal2   = income2 * 0.36 - debts2;
      var effMax2     = Math.min(maxHousing2, maxTotal2);
      var maxLoan2    = affordableLoan({ monthlyPayment: effMax2, annualRate: rate2, years: term2 });
      var maxPrice2   = maxLoan2 + down2;
      // At $2800/mo max payment @6% × 30y, loan ≈ $466,929; maxPrice ≈ $516,929
      t.assert(maxPrice2 > 500000 && maxPrice2 < 540000,
        '28/36 rule: $10k income, $0 debts, $50k down, 6%, 30y → max price $500k–$540k');

      // Test 3: zero rate — principal/months payment
      var pmtZero = monthlyMortgagePayment({ loan: 120000, annualRate: 0, years: 10 });
      t.assert(Math.abs(pmtZero - 1000) < 0.01, 'Zero-rate: $120k ÷ 120 months = $1000/mo');
    });
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
