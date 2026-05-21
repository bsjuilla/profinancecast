// api/geo.js
//
// Returns the visitor's country + best-guess currency, derived from Vercel's
// edge geo headers (x-vercel-ip-country, x-vercel-ip-country-region, etc).
// Zero network calls — all data lives on Vercel's edge nodes already.
//
// Used by onboarding.html to pre-select the country dropdown + currency picker,
// instead of defaulting USD for everyone. Saves the user a 100-currency scroll.
//
// Privacy: no IP address is logged or returned to the client. We only emit
// the derived country / region / currency code. ProFinanceCast's privacy
// posture: visitor sees their own geo, we don't store it.
//
// Response shape:
//   { countryCode: "MU", countryName: "Mauritius", region: "Plaines Wilhems",
//     city: "Quatre Bornes", currencyCode: "MUR", currencySymbol: "₨",
//     source: "vercel-headers" }
//
// On localhost or where headers are missing, returns sensible USD defaults.

// Country → ISO 4217 currency code. Covers every country in Vercel's coverage
// (~250) plus territories. Sourced from ISO 3166 + the central-bank-published
// currency for each region. Pinned to the dominant currency where multiple
// circulate (e.g. ZW → USD, not ZWL, since USD is the practical day-to-day).
const COUNTRY_TO_CURRENCY = {
  AD:'EUR', AE:'AED', AF:'AFN', AG:'XCD', AI:'XCD', AL:'ALL', AM:'AMD',
  AO:'AOA', AR:'ARS', AS:'USD', AT:'EUR', AU:'AUD', AW:'AWG', AX:'EUR',
  AZ:'AZN', BA:'BAM', BB:'BBD', BD:'BDT', BE:'EUR', BF:'XOF', BG:'BGN',
  BH:'BHD', BI:'BIF', BJ:'XOF', BL:'EUR', BM:'BMD', BN:'BND', BO:'BOB',
  BQ:'USD', BR:'BRL', BS:'BSD', BT:'BTN', BV:'NOK', BW:'BWP', BY:'BYN',
  BZ:'BZD', CA:'CAD', CC:'AUD', CD:'CDF', CF:'XAF', CG:'XAF', CH:'CHF',
  CI:'XOF', CK:'NZD', CL:'CLP', CM:'XAF', CN:'CNY', CO:'COP', CR:'CRC',
  CU:'CUP', CV:'CVE', CW:'ANG', CX:'AUD', CY:'EUR', CZ:'CZK', DE:'EUR',
  DJ:'DJF', DK:'DKK', DM:'XCD', DO:'DOP', DZ:'DZD', EC:'USD', EE:'EUR',
  EG:'EGP', EH:'MAD', ER:'ERN', ES:'EUR', ET:'ETB', FI:'EUR', FJ:'FJD',
  FK:'FKP', FM:'USD', FO:'DKK', FR:'EUR', GA:'XAF', GB:'GBP', GD:'XCD',
  GE:'GEL', GF:'EUR', GG:'GBP', GH:'GHS', GI:'GIP', GL:'DKK', GM:'GMD',
  GN:'GNF', GP:'EUR', GQ:'XAF', GR:'EUR', GS:'GBP', GT:'GTQ', GU:'USD',
  GW:'XOF', GY:'GYD', HK:'HKD', HM:'AUD', HN:'HNL', HR:'EUR', HT:'HTG',
  HU:'HUF', ID:'IDR', IE:'EUR', IL:'ILS', IM:'GBP', IN:'INR', IO:'USD',
  IQ:'IQD', IR:'IRR', IS:'ISK', IT:'EUR', JE:'GBP', JM:'JMD', JO:'JOD',
  JP:'JPY', KE:'KES', KG:'KGS', KH:'KHR', KI:'AUD', KM:'KMF', KN:'XCD',
  KP:'KPW', KR:'KRW', KW:'KWD', KY:'KYD', KZ:'KZT', LA:'LAK', LB:'LBP',
  LC:'XCD', LI:'CHF', LK:'LKR', LR:'LRD', LS:'LSL', LT:'EUR', LU:'EUR',
  LV:'EUR', LY:'LYD', MA:'MAD', MC:'EUR', MD:'MDL', ME:'EUR', MF:'EUR',
  MG:'MGA', MH:'USD', MK:'MKD', ML:'XOF', MM:'MMK', MN:'MNT', MO:'MOP',
  MP:'USD', MQ:'EUR', MR:'MRU', MS:'XCD', MT:'EUR', MU:'MUR', MV:'MVR',
  MW:'MWK', MX:'MXN', MY:'MYR', MZ:'MZN', NA:'NAD', NC:'XPF', NE:'XOF',
  NF:'AUD', NG:'NGN', NI:'NIO', NL:'EUR', NO:'NOK', NP:'NPR', NR:'AUD',
  NU:'NZD', NZ:'NZD', OM:'OMR', PA:'PAB', PE:'PEN', PF:'XPF', PG:'PGK',
  PH:'PHP', PK:'PKR', PL:'PLN', PM:'EUR', PN:'NZD', PR:'USD', PS:'ILS',
  PT:'EUR', PW:'USD', PY:'PYG', QA:'QAR', RE:'EUR', RO:'RON', RS:'RSD',
  RU:'RUB', RW:'RWF', SA:'SAR', SB:'SBD', SC:'SCR', SD:'SDG', SE:'SEK',
  SG:'SGD', SH:'SHP', SI:'EUR', SJ:'NOK', SK:'EUR', SL:'SLL', SM:'EUR',
  SN:'XOF', SO:'SOS', SR:'SRD', SS:'SSP', ST:'STN', SV:'USD', SX:'ANG',
  SY:'SYP', SZ:'SZL', TC:'USD', TD:'XAF', TF:'EUR', TG:'XOF', TH:'THB',
  TJ:'TJS', TK:'NZD', TL:'USD', TM:'TMT', TN:'TND', TO:'TOP', TR:'TRY',
  TT:'TTD', TV:'AUD', TW:'TWD', TZ:'TZS', UA:'UAH', UG:'UGX', UM:'USD',
  US:'USD', UY:'UYU', UZ:'UZS', VA:'EUR', VC:'XCD', VE:'VES', VG:'USD',
  VI:'USD', VN:'VND', VU:'VUV', WF:'XPF', WS:'WST', XK:'EUR', YE:'YER',
  YT:'EUR', ZA:'ZAR', ZM:'ZMW', ZW:'USD',
};

