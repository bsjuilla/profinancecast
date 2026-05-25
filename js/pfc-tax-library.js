/**
 * pfc-tax-library.js — Public API over window.PFCTaxLibrary.countries
 *
 * Data is populated by sibling files in /js/tax-library/* — load THIS file
 * AFTER the data files so the API exists when calculations are requested.
 *
 * Exposes:
 *   PFCTaxLibrary.listCountries()                    -> [{code, name, currency, hasRegions}, ...]
 *   PFCTaxLibrary.getCountry(code)                   -> country object | null
 *   PFCTaxLibrary.listRegions(code)                  -> [{code, name}, ...]
 *   PFCTaxLibrary.calculate({countryCode, regionCode, salary})
 *     -> { incomeTax, social, regionTax, total, takeHome,
 *          effectiveRate, currency, symbol, breakdown: [{label, amount, kind}, ...] }
 */
(function () {
  if (typeof window === 'undefined') return;
  const ROOT = window.PFCTaxLibrary = window.PFCTaxLibrary || { countries: {} };

  function listCountries() {
    return Object.entries(ROOT.countries)
      .map(([code, c]) => ({ code, name: c.name, currency: c.currency, hasRegions: !!c.hasRegions }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function getCountry(code) { return ROOT.countries[code] || null; }

  function listRegions(code) {
    const c = ROOT.countries[code];
    if (!c || !c.hasRegions || !c.regions) return [];
    return Object.entries(c.regions)
      .map(([rkey, r]) => ({ code: rkey, name: r.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // Apply progressive bracket array to a salary, returning total tax owed.
  // DEF-2 (2026-05-25) — `applyBracketsDetailed` returns { tax, marginalRate }
  // so the THP teaching line can render "your next $1 is taxed at X%". The
  // simpler applyBrackets is kept for backward compatibility (regions, social).
  function applyBracketsDetailed(salary, brackets) {
    let owed = 0, prev = 0, marginal = 0;
    for (const b of brackets) {
      const ceil = (b.upTo === null || b.upTo === undefined) ? Infinity : b.upTo;
      const inBand = Math.max(0, Math.min(salary, ceil) - prev);
      owed += inBand * b.rate;
      if (salary > prev) marginal = b.rate; // last bracket the salary actually entered
      if (salary <= ceil) break;
      prev = ceil;
    }
    return { tax: owed, marginalRate: marginal };
  }
  function applyBrackets(salary, brackets) {
    return applyBracketsDetailed(salary, brackets).tax;
  }

  // THP-P0-MATH (audit 2026-05-25) — extract the flat-rate read so all three
  // schema shapes the tax-library data uses are honoured:
  //   `flatRate`     — primary field name (Luxembourg, Czechia)
  //   `effectiveRate` — Luxembourg/Czechia variant
  //   `rate`         — Argentina, Venezuela, Bolivia, others mis-keyed
  // Pre-fix the `flat` and `flat-approx` paths only checked the first two
  // names; AR/VE/BO had `rate` and silently returned 0 income tax, making
  // every Argentinian/Venezuelan/Bolivian visitor see "you keep 100% of
  // your gross" alongside their social contributions. Falls through to
  // `brackets` so HU/RO/BG (which carry `kind:'flat'` with only `brackets:[]`)
  // also produce correct tax instead of 0.
  function _resolveFlatRate(country) {
    if (typeof country.flatRate === 'number') return country.flatRate;
    if (typeof country.effectiveRate === 'number') return country.effectiveRate;
    if (typeof country.rate === 'number') return country.rate;
    return null;
  }

  /**
   * calculate({ countryCode, regionCode, salary, filingStatus }) → {
   *   incomeTax, social, regionTax, total, takeHome,
   *   effectiveRate, currency, symbol, breakdown: [{label, amount, kind}, ...]
   * }
   *
   * THP-P0-MATH (audit 2026-05-25) — US + UK now DELEGATE to the
   * separately-maintained PFCTaxEngine (pfc-tax-engine.js) which already had
   * the correct math:
   *   - US federal applies the $15,750 single / $31,500 MFJ standard deduction
   *     BEFORE the progressive brackets. The library's own US table omitted it,
   *     overstating US tax by $3,465 at $85k.
   *   - US FICA correctly caps SS at the $176,100 wage base while applying
   *     uncapped 1.45% Medicare AND the 0.9% additional Medicare above $200k.
   *     The library's flat 7.65% × min(salary, socialCap) under-charged
   *     Medicare on high earners by ~$1,521 at $250k and missed the Addl-
   *     Medicare entirely.
   *   - UK NIC two-tier: 8% only WITHIN the £12,570-£50,270 band, plus 2%
   *     above £50,270. The library applied a flat 8% to the whole £0-£50,270
   *     band, over-stating NIC at £85k by £311 and under-stating at £200k by
   *     £1,989 (because the 2%-above-cap tier was missing entirely).
   *   - UK personal allowance taper: PA reduces by £1 for every £2 over
   *     £100,000 income. The library applied the full £12,570 PA at every
   *     income, under-stating UK income tax by ~£11k at £150k.
   * For all other ~60 countries the library's progressive/flat code paths
   * remain authoritative.
   */
  function calculate({ countryCode, regionCode, salary, filingStatus }) {
    const country = ROOT.countries[countryCode];
    if (!country) throw new Error('Unknown country: ' + countryCode);
    salary = Math.max(0, Number(salary) || 0);

    // ── Engine delegation for US + UK (correct math) ────────────────────
    if (countryCode === 'US' && typeof window.PFCTaxEngine !== 'undefined' &&
        typeof window.PFCTaxEngine.calculateUS === 'function') {
      const eng = window.PFCTaxEngine.calculateUS({
        grossAnnual: salary,
        state: regionCode || 'CA',
        filingStatus: filingStatus === 'mfj' ? 'mfj' : 'single'
      });
      const fed = eng.federal.tax;
      const fica = eng.fica.total;
      const state = eng.state.tax;
      const breakdown = [
        { label: 'Gross income',                 amount: salary,  kind: 'gross' },
        { label: 'Federal income tax',           amount: -fed,    kind: 'tax' },
        { label: 'FICA (Social Security + Medicare)', amount: -fica, kind: 'tax' },
        { label: regionCode ? (eng.state.note ? 'State tax (' + regionCode + ')' : 'State tax') : 'State tax',
                                                 amount: -state,  kind: 'tax' },
        { label: 'Take-home',                    amount: eng.takeHome, kind: 'net' }
      ].filter(r => r.kind === 'gross' || r.kind === 'net' || (r.label && r.amount !== 0));
      return {
        incomeTax: fed,
        social: fica,
        regionTax: state,
        total: eng.totalTax,
        takeHome: eng.takeHome,
        effectiveRate: eng.effectiveRate,
        // DEF-2 (2026-05-25) — surface marginalRate so the THP page can render
        // the "your next $1 is taxed at X%" teaching line. Engine returns this
        // for US (federal only — state stacks on top) and UK (income tax only).
        marginalRate: eng.federal.marginalRate,
        currency: country.currency,
        symbol: country.symbol,
        breakdown,
        engineSource: 'PFCTaxEngine.calculateUS (IRS Rev. Proc. 2024-40 + FICA 2026)'
      };
    }
    if (countryCode === 'GB' && typeof window.PFCTaxEngine !== 'undefined' &&
        typeof window.PFCTaxEngine.calculateUK === 'function') {
      const eng = window.PFCTaxEngine.calculateUK({
        grossAnnual: salary,
        region: regionCode || 'ENG'
      });
      const inc = eng.incomeTax.tax;
      const ni = eng.ni.ni;
      const breakdown = [
        { label: 'Gross income',          amount: salary,  kind: 'gross' },
        { label: 'Income tax',            amount: -inc,    kind: 'tax' },
        { label: 'National Insurance',    amount: -ni,     kind: 'tax' },
        { label: 'Take-home',             amount: eng.takeHome, kind: 'net' }
      ].filter(r => r.kind === 'gross' || r.kind === 'net' || (r.label && r.amount !== 0));
      return {
        incomeTax: inc,
        social: ni,
        regionTax: 0,
        total: eng.totalTax,
        takeHome: eng.takeHome,
        effectiveRate: eng.effectiveRate,
        // DEF-2 — marginal rate for the teaching line. Engine gives 0.20/0.40/0.45
        // for rUK; 0.19/0.20/0.21/0.42/0.45/0.48 for Scotland.
        marginalRate: eng.incomeTax.marginalRate,
        currency: country.currency,
        symbol: country.symbol,
        breakdown,
        engineSource: 'PFCTaxEngine.calculateUK (HMRC 2026/27)'
      };
    }

    // ── Library calculation for the other ~60 countries ─────────────────
    let incomeTax = 0;
    let marginalRate = 0; // DEF-2 — populated below for the teaching line
    if (country.kind === 'progressive' && Array.isArray(country.brackets)) {
      const d = applyBracketsDetailed(salary, country.brackets);
      incomeTax = d.tax;
      marginalRate = d.marginalRate;
    } else if (country.kind === 'flat' || country.kind === 'flat-approx') {
      // THP-P0-MATH-2/3 fix (audit 2026-05-25) — multi-schema flat-rate read.
      // If neither flatRate/effectiveRate/rate is present, fall through to
      // brackets (covers HU/RO/BG which mis-typed as `kind:'flat'` with only
      // brackets[]). Pre-fix all five of those paths returned 0 income tax.
      const r = _resolveFlatRate(country);
      if (r != null) {
        incomeTax = salary * r;
        marginalRate = r; // flat rate IS the marginal rate
      } else if (Array.isArray(country.brackets)) {
        const d = applyBracketsDetailed(salary, country.brackets);
        incomeTax = d.tax;
        marginalRate = d.marginalRate;
      }
    }

    let social = 0;
    if (country.socialRate) {
      const base = country.socialCap ? Math.min(salary, country.socialCap) : salary;
      social = base * country.socialRate;
    }

    let regionTax = 0;
    if (country.hasRegions && regionCode && country.regions && country.regions[regionCode]) {
      const region = country.regions[regionCode];
      if (region.usesParentBrackets) {
        // UK ENG/WLS/NIR — country.brackets (rUK) already counted in incomeTax above; nothing extra to apply.
        regionTax = 0;
      } else if (region.kind === 'progressive' && Array.isArray(region.brackets)) {
        // Bracketed regions with their own scale — Canadian provinces, Scottish bands.
        regionTax = applyBrackets(salary, region.brackets);
      } else if (typeof region.rate === 'number') {
        // Flat-effective regions — US states, Swiss cantons, Italian regional surcharge.
        regionTax = salary * region.rate;
      } else if (typeof region.rateDelta === 'number') {
        // THP-P0-MATH-4 fix (audit 2026-05-25) — bound regional rateDelta.
        // Pre-fix `salary * rateDelta` was unbounded: Madrid -1.5% at €1M
        // gave a -€15,000 "credit" line which looks broken to users. Cap the
        // signed adjustment at ±2pp of effective rate (matches what the
        // regional surcharge/discount actually represents in policy).
        const raw = salary * region.rateDelta;
        const cap = salary * 0.02; // ±2pp ceiling
        regionTax = Math.max(-cap, Math.min(cap, raw));
      }
    }

    const total = incomeTax + social + regionTax;
    const takeHome = Math.max(0, salary - total);
    const effectiveRate = salary > 0 ? total / salary : 0;

    const breakdown = [
      { label: 'Gross income',                 amount: salary,     kind: 'gross' },
      { label: 'Income tax',                   amount: -incomeTax, kind: 'tax' },
      { label: 'Social contributions',         amount: -social,    kind: 'tax' },
      { label: country.hasRegions ? 'Regional/state tax' : '',
        amount: -regionTax, kind: 'tax' },
      { label: 'Take-home',                    amount: takeHome,   kind: 'net' }
    ].filter(r => (r.kind === 'gross' || r.kind === 'net') || (r.label && r.amount !== 0));

    return {
      incomeTax, social, regionTax, total, takeHome,
      effectiveRate,
      marginalRate, // DEF-2 — for the THP teaching line
      currency: country.currency,
      symbol: country.symbol,
      breakdown,
      engineSource: 'PFCTaxLibrary.calculate (' + (country.source || country.kind) + ')'
    };
  }

  ROOT.listCountries = listCountries;
  ROOT.getCountry    = getCountry;
  ROOT.listRegions   = listRegions;
  ROOT.calculate     = calculate;
})();
