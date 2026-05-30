// js/tools/compound-interest.js — global + per-country compound interest calculator.
// Reads country params from window.PFC_TOOLS_COUNTRY (set via <body data-pfc-country="…">).
// Chart instance stored at window._pfcCharts.ci (not per-tool global).
// Inputs debounced at 150ms via PFCTools.debounce.
// updateChartData used for reflows (no destroy+recreate).

(function () {
  var PFCTools = window.PFCTools;
  var fmtCurrency = PFCTools.fmtCurrency;
  var futureValue  = PFCTools.futureValue;
  var makeLineChart = PFCTools.makeLineChart;
  var updateChartData = PFCTools.updateChartData;
  var runSelfTests = PFCTools.runSelfTests;
  var libSelfTest  = PFCTools.libSelfTest;
  var country      = PFCTools.country;

  function compute() {
    var principal = +document.getElementById('ci-principal').value || 0;
    var monthly   = +document.getElementById('ci-monthly').value  || 0;
    var rate      = +document.getElementById('ci-rate').value     || 0;
    var years     = +document.getElementById('ci-years').value    || 0;

    var fv           = futureValue({ principal: principal, monthlyContribution: monthly, annualRate: rate, years: years });
    var totalContrib = principal + monthly * 12 * years;
    var interest     = fv - totalContrib;

    var interestEl = document.getElementById('ci-interest');
    document.getElementById('ci-fv').textContent        = fmtCurrency(fv);
    document.getElementById('ci-contrib').textContent   = fmtCurrency(totalContrib);
    interestEl.textContent  = fmtCurrency(interest);
    interestEl.style.color  = interest < 0 ? 'var(--warning)' : 'var(--gold)';
    document.getElementById('ci-multiplier').textContent =
      totalContrib > 0 ? (fv / totalContrib).toFixed(2) + '×' : '—';

    var labels = [], series = [], contribSeries = [];
    for (var y = 0; y <= years; y++) {
      labels.push('Y' + y);
      series.push(futureValue({ principal: principal, monthlyContribution: monthly, annualRate: rate, years: y }));
      contribSeries.push(principal + monthly * 12 * y);
    }

    if (window._pfcCharts.ci) {
      // Sync dataset count if needed (first load may differ)
      while (window._pfcCharts.ci.data.datasets.length < 2) {
        window._pfcCharts.ci.data.datasets.push({});
      }
      updateChartData(window._pfcCharts.ci, labels, [
        { data: series },
        { data: contribSeries },
      ]);
    } else {
      window._pfcCharts.ci = makeLineChart(
        document.getElementById('ci-chart'),
        labels,
        [
          { label: 'Balance', data: series, borderColor: '#2BB67D',
            backgroundColor: 'rgba(43,182,125,0.12)', fill: true,
            tension: 0.3, borderWidth: 2, pointRadius: 0 },
          { label: 'Just contributions', data: contribSeries, borderColor: '#D4AF6A',
            borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0, fill: false },
        ]
      );
    }
  }

  var debouncedCompute = PFCTools.debounce(compute, 150);

  function init() {
    ['ci-principal', 'ci-monthly', 'ci-rate', 'ci-years'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('input', debouncedCompute);
    });

    // Set default principal from country defaults
    var principalEl = document.getElementById('ci-principal');
    if (principalEl && country.defaultPrincipal) {
      principalEl.value = country.defaultPrincipal;
    }

    compute();

    runSelfTests(function (t) {
      libSelfTest(t);

      var fv0 = futureValue({ principal: 1000, monthlyContribution: 0, annualRate: 10, years: 1 });
      t.assert(Math.abs(fv0 - 1104.71) < 0.5, 'FV $1000 @10% /1yr ≈ $1104.71');

      var fv1 = futureValue({ principal: 0, monthlyContribution: 100, annualRate: 0, years: 1 });
      t.assert(Math.abs(fv1 - 1200) < 0.01, 'Zero-rate annuity equals plain sum');

      var fv2 = futureValue({ principal: 10000, monthlyContribution: 500, annualRate: 7, years: 30 });
      t.assert(fv2 > 600000 && fv2 < 700000, '$10k + $500/mo @7% × 30y ≈ $691k');
    });
  }

  if (document.readyState !== 'loading') {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
