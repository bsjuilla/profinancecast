// api/inflation.js — Edge runtime World Bank inflation proxy.
//
// Moved from Node serverless to Edge runtime in the macro-data swap: the
// /api/macro endpoint needs Node runtime to escape FRED's edge-POP IP block,
// and we're at the Hobby 12-Serverless-Function cap. Inflation is a stateless
// World Bank proxy with no DB / auth dependencies — perfect Edge fit. Net
// function count is unchanged.
//
// USAGE: GET /api/inflation?country=MU
// country = ISO 3166-1 alpha-2 country code (2 letters)

export const config = { runtime: 'edge' };

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

function _json(payload, status, extraHeaders) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: Object.assign({
      'Content-Type': 'application/json; charset=utf-8',
    }, extraHeaders || {}),
  });
}

export default async function handler(req) {
  if (req.method !== 'GET') {
    return _json({ error: 'Method not allowed' }, 405);
  }

  const url = new URL(req.url);
  const countryCode = (url.searchParams.get('country') || 'US').toUpperCase().trim();
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    return _json({ error: 'Invalid country code. Use 2-letter ISO code e.g. MU, US, GB' }, 400);
  }

  const wbCode = WB_CODE_MAP[countryCode] || countryCode;

  try {
    // World Bank API — FP.CPI.TOTL.ZG = Consumer Price Index, annual inflation %
    // mrv=3 = most recent 3 values; format=json = JSON response
    const wbUrl = `https://api.worldbank.org/v2/country/${wbCode}/indicator/FP.CPI.TOTL.ZG?format=json&mrv=3&per_page=3`;

    const response = await fetch(wbUrl, { headers: { 'Accept': 'application/json' } });

    if (!response.ok) {
      return _json({ error: 'World Bank API unavailable. Please try again.', fallback: true }, 502);
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length < 2 || !Array.isArray(data[1])) {
      return _json({ error: 'Unexpected data format from World Bank API', fallback: true }, 502);
    }

    const datapoints = data[1];
    const valid = datapoints.filter(d => d.value !== null);

    if (valid.length === 0) {
      // Graceful fallback: return a global average so dashboards don't show 0
      return _json({
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
      }, 200);
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

    return _json({
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
    }, 200, {
      // World Bank annual data — 24h CDN cache is conservative.
      'Cache-Control': 'public, s-maxage=86400, max-age=0, must-revalidate',
    });

  } catch (err) {
    console.error('Inflation API error:', err && err.message);
    return _json({ error: 'Could not fetch inflation data. Please try again.', fallback: true }, 500);
  }
}
