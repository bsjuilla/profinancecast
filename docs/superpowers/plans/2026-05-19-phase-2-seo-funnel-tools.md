# Phase 2 — SEO Funnel Tools + Programmatic SEO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Maps to Workstreams 7 + 8 in `2026-05-17-profinancecast-overhaul.md`.

**Goal:** Ship 5 high-traffic SEO funnel tools (compound interest, mortgage affordability, FIRE date, debt snowball-vs-avalanche, savings rate analyser) × 9 URL variants each (global + 8 countries: UK, IE, FR, DE, US, CA, AU, SG) = **45 indexable pages** that rank for tool-intent keywords, run entirely in the browser, and funnel to ProFinanceCast app signup.

**Architecture:** Static HTML on Vercel with `cleanUrls: true`. One folder per tool under `tools/<tool>/`. Each folder contains `index.html` (global, USD/en-US) plus `{uk,ie,fr,de,us,ca,au,sg}.html` country variants. Calculator math + UI assembly lives in **one shared JS module per tool** (`js/tools/<tool>.js`) plus one cross-tool helper library (`js/pfc-tools-lib.js`). Country variants override only locale, currency, tax-account terminology, country-specific FAQ, and meta tags — all via a `data-pfc-country="uk"` attribute on `<body>` that the shared JS reads at boot. Brand (Fraunces serif + emerald/gold tokens) preserved exactly. Schema.org markup on every page (`SoftwareApplication` + `BreadcrumbList` + `FAQPage`).

**Tech Stack:** Vanilla JS (ES2020), CSS custom properties from `css/pfc-tokens.css`, Chart.js 4.x (loaded via CDN, already CSP-approved in `vercel.json`), `Intl.NumberFormat` for currency, Vercel static routing. **No build step.** No new dependencies.

---

## Country Parameters (single source of truth)

This table is the authority. All locale logic reads from `js/pfc-tools-i18n.js` which exposes the same data.

| Country | code | Currency | Locale | Symbol | Tax-advantaged accounts | Avg mortgage rate (Q1 2026, informational only) | Avg property price for affordability default |
|---|---|---|---|---|---|---|---|
| Global | `global` | USD | en-US | $ | "tax-advantaged retirement account" | 6.8% | $420,000 |
| United Kingdom | `uk` | GBP | en-GB | £ | ISA · LISA · SIPP | 4.8% | £290,000 |
| Ireland | `ie` | EUR | en-IE | € | PRSA · EIIS | 4.4% | €350,000 |
| France | `fr` | EUR | fr-FR | € | PEA · Livret A · Assurance-vie | 3.9% | €290,000 |
| Germany | `de` | EUR | de-DE | € | Riester · Rürup · Bausparvertrag | 3.8% | €420,000 |
| United States | `us` | USD | en-US | $ | 401(k) · Roth IRA · HSA | 6.8% | $420,000 |
| Canada | `ca` | CAD | en-CA | CA$ | RRSP · TFSA · FHSA | 5.8% | C$680,000 |
| Australia | `au` | AUD | en-AU | A$ | Superannuation | 6.2% | A$890,000 |
| Singapore | `sg` | SGD | en-SG | S$ | CPF · SRS | 3.2% | S$1,650,000 |

Rates are **for informational defaults only** — calculator outputs are clearly labelled "estimate based on inputs, not a quote". Each country page footer carries a 1-line disclaimer.

---

## File Structure

```
profinancecast/
├── css/
│   └── pfc-tool-page.css                 # NEW — public-tool-page design system
├── js/
│   ├── pfc-tools-lib.js                  # NEW — shared helpers (currency, math, chart factory)
│   ├── pfc-tools-i18n.js                 # NEW — country parameter table
│   └── tools/                            # NEW directory
│       ├── compound-interest.js          # NEW
│       ├── mortgage-affordability.js     # NEW
│       ├── fire-date.js                  # NEW
│       ├── debt-strategy-compare.js      # NEW
│       └── savings-rate.js               # NEW
├── tools/
│   ├── index.html                        # MODIFY — link all 5 new tools
│   ├── compound-interest/                # NEW directory
│   │   ├── index.html                    # NEW — global (USD/en-US)
│   │   ├── uk.html                       # NEW
│   │   ├── ie.html                       # NEW
│   │   ├── fr.html                       # NEW
│   │   ├── de.html                       # NEW
│   │   ├── us.html                       # NEW
│   │   ├── ca.html                       # NEW
│   │   ├── au.html                       # NEW
│   │   └── sg.html                       # NEW
│   ├── mortgage-affordability/{same 9 files}    # NEW
│   ├── fire-date/{same 9 files}                 # NEW
│   ├── debt-strategy-compare/{same 9 files}     # NEW
│   └── savings-rate/{same 9 files}              # NEW
├── sitemap.xml                           # MODIFY — add 45 new URLs
└── vercel.json                           # MODIFY — no changes expected; cleanUrls already on

Total: 2 new CSS/dir, 7 new JS, 45 new HTML, 1 modified tools/index.html, 1 modified sitemap.xml = 56 files touched.
```

URL examples after deploy (`cleanUrls: true` strips `.html`):
- `/tools/compound-interest` → `tools/compound-interest/index.html`
- `/tools/compound-interest/uk` → `tools/compound-interest/uk.html`

---

## Shared CSS: `css/pfc-tool-page.css`

The public-tool-page pattern is different from the app-shell `tools/take-home-pay.html`. It has:
- The marketing nav (logo + Sign in + Start free) from `index.html` — NOT the app sidebar
- Hero with `section-index` rule + Fraunces H1 with gold italic em
- 2-column tool grid (inputs left, chart+outputs right)
- "How this works" explainer with formulas
- 5-question FAQ block (powers `FAQPage` schema)
- "Save your forecast" CTA strip at bottom → auth.html#signup
- Footer using `pfc-footer.css`

Will mirror `blog.html`'s freshly-aligned design (pill nav, gold key logo, etc.).

---

## Task 1: Shared infrastructure

**Files:**
- Create: `js/pfc-tools-i18n.js`
- Create: `js/pfc-tools-lib.js`
- Create: `css/pfc-tool-page.css`

- [ ] **Step 1.1: Create `js/pfc-tools-i18n.js` — country parameter source of truth**

```js
// js/pfc-tools-i18n.js — locale + currency + market parameters for public tool pages.
// Read by every tools/<tool>/*.html page via the data-pfc-country attribute on <body>.
// Single source of truth: edit here, every tool picks up the change on next page load.

window.PFC_TOOLS_I18N = {
  global: { code: 'global', currency: 'USD', locale: 'en-US', symbol: '$',
    taxAccount: 'tax-advantaged retirement account', mortgageRate: 6.8, propertyDefault: 420000,
    countryLabel: 'Global', flag: '🌐' },
  uk: { code: 'uk', currency: 'GBP', locale: 'en-GB', symbol: '£',
    taxAccount: 'ISA, LISA, or SIPP', mortgageRate: 4.8, propertyDefault: 290000,
    countryLabel: 'United Kingdom', flag: '🇬🇧' },
  ie: { code: 'ie', currency: 'EUR', locale: 'en-IE', symbol: '€',
    taxAccount: 'PRSA or EIIS', mortgageRate: 4.4, propertyDefault: 350000,
    countryLabel: 'Ireland', flag: '🇮🇪' },
  fr: { code: 'fr', currency: 'EUR', locale: 'fr-FR', symbol: '€',
    taxAccount: 'PEA, Livret A, or Assurance-vie', mortgageRate: 3.9, propertyDefault: 290000,
    countryLabel: 'France', flag: '🇫🇷' },
  de: { code: 'de', currency: 'EUR', locale: 'de-DE', symbol: '€',
    taxAccount: 'Riester, Rürup, or Bausparvertrag', mortgageRate: 3.8, propertyDefault: 420000,
    countryLabel: 'Germany', flag: '🇩🇪' },
  us: { code: 'us', currency: 'USD', locale: 'en-US', symbol: '$',
    taxAccount: '401(k), Roth IRA, or HSA', mortgageRate: 6.8, propertyDefault: 420000,
    countryLabel: 'United States', flag: '🇺🇸' },
  ca: { code: 'ca', currency: 'CAD', locale: 'en-CA', symbol: 'CA$',
    taxAccount: 'RRSP, TFSA, or FHSA', mortgageRate: 5.8, propertyDefault: 680000,
    countryLabel: 'Canada', flag: '🇨🇦' },
  au: { code: 'au', currency: 'AUD', locale: 'en-AU', symbol: 'A$',
    taxAccount: 'Superannuation', mortgageRate: 6.2, propertyDefault: 890000,
    countryLabel: 'Australia', flag: '🇦🇺' },
  sg: { code: 'sg', currency: 'SGD', locale: 'en-SG', symbol: 'S$',
    taxAccount: 'CPF or SRS', mortgageRate: 3.2, propertyDefault: 1650000,
    countryLabel: 'Singapore', flag: '🇸🇬' },
};

// Read the active country from the body tag (set by each HTML page) with global fallback.
window.PFC_TOOLS_COUNTRY = (() => {
  const code = document.body?.dataset?.pfcCountry || 'global';
  return window.PFC_TOOLS_I18N[code] || window.PFC_TOOLS_I18N.global;
})();
```

