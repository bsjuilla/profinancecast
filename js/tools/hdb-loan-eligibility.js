// js/tools/hdb-loan-eligibility.js — Singapore HDB loan eligibility & affordability calculator.
// Self-contained, CSP-safe, no dependencies, no Chart.js.
//
// Rules used (2026 — confirm current figures with HDB / MAS):
//   MSR cap  = 30% of gross monthly income (HDB flats + ECs only)
//   TDSR cap = 55% of gross monthly income minus existing debts (all property)
//   HDB concessionary-loan LTV = 75% (lowered from 80% in Aug 2024)
//   HDB concessionary-loan interest rate = 2.6% p.a.
//   Affordability stress-tested at a 4% medium-term rate floor (MAS rule)
//   HDB loan max tenure = 25 years
//   Income ceiling to qualify: ~S$14,000/mo families, S$7,000 singles (35+),
//   S$21,000 extended/multi-gen households — as of 2026, confirm with HDB.

(function () {
  'use strict';

  // Money formatter: "S$" + thousands-separated integer (e.g., S$454,667).
  function fmtMoney(n) {
    if (!isFinite(n) || isNaN(n)) n = 0;
    return 'S$' + Math.round(n).toLocaleString('en-SG');
  }

  function getEls() {
    return {
      income:    document.getElementById('hdb-income'),
      debts:     document.getElementById('hdb-debts'),
      household: document.getElementById('hdb-household'),
      tenure:    document.getElementById('hdb-tenure'),
      // outputs
      eligible:  document.getElementById('hdb-eligible'),
      binding:   document.getElementById('hdb-binding'),
      maxrepay:  document.getElementById('hdb-maxrepay'),
      maxloan:   document.getElementById('hdb-maxloan'),
      maxprice:  document.getElementById('hdb-maxprice'),
      downpay:   document.getElementById('hdb-downpay'),
      actual:    document.getElementById('hdb-actual'),
      note:      document.getElementById('hdb-note')
    };
  }

  function compute(els) {
    var income  = Math.max(0, +els.income.value || 0);
    var debts   = Math.max(0, +els.debts.value || 0);
    var tenureY = Math.min(25, Math.max(5, +els.tenure.value || 25));
    var household = els.household.value;
    var n = tenureY * 12;

    var MSRcap  = 0.30 * income;
    var TDSRcap = 0.55 * income - debts;
    var maxRepay = Math.max(0, Math.min(MSRcap, TDSRcap));
    var binding  = (MSRcap <= TDSRcap) ? 'MSR (30%)' : 'TDSR (55%)';

    var rStress = 0.04 / 12;
    var maxLoan = rStress > 0
      ? maxRepay * (1 - Math.pow(1 + rStress, -n)) / rStress
      : maxRepay * n;

    var maxPrice = maxLoan / 0.75;        // HDB concessionary loan LTV = 75%
    var downPay  = maxPrice * 0.25;       // 25% down payment

    var rActual = 0.026 / 12;             // HDB concessionary loan rate 2.6%
    var actualPMT = maxLoan > 0
      ? maxLoan * rActual / (1 - Math.pow(1 + rActual, -n))
      : 0;

    var ceiling = household === 'single'   ? 7000
                : household === 'extended' ? 21000
                : 14000;
    var eligible = income <= ceiling;

    return {
      income: income, debts: debts, tenureY: tenureY, household: household,
      MSRcap: MSRcap, TDSRcap: TDSRcap, maxRepay: maxRepay, binding: binding,
      maxLoan: maxLoan, maxPrice: maxPrice, downPay: downPay,
      actualPMT: actualPMT, ceiling: ceiling, eligible: eligible
    };
  }

  function render(els, r) {
    if (r.eligible) {
      els.eligible.textContent = '✓ Likely eligible for an HDB concessionary loan (2.6% p.a.)';
      els.eligible.className = 'val hero good';
    } else {
      els.eligible.textContent = 'Above the HDB loan income ceiling (S$'
        + r.ceiling.toLocaleString('en-SG')
        + '/mo) — you’d finance an HDB flat with a bank loan instead.';
      els.eligible.className = 'val hero warn';
    }

    els.binding.textContent   = r.binding;
    els.maxrepay.textContent  = fmtMoney(r.maxRepay);
    els.maxloan.textContent   = fmtMoney(r.maxLoan);
    els.maxprice.textContent  = fmtMoney(r.maxPrice);
    els.downpay.textContent   = fmtMoney(r.downPay);
    els.actual.textContent    = fmtMoney(r.actualPMT);

    // Honesty: the 2.6% "actual payment" only applies to an HDB concessionary
    // loan. A household above the income ceiling would use a BANK loan (a
    // different rate), so dim that row and caveat the note rather than imply a
    // 2.6% payment they can't access. (CSP-safe: element.style, no inline CSS.)
    var actualRow = els.actual.parentNode;
    if (actualRow) actualRow.style.opacity = r.eligible ? '' : '0.45';

    els.note.textContent = 'Assessed at the 4% medium-term stress rate (MAS rule); '
      + 'the actual HDB loan rate is 2.6%. Income ceiling shown is as of 2026 — '
      + 'confirm current figures with HDB. This is an estimate, not loan approval.'
      + (r.eligible ? '' : ' At your income you’d use a bank loan for an HDB flat, '
        + 'so the 2.6% figure above is illustrative only — your bank rate will differ.');
  }

  function run(els) {
    render(els, compute(els));
  }

  function init() {
    var els = getEls();
    if (!els.income || !els.eligible) return; // not on this page

    var inputs = [els.income, els.debts, els.household, els.tenure];
    inputs.forEach(function (el) {
      if (!el) return;
      el.addEventListener('input', function () { run(els); });
      el.addEventListener('change', function () { run(els); });
    });

    run(els); // show defaults on load
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
