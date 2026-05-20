// js/pfc-tools-lib.js — shared helpers for public tool pages.
// Load AFTER pfc-tools-i18n.js. Exposes window.PFCTools and window._pfcCharts.
//
// CTO must-fixes folded into this file (see docs/superpowers/plans/2026-05-19-…):
//   #1 Math: payoffSimulate detects budget-below-minimums upfront and returns a reason code.
//   #1 Math: yearsToFI detects infeasibility (return rate too low to outpace expenses) and returns Infinity.
//   #2 Perf: debounce helper + chart.update('none') pattern (no destroy/recreate per keystroke).
//   #3 Hygiene: all Chart.js instances live under window._pfcCharts.<toolPrefix>, no per-tool globals.
//
// CDN integrity (must-fix #6 — SRI on Chart.js):
//   Chart.js 4.4.0 UMD bundle: 205,222 bytes
//   <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"
//           integrity="sha384-e6nUZLBkQ86NJ6TVVKAeSaK8jWa3NhkYWZFomE39AvDbQWeie9PlQqM3pmYW5d1g"
//           crossorigin="anonymous" defer></script>
//
// Font preload (must-fix #5 — pragmatic downgrade from full self-host):
//   Self-hosting Fraunces requires shipping woff2 binaries we cannot generate in
//   this session. Instead, every tool page should preload Google's woff2 URLs
//   directly (not the CSS) to eliminate the FOUT and improve LCP:
//   <link rel="preload" as="font" type="font/woff2" crossorigin
//         href="https://fonts.gstatic.com/s/fraunces/v37/6NUh8FyLNQOQZAnv9bYAaaQjVO_h1cYfPgWj-XzNvKDz.woff2">
//   (Fraunces 400 normal variable-axis subset; the woff2 URL is stable for the
//   font's hash-pinned revision. Verify before deploy if Google rotates the URL.)

