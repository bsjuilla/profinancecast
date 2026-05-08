/* ============================================================
   pfc-tax-engine.js
   Pure-JS tax calculator powering /tools/take-home-pay.html
   No DOM, no globals beyond window.PFCTaxEngine.
   Tax data: 2026 US federal (projected) + FICA + 5 states,
             2026/27 UK income tax + Class-1 NI.
   All figures are estimates for planning. Not tax advice.
   ============================================================ */
(function (root) {
  'use strict';

  /* ---------- shared helpers ---------- */
  function clamp(n) {
    n = Number(n);
    if (!isFinite(n) || n < 0) return 0;
    return n;
  }
  function round2(n) { return Math.round(n * 100) / 100; }

  /* Apply a list of progressive brackets to an income.
     brackets: [{from, to, rate}], to may be Infinity. */
  function applyBrackets(income, brackets) {
    var taxOwed = 0;
    var detail = [];
    var marginal = 0;
    for (var i = 0; i < brackets.length; i++) {
      var b = brackets[i];
      var span = Math.max(0, Math.min(b.to, income) - b.from);
      if (span <= 0) {
        detail.push({ from: b.from, to: b.to, rate: b.rate, amount: 0 });
        continue;
      }
      var amt = span * b.rate;
      taxOwed += amt;
      detail.push({ from: b.from, to: b.to, rate: b.rate, amount: round2(amt) });
      if (income > b.from) marginal = b.rate;
    }
    return { tax: round2(taxOwed), marginalRate: marginal, brackets: detail };
  }

  /* ---------- US federal — 2026 projected brackets ----------
     Inflation-adjusted from the 2025 IRS schedule.
     Standard deductions: Single $15,750; MFJ $31,500.        */
  var US_FED_2026 = {
    single: {
      stdDeduction: 15750,
      brackets: [
        { from: 0,       to: 11925,    rate: 0.10 },
        { from: 11925,   to: 48475,    rate: 0.12 },
        { from: 48475,   to: 103350,   rate: 0.22 },
        { from: 103350,  to: 197300,   rate: 0.24 },
        { from: 197300,  to: 250525,   rate: 0.32 },
        { from: 250525,  to: 626350,   rate: 0.35 },
        { from: 626350,  to: Infinity, rate: 0.37 }
      ]
    },
    mfj: {
      stdDeduction: 31500,
      brackets: [
        { from: 0,       to: 23850,    rate: 0.10 },
        { from: 23850,   to: 96950,    rate: 0.12 },
        { from: 96950,   to: 206700,   rate: 0.22 },
        { from: 206700,  to: 394600,   rate: 0.24 },
        { from: 394600,  to: 501050,   rate: 0.32 },
        { from: 501050,  to: 751600,   rate: 0.35 },
        { from: 751600,  to: Infinity, rate: 0.37 }
      ]
    }
  };

  function usFederalTax(annualIncome, filingStatus) {
    var income = clamp(annualIncome);
    var key = (filingStatus === 'mfj' || filingStatus === 'married') ? 'mfj' : 'single';
    var schedule = US_FED_2026[key];
    var taxable = Math.max(0, income - schedule.stdDeduction);
    var result = applyBrackets(taxable, schedule.brackets);
    var effective = income > 0 ? result.tax / income : 0;
    return {
      tax: result.tax,
      marginalRate: result.marginalRate,
      effectiveRate: round2(effective * 10000) / 10000,
      brackets: result.brackets,
      stdDeduction: schedule.stdDeduction,
      taxableIncome: round2(taxable)
    };
  }

  /* ---------- US FICA (employee share) ----------
     Social Security: 6.2% up to wage base $176,100 (2026 est.)
     Medicare: 1.45% on all wages
     Additional Medicare: 0.9% on wages over $200k.            */
  var SS_RATE = 0.062;
  var SS_WAGE_BASE_2026 = 176100;
  var MEDICARE_RATE = 0.0145;
  var ADDL_MEDICARE_RATE = 0.009;
  var ADDL_MEDICARE_THRESHOLD = 200000;

  function usFICA(annualIncome) {
    var income = clamp(annualIncome);
    var ss = Math.min(income, SS_WAGE_BASE_2026) * SS_RATE;
    var medicare = income * MEDICARE_RATE;
    var addl = Math.max(0, income - ADDL_MEDICARE_THRESHOLD) * ADDL_MEDICARE_RATE;
    medicare += addl;
    return { ss: round2(ss), medicare: round2(medicare), total: round2(ss + medicare) };
  }

  /* ---------- US state — flat-rate approximations ---------- */
  var US_STATES = {
    CA: { name: 'California',  rate: 0.060,  note: 'approx middle bracket' },
    NY: { name: 'New York',    rate: 0.055,  note: 'approx middle bracket' },
    TX: { name: 'Texas',       rate: 0.000,  note: 'no state income tax' },
    FL: { name: 'Florida',     rate: 0.000,  note: 'no state income tax' },
    IL: { name: 'Illinois',    rate: 0.0495, note: 'flat rate' }
  };

  function usStateTax(annualIncome, state) {
    var income = clamp(annualIncome);
    var key = (state || '').toUpperCase();
    var s = US_STATES[key];
    if (!s) return { tax: 0, rate: 0, note: 'state not modeled' };
    return { tax: round2(income * s.rate), rate: s.rate, note: s.note };
  }

  /* ---------- UK 2026/27 income tax ---------- */
  var UK_PERSONAL_ALLOWANCE = 12570;
  var UK_TAPER_THRESHOLD = 100000;
  var UK_BASIC_LIMIT = 50270;
  var UK_HIGHER_LIMIT = 125140;

  function ukPersonalAllowance(income) {
    if (income <= UK_TAPER_THRESHOLD) return UK_PERSONAL_ALLOWANCE;
    var reduction = Math.floor((income - UK_TAPER_THRESHOLD) / 2);
    return Math.max(0, UK_PERSONAL_ALLOWANCE - reduction);
  }

  function ukIncomeTax(annualIncome) {
    var income = clamp(annualIncome);
    var pa = ukPersonalAllowance(income);
    var brackets = [
      { from: 0,                  to: pa,                 rate: 0    },
      { from: pa,                 to: UK_BASIC_LIMIT,     rate: 0.20 },
      { from: UK_BASIC_LIMIT,     to: UK_HIGHER_LIMIT,    rate: 0.40 },
      { from: UK_HIGHER_LIMIT,    to: Infinity,           rate: 0.45 }
    ];
    var result = applyBrackets(income, brackets);
    var effective = income > 0 ? result.tax / income : 0;
    return {
      tax: result.tax,
      marginalRate: result.marginalRate,
      effectiveRate: round2(effective * 10000) / 10000,
      brackets: result.brackets,
      personalAllowance: pa
    };
  }

  /* ---------- UK Class-1 employee NI 2026/27 ---------- */
  var UK_NI_LOWER = 12570;
  var UK_NI_UPPER = 50270;

  function ukNI(annualIncome) {
    var income = clamp(annualIncome);
    var ni = 0;
    if (income > UK_NI_LOWER) ni += (Math.min(income, UK_NI_UPPER) - UK_NI_LOWER) * 0.08;
    if (income > UK_NI_UPPER) ni += (income - UK_NI_UPPER) * 0.02;
    return { ni: round2(ni) };
  }

  /* ---------- Aggregators ---------- */
  function calculateUS(opts) {
    opts = opts || {};
    var gross = clamp(opts.grossAnnual);
    var state = opts.state || 'CA';
    var status = opts.filingStatus || 'single';
    var fed = usFederalTax(gross, status);
    var fica = usFICA(gross);
    var st = usStateTax(gross, state);
    var totalTax = fed.tax + fica.total + st.tax;
    var takeHome = Math.max(0, gross - totalTax);
    var effective = gross > 0 ? totalTax / gross : 0;
    return {
      gross: round2(gross),
      federal: fed, fica: fica, state: st,
      totalTax: round2(totalTax),
      takeHome: round2(takeHome),
      takeHomeMonthly: round2(takeHome / 12),
      takeHomePerHour: round2(takeHome / 2080),
      takeHomeRatio: gross > 0 ? round2((takeHome / gross) * 10000) / 10000 : 0,
      marginalRate: fed.marginalRate,
      effectiveRate: round2(effective * 10000) / 10000,
      country: 'US', stateCode: state, filingStatus: status
    };
  }

  function calculateUK(opts) {
    opts = opts || {};
    var gross = clamp(opts.grossAnnual);
    var inc = ukIncomeTax(gross);
    var ni = ukNI(gross);
    var totalTax = inc.tax + ni.ni;
    var takeHome = Math.max(0, gross - totalTax);
    var effective = gross > 0 ? totalTax / gross : 0;
    return {
      gross: round2(gross),
      incomeTax: inc, ni: ni,
      totalTax: round2(totalTax),
      takeHome: round2(takeHome),
      takeHomeMonthly: round2(takeHome / 12),
      takeHomePerHour: round2(takeHome / 2080),
      takeHomeRatio: gross > 0 ? round2((takeHome / gross) * 10000) / 10000 : 0,
      marginalRate: inc.marginalRate,
      effectiveRate: round2(effective * 10000) / 10000,
      country: 'UK'
    };
  }

  root.PFCTaxEngine = {
    version: '1.0.0',
    taxYearUS: 2026,
    taxYearUK: '2026/27',
    states: US_STATES,
    usFederalTax: usFederalTax,
    usFICA: usFICA,
    usStateTax: usStateTax,
    ukIncomeTax: ukIncomeTax,
    ukNI: ukNI,
    calculateUS: calculateUS,
    calculateUK: calculateUK
  };
})(typeof window !== 'undefined' ? window : this);
