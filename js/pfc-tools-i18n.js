// js/pfc-tools-i18n.js — locale + currency + market parameters for public tool pages.
// Read by every tools/<tool>/*.html page via the data-pfc-country attribute on <body>.
// Single source of truth: edit here, every tool picks up the change on next page load.
//
// Schema per country:
//   code               — ISO-ish short code matching the URL suffix
//   currency / locale  — passed to Intl.NumberFormat
//   symbol             — display-only fallback when Intl is unavailable
//   taxAccount         — short noun-phrase used inline in copy ("ISA, LISA, or SIPP")
//   mortgageRate       — Q1 2026 informational default, not a quote
//   propertyDefault    — typical first-home price in local currency
//   defaultPrincipal   — starting amount pre-filled in compound-interest tool
//   retirementAge      — state pension age (used by fire-date for "Coast FIRE")
//   typicalCardAPR     — typical credit/store card APR (used by debt-strategy)
//   countryLabel       — full name for hero pill + breadcrumb
//   flag               — emoji glyph
//   intro              — country-specific intro sentence (SEO depth, must-fix #4)
//   workedExample      — country-specific example with local numbers (SEO depth, must-fix #4)
//   factoid            — country-specific stat or rule (SEO depth, must-fix #4)
//   faqLocalTax        — replaces FAQ #5 ("Does this account for taxes?") with country-specific answer

