// portfolio-main.js — Portfolio page controller.
// Wires the holdings table + add form + KPIs + allocation pie chart.
// Pro-gates the UI for free users.

(function () {
  'use strict';

  // Distinct chart colors — same palette used elsewhere in the app for
  // visual consistency across goals, debt-optimizer, and portfolio.
  const PALETTE = [
    '#2BB67D','#D4AF6A','#7BA8E0','#E07B7B','#9F7BE0','#7BE0CB',
    '#E0AB7B','#7BE08E','#E07BCB','#A9E07B','#7BBEE0','#E07B95',
  ];

  function _esc(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function _sym() {
    try {
      if (typeof PFCUser !== 'undefined') {
        const u = PFCUser.get();
        if (u && u.currency) {
          // W15-A canonicalisation: route through PFCSym so a Mauritius user
          // with currency="MUR" sees "₨" not the literal three-letter code.
          return window.PFCSym ? PFCSym(u.currency) : u.currency;
        }
      }
    } catch (_) {}
    return '$';
  }

  // W16 §1 — visible toast feedback. Replaces the silent _wireAddForm focus
  // pattern that left users wondering why "Add holding" did nothing. Toasts
  // auto-dismiss after 2.6s; danger variant gets red accent.
  let _toastTimer = null;
  function _toast(message, variant) {
    let host = document.getElementById('pf-toast');
    if (!host) {
      host = document.createElement('div');
      host.id = 'pf-toast';
      host.style.cssText = 'position:fixed;left:50%;bottom:32px;transform:translateX(-50%);'
        + 'background:var(--card,#16271F);border:1px solid var(--border2);'
        + 'border-radius:8px;padding:12px 20px;font-size:13.5px;color:var(--text);'
        + 'box-shadow:0 8px 24px rgba(0,0,0,0.4);z-index:200;opacity:0;'
        + 'transition:opacity .18s ease,transform .18s ease;pointer-events:none;'
        + 'font-family:var(--font-body);max-width:min(90vw,420px);text-align:center;';
      document.body.appendChild(host);
    }
    host.textContent = message;
    host.style.borderColor = variant === 'danger' ? '#E07B7B'
                           : variant === 'success' ? 'var(--teal)' : 'var(--border2)';
    host.style.color = variant === 'danger' ? '#E07B7B' : 'var(--text)';
    host.style.opacity = '1';
    host.style.transform = 'translateX(-50%) translateY(0)';
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => {
      host.style.opacity = '0';
      host.style.transform = 'translateX(-50%) translateY(8px)';
    }, 2600);
  }
  function _isoCode() {
    try {
      if (typeof PFCUser !== 'undefined') {
        const u = PFCUser.get();
        if (u && u.currencyCode) return String(u.currencyCode).toLowerCase();
        if (u && u.currency && typeof PFCCurrency !== 'undefined' && PFCCurrency.toISO) {
          return String(PFCCurrency.toISO(u.currency)).toLowerCase();
        }
      }
    } catch (_) {}
    return 'usd';
  }
  function _fmt(n) {
    if (!isFinite(n)) return '—';
    const abs = Math.abs(n);
    // Smart precision: dollars for >$10, cents for $0.01-$10, scientific for sub-cent
    const decimals = abs >= 100 ? 0 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
    return _sym() + n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  function _fmtSigned(n) {
    if (!isFinite(n)) return '—';
    const s = n < 0 ? '-' : '+';
    return s + _fmt(Math.abs(n)).replace(/^-/, '');
  }
  function _fmtPct(n) {
    if (!isFinite(n)) return '—';
    const s = n < 0 ? '' : '+';
    return s + n.toFixed(2) + '%';
  }

  // ── Pro-gate ────────────────────────────────────────────────────────────
  function _planAllowsPortfolio() {
    try {
      if (typeof PFCPlan === 'undefined' || !PFCPlan.get) return false;
      const plan = PFCPlan.get();
      return plan === 'pro' || plan === 'premium';
    } catch (_) { return false; }
  }
  function _showProGate(show) {
    document.getElementById('pf-pro-gate').classList.toggle('show', !!show);
    document.getElementById('pf-grid').style.display = show ? 'none' : '';
    document.getElementById('pf-kpis').style.display = show ? 'none' : '';
    document.getElementById('pf-empty').style.display = 'none';
  }

  // ── Holdings table render ───────────────────────────────────────────────
  let _chart = null;
  let _valuations = []; // last fetched, used for re-renders without re-fetching
  let _spyChangePct = null; // W17-A — SPY 24h change %, fetched on _refresh()

  function _renderTable(valuations) {
    const tbody = document.getElementById('pf-tbody');
    tbody.innerHTML = '';
    if (!valuations.length) {
      document.getElementById('pf-empty').style.display = 'block';
      document.getElementById('pf-grid').querySelector('.chart-host').style.display = 'none';
      return;
    }
    document.getElementById('pf-empty').style.display = 'none';
    document.getElementById('pf-grid').querySelector('.chart-host').style.display = '';

    for (const v of valuations) {
      const h = v.holding;
      const row = document.createElement('tr');
      const isCrypto = h.type === 'crypto';
      const badge = `<span class="h-symbol-badge ${isCrypto?'crypto':''}">${_esc(h.symbol.slice(0,4))}</span>`;
      const nameSpan = (v.quote && v.quote.name) ? `<span class="h-symbol-name">${_esc(v.quote.name)}</span>` : '';
      // W16 §4 — small color-dot if a tag is set + tooltip-icon if a note exists.
      const tagDot = h.tag ? `<span class="h-tag-dot tag-${_esc(h.tag)}" title="Tag: ${_esc(h.tag)}"></span>` : '';
      const noteIcon = h.note ? `<span class="h-note-icon" title="${_esc(h.note)}">●</span>` : '';
      const tickerCell = `<div class="h-symbol">${tagDot}${badge}<div class="h-symbol-meta"><span class="h-symbol-ticker">${_esc(h.symbol)}${noteIcon}</span>${nameSpan}</div></div>`;

      let priceCell = '—', valueCell = '—', deltaCell = '<span class="h-delta-zero">—</span>';
      let allTimeCell = '<span class="h-delta-zero" title="No cost basis recorded">—</span>';
      if (v.error) {
        priceCell = `<span class="h-err">${_esc(v.error.code || 'err')}</span>`;
      } else if (v.quote && isFinite(v.quote.price)) {
        priceCell = _fmt(v.quote.price);
        if (isFinite(v.value)) valueCell = _fmt(v.value);
        const pct = v.change24h_pct;
        if (isFinite(pct)) {
          const cls = pct > 0 ? 'h-delta-up' : pct < 0 ? 'h-delta-down' : 'h-delta-zero';
          deltaCell = `<span class="${cls}">${_fmtPct(pct)}</span>`;
        }
        // W16 §2 — per-position all-time return based on costBasis
        // W17-B — per-position dividend yield shown in title-tooltip
        const qtyNum = parseFloat(h.quantity) || 0;
        const divYield = window.PFCDividendYields ? PFCDividendYields.yieldFor(h.symbol) : null;
        const yieldNote = divYield != null
          ? ` · ${divYield.toFixed(2)}% TTM yield ≈ ${_fmt(v.value * divYield / 100)}/yr`
          : '';
        if (isFinite(h.costBasis) && h.costBasis > 0 && isFinite(v.value)) {
          const costVal = h.costBasis * qtyNum;
          const gain = v.value - costVal;
          const gainPct = costVal > 0 ? (gain / costVal) * 100 : 0;
          const cls = gain > 0 ? 'h-delta-up' : gain < 0 ? 'h-delta-down' : 'h-delta-zero';
          allTimeCell = `<span class="${cls}" title="Cost basis ${_fmt(h.costBasis)} per unit · total cost ${_fmt(costVal)}${yieldNote}">${_fmtSigned(gain)} (${_fmtPct(gainPct)})</span>`;
        } else if (divYield != null && isFinite(v.value)) {
          // No cost basis recorded, but we know the yield — show that instead of "—"
          allTimeCell = `<span class="h-delta-zero" title="No cost basis recorded${yieldNote}">${divYield.toFixed(1)}% yield</span>`;
        }
      }

      row.innerHTML =
        `<td>${tickerCell}</td>` +
        `<td class="right">${(parseFloat(h.quantity) || 0).toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>` +
        `<td class="right">${priceCell}</td>` +
        `<td class="right">${valueCell}</td>` +
        `<td class="right">${deltaCell}</td>` +
        `<td class="right">${allTimeCell}</td>` +
        `<td class="right"><div class="h-actions">` +
          `<button class="h-icon-btn" data-action="edit" data-id="${_esc(h.id)}" title="Edit position">` +
            `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5l2 2-6 6H2.5v-2l6-6z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>` +
          `</button>` +
          `<button class="h-icon-btn danger" data-action="remove" data-id="${_esc(h.id)}" title="Remove">` +
            `<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>` +
          `</button>` +
        `</div></td>`;
      tbody.appendChild(row);
    }

    // Wire delete handlers
    tbody.querySelectorAll('button[data-action="remove"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        if (!id) return;
        if (PFCPortfolio.remove(id)) {
          _toast('Position removed', 'neutral');
          _refresh();
        }
      });
    });
    // W16 §4 — edit handlers
    tbody.querySelectorAll('button[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        if (!id) return;
        _openEditModal(id);
      });
    });
  }

  // W16 §4 — Edit-position modal. Loads the existing holding into the form,
  // saves a patch via PFCPortfolio.update(). Cost basis, quantity, note, tag
  // are all editable; symbol is shown read-only (changing the ticker would
  // invalidate the cost basis and price history).
  let _editingId = null;
  function _openEditModal(id) {
    const holding = PFCPortfolio.list().find((h) => h.id === id);
    if (!holding) { _toast('Position not found', 'danger'); return; }
    _editingId = id;
    document.getElementById('pf-edit-symbol').value = holding.symbol;
    document.getElementById('pf-edit-qty').value = holding.quantity;
    document.getElementById('pf-edit-cost').value = isFinite(holding.costBasis) ? holding.costBasis : '';
    document.getElementById('pf-edit-recurring').value = isFinite(holding.recurringMonthly) ? holding.recurringMonthly : '';
    document.getElementById('pf-edit-note').value = holding.note || '';
    // Mark the active tag swatch
    document.querySelectorAll('#pf-edit-tags .pf-tag-swatch').forEach((sw) => {
      sw.classList.toggle('selected', sw.getAttribute('data-tag') === (holding.tag || ''));
    });
    document.getElementById('pf-edit-backdrop').hidden = false;
    document.getElementById('pf-edit-qty').focus();
  }
  function _closeEditModal() {
    _editingId = null;
    document.getElementById('pf-edit-backdrop').hidden = true;
  }
  function _wireEditModal() {
    const backdrop = document.getElementById('pf-edit-backdrop');
    if (!backdrop) return;
    document.getElementById('pf-edit-cancel').addEventListener('click', _closeEditModal);
    document.getElementById('pf-edit-cancel-2').addEventListener('click', _closeEditModal);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) _closeEditModal(); });
    document.addEventListener('keydown', (e) => {
      if (!backdrop.hidden && e.key === 'Escape') _closeEditModal();
    });
    // Tag swatch picker — single-select toggle
    document.querySelectorAll('#pf-edit-tags .pf-tag-swatch').forEach((sw) => {
      sw.addEventListener('click', () => {
        document.querySelectorAll('#pf-edit-tags .pf-tag-swatch').forEach((s) => s.classList.remove('selected'));
        sw.classList.add('selected');
      });
    });
    document.getElementById('pf-edit-save').addEventListener('click', () => {
      if (!_editingId) return;
      const q = parseFloat(document.getElementById('pf-edit-qty').value);
      const c = parseFloat(document.getElementById('pf-edit-cost').value);
      const recur = parseFloat(document.getElementById('pf-edit-recurring').value);
      const note = document.getElementById('pf-edit-note').value.trim();
      const selSwatch = document.querySelector('#pf-edit-tags .pf-tag-swatch.selected');
      const tag = selSwatch ? selSwatch.getAttribute('data-tag') : '';
      if (!isFinite(q) || q <= 0) {
        _toast('Quantity must be a positive number', 'danger');
        return;
      }
      try {
        PFCPortfolio.update(_editingId, {
          quantity: q,
          costBasis: isFinite(c) && c > 0 ? c : null,
          recurringMonthly: isFinite(recur) && recur > 0 ? recur : null,
          note: note || null,
          tag: tag || null,
        });
        _closeEditModal();
        _toast('Position updated', 'success');
        _refresh();
      } catch (e) {
        console.error('[portfolio] update failed', e);
        _toast('Could not save changes', 'danger');
      }
    });
  }

  function _renderKPIs(valuations) {
    const kpis = document.getElementById('pf-kpis');
    if (!valuations.length) { kpis.style.display = 'none'; return; }
    kpis.style.display = '';

    let total = 0, change = 0, stockCount = 0, cryptoCount = 0;
    for (const v of valuations) {
      if (isFinite(v.value)) total += v.value;
      if (isFinite(v.change24h_value)) change += v.change24h_value;
      if (v.holding.type === 'crypto') cryptoCount++; else stockCount++;
    }
    document.getElementById('pf-total-val').textContent = _fmt(total);
    document.getElementById('pf-total-hint').textContent = total > 0 ? 'Live · refreshed just now' : 'Add holdings to see value';
    document.getElementById('pf-24h-val').textContent = _fmtSigned(change);
    const pct = total > 0 ? (change / (total - change)) * 100 : 0;
    const hint = document.getElementById('pf-24h-hint');
    // W17-A — benchmark vs SPY. _spyChangePct is set by _refresh() after the
    // SPY quote fetch resolves. If we have it, append "vs SPY ±X% · trailing/
    // leading by Ypp" so the user sees an honest mirror of their day vs the
    // S&P 500. If SPY fetch fails (rare), we just show the portfolio %.
    let hintText = isFinite(pct) ? _fmtPct(pct) : '—';
    if (isFinite(_spyChangePct) && isFinite(pct)) {
      const diff = pct - _spyChangePct;
      const cmp = Math.abs(diff) < 0.05
        ? 'matching SPY'
        : (diff > 0 ? 'leading SPY by ' : 'trailing SPY by ') + Math.abs(diff).toFixed(2) + 'pp';
      hintText += ' · vs SPY ' + _fmtPct(_spyChangePct) + ' · ' + cmp;
    }
    hint.textContent = hintText;
    hint.className = 'summary-hint ' + (change > 0 ? 'delta-up' : change < 0 ? 'delta-down' : '');
    // W17-B — Annual dividend income KPI. Uses the curated yield catalog
    // (PFCDividendYields). Positions without a catalog entry contribute
    // nothing. Hint shows "N of M tracked · YIELDpp blended" for honesty
    // about coverage gaps. Yields are TTM snapshots, not live.
    let divAnnual = 0, divTracked = 0;
    if (window.PFCDividendYields) {
      for (const v of valuations) {
        if (!isFinite(v.value)) continue;
        const y = PFCDividendYields.yieldFor(v.holding.symbol);
        if (y == null) continue;
        divAnnual += v.value * (y / 100);
        divTracked++;
      }
    }
    const divValEl = document.getElementById('pf-div-val');
    const divHintEl = document.getElementById('pf-div-hint');
    if (divValEl && divHintEl) {
      if (divTracked === 0) {
        divValEl.textContent = '—';
        divHintEl.textContent = 'No dividend-paying positions found';
      } else {
        const portfolioYield = total > 0 ? (divAnnual / total) * 100 : 0;
        divValEl.textContent = _fmt(divAnnual);
        divHintEl.textContent = divTracked + ' of ' + valuations.length + ' tracked · '
          + portfolioYield.toFixed(2) + '% blended yield';
      }
    }

    // W16 §2 — All-time P/L: sum (current value - cost basis * qty) across
    // positions that HAVE a cost basis. Positions without a cost basis are
    // excluded — the user opted not to record entry price.
    let costTotal = 0, valTotalWithCost = 0, countedPositions = 0;
    for (const v of valuations) {
      const h = v.holding;
      if (h && isFinite(h.costBasis) && h.costBasis > 0 && isFinite(v.value)) {
        costTotal += h.costBasis * (parseFloat(h.quantity) || 0);
        valTotalWithCost += v.value;
        countedPositions++;
      }
    }
    const altVal = document.getElementById('pf-alltime-val');
    const altHint = document.getElementById('pf-alltime-hint');
    if (altVal && altHint) {
      if (countedPositions === 0) {
        altVal.textContent = '—';
        altHint.textContent = 'Record cost basis to see';
        altHint.className = 'summary-hint';
      } else {
        const gain = valTotalWithCost - costTotal;
        const gainPct = costTotal > 0 ? (gain / costTotal) * 100 : 0;
        altVal.textContent = _fmtSigned(gain);
        altHint.textContent = (isFinite(gainPct) ? _fmtPct(gainPct) : '—')
          + ' · ' + countedPositions + ' of ' + valuations.length + ' tracked';
        altHint.className = 'summary-hint ' + (gain > 0 ? 'delta-up' : gain < 0 ? 'delta-down' : '');
      }
    }

    // W16 §5 — Projected-in-10y KPI. For each position:
    //   FV = V0 * (1+r)^n + C * ((1+r)^n - 1) / r
    // where V0 = current value, C = monthly contribution, r = monthly rate,
    // n = 120 (10 years × 12 months). Assumed nominal annual return 7%
    // (long-run global equity average per Dimson/Marsh/Staunton).
    // Positions without recurring contributions just compound at 7%.
    // The user can override the assumption later; for now it's a constant.
    const ANNUAL_RATE = 0.07;
    const r = ANNUAL_RATE / 12;
    const n = 120;
    const growthFactor = Math.pow(1 + r, n);
    let projTotal = 0, recurringCount = 0;
    for (const v of valuations) {
      const h = v.holding;
      if (!isFinite(v.value)) continue;
      const V0 = v.value;
      const C = isFinite(h.recurringMonthly) && h.recurringMonthly > 0 ? h.recurringMonthly : 0;
      const fv = V0 * growthFactor + (C > 0 ? C * (growthFactor - 1) / r : 0);
      projTotal += fv;
      if (C > 0) recurringCount++;
    }
    const projVal = document.getElementById('pf-proj-val');
    const projHint = document.getElementById('pf-proj-hint');
    if (projVal && projHint) {
      if (valuations.length === 0) {
        projVal.textContent = '—';
        projHint.textContent = 'Add positions to project';
      } else {
        projVal.textContent = _fmt(projTotal);
        projHint.textContent = recurringCount > 0
          ? recurringCount + ' position' + (recurringCount===1?'':'s') + ' with DCA · 7%/yr assumed'
          : 'No DCA yet · 7%/yr compounding';
      }
    }
  }

  // W16 §3 — allocation chart with By Position / By Asset Class toggle.
  let _allocMode = 'position'; // 'position' | 'class'

  // Resolve a holding to an asset class. Uses the ticker catalog if available
  // (PFCTickerAutocomplete loads it), otherwise falls back to the holding's
  // own type. Catalog distinguishes 'stock' from 'etf' which is the value-add
  // over the type field alone.
  function _resolveAssetClass(holding) {
    const sym = String(holding.symbol || '').toUpperCase();
    if (window.PFCTickerAutocomplete && Array.isArray(window.PFCTickerAutocomplete.catalog)) {
      for (const e of window.PFCTickerAutocomplete.catalog) {
        if (e[0] === sym) return e[2]; // 'stock' | 'etf' | 'crypto'
      }
    }
    return holding.type === 'crypto' ? 'crypto' : 'stock';
  }
  const _CLASS_LABEL = { stock: 'Stocks', etf: 'ETFs', crypto: 'Crypto' };
  const _CLASS_COLOR = { stock: '#2BB67D', etf: '#7BA8E0', crypto: '#D4AF6A' };

  function _renderChart(valuations) {
    const canvas = document.getElementById('pf-chart');
    const legend = document.getElementById('pf-legend');
    const subEl = document.getElementById('pf-alloc-sub');
    if (!canvas || typeof Chart === 'undefined') return;
    const data = valuations
      .filter((v) => isFinite(v.value) && v.value > 0)
      .sort((a, b) => b.value - a.value);
    if (!data.length) {
      if (_chart) { _chart.destroy(); _chart = null; }
      legend.innerHTML = '';
      return;
    }

    let labels, values, colors;
    if (_allocMode === 'class') {
      // Group by asset class
      const groups = {};
      for (const v of data) {
        const c = _resolveAssetClass(v.holding);
        groups[c] = (groups[c] || 0) + v.value;
      }
      const order = ['stock','etf','crypto'].filter((k) => groups[k] > 0);
      labels = order.map((k) => _CLASS_LABEL[k]);
      values = order.map((k) => groups[k]);
      colors = order.map((k) => _CLASS_COLOR[k]);
      if (subEl) subEl.textContent = 'By asset class · ' + order.length + ' class' + (order.length===1?'':'es');
    } else {
      labels = data.map((v) => v.holding.symbol);
      values = data.map((v) => v.value);
      colors = data.map((_, i) => PALETTE[i % PALETTE.length]);
      if (subEl) subEl.textContent = 'By position · ' + data.length + ' holding' + (data.length===1?'':'s');
    }

    if (_chart) _chart.destroy();
    _chart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data: values, backgroundColor: colors, borderColor: 'transparent', borderWidth: 0 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '62%',
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => ' ' + c.label + ': ' + _fmt(c.parsed) } },
        },
      },
    });
    const total = values.reduce((a,b) => a+b, 0);
    legend.innerHTML = labels.map((lbl, i) => {
      const pct = total > 0 ? (values[i] / total) * 100 : 0;
      return `<div class="chart-legend-item"><span class="chart-legend-swatch" style="background:${colors[i]}"></span><span style="flex:1">${_esc(lbl)}</span><span style="color:var(--text3)">${pct.toFixed(1)}%</span></div>`;
    }).join('');
  }

  function _wireAllocTabs() {
    document.querySelectorAll('.alloc-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const mode = tab.getAttribute('data-alloc');
        if (!mode || mode === _allocMode) return;
        _allocMode = mode;
        document.querySelectorAll('.alloc-tab').forEach((t) => t.classList.toggle('active', t === tab));
        if (_valuations.length) _renderChart(_valuations);
      });
    });
  }

  // ── Add-form submission ─────────────────────────────────────────────────
  function _wireAddForm() {
    const btn = document.getElementById('pf-add');
    const sym = document.getElementById('pf-symbol');
    const qty = document.getElementById('pf-qty');
    const cost = document.getElementById('pf-cost');
    const type = document.getElementById('pf-type');
    if (!btn || !sym || !qty || !cost || !type) {
      console.warn('[portfolio] add-form elements missing — aborting wire');
      return;
    }

    // Wave-15 §D: name-or-symbol autocomplete so users can type "Apple"
    // and find AAPL. Library is loaded via <script> tag in portfolio.html.
    if (window.PFCTickerAutocomplete && sym) {
      try { window.PFCTickerAutocomplete.wire(sym, type); } catch (_) {}
    }

    function _attempt() {
      // W16 §1 — replaces the silent focus-and-return pattern. Each branch
      // now toasts a specific reason so the user knows WHY nothing happened.
      const t = type.value;
      const s = (sym.value || '').trim().toUpperCase();
      const q = parseFloat(qty.value);
      const c = parseFloat(cost.value);
      if (!s) { _toast('Please enter a symbol or company name', 'danger'); sym.focus(); return; }
      if (s.length > 20) { _toast('Symbol looks too long — try the ticker (e.g. AAPL)', 'danger'); sym.focus(); return; }
      if (!isFinite(q) || q <= 0) { _toast('Please enter a quantity (e.g. 10 shares)', 'danger'); qty.focus(); return; }
      if (typeof PFCPortfolio === 'undefined' || typeof PFCPortfolio.add !== 'function') {
        _toast('Portfolio module not ready — try refreshing the page', 'danger');
        console.error('[portfolio] PFCPortfolio missing at add-time');
        return;
      }
      // Disable button + show progress so users see SOMETHING happen
      // immediately even before the (synchronous) add resolves.
      btn.disabled = true;
      const origText = btn.textContent;
      btn.textContent = 'Adding…';
      try {
        console.log('[portfolio] add() attempt:', { type: t, symbol: s, quantity: q, costBasis: c });
        const entry = PFCPortfolio.add({
          type: t, symbol: s, quantity: q,
          costBasis: isFinite(c) ? c : null,
        });
        console.log('[portfolio] add() returned:', entry, '| list() now has', PFCPortfolio.list().length, 'items');
        if (!entry) {
          _toast('Could not add — please check the symbol and quantity', 'danger');
          return;
        }
        sym.value = ''; qty.value = ''; cost.value = '';
        _toast(s + ' added · ' + q.toLocaleString() + (t === 'crypto' ? ' units' : ' shares'), 'success');
        _refresh();
      } catch (e) {
        console.error('[portfolio] add failed', e);
        _toast('Could not save — ' + (e && e.message ? e.message : 'unknown error'), 'danger');
      } finally {
        btn.disabled = false;
        btn.textContent = origText;
      }
    }
    btn.addEventListener('click', _attempt);
    [sym, qty, cost].forEach((el) => {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); _attempt(); }
      });
    });
  }

  // ── Setup-banner: detect MISSING_KEY response from /api/quote ───────────
  async function _detectSetup() {
    // Probe /api/quote?symbol=AAPL — if we get 503/MISSING_KEY, show banner.
    try {
      const res = await fetch('/api/quote?symbol=AAPL', { credentials: 'omit' });
      if (res.status === 503) {
        const body = await res.json().catch(() => ({}));
        if (body && body.code === 'MISSING_KEY') {
          document.getElementById('pf-setup-banner').classList.add('show');
        }
      }
    } catch (_) {}
  }

  // ── Main refresh path ───────────────────────────────────────────────────
  //
  // W16-bug — split-phase render. Founder reported "TSLA added · 56 shares"
  // toast fired but the table stayed empty. Root cause: the OLD path awaited
  // the quote-API fetch before rendering ANY row. If the API was slow, the
  // user saw no row appear. Now we:
  //   Phase 1 (sync, immediate) — render placeholder rows from list()
  //   Phase 2 (async) — replace with live prices when the fetch resolves
  // The row exists in storage the moment add() returns, so Phase 1 is
  // guaranteed to draw it. The quote API can fail entirely and the row
  // still renders with "—" placeholders + an error badge.
  async function _refresh() {
    if (!_planAllowsPortfolio()) { _showProGate(true); return; }
    _showProGate(false);

    const vsCur = _isoCode();

    // ─── PHASE 1: synchronous render from storage ──────────────────────
    const holdings = PFCPortfolio.list();
    console.log('[portfolio] _refresh phase 1 — list() returned', holdings.length, 'holdings:', holdings);
    const placeholderValuations = holdings.map((h) => ({
      holding: h, quote: null, value: null,
      change24h_pct: null, change24h_value: null,
      error: null,  // not an error — just pending
    }));
    _valuations = placeholderValuations;
    _renderKPIs(placeholderValuations);
    _renderTable(placeholderValuations);
    _renderChart(placeholderValuations);

    if (placeholderValuations.length === 0) {
      document.getElementById('pf-empty').style.display = 'block';
      document.getElementById('pf-sub').textContent = 'No holdings yet';
      return; // nothing to fetch
    }
    document.getElementById('pf-empty').style.display = 'none';
    document.getElementById('pf-sub').textContent = `Tracking ${holdings.length} holding${holdings.length===1?'':'s'} · fetching live prices…`;

    // ─── PHASE 2: async quote fetch (best-effort) ──────────────────────
    // W17-A — fetch SPY in PARALLEL with the holdings. SPY's 24h change %
    // becomes the benchmark in the 24h-change card hint. Failure to fetch
    // SPY is silent (we just don't show the comparison).
    let valuations = placeholderValuations;
    try {
      const [valResult, spyResult] = await Promise.all([
        PFCPortfolio.getPortfolioValuations(vsCur),
        PFCPortfolio.getStockQuote('SPY').catch(() => null),
      ]);
      valuations = valResult;
      _spyChangePct = (spyResult && isFinite(parseFloat(spyResult.change_pct)))
        ? parseFloat(spyResult.change_pct) : null;
    } catch (e) {
      console.error('[portfolio] valuations failed', e);
      valuations = holdings.map((h) => ({
        holding: h, quote: null, value: null,
        change24h_pct: null, change24h_value: null,
        error: { message: e.message, code: 'BATCH_FAIL' },
      }));
    }
    _valuations = valuations;
    _renderKPIs(valuations);
    _renderTable(valuations);
    _renderChart(valuations);

    const errs = valuations.filter((v) => v.error).length;
    const cryptoFallback = valuations.find((v) =>
      v.quote && v.quote.requested_vs_currency &&
      v.quote.requested_vs_currency !== v.quote.vs_currency
    );
    let baseMsg = errs > 0
      ? `Tracking ${valuations.length} holding${valuations.length===1?'':'s'} · ${errs} pricing error${errs===1?'':'s'}`
      : `Tracking ${valuations.length} holding${valuations.length===1?'':'s'} · live`;
    if (cryptoFallback) {
      const req = String(cryptoFallback.quote.requested_vs_currency).toUpperCase();
      baseMsg += ` · crypto shown in USD (CoinGecko doesn't price in ${req})`;
    }
    document.getElementById('pf-sub').textContent = baseMsg;
  }

  // ── Boot ────────────────────────────────────────────────────────────────
  function _boot() {
    if (typeof PFCPortfolio === 'undefined') {
      // W16 §1 — was silent; now we log AND wire the form anyway so the
      // toast feedback can still fire when the user attempts to add.
      console.error('[portfolio] PFCPortfolio is undefined at boot — pfc-portfolio.js may have failed to load');
    }
    _wireAddForm();
    _wireAllocTabs();
    _wireEditModal();
    const refreshBtn = document.getElementById('pf-refresh-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', _refresh);
    _detectSetup();

    // Initial render: wait for PFCUser + plan to resolve so we know whether
    // to show the Pro-gate or the working UI.
    function _whenPlanReady() {
      try {
        if (window.PFCPlan && typeof PFCPlan.onChange === 'function') {
          PFCPlan.onChange(() => _refresh());
        }
      } catch (_) {}
      _refresh();
    }
    if (typeof PFCAuth !== 'undefined' && typeof PFCAuth.onReady === 'function') {
      PFCAuth.onReady(_whenPlanReady);
    } else {
      _whenPlanReady();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _boot, { once: true });
  } else {
    _boot();
  }
})();
