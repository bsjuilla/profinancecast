// js/tools/savings-rate.js — Savings Rate Analyser.
// Reads country params from window.PFC_TOOLS_COUNTRY (set via <body data-pfc-country="…">).
// All math via PFCTools.*. Chart instance stored at window._pfcCharts.sr.

(function () {
  var T = window.PFCTools;
  var fmtCurrency  = T.fmtCurrency;
  var fmtPercent   = T.fmtPercent;
  var fmtYears     = T.fmtYears;
  var yearsToFI    = T.yearsToFI;
  var futureValue  = T.futureValue;
  var makeLineChart    = T.makeLineChart;
  var updateChartData  = T.updateChartData;
  var runSelfTests     = T.runSelfTests;

  // Static benchmark table: savings rate → approximate years to FI.
  // Source: "shockingly simple math" concept — assumes 0% starting NW, 7% return, 4% SWR.
  var BENCHMARKS = [
    { rate: 5,  years: 66   },
    { rate: 10, years: 51   },
    { rate: 15, years: 43   },
    { rate: 20, years: 37   },
    { rate: 25, years: 32   },
    { rate: 30, years: 28   },
    { rate: 40, years: 22   },
    { rate: 50, years: 17   },
    { rate: 60, years: 12.5 },
    { rate: 70, years: 8.5  },
    { rate: 80, years: 5.5  },
  ];

  function getInputs() {
    return {
      grossAnnual:    +document.getElementById('sr-grossAnnual').value    || 0,
      takeHome:       +document.getElementById('sr-takeHome').value       || 0,
      monthlySavings: +document.getElementById('sr-monthlySavings').value || 0,
      monthlyExpenses:+document.getElementById('sr-monthlyExpenses').value|| 0,
      annualReturn:   +document.getElementById('sr-return').value         || 7,
      currentAge:     +document.getElementById('sr-age').value            || 30,
    };
  }

  function computeRate(monthlySavings, takeHome) {
    var monthly = takeHome / 12;
    if (monthly <= 0) return 0;
    return (monthlySavings / monthly) * 100;
  }

  function computeTaxRate(grossAnnual, takeHome) {
    if (grossAnnual <= 0) return 0;
    // Clamp to [0, 100]: negative tax rate (takeHome > gross) or >100% are not valid inputs.
    return Math.min(100, Math.max(0, (1 - takeHome / grossAnnual) * 100));
  }

  function buildChartSeries(monthlySavings, annualReturn, cappedYears) {
    var labels = [], nwSeries = [];
    for (var y = 0; y <= cappedYears; y++) {
      labels.push('Y' + y);
      nwSeries.push(futureValue({
        principal: 0,
        monthlyContribution: monthlySavings,
        annualRate: annualReturn,
        years: y,
      }));
    }
    return { labels: labels, nwSeries: nwSeries };
  }

  function renderBenchmarkTable(userRate) {
    var table = document.getElementById('sr-benchmarkTable');
    if (!table) return;
    var nearest = null;
    var minDiff = Infinity;
    BENCHMARKS.forEach(function (b) {
      var diff = Math.abs(b.rate - userRate);
      if (diff < minDiff) { minDiff = diff; nearest = b.rate; }
    });
    var rows = BENCHMARKS.map(function (b) {
      var isActive = userRate > 0 && b.rate === nearest;
      return '<tr' + (isActive ? ' class="sr-bench-active"' : '') + '>'
        + '<td>' + b.rate + '%</td>'
        + '<td>' + (Number.isInteger(b.years) ? b.years : b.years.toFixed(1)) + ' yrs</td>'
        + '</tr>';
    }).join('');
    table.innerHTML = '<thead><tr><th>Savings rate</th><th>Approx. years to FI</th></tr></thead>'
      + '<tbody>' + rows + '</tbody>';
  }

  function compute() {
    var inp = getInputs();
    // Guard: takeHome <= 0 means we cannot derive a meaningful savings rate.
    // Show placeholder dashes and skip chart update to avoid NaN/Infinity display.
    if (inp.takeHome <= 0) {
      document.getElementById('sr-rate').textContent = '—';
      document.getElementById('sr-taxRate') && (document.getElementById('sr-taxRate').textContent = '—');
      var yearsEl = document.getElementById('sr-years');
      if (yearsEl) yearsEl.textContent = '—';
      var ageEl = document.getElementById('sr-impliedAge');
      if (ageEl) ageEl.textContent = '—';
      return;
    }
    var rate    = computeRate(inp.monthlySavings, inp.takeHome);
    var taxRate = computeTaxRate(inp.grossAnnual, inp.takeHome);

    // Update rate + tax outputs
    document.getElementById('sr-rate').textContent = fmtPercent(rate);
    document.getElementById('sr-taxRate') && (document.getElementById('sr-taxRate').textContent = fmtPercent(taxRate));

    // Years to FI
    var years = yearsToFI({
      currentNW: 0,
      monthlyContribution: inp.monthlySavings,
      annualReturn: inp.annualReturn,
      annualExpenses: inp.monthlyExpenses * 12,
      swr: 0.04,
    });

    var yearsEl   = document.getElementById('sr-years');
    var ageEl     = document.getElementById('sr-impliedAge');
    var verdictEl = document.getElementById('sr-verdict');

    if (!isFinite(years)) {
      yearsEl.textContent  = fmtYears(Infinity);
      ageEl.textContent    = '—';
      if (verdictEl) {
        verdictEl.className  = 'pfc-verdict warn';
        verdictEl.textContent = 'At your current savings rate, FI is not reachable in 80 years. '
          + 'Either savings rate, return rate, or expenses must change.';
      }
    } else {
      yearsEl.textContent  = fmtYears(years);
      ageEl.textContent    = Math.round(inp.currentAge + years) + '';
      if (verdictEl) {
        verdictEl.className  = 'pfc-verdict good';
        verdictEl.textContent = 'At a ' + fmtPercent(rate) + ' savings rate you can reach FI '
          + 'in roughly ' + fmtYears(years) + ', at age ' + Math.round(inp.currentAge + years) + '.';
      }
    }

    // Benchmark table
    renderBenchmarkTable(rate);

    // Chart — cap at min(years, 80) for Infinity case
    var chartYears = isFinite(years) ? Math.ceil(years) : 80;
    var series = buildChartSeries(inp.monthlySavings, inp.annualReturn, chartYears);

    if (window._pfcCharts.sr) {
      updateChartData(window._pfcCharts.sr, series.labels, [{ data: series.nwSeries }]);
    } else {
      window._pfcCharts.sr = makeLineChart(
        document.getElementById('sr-chart'),
        series.labels,
        [{
          label: 'Net worth',
          data: series.nwSeries,
          borderColor: '#2BB67D',
          backgroundColor: 'rgba(43,182,125,0.12)',
          fill: true,
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 0,
        }]
      );
    }
  }

  var debouncedCompute = T.debounce(compute, 150);

  function init() {
    var ids = ['sr-grossAnnual','sr-takeHome','sr-monthlySavings','sr-monthlyExpenses','sr-return','sr-age'];
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('input', debouncedCompute);
    });
    compute();

    runSelfTests(function (t) {
      // Test 1: 50% savings rate, should yield years between 14 and 20
      var y1 = yearsToFI({
        currentNW: 0, monthlyContribution: 2500,
        annualReturn: 7, annualExpenses: 30000, swr: 0.04,
      });
      t.assert(y1 > 14 && y1 < 20,
        'savings 2500/mo, takeHome 60000 (50% rate), expenses 2500/mo @7% → 14–20 yrs');

      // Test 2: savings = 0 → rate 0%, years Infinity
      var r2 = computeRate(0, 60000);
      t.assert(r2 === 0, 'savings 0 → savings rate 0%');
      var y2 = yearsToFI({
        currentNW: 0, monthlyContribution: 0,
        annualReturn: 7, annualExpenses: 30000, swr: 0.04,
      });
      t.assert(!isFinite(y2), 'savings 0 → years Infinity');

      // Test 3: savings = takeHome (100% rate), expenses = 0 → years 0
      var r3 = computeRate(5000, 5000);
      t.assert(Math.abs(r3 - 100) < 0.001, 'savings = takeHome → 100% rate');
      var y3 = yearsToFI({
        currentNW: 0, monthlyContribution: 5000,
        annualReturn: 7, annualExpenses: 0, swr: 0.04,
      });
      t.assert(y3 === 0, 'expenses 0 → years to FI is 0');
    });
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