- [ ] **Step 1.2: Create `js/pfc-tools-lib.js` — cross-tool helpers**

```js
// js/pfc-tools-lib.js — shared helpers for public tool pages.
// Load AFTER pfc-tools-i18n.js. Exposes window.PFCTools.

(function () {
  const country = window.PFC_TOOLS_COUNTRY;

  function fmtCurrency(n, opts = {}) {
    if (!isFinite(n)) return country.symbol + '0';
    return new Intl.NumberFormat(country.locale, {
      style: 'currency', currency: country.currency,
      maximumFractionDigits: opts.decimals ?? 0,
      minimumFractionDigits: opts.decimals ?? 0,
    }).format(n);
  }

  function fmtNumber(n, decimals = 0) {
    if (!isFinite(n)) return '—';
    return new Intl.NumberFormat(country.locale, {
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals,
    }).format(n);
  }

  function fmtPercent(n, decimals = 1) {
    if (!isFinite(n)) return '—%';
    return new Intl.NumberFormat(country.locale, {
      style: 'percent', maximumFractionDigits: decimals, minimumFractionDigits: decimals,
    }).format(n / 100);
  }

  // Compound-growth formula: FV = PV(1+r)^n + PMT × ((1+r)^n − 1) / r
  // r = periodic rate, n = number of periods, PMT = periodic deposit (end of period).
  function futureValue({ principal, monthlyContribution, annualRate, years }) {
    const r = annualRate / 100 / 12;
    const n = years * 12;
    if (r === 0) return principal + monthlyContribution * n;
    const growthFactor = Math.pow(1 + r, n);
    return principal * growthFactor + monthlyContribution * (growthFactor - 1) / r;
  }

  // Monthly mortgage payment: P × r / (1 − (1+r)^−n).
  function monthlyMortgagePayment({ loan, annualRate, years }) {
    const r = annualRate / 100 / 12;
    const n = years * 12;
    if (r === 0) return loan / n;
    return loan * r / (1 - Math.pow(1 + r, -n));
  }

  // Affordable mortgage given monthly disposable: solve for P.
  function affordableLoan({ monthlyPayment, annualRate, years }) {
    const r = annualRate / 100 / 12;
    const n = years * 12;
    if (r === 0) return monthlyPayment * n;
    return monthlyPayment * (1 - Math.pow(1 + r, -n)) / r;
  }

  // Years to FI: n where FV(currentNW, monthlyContrib, expectedReturn, n) >= 25 × annualExpenses
  // (4% safe withdrawal rule). Binary search to 0.1 year precision.
  function yearsToFI({ currentNW, monthlyContribution, annualReturn, annualExpenses, swr = 0.04 }) {
    const target = annualExpenses / swr;
    if (currentNW >= target) return 0;
    let lo = 0, hi = 80;
    while (hi - lo > 0.1) {
      const mid = (lo + hi) / 2;
      const fv = futureValue({ principal: currentNW, monthlyContribution, annualRate: annualReturn, years: mid });
      if (fv >= target) hi = mid; else lo = mid;
    }
    return hi;
  }

  // Debt avalanche: highest-APR-first. Snowball: smallest-balance-first.
  // Simulate month-by-month until all balances zero. Returns { months, totalInterest, schedule }.
  function payoffSimulate(debts, monthlyBudget, strategy) {
    const order = (strategy === 'avalanche')
      ? [...debts].sort((a, b) => b.apr - a.apr)
      : [...debts].sort((a, b) => a.balance - b.balance);
    // Defensive copy so we don't mutate caller data
    let balances = order.map(d => ({ ...d }));
    let month = 0, interestPaid = 0;
    const cap = 600; // 50 years; abort if budget can't cover even minimums
    while (balances.some(d => d.balance > 0.01) && month < cap) {
      let budget = monthlyBudget;
      // 1. Accrue interest
      for (const d of balances) {
        if (d.balance <= 0) continue;
        const i = d.balance * (d.apr / 100 / 12);
        d.balance += i;
        interestPaid += i;
      }
      // 2. Pay minimums on all
      for (const d of balances) {
        if (d.balance <= 0) continue;
        const pay = Math.min(d.minimum, d.balance, budget);
        d.balance -= pay; budget -= pay;
      }
      // 3. Snowball remaining budget into target order (first non-zero in `balances`)
      for (const d of balances) {
        if (budget <= 0) break;
        if (d.balance <= 0) continue;
        const extra = Math.min(budget, d.balance);
        d.balance -= extra; budget -= extra;
      }
      month++;
    }
    return { months: month, totalInterest: interestPaid, infeasible: month >= cap };
  }

  // Make a Chart.js line chart. Caller provides labels + datasets. Returns chart instance.
  function makeLineChart(canvas, labels, datasets, opts = {}) {
    if (typeof Chart === 'undefined') {
      console.error('[pfc-tools-lib] Chart.js not loaded');
      return null;
    }
    return new Chart(canvas, {
      type: 'line',
      data: { labels, datasets },
      options: Object.assign({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#B8C2BC', font: { family: "'Inter Tight', sans-serif", size: 12 } } },
          tooltip: {
            backgroundColor: '#16271F', titleColor: '#F0EDE2', bodyColor: '#B8C2BC',
            borderColor: 'rgba(240,237,226,0.10)', borderWidth: 1, padding: 10,
            callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtCurrency(ctx.parsed.y)}` },
          },
        },
        scales: {
          x: { grid: { color: 'rgba(240,237,226,0.06)' }, ticks: { color: '#6F7C75' } },
          y: { grid: { color: 'rgba(240,237,226,0.06)' },
               ticks: { color: '#6F7C75', callback: (v) => fmtCurrency(v) } },
        },
      }, opts),
    });
  }

  // Tiny self-test runner. Called by each tool page on DOMContentLoaded.
  function runSelfTests(testFn) {
    if (!window.location.search.includes('selftest=1')) return;
    try {
      testFn({ assert: (cond, msg) => { if (!cond) throw new Error(msg); console.log('✓', msg); } });
      console.log('%c[pfc-tools] all self-tests passed', 'color:#2BB67D;font-weight:bold');
    } catch (e) {
      console.error('[pfc-tools] self-test FAILED:', e.message);
    }
  }

  window.PFCTools = {
    country, fmtCurrency, fmtNumber, fmtPercent,
    futureValue, monthlyMortgagePayment, affordableLoan, yearsToFI, payoffSimulate,
    makeLineChart, runSelfTests,
  };
})();
```

- [ ] **Step 1.3: Create `css/pfc-tool-page.css` — design system for public tool pages**

```css
/* css/pfc-tool-page.css — public-tool-page design system.
   Mirrors blog.html / index.html visual tokens. Loaded AFTER pfc-tokens.css. */

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: var(--font-body); background: var(--canvas); color: var(--ink); line-height: 1.6; -webkit-font-smoothing: antialiased; }
a { color: inherit; }

