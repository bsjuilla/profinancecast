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
  // DEF4 (Senior Architect 2026-05-25) — region-load cache. Stores either
  // the pending Promise (in-flight load) or `true` (loaded). Prevents
  // double-injection when multiple calculate() calls fire before the script
  // has finished evaluating.
  ROOT._regions = ROOT._regions || {};

  // DEF4 — `listCountries` now reads the MANIFEST (~3KB always loaded) so
  // the country dropdown populates immediately without waiting for any
  // region data. Falls back to ROOT.countries if manifest is missing (old
  // pages that haven't migrated to the manifest yet).
  function listCountries() {
    if (ROOT.manifest && typeof ROOT.manifest === 'object') {
      return Object.entries(ROOT.manifest)
        .map(([code, m]) => ({ code, name: m.name, currency: m.currency, hasRegions: !!m.hasRegions }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
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

  // DEF4 — `ensureCountry(code)` returns a Promise that resolves once the
  // region file containing this country has loaded. If already loaded, the
  // promise resolves immediately. If in-flight (concurrent calls), returns
  // the same cached promise. Rejects on script load error.
  //
  // Falls back to no-op success if the country is already in ROOT.countries
  // OR no manifest exists (old pages that still eager-load all regions).
  function ensureCountry(code) {
    if (ROOT.countries[code]) return Promise.resolve(); // already loaded
    if (!ROOT.manifest) return Promise.resolve(); // no manifest = eager mode
    const meta = ROOT.manifest[code];
    if (!meta) return Promise.reject(new Error('Unknown country: ' + code));
    const region = meta.region;
    if (ROOT._regions[region] === true) return Promise.resolve(); // region loaded
    if (ROOT._regions[region] && typeof ROOT._regions[region].then === 'function') {
      return ROOT._regions[region]; // in-flight — reuse
    }
    // Inject script. URL pinned via the same ?v= scheme used in HTML so a
    // cache-buster bump invalidates both eager and lazy loads identically.
    const promise = new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      // Path is relative to the HTML page's base URL. Both consumer pages
      // (/tools/take-home-pay.html and /salary-calculator.html) sit at
      // different depths — use absolute path so it works from both.
      // The version suffix comes from ROOT.dataVersion if set (HTML bumps
      // both manifest + lib + dataVersion together), else falls back to
      // a tagged 'lazy' suffix so the cache stays consistent.
      const ver = ROOT.dataVersion || '20260525-lazy';
      s.src = '/js/tax-library/' + region + '.js?v=' + ver;
      s.async = false; // preserve order if multiple regions load concurrently
      s.onload = function () {
        ROOT._regions[region] = true;
        resolve();
      };
      s.onerror = function () {
        delete ROOT._regions[region]; // allow retry
        reject(new Error('Failed to load tax data for ' + meta.name + ' (' + region + '). Check connection.'));
      };
      document.head.appendChild(s);
    });
    ROOT._regions[region] = promise;
    return promise;
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

  // DEF3-1 (2026-05-25) — centralized pension/retirement contribution rules
  // per country. Researched by Pension Rules Researcher agent against IRS /
  // HMRC / Revenue.ie / service-public.fr / BMF / Canada.ca / ATO / IRAS /
  // iDeCo / Belastingdienst / Agencia Tributaria / Legge di Bilancio /
  // Wikifin / UBS / PwC Sweden 2026 sources.
  //
  // Three treatments:
  //   'pre-tax'         — contribution reduces taxable income (US 401k, UK
  //                       pension, FR PER, etc.). Apply BEFORE bracket math.
  //   'post-tax-credit' — contribution is post-tax but generates a tax
  //                       credit (BE épargne-pension at 30%). Apply AFTER
  //                       bracket math by subtracting credit from tax owed.
  //   'none'            — no tax benefit (SE where ~90% covered by
  //                       occupational tjänstepension already handled by
  //                       employer payroll, not visible in net-pay calc).
  //
  // Caps in local currency. Centralized here (not on country records) so
  // future updates touch ONE file, not 3 region files. New countries get
  // 'none' by default until researched.
  const PENSION_RULES = {
    US: { treatment: 'pre-tax', cap: 24500, desc: 'Traditional 401(k)/403(b) contributions reduce federal taxable income up to $24,500/yr (2026 IRS limit; $32,500 with age-50 catch-up). Roth 401(k) is post-tax — model separately.', source: 'IRS Notice 2025-67' },
    UK: { treatment: 'pre-tax', cap: 60000, desc: 'Personal/workplace pension contributions get tax relief up to £60,000/yr (2026/27 Annual Allowance) or 100% of relevant UK earnings. Tapered down to £10k for incomes over £260k (not modeled).', source: 'HMRC 2026/27 Annual Allowance' },
    GB: { treatment: 'pre-tax', cap: 60000, desc: 'Personal/workplace pension contributions get tax relief up to £60,000/yr (2026/27 Annual Allowance) or 100% of relevant UK earnings. Tapered down to £10k for incomes over £260k (not modeled).', source: 'HMRC 2026/27 Annual Allowance' },
    IE: { treatment: 'pre-tax', cap: 28750, desc: 'PRSA/occupational contributions deduct from taxable income; cap shown is 25% × €115k earnings (age 40-49 middle band). Bands: 15% (<30), 20% (30-39), 25% (40-49), 30% (50-54), 35% (55-59), 40% (60+).', source: 'Revenue.ie pension relief limits' },
    FR: { treatment: 'pre-tax', cap: 37680, desc: 'PER individuel déductible from revenu imposable: 10% of prior-year professional income, floor €4,710 / ceiling €37,680 (2026). Unused allowance carries forward 5 yrs per Loi Finances 2026.', source: 'service-public.fr F14709 / LF 2026' },
    DE: { treatment: 'pre-tax', cap: 30826, desc: 'Rürup/Basisrente contributions deductible as Sonderausgaben up to €30,826/yr (single 2026) / €61,652 (married). Cap includes mandatory gesetzliche Rentenversicherung — typical employees have less headroom (~€5k-10k).', source: 'BMF 2026 Höchstbetrag' },
    CA: { treatment: 'pre-tax', cap: 33810, desc: 'RRSP contributions deduct from taxable income up to lesser of $33,810 (2026 CRA cap) or 18% of prior-year earned income, minus pension adjustment. Unused room carries forward.', source: 'Canada.ca MP/RRSP limits 2026' },
    AU: { treatment: 'pre-tax', cap: 32500, desc: 'Salary-sacrifice + personal deductible super up to $32,500 concessional cap (FY26-27, was $30k). Includes 12% employer SG — typical W-2 has limited headroom. Taxed at 15% inside fund.', source: 'ATO Concessional Cap FY26-27' },
    SG: { treatment: 'pre-tax', cap: 15300, desc: 'SRS contributions deduct from chargeable income up to S$15,300/yr (citizens & PR; S$35,700 for foreigners). Subject to overall S$80,000 personal relief cap. 50% of withdrawals taxable at retirement.', source: 'IRAS SRS Relief' },
    JP: { treatment: 'pre-tax', cap: 276000, desc: 'iDeCo contributions 100% deductible. Company employee with corporate DC: ¥23,000/mo (¥276,000/yr) shown. From Apr 2026 corporate DC limit rises to ¥62,000/mo.', source: 'iDeCo / Mercer Japan 2026' },
    NL: { treatment: 'pre-tax', cap: 35798, desc: 'Lijfrente premiums deductible from box-1 up to your jaarruimte (~30% of pensionable income minus accrued workplace pension, max €35,798/yr 2026). Most employees in good workplace schemes have minimal jaarruimte; cap shown is statutory max.', source: 'Belastingdienst jaarruimte 2026' },
    ES: { treatment: 'pre-tax', cap: 1500, desc: 'Plan de pensiones individual deducts from base imponible only €1,500/yr (or 30% of net work income, lower). Employment plans (plan de empleo) raise combined cap to €10,000 (€8,500 employer + €1,500 employee).', source: 'Agencia Tributaria IRPF 2025' },
    IT: { treatment: 'pre-tax', cap: 5300, desc: 'Fondo pensione / previdenza complementare deductible from reddito complessivo up to €5,300/yr (raised from €5,164.57 by Legge di Bilancio 2026). Includes both employee + employer contributions; TFR transferred to fund excluded.', source: 'Legge di Bilancio 2026' },
    BE: { treatment: 'post-tax-credit', cap: 1050, creditRate: 0.30, desc: 'Épargne-pension (3rd pillar) generates a 30% tax credit on contributions up to €1,050/yr (or 25% credit up to €1,350). Credit applied AFTER tax computed — not a base reduction. Available age 18-64.', source: 'Wikifin / CBC / FSMA 2026' },
    CH: { treatment: 'pre-tax', cap: 7258, desc: 'Pillar 3a fully deductible from federal, cantonal and municipal income up to CHF 7,258/yr (2026, employees with 2nd pillar). Self-employed without pension fund: up to CHF 36,288. From 2026 retroactive top-ups allowed.', source: 'UBS / Federal Tax Admin 2026' },
    SE: { treatment: 'none', cap: 0, desc: 'Private pension contributions NOT deductible for typical employees covered by occupational tjänstepension (~90% of workers). Employer tjänstepension is pre-tax at source up to 35% of salary / 10 prisbasbelopp.', source: 'PwC Sweden / Skatteverket' }
  };
  function getPensionRule(countryCode) {
    return PENSION_RULES[countryCode] || { treatment: 'none', cap: 0, desc: '', source: '' };
  }
  // Expose so the UI layer can read pension caps/descriptions for tooltips
  // without re-importing the rules.
  ROOT.getPensionRule = getPensionRule;

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
  // DEF4 (2026-05-25) — `calculate` is now ASYNC. Awaits ensureCountry so
  // the region's tax data is guaranteed loaded before the math runs.
  // Backward compat note: callers must `await Lib.calculate(...)` or
  // `.then(...)`. Pre-DEF4 callers that treated this synchronously will
  // get a Promise instead of the result object — surface failure mode.
  async function calculate({ countryCode, regionCode, salary, filingStatus, pensionContrib }) {
    await ensureCountry(countryCode);
    const country = ROOT.countries[countryCode];
    if (!country) throw new Error('Unknown country: ' + countryCode + ' (region failed to load)');
    salary = Math.max(0, Number(salary) || 0);
    // DEF3-1 (2026-05-25) — pension contribution handling. Capped at the
    // country's published cap AND at gross salary (you can't contribute more
    // than you earn). Pre-tax reduces taxable income BEFORE bracket math;
    // post-tax-credit applies AFTER tax math. Default 'none' → no effect.
    const pensionRule = getPensionRule(countryCode);
    const rawContrib = Math.max(0, Number(pensionContrib) || 0);
    const effContrib = (pensionRule.treatment === 'pre-tax' || pensionRule.treatment === 'post-tax-credit')
      ? Math.min(rawContrib, pensionRule.cap, salary)
      : 0;
    // For pre-tax: shrink the taxable salary feeding into bracket math.
    // For post-tax-credit (BE): leave salary alone, apply credit later.
    const taxableSalary = (pensionRule.treatment === 'pre-tax')
      ? Math.max(0, salary - effContrib)
      : salary;

    // ── Engine delegation for US + UK (correct math) ────────────────────
    // DEF3-1 (2026-05-25, hardened post-verifier) — pension reduces INCOME
    // TAX base only, NOT FICA / NI / state tax. Pre-tax 401k contributions
    // don't reduce SS/Medicare/state tax (with rare state exceptions). UK
    // personal pension contributions don't reduce NI (only salary-sacrifice
    // does, which we don't model). Call the engine TWICE — once with the
    // post-pension taxable amount to get federal/income tax, once with
    // gross to get FICA/state/NI. Combine into a single result.
    if (countryCode === 'US' && typeof window.PFCTaxEngine !== 'undefined' &&
        typeof window.PFCTaxEngine.calculateUS === 'function') {
      const engGross = window.PFCTaxEngine.calculateUS({
        grossAnnual: salary,
        state: regionCode || 'CA',
        filingStatus: filingStatus === 'mfj' ? 'mfj' : 'single'
      });
      const engTaxable = effContrib > 0 ? window.PFCTaxEngine.calculateUS({
        grossAnnual: taxableSalary,
        state: regionCode || 'CA',
        filingStatus: filingStatus === 'mfj' ? 'mfj' : 'single'
      }) : engGross;
      const fed = engTaxable.federal.tax;     // post-pension
      const fica = engGross.fica.total;        // GROSS (401k doesn't reduce FICA)
      const state = engGross.state.tax;        // GROSS (most states don't allow 401k deduction)
      const totalTax = fed + fica + state;
      // takeHome = gross - tax - pension (pension is yours, just deferred)
      const takeHome = Math.max(0, salary - totalTax - effContrib);
      const eff = salary > 0 ? totalTax / salary : 0;
      const breakdown = [
        { label: 'Gross income',                 amount: salary,   kind: 'gross' },
        ...(effContrib > 0 ? [{ label: '401(k) / retirement (pre-tax)', amount: -effContrib, kind: 'tax' }] : []),
        { label: 'Federal income tax',           amount: -fed,     kind: 'tax' },
        { label: 'FICA (Social Security + Medicare)', amount: -fica, kind: 'tax' },
        { label: regionCode ? (engGross.state.note ? 'State tax (' + regionCode + ')' : 'State tax') : 'State tax',
                                                 amount: -state,   kind: 'tax' },
        { label: 'Take-home',                    amount: takeHome, kind: 'net' }
      ].filter(r => r.kind === 'gross' || r.kind === 'net' || (r.label && r.amount !== 0));
      return {
        incomeTax: fed,
        social: fica,
        regionTax: state,
        total: totalTax,
        takeHome: takeHome,
        effectiveRate: eff,
        marginalRate: engGross.federal.marginalRate, // marginal at gross, not post-pension
        pensionApplied: effContrib,
        pensionTreatment: pensionRule.treatment,
        currency: country.currency,
        symbol: country.symbol,
        breakdown,
        engineSource: 'PFCTaxEngine.calculateUS (IRS Rev. Proc. 2024-40 + FICA 2026)'
      };
    }
    if (countryCode === 'GB' && typeof window.PFCTaxEngine !== 'undefined' &&
        typeof window.PFCTaxEngine.calculateUK === 'function') {
      const engGross = window.PFCTaxEngine.calculateUK({
        grossAnnual: salary,
        region: regionCode || 'ENG'
      });
      const engTaxable = effContrib > 0 ? window.PFCTaxEngine.calculateUK({
        grossAnnual: taxableSalary,
        region: regionCode || 'ENG'
      }) : engGross;
      const inc = engTaxable.incomeTax.tax;   // post-pension
      const ni = engGross.ni.ni;               // GROSS (personal pension doesn't reduce NI)
      const totalTax = inc + ni;
      const takeHome = Math.max(0, salary - totalTax - effContrib);
      const eff = salary > 0 ? totalTax / salary : 0;
      const breakdown = [
        { label: 'Gross income',          amount: salary,   kind: 'gross' },
        ...(effContrib > 0 ? [{ label: 'Pension (pre-tax)', amount: -effContrib, kind: 'tax' }] : []),
        { label: 'Income tax',            amount: -inc,     kind: 'tax' },
        { label: 'National Insurance',    amount: -ni,      kind: 'tax' },
        { label: 'Take-home',             amount: takeHome, kind: 'net' }
      ].filter(r => r.kind === 'gross' || r.kind === 'net' || (r.label && r.amount !== 0));
      return {
        incomeTax: inc,
        social: ni,
        regionTax: 0,
        total: totalTax,
        takeHome: takeHome,
        effectiveRate: eff,
        marginalRate: engGross.incomeTax.marginalRate,
        pensionApplied: effContrib,
        pensionTreatment: pensionRule.treatment,
        currency: country.currency,
        symbol: country.symbol,
        breakdown,
        engineSource: 'PFCTaxEngine.calculateUK (HMRC 2026/27)'
      };
    }

    // ── Library calculation for the other ~60 countries ─────────────────
    // DEF3-1 — feed taxableSalary (post pre-tax pension reduction) into
    // bracket math. Social contributions still apply to GROSS salary (e.g.
    // UK NI is on gross even though income tax is on post-pension).
    let incomeTax = 0;
    let marginalRate = 0; // DEF-2 — populated below for the teaching line
    if (country.kind === 'progressive' && Array.isArray(country.brackets)) {
      const d = applyBracketsDetailed(taxableSalary, country.brackets);
      incomeTax = d.tax;
      marginalRate = d.marginalRate;
    } else if (country.kind === 'flat' || country.kind === 'flat-approx') {
      const r = _resolveFlatRate(country);
      if (r != null) {
        incomeTax = taxableSalary * r;
        marginalRate = r;
      } else if (Array.isArray(country.brackets)) {
        const d = applyBracketsDetailed(taxableSalary, country.brackets);
        incomeTax = d.tax;
        marginalRate = d.marginalRate;
      }
    }
    // DEF3-1 — post-tax-credit treatment (BE épargne-pension at 30%).
    if (pensionRule.treatment === 'post-tax-credit' && effContrib > 0) {
      const credit = effContrib * (pensionRule.creditRate || 0);
      incomeTax = Math.max(0, incomeTax - credit);
    }

    let social = 0;
    if (country.socialRate) {
      // Social applies to GROSS salary (pre-pension) per common convention —
      // pension contributions reduce income tax but not employee NI/social.
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
    // DEF3-1 — take-home = gross - tax - pension (pension is deferred income,
    // not lost; the user keeps it in their retirement account).
    const takeHome = Math.max(0, salary - total - effContrib);
    const effectiveRate = salary > 0 ? total / salary : 0;

    const breakdown = [
      { label: 'Gross income',                 amount: salary,     kind: 'gross' },
      ...(effContrib > 0 ? [{
        label: pensionRule.treatment === 'pre-tax'
          ? 'Pension/retirement (pre-tax)'
          : pensionRule.treatment === 'post-tax-credit'
            ? 'Pension (post-tax, ' + Math.round((pensionRule.creditRate || 0) * 100) + '% credit applied)'
            : 'Pension',
        amount: -effContrib,
        kind: 'tax'
      }] : []),
      { label: 'Income tax',                   amount: -incomeTax, kind: 'tax' },
      { label: 'Social contributions',         amount: -social,    kind: 'tax' },
      { label: country.hasRegions ? 'Regional/state tax' : '',
        amount: -regionTax, kind: 'tax' },
      { label: 'Take-home',                    amount: takeHome,   kind: 'net' }
    ].filter(r => (r.kind === 'gross' || r.kind === 'net') || (r.label && r.amount !== 0));

    return {
      incomeTax, social, regionTax, total, takeHome,
      effectiveRate,
      marginalRate,
      pensionApplied: effContrib,
      pensionTreatment: pensionRule.treatment,
      currency: country.currency,
      symbol: country.symbol,
      breakdown,
      engineSource: 'PFCTaxLibrary.calculate (' + (country.source || country.kind) + ')'
    };
  }

  ROOT.listCountries  = listCountries;
  ROOT.getCountry     = getCountry;
  ROOT.listRegions    = listRegions;
  ROOT.calculate      = calculate;
  ROOT.ensureCountry  = ensureCountry; // DEF4 — exposed so consumers can pre-warm
})();
