/**
 * pfc-health-score.js — the ONE canonical financial-health score.
 *
 * Before this module, the dashboard, the Report Card, and the Scenarios page
 * each computed "financial health" with a DIFFERENT formula, so the same user
 * saw three different scores (e.g. dashboard 83, report-card 25, scenarios 50).
 * That's a trust-killer. This is the single source of truth — all three call
 * PFCHealthScore.compute() with the same input contract, so they always agree.
 *
 * The formula is the (most-developed) Report Card one: four equal-weighted
 * 0–100 sub-scores — savings rate, debt load, emergency fund, spending control.
 *
 * Input contract (all optional, coerced to non-negative numbers):
 *   { income, expenses, debtPay, savings }
 *   - income   : total monthly income (salary + other)
 *   - expenses : total monthly expenses (housing + food + transport + other)
 *   - debtPay  : monthly debt repayment
 *   - savings  : liquid savings (the emergency-fund pool; NOT investments —
 *                kept savings-only so every surface measures the same thing)
 *
 * Returns: { total, savScore, debtScore, emgScore, spendScore,
 *            savRate, debtRatio, emergency, spendPct, surplus }
 *   total is the rounded 0–100 headline number.
 */
(function (root) {
  'use strict';

  function _num(v) {
    var n = Number(v);
    return (isFinite(n) && n > 0) ? n : 0;
  }

  function compute(f) {
    f = f || {};
    var income   = _num(f.income);
    var expenses = _num(f.expenses);
    var debtPay  = _num(f.debtPay);
    var savings  = _num(f.savings);

    var surplus   = income - expenses - debtPay;
    var savRate   = income > 0 ? Math.max(0, surplus) / income : 0;
    var debtRatio = income > 0 ? debtPay / income : 0;
    var emergency = expenses > 0 ? savings / expenses : 0; // months of expenses
    var spendPct  = income > 0 ? expenses / income : 1;

    var savScore   = Math.min(100, savRate * 400);
    var debtScore  = Math.max(0, 100 - debtRatio * 280);
    var emgScore   = Math.min(100, (emergency / 6) * 100);
    var spendScore = Math.max(0, Math.min(100, (1 - spendPct / 0.85) * 100));

    var total = Math.round(savScore * 0.25 + debtScore * 0.25 + emgScore * 0.25 + spendScore * 0.25);

    return {
      total: total,
      savScore: savScore, debtScore: debtScore, emgScore: emgScore, spendScore: spendScore,
      savRate: savRate, debtRatio: debtRatio, emergency: emergency, spendPct: spendPct, surplus: surplus,
    };
  }

  root.PFCHealthScore = { compute: compute };
})(typeof window !== 'undefined' ? window : this);
