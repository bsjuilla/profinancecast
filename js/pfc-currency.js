// js/pfc-currency.js — central currency-symbol resolver.
//
// Bug context: onboarding.html historically stored USER.currency as a SYMBOL
// (e.g. "₨" for Mauritian rupee), while settings.html stores it as an
// ISO 4217 CODE (e.g. "MUR"). Pages prepended USER.currency directly to
// numbers without normalising, producing displays like "MUR 3,000" instead
// of "₨3,000" for any user who had touched Settings.
//
// This module exposes a single global function that handles BOTH formats:
//   - If the value is a 3-letter ISO code, returns the matching symbol
//     (falls back to the code itself if unknown)
//   - If the value is already a symbol or any other string, returns it as-is
//   - If empty/null, returns '$' (safe default for the existing display logic)
//
// Usage in consumer pages:
//   const sym = PFCCurrency.toSymbol(USER.currency);
//   element.textContent = sym + amount.toLocaleString();

(function () {
  // ISO 4217 code → display symbol. Covers every currency in the
  // settings.html dropdown. Symbols use the Unicode form most commonly
  // rendered correctly on Windows + macOS + Linux without font fallback
  // failures. Currencies without a single-char symbol (most African +
  // Asian) use a short 2-3 char prefix.
  const SYMBOLS = {
    // Major / common
    USD: '$', EUR: '€', GBP: '£', JPY: '¥', CHF: 'CHF', CAD: 'CA$',
    AUD: 'A$', NZD: 'NZ$', CNY: '¥', INR: '₹', SGD: 'S$', HKD: 'HK$',
    ZAR: 'R', BRL: 'R$', MXN: 'Mex$', AED: 'د.إ',
    // Africa
    NGN: '₦', KES: 'KSh', GHS: 'GH₵', UGX: 'USh', TZS: 'TSh', RWF: 'RF',
    EGP: 'E£', MAD: 'د.م.', TND: 'د.ت', ETB: 'Br', XOF: 'CFA', XAF: 'FCFA',
    MUR: '₨', BWP: 'P', NAD: 'N$', ZMW: 'ZK', SCR: '₨', MGA: 'Ar',
    SDG: 'ج.س.', SOS: 'Sh', SLL: 'Le', LRD: 'L$',
    // Asia / Pacific
    KRW: '₩', THB: '฿', VND: '₫', PHP: '₱', IDR: 'Rp', MYR: 'RM',
    TWD: 'NT$', LKR: '₨', PKR: '₨', BDT: '৳', NPR: '₨', BTN: 'Nu.',
    KZT: '₸', UZS: 'soʻm', KGS: 'с', TJS: 'ЅМ', MNT: '₮', MMK: 'K',
    KHR: '៛', LAK: '₭', MOP: 'MOP$', BND: 'B$', FJD: 'FJ$', PGK: 'K',
    // Europe (non-EUR)
    NOK: 'kr', SEK: 'kr', DKK: 'kr', ISK: 'kr', PLN: 'zł', CZK: 'Kč',
    HUF: 'Ft', RON: 'lei', BGN: 'лв', HRK: 'kn', RSD: 'РСД', ALL: 'L',
    MKD: 'ден', BAM: 'KM', UAH: '₴', RUB: '₽', BYN: 'Br', MDL: 'L',
    GEL: '₾', AMD: '֏', AZN: '₼', TRY: '₺',
    // Middle East
    SAR: 'ر.س', QAR: 'ر.ق', BHD: '.د.ب', KWD: 'د.ك', OMR: 'ر.ع.', JOD: 'د.أ',
    LBP: 'ل.ل', SYP: '£', YER: '﷼', IRR: '﷼', IQD: 'ع.د', ILS: '₪',
    // Americas
    ARS: '$', CLP: '$', COP: '$', PEN: 'S/.', UYU: '$U', BOB: 'Bs.',
    PYG: '₲', VES: 'Bs.', GTQ: 'Q', HNL: 'L', NIO: 'C$', CRC: '₡',
    PAB: 'B/.', DOP: 'RD$', JMD: 'J$', TTD: 'TT$', BBD: 'Bds$', BSD: 'B$',
    BMD: 'BD$', BZD: 'BZ$', KYD: 'CI$', XCD: 'EC$', AWG: 'ƒ', ANG: 'ƒ',
    HTG: 'G', CUP: '$', SVC: '$',
    // Pacific
    WST: 'WS$', TOP: 'T$', SBD: 'SI$', VUV: 'Vt', XPF: '₣',
    // Crypto-adjacent / other
    AFN: '؋', BWP_ALT: 'P', ETB_ALT: 'Br',
  };

  // ISO codes are exactly 3 uppercase letters. We use this strict check so
  // "$" or "₨" (real symbols) are correctly identified as "not an ISO code"
  // and returned as-is.
  const ISO_RE = /^[A-Z]{3}$/;

  function toSymbol(value) {
    if (value == null || value === '') return '$';
    const s = String(value).trim();
    if (!ISO_RE.test(s)) return s; // already a symbol or display string
    return SYMBOLS[s] || s;        // ISO code → symbol, or pass through unknown ISO
  }

  // Inverse helper — given a symbol or ISO, returns the canonical ISO code
  // when possible. Used by settings.html to normalise data on save so the
  // dropdown re-selects the right option on next load.
  let SYMBOL_TO_ISO = null;
  function _buildReverse() {
    SYMBOL_TO_ISO = {};
    // First-write-wins so common symbols (e.g. "$" → USD, not ARS/COP/etc.)
    // map to the most common ISO. Order in SYMBOLS dict above is preserved.
    const preferred = { '$': 'USD', '£': 'GBP', '€': 'EUR', '¥': 'JPY' };
    for (const k in preferred) SYMBOL_TO_ISO[k] = preferred[k];
    for (const iso in SYMBOLS) {
      const sym = SYMBOLS[iso];
      if (!(sym in SYMBOL_TO_ISO)) SYMBOL_TO_ISO[sym] = iso;
    }
  }
  function toISO(value) {
    if (!value) return 'USD';
    const s = String(value).trim();
    if (ISO_RE.test(s)) return s; // already an ISO
    if (!SYMBOL_TO_ISO) _buildReverse();
    return SYMBOL_TO_ISO[s] || 'USD';
  }

  window.PFCCurrency = {
    toSymbol: toSymbol,
    toISO: toISO,
    symbols: SYMBOLS,
  };
  // Global shorthand — pages call PFCSym(USER.currency) instead of
  // PFCCurrency.toSymbol(...). Wave-15 §A canonicalises currency display
  // across every working surface, regardless of whether storage is in
  // symbol or ISO form.
  window.PFCSym = toSymbol;
})();