// Display symbols for the 20 most common currencies our users land in.
// (Full symbol table lives in js/pfc-currency.js — duplicated here only
// for the most-common cases so we can return a fully populated payload
// without a second client-side lookup.)
const CURRENCY_SYMBOL_QUICK = {
  USD:'$', EUR:'€', GBP:'£', JPY:'¥', CNY:'¥', INR:'₹', AUD:'A$', CAD:'CA$',
  CHF:'CHF', SGD:'S$', HKD:'HK$', NZD:'NZ$', SEK:'kr', NOK:'kr', DKK:'kr',
  ZAR:'R', BRL:'R$', MXN:'Mex$', KRW:'₩', NGN:'₦', MUR:'₨', AED:'د.إ',
};

// Country-code → display name for the most common, so the client can show
// a friendly "Detected: Mauritius (MUR)" hint without a country-name table.
const COUNTRY_NAME_QUICK = {
  US:'United States', GB:'United Kingdom', CA:'Canada', AU:'Australia',
  NZ:'New Zealand', DE:'Germany', FR:'France', ES:'Spain', IT:'Italy',
  NL:'Netherlands', IE:'Ireland', JP:'Japan', SG:'Singapore', HK:'Hong Kong',
  IN:'India', MU:'Mauritius', ZA:'South Africa', NG:'Nigeria', BR:'Brazil',
  MX:'Mexico', AE:'United Arab Emirates', SA:'Saudi Arabia', KR:'South Korea',
  CN:'China', PH:'Philippines', ID:'Indonesia', MY:'Malaysia', TH:'Thailand',
  VN:'Vietnam', PK:'Pakistan', BD:'Bangladesh', EG:'Egypt', KE:'Kenya',
  GH:'Ghana', TR:'Turkey', PL:'Poland', SE:'Sweden', NO:'Norway', DK:'Denmark',
  FI:'Finland', CH:'Switzerland', AT:'Austria', BE:'Belgium', PT:'Portugal',
  GR:'Greece', CZ:'Czech Republic', HU:'Hungary', RO:'Romania', IL:'Israel',
};

function _decode(v) {
  if (v == null) return '';
  try { return decodeURIComponent(v); } catch (_) { return String(v); }
}

export default function handler(req, res) {
  // Vercel attaches edge geo headers automatically on the request.
  // Header docs: https://vercel.com/docs/edge-network/headers
  const h = req.headers || {};
  const countryCode = String(h['x-vercel-ip-country'] || '').toUpperCase();
  const region      = _decode(h['x-vercel-ip-country-region']);
  const city        = _decode(h['x-vercel-ip-city']);

  // Fall back to USD if Vercel didn't supply a country header (Tor / VPN /
  // localhost dev), so the client gets a stable shape and no NaN downstream.
  const cc = countryCode || 'US';
  const currencyCode = COUNTRY_TO_CURRENCY[cc] || 'USD';
  const currencySymbol = CURRENCY_SYMBOL_QUICK[currencyCode] || currencyCode;
  const countryName = COUNTRY_NAME_QUICK[cc] || '';

  // Cache for an hour at the edge — geo per IP doesn't change on the minute
  // scale, and re-fetching costs nothing. s-maxage is for the CDN; no client
  // cache so a user who moves countries still sees fresh data on next visit.
  res.setHeader('Cache-Control', 'public, s-maxage=3600, max-age=0, must-revalidate');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  res.status(200).json({
    countryCode: cc,
    countryName: countryName,
    region: region || null,
    city: city || null,
    currencyCode: currencyCode,
    currencySymbol: currencySymbol,
    source: countryCode ? 'vercel-headers' : 'fallback-usd',
  });
}
