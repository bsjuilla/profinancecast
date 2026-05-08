/**
 * pfc-debt-engine.js — Pure-JS debt-payoff simulator.
 *
 * Single source of truth for the avalanche / snowball math. The
 * authenticated debt-optimizer page and the public /tools/debt-strategy
 * page both consume this module so the numbers never disagree.
 *
 * Mathematical model (per month):
 *   1. Each active debt accrues interest = balance * (apr / 12 / 100)
 *   2. Each debt's minimum payment is paid (clamped to remaining balance)
 *   3. The remainder of the monthly budget is funnelled to the focused
 *      debt determined by the chosen strategy:
 *        - 'avalanche' → highest APR remaining first
 *        - 'snowball'  → smallest balance remaining first
 *   4. When a debt clears, the focus moves to the next per the strategy
 *      and the freed minimum cascades into the extra-payment pool.
 *
 * No DOM, no globals beyond `window.PFCDebtEngine`. Safe to import in
 * any context (Node, browser, worker).
 *
 * API:
 *   PFCDebtEngine.simulate(debts, monthlyBudget, strategy)
 *   PFCDebtEngine.compare(debts, monthlyBudget)
 */
(function () {
  'use strict';

  var MAX_MONTHS = 720; // 60-year safety cap
  var EPS = 0.005;

  function sanitizeDebts(debts) {
    if (!Array.isArray(debts)) return [];
    return debts
      .map(function (d, i) {
        var name = (d && d.name ? String(d.name) : 'Debt ' + (i + 1)).trim();
        var balance = num(d && d.balance, 0);
        var apr = num(d && d.apr, 0);
        var minPayment = num(d && d.minPayment, 0);
        return {
          id: i,
          name: name || ('Debt ' + (i + 1)),
          balance: Math.max(0, balance),
          apr: Math.max(0, apr),
          minPayment: Math.max(0, minPayment),
        };
      })
      .filter(function (d) { return d.balance > EPS; });
  }

  function num(v, fallback) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function totalMins(debts) {
    return debts.reduce(function (s, d) { return s + d.minPayment; }, 0);
  }

  function pickFocusIndex(active, strategy) {
    // active: array of {id, balance, apr, ...} with balance > EPS
    if (!active.length) return -1;
    var idx = 0;
    for (var i = 1; i < active.length; i++) {
      if (strategy === 'snowball') {
        if (active[i].balance < active[idx].balance) idx = i;
      } else { // avalanche default
        if (active[i].apr > active[idx].apr) idx = i;
      }
    }
    return idx;
  }

  /**
   * simulate(debts, monthlyBudget, strategy)
   *   debts:         [{name, balance, apr, minPayment}, …]
   *   monthlyBudget: total $/month available for all debts
   *   strategy:      'avalanche' | 'snowball'
   *
   * Returns:
   *   {
   *     totalMonths,                     // months until debt-free
   *     totalInterest,                   // $ interest paid across all debts
   *     totalPaid,                       // $ principal + interest paid
   *     monthlyPayment,                  // monthlyBudget actually used (capped)
   *     payoffOrder: [{name, monthPaidOff, totalPaid, totalInterest}],
   *     monthlyTimeline: [{month, balances:{name:bal,…}, totalRemaining}],
   *     feasible,                        // false if budget < minimums
   *     warning,                         // human-readable warning if infeasible
   *   }
   */
  function simulate(rawDebts, rawBudget, rawStrategy) {
    var debts = sanitizeDebts(rawDebts);
    var strategy = rawStrategy === 'snowball' ? 'snowball' : 'avalanche';
    var minSum = totalMins(debts);
    var budget = Math.max(0, num(rawBudget, 0));

    var empty = {
      totalMonths: 0,
      totalInterest: 0,
      totalPaid: 0,
      monthlyPayment: 0,
      payoffOrder: [],
      monthlyTimeline: [],
      feasible: true,
      warning: '',
      strategy: strategy,
    };

    if (!debts.length) return empty;

    // Working copy
    var pool = debts.map(function (d) {
      return {
        id: d.id,
        name: d.name,
        balance: d.balance,
        apr: d.apr,
        minPayment: d.minPayment,
        totalInterest: 0,
        totalPaid: 0,
        monthPaidOff: null,
      };
    });

    // Feasibility: budget must at least cover sum of mins (otherwise some
    // debts grow forever). If short, bump the budget to the minimum sum so
    // we still produce useful output, and flag a warning.
    var feasible = true;
    var warning = '';
    if (budget < minSum) {
      feasible = false;
      warning = 'Monthly budget is below the sum of minimum payments; using minimum total instead.';
      budget = minSum;
    }

    var timeline = [];
    var month = 0;
    var aprDivisor = 12 * 100;

    // Snapshot month 0 (starting balances)
    timeline.push(snapshot(0, pool));

    while (pool.some(function (d) { return d.balance > EPS; }) && month < MAX_MONTHS) {
      month++;

      // 1. Accrue interest on every active debt
      pool.forEach(function (d) {
        if (d.balance <= EPS) return;
        var i = d.balance * (d.apr / aprDivisor);
        d.balance += i;
        d.totalInterest += i;
        d.totalPaid += i;
      });

      // 2. Pay minimums on every active debt; freed budget = budget - mins paid
      var availableExtra = budget;
      pool.forEach(function (d) {
        if (d.balance <= EPS) return;
        var pay = Math.min(d.minPayment, d.balance);
        d.balance -= pay;
        d.totalPaid += pay;
        availableExtra -= pay;
      });
      if (availableExtra < 0) availableExtra = 0; // numerical safety

      // 3. Apply remaining budget to focused debt(s) per strategy.
      //    Loop in case a debt clears mid-month and there's leftover cash.
      while (availableExtra > EPS) {
        var active = pool.filter(function (d) { return d.balance > EPS; });
        if (!active.length) break;
        var focusIdx = pickFocusIndex(active, strategy);
        if (focusIdx < 0) break;
        var focus = active[focusIdx];
        var pay = Math.min(availableExtra, focus.balance);
        focus.balance -= pay;
        focus.totalPaid += pay;
        availableExtra -= pay;
      }

      // 4. Mark any newly-cleared debts
      pool.forEach(function (d) {
        if (d.balance <= EPS && d.monthPaidOff === null) {
          d.balance = 0;
          d.monthPaidOff = month;
        }
      });

      timeline.push(snapshot(month, pool));
    }

    var payoffOrder = pool
      .slice()
      .sort(function (a, b) {
        var am = a.monthPaidOff == null ? Infinity : a.monthPaidOff;
        var bm = b.monthPaidOff == null ? Infinity : b.monthPaidOff;
        return am - bm;
      })
      .map(function (d) {
        return {
          name: d.name,
          monthPaidOff: d.monthPaidOff,
          totalPaid: round2(d.totalPaid),
          totalInterest: round2(d.totalInterest),
        };
      });

    var totalInterest = pool.reduce(function (s, d) { return s + d.totalInterest; }, 0);
    var totalPaid = pool.reduce(function (s, d) { return s + d.totalPaid; }, 0);

    return {
      totalMonths: month,
      totalInterest: round2(totalInterest),
      totalPaid: round2(totalPaid),
      monthlyPayment: round2(budget),
      payoffOrder: payoffOrder,
      monthlyTimeline: timeline,
      feasible: feasible,
      warning: warning,
      strategy: strategy,
    };
  }

  function snapshot(month, pool) {
    var balances = {};
    var total = 0;
    pool.forEach(function (d) {
      var b = d.balance > EPS ? d.balance : 0;
      balances[d.name] = round2(b);
      total += b;
    });
    return { month: month, balances: balances, totalRemaining: round2(total) };
  }

  function round2(n) {
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
  }

  /**
   * compare(debts, monthlyBudget)
   * Runs both strategies and returns the head-to-head delta.
   *
   *   monthsSaved    = max(0, snowball.totalMonths - avalanche.totalMonths)
   *   interestSaved  = max(0, snowball.totalInterest - avalanche.totalInterest)
   *
   * Both deltas express how much avalanche beats snowball. (Avalanche is
   * mathematically optimal for total interest; snowball can match or
   * occasionally tie on time depending on debt composition.)
   */
  function compare(debts, monthlyBudget) {
    var avalanche = simulate(debts, monthlyBudget, 'avalanche');
    var snowball = simulate(debts, monthlyBudget, 'snowball');
    return {
      avalanche: avalanche,
      snowball: snowball,
      monthsSaved: Math.max(0, snowball.totalMonths - avalanche.totalMonths),
      interestSaved: round2(Math.max(0, snowball.totalInterest - avalanche.totalInterest)),
      feasible: avalanche.feasible && snowball.feasible,
      warning: avalanche.warning || snowball.warning || '',
    };
  }

  // ── Public API ─────────────────────────────────────────────────────────
  var api = {
    simulate: simulate,
    compare: compare,
    _internals: { sanitizeDebts: sanitizeDebts, pickFocusIndex: pickFocusIndex },
    VERSION: '1.0.0',
  };

  if (typeof window !== 'undefined') window.PFCDebtEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
