(function () {
  'use strict';

  // Default country code on first load. Falls back to first available if 'US' isn't loaded.
  var DEFAULT_COUNTRY = 'US';
  // Default region per country when first switching (otherwise we leave the dropdown's first item).
  var DEFAULT_REGIONS = { US: 'CA', GB: 'ENG', UK: 'ENG', CA: 'ON', CH: 'ZH' };

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
    function populateCountries() {
      var list = Lib.listCountries();
      els.country.innerHTML = '';
      list.forEach(function (c) {
        var opt = document.createElement('option');
        opt.value = c.code;
        opt.textContent = c.name;
        els.country.appendChild(opt);
      });
      // Choose default — preferred code if present, otherwise first.
      var defaultCode = (Lib.getCountry(DEFAULT_COUNTRY) ? DEFAULT_COUNTRY : (list[0] && list[0].code) || '');
      if (defaultCode) els.country.value = defaultCode;
    }

    function populateRegions(countryCode) {
      var country = Lib.getCountry(countryCode);
      els.region.innerHTML = '';
      if (!country || !country.hasRegions) {
        els.regionRow.hidden = true;
        return;
      }
      els.regionRow.hidden = false;
      var regions = Lib.listRegions(countryCode);
      regions.forEach(function (r) {
        var opt = document.createElement('option');
        opt.value = r.code;
        opt.textContent = r.name;
        els.region.appendChild(opt);
      });
      // Pick a sensible default if we know one for this country.
      var pref = DEFAULT_REGIONS[countryCode];
      if (pref && regions.some(function (r) { return r.code === pref; })) {
        els.region.value = pref;
      }
    }

    // ----- Salary label reflects currency -----
    function refreshSalaryLabel(countryCode) {
      var country = Lib.getCountry(countryCode);
      if (!country) return;
      els.grossLabel.textContent = 'Gross annual salary (' + (country.currency || '') + ')';
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
    function recompute() {
      var countryCode = els.country.value;
      var country = Lib.getCountry(countryCode);
      if (!country) return;
      var regionCode = (country.hasRegions && els.region) ? els.region.value : null;
      var salary = Number(els.gross.value) || 0;

      var r;
      try {
        r = Lib.calculate({ countryCode: countryCode, regionCode: regionCode, salary: salary });
      } catch (e) {
        console.error(e);
        return;
      }

      var sym = r.symbol || '';
      var keptRatio = 1 - r.effectiveRate;
      var monthly = r.takeHome / 12;
      var hourly  = r.takeHome / 2080;

      els.takeHome.textContent  = fmt(sym, r.takeHome);
      els.monthly.textContent   = fmt(sym, monthly);
      els.hourly.textContent    = fmt(sym, hourly);
      els.effective.textContent = pct(r.effectiveRate);
      els.gaugeLabel.textContent = 'You keep ' + pct(keptRatio) + ' of every ' + (country.currency || 'unit') + ' earned.';
      els.pull.textContent = 'After tax, you keep ' + fmt(sym, r.takeHome) + ' for every ' + fmt(sym, salary) + ' earned.';

      renderBreakdown(r);
      setGauge(keptRatio);
    }

    function debounce() { clearTimeout(debounceTimer); debounceTimer = setTimeout(recompute, 200); }

    // ----- Wire up -----
    populateCountries();

    // Pre-fill from URL params before populateRegions/refreshLabel run, so
    // the rest of the boot path picks up the user's intended country.
    // Used by /salary-calculator's "See your take-home" CTA which navigates
    // here with ?salary=NNNN&country=XX after the user has picked a target.
    // Values are validated: country must exist in the loaded data, salary
    // must be a plausible positive integer (1000–5000000) to skip obvious junk.
    try {
      var urlParams = new URLSearchParams(window.location.search);
      var urlCountry = (urlParams.get('country') || '').toUpperCase();
      var urlSalary  = parseInt(urlParams.get('salary'), 10);
      if (urlCountry && Lib.getCountry(urlCountry)) {
        els.country.value = urlCountry;
      }
      if (Number.isFinite(urlSalary) && urlSalary >= 1000 && urlSalary <= 5000000) {
        els.gross.value = urlSalary;
      }
    } catch (_) { /* malformed URL — fall through to defaults */ }

    populateRegions(els.country.value);
    refreshSalaryLabel(els.country.value);

    els.country.addEventListener('change', function () {
      populateRegions(els.country.value);
      refreshSalaryLabel(els.country.value);
      recompute();
    });
    els.region.addEventListener('change', recompute);
    els.gross.addEventListener('input', debounce);
    els.gross.addEventListener('change', debounce);

    recompute();
  }

  // The data files + library are deferred, so they evaluate after parse but
  // potentially after this inline script. Wait for window 'load' to be safe.
  if (window.PFCTaxLibrary && window.PFCTaxLibrary.countries && Object.keys(window.PFCTaxLibrary.countries).length > 0) {
    ready();
  } else {
    window.addEventListener('load', ready);
  }
})();
