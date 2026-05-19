// js/tools/fire-date.js — FIRE date calculator (when can you retire?).
// Reads country params from window.PFC_TOOLS_COUNTRY (set via <body data-pfc-country="…">).
// All math delegated to window.PFCTools — no inline reimplementation.

(function () {
  var T = window.PFCTools;
  var fmtCurrency = T.fmtCurrency;
  var fmtYears = T.fmtYears;
  var fmtNumber = T.fmtNumber;
  var yearsToFI = T.yearsToFI;
  var futureValue = T.futureValue;
  var makeLineChart = T.makeLineChart;
  var updateChartData = T.updateChartData;
  var runSelfTests = T.runSelfTests;
  var country = T.country;

  // Assumed current age for Coast FIRE calculation (surfaced inline).
  var ASSUMED_AGE = 35;
  var CHART_HORIZON = 40;

  function targetPortfolio(annualExpenses, swr) {
    return annualExpenses / (swr / 100);
  }

  function targetDate(yearsFromNow) {
    if (!isFinite(yearsFromNow)) return null;
    var d = new Date();
    d.setTime(d.getTime() + yearsFromNow * 365.25 * 24 * 60 * 60 * 1000);
    return d;
  }

  function fmtMonthYear(date) {
    if (!date) return '—';
    return date.toLocaleString(country.locale, { month: 'long', year: 'numeric' });
  }

  function compute() {
    var currentNW = +document.getElementById('fd-currentNW').value || 0;
    var monthly = +document.getElementById('fd-monthly').value || 0;
    var annualReturn = +document.getElementById('fd-return').value || 0;
    var annualExpenses = +document.getElementById('fd-expenses').value || 0;
    var swr = +document.getElementById('fd-swr').value || 4;

    var target = targetPortfolio(annualExpenses, swr);
    var years = yearsToFI({
      currentNW: currentNW,
      monthlyContribution: monthly,
      annualReturn: annualReturn,
      annualExpenses: annualExpenses,
      swr: swr / 100,
    });

    // --- Infeasibility verdict ---
    var verdictEl = document.getElementById('fd-verdict');
    verdictEl.className = 'pfc-verdict';
    verdictEl.hidden = true;

    if (!isFinite(years)) {
      verdictEl.className = 'pfc-verdict warn';
      verdictEl.hidden = false;
      verdictEl.innerHTML =
        'Not reachable with these inputs — your monthly savings + expected return cannot outpace ' +
        'your annual expenses given a ' + swr + '% safe withdrawal rate. ' +
        'Try raising the savings rate, the return assumption, or trimming expenses.';
    }

    // --- Primary outputs ---
    document.getElementById('fd-years').textContent = fmtYears(years);
    document.getElementById('fd-targetDate').textContent = fmtMonthYear(targetDate(years));
    document.getElementById('fd-targetPortfolio').textContent = fmtCurrency(target);

    // --- Progress ---
    var pct = target > 0 ? Math.min(100, (currentNW / target) * 100) : 0;
    document.getElementById('fd-progress').textContent = fmtNumber(pct, 1) + '%';

    // --- Coast FIRE check ---
    var retireAge = country.retirementAge || 67;
    var yearsToRetire = Math.max(0, retireAge - ASSUMED_AGE);
    var coastValue = futureValue({
      principal: currentNW,
      monthlyContribution: 0,
      annualRate: annualReturn,
      years: yearsToRetire,
    });
    var coastEl = document.getElementById('fd-coastFire');
    if (coastValue >= target && target > 0 && currentNW > 0) {
      coastEl.hidden = false;
      coastEl.textContent =
        'Already Coast FI — you could stop contributing today and still hit your target by ' +
        'state pension age ' + retireAge + '. (Assumes you are currently ' + ASSUMED_AGE + '.)';
    } else {
      coastEl.hidden = true;
      coastEl.textContent = '';
    }

    // --- Chart ---
    var labels = [], portfolioSeries = [], targetSeries = [];
    for (var y = 0; y <= CHART_HORIZON; y++) {
      labels.push('Y' + y);
      portfolioSeries.push(
        futureValue({ principal: currentNW, monthlyContribution: monthly, annualRate: annualReturn, years: y })
      );
      targetSeries.push(target);
    }

    if (window._pfcCharts.fd) {
      updateChartData(window._pfcCharts.fd, labels, [
        { data: portfolioSeries },
        { data: targetSeries },
      ]);
    } else {
      window._pfcCharts.fd = makeLineChart(
        document.getElementById('fd-chart'),
        labels,
        [
          {
            label: 'Projected portfolio',
            data: portfolioSeries,
            borderColor: '#2BB67D',
            backgroundColor: 'rgba(43,182,125,0.10)',
            fill: true,
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 0,
          },
          {
            label: 'FI target (' + swr + '% SWR)',
            data: targetSeries,
            borderColor: '#D4AF6A',
            borderDash: [6, 4],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false,
          },
        ]
      );
    }
  }

  var debouncedCompute = T.debounce(compute, 150);

  function init() {
    // Set defaults
    var c = country;
    document.getElementById('fd-currentNW').value = (c.defaultPrincipal || 10000) * 10;
    document.getElementById('fd-monthly').value = 1000;
    document.getElementById('fd-return').value = 7;
    document.getElementById('fd-expenses').value = 40000;
    document.getElementById('fd-swr').value = 4;

    ['fd-currentNW', 'fd-monthly', 'fd-return', 'fd-expenses', 'fd-swr'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('input', debouncedCompute);
    });

    compute();

    runSelfTests(function (t) {
      // Test 1: normal FI path
      var r1 = yearsToFI({ currentNW: 100000, monthlyContribution: 2000, annualReturn: 7, annualExpenses: 40000, swr: 0.04 });
      t.assert(r1 > 12 && r1 < 22, 'FIRE: $100k + $2k/mo @7%, $40k expenses → 12–22 years');

      // Test 2: infeasible
      var r2 = yearsToFI({ currentNW: 0, monthlyContribution: 10, annualReturn: 1, annualExpenses: 100000, swr: 0.04 });
      t.assert(!isFinite(r2), 'FIRE: $0 + $10/mo @1%, $100k expenses → Infinity');

      // Test 3: already FI
      var r3 = yearsToFI({ currentNW: 2000000, monthlyContribution: 0, annualReturn: 7, annualExpenses: 40000, swr: 0.04 });
      t.assert(r3 === 0, 'FIRE: $2M already FI at 4% SWR ($40k expenses) → 0 years');
    });
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
