/**
 * pfc-ticker-autocomplete.js — symbol-or-name autocomplete for the portfolio
 * add-form. Wave-15 §D: users don't know that Apple's ticker is AAPL.
 *
 * Curated list: top 80 US stocks + 30 ETFs + 40 cryptos by daily volume / AUM.
 * Not exhaustive — the goal is to cover the 90% case where a beginner types
 * "Apple" or "S&P 500" and expects to find something. The textfield still
 * accepts any free-form symbol, so the long tail (BSE listings, AIM
 * micro-caps, niche tokens) is unaffected.
 *
 * Source quality: prices and verification happen server-side via /api/quote
 * (Twelve Data). This module is ONLY a typeahead — it does not validate
 * that the symbol exists. A wrong symbol still gets a "could not fetch
 * quote" message from the API on submit.
 */
(function () {
  'use strict';

  // [symbol, name, type]. type is 'stock', 'etf', or 'crypto' so we can
  // filter the dropdown by the user's #pf-type select.
  var CATALOG = [
    // ── US BLUE CHIPS / TOP 50 BY MARKET CAP ──
    ['AAPL', 'Apple Inc.', 'stock'],
    ['MSFT', 'Microsoft Corporation', 'stock'],
    ['GOOGL', 'Alphabet Inc. (Class A)', 'stock'],
    ['GOOG', 'Alphabet Inc. (Class C)', 'stock'],
    ['AMZN', 'Amazon.com Inc.', 'stock'],
    ['NVDA', 'NVIDIA Corporation', 'stock'],
    ['META', 'Meta Platforms Inc.', 'stock'],
    ['TSLA', 'Tesla Inc.', 'stock'],
    ['BRK.B', 'Berkshire Hathaway (Class B)', 'stock'],
    ['JPM', 'JPMorgan Chase & Co.', 'stock'],
    ['V', 'Visa Inc.', 'stock'],
    ['MA', 'Mastercard Inc.', 'stock'],
    ['UNH', 'UnitedHealth Group', 'stock'],
    ['JNJ', 'Johnson & Johnson', 'stock'],
    ['PG', 'Procter & Gamble', 'stock'],
    ['XOM', 'ExxonMobil Corporation', 'stock'],
    ['HD', 'The Home Depot', 'stock'],
    ['CVX', 'Chevron Corporation', 'stock'],
    ['BAC', 'Bank of America', 'stock'],
    ['ABBV', 'AbbVie Inc.', 'stock'],
    ['PFE', 'Pfizer Inc.', 'stock'],
    ['KO', 'The Coca-Cola Company', 'stock'],
    ['PEP', 'PepsiCo Inc.', 'stock'],
    ['WMT', 'Walmart Inc.', 'stock'],
    ['DIS', 'The Walt Disney Company', 'stock'],
    ['MCD', "McDonald's Corporation", 'stock'],
    ['NFLX', 'Netflix Inc.', 'stock'],
    ['ADBE', 'Adobe Inc.', 'stock'],
    ['CRM', 'Salesforce Inc.', 'stock'],
    ['INTC', 'Intel Corporation', 'stock'],
    ['AMD', 'Advanced Micro Devices', 'stock'],
    ['AVGO', 'Broadcom Inc.', 'stock'],
    ['CSCO', 'Cisco Systems', 'stock'],
    ['ORCL', 'Oracle Corporation', 'stock'],
    ['IBM', 'IBM Corporation', 'stock'],
    ['NKE', 'Nike Inc.', 'stock'],
    ['SBUX', 'Starbucks Corporation', 'stock'],
    ['BA', 'The Boeing Company', 'stock'],
    ['CAT', 'Caterpillar Inc.', 'stock'],
    ['GE', 'General Electric', 'stock'],
    ['F', 'Ford Motor Company', 'stock'],
    ['GM', 'General Motors', 'stock'],
    ['UBER', 'Uber Technologies', 'stock'],
    ['LYFT', 'Lyft Inc.', 'stock'],
    ['ABNB', 'Airbnb Inc.', 'stock'],
    ['SHOP', 'Shopify Inc.', 'stock'],
    ['SQ', 'Block Inc. (Square)', 'stock'],
    ['PYPL', 'PayPal Holdings', 'stock'],
    ['SPOT', 'Spotify Technology', 'stock'],
    ['PLTR', 'Palantir Technologies', 'stock'],
    ['COIN', 'Coinbase Global', 'stock'],
    ['SNAP', 'Snap Inc.', 'stock'],
    ['PINS', 'Pinterest Inc.', 'stock'],
    ['ZM', 'Zoom Communications', 'stock'],
    ['DOCU', 'DocuSign Inc.', 'stock'],
    ['NOW', 'ServiceNow Inc.', 'stock'],
    ['TEAM', 'Atlassian Corporation', 'stock'],
    ['MDB', 'MongoDB Inc.', 'stock'],
    ['DDOG', 'Datadog Inc.', 'stock'],
    ['NET', 'Cloudflare Inc.', 'stock'],
    ['SNOW', 'Snowflake Inc.', 'stock'],
    ['LLY', 'Eli Lilly and Company', 'stock'],
    ['MRK', 'Merck & Co.', 'stock'],
    ['T', 'AT&T Inc.', 'stock'],
    ['VZ', 'Verizon Communications', 'stock'],
    ['TMUS', 'T-Mobile US', 'stock'],
    ['COST', 'Costco Wholesale', 'stock'],
    ['TGT', 'Target Corporation', 'stock'],
    ['LOW', 'Lowe\'s Companies', 'stock'],

    // ── TOP ETFs ──
    ['SPY', 'SPDR S&P 500 ETF', 'etf'],
    ['VOO', 'Vanguard S&P 500 ETF', 'etf'],
    ['IVV', 'iShares Core S&P 500 ETF', 'etf'],
    ['VTI', 'Vanguard Total Stock Market ETF', 'etf'],
    ['QQQ', 'Invesco QQQ Trust (Nasdaq-100)', 'etf'],
    ['VEA', 'Vanguard FTSE Developed Markets ETF', 'etf'],
    ['VWO', 'Vanguard FTSE Emerging Markets ETF', 'etf'],
    ['VXUS', 'Vanguard Total International Stock ETF', 'etf'],
    ['VT', 'Vanguard Total World Stock ETF', 'etf'],
    ['BND', 'Vanguard Total Bond Market ETF', 'etf'],
    ['AGG', 'iShares Core US Aggregate Bond ETF', 'etf'],
    ['TLT', 'iShares 20+ Year Treasury Bond ETF', 'etf'],
    ['GLD', 'SPDR Gold Shares', 'etf'],
    ['IAU', 'iShares Gold Trust', 'etf'],
    ['SLV', 'iShares Silver Trust', 'etf'],
    ['VNQ', 'Vanguard Real Estate ETF', 'etf'],
    ['XLF', 'Financial Select Sector SPDR', 'etf'],
    ['XLK', 'Technology Select Sector SPDR', 'etf'],
    ['XLE', 'Energy Select Sector SPDR', 'etf'],
    ['XLV', 'Health Care Select Sector SPDR', 'etf'],
    ['ARKK', 'ARK Innovation ETF', 'etf'],
    ['IWM', 'iShares Russell 2000 ETF', 'etf'],
    ['DIA', 'SPDR Dow Jones Industrial Average ETF', 'etf'],
    ['EFA', 'iShares MSCI EAFE ETF', 'etf'],
    ['EEM', 'iShares MSCI Emerging Markets ETF', 'etf'],
    ['SCHD', 'Schwab US Dividend Equity ETF', 'etf'],
    ['SCHB', 'Schwab US Broad Market ETF', 'etf'],
    ['VYM', 'Vanguard High Dividend Yield ETF', 'etf'],
    ['VIG', 'Vanguard Dividend Appreciation ETF', 'etf'],
    ['SOXX', 'iShares Semiconductor ETF', 'etf'],

    // ── TOP CRYPTO ──
    ['BTC', 'Bitcoin', 'crypto'],
    ['ETH', 'Ethereum', 'crypto'],
    ['USDT', 'Tether', 'crypto'],
    ['BNB', 'BNB (Binance Coin)', 'crypto'],
    ['SOL', 'Solana', 'crypto'],
    ['USDC', 'USD Coin', 'crypto'],
    ['XRP', 'XRP (Ripple)', 'crypto'],
    ['ADA', 'Cardano', 'crypto'],
    ['DOGE', 'Dogecoin', 'crypto'],
    ['AVAX', 'Avalanche', 'crypto'],
    ['TRX', 'TRON', 'crypto'],
    ['DOT', 'Polkadot', 'crypto'],
    ['MATIC', 'Polygon', 'crypto'],
    ['LINK', 'Chainlink', 'crypto'],
    ['SHIB', 'Shiba Inu', 'crypto'],
    ['LTC', 'Litecoin', 'crypto'],
    ['BCH', 'Bitcoin Cash', 'crypto'],
    ['ATOM', 'Cosmos', 'crypto'],
    ['XLM', 'Stellar Lumens', 'crypto'],
    ['UNI', 'Uniswap', 'crypto'],
    ['ETC', 'Ethereum Classic', 'crypto'],
    ['NEAR', 'NEAR Protocol', 'crypto'],
    ['ALGO', 'Algorand', 'crypto'],
    ['ICP', 'Internet Computer', 'crypto'],
    ['FIL', 'Filecoin', 'crypto'],
    ['VET', 'VeChain', 'crypto'],
    ['HBAR', 'Hedera', 'crypto'],
    ['APT', 'Aptos', 'crypto'],
    ['ARB', 'Arbitrum', 'crypto'],
    ['OP', 'Optimism', 'crypto'],
    ['SUI', 'Sui', 'crypto'],
    ['INJ', 'Injective', 'crypto'],
    ['TIA', 'Celestia', 'crypto'],
    ['SEI', 'Sei Network', 'crypto'],
    ['RNDR', 'Render Network', 'crypto'],
    ['MKR', 'Maker', 'crypto'],
    ['AAVE', 'Aave', 'crypto'],
    ['CRO', 'Cronos', 'crypto'],
    ['FTM', 'Fantom', 'crypto'],
    ['SAND', 'The Sandbox', 'crypto'],
  ];

  // Type-narrowing maps to the #pf-type select values.
  // Both 'stock' and 'etf' show under the 'stock' filter (the select offers
  // only 'Stock / ETF' or 'Crypto').
  function _matchesType(entryType, selectValue) {
    if (selectValue === 'crypto') return entryType === 'crypto';
    return entryType === 'stock' || entryType === 'etf'; // default = Stock / ETF
  }

  function _search(query, selectValue, limit) {
    var q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    var out = [];
    // Two-pass scoring: exact-symbol prefix matches rank highest, name
    // contains matches rank lower. Both passes capped by limit.
    for (var i = 0; i < CATALOG.length && out.length < limit; i++) {
      var e = CATALOG[i];
      if (!_matchesType(e[2], selectValue)) continue;
      if (e[0].toLowerCase().indexOf(q) === 0) out.push({ s: e[0], n: e[1], t: e[2], r: 0 });
    }
    for (var j = 0; j < CATALOG.length && out.length < limit; j++) {
      var f = CATALOG[j];
      if (!_matchesType(f[2], selectValue)) continue;
      if (f[0].toLowerCase().indexOf(q) === 0) continue; // already in
      if (f[1].toLowerCase().indexOf(q) !== -1) out.push({ s: f[0], n: f[1], t: f[2], r: 1 });
    }
    return out;
  }

  function wire(inputEl, typeSelectEl) {
    if (!inputEl) return;
    var ddId = inputEl.id + '-dd';
    var dd = document.getElementById(ddId);
    if (!dd) {
      dd = document.createElement('div');
      dd.id = ddId;
      dd.className = 'pfc-ticker-dd';
      dd.setAttribute('role', 'listbox');
      dd.style.display = 'none';
      // Position relative to the input's wrapper. Caller is responsible
      // for ensuring the input's parent is position:relative.
      inputEl.parentNode.appendChild(dd);
    }
    function close() { dd.style.display = 'none'; dd.innerHTML = ''; }
    function render(results) {
      if (!results.length) { close(); return; }
      dd.innerHTML = results.map(function (r) {
        return '<div class="pfc-ticker-row" role="option" data-sym="' + r.s + '">'
          + '<span class="pfc-ticker-sym">' + r.s + '</span>'
          + '<span class="pfc-ticker-name">' + r.n + '</span>'
          + '<span class="pfc-ticker-type">' + r.t + '</span>'
          + '</div>';
      }).join('');
      dd.style.display = 'block';
      Array.prototype.forEach.call(dd.querySelectorAll('.pfc-ticker-row'), function (row) {
        row.addEventListener('mousedown', function (e) {
          e.preventDefault(); // keep input focus
          inputEl.value = row.getAttribute('data-sym');
          close();
          // Trigger an input event so any other listeners see the new value.
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        });
      });
    }
    inputEl.addEventListener('input', function () {
      var sel = typeSelectEl ? typeSelectEl.value : 'stock';
      render(_search(inputEl.value, sel, 8));
    });
    inputEl.addEventListener('focus', function () {
      var sel = typeSelectEl ? typeSelectEl.value : 'stock';
      render(_search(inputEl.value, sel, 8));
    });
    inputEl.addEventListener('blur', function () {
      // Slight delay so click on a row can fire first.
      setTimeout(close, 120);
    });
    // Re-filter when the type changes (e.g. switching to Crypto).
    if (typeSelectEl) {
      typeSelectEl.addEventListener('change', function () {
        if (document.activeElement === inputEl) {
          render(_search(inputEl.value, typeSelectEl.value, 8));
        }
      });
    }
  }

  window.PFCTickerAutocomplete = { wire: wire, _search: _search, catalog: CATALOG };
})();
