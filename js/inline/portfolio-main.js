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
        if (u && u.currency) return u.currency;
      }
    } catch (_) {}
    return '$';
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
      const tickerCell = `<div class="h-symbol">${badge}<div class="h-symbol-meta"><span class="h-symbol-ticker">${_esc(h.symbol)}</span>${nameSpan}</div></div>`;

      let priceCell = '—', valueCell = '—', deltaCell = '<span class="h-delta-zero">—</span>';
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
      }

      row.innerHTML =
        `<td>${tickerCell}</td>` +
        `<td class="right">${(parseFloat(h.quantity) || 0).toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>` +
        `<td class="right">${priceCell}</td>` +
        `<td class="right">${valueCell}</td>` +
        `<td class="right">${deltaCell}</td>` +
        `<td class="right"><div class="h-actions">` +
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
        if (PFCPortfolio.remove(id)) _refresh();
      });
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
    hint.textContent = isFinite(pct) ? _fmtPct(pct) : '—';
    hint.className = 'summary-hint ' + (change > 0 ? 'delta-up' : change < 0 ? 'delta-down' : '');
    document.getElementById('pf-count-val').textContent = String(valuations.length);
    document.getElementById('pf-count-hint').textContent =
      stockCount + ' stock' + (stockCount===1?'':'s') + ' · ' + cryptoCount + ' crypto';
  }

  function _renderChart(valuations) {
    const canvas = document.getElementById('pf-chart');
    const legend = document.getElementById('pf-legend');
    if (!canvas || typeof Chart === 'undefined') return;
    const data = valuations
      .filter((v) => isFinite(v.value) && v.value > 0)
      .sort((a, b) => b.value - a.value);
    if (!data.length) {
      if (_chart) { _chart.destroy(); _chart = null; }
      legend.innerHTML = '';
      return;
    }
    const labels = data.map((v) => v.holding.symbol);
    const values = data.map((v) => v.value);
    const colors = data.map((_, i) => PALETTE[i % PALETTE.length]);

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
    legend.innerHTML = data.map((v, i) => {
      const pct = total > 0 ? (v.value / total) * 100 : 0;
      return `<div class="chart-legend-item"><span class="chart-legend-swatch" style="background:${colors[i]}"></span><span style="flex:1">${_esc(v.holding.symbol)}</span><span style="color:var(--text3)">${pct.toFixed(1)}%</span></div>`;
    }).join('');
  }

  // ── Add-form submission ─────────────────────────────────────────────────
  function _wireAddForm() {
    const btn = document.getElementById('pf-add');
    const sym = document.getElementById('pf-symbol');
    const qty = document.getElementById('pf-qty');
    const cost = document.getElementById('pf-cost');
    const type = document.getElementById('pf-type');

    function _attempt() {
      const t = type.value;
      const s = (sym.value || '').trim();
      const q = parseFloat(qty.value);
      const c = parseFloat(cost.value);
      if (!s) { sym.focus(); return; }
      if (!(q > 0)) { qty.focus(); return; }
      PFCPortfolio.add({
        type: t, symbol: s, quantity: q,
        costBasis: isFinite(c) ? c : null,
      });
      sym.value = ''; qty.value = ''; cost.value = '';
      _refresh();
    }
    btn.addEventListener('click', _attempt);
    [sym, qty, cost].forEach((el) => {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') _attempt();
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
  async function _refresh() {
    if (!_planAllowsPortfolio()) { _showProGate(true); return; }
    _showProGate(false);

    const vsCur = _isoCode();
    document.getElementById('pf-sub').textContent = 'Fetching live prices…';
    let valuations = [];
    try {
      valuations = await PFCPortfolio.getPortfolioValuations(vsCur);
    } catch (e) {
      console.error('[portfolio] valuations failed', e);
      valuations = PFCPortfolio.list().map((h) => ({
        holding: h, quote: null, value: null,
        change24h_pct: null, change24h_value: null,
        error: { message: e.message, code: 'BATCH_FAIL' },
      }));
    }
    _valuations = valuations;
    _renderKPIs(valuations);
    _renderTable(valuations);
    _renderChart(valuations);

    if (valuations.length === 0) {
      document.getElementById('pf-empty').style.display = 'block';
      document.getElementById('pf-sub').textContent = 'No holdings yet';
    } else {
      const errs = valuations.filter((v) => v.error).length;
      // Crypto fallback notice: if any crypto holding got a different vs_currency
      // than requested, surface "Displayed in USD — your local currency isn't
      // in CoinGecko's fiat list" so users understand why MUR/PKR/etc isn't
      // showing on their portfolio.
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
  }

  // ── Boot ────────────────────────────────────────────────────────────────
  function _boot() {
    if (typeof PFCPortfolio === 'undefined') return;
    _wireAddForm();
    document.getElementById('pf-refresh-btn').addEventListener('click', _refresh);
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