window.PFC_TOOLS_I18N = {
  global: {
    code: 'global', currency: 'USD', locale: 'en-US', symbol: '$',
    taxAccount: 'a tax-advantaged retirement account',
    mortgageRate: 6.8, propertyDefault: 420000,
    defaultPrincipal: 10000, retirementAge: 67, typicalCardAPR: 22,
    countryLabel: 'Global', flag: '\u{1F310}',
    intro: 'A globally-applicable calculator using USD defaults. For local currency, tax accounts, and country-specific defaults, choose your country below.',
    workedExample: 'A $10,000 starting balance plus $500/month at 7% for 30 years grows to roughly $640,000 — about $460,000 of which is compound growth, not contributions.',
    factoid: 'The "rule of 72" gives a quick estimate: divide 72 by your annual return rate to see roughly how many years it takes for your money to double.',
    faqLocalTax: { q: 'Does this account for taxes?', a: 'No. If you are saving inside a tax-advantaged account (such as a 401(k), Roth IRA, ISA, RRSP, Super, or similar) returns are typically tax-free or tax-deferred. Outside one, capital gains and dividend taxes will reduce the effective return.' },
  },
  uk: {
    code: 'uk', currency: 'GBP', locale: 'en-GB', symbol: '£',
    taxAccount: 'ISA, LISA, or SIPP',
    mortgageRate: 4.8, propertyDefault: 290000,
    defaultPrincipal: 10000, retirementAge: 68, typicalCardAPR: 23.9,
    countryLabel: 'United Kingdom', flag: '\u{1F1EC}\u{1F1E7}',
    intro: 'A UK-localised calculator pre-filled in GBP. Use it to project growth inside a Stocks & Shares ISA, LISA, or SIPP — all of which compound tax-free up to the annual allowances.',
    workedExample: 'A £10,000 ISA balance plus £500/month at 7% for 25 years compounds to roughly £415,000 — entirely tax-free because growth inside an ISA escapes capital gains and dividend tax.',
    factoid: 'The 2026/27 ISA allowance is £20,000 per tax year, of which up to £4,000 can go into a Lifetime ISA (which adds a 25% government bonus on contributions until age 50).',
    faqLocalTax: { q: 'How does ISA / LISA / SIPP tax treatment affect this calculation?', a: 'Inside an ISA or LISA, growth and withdrawals are tax-free, so the nominal number this calculator shows is also your real take-home. SIPP contributions get income tax relief on the way in, but withdrawals (after the 25% tax-free lump sum) are taxed as income. Outside any wrapper, capital gains tax (10–20%) and dividend tax apply — model with a return rate about 1–2% lower.' },
  },
  ie: {
    code: 'ie', currency: 'EUR', locale: 'en-IE', symbol: '€',
    taxAccount: 'PRSA or EIIS',
    mortgageRate: 4.4, propertyDefault: 350000,
    defaultPrincipal: 10000, retirementAge: 66, typicalCardAPR: 22.9,
    countryLabel: 'Ireland', flag: '\u{1F1EE}\u{1F1EA}',
    intro: 'An Ireland-localised calculator pre-filled in EUR. Use it to model growth inside a PRSA, Employer Pension, or EIIS-eligible investment over typical Irish working-life horizons.',
    workedExample: 'A €10,000 PRSA balance plus €500/month at 7% for 25 years grows to about €415,000 — but Irish exit tax on non-pension fund growth (currently 41%) can take a sizeable bite if held outside a pension.',
    factoid: 'Ireland\'s deemed disposal rule means many ETFs held outside a pension are taxed every 8 years on unrealised gains — a friction that makes pension wrappers (PRSA, occupational) more attractive than they would be elsewhere.',
    faqLocalTax: { q: 'How does Irish tax affect this calculation?', a: 'Inside a PRSA or occupational pension, growth is tax-deferred and contributions get income-tax relief up to age-banded limits. Outside a pension, Irish ETFs face 41% exit tax with deemed disposal every 8 years — model with a noticeably lower effective return rate if you are saving in a brokerage account.' },
  },
  fr: {
    code: 'fr', currency: 'EUR', locale: 'fr-FR', symbol: '€',
    taxAccount: 'PEA, Livret A, ou Assurance-vie',
    mortgageRate: 3.9, propertyDefault: 290000,
    defaultPrincipal: 10000, retirementAge: 64, typicalCardAPR: 18,
    countryLabel: 'France', flag: '\u{1F1EB}\u{1F1F7}',
    intro: 'Un calculateur localisé pour la France, pré-rempli en EUR. Utilisez-le pour projeter la croissance dans un PEA, un Livret A, ou une assurance-vie sur un horizon de carrière typique.',
    workedExample: '10 000 € sur un PEA plus 500 €/mois à 7 % sur 25 ans donnent environ 415 000 € — exonérés d\'impôt sur le revenu après 5 ans de détention (seuls les prélèvements sociaux de 17,2 % restent dus).',
    factoid: 'Le plafond du Livret A est de 22 950 € à un taux administré (3 % en 2026, révisé deux fois par an) — utile pour l\'épargne de précaution, mais largement battu par un PEA actions sur un horizon long.',
    faqLocalTax: { q: 'Comment la fiscalité française affecte-t-elle ce calcul ?', a: 'Dans un PEA détenu plus de 5 ans, les gains échappent à l\'impôt sur le revenu (seuls les prélèvements sociaux de 17,2 % s\'appliquent). Hors enveloppe fisc, la flat tax à 30 % (PFU) s\'applique aux plus-values — modélisez avec un taux de rendement effectif environ 30 % plus bas si vous épargnez sur un compte-titres ordinaire.' },
  },
  de: {
    code: 'de', currency: 'EUR', locale: 'de-DE', symbol: '€',
    taxAccount: 'Riester, Rürup, oder Bausparvertrag',
    mortgageRate: 3.8, propertyDefault: 420000,
    defaultPrincipal: 10000, retirementAge: 67, typicalCardAPR: 16,
    countryLabel: 'Germany', flag: '\u{1F1E9}\u{1F1EA}',
    intro: 'Ein für Deutschland lokalisierter Rechner, vorausgefüllt in EUR. Geeignet für Riester- und Rürup-Verträge, Bauspar-Pläne sowie freie ETF-Sparpläne im Wertpapierdepot.',
    workedExample: '10.000 € Startkapital plus 500 €/Monat zu 7 % über 25 Jahre wächst auf ca. 415.000 € — davon werden in einem ETF-Sparplan etwa 26,375 % Abgeltungsteuer (inkl. Soli) auf realisierte Gewinne fällig.',
    factoid: 'Der Sparer-Pauschbetrag beträgt seit 2023 1.000 € pro Person und Jahr — Kapitalerträge bis zu dieser Höhe sind steuerfrei, sofern beim Broker ein Freistellungsauftrag hinterlegt ist.',
    faqLocalTax: { q: 'Wie wirkt sich die deutsche Steuer auf diese Berechnung aus?', a: 'Im Riester- oder Rürup-Vertrag werden Beiträge während der Ansparphase staatlich gefördert; Auszahlungen in der Rente sind steuerpflichtig. Im freien Depot greift die Abgeltungsteuer von 25 % (plus Soli und ggf. Kirchensteuer) auf realisierte Gewinne — modellieren Sie mit einem etwa 1 –1,5 Prozentpunkte niedrigeren Effektivzinssatz.' },
  },
  us: {
    code: 'us', currency: 'USD', locale: 'en-US', symbol: '$',
    taxAccount: '401(k), Roth IRA, or HSA',
    mortgageRate: 6.8, propertyDefault: 420000,
    defaultPrincipal: 10000, retirementAge: 67, typicalCardAPR: 22.8,
    countryLabel: 'United States', flag: '\u{1F1FA}\u{1F1F8}',
    intro: 'A US-localised calculator pre-filled in USD. Use it to project growth inside a 401(k), Roth IRA, HSA, or taxable brokerage over typical American working-life horizons.',
    workedExample: 'A $10,000 Roth IRA balance plus $500/month at 7% for 30 years compounds to roughly $640,000 — all of which is tax-free at withdrawal after age 59½, because Roth contributions were made post-tax.',
    factoid: 'The 2026 401(k) contribution limit is $24,500 ($32,000 if age 50+); the Roth IRA limit is $7,500 ($8,500 if 50+) and phases out at higher incomes. This calculator does not enforce limits — it is a growth projection.',
    faqLocalTax: { q: 'How does US tax treatment affect this calculation?', a: 'Inside a Roth IRA or Roth 401(k), all growth and qualified withdrawals are tax-free. Inside a traditional 401(k) or IRA, contributions are pre-tax but withdrawals are taxed as ordinary income. Inside an HSA, growth is triple tax-advantaged for qualified medical expenses. In a taxable brokerage, long-term capital gains (15–20%) and qualified dividend rates apply — model with a return rate roughly 1–2% lower.' },
  },
  ca: {
    code: 'ca', currency: 'CAD', locale: 'en-CA', symbol: 'CA$',
    taxAccount: 'RRSP, TFSA, or FHSA',
    mortgageRate: 5.8, propertyDefault: 680000,
    defaultPrincipal: 13000, retirementAge: 65, typicalCardAPR: 20.99,
    countryLabel: 'Canada', flag: '\u{1F1E8}\u{1F1E6}',
    intro: 'A Canada-localised calculator pre-filled in CAD. Use it to project growth inside a TFSA, RRSP, or FHSA — each with different contribution rules and tax treatment at withdrawal.',
    workedExample: 'A CA$13,000 TFSA balance plus CA$500/month at 7% for 25 years grows to roughly CA$425,000 — entirely tax-free at withdrawal because TFSA growth is sheltered indefinitely.',
    factoid: 'The 2026 TFSA contribution room limit is CA$7,000; the cumulative lifetime room since 2009 is CA$102,000 for someone who was 18 or older the entire time. Unused room carries forward.',
    faqLocalTax: { q: 'How does Canadian tax affect this calculation?', a: 'TFSA growth and withdrawals are tax-free. RRSP contributions are tax-deductible but withdrawals are fully taxable as income. FHSA combines both: deduction on the way in, tax-free withdrawal for a qualifying first home. In a non-registered account, only 50% of capital gains are taxable — model with a roughly 1% lower effective rate.' },
  },
  au: {
    code: 'au', currency: 'AUD', locale: 'en-AU', symbol: 'A$',
    taxAccount: 'Superannuation',
    mortgageRate: 6.2, propertyDefault: 890000,
    defaultPrincipal: 15000, retirementAge: 67, typicalCardAPR: 19.99,
    countryLabel: 'Australia', flag: '\u{1F1E6}\u{1F1FA}',
    intro: 'An Australia-localised calculator pre-filled in AUD. Use it to project growth inside Superannuation (concessional or non-concessional contributions) or outside super in a personal investment account.',
    workedExample: 'A A$15,000 Super balance plus A$500/month at 7% for 25 years grows to roughly A$425,000 — with the 15% concessional tax rate on contributions and earnings, this is well ahead of an equivalent non-super account at marginal income tax rates.',
    factoid: 'The Super Guarantee is 12% of ordinary time earnings from July 2025 — your employer pays this on top of your salary, before tax. Concessional contribution cap is A$30,000 per year (2026 indexation).',
    faqLocalTax: { q: 'How does Australian tax affect this calculation?', a: 'Inside Superannuation, contributions and earnings are taxed at 15% (concessional) or 0% (non-concessional, up to the cap). After age 60, withdrawals are entirely tax-free. Outside super, full marginal rates apply to income and 50% of long-term capital gains are taxable — model with a meaningfully lower effective return if saving outside super.' },
  },
  sg: {
    code: 'sg', currency: 'SGD', locale: 'en-SG', symbol: 'S$',
    taxAccount: 'CPF or SRS',
    mortgageRate: 3.2, propertyDefault: 1650000,
    defaultPrincipal: 13000, retirementAge: 65, typicalCardAPR: 26.9,
    countryLabel: 'Singapore', flag: '\u{1F1F8}\u{1F1EC}',
    intro: 'A Singapore-localised calculator pre-filled in SGD. Use it to project growth inside CPF Ordinary or Special Account, SRS, or a personal investment account.',
    workedExample: 'A S$13,000 SRS balance plus S$500/month at 7% for 25 years grows to roughly S$425,000 — with full income-tax relief on contributions up to S$15,300 per year, the effective return is higher than the nominal rate suggests.',
    factoid: 'CPF Special Account earns a guaranteed 4% floor (plus a 1% bonus on the first S$60,000 across accounts for members 55+), making it one of the safest long-term compounders globally — but funds are locked until age 55.',
    faqLocalTax: { q: 'How does Singapore tax affect this calculation?', a: 'Singapore has no capital gains tax and no dividend tax for individuals, so growth in a personal investment account compounds tax-free. SRS contributions are tax-deductible up to S$15,300/year, with withdrawals at age 62 taxed at 50% of the rate that would otherwise apply. CPF interest and withdrawals are tax-free.' },
  },
};

// Read the active country from the body tag (set by each HTML page) with global fallback.
window.PFC_TOOLS_COUNTRY = (function () {
  var code = (document.body && document.body.dataset && document.body.dataset.pfcCountry) || 'global';
  return window.PFC_TOOLS_I18N[code] || window.PFC_TOOLS_I18N.global;
})();
