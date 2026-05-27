// api/inflation.js — Node serverless World Bank inflation proxy.
//
// NOTE on runtime: tried as Edge runtime briefly but World Bank's API
// appears to filter cloud-CDN edge POP IPs (502 responses every time).
// Reverted to Node runtime where Vercel egresses through AWS Lambda IPs
// which World Bank accepts. (Same class of issue as FRED, but FRED blocks
// both runtimes while World Bank blocks only Edge.)
//
// USAGE: GET /api/inflation?country=MU
// country = ISO 3166-1 alpha-2 country code (2 letters)

// World Bank country code map — alpha-2 → World Bank code
const WB_CODE_MAP = {
  'US': 'USA', 'GB': 'GBR', 'MU': 'MUS', 'IN': 'IND', 'ZA': 'ZAF',
  'AU': 'AUS', 'CA': 'CAN', 'FR': 'FRA', 'DE': 'DEU', 'IT': 'ITA',
  'ES': 'ESP', 'PT': 'PRT', 'NL': 'NLD', 'BE': 'BEL', 'CH': 'CHE',
  'SE': 'SWE', 'NO': 'NOR', 'DK': 'DNK', 'FI': 'FIN', 'PL': 'POL',
  'JP': 'JPN', 'CN': 'CHN', 'KR': 'KOR', 'SG': 'SGP', 'HK': 'HKG',
  'TH': 'THA', 'MY': 'MYS', 'ID': 'IDN', 'PH': 'PHL', 'VN': 'VNM',
  'BR': 'BRA', 'MX': 'MEX', 'AR': 'ARG', 'CL': 'CHL', 'CO': 'COL',
  'NG': 'NGA', 'KE': 'KEN', 'GH': 'GHA', 'EG': 'EGY', 'MA': 'MAR',
  'AE': 'ARE', 'SA': 'SAU', 'IL': 'ISR', 'TR': 'TUR', 'PK': 'PAK',
  'NZ': 'NZL', 'RU': 'RUS', 'UA': 'UKR', 'CZ': 'CZE', 'HU': 'HUN',
  'RO': 'ROU', 'HR': 'HRV', 'SK': 'SVK', 'SI': 'SVN', 'BG': 'BGR',
  'LK': 'LKA', 'BD': 'BGD', 'NP': 'NPL', 'MM': 'MMR', 'KH': 'KHM',
  'ET': 'ETH', 'TZ': 'TZA', 'UG': 'UGA', 'RW': 'RWA', 'CM': 'CMR',
  'EC': 'ECU', 'PE': 'PER', 'UY': 'URY', 'PY': 'PRY', 'BO': 'BOL',
};

const COUNTRY_NAMES = {
  'MU': 'Mauritius', 'US': 'United States', 'GB': 'United Kingdom',
  'AU': 'Australia', 'CA': 'Canada', 'IN': 'India', 'ZA': 'South Africa',
  'FR': 'France', 'DE': 'Germany', 'IT': 'Italy', 'ES': 'Spain',
  'PT': 'Portugal', 'NL': 'Netherlands', 'CH': 'Switzerland', 'SE': 'Sweden',
  'NO': 'Norway', 'DK': 'Denmark', 'FI': 'Finland', 'PL': 'Poland',
  'JP': 'Japan', 'CN': 'China', 'KR': 'South Korea', 'SG': 'Singapore',
  'HK': 'Hong Kong', 'TH': 'Thailand', 'MY': 'Malaysia', 'ID': 'Indonesia',
  'PH': 'Philippines', 'VN': 'Vietnam', 'BR': 'Brazil', 'MX': 'Mexico',
  'AR': 'Argentina', 'CL': 'Chile', 'CO': 'Colombia', 'NG': 'Nigeria',
  'KE': 'Kenya', 'GH': 'Ghana', 'EG': 'Egypt', 'MA': 'Morocco',
  'AE': 'UAE', 'SA': 'Saudi Arabia', 'IL': 'Israel', 'TR': 'Turkey',
  'PK': 'Pakistan', 'NZ': 'New Zealand', 'RU': 'Russia', 'BE': 'Belgium',
  'CZ': 'Czech Republic', 'HU': 'Hungary', 'RO': 'Romania', 'LK': 'Sri Lanka',
  'BD': 'Bangladesh', 'ET': 'Ethiopia', 'TZ': 'Tanzania', 'UG': 'Uganda',
  'EC': 'Ecuador', 'PE': 'Peru', 'UY': 'Uruguay',
};