/* ── NAV (mirrors blog.html exactly) ─────────────────────────────────── */
.pfc-tool-nav {
  position: sticky; top: 12px; z-index: 100;
  width: calc(100% - 48px); max-width: 1200px; margin: 12px auto 0;
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 18px; background: rgba(11,20,16,0.72);
  border: 1px solid var(--line); border-radius: var(--r-pill);
  backdrop-filter: blur(14px) saturate(120%);
}
.pfc-tool-nav .logo { display: flex; align-items: center; gap: 10px;
  font-family: var(--font-display); font-size: 16px; font-weight: 500;
  color: var(--ink); text-decoration: none; letter-spacing: -0.01em; }
.pfc-tool-nav .nav-links { display: flex; align-items: center; gap: 28px; }
.pfc-tool-nav .nav-links a { font-size: 13.5px; color: var(--ink-2); text-decoration: none; transition: color var(--t-base) var(--ease-out); }
.pfc-tool-nav .nav-links a:hover, .pfc-tool-nav .nav-links a.active { color: var(--ink); }
.pfc-tool-nav .nav-cta { display: flex; gap: 10px; align-items: center; }
.pfc-tool-nav .btn { display: inline-flex; align-items: center; gap: 6px;
  padding: 9px 18px; border-radius: var(--r-pill);
  font-size: 13px; font-weight: 500; text-decoration: none; cursor: pointer;
  transition: transform var(--t-base) var(--ease-out), background var(--t-base) var(--ease-out); }
.pfc-tool-nav .btn-ghost { background: transparent; color: var(--ink-2); }
.pfc-tool-nav .btn-ghost:hover { color: var(--ink); }
.pfc-tool-nav .btn-primary { background: var(--money); color: #0B1410; font-weight: 600; }
.pfc-tool-nav .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 14px 50px var(--money-glow); }

/* ── HERO ────────────────────────────────────────────────────────────── */
.pfc-tool-hero { max-width: 1100px; margin: 0 auto; padding: 96px 24px 40px; }
.pfc-tool-hero .country-pill {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 6px 14px; border-radius: var(--r-pill);
  background: var(--gold-soft); border: 1px solid rgba(212,175,106,0.22);
  font-family: var(--font-mono); font-size: 11px; color: var(--gold);
  letter-spacing: 0.10em; text-transform: uppercase; margin-bottom: 18px;
}
.pfc-tool-hero h1 { font-family: var(--font-display); font-size: clamp(36px, 5.5vw, 64px);
  font-weight: 480; line-height: 1.05; letter-spacing: -0.02em; margin-bottom: 18px; text-wrap: balance; }
.pfc-tool-hero h1 em { font-style: italic; color: var(--gold); font-weight: 460; }
.pfc-tool-hero p { font-size: clamp(15px, 1.4vw, 18px); color: var(--ink-2); font-weight: 300;
  max-width: 60ch; line-height: 1.6; text-wrap: pretty; }

/* ── TOOL GRID (inputs / outputs) ────────────────────────────────────── */
.pfc-tool-grid {
  max-width: 1100px; margin: 0 auto; padding: 0 24px 60px;
  display: grid; grid-template-columns: 1fr 1.2fr; gap: 28px;
}
@media (max-width: 900px) { .pfc-tool-grid { grid-template-columns: 1fr; } }

.pfc-tool-card {
  background: linear-gradient(180deg, var(--surface-2) 0%, var(--surface) 100%);
  border: 1px solid var(--line); border-radius: var(--r-lg);
  padding: 28px; display: flex; flex-direction: column; gap: 18px;
}
.pfc-tool-card h2 { font-family: var(--font-display); font-size: 20px; font-weight: 500;
  letter-spacing: -0.01em; margin-bottom: 4px; }
.pfc-tool-card .sub { font-size: 13px; color: var(--ink-3); margin-bottom: 12px; }

.pfc-field { display: flex; flex-direction: column; gap: 6px; }
.pfc-field label { font-family: var(--font-mono); font-size: 11px;
  color: var(--ink-3); letter-spacing: 0.10em; text-transform: uppercase; }
.pfc-field input, .pfc-field select {
  background: var(--canvas); color: var(--ink);
  border: 1px solid var(--line-2); border-radius: var(--r-sm);
  padding: 11px 14px; font-family: var(--font-body); font-size: 15px;
  font-feature-settings: "tnum" 1, "lnum" 1;
  transition: border-color var(--t-base) var(--ease-out);
}
.pfc-field input:focus, .pfc-field select:focus {
  outline: none; border-color: var(--money);
}
.pfc-field .with-symbol { display: grid; grid-template-columns: auto 1fr; align-items: center; }
.pfc-field .with-symbol .sym { padding: 0 10px; color: var(--ink-3); font-family: var(--font-mono); font-size: 14px; }

.pfc-output-row { display: flex; justify-content: space-between; align-items: baseline;
  padding: 14px 0; border-bottom: 1px dashed var(--line); }
.pfc-output-row:last-child { border-bottom: none; }
.pfc-output-row .lbl { font-size: 13px; color: var(--ink-2); }
.pfc-output-row .val { font-family: var(--font-mono); font-size: 22px; color: var(--ink);
  font-feature-settings: "tnum" 1, "lnum" 1; }
.pfc-output-row .val.hero { font-size: 32px; color: var(--money); font-weight: 500; }
.pfc-output-row .val.warn { color: var(--warning); }
.pfc-output-row .val.gold { color: var(--gold); }

.pfc-chart-wrap { height: 280px; }

/* ── EXPLAINER + FAQ ─────────────────────────────────────────────────── */
.pfc-explainer { max-width: 880px; margin: 0 auto; padding: 40px 24px;
  border-top: 1px solid var(--line); }
.pfc-explainer h2 { font-family: var(--font-display); font-size: 28px; font-weight: 500;
  letter-spacing: -0.01em; margin-bottom: 16px; }
.pfc-explainer h2 em { font-style: italic; color: var(--gold); font-weight: 460; }
.pfc-explainer p { font-size: 15.5px; color: var(--ink-2); line-height: 1.7; margin-bottom: 14px; max-width: 64ch; }
.pfc-explainer .formula {
  background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-sm);
  padding: 16px 20px; font-family: var(--font-mono); font-size: 14px;
  color: var(--ink); margin: 18px 0; overflow-x: auto;
}

.pfc-faq { max-width: 880px; margin: 0 auto; padding: 20px 24px 60px; }
.pfc-faq h2 { font-family: var(--font-display); font-size: 28px; font-weight: 500;
  letter-spacing: -0.01em; margin-bottom: 24px; }
.pfc-faq details {
  background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-sm);
  padding: 16px 20px; margin-bottom: 10px;
}
.pfc-faq summary { font-family: var(--font-display); font-size: 16px; font-weight: 500;
  color: var(--ink); cursor: pointer; list-style: none; }
.pfc-faq summary::-webkit-details-marker { display: none; }
.pfc-faq summary::after { content: '+'; float: right; color: var(--gold); font-size: 18px; }
.pfc-faq details[open] summary::after { content: '−'; }
.pfc-faq p { font-size: 14.5px; color: var(--ink-2); line-height: 1.65; margin-top: 12px; max-width: 64ch; }

/* ── CTA STRIP ───────────────────────────────────────────────────────── */
.pfc-tool-cta {
  max-width: 1100px; margin: 0 auto 80px; padding: 40px 24px;
  background: linear-gradient(135deg, rgba(43,182,125,0.08), rgba(212,175,106,0.05));
  border: 1px solid var(--line-2); border-radius: var(--r-lg);
  display: grid; grid-template-columns: 1fr auto; gap: 24px; align-items: center;
}
@media (max-width: 700px) { .pfc-tool-cta { grid-template-columns: 1fr; } }
.pfc-tool-cta h3 { font-family: var(--font-display); font-size: clamp(22px, 2.4vw, 28px);
  font-weight: 500; letter-spacing: -0.01em; margin-bottom: 8px; }
