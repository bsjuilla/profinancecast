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

  // ── payoffSimulate ─────────────────────────────────────────────────────
  // D-WORTH-2-FOLLOWUP (CEO call 2026-05-24) — alternative API for the
  // authenticated /debt-optimizer page. The /tools page uses `simulate`
  // above (with `apr` + `minPayment` fields + a `monthlyBudget` total);
  // /debt-optimizer historically had its OWN `calcPayoff` with `rate` +
  // `minPay` fields + an `extra` parameter and a richer output shape
  // (perDebt + negAmortDebts + failedToConverge + scheduled events).
  //
  // Rather than force one caller to migrate to the other's field names
  // (which would cascade through dashboard-2.js and the SEO page), this
  // function accepts a `fieldMap` parameter and returns the richer
  // calcPayoff-style output. /debt-optimizer's `calcPayoff` is now a
  // thin wrapper that delegates here.
  //
  // Internally re-uses the proven inner-loop from `simulate` above but
  // tracks per-debt totalInterest / clearedMonth / monthly events so the
  // authenticated page can render its month-by-month schedule + payoff
  // order card + negative-amortisation banner.
  //
  // API:
  //   payoffSimulate({ debts, strategy, extra, fieldMap })
  //     debts     — Array of caller's debt objects.
  //     strategy  — 'avalanche' | 'snowball'. Default 'avalanche'.
  //     extra     — Number, monthly extra payment beyond sum of minimums.
  //     fieldMap  — Optional map of engine field → caller field. Default
  //                 { balance, rate: 'rate', minPay: 'minPay',
  //                   name: 'name', type: 'type' }.
  //
  //   Returns: { months, totalInterest, totalPaid, schedule, perDebt,
  //              failedToConverge, negAmortDebts }
  //     — schedule: [{month, date, payment, balance, event}], date 'MMM YYYY'
  //     — perDebt:  [{...originalDebt, remaining, idx, totalInterestPaid,
  //                   clearedMonth}]
  //     — negAmortDebts: pre-flight list of debts whose monthly interest
  //                      exceeds their minPay (never converge at current min).
  function payoffSimulate(opts) {
    var o = opts || {};
    var fieldMap = Object.assign({
      balance: 'balance', rate: 'rate', minPay: 'minPay',
      name: 'name', type: 'type',
    }, o.fieldMap || {});
    var rawDebts = Array.isArray(o.debts) ? o.debts : [];
    var strategy = (o.strategy === 'snowball') ? 'snowball' : 'avalanche';
    var extra = Math.max(0, num(o.extra, 0));

    if (!rawDebts.length) return null;

    // Normalise into engine-internal field names. Preserve all caller
    // fields under the original keys too so output.perDebt[i] still has
    // .id, .type, etc. that the renderer expects.
    var pool = rawDebts.map(function (d, i) {
      var norm = Object.assign({}, d);
      norm.balance = num(d[fieldMap.balance], 0);
      norm.rate    = num(d[fieldMap.rate],    0);
      norm.minPay  = num(d[fieldMap.minPay],  0);
      norm.name    = String(d[fieldMap.name] != null ? d[fieldMap.name] : '');
      norm.type    = String(d[fieldMap.type] != null ? d[fieldMap.type] : 'other');
      norm.remaining = norm.balance;
      norm.idx = i;
      norm.totalInterestPaid = 0;
      norm.clearedMonth = null;
      return norm;
    });

    // Priority order computed once. For both strategies the relative
    // ordering doesn't need to change mid-simulation (avalanche: rates
    // are fixed; snowball: once the smallest balance clears the next-
    // smallest in the original sort is still next, because no other
    // balance can drop below a cleared debt's prior starting balance).
    var sorted = pool.slice().sort(function (a, b) {
      return strategy === 'avalanche'
        ? b.rate - a.rate
        : a.remaining - b.remaining;
    });

    // Upfront negative-amortisation detection — caller surfaces a banner
    // (debt-optimizer-2.js _renderNegAmortBanner). If any debt's monthly
    // interest > minPay it can never converge at the current minimum.
    var negAmortDebts = pool
      .filter(function (d) {
        return d.balance > 0 && (d.balance * (d.rate / 100 / 12)) > d.minPay;
      })
      .map(function (d) {
        return {
          name: d.name,
          monthlyInterest: Math.round(d.balance * (d.rate / 100 / 12)),
          minPay: d.minPay,
        };
      });

    var schedule = [];
    var month = 0;
    var maxMonths = 600; // 50-year cap (matches legacy calcPayoff cap)

    // Hoist base Date outside the loop (D-PERF-9). Per-iteration dates use
    // the 3-arg constructor — no setMonth churn.
    var now = new Date();
    var baseYear  = now.getFullYear();
    var baseMonth = now.getMonth();

    while (pool.some(function (d) { return d.remaining > 0.01; }) && month < maxMonths) {
      month++;
      var date = new Date(baseYear, baseMonth + month, 1);
      var dateStr = date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });

      var monthlyExtra = extra;
      // D-P0-3b (audit 2026-05-30): roll forward the minimum payments freed by
      // debts cleared in PRIOR months. The cascade harvest below only credits a
      // debt's minPay the single month it clears (clearedMonth === null); in
      // every later month that freed minimum was silently dropping out of the
      // budget, so the snowball/avalanche "roll-forward" never fully landed and
      // months-to-debt-free + total interest were overstated (the gap grew with
      // debt count). Re-adding prior-cleared minimums each month keeps the total
      // deployable budget constant = extra + Σ(all minimums).
      for (var _ci = 0; _ci < pool.length; _ci++) {
        if (pool[_ci].remaining <= 0 && pool[_ci].clearedMonth !== null && pool[_ci].clearedMonth < month) {
          monthlyExtra += pool[_ci].minPay;
        }
      }
      var totalPayment = 0;
      var event = '';

      // Accrue interest on every active debt.
      pool.forEach(function (d) {
        if (d.remaining <= 0) return;
        var interest = d.remaining * (d.rate / 100 / 12);
        d.remaining += interest;
        d.totalInterestPaid += interest;
      });

      // Pay minimums (capped at remaining).
      pool.forEach(function (d) {
        if (d.remaining <= 0) return;
        var pay = Math.min(d.minPay, d.remaining);
        d.remaining -= pay;
        d.remaining = Math.max(0, d.remaining);
        totalPayment += pay;
      });

      // D-P0-3 cascade fix: alternate apply-extra + harvest-freed-minimums
      // until both stabilise. Cleared debts' minimums cascade back into
      // monthlyExtra in the same month.
      var cascadeSafety = pool.length + 2;
      while (cascadeSafety-- > 0) {
        var applied = false;
        for (var si = 0; si < sorted.length; si++) {
          var sd = sorted[si];
          var d2 = null;
          for (var pi = 0; pi < pool.length; pi++) {
            if (pool[pi].idx === sd.idx) { d2 = pool[pi]; break; }
          }
          if (!d2 || d2.remaining <= 0) continue;
          if (monthlyExtra <= 0) break;
          var extraApplied = Math.min(monthlyExtra, d2.remaining);
          d2.remaining -= extraApplied;
          d2.remaining = Math.max(0, d2.remaining);
          totalPayment += extraApplied;
          monthlyExtra -= extraApplied;
          applied = true;
        }
        var harvested = false;
        pool.forEach(function (d) {
          if (d.remaining <= 0 && d.clearedMonth === null) {
            d.clearedMonth = month;
            event += (event ? ', ' : '') + d.name + ' cleared.';
            monthlyExtra += d.minPay;
            harvested = true;
          }
        });
        if (!applied && !harvested) break;
        if (monthlyExtra <= 0 && !harvested) break;
      }

      var totalRemaining = pool.reduce(function (s, d) {
        return s + Math.max(0, d.remaining);
      }, 0);
      schedule.push({
        month: month,
        date: dateStr,
        payment: Math.round(totalPayment),
        balance: Math.round(totalRemaining),
        event: event,
      });
    }

    var totalInterest = pool.reduce(function (s, d) {
      return s + d.totalInterestPaid;
    }, 0);
    var totalPaid = pool.reduce(function (s, d) {
      return s + d.balance;
    }, 0) + totalInterest;

    return {
      months: month,
      totalInterest: Math.round(totalInterest),
      totalPaid: Math.round(totalPaid),
      schedule: schedule,
      perDebt: pool,
      failedToConverge: month >= maxMonths && pool.some(function (d) { return d.remaining > 0.01; }),
      negAmortDebts: negAmortDebts,
    };
  }

  // ── Public API ─────────────────────────────────────────────────────────
  var api = {
    simulate: simulate,
    compare: compare,
    payoffSimulate: payoffSimulate,
    _internals: { sanitizeDebts: sanitizeDebts, pickFocusIndex: pickFocusIndex },
    VERSION: '1.1.0',
  };

  if (typeof window !== 'undefined') window.PFCDebtEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
