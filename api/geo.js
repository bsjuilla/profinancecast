// api/geo.js — Edge runtime (does NOT count against the Hobby 12-function cap).
//
// Returns the visitor's country + best-guess currency derived from Vercel's
// edge-network headers. Zero network calls; no IP address is logged or
// returned to the client. Used by onboarding.html and cash-forecast.html.
//
// Privacy: the user sees their own geo, we don't persist it. The IP itself
// never crosses out of Vercel's edge.
//
// Response shape:
//   { countryCode, countryName, region, city, currencyCode, currencySymbol, source }
//
// Edge runtime advantages here:
//   - Runs at the closest POP — sub-50ms even from Mauritius.
//   - Does not count toward the 12 Serverless Function cap on Hobby (the
//     reason we converted from the Node runtime).
//   - Native access to `req.geo` and `req.headers.get(...)` for the
//     `x-vercel-ip-country*` headers.

export const config = { runtime: 'edge' };

// Country → ISO 4217 currency. Pinned to the dominant currency where multiple
// circulate (e.g. ZW → USD in practice, not ZWL). ~250 rows.
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

const CURRENCY_SYMBOL_QUICK = {
  USD:'$', EUR:'€', GBP:'£', JPY:'¥', CNY:'¥', INR:'₹', AUD:'A$', CAD:'CA$',
  CHF:'CHF', SGD:'S$', HKD:'HK$', NZD:'NZ$', SEK:'kr', NOK:'kr', DKK:'kr',
  ZAR:'R', BRL:'R$', MXN:'Mex$', KRW:'₩', NGN:'₦', MUR:'₨', AED:'د.إ',
};

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

export default function handler(req) {
  // Edge runtime exposes both `req.geo` (parsed by Vercel) AND the raw
  // x-vercel-ip-* headers. We use headers for the country since that's
  // the well-documented stable contract; `req.geo` is convenient but
  // we don't depend on the runtime-side parser.
  const hCountry = req.headers.get('x-vercel-ip-country') || '';
  const hRegion  = req.headers.get('x-vercel-ip-country-region') || '';
  const hCity    = req.headers.get('x-vercel-ip-city') || '';

  // Fall back to USD if Vercel didn't supply a country header (Tor / VPN /
  // localhost dev).
  const cc = (hCountry || 'US').toUpperCase();
  const currencyCode = COUNTRY_TO_CURRENCY[cc] || 'USD';
  const currencySymbol = CURRENCY_SYMBOL_QUICK[currencyCode] || currencyCode;
  const countryName = COUNTRY_NAME_QUICK[cc] || '';

  const payload = {
    countryCode: cc,
    countryName,
    region: _decode(hRegion) || null,
    city: _decode(hCity) || null,
    currencyCode,
    currencySymbol,
    source: hCountry ? 'vercel-headers' : 'fallback-usd',
  };

  // Cache the happy path for an hour. NEVER cache the fallback-usd path —
  // if Vercel's geo headers are briefly absent for one edge POP, caching
  // that response would pin every subsequent user from that POP to USD for
  // an hour. (Security-audit finding.)
  const cacheControl = hCountry
    ? 'public, s-maxage=3600, max-age=0, must-revalidate'
    : 'no-store';

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheControl,
    },
  });
}