.pfc-tool-cta p { font-size: 14.5px; color: var(--ink-2); max-width: 56ch; }
.pfc-tool-cta .btn-primary { padding: 12px 26px; background: var(--money); color: #0B1410;
  border-radius: var(--r-pill); font-weight: 600; font-size: 14px; text-decoration: none;
  display: inline-flex; align-items: center; gap: 8px; white-space: nowrap;
  transition: transform var(--t-base) var(--ease-out), box-shadow var(--t-base) var(--ease-out); }
.pfc-tool-cta .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 14px 40px var(--money-glow); }

/* ── COUNTRY SWITCHER ────────────────────────────────────────────────── */
.pfc-country-switcher {
  max-width: 1100px; margin: 0 auto; padding: 0 24px 20px;
  display: flex; flex-wrap: wrap; gap: 8px; font-family: var(--font-mono);
}
.pfc-country-switcher .lbl { font-size: 11px; color: var(--ink-3); letter-spacing: 0.10em;
  text-transform: uppercase; align-self: center; margin-right: 6px; }
.pfc-country-switcher a {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 12px; border-radius: var(--r-pill);
  border: 1px solid var(--line-2); font-size: 12px;
  color: var(--ink-2); text-decoration: none;
  transition: all var(--t-base) var(--ease-out);
}
.pfc-country-switcher a:hover { color: var(--ink); border-color: var(--line-3); }
.pfc-country-switcher a.active { background: var(--surface-2); color: var(--ink); border-color: var(--line-3); }
```

- [ ] **Step 1.4: Run a syntax sanity-check on the new JS modules**

Run:
```bash
node --check js/pfc-tools-lib.js && node --check js/pfc-tools-i18n.js && echo "JS OK"
```
Expected: `JS OK`

- [ ] **Step 1.5: Commit**

```bash
git add js/pfc-tools-lib.js js/pfc-tools-i18n.js css/pfc-tool-page.css
git commit -m "feat(tools): shared lib + i18n + design system for public tool pages"
```

---

## Task 2: Compound Interest tool — global page

**Files:**
- Create: `js/tools/compound-interest.js`
- Create: `tools/compound-interest/index.html`

- [ ] **Step 2.1: Create `js/tools/compound-interest.js` — UI assembly + self-tests**

```js
// js/tools/compound-interest.js — global + per-country compound interest calculator.
// Reads country params from window.PFC_TOOLS_COUNTRY (set via <body data-pfc-country="…">).

