/* ============================================================
   js/tax-library/manifest.js — Lightweight country manifest.

   DEF4-1 (Senior Architect 2026-05-25) — replaces eager loading of
   3 region files (~75KB) with a single manifest (~3KB) that lists
   every country's metadata. The actual tax brackets/rates live in
   the region files which are now lazy-loaded by `ensureCountry(code)`
   in pfc-tax-library.js on first calculation request.

   Generated from europe.js + americas.js + asia-pacific-mea.js — keep
   in sync when adding/removing/renaming countries. The 5 fields per
   entry:
     - region: which file contains the actual tax data ('europe' |
       'americas' | 'asia-pacific-mea')
     - name: display name for the country dropdown
     - currency: ISO-4217-like code (USD/GBP/EUR/...)
     - symbol: currency symbol used by the THP UI for formatting
     - hasRegions: whether the country needs a sub-region picker
       (US states, UK ENG/WLS/NIR/SCT, CA provinces, CH cantons,
       DE/IT regional surcharges, ES/BE autonomous communities)
   ============================================================ */
(function () {
  if (typeof window === 'undefined') return;
  const ROOT = window.PFCTaxLibrary = window.PFCTaxLibrary || { countries: {} };
  ROOT.manifest = {
    DZ: { region: 'asia-pacific-mea', name: 'Algeria', currency: 'DZD', symbol: 'DA', hasRegions: false },
    AR: { region: 'americas', name: 'Argentina', currency: 'ARS', symbol: 'AR$', hasRegions: false },
    AU: { region: 'asia-pacific-mea', name: 'Australia', currency: 'AUD', symbol: 'A$', hasRegions: false },
    AT: { region: 'europe', name: 'Austria', currency: 'EUR', symbol: '€', hasRegions: false },
    BS: { region: 'americas', name: 'Bahamas', currency: 'BSD', symbol: 'B$', hasRegions: false },
    BH: { region: 'asia-pacific-mea', name: 'Bahrain', currency: 'BHD', symbol: 'BD', hasRegions: false },
    BD: { region: 'asia-pacific-mea', name: 'Bangladesh', currency: 'BDT', symbol: '৳', hasRegions: false },
    BE: { region: 'europe', name: 'Belgium', currency: 'EUR', symbol: '€', hasRegions: true },
    BO: { region: 'americas', name: 'Bolivia', currency: 'BOB', symbol: 'Bs', hasRegions: false },
    BR: { region: 'americas', name: 'Brazil', currency: 'BRL', symbol: 'R$', hasRegions: false },
    BG: { region: 'europe', name: 'Bulgaria', currency: 'BGN', symbol: 'лв', hasRegions: false },
    CA: { region: 'americas', name: 'Canada', currency: 'CAD', symbol: 'CA$', hasRegions: true },
    CL: { region: 'americas', name: 'Chile', currency: 'CLP', symbol: 'CL$', hasRegions: false },
    CN: { region: 'asia-pacific-mea', name: 'China (Mainland)', currency: 'CNY', symbol: '¥', hasRegions: false },
    CO: { region: 'americas', name: 'Colombia', currency: 'COP', symbol: 'CO$', hasRegions: false },
    CR: { region: 'americas', name: 'Costa Rica', currency: 'CRC', symbol: 'CRC', hasRegions: false },
    HR: { region: 'europe', name: 'Croatia', currency: 'EUR', symbol: '€', hasRegions: false },
    CY: { region: 'europe', name: 'Cyprus', currency: 'EUR', symbol: '€', hasRegions: false },
    CZ: { region: 'europe', name: 'Czech Republic', currency: 'CZK', symbol: 'Kč', hasRegions: false },
    DK: { region: 'europe', name: 'Denmark', currency: 'DKK', symbol: 'kr', hasRegions: false },
    DO: { region: 'americas', name: 'Dominican Republic', currency: 'DOP', symbol: 'RD$', hasRegions: false },
    EC: { region: 'americas', name: 'Ecuador', currency: 'USD', symbol: '$', hasRegions: false },
    EG: { region: 'asia-pacific-mea', name: 'Egypt', currency: 'EGP', symbol: 'E£', hasRegions: false },
    EE: { region: 'europe', name: 'Estonia', currency: 'EUR', symbol: '€', hasRegions: false },
    ET: { region: 'asia-pacific-mea', name: 'Ethiopia', currency: 'ETB', symbol: 'Br', hasRegions: false },
    FI: { region: 'europe', name: 'Finland', currency: 'EUR', symbol: '€', hasRegions: false },
    FR: { region: 'europe', name: 'France', currency: 'EUR', symbol: '€', hasRegions: false },
    DE: { region: 'europe', name: 'Germany', currency: 'EUR', symbol: '€', hasRegions: false },
    GH: { region: 'asia-pacific-mea', name: 'Ghana', currency: 'GHS', symbol: 'GH₵', hasRegions: false },
    GR: { region: 'europe', name: 'Greece', currency: 'EUR', symbol: '€', hasRegions: false },
    GT: { region: 'americas', name: 'Guatemala', currency: 'GTQ', symbol: 'Q', hasRegions: false },
    HK: { region: 'asia-pacific-mea', name: 'Hong Kong', currency: 'HKD', symbol: 'HK$', hasRegions: false },
    HU: { region: 'europe', name: 'Hungary', currency: 'HUF', symbol: 'Ft', hasRegions: false },
    IS: { region: 'europe', name: 'Iceland', currency: 'ISK', symbol: 'kr', hasRegions: false },
    IN: { region: 'asia-pacific-mea', name: 'India (New Regime)', currency: 'INR', symbol: '₹', hasRegions: false },
    ID: { region: 'asia-pacific-mea', name: 'Indonesia', currency: 'IDR', symbol: 'Rp', hasRegions: false },
    IE: { region: 'europe', name: 'Ireland', currency: 'EUR', symbol: '€', hasRegions: false },
    IL: { region: 'asia-pacific-mea', name: 'Israel', currency: 'ILS', symbol: '₪', hasRegions: false },
    IT: { region: 'europe', name: 'Italy', currency: 'EUR', symbol: '€', hasRegions: true },
    JM: { region: 'americas', name: 'Jamaica', currency: 'JMD', symbol: 'J$', hasRegions: false },
    JP: { region: 'asia-pacific-mea', name: 'Japan', currency: 'JPY', symbol: '¥', hasRegions: false },
    JO: { region: 'asia-pacific-mea', name: 'Jordan', currency: 'JOD', symbol: 'JD', hasRegions: false },
    KE: { region: 'asia-pacific-mea', name: 'Kenya', currency: 'KES', symbol: 'KSh', hasRegions: false },
    KW: { region: 'asia-pacific-mea', name: 'Kuwait', currency: 'KWD', symbol: 'KD', hasRegions: false },
    LV: { region: 'europe', name: 'Latvia', currency: 'EUR', symbol: '€', hasRegions: false },
    LB: { region: 'asia-pacific-mea', name: 'Lebanon', currency: 'LBP', symbol: 'L£', hasRegions: false },
    LT: { region: 'europe', name: 'Lithuania', currency: 'EUR', symbol: '€', hasRegions: false },
    LU: { region: 'europe', name: 'Luxembourg', currency: 'EUR', symbol: '€', hasRegions: false },
    MY: { region: 'asia-pacific-mea', name: 'Malaysia', currency: 'MYR', symbol: 'RM', hasRegions: false },
    MT: { region: 'europe', name: 'Malta', currency: 'EUR', symbol: '€', hasRegions: false },
    MU: { region: 'asia-pacific-mea', name: 'Mauritius', currency: 'MUR', symbol: 'Rs', hasRegions: false },
    MX: { region: 'americas', name: 'Mexico', currency: 'MXN', symbol: 'MX$', hasRegions: false },
    MA: { region: 'asia-pacific-mea', name: 'Morocco', currency: 'MAD', symbol: 'DH', hasRegions: false },
    NP: { region: 'asia-pacific-mea', name: 'Nepal', currency: 'NPR', symbol: 'Rs', hasRegions: false },
    NL: { region: 'europe', name: 'Netherlands', currency: 'EUR', symbol: '€', hasRegions: false },
    NZ: { region: 'asia-pacific-mea', name: 'New Zealand', currency: 'NZD', symbol: 'NZ$', hasRegions: false },
    NG: { region: 'asia-pacific-mea', name: 'Nigeria', currency: 'NGN', symbol: '₦', hasRegions: false },
    NO: { region: 'europe', name: 'Norway', currency: 'NOK', symbol: 'kr', hasRegions: false },
    OM: { region: 'asia-pacific-mea', name: 'Oman', currency: 'OMR', symbol: 'OMR', hasRegions: false },
    PK: { region: 'asia-pacific-mea', name: 'Pakistan', currency: 'PKR', symbol: 'Rs', hasRegions: false },
    PA: { region: 'americas', name: 'Panama', currency: 'PAB', symbol: 'B/.', hasRegions: false },
    PY: { region: 'americas', name: 'Paraguay', currency: 'PYG', symbol: 'Gs', hasRegions: false },
    PE: { region: 'americas', name: 'Peru', currency: 'PEN', symbol: 'S/', hasRegions: false },
    PH: { region: 'asia-pacific-mea', name: 'Philippines', currency: 'PHP', symbol: '₱', hasRegions: false },
    PL: { region: 'europe', name: 'Poland', currency: 'PLN', symbol: 'zł', hasRegions: false },
    PT: { region: 'europe', name: 'Portugal', currency: 'EUR', symbol: '€', hasRegions: false },
    QA: { region: 'asia-pacific-mea', name: 'Qatar', currency: 'QAR', symbol: 'QAR', hasRegions: false },
    RO: { region: 'europe', name: 'Romania', currency: 'RON', symbol: 'lei', hasRegions: false },
    SA: { region: 'asia-pacific-mea', name: 'Saudi Arabia', currency: 'SAR', symbol: 'SAR', hasRegions: false },
    SG: { region: 'asia-pacific-mea', name: 'Singapore', currency: 'SGD', symbol: 'S$', hasRegions: false },
    SK: { region: 'europe', name: 'Slovakia', currency: 'EUR', symbol: '€', hasRegions: false },
    SI: { region: 'europe', name: 'Slovenia', currency: 'EUR', symbol: '€', hasRegions: false },
    ZA: { region: 'asia-pacific-mea', name: 'South Africa', currency: 'ZAR', symbol: 'R', hasRegions: false },
    KR: { region: 'asia-pacific-mea', name: 'South Korea', currency: 'KRW', symbol: '₩', hasRegions: false },
    ES: { region: 'europe', name: 'Spain', currency: 'EUR', symbol: '€', hasRegions: true },
    LK: { region: 'asia-pacific-mea', name: 'Sri Lanka', currency: 'LKR', symbol: 'Rs', hasRegions: false },
    SE: { region: 'europe', name: 'Sweden', currency: 'SEK', symbol: 'kr', hasRegions: false },
    CH: { region: 'europe', name: 'Switzerland', currency: 'CHF', symbol: 'CHF', hasRegions: true },
    TW: { region: 'asia-pacific-mea', name: 'Taiwan', currency: 'TWD', symbol: 'NT$', hasRegions: false },
    TZ: { region: 'asia-pacific-mea', name: 'Tanzania', currency: 'TZS', symbol: 'TSh', hasRegions: false },
    TH: { region: 'asia-pacific-mea', name: 'Thailand', currency: 'THB', symbol: '฿', hasRegions: false },
    TT: { region: 'americas', name: 'Trinidad and Tobago', currency: 'TTD', symbol: 'TT$', hasRegions: false },
    TN: { region: 'asia-pacific-mea', name: 'Tunisia', currency: 'TND', symbol: 'DT', hasRegions: false },
    TR: { region: 'asia-pacific-mea', name: 'Turkey', currency: 'TRY', symbol: '₺', hasRegions: false },
    AE: { region: 'asia-pacific-mea', name: 'United Arab Emirates', currency: 'AED', symbol: 'AED', hasRegions: false },
    GB: { region: 'europe', name: 'United Kingdom', currency: 'GBP', symbol: '£', hasRegions: true },
    US: { region: 'americas', name: 'United States', currency: 'USD', symbol: '$', hasRegions: true },
    UY: { region: 'americas', name: 'Uruguay', currency: 'UYU', symbol: 'UY$', hasRegions: false },
    VE: { region: 'americas', name: 'Venezuela', currency: 'VES', symbol: 'Bs.', hasRegions: false },
    VN: { region: 'asia-pacific-mea', name: 'Vietnam', currency: 'VND', symbol: '₫', hasRegions: false }
  };
})();
