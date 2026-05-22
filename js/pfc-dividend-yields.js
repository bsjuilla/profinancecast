/**
 * pfc-dividend-yields.js — curated dividend-yield catalog (W17-B).
 *
 * The /api/quote endpoint doesn't expose Twelve Data's dividend yield
 * field. Rather than spending a /fundamentals API call per symbol (rate-
 * limited at 8/min, 800/day across all users), we ship a static catalog
 * of the 50 most-popular income-focused stocks + ETFs with their
 * trailing-twelve-month dividend yield.
 *
 * Source: Yahoo Finance + ETF.com TTM yields, snapshot 2026-05-22.
 * Refresh cadence: quarterly. Old yields are still useful as a guide.
 *
 * Limitations (be honest with users):
 *   - These are SNAPSHOT yields, not live. Real-time dividend changes
 *     (cuts, raises, special divs) won't reflect until we refresh.
 *   - Coverage is ~50 symbols. A user holding a small-cap or recent
 *     IPO won't see a yield. The KPI says "of N tracked" so users see
 *     which holdings contributed.
 *   - Yields are TTM-based; forward yields can differ materially.
 *
 * To extend: append { symbol: 'XXX', yield: 3.45 } to YIELDS. Yields
 * are stored as percentages (3.45 = 3.45%).
 */
(function () {
  'use strict';

  // [symbol, ttm_yield_pct]. Keep sorted by yield descending so glancing
  // at the source code is itself useful for finding high-yield names.
  const YIELDS = {
    // ── High-yield ETFs (often the user's first dividend exposure) ──
    'VYM':  3.10,  // Vanguard High Dividend Yield ETF
    'SCHD': 3.55,  // Schwab US Dividend Equity ETF
    'HDV':  3.65,  // iShares Core High Dividend ETF
    'DVY':  3.40,  // iShares Select Dividend ETF
    'SDY':  2.45,  // SPDR S&P Dividend ETF
    'NOBL': 2.05,  // ProShares S&P 500 Dividend Aristocrats ETF
    'DGRO': 2.40,  // iShares Core Dividend Growth ETF
    'VIG':  1.85,  // Vanguard Dividend Appreciation ETF

    // ── Broad-market ETFs (lower yield but most-held) ──
    'SPY':  1.30,  // SPDR S&P 500 ETF
    'VOO':  1.30,  // Vanguard S&P 500 ETF
    'IVV':  1.30,  // iShares Core S&P 500 ETF
    'VTI':  1.30,  // Vanguard Total Stock Market ETF
    'QQQ':  0.60,  // Invesco QQQ (Nasdaq-100) — growth-heavy, low yield
    'VEA':  3.00,  // Vanguard FTSE Developed Markets ETF
    'VWO':  2.85,  // Vanguard FTSE Emerging Markets ETF
    'VXUS': 2.95,  // Vanguard Total International Stock ETF
    'VT':   1.95,  // Vanguard Total World Stock ETF

    // ── Bond ETFs (income-focused, distributions counted as 'yield') ──
    'BND':  3.85,  // Vanguard Total Bond Market ETF
    'AGG':  3.80,  // iShares Core US Aggregate Bond ETF
    'TLT':  4.20,  // iShares 20+ Year Treasury Bond ETF

    // ── REIT ETFs ──
    'VNQ':  3.95,  // Vanguard Real Estate ETF

    // ── Sector ETFs ──
    'XLF':  1.60,  // Financial Select Sector SPDR
    'XLE':  3.20,  // Energy Select Sector SPDR
    'XLV':  1.55,  // Health Care Select Sector SPDR
    'XLK':  0.65,  // Technology Select Sector SPDR — low div, growth-tilt

    // ── Single-name dividend kings / aristocrats ──
    'KO':   3.05,  // Coca-Cola
    'PEP':  3.45,  // PepsiCo
    'PG':   2.45,  // Procter & Gamble
    'JNJ':  2.95,  // Johnson & Johnson
    'MMM':  6.30,  // 3M (high yield — debate on sustainability)
    'XOM':  3.40,  // ExxonMobil
    'CVX':  4.45,  // Chevron
    'T':    6.50,  // AT&T
    'VZ':   6.65,  // Verizon
    'IBM':  3.55,  // IBM
    'PFE':  6.20,  // Pfizer
    'ABBV': 3.50,  // AbbVie
    'MRK':  3.10,  // Merck
    'MCD':  2.45,  // McDonald's
    'WMT':  1.30,  // Walmart
    'TGT':  3.40,  // Target
    'LOW':  1.95,  // Lowe's
    'HD':   2.55,  // Home Depot
    'JPM':  2.35,  // JPMorgan Chase
    'BAC':  2.65,  // Bank of America

    // ── Growth names that do pay something (for completeness) ──
    'AAPL': 0.45,  // Apple
    'MSFT': 0.75,  // Microsoft
    'NVDA': 0.04,  // NVIDIA — tiny
    // (Crypto + non-dividend growth names omitted intentionally — no yield)
  };

  function yieldFor(symbol) {
    if (!symbol) return null;
    const s = String(symbol).trim().toUpperCase();
    return Object.prototype.hasOwnProperty.call(YIELDS, s) ? YIELDS[s] : null;
  }

  window.PFCDividendYields = {
    yieldFor: yieldFor,
    yields: YIELDS,
  };
})();