(function () {
  const { fmtCurrency, fmtNumber, futureValue, makeLineChart, runSelfTests, country } = window.PFCTools;

  function compute() {
    const principal = +document.getElementById('ci-principal').value || 0;
    const monthly   = +document.getElementById('ci-monthly').value || 0;
    const rate      = +document.getElementById('ci-rate').value || 0;
    const years     = +document.getElementById('ci-years').value || 0;

    const fv = futureValue({ principal, monthlyContribution: monthly, annualRate: rate, years });
    const totalContrib = principal + monthly * 12 * years;
    const interest = fv - totalContrib;

    document.getElementById('ci-fv').textContent       = fmtCurrency(fv);
    document.getElementById('ci-contrib').textContent  = fmtCurrency(totalContrib);
    document.getElementById('ci-interest').textContent = fmtCurrency(interest);
    document.getElementById('ci-multiplier').textContent =
      totalContrib > 0 ? (fv / totalContrib).toFixed(2) + '×' : '—';

    // Build chart series: year-by-year balance.
    const labels = [], series = [], contribSeries = [];
    for (let y = 0; y <= years; y++) {
      labels.push('Y' + y);
      series.push(futureValue({ principal, monthlyContribution: monthly, annualRate: rate, years: y }));
      contribSeries.push(principal + monthly * 12 * y);
    }
    if (window._ciChart) window._ciChart.destroy();
    window._ciChart = makeLineChart(document.getElementById('ci-chart'), labels, [
      { label: 'Balance', data: series, borderColor: '#2BB67D', backgroundColor: 'rgba(43,182,125,0.12)',
        fill: true, tension: 0.3, borderWidth: 2, pointRadius: 0 },
      { label: 'Just contributions', data: contribSeries, borderColor: '#D4AF6A',
        borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0, fill: false },
    ]);
  }

  function init() {
    ['ci-principal','ci-monthly','ci-rate','ci-years'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', compute);
    });
    // Set default principal/monthly in active currency.
    const defaults = { global: 10000, us: 10000, uk: 10000, ie: 10000, fr: 10000,
                       de: 10000, ca: 13000, au: 15000, sg: 13000 };
    document.getElementById('ci-principal').value = defaults[country.code] ?? 10000;
    compute();

    // Self-tests (URL ?selftest=1)
    runSelfTests(({ assert }) => {
      const fv0 = futureValue({ principal: 1000, monthlyContribution: 0, annualRate: 10, years: 1 });
      assert(Math.abs(fv0 - 1104.71) < 0.5, 'FV $1000 @10% /1yr ≈ $1104.71');
      const fv1 = futureValue({ principal: 0, monthlyContribution: 100, annualRate: 0, years: 1 });
      assert(Math.abs(fv1 - 1200) < 0.01, 'Zero-rate annuity equals plain sum');
      const fv2 = futureValue({ principal: 10000, monthlyContribution: 500, annualRate: 7, years: 30 });
      assert(fv2 > 600000 && fv2 < 700000, '$10k + $500/mo @7% × 30y ≈ $640k');
    });
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
```

- [ ] **Step 2.2: Create `tools/compound-interest/index.html` — global page**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Compound Interest Calculator — see how your money grows | ProFinanceCast</title>
<meta name="description" content="Free compound interest calculator. See how your savings grow over time with monthly contributions and compounding returns. Runs in your browser, no signup.">
<link rel="canonical" href="https://profinancecast.com/tools/compound-interest">
<meta name="robots" content="index,follow">
<link rel="alternate" hreflang="en" href="https://profinancecast.com/tools/compound-interest">
<link rel="alternate" hreflang="x-default" href="https://profinancecast.com/tools/compound-interest">
<link rel="alternate" hreflang="en-GB" href="https://profinancecast.com/tools/compound-interest/uk">
<link rel="alternate" hreflang="en-IE" href="https://profinancecast.com/tools/compound-interest/ie">
<link rel="alternate" hreflang="fr-FR" href="https://profinancecast.com/tools/compound-interest/fr">
<link rel="alternate" hreflang="de-DE" href="https://profinancecast.com/tools/compound-interest/de">
<link rel="alternate" hreflang="en-US" href="https://profinancecast.com/tools/compound-interest/us">
<link rel="alternate" hreflang="en-CA" href="https://profinancecast.com/tools/compound-interest/ca">
<link rel="alternate" hreflang="en-AU" href="https://profinancecast.com/tools/compound-interest/au">
<link rel="alternate" hreflang="en-SG" href="https://profinancecast.com/tools/compound-interest/sg">

<meta property="og:type" content="website">
<meta property="og:title" content="Compound Interest Calculator — see how your money grows">
<meta property="og:description" content="Free, no-signup compound interest calculator with monthly contributions and a year-by-year chart.">
<meta property="og:url" content="https://profinancecast.com/tools/compound-interest">
<meta property="og:image" content="https://profinancecast.com/api/og?title=Compound+Interest+Calculator&eyebrow=Tools&subtitle=See+how+your+money+compounds.">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:site_name" content="ProFinanceCast">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Compound Interest Calculator">
<meta name="twitter:description" content="See how your savings grow over time. Runs in your browser, no signup.">
<meta name="twitter:image" content="https://profinancecast.com/api/og?title=Compound+Interest+Calculator&eyebrow=Tools&subtitle=See+how+your+money+compounds.">

<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600&family=Inter+Tight:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap">
<link rel="stylesheet" media="print" onload="this.media='all'" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600&family=Inter+Tight:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap">

<link rel="stylesheet" href="../../css/pfc-tokens.css">
<link rel="stylesheet" href="../../css/pfc-tool-page.css">
<link rel="stylesheet" href="../../css/pfc-footer.css">

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "name": "Compound Interest Calculator",
      "applicationCategory": "FinanceApplication",
      "operatingSystem": "Web",
      "url": "https://profinancecast.com/tools/compound-interest",
      "description": "Free compound interest calculator with monthly contributions and year-by-year visualisation.",
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
      "publisher": { "@type": "Organization", "name": "ProFinanceCast", "url": "https://profinancecast.com" }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://profinancecast.com/" },
        { "@type": "ListItem", "position": 2, "name": "Tools", "item": "https://profinancecast.com/tools/" },
        { "@type": "ListItem", "position": 3, "name": "Compound Interest", "item": "https://profinancecast.com/tools/compound-interest" }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        { "@type": "Question", "name": "What is compound interest?",
          "acceptedAnswer": { "@type": "Answer", "text": "Compound interest is interest earned on both your original deposit AND on the interest already credited. It causes balances to grow faster over time — the longer you leave money invested, the more dramatic the effect." } },
        { "@type": "Question", "name": "How is compound interest calculated?",
          "acceptedAnswer": { "@type": "Answer", "text": "Future Value = Principal × (1 + r)^n + PMT × ((1 + r)^n − 1) / r, where r is the periodic interest rate (annual rate ÷ 12 for monthly compounding) and n is the total number of periods." } },
        { "@type": "Question", "name": "What return rate should I assume?",
          "acceptedAnswer": { "@type": "Answer", "text": "For a globally-diversified equity index fund, 6–8% annualised after inflation is a common historical assumption. Cash and bonds run lower. This calculator does not promise any specific return — model multiple scenarios." } },
        { "@type": "Question", "name": "Does this account for inflation?",
          "acceptedAnswer": { "@type": "Answer", "text": "No — the figures shown are nominal. To see real (after-inflation) growth, subtract an inflation estimate (typically 2–3%) from your assumed return rate before entering it." } },
        { "@type": "Question", "name": "Does this account for taxes?",
          "acceptedAnswer": { "@type": "Answer", "text": "No. If you're saving inside a tax-advantaged account (ISA, 401(k), Roth IRA, etc.), returns are typically tax-free or tax-deferred. Outside one, capital gains and dividend taxes will reduce the effective return." } }
      ]
    }
  ]
}
</script>
</head>
<body data-pfc-country="global">

<nav class="pfc-tool-nav" role="banner" aria-label="Primary navigation">
  <a class="logo" href="/" aria-label="ProFinanceCast home">
    <span class="logo-mark" aria-hidden="true">
      <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
        <path d="M5 22 L11 19.5 L17 14.5 L23 7" fill="none" stroke="#D4AF6A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="23" cy="7" r="3" fill="#D4AF6A" fill-opacity="0.22"/>
        <circle cx="23" cy="7" r="1.8" fill="#D4AF6A"/>
      </svg>
    </span>
    ProFinanceCast
  </a>
  <div class="nav-links">
    <a href="/#features">Features</a>
    <a href="/#pricing">Pricing</a>
    <a href="/tools/" class="active">Tools</a>
    <a href="/blog">Blog</a>
  </div>
  <div class="nav-cta">
    <a href="/auth.html" class="btn btn-ghost">Sign in</a>
    <a href="/auth.html#signup" class="btn btn-primary">Start free
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3 7h8m-3-3l3 3-3 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </a>
  </div>
</nav>

<header class="pfc-tool-hero">
  <span class="country-pill">🌐 Global · USD</span>
  <h1>Compound interest, <em>visualised.</em></h1>
  <p>Enter what you have, what you're adding each month, the return you expect, and how long you'll leave it. See exactly when compounding starts pulling ahead of your contributions.</p>
</header>

<section class="pfc-tool-grid">
  <div class="pfc-tool-card">
    <h2>Your inputs</h2>
    <div class="sub">All figures in USD. Switch country at the bottom for local presets.</div>

    <div class="pfc-field">
      <label for="ci-principal">Starting amount</label>
      <div class="with-symbol"><span class="sym">$</span><input id="ci-principal" type="number" min="0" step="100" value="10000"></div>
    </div>
    <div class="pfc-field">
      <label for="ci-monthly">Monthly contribution</label>
      <div class="with-symbol"><span class="sym">$</span><input id="ci-monthly" type="number" min="0" step="50" value="500"></div>
    </div>
    <div class="pfc-field">
      <label for="ci-rate">Annual return (%)</label>
      <input id="ci-rate" type="number" min="0" max="30" step="0.1" value="7">
    </div>
    <div class="pfc-field">
      <label for="ci-years">Years</label>
      <input id="ci-years" type="number" min="1" max="60" step="1" value="30">
    </div>
  </div>

  <div class="pfc-tool-card">
    <h2>Result</h2>
    <div class="pfc-output-row"><span class="lbl">Final balance</span><span id="ci-fv" class="val hero">—</span></div>
    <div class="pfc-output-row"><span class="lbl">You put in</span><span id="ci-contrib" class="val">—</span></div>
    <div class="pfc-output-row"><span class="lbl">Interest earned</span><span id="ci-interest" class="val gold">—</span></div>
    <div class="pfc-output-row"><span class="lbl">Money multiplier</span><span id="ci-multiplier" class="val">—</span></div>
    <div class="pfc-chart-wrap"><canvas id="ci-chart"></canvas></div>
  </div>
</section>

<nav class="pfc-country-switcher" aria-label="Country versions">
  <span class="lbl">Localised:</span>
  <a href="/tools/compound-interest" class="active">🌐 Global</a>
  <a href="/tools/compound-interest/uk">🇬🇧 UK</a>
  <a href="/tools/compound-interest/ie">🇮🇪 Ireland</a>
  <a href="/tools/compound-interest/fr">🇫🇷 France</a>
  <a href="/tools/compound-interest/de">🇩🇪 Germany</a>
  <a href="/tools/compound-interest/us">🇺🇸 US</a>
  <a href="/tools/compound-interest/ca">🇨🇦 Canada</a>
  <a href="/tools/compound-interest/au">🇦🇺 Australia</a>
  <a href="/tools/compound-interest/sg">🇸🇬 Singapore</a>
</nav>

<section class="pfc-explainer">
  <h2>How this works — <em>plain English.</em></h2>
  <p>Compound interest is interest earned on interest. Each period, your balance grows by the previous balance times the periodic rate, then your contribution is added. Over decades the compounded portion dwarfs the contributed portion — the "hockey stick" curve every personal-finance article keeps showing you.</p>
  <div class="formula">FV = P × (1 + r)<sup>n</sup> + PMT × ((1 + r)<sup>n</sup> − 1) / r</div>
  <p><strong>P</strong> is your starting amount. <strong>PMT</strong> is each monthly contribution. <strong>r</strong> is the monthly rate (annual ÷ 12). <strong>n</strong> is the total number of months. Each input above is plugged into this formula and the chart shows the running balance year by year.</p>
  <p><strong>Important:</strong> figures are nominal — they don't subtract inflation, fees, or taxes. To see "real" growth, subtract roughly 2–3% from your return assumption to net out inflation.</p>
</section>

<section class="pfc-faq">
  <h2>Frequently asked.</h2>
  <details><summary>What is compound interest?</summary>
    <p>Compound interest is interest earned on both your original deposit AND on the interest already credited. It causes balances to grow faster over time — the longer you leave money invested, the more dramatic the effect.</p></details>
  <details><summary>How is compound interest calculated?</summary>
    <p>Future Value = Principal × (1 + r)<sup>n</sup> + PMT × ((1 + r)<sup>n</sup> − 1) / r, where r is the periodic interest rate (annual rate ÷ 12 for monthly compounding) and n is the total number of periods.</p></details>
  <details><summary>What return rate should I assume?</summary>
    <p>For a globally-diversified equity index fund, 6–8% annualised is a common historical assumption. Cash and bonds run lower. This calculator does not promise any specific return — model multiple scenarios.</p></details>
  <details><summary>Does this account for inflation?</summary>
    <p>No — the figures shown are nominal. To see real (after-inflation) growth, subtract an inflation estimate (typically 2–3%) from your assumed return rate before entering it.</p></details>
  <details><summary>Does this account for taxes?</summary>
    <p>No. If you're saving inside a tax-advantaged retirement account, returns are typically tax-free or tax-deferred. Outside one, capital gains and dividend taxes will reduce the effective return.</p></details>
</section>

<section class="pfc-tool-cta">
  <div>
    <h3>Save this forecast and track it over time.</h3>
    <p>ProFinanceCast turns one-off calculations into a living 10-year forecast that updates as your income, expenses, and goals change. Free forever for the core forecast.</p>
  </div>
  <a href="/auth.html#signup" class="btn-primary">Start free
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3 7h8m-3-3l3 3-3 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </a>
</section>

<footer class="site-footer" role="contentinfo">
  <!-- Reuses pfc-footer.css. Same footer markup as blog.html. -->
  <div class="footer-grid">
    <div class="footer-col"><h4>Product</h4><ul><li><a href="/">Forecast</a></li><li><a href="/blog">Journal</a></li><li><a href="/billing.html">Pricing</a></li><li><a href="/tools/">Tools</a></li></ul></div>
    <div class="footer-col"><h4>Company</h4><ul><li><a href="/about.html">About</a></li><li><a href="/about.html#methodology">Methodology</a></li><li><a href="/llms.txt">For language models</a></li></ul></div>
    <div class="footer-col"><h4>Resources</h4><ul><li><a href="/help.html">Help</a></li><li><a href="/blog">Articles</a></li></ul></div>
    <div class="footer-col"><h4>Trust</h4><ul><li><a href="/about.html#methodology">Methodology</a></li><li><a href="/privacy.html">Data handling</a></li><li><a href="/terms.html">Terms</a></li></ul></div>
  </div>
  <div class="footer-stamp"><span>© 2026 ProFinanceCast — Built in Europe</span><span>Calculator estimates only, not financial advice.</span></div>
</footer>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js" defer></script>
<script src="../../js/pfc-tools-i18n.js" defer></script>
<script src="../../js/pfc-tools-lib.js" defer></script>
<script src="../../js/tools/compound-interest.js" defer></script>
</body>
</html>
```

- [ ] **Step 2.3: Run self-test in a local server**

Run: spin up any static server in the project root (e.g. `npx http-server -p 8080 -o /tools/compound-interest?selftest=1`) and open the URL. Watch the console.
Expected: `✓ FV $1000 @10% /1yr ≈ $1104.71`, `✓ Zero-rate annuity equals plain sum`, `✓ $10k + $500/mo @7% × 30y ≈ $640k`, then `[pfc-tools] all self-tests passed`.

- [ ] **Step 2.4: Commit**

```bash
git add js/tools/compound-interest.js tools/compound-interest/index.html
git commit -m "feat(tools): compound interest calculator — global page"
```

---

## Task 3: Compound Interest — 8 country variants

**Files:** Create 8 files: `tools/compound-interest/{uk,ie,fr,de,us,ca,au,sg}.html`

**Pattern:** Each country page is the same HTML as the global, with **5 targeted differences**:
1. `<title>` includes country name + currency code (keyword target: "compound interest calculator UK", etc.)
2. `<meta name="description">` mentions the country and local tax-advantaged accounts
3. `<link rel="canonical">` points to itself
4. `<body data-pfc-country="uk">` (etc.) — drives JS i18n
5. Hero `<span class="country-pill">` shows the flag + currency
6. The country switcher's `.active` class moves to the current country
7. The explainer paragraph includes a 1–2 sentence mention of local tax-advantaged accounts (ISA/401k/etc.) via the country's `taxAccount` from `PFC_TOOLS_I18N`
8. A country-specific FAQ entry replaces FAQ #5 ("Does this account for taxes?")

- [ ] **Step 3.1: Create `tools/compound-interest/uk.html`**

```html
<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Compound Interest Calculator UK — see how your ISA grows | ProFinanceCast</title>
<meta name="description" content="Free UK compound interest calculator with monthly contributions. See how your ISA, LISA, or SIPP grows over time. Runs in your browser, no signup, no affiliate links.">
<link rel="canonical" href="https://profinancecast.com/tools/compound-interest/uk">
<meta name="robots" content="index,follow">
<link rel="alternate" hreflang="en" href="https://profinancecast.com/tools/compound-interest">
<link rel="alternate" hreflang="x-default" href="https://profinancecast.com/tools/compound-interest">
<link rel="alternate" hreflang="en-GB" href="https://profinancecast.com/tools/compound-interest/uk">
<!-- (other hreflang links identical to global) -->

<meta property="og:type" content="website">
<meta property="og:title" content="Compound Interest Calculator UK — see how your ISA grows">
<meta property="og:description" content="Free UK compound interest calculator. ISA, LISA, SIPP. No signup.">
<meta property="og:url" content="https://profinancecast.com/tools/compound-interest/uk">
<meta property="og:image" content="https://profinancecast.com/api/og?title=Compound+Interest+UK&eyebrow=Tools&subtitle=See+how+your+ISA+grows.">
<!-- (twitter card identical pattern) -->

<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<!-- font preloads identical to global -->
<link rel="stylesheet" href="../../css/pfc-tokens.css">
<link rel="stylesheet" href="../../css/pfc-tool-page.css">
<link rel="stylesheet" href="../../css/pfc-footer.css">

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "SoftwareApplication", "name": "Compound Interest Calculator (UK)",
      "applicationCategory": "FinanceApplication", "operatingSystem": "Web",
      "url": "https://profinancecast.com/tools/compound-interest/uk",
      "description": "UK-localised compound interest calculator with GBP defaults and ISA / LISA / SIPP context.",
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "GBP" },
      "publisher": { "@type": "Organization", "name": "ProFinanceCast", "url": "https://profinancecast.com" } },
    { "@type": "BreadcrumbList", "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://profinancecast.com/" },
        { "@type": "ListItem", "position": 2, "name": "Tools", "item": "https://profinancecast.com/tools/" },
        { "@type": "ListItem", "position": 3, "name": "Compound Interest", "item": "https://profinancecast.com/tools/compound-interest" },
        { "@type": "ListItem", "position": 4, "name": "United Kingdom", "item": "https://profinancecast.com/tools/compound-interest/uk" } ] },
    { "@type": "FAQPage", "mainEntity": [
        { "@type": "Question", "name": "What is compound interest?",
          "acceptedAnswer": { "@type": "Answer", "text": "Compound interest is interest earned on both your original deposit AND on the interest already credited. It causes balances to grow faster over time — the longer you leave money invested, the more dramatic the effect." } },
        { "@type": "Question", "name": "How is compound interest calculated?",
          "acceptedAnswer": { "@type": "Answer", "text": "Future Value = Principal × (1 + r)^n + PMT × ((1 + r)^n − 1) / r, where r is the periodic interest rate and n is the total number of periods." } },
        { "@type": "Question", "name": "What return rate should I assume for a UK ISA?",
          "acceptedAnswer": { "@type": "Answer", "text": "For a globally-diversified equity index fund inside a Stocks & Shares ISA, 6–8% annualised is a common historical assumption. Cash ISAs run much lower (typically 4–5%). The calculator does not promise any specific return — model multiple scenarios." } },
        { "@type": "Question", "name": "Does this account for inflation?",
          "acceptedAnswer": { "@type": "Answer", "text": "No — figures are nominal. To see real (after-inflation) growth, subtract a UK CPI estimate (typically 2–3%) from your assumed return rate." } },
        { "@type": "Question", "name": "Do ISA and LISA contributions count toward an annual limit?",
          "acceptedAnswer": { "@type": "Answer", "text": "Yes. The ISA allowance is £20,000 per tax year (2026/27), of which up to £4,000 can go into a Lifetime ISA. This calculator does not enforce the limit — it's purely a growth projection." } } ] }
  ]
}
</script>
</head>
<body data-pfc-country="uk">

<!-- nav: identical markup to global; "Tools" link gets .active -->
<nav class="pfc-tool-nav" role="banner" aria-label="Primary navigation"> <!-- same as global --> </nav>

<header class="pfc-tool-hero">
  <span class="country-pill">🇬🇧 United Kingdom · GBP</span>
  <h1>UK compound interest, <em>visualised.</em></h1>
  <p>Enter what you have, what you're adding each month into your ISA, LISA, or SIPP, the return you expect, and how long you'll leave it. See exactly when compounding starts pulling ahead of your contributions.</p>
</header>

<section class="pfc-tool-grid">
  <!-- Same markup as global; only the input <span class="sym">£</span> and default values are pre-filled
       by compound-interest.js after reading window.PFC_TOOLS_COUNTRY. -->
  <div class="pfc-tool-card"> ... </div>
  <div class="pfc-tool-card"> ... </div>
</section>

<nav class="pfc-country-switcher" aria-label="Country versions">
  <span class="lbl">Localised:</span>
  <a href="/tools/compound-interest">🌐 Global</a>
  <a href="/tools/compound-interest/uk" class="active">🇬🇧 UK</a>
  <!-- other 7 countries -->
</nav>

<section class="pfc-explainer">
  <h2>How this works — <em>plain English.</em></h2>
  <p>Compound interest is interest earned on interest. Each period, your balance grows by the previous balance times the periodic rate, then your contribution is added. Over decades the compounded portion dwarfs the contributed portion — the "hockey stick" curve every personal-finance article keeps showing you.</p>
  <div class="formula">FV = P × (1 + r)<sup>n</sup> + PMT × ((1 + r)<sup>n</sup> − 1) / r</div>
  <p><strong>In a UK context:</strong> ISA and LISA growth is tax-free, so the nominal number this calculator shows is also close to your real take-home. Outside an ISA, capital gains tax (currently 10–20%) and dividend tax reduce the effective return — model the outcome with a rate ~1–2% lower if you're saving in a General Investment Account.</p>
  <p><strong>Important:</strong> figures are nominal — they don't subtract UK inflation. To see real growth, subtract a 2–3% CPI estimate from your return assumption.</p>
</section>

<section class="pfc-faq"> <!-- same 5 questions; #3 and #5 are UK-specific (see schema above) --> </section>

<section class="pfc-tool-cta"> <!-- identical to global --> </section>
<footer class="site-footer" role="contentinfo"> <!-- identical to global --> </footer>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js" defer></script>
<script src="../../js/pfc-tools-i18n.js" defer></script>
<script src="../../js/pfc-tools-lib.js" defer></script>
<script src="../../js/tools/compound-interest.js" defer></script>
</body>
</html>
```

Where the placeholders (`...`, "same as global") sit, the executor copies the matching block from `index.html` verbatim and patches only the active-class and the country-specific FAQ #3/#5 + explainer paragraph.

- [ ] **Step 3.2–3.8: Repeat for ie, fr, de, us, ca, au, sg** — same scaffold, swap:
  - `<html lang>` (en-IE, fr-FR, de-DE, en-US, en-CA, en-AU, en-SG)
  - title/description/H1/intro to use the country name + tax-advantaged accounts from the table at the top of this plan
  - `data-pfc-country`
  - canonical
  - FAQ #3 + #5 country-specific (e.g. France: PEA + Livret A · Germany: Riester + Bausparvertrag · US: 401(k) + Roth IRA + HSA · Canada: TFSA + RRSP + FHSA · Australia: Super · Singapore: CPF + SRS · Ireland: PRSA limits and EIIS)
  - Schema.org JSON-LD: name suffixed with country, priceCurrency = local, breadcrumb 4th entry, FAQ adjusted

- [ ] **Step 3.9: Commit per country, or one combined commit**

```bash
git add tools/compound-interest/{uk,ie,fr,de,us,ca,au,sg}.html
git commit -m "feat(tools): compound interest — 8 country variants (UK/IE/FR/DE/US/CA/AU/SG)"
```

---

## Tasks 4–11: Repeat the Task 2 + Task 3 pattern for the remaining 4 tools

Each tool follows **the same shape** as compound interest:

### Task 4–5: Mortgage Affordability

- **Calc file:** `js/tools/mortgage-affordability.js`. Inputs: monthly income, monthly debt payments, down payment, mortgage rate, term in years, property price (target). Outputs: max affordable price (28/36 rule), monthly payment for the entered price, debt-to-income ratio, "afford this price?" verdict.
- **Formulas:** `monthlyMortgagePayment` and `affordableLoan` from `pfc-tools-lib.js`. Use the 28/36 rule: max housing cost = 28% of gross monthly income; max total debt servicing = 36%.
- **Country defaults:** `mortgageRate` and `propertyDefault` from `PFC_TOOLS_I18N`.
- **Country-specific FAQ entry:** stamp duty / LTV norms / first-time-buyer schemes (UK: Help to Buy ISA replaced by LISA; US: FHA loan minimums; FR: notaire fees ~7-8%; DE: Nebenkosten ~10-12%; etc.).
- **9 files** with the same delta-pattern as compound-interest.

### Task 6–7: FIRE Date Calculator

- **Calc file:** `js/tools/fire-date.js`. Inputs: current net worth, monthly savings, annual return %, annual expenses, optional safe withdrawal rate (default 4%). Output: years until FI, exact target date, multiple of expenses at that date.
- **Formula:** `yearsToFI` from `pfc-tools-lib.js`.
- **Country differences:** tax-advantaged-account name in the explainer; "Coast FIRE" optional sub-calc only meaningful with localised retirement-age norms (UK 68, US 67, FR 64, DE 67, etc.).

### Task 8–9: Debt Snowball vs Avalanche Comparator

- **Calc file:** `js/tools/debt-strategy-compare.js`. Inputs: up to 8 debts (balance + APR + minimum payment) + monthly extra budget. Output: months to debt-free + total interest under both strategies, side-by-side; chart shows running total balance month-by-month for each strategy.
- **Formula:** `payoffSimulate` with strategy="avalanche" vs "snowball" from `pfc-tools-lib.js`.
- **Country differences:** typical APR ranges in copy (UK store cards 29.9%; US credit cards 22%; FR revolving credit 18%; etc.); reference to the existing `blog-debt-avalanche-method.html`.

### Task 10–11: Savings Rate Analyser

- **Calc file:** `js/tools/savings-rate.js`. Inputs: gross income, take-home, monthly savings, monthly expenses, expected return. Output: savings rate %, years to FI at this rate (1/r table — 50% savings = ~17 yrs, 25% = ~32 yrs, etc.), chart of cumulative net worth.
- **Formula:** savings rate = monthly_savings / take_home. Years to FI from Mr. Money Mustache shockingly-simple table; recompute precisely with `yearsToFI`.
- **Country differences:** typical tax burden quoted in copy; "good savings rate" benchmarks differ by country.

**Each tool = 1 JS file + 9 HTML files + 1 commit per country block. Estimated 4–6 hours per tool with a competent executor + verification subagent.**

---

## Task 12: Update `tools/index.html` — link all 5 new tools

**Files:**
- Modify: `tools/index.html` (currently lists 2 tools — take-home-pay and debt-strategy)

- [ ] **Step 12.1: Add 5 new tool cards to the grid**

Insert new cards mirroring the existing pattern. Each card has: tool name (Fraunces H3), one-line description, list of 4–5 country flags as small chips, and "Open tool →" link to the global URL.

- [ ] **Step 12.2: Update the page `<title>` and meta description to reflect 7 tools (not 2)**

- [ ] **Step 12.3: Update `<script type="application/ld+json">` ItemList schema to enumerate all 7 tools**

- [ ] **Step 12.4: Commit**

```bash
git add tools/index.html
git commit -m "feat(tools): link 5 new SEO-funnel tools from tools/index.html"
```

---

## Task 13: Update `sitemap.xml` — register 45 new URLs

**Files:**
- Modify: `sitemap.xml`

- [ ] **Step 13.1: Insert 45 `<url>` blocks before the closing `</urlset>`**

Pattern per URL (priorities: global tools at 0.8, country variants at 0.7):

```xml
<url>
  <loc>https://profinancecast.com/tools/compound-interest</loc>
  <lastmod>2026-05-19</lastmod>
  <changefreq>monthly</changefreq>
  <priority>0.8</priority>
</url>
<url>
  <loc>https://profinancecast.com/tools/compound-interest/uk</loc>
  <lastmod>2026-05-19</lastmod>
  <changefreq>monthly</changefreq>
  <priority>0.7</priority>
</url>
<!-- ... 43 more ... -->
```

- [ ] **Step 13.2: Verify sitemap is still valid XML**

Run:
```bash
node -e "const fs=require('fs');const x=require('xml2js');new x.Parser().parseString(fs.readFileSync('sitemap.xml','utf8'),(e,r)=>{if(e)throw e;console.log('urls:',r.urlset.url.length);})"
```
Expected: a count of 45 more than before. If `xml2js` isn't installed (`npm i -D xml2js`), use a regex-based check:
```bash
node -e "const s=require('fs').readFileSync('sitemap.xml','utf8');console.log('url count:',(s.match(/<url>/g)||[]).length)"
```

- [ ] **Step 13.3: Commit**

```bash
git add sitemap.xml
git commit -m "feat(seo): sitemap registers 45 new tool URLs (5 tools × 9 locales)"
```

---

## Task 14: Verification

**Files:** None modified — pure verification.

- [ ] **Step 14.1: Syntax-check every new JS file**

```bash
for f in js/pfc-tools-lib.js js/pfc-tools-i18n.js js/tools/*.js; do
  node --check "$f" && echo "OK $f"
done
```
Expected: 7 lines of `OK …`. Any parse error halts execution.

- [ ] **Step 14.2: HTML smoke-check (every new file references all 3 required CSS files + Chart.js)**

```bash
node -e "
const fs=require('fs');const glob=require('glob');
const files=glob.sync('tools/{compound-interest,mortgage-affordability,fire-date,debt-strategy-compare,savings-rate}/*.html');
let bad=0;
for(const f of files){const s=fs.readFileSync(f,'utf8');
  for(const need of ['pfc-tokens.css','pfc-tool-page.css','pfc-footer.css','chart.umd.min.js','pfc-tools-i18n.js','pfc-tools-lib.js']){
    if(!s.includes(need)){console.log('MISSING',need,'in',f);bad++;}
  }
}
console.log(bad===0?'PASS '+files.length+' files':'FAIL '+bad+' issues');
"
```
Expected: `PASS 45 files`.

- [ ] **Step 14.3: Self-test in browser for every tool**

For each tool, open `?selftest=1` and verify console shows `[pfc-tools] all self-tests passed`. There are 5 tools — 5 console checks.

- [ ] **Step 14.4: Lighthouse run on 1 global page + 1 country page (sample)**

Open `/tools/compound-interest` and `/tools/compound-interest/uk` in Chrome → DevTools → Lighthouse → Mobile + Performance + SEO + Accessibility.
Expected (target floor): Performance ≥ 85, SEO = 100, Accessibility ≥ 90. Anything below requires fix-then-rerun before considering the task done.

- [ ] **Step 14.5: Schema validation**

Paste each global tool's HTML into https://validator.schema.org or use:
```bash
curl -s https://validator.schema.org/validate --data-urlencode "url=https://profinancecast.com/tools/compound-interest" | head -40
```
Expected: 0 errors, 0 warnings on `SoftwareApplication`, `BreadcrumbList`, `FAQPage`.

- [ ] **Step 14.6: Final commit (if any fixes were needed)**

```bash
git add -A
git commit -m "fix(tools): verification fixes — Lighthouse + schema warnings cleared"
```

---

## Task 15: Merge to main + push

**Files:** None — branch operations only.

- [ ] **Step 15.1: Confirm clean working tree**

```bash
git status
```
Expected: `nothing to commit, working tree clean`.

- [ ] **Step 15.2: Merge `feat/phase-2-seo-funnel-tools` to main**

```bash
git checkout main
git merge --no-ff feat/phase-2-seo-funnel-tools -m "Merge branch 'feat/phase-2-seo-funnel-tools'"
git push origin main
```
Expected: `main -> main` push success. Vercel auto-deploy kicks off.

- [ ] **Step 15.3: Post-deploy smoke check**

After 2–3 minutes, curl each of the 5 global URLs to confirm 200 status:
```bash
for t in compound-interest mortgage-affordability fire-date debt-strategy-compare savings-rate; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "https://profinancecast.com/tools/$t")
  echo "$t → $code"
done
```
Expected: 5 lines, all `200`. Same for 1–2 country variants of each:
```bash
for t in compound-interest mortgage-affordability; do
  for c in uk de us; do
    code=$(curl -s -o /dev/null -w "%{http_code}" "https://profinancecast.com/tools/$t/$c")
    echo "$t/$c → $code"
  done
done
```

---

## Self-Review (per writing-plans skill)

**1. Spec coverage:**
- ✅ 5 tools shipped (Task 2–11)
- ✅ 9 URLs each (Task 2: global, Task 3: 8 countries, replicated by Tasks 4–11)
- ✅ tools/index.html updated (Task 12)
- ✅ sitemap.xml registered (Task 13)
- ✅ Schema.org markup on every page (Tasks 2.2, 3.x, replicated 4–11)
- ✅ Verification covers JS syntax, HTML wiring, browser self-tests, Lighthouse, schema validator (Task 14)
- ✅ Deploy via main merge (Task 15)

**2. Placeholder scan:** Task 3 explicitly says "copy the matching block from `index.html` verbatim and patch only the active-class …" — the executor needs the global file in front of them when doing country variants. Tasks 4–11 reference the Task 2 + Task 3 pattern explicitly. Country pages 3.2–3.8 are described by delta-list, not full repeat. **Trade-off accepted** — otherwise the plan would be 4× this length. If executor confusion occurs, expand the delta-list per country to full HTML on demand.

**3. Type consistency:**
- `window.PFCTools` exported from `pfc-tools-lib.js` is read in every tool's JS module — ✓ consistent
- `window.PFC_TOOLS_I18N` and `window.PFC_TOOLS_COUNTRY` set in `pfc-tools-i18n.js`, read in `pfc-tools-lib.js` and every tool — ✓
- DOM IDs follow tool-prefix pattern (`ci-` for compound interest, `ma-` for mortgage affordability, `fd-` for fire-date, `ds-` for debt-strategy, `sr-` for savings-rate) — executor must keep this consistent when filling Tasks 4–11
- `data-pfc-country` attribute on `<body>` is read by `pfc-tools-i18n.js`'s IIFE — ✓

---

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-05-19-phase-2-seo-funnel-tools.md`. Two execution options:

**1. Subagent-Driven (recommended for Tasks 2–11)** — dispatch a fresh subagent per tool (each tool = ~10 hours of work). Two-stage review per task: spec compliance, then code quality. Optimal when ruflo-swarm is activated (parallel tool builds).

**2. Inline Execution (recommended for Tasks 1, 12, 13, 14, 15)** — single-session execution with checkpoints. Tasks 1, 12, 13, 14, 15 are short shared-state edits and don't benefit from parallelisation.

**Hybrid recommendation:** Inline Task 1 → dispatch subagents in parallel for Tasks 2/4/6/8/10 (global pages of all 5 tools simultaneously) → dispatch subagents for Tasks 3/5/7/9/11 (country variants for each tool, can run in parallel with each other) → inline Tasks 12, 13, 14, 15 sequentially.

**Estimated total time:** 5–8 days inline; 2–3 days under ruflo-swarm coordination.