(function () {
  var country = window.PFC_TOOLS_COUNTRY;

  // Shared chart registry. Each tool registers its chart instance under a stable prefix
  // (ci, ma, fd, ds, sr) so reflows don't leak between tools and dev tools can inspect them.
  window._pfcCharts = window._pfcCharts || {};

  // ── Formatters ─────────────────────────────────────────────────────────
  function fmtCurrency(n, opts) {
    opts = opts || {};
    if (!isFinite(n)) return '—';
    var decimals = opts.decimals != null ? opts.decimals : 0;
    return new Intl.NumberFormat(country.locale, {
      style: 'currency', currency: country.currency,
      maximumFractionDigits: decimals, minimumFractionDigits: decimals,
    }).format(n);
  }

  function fmtNumber(n, decimals) {
    if (!isFinite(n)) return '—';
    decimals = decimals != null ? decimals : 0;
    return new Intl.NumberFormat(country.locale, {
      maximumFractionDigits: decimals, minimumFractionDigits: decimals,
    }).format(n);
  }

  function fmtPercent(n, decimals) {
    if (!isFinite(n)) return '—%';
    decimals = decimals != null ? decimals : 1;
    return new Intl.NumberFormat(country.locale, {
      style: 'percent', maximumFractionDigits: decimals, minimumFractionDigits: decimals,
    }).format(n / 100);
  }

  function fmtYears(n) {
    if (!isFinite(n)) return 'never (at current inputs)';
    if (n < 1) return Math.round(n * 12) + ' months';
    var whole = Math.floor(n);
    var months = Math.round((n - whole) * 12);
    if (months === 0) return whole + (whole === 1 ? ' year' : ' years');
    return whole + 'y ' + months + 'm';
  }

  // ── Performance helpers (must-fix #2) ──────────────────────────────────
  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  // Update an existing chart's data + labels without destroy+recreate.
  // Pass 'none' as the animation arg to avoid jitter on every keystroke.
  function updateChartData(chart, labels, datasets) {
    if (!chart) return;
    chart.data.labels = labels;
    chart.data.datasets.forEach(function (ds, i) {
      if (datasets[i]) ds.data = datasets[i].data;
    });
    chart.update('none');
    // Analytics: fire tool_compute the first time the user causes a chart
    // update. PFC.trackToolCompute is self-deduped (once per pageview) and
    // wrapped in try so an analytics outage never breaks the tool.
    try {
      if (window.PFC && typeof window.PFC.trackToolCompute === 'function') {
        window.PFC.trackToolCompute();
      }
    } catch (_) {}
  }

  // ── Math: compound growth ──────────────────────────────────────────────
  // Compound-growth formula: FV = PV(1+r)^n + PMT × ((1+r)^n − 1) / r
  // r = periodic rate, n = number of periods, PMT = periodic deposit (end of period).
  function futureValue(args) {
    var principal = args.principal;
    var monthlyContribution = args.monthlyContribution;
    var annualRate = args.annualRate;
    var years = args.years;
    var r = annualRate / 100 / 12;
    var n = years * 12;
    if (r === 0) return principal + monthlyContribution * n;
    var growthFactor = Math.pow(1 + r, n);
    return principal * growthFactor + monthlyContribution * (growthFactor - 1) / r;
  }

  // ── Math: mortgages ────────────────────────────────────────────────────
  // Monthly mortgage payment: P × r / (1 − (1+r)^−n).
  function monthlyMortgagePayment(args) {
    var loan = args.loan, annualRate = args.annualRate, years = args.years;
    var r = annualRate / 100 / 12;
    var n = years * 12;
    if (r === 0) return loan / n;
    return loan * r / (1 - Math.pow(1 + r, -n));
  }

  // Affordable mortgage given monthly disposable: solve for P.
  function affordableLoan(args) {
    var monthlyPayment = args.monthlyPayment, annualRate = args.annualRate, years = args.years;
    var r = annualRate / 100 / 12;
    var n = years * 12;
    if (r === 0) return monthlyPayment * n;
    return monthlyPayment * (1 - Math.pow(1 + r, -n)) / r;
  }

  // ── Math: FIRE / years to financial independence ───────────────────────
  // Returns the number of years until FV(currentNW, monthlyContrib, expectedReturn, n) ≥ 25 × annualExpenses.
  // MUST-FIX #1: detect infeasibility (if 80yr projection still under target, return Infinity, not silent cap).
  function yearsToFI(args) {
    var currentNW = args.currentNW;
    var monthlyContribution = args.monthlyContribution;
    var annualReturn = args.annualReturn;
    var annualExpenses = args.annualExpenses;
    var swr = args.swr != null ? args.swr : 0.04;
    var target = annualExpenses / swr;
    if (currentNW >= target) return 0;

    // Infeasibility check: if even 80 years of compounding + monthly contributions
    // doesn't reach the target, the inputs cannot get there. Return Infinity so
    // callers can branch on `!isFinite(years)` and surface a real reason to the user.
    var fv80 = futureValue({ principal: currentNW, monthlyContribution: monthlyContribution, annualRate: annualReturn, years: 80 });
    if (fv80 < target) return Infinity;

    var lo = 0, hi = 80;
    while (hi - lo > 0.1) {
      var mid = (lo + hi) / 2;
      var fv = futureValue({ principal: currentNW, monthlyContribution: monthlyContribution, annualRate: annualReturn, years: mid });
      if (fv >= target) hi = mid; else lo = mid;
    }
    return hi;
  }

  // ── Math: debt payoff simulator (snowball vs avalanche) ────────────────
  // MUST-FIX #1: detect budget < sum(minimums) UPFRONT and return a clear reason code
  //              instead of silently spinning to the 600-month cap.
  // Returns: { months, totalInterest, infeasible, reason, shortfall?, schedule? }
  function payoffSimulate(debts, monthlyBudget, strategy) {
    var totalMinimums = debts.reduce(function (s, d) { return s + (d.minimum || 0); }, 0);
    if (monthlyBudget < totalMinimums) {
      return {
        months: Infinity,
        totalInterest: Infinity,
        infeasible: true,
        reason: 'budget_below_minimums',
        shortfall: totalMinimums - monthlyBudget,
        totalMinimums: totalMinimums,
      };
    }

    var order = (strategy === 'avalanche')
      ? debts.slice().sort(function (a, b) { return b.apr - a.apr; })
      : debts.slice().sort(function (a, b) { return a.balance - b.balance; });

    // Defensive copy so we do not mutate caller data
    var balances = order.map(function (d) { return Object.assign({}, d); });
    var month = 0, interestPaid = 0;
    var cap = 600; // 50 years; abort if budget cannot cover even minimums + interest accrual
    var schedule = [];

    while (balances.some(function (d) { return d.balance > 0.01; }) && month < cap) {
      var budget = monthlyBudget;
      // 1. Accrue interest
      for (var i = 0; i < balances.length; i++) {
        var d = balances[i];
        if (d.balance <= 0) continue;
        var interest = d.balance * (d.apr / 100 / 12);
        d.balance += interest;
        interestPaid += interest;
      }
      // 2. Pay minimums on all
      for (var j = 0; j < balances.length; j++) {
        var d2 = balances[j];
        if (d2.balance <= 0) continue;
        var pay = Math.min(d2.minimum, d2.balance, budget);
        d2.balance -= pay; budget -= pay;
      }
      // 3. Snowball remaining budget into target order (first non-zero in `balances`)
      for (var k = 0; k < balances.length; k++) {
        var d3 = balances[k];
        if (budget <= 0) break;
        if (d3.balance <= 0) continue;
        var extra = Math.min(budget, d3.balance);
        d3.balance -= extra; budget -= extra;
      }
      month++;
      schedule.push(balances.reduce(function (s, b) { return s + Math.max(0, b.balance); }, 0));
    }

    if (month >= cap) {
      return {
        months: Infinity,
        totalInterest: Infinity,
        infeasible: true,
        reason: 'capped_at_50_years',
        totalMinimums: totalMinimums,
        schedule: schedule,
      };
    }

    return {
      months: month,
      totalInterest: interestPaid,
      infeasible: false,
      reason: null,
      schedule: schedule,
    };
  }

  // ── Chart.js factory ───────────────────────────────────────────────────
  // Make a Chart.js line chart. Caller provides labels + datasets. Returns chart instance.
  // Register the returned chart on window._pfcCharts.<prefix> to avoid global pollution.
  function makeLineChart(canvas, labels, datasets, opts) {
    opts = opts || {};
    if (typeof Chart === 'undefined') {
      console.error('[pfc-tools-lib] Chart.js not loaded');
      return null;
    }
    return new Chart(canvas, {
      type: 'line',
      data: { labels: labels, datasets: datasets },
      options: Object.assign({
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 220 },
        plugins: {
          legend: { labels: { color: '#B8C2BC', font: { family: "'Inter Tight', sans-serif", size: 12 } } },
          tooltip: {
            backgroundColor: '#16271F', titleColor: '#F0EDE2', bodyColor: '#B8C2BC',
            borderColor: 'rgba(240,237,226,0.10)', borderWidth: 1, padding: 10,
            callbacks: { label: function (ctx) { return ctx.dataset.label + ': ' + fmtCurrency(ctx.parsed.y); } },
          },
        },
        scales: {
          x: { grid: { color: 'rgba(240,237,226,0.06)' }, ticks: { color: '#6F7C75' } },
          y: { grid: { color: 'rgba(240,237,226,0.06)' },
               ticks: { color: '#6F7C75', callback: function (v) { return fmtCurrency(v); } } },
        },
      }, opts),
    });
  }

  // ── Self-test runner ───────────────────────────────────────────────────
  // Tiny self-test runner. Called by each tool page on DOMContentLoaded.
  // Runs only when URL contains ?selftest=1, so production users never see logs.
  function runSelfTests(testFn) {
    if (!window.location.search.includes('selftest=1')) return;
    try {
      testFn({
        assert: function (cond, msg) {
          if (!cond) throw new Error(msg);
          console.log('✓', msg);
        },
      });
      console.log('%c[pfc-tools] all self-tests passed', 'color:#2BB67D;font-weight:bold');
    } catch (e) {
      console.error('[pfc-tools] self-test FAILED:', e.message);
    }
  }

  // Built-in self-tests for the shared lib itself — run alongside per-tool tests.
  function libSelfTest(t) {
    var fv0 = futureValue({ principal: 1000, monthlyContribution: 0, annualRate: 10, years: 1 });
    t.assert(Math.abs(fv0 - 1104.71) < 0.5, 'FV $1000 @10% / 1yr ≈ $1104.71');

    var fv1 = futureValue({ principal: 0, monthlyContribution: 100, annualRate: 0, years: 1 });
    t.assert(Math.abs(fv1 - 1200) < 0.01, 'Zero-rate annuity equals plain sum');

    var ml = monthlyMortgagePayment({ loan: 200000, annualRate: 6, years: 30 });
    t.assert(Math.abs(ml - 1199.10) < 1, '$200k @6% × 30y mortgage ≈ $1199/mo');

    var al = affordableLoan({ monthlyPayment: 1199.10, annualRate: 6, years: 30 });
    t.assert(Math.abs(al - 200000) < 50, 'affordableLoan inverse of monthlyMortgagePayment');

    var fi = yearsToFI({ currentNW: 100000, monthlyContribution: 2000, annualReturn: 7, annualExpenses: 40000 });
    t.assert(fi > 12 && fi < 22, 'yearsToFI: $100k + $2k/mo @7%, $40k expenses → 12–22 years');

    var fiInf = yearsToFI({ currentNW: 0, monthlyContribution: 10, annualReturn: 1, annualExpenses: 100000 });
    t.assert(!isFinite(fiInf), 'yearsToFI returns Infinity when target unreachable');

    var dRes = payoffSimulate([{ balance: 5000, apr: 20, minimum: 100 }], 50, 'avalanche');
    t.assert(dRes.infeasible && dRes.reason === 'budget_below_minimums', 'payoffSimulate flags budget < minimums');

    var dRes2 = payoffSimulate([{ balance: 5000, apr: 20, minimum: 100 }], 500, 'avalanche');
    t.assert(!dRes2.infeasible && dRes2.months > 0 && dRes2.months < 60, 'payoffSimulate solves a normal $5k @20% with $500/mo budget');
  }

  // ── Public API ─────────────────────────────────────────────────────────
  window.PFCTools = {
    country: country,
    fmtCurrency: fmtCurrency,
    fmtNumber: fmtNumber,
    fmtPercent: fmtPercent,
    fmtYears: fmtYears,
    debounce: debounce,
    updateChartData: updateChartData,
    futureValue: futureValue,
    monthlyMortgagePayment: monthlyMortgagePayment,
    affordableLoan: affordableLoan,
    yearsToFI: yearsToFI,
    payoffSimulate: payoffSimulate,
    makeLineChart: makeLineChart,
    runSelfTests: runSelfTests,
    libSelfTest: libSelfTest,
  };
})();