// FULL-P1-D3 (audit 2026-05-27) — same-origin guard. World Bank is a
// public unauthenticated API but their quota is shared across our
// merchant account. A cross-site `<img src="https://profinancecast.com
// /api/inflation?country=ZW">` placed on any malicious site (or a
// scraper crawling pre-rendered HTML) would burn our World Bank quota
// AND our Vercel Edge minutes with zero benefit to us. Accept only
// browser GETs that originate from our own pages (Origin / Referer
// header matches APP_ORIGIN). Server-to-server callers (curl, our own
// SSR) typically don't set Origin and will be rejected — which is fine,
// the dashboard is the only legitimate caller and it always sets one.
const APP_ORIGIN_INFL = process.env.APP_ORIGIN || 'https://profinancecast.com';
function _normOrig(o) {
  if (!o || typeof o !== 'string') return '';
  try { const u = new URL(o); return u.protocol + '//' + u.hostname.replace(/^www\./, '') + (u.port ? ':' + u.port : ''); }
  catch { return ''; }
}
function _isSameOriginRequest(req) {
  const expected = _normOrig(APP_ORIGIN_INFL);
  if (!expected) return true; // dev / preview without APP_ORIGIN — allow
  const origin  = req.headers.origin  || '';
  const referer = req.headers.referer || '';
  if (origin)  return _normOrig(origin)  === expected;
  if (referer) { try { return _normOrig(new URL(referer).origin) === expected; } catch { return false; } }
  return false; // no Origin and no Referer = reject (typical for hot-linked <img>)
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // FULL-P1-D3 — reject cross-site / hot-linked GETs that would burn
  // our World Bank quota with no benefit. Returns 403 not 404 so legit
  // dashboard hits get a clear signal if APP_ORIGIN is misconfigured.
  if (!_isSameOriginRequest(req)) {
    return res.status(403).json({ error: 'Forbidden: same-origin only' });
  }

  const countryCode = (req.query.country || 'US').toUpperCase().trim();
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    return res.status(400).json({ error: 'Invalid country code. Use 2-letter ISO code e.g. MU, US, GB' });
  }

  const wbCode = WB_CODE_MAP[countryCode] || countryCode;

  try {
    const url = `https://api.worldbank.org/v2/country/${wbCode}/indicator/FP.CPI.TOTL.ZG?format=json&mrv=3&per_page=3`;
    const response = await fetch(url, { headers: { 'Accept': 'application/json' } });

    if (!response.ok) {
      return res.status(502).json({
        error: 'World Bank API unavailable. Please try again.',
        fallback: true,
      });
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length < 2 || !Array.isArray(data[1])) {
      return res.status(502).json({ error: 'Unexpected data format from World Bank API', fallback: true });
    }

    const datapoints = data[1];
    const valid = datapoints.filter(d => d.value !== null);

    if (valid.length === 0) {
      return res.status(200).json({
        countryCode,
        countryName: COUNTRY_NAMES[countryCode] || countryCode,
        rate: 3.5,
        year: new Date().getFullYear() - 1,
        previousRate: null,
        previousYear: null,
        trend: 'stable',
        trendAmount: 0,
        severity: 'normal',
        source: 'Estimate (no World Bank data for this country)',
        sourceUrl: null,
        lastUpdated: new Date().toISOString(),
        fallback: true,
      });
    }

    const latest = valid[0];
    const previous = valid[1] || null;

    let trend = 'stable';
    let trendAmount = 0;
    if (previous && previous.value !== null) {
      trendAmount = Math.round((latest.value - previous.value) * 10) / 10;
      if (trendAmount > 0.2) trend = 'rising';
      else if (trendAmount < -0.2) trend = 'falling';
    }

    let severity = 'normal';
    if (latest.value >= 10) severity = 'high';
    else if (latest.value >= 5) severity = 'elevated';
    else if (latest.value <= 0) severity = 'deflation';

    return res.status(200).json({
      countryCode,
      countryName: COUNTRY_NAMES[countryCode] || countryCode,
      rate: Math.round(latest.value * 10) / 10,
      year: latest.date,
      previousRate: previous ? Math.round(previous.value * 10) / 10 : null,
      previousYear: previous ? previous.date : null,
      trend,
      trendAmount,
      severity,
      source: 'World Bank — Consumer Price Index (FP.CPI.TOTL.ZG)',
      sourceUrl: `https://data.worldbank.org/indicator/FP.CPI.TOTL.ZG?locations=${wbCode}`,
      lastUpdated: new Date().toISOString(),
    });

  } catch (err) {
    // FULL-P1-D2 (audit 2026-05-27) — redact PII / stack. Original
    // `console.error('Inflation API error:', err)` dumped the full
    // Error including stack frames + URL string with caller-supplied
    // country code. Log only the error name + code so Sentry can
    // cluster without leaking caller context.
    console.error('[inflation] fetch failed name=' + (err?.name || 'Error') + ' code=' + (err?.code || 'UNKNOWN'));
    return res.status(500).json({
      error: 'Could not fetch inflation data. Please try again.',
      fallback: true,
    });
  }
}
