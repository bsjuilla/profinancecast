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

  /* ---------- US state — flat-rate approximations ----------
     Rough 2026 effective middle-bracket estimates. Suitable for a
     "free planning" calculator — NOT a tax-filing tool. State
     income taxes are progressive in most states; we collapse them
     to a single average effective rate for typical W-2 earners. */
  var US_STATES = {
    AL: { name: 'Alabama',         rate: 0.045,  note: 'approx middle bracket' },
    AK: { name: 'Alaska',          rate: 0.000,  note: 'no state income tax' },
    AZ: { name: 'Arizona',         rate: 0.025,  note: 'flat rate (2026)' },
    AR: { name: 'Arkansas',        rate: 0.039,  note: 'approx top bracket' },
    CA: { name: 'California',      rate: 0.060,  note: 'approx middle bracket' },
    CO: { name: 'Colorado',        rate: 0.044,  note: 'flat rate' },
    CT: { name: 'Connecticut',     rate: 0.050,  note: 'approx middle bracket' },
    DE: { name: 'Delaware',        rate: 0.052,  note: 'approx middle bracket' },
    FL: { name: 'Florida',         rate: 0.000,  note: 'no state income tax' },
    GA: { name: 'Georgia',         rate: 0.0539, note: 'flat rate (2026)' },
    HI: { name: 'Hawaii',          rate: 0.072,  note: 'approx middle bracket' },
    ID: { name: 'Idaho',           rate: 0.058,  note: 'flat rate' },
    IL: { name: 'Illinois',        rate: 0.0495, note: 'flat rate' },
    IN: { name: 'Indiana',         rate: 0.0305, note: 'flat rate' },
    IA: { name: 'Iowa',            rate: 0.038,  note: 'flat rate (2026)' },
    KS: { name: 'Kansas',          rate: 0.052,  note: 'approx middle bracket' },
    KY: { name: 'Kentucky',        rate: 0.040,  note: 'flat rate (2026)' },
    LA: { name: 'Louisiana',       rate: 0.030,  note: 'flat rate (2025+)' },
    ME: { name: 'Maine',           rate: 0.0675, note: 'approx middle bracket' },
    MD: { name: 'Maryland',        rate: 0.0475, note: 'approx middle bracket' },
    MA: { name: 'Massachusetts',   rate: 0.050,  note: 'flat rate' },
    MI: { name: 'Michigan',        rate: 0.0425, note: 'flat rate' },
    MN: { name: 'Minnesota',       rate: 0.068,  note: 'approx middle bracket' },
    MS: { name: 'Mississippi',     rate: 0.044,  note: 'flat rate (2026)' },
    MO: { name: 'Missouri',        rate: 0.047,  note: 'approx top bracket' },
    MT: { name: 'Montana',         rate: 0.059,  note: 'approx top bracket' },
    NE: { name: 'Nebraska',        rate: 0.052,  note: 'approx middle bracket' },
    NV: { name: 'Nevada',          rate: 0.000,  note: 'no state income tax' },
    NH: { name: 'New Hampshire',   rate: 0.000,  note: 'no wage tax (interest/dividends only)' },
    NJ: { name: 'New Jersey',      rate: 0.0637, note: 'approx middle bracket' },
    NM: { name: 'New Mexico',      rate: 0.049,  note: 'approx middle bracket' },
    NY: { name: 'New York',        rate: 0.055,  note: 'approx middle bracket' },
    NC: { name: 'North Carolina',  rate: 0.0425, note: 'flat rate (2026)' },
    ND: { name: 'North Dakota',    rate: 0.0204, note: 'approx top bracket' },
    OH: { name: 'Ohio',            rate: 0.035,  note: 'approx top bracket' },
    OK: { name: 'Oklahoma',        rate: 0.0475, note: 'approx top bracket' },
    OR: { name: 'Oregon',          rate: 0.088,  note: 'approx middle bracket' },
    PA: { name: 'Pennsylvania',    rate: 0.0307, note: 'flat rate' },
    RI: { name: 'Rhode Island',    rate: 0.0475, note: 'approx middle bracket' },
    SC: { name: 'South Carolina',  rate: 0.062,  note: 'approx top bracket' },
    SD: { name: 'South Dakota',    rate: 0.000,  note: 'no state income tax' },
    TN: { name: 'Tennessee',       rate: 0.000,  note: 'no wage tax (interest/dividends only)' },
    TX: { name: 'Texas',           rate: 0.000,  note: 'no state income tax' },
    UT: { name: 'Utah',            rate: 0.0455, note: 'flat rate (2026)' },
    VT: { name: 'Vermont',         rate: 0.066,  note: 'approx middle bracket' },
    VA: { name: 'Virginia',        rate: 0.0575, note: 'approx top bracket' },
    WA: { name: 'Washington',      rate: 0.000,  note: 'no state income tax' },
    WV: { name: 'West Virginia',   rate: 0.0482, note: 'approx middle bracket' },
    WI: { name: 'Wisconsin',       rate: 0.053,  note: 'approx middle bracket' },
    WY: { name: 'Wyoming',         rate: 0.000,  note: 'no state income tax' }
  };

  function usStateTax(annualIncome, state) {
    var income = clamp(annualIncome);
    var key = (state || '').toUpperCase();
    var s = US_STATES[key];
    if (!s) return { tax: 0, rate: 0, note: 'state not modeled' };
    return { tax: round2(income * s.rate), rate: s.rate, note: s.note };
  }

  /* ---------- UK 2026/27 income tax ----------
     England, Wales, Northern Ireland share the same bands.
     Scotland operates its own bands (starter, basic, intermediate,
     higher, advanced, top) at different thresholds and rates. */
  var UK_PERSONAL_ALLOWANCE = 12570;
  var UK_TAPER_THRESHOLD = 100000;
  var UK_BASIC_LIMIT = 50270;
  var UK_HIGHER_LIMIT = 125140;

  /* UK regions — drives band selection in ukIncomeTax. */
  var UK_REGIONS = {
    ENG: { name: 'England',          scottish: false },
    WLS: { name: 'Wales',            scottish: false },
    NIR: { name: 'Northern Ireland', scottish: false },
    SCT: { name: 'Scotland',         scottish: true  }
  };

  function ukPersonalAllowance(income) {
    if (income <= UK_TAPER_THRESHOLD) return UK_PERSONAL_ALLOWANCE;
    var reduction = Math.floor((income - UK_TAPER_THRESHOLD) / 2);
    return Math.max(0, UK_PERSONAL_ALLOWANCE - reduction);
  }

  /* Scottish 2026/27 bands (HMRC rates as legislated for SY26/27).
     Personal allowance is reserved at UK level — Scotland only sets
     the rates above PA. Thresholds shown are absolute income. */
  function scottishBrackets(pa) {
    return [
      { from: 0,        to: pa,      rate: 0     },     // personal allowance
      { from: pa,       to: 15397,   rate: 0.19  },     // starter rate
      { from: 15397,    to: 27491,   rate: 0.20  },     // basic rate
      { from: 27491,    to: 43662,   rate: 0.21  },     // intermediate
      { from: 43662,    to: 75000,   rate: 0.42  },     // higher
      { from: 75000,    to: 125140,  rate: 0.45  },     // advanced
      { from: 125140,   to: Infinity, rate: 0.48 }      // top
    ];
  }

  function rUKBrackets(pa) {
    return [
      { from: 0,                  to: pa,                 rate: 0    },
      { from: pa,                 to: UK_BASIC_LIMIT,     rate: 0.20 },
      { from: UK_BASIC_LIMIT,     to: UK_HIGHER_LIMIT,    rate: 0.40 },
      { from: UK_HIGHER_LIMIT,    to: Infinity,           rate: 0.45 }
    ];
  }

  function ukIncomeTax(annualIncome, region) {
    var income = clamp(annualIncome);
    var pa = ukPersonalAllowance(income);
    var key = (region || 'ENG').toUpperCase();
    var rg = UK_REGIONS[key] || UK_REGIONS.ENG;
    var brackets = rg.scottish ? scottishBrackets(pa) : rUKBrackets(pa);
    var result = applyBrackets(income, brackets);
    var effective = income > 0 ? result.tax / income : 0;
    return {
      tax: result.tax,
      marginalRate: result.marginalRate,
      effectiveRate: round2(effective * 10000) / 10000,
      brackets: result.brackets,
      personalAllowance: pa,
      region: key,
      regionName: rg.name
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
    var region = opts.region || 'ENG';
    var inc = ukIncomeTax(gross, region);
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
      country: 'UK',
      region: inc.region,
      regionName: inc.regionName
    };
  }

  root.PFCTaxEngine = {
    version: '1.1.0',
    taxYearUS: 2026,
    taxYearUK: '2026/27',
    states: US_STATES,
    ukRegions: UK_REGIONS,
    usFederalTax: usFederalTax,
    usFICA: usFICA,
    usStateTax: usStateTax,
    ukIncomeTax: ukIncomeTax,
    ukNI: ukNI,
    calculateUS: calculateUS,
    calculateUK: calculateUK
  };
})(typeof window !== 'undefined' ? window : this);
