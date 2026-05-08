// api/inflation.js
// Fetches live inflation data from the World Bank API — completely free, no key needed.
// Returns the most recent CPI inflation rate for any country.
//
// USAGE: GET /api/inflation?country=MU
// country = ISO 3166-1 alpha-2 country code (2 letters)
//
// EXAMPLES:
//   /api/inflation?country=MU  → Mauritius
//   /api/inflation?country=US  → United States
//   /api/inflation?country=GB  → United Kingdom
//   /api/inflation?country=IN  → India
//   /api/inflation?country=ZA  → South Africa

// World Bank country code map — alpha-2 → World Bank code
// (Most are identical but a few differ)
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

// Friendly country names for display
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

export default async function handler(req, res) {
  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get and validate country code
  const countryCode = (req.query.country || 'US').toUpperCase().trim();
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    return res.status(400).json({ error: 'Invalid country code. Use 2-letter ISO code e.g. MU, US, GB' });
  }

  // Convert to World Bank code
  const wbCode = WB_CODE_MAP[countryCode] || countryCode;

  try {
    // World Bank API — FP.CPI.TOTL.ZG = Consumer Price Index, annual inflation %
    // mrv=3 = most recent 3 values (so we can show trend if needed)
    // format=json = JSON response
    const url = `https://api.worldbank.org/v2/country/${wbCode}/indicator/FP.CPI.TOTL.ZG?format=json&mrv=3&per_page=3`;

    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      return res.status(502).json({
        error: 'World Bank API unavailable. Please try again.',
        fallback: true
      });
    }

    const data = await response.json();

    // World Bank response format: [metadata, [datapoints]]
    if (!Array.isArray(data) || data.length < 2 || !Array.isArray(data[1])) {
      return res.status(502).json({ error: 'Unexpected data format from World Bank API', fallback: true });
    }

    const datapoints = data[1];

    // Filter out null values and get the most recent valid one
    const valid = datapoints.filter(d => d.value !== null);

    if (valid.length === 0) {
      // Graceful fallback: return a global average so dashboards don't show 0
      return res.status(200).json({
        countryCode,
        countryName: COUNTRY_NAMES[countryCode] || countryCode,
        rate: 3.5,                     // ~ global average inflation 2024
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

    // Calculate trend: is inflation rising or falling?
    let trend = 'stable';
    let trendAmount = 0;
    if (previous && previous.value !== null) {
      trendAmount = Math.round((latest.value - previous.value) * 10) / 10;
      if (trendAmount > 0.2) trend = 'rising';
      else if (trendAmount < -0.2) trend = 'falling';
    }

    // Classify severity
    let severity = 'normal';
    if (latest.value >= 10) severity = 'high';
    else if (latest.value >= 5) severity = 'elevated';
    else if (latest.value <= 0) severity = 'deflation';

    return res.status(200).json({
      countryCode,
      countryName: COUNTRY_NAMES[countryCode] || countryCode,
      rate: Math.round(latest.value * 10) / 10,        // e.g. 3.5
      year: latest.date,                                 // e.g. "2024"
      previousRate: previous ? Math.round(previous.value * 10) / 10 : null,
      previousYear: previous ? previous.date : null,
      trend,          // 'rising' | 'falling' | 'stable'
      trendAmount,    // e.g. +0.8 or -1.2
      severity,       // 'normal' | 'elevated' | 'high' | 'deflation'
      source: 'World Bank — Consumer Price Index (FP.CPI.TOTL.ZG)',
      sourceUrl: `https://data.worldbank.org/indicator/FP.CPI.TOTL.ZG?locations=${wbCode}`,
      lastUpdated: new Date().toISOString()
    });

  } catch (err) {
    console.error('Inflation API error:', err);
    return res.status(500).json({
      error: 'Could not fetch inflation data. Please try again.',
      fallback: true
    });
  }
}
