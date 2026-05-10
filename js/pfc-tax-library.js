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
  function applyBrackets(salary, brackets) {
    let owed = 0, prev = 0;
    for (const b of brackets) {
      const ceil = (b.upTo === null || b.upTo === undefined) ? Infinity : b.upTo;
      const inBand = Math.max(0, Math.min(salary, ceil) - prev);
      owed += inBand * b.rate;
      if (salary <= ceil) break;
      prev = ceil;
    }
    return owed;
  }

  /**
   * calculate({ countryCode, regionCode, salary }) → {
   *   incomeTax, social, regionTax, total, takeHome,
   *   effectiveRate, currency, symbol, breakdown: [{label, amount, kind}, ...]
   * }
   */
  function calculate({ countryCode, regionCode, salary }) {
    const country = ROOT.countries[countryCode];
    if (!country) throw new Error('Unknown country: ' + countryCode);
    salary = Math.max(0, Number(salary) || 0);

    let incomeTax = 0;
    if (country.kind === 'progressive' && Array.isArray(country.brackets)) {
      incomeTax = applyBrackets(salary, country.brackets);
    } else if (country.kind === 'flat' || country.kind === 'flat-approx') {
      const r = (country.flatRate != null ? country.flatRate
                : country.effectiveRate != null ? country.effectiveRate
                : 0);
      incomeTax = salary * r;
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
        // Signed adjustment to the federal scale — Spanish autonomous communities, Belgian regions.
        // Can be negative (e.g. Madrid -1.5%); represents a discount/surcharge applied on top of country brackets.
        regionTax = salary * region.rateDelta;
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
      currency: country.currency,
      symbol: country.symbol,
      breakdown
    };
  }

  ROOT.listCountries = listCountries;
  ROOT.getCountry    = getCountry;
  ROOT.listRegions   = listRegions;
  ROOT.calculate     = calculate;
})();
