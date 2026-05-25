(function () {
  'use strict';

  // Default country code on first load. Falls back to first available if 'US' isn't loaded.
  var DEFAULT_COUNTRY = 'US';
  // Default region per country when first switching (otherwise we leave the dropdown's first item).
  var DEFAULT_REGIONS = { US: 'CA', GB: 'ENG', UK: 'ENG', CA: 'ON', CH: 'ZH' };

  // DEF-3 (2026-05-25) — country-specific standard working hours per year.
  // Pre-fix the page hardcoded 2080 (US standard: 40h × 52w) for ALL
  // countries, overstating per-hour wage for everyone outside the US by
  // 7-30%. Numbers sourced from OECD Employment Outlook + national stats:
  //   US 2080 (40×52, BLS baseline)
  //   UK 1950 (37.5×52, ONS Annual Survey of Hours and Earnings)
  //   IE 1950 (37.5×52, CSO Earnings & Labour Costs)
  //   FR 1607 (35h legal week × 45.9 effective weeks, Insee — la durée légale)
  //   DE 1656 (38h × 43.6 effective weeks after paid leave + holidays)
  //   CA 2000 (37.5×52 → most provinces; some 40)
  //   AU 1976 (38×52, FairWork standard)
  //   SG 2288 (44×52, MOM Employment Act)
  //   JP 1944 (40 × ~48.6 effective weeks)
  //   NL 1664 (32×52, OECD median; PT contracts often shorter)
  //   ES 1820 (40×45.5 after holiday allowance)
  //   IT 1720 (40×43 effective)
  //   BE 1781 (38×46.9)
  //   CH 1840 (42×43.8 average)
  //   SE 1640 (40×41 — extensive leave entitlements)
  //   DK 1620 (37×43.8)
  //   NO 1700 (37.5×45.3)
  //   FI 1600 (37.5×42.7)
  //   AT 1740 (40×43.5)
  //   PT 1860 (40×46.5)
  //   PL 1980 (40×49.5)
  //   GR 1948 (40×48.7)
  //   HU 1888 (40×47.2)
  //   CZ 1880 (40×47)
  //   RO 1840 (40×46)
  //   BG 1842 (40×46.05)
  //   IN 2400 (48×50, India Labour Code maximum)
  //   ZA 1976 (40×49.4)
  //   MU 1900 (40×47.5)
  //   AE 2304 (48×48, UAE Labour Law standard pre-July-2023 changes)
  //   NG 2080 (40×52)
  //   KE 2080 (40×52)
  //   GH 2080 (40×52)
  //   BR 1800 (44h legal × ~40.9 effective)
  //   PH 2080 (40×52)
  // Other countries fall through to 2080 (most labour-statistics agencies
  // approximate to that for cross-country comparison).
  var WORKING_HOURS = {
    US: 2080, UK: 1950, GB: 1950, IE: 1950,
    FR: 1607, DE: 1656, CA: 2000, AU: 1976, SG: 2288, JP: 1944,
    NL: 1664, ES: 1820, IT: 1720, BE: 1781, CH: 1840, SE: 1640,
    DK: 1620, NO: 1700, FI: 1600, AT: 1740, PT: 1860, PL: 1980,
    GR: 1948, HU: 1888, CZ: 1880, RO: 1840, BG: 1842,
    IN: 2400, ZA: 1976, MU: 1900, AE: 2304, NG: 2080, KE: 2080,
    GH: 2080, BR: 1800, PH: 2080
  };
  function workingHoursFor(countryCode) {
    return WORKING_HOURS[countryCode] || 2080;
  }

  var debounceTimer = null;
  var lastGaugePct = 0;

  function ready() {
    var Lib = window.PFCTaxLibrary;
    if (!Lib || typeof Lib.calculate !== 'function') {
      console.error('PFCTaxLibrary not loaded');
      return;
    }
    if (!Lib.countries || Object.keys(Lib.countries).length === 0) {
      console.error('PFCTaxLibrary.countries is empty — data files did not load.');
      return;
    }

    var els = {
      country:    document.getElementById('country'),
      gross:      document.getElementById('gross'),
      grossLabel: document.getElementById('gross-label'),
      regionRow:  document.getElementById('region-row'),
      region:     document.getElementById('region'),
      pensionRow: document.getElementById('pension-row'),
      pension:    document.getElementById('pension'),
      pensionLabel:document.getElementById('pension-label'),
      pensionNote:document.getElementById('pension-note'),
      takeHome:   document.getElementById('r-takehome'),
      monthly:    document.getElementById('r-monthly'),
      hourly:     document.getElementById('r-hourly'),
      effective:  document.getElementById('r-effective'),
      gaugeSvg:   document.getElementById('gauge'),
      gaugeFill:  document.getElementById('gauge-fill'),
      gaugeNeedle:document.getElementById('gauge-needle'),
      gaugeLabel: document.getElementById('r-gauge-label'),
      pull:       document.getElementById('r-pull'),
      tbody:      document.getElementById('breakdown-body')
    };

    // ----- Formatting helpers -----
    function fmt(symbol, n) {
      var sign = n < 0 ? '−' : '';
      var v = Math.round(Math.abs(Number(n) || 0));
      return sign + (symbol || '') + v.toLocaleString('en-US');
    }
    function pct(r) { return (Math.round(Number(r) * 1000) / 10).toFixed(1) + '%'; }

    // ----- Gauge -----
    function setGauge(ratio) {
      ratio = Math.max(0, Math.min(1, Number(ratio) || 0));
      var fillCirc = 251.3;
      if (els.gaugeFill) els.gaugeFill.setAttribute('stroke-dashoffset', String(fillCirc - fillCirc * ratio));
      var p = ratio * 100;
      if (window.PFCMotion && els.gaugeNeedle) {
        window.PFCMotion.gaugeNeedle(els.gaugeSvg, lastGaugePct, p, {
          minAngle: -90, maxAngle: 90, cx: 100, cy: 110,
          needleSelector: '#gauge-needle', duration: 480
        });
      } else if (els.gaugeNeedle) {
        els.gaugeNeedle.setAttribute('transform', 'rotate(' + (-90 + 180 * ratio).toFixed(2) + ' 100 110)');
      }
      lastGaugePct = p;
    }

    // ----- Country / region dropdown population -----
    // DEF4 — list reads the manifest, which is always loaded eagerly, so
    // the dropdown populates without waiting for any region data.
    function populateCountries() {
      var list = Lib.listCountries();
      els.country.innerHTML = '';
      list.forEach(function (c) {
        var opt = document.createElement('option');
        opt.value = c.code;
        opt.textContent = c.name;
        els.country.appendChild(opt);
      });
      // Choose default — manifest tells us US is in americas region. Don't
      // call getCountry here (it returns null until that region has loaded).
      var defaultCode = (Lib.manifest && Lib.manifest[DEFAULT_COUNTRY]) ? DEFAULT_COUNTRY : (list[0] && list[0].code) || '';
      if (defaultCode) els.country.value = defaultCode;
    }

    // DEF4 — async because regions need ensureCountry to have loaded the
    // region file first. Showed a brief "Loading regions…" inline during
    // the network fetch (typically <100ms after first request, instant on
    // re-renders thanks to the _regions cache).
    async function populateRegions(countryCode) {
      // Read manifest first (sync) — tells us whether we even need regions.
      var meta = Lib.manifest && Lib.manifest[countryCode];
      els.region.innerHTML = '';
      if (!meta || !meta.hasRegions) {
        els.regionRow.hidden = true;
        return;
      }
      els.regionRow.hidden = false;
      // Ensure the region file is loaded before reading its regions.
      try { await Lib.ensureCountry(countryCode); } catch (_) { return; }
      var regions = Lib.listRegions(countryCode);
      regions.forEach(function (r) {
        var opt = document.createElement('option');
        opt.value = r.code;
        opt.textContent = r.name;
        els.region.appendChild(opt);
      });
      var pref = DEFAULT_REGIONS[countryCode];
      if (pref && regions.some(function (r) { return r.code === pref; })) {
        els.region.value = pref;
      }
    }

    // ----- Salary label reflects currency -----
    // DEF4 — read currency from manifest (always loaded), not from country
    // record (lazy-loaded). Works before any region file has been fetched.
    function refreshSalaryLabel(countryCode) {
      var meta = Lib.manifest && Lib.manifest[countryCode];
      if (!meta) return;
      els.grossLabel.textContent = 'Gross annual salary (' + (meta.currency || '') + ')';
    }

    // DEF3-1 (2026-05-25) — show/hide + relabel the pension row when country
    // changes. Hidden for 'none' treatments (e.g. SE). Label includes the
    // country's pension vehicle name + cap; field-note explains the treatment.
    // DEF4 — read currency/symbol from manifest. Pension rule is centralized
    // in the library (always loaded), so it's available without any region.
    function refreshPensionRow(countryCode) {
      if (!els.pensionRow || !els.pension || !els.pensionLabel || !els.pensionNote) return;
      var rule = (Lib.getPensionRule) ? Lib.getPensionRule(countryCode) : null;
      var meta = Lib.manifest && Lib.manifest[countryCode];
      if (!rule || rule.treatment === 'none' || !meta) {
        els.pensionRow.hidden = true;
        els.pension.value = 0;
        return;
      }
      els.pensionRow.hidden = false;
      els.pension.max = String(rule.cap);
      var sym = meta.symbol || '';
      els.pensionLabel.textContent = 'Annual pension / retirement contribution (' + (meta.currency || '') + ', cap ' + sym + (rule.cap || 0).toLocaleString() + ')';
      els.pensionNote.textContent = rule.desc || '';
    }

    // ----- Render the breakdown rows from the library result -----
    function renderBreakdown(result) {
      els.tbody.innerHTML = '';
      result.breakdown.forEach(function (row) {
        var tr = document.createElement('tr');
        if (row.kind === 'net') tr.className = 'total';
        var th = document.createElement('td');
        th.textContent = row.label;
        var td = document.createElement('td');
        td.className = 'num';
        td.textContent = fmt(result.symbol, row.amount);
        tr.appendChild(th);
        tr.appendChild(td);
        els.tbody.appendChild(tr);
      });
    }

    // ----- Recompute & paint everything -----
    // DEF4 — async because Lib.calculate awaits ensureCountry. First call
    // per region triggers the lazy script load (~50-100ms typically); all
    // subsequent calls for that region are instant (in-memory).
    async function recompute() {
      var countryCode = els.country.value;
      // DEF4 — read hasRegions from manifest (sync) instead of country
      // record (lazy), so we know whether to read regionCode BEFORE the
      // region file has finished loading.
      var meta = Lib.manifest && Lib.manifest[countryCode];
      if (!meta) return;
      var regionCode = (meta.hasRegions && els.region) ? els.region.value : null;
      var salary = Number(els.gross.value) || 0;
      var pensionContrib = (els.pension && !els.pensionRow.hidden)
        ? (Number(els.pension.value) || 0)
        : 0;

      var r;
      try {
        r = await Lib.calculate({ countryCode: countryCode, regionCode: regionCode, salary: salary, pensionContrib: pensionContrib });
      } catch (e) {
        console.error('[take-home-pay] calculate failed:', e);
        // Surface a one-time inline error if the region file failed to load.
        if (els.tbody && (!els.tbody.innerHTML || els.tbody.innerHTML.indexOf('tax-load-err') < 0)) {
          els.tbody.innerHTML = '<tr><td colspan="2" style="color:var(--red);padding:14px 0;" class="tax-load-err">Could not load tax data — check connection and refresh.</td></tr>';
        }
        return;
      }

      var sym = r.symbol || '';
      var keptRatio = 1 - r.effectiveRate;
      var monthly = r.takeHome / 12;
      // DEF-3 — per-country working hours instead of hardcoded 2080.
      var hoursPerYear = workingHoursFor(countryCode);
      var hourly = r.takeHome / hoursPerYear;

      // THP-P0-DES (audit 2026-05-25) — strip the empty-state ".result-hero-empty"
      // class once we have a real number to show (was "—" + var(--text3) grey).
      if (els.takeHome.classList.contains('result-hero-empty')) {
        els.takeHome.classList.remove('result-hero-empty');
      }
      els.takeHome.textContent  = fmt(sym, r.takeHome);
      els.monthly.textContent   = fmt(sym, monthly);
      els.hourly.textContent    = fmt(sym, hourly);
      els.effective.textContent = pct(r.effectiveRate);
      // DEF-3 — update the "Per hour" label to reflect the actual hours used.
      var hourlyLabel = document.querySelector('[data-thp-hourly-label]');
      if (hourlyLabel) hourlyLabel.textContent = 'Per hour (' + hoursPerYear.toLocaleString() + ' h/yr)';
      els.gaugeLabel.textContent = 'You keep ' + pct(keptRatio) + ' of every ' + (country.currency || 'unit') + ' earned.';
      els.pull.textContent = 'After tax, you keep ' + fmt(sym, r.takeHome) + ' for every ' + fmt(sym, salary) + ' earned.';

      // THP-P0-DES — surface the tax-data source attribution (trust signal).
      // r.engineSource is set by pfc-tax-library.calculate() to one of:
      //   'PFCTaxEngine.calculateUS (IRS Rev. Proc. 2024-40 + FICA 2026)'
      //   'PFCTaxEngine.calculateUK (HMRC 2026/27)'
      //   'PFCTaxLibrary.calculate (<country.source or kind>)'
      var srcEl = document.querySelector('[data-thp-engine-source]');
      if (srcEl && r.engineSource) {
        srcEl.textContent = 'Source: ' + r.engineSource + '. All math runs in your browser. Estimates for planning, not tax advice.';
      }

      renderBreakdown(r);
      setGauge(keptRatio);

      // DEF-2 (2026-05-25) — marginal-rate teaching line. Surfaces what
      // happens at the margin (next $1 of income) which is the actionable
      // number for negotiation, pension contributions, side-income decisions.
      // Skipped when marginalRate isn't available (some library countries
      // can't compute it for flat-rate paths) OR when income is 0.
      renderMarginalTeaching(r, sym, salary);

      // DEF-1 (2026-05-25) — close the funnel. Pre-fix the page was a dead
      // end after compute. Now: surface a "use this number elsewhere" card
      // with one-click routes to /dashboard (save income), /goals (apply
      // savings rate), /debt-optimizer (model accelerated payoff).
      renderSaveActions(r, sym, salary, countryCode);
    }

    // DEF-2 helper — marginal teaching line.
    function renderMarginalTeaching(r, sym, salary) {
      var slot = document.getElementById('thp-marginal-teach');
      if (!slot) return;
      if (!salary || !r.marginalRate || r.marginalRate <= 0) {
        slot.style.display = 'none';
        return;
      }
      var mPct = Math.round(r.marginalRate * 100);
      // The teaching line: pension contribution at margin is the most
      // actionable lever for almost every reader. The example uses 1000
      // currency units so the maths is round and intuitive.
      var unit = 1000;
      var saved = Math.round(unit * r.marginalRate);
      var net = unit - saved;
      slot.style.display = 'block';
      slot.textContent = 'Your next ' + sym + unit.toLocaleString() + ' of income is taxed at ' + mPct + '% at the margin — ' +
        'meaning a ' + sym + unit.toLocaleString() + ' pension or pre-tax contribution costs you only ' +
        sym + net.toLocaleString() + ' in take-home (the other ' + sym + saved.toLocaleString() + ' would have gone to tax).';
    }

    // DEF-1 helper — save-to-dashboard CTA. Renders 3 routes when storage
    // contains the relevant data (dashboard always; goals + debts gated on
    // local presence so the card doesn't promise something the user can't
    // actually do without setting them up first).
    function renderSaveActions(r, sym, salary, countryCode) {
      var card = document.getElementById('thp-save-card');
      if (!card) return;
      if (!salary || r.takeHome <= 0) {
        card.style.display = 'none';
        return;
      }
      card.style.display = 'block';
      // Update the lead text with the actual take-home so users know what
      // gets carried over. URL-encode the value + country so the receiving
      // pages can prefill cleanly.
      var leadEl = card.querySelector('[data-thp-save-lead]');
      if (leadEl) {
        leadEl.textContent = 'You can drop ' + sym + Math.round(r.takeHome).toLocaleString() +
          ' (annual take-home, ' + sym + Math.round(r.takeHome / 12).toLocaleString() +
          '/mo) into the rest of ProFinanceCast — no re-typing required.';
      }
      // Build the URL params shared by all 3 routes.
      var qs = '?income=' + Math.round(r.takeHome / 12) +
               '&country=' + encodeURIComponent(countryCode || '') +
               '&currency=' + encodeURIComponent(r.currency || '');
      var btns = card.querySelectorAll('[data-thp-save-route]');
      btns.forEach(function (btn) {
        var route = btn.getAttribute('data-thp-save-route');
        if (!route) return;
        btn.setAttribute('href', '/' + route + qs);
      });
      // Hide the goals + debts routes if storage has nothing there yet —
      // promising "apply to your goals" when there are none would be a
      // dead-end CTA that erodes trust. Gate via _hasStored helper.
      var goalsBtn = card.querySelector('[data-thp-save-route="goals"]');
      var debtsBtn = card.querySelector('[data-thp-save-route="debt-optimizer"]');
      if (goalsBtn) goalsBtn.style.display = _hasStored('goals') ? '' : 'none';
      if (debtsBtn) debtsBtn.style.display = _hasStored('debts') ? '' : 'none';
    }
    function _hasStored(key) {
      try {
        if (typeof PFCStorage === 'undefined' || !PFCStorage.getJSON) return false;
        var v = PFCStorage.getJSON(key);
        return Array.isArray(v) && v.length > 0;
      } catch (_) { return false; }
    }

    // DEF4 — wrap async recompute so its rejected Promise doesn't propagate
    // up to the input-event handler (would log an unhandledrejection).
    function debounce() {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () { recompute().catch(function (e) { console.error(e); }); }, 200);
    }

    // ----- Wire up -----
    populateCountries();

    // Pre-fill from URL params before populateRegions/refreshLabel run, so
    // the rest of the boot path picks up the user's intended country.
    // Used by /salary-calculator's "See your take-home" CTA which navigates
    // here with ?salary=NNNN&country=XX&currency=YYY after the user picks
    // a target. Values are validated: country must exist in the loaded
    // data, salary must be a plausible positive integer (1000–5000000) to
    // skip obvious junk.
    //
    // THP-P0-CROSS fix (audit 2026-05-25) — explicit currency contract.
    // Pre-fix the handoff sent only `?salary=&country=` with no currency
    // tag. If the user picked USD $80,000 in /salary-calculator and then
    // navigated to country=DE, this page silently treated 80,000 as EUR
    // (€80,000 ≠ USD $80,000). New behaviour: if a `currency` param is
    // sent AND it differs from the destination country's currency, render
    // a one-line amber warning above the result card so the user knows
    // the number is unconverted. Defensive — does NOT auto-convert (FX
    // would need a live rate and that's out-of-scope for a calculator),
    // but the warning makes the mismatch visible instead of silent.
    try {
      var urlParams = new URLSearchParams(window.location.search);
      var urlCountry = (urlParams.get('country') || '').toUpperCase();
      var urlSalary  = parseInt(urlParams.get('salary'), 10);
      var urlCurrency = (urlParams.get('currency') || '').toUpperCase();
      if (urlCountry && Lib.getCountry(urlCountry)) {
        els.country.value = urlCountry;
      }
      if (Number.isFinite(urlSalary) && urlSalary >= 1000 && urlSalary <= 5000000) {
        els.gross.value = urlSalary;
      }
      // THP-P0-CROSS — surface currency mismatch (best-effort)
      if (urlCurrency && urlCountry) {
        var destCountry = Lib.getCountry(urlCountry);
        if (destCountry && destCountry.currency && destCountry.currency !== urlCurrency) {
          var banner = document.createElement('div');
          banner.id = 'thp-currency-warn';
          banner.setAttribute('role', 'status');
          banner.style.cssText = 'background:rgba(245,166,35,0.10);border:1px solid rgba(245,166,35,0.35);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:13px;line-height:1.5;color:var(--text);font-family:var(--font-body);';
          // textContent only — no user-controlled HTML reaches the banner.
          banner.textContent = 'Heads up — the source page sent ' + urlSalary.toLocaleString() + ' ' + urlCurrency +
            ' but ' + destCountry.name + ' uses ' + destCountry.currency +
            '. This calculator treats the number as ' + destCountry.currency +
            ' without conversion. Adjust the salary if you want an FX-converted figure.';
          var resultCard = document.querySelector('[data-thp-result-card]') || els.takeHome && els.takeHome.closest('.card');
          if (resultCard && resultCard.parentNode) {
            resultCard.parentNode.insertBefore(banner, resultCard);
          }
        }
      }
    } catch (_) { /* malformed URL — fall through to defaults */ }

    // DEF4 — initial paint awaits the default country's region load.
    refreshSalaryLabel(els.country.value);
    refreshPensionRow(els.country.value);
    populateRegions(els.country.value).then(function () {
      return recompute();
    }).catch(function (e) { console.error(e); });

    els.country.addEventListener('change', function () {
      refreshSalaryLabel(els.country.value);
      refreshPensionRow(els.country.value);
      // populateRegions awaits the lazy load; recompute fires after.
      populateRegions(els.country.value).then(function () {
        return recompute();
      }).catch(function (e) { console.error(e); });
    });
    els.region.addEventListener('change', function () { recompute().catch(function (e) { console.error(e); }); });
    els.gross.addEventListener('input', debounce);
    els.gross.addEventListener('change', debounce);
    if (els.pension) {
      els.pension.addEventListener('input', debounce);
      els.pension.addEventListener('change', debounce);
    }
  }

  // The data files + library are deferred, so they evaluate after parse but
  // potentially after this inline script. Wait for window 'load' to be safe.
  if (window.PFCTaxLibrary && window.PFCTaxLibrary.countries && Object.keys(window.PFCTaxLibrary.countries).length > 0) {
    ready();
  } else {
    window.addEventListener('load', ready);
  }
})();
