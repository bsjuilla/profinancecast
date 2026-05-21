// api/news.js — Edge runtime financial-news proxy via Marketaux.
//
// Marketaux focuses on financial news with entity tagging (ticker symbols
// referenced in each article, sentiment scores, country tags). Used by:
//   - Sage chatbot as "what's affecting my money this week" context
//   - Optional dashboard ticker widget (future)
//
// Free tier: 100 calls/day, 3 articles per response. We cache 1h at the
// edge — that turns 24 unique fetches/day into effectively unlimited reads.
//
// Required env: MARKETAUX_API_KEY (free signup at marketaux.com)
//
// Request:
//   GET /api/news
//   GET /api/news?topics=earnings,fed
//
// Response 200:
//   { articles: [{title, snippet, url, source, published_at, entities:[{symbol,sentiment_score}]}],
//     source: "marketaux" }
// Response 503 (no key):
//   { error: "News API key not configured...", code: "MISSING_KEY" }

export const config = { runtime: 'edge' };

const MARKETAUX_BASE = 'https://api.marketaux.com/v1';

function _json(payload, status, extraHeaders) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: Object.assign({
      'Content-Type': 'application/json; charset=utf-8',
    }, extraHeaders || {}),
  });
}

// Marketaux topic keywords. We allow a small, fixed set so users can't
// craft arbitrary upstream queries (defense against URL injection that
// might exfiltrate the API key via crafted parameters).
const ALLOWED_TOPICS = new Set([
  'earnings','fed','inflation','market','crypto','tech','energy',
  'finance','housing','employment','currency','ipo',
]);

export default async function handler(req) {
  if (req.method !== 'GET') {
    return _json({ error: 'Method not allowed', code: 'METHOD' }, 405);
  }

  const key = process.env.MARKETAUX_API_KEY;
  if (!key) {
    return _json(
      {
        error: 'News API key not configured. Add MARKETAUX_API_KEY in Vercel.',
        code: 'MISSING_KEY',
      },
      503,
      { 'Cache-Control': 'no-store' }
    );
  }

  const url = new URL(req.url);
  const topicsRaw = (url.searchParams.get('topics') || '').toLowerCase();
  const requestedTopics = topicsRaw
    .split(',')
    .map((t) => t.trim())
    .filter((t) => ALLOWED_TOPICS.has(t));

  // Marketaux URL — language=en, broad finance filter, entity inclusion.
  // limit=3 is the free-tier maximum per call.
  const params = new URLSearchParams({
    'api_token': key,
    'language':  'en',
    'filter_entities': 'true',
    'must_have_entities': 'true',
    'limit': '3',
  });
  if (requestedTopics.length) {
    // Marketaux uses `industries` for topic-like filtering. Pass as-is;
    // unknown values return zero results, which is harmless.
    params.set('industries', requestedTopics.join(','));
  }

  let res;
  try {
    res = await fetch(MARKETAUX_BASE + '/news/all?' + params.toString(), {
      headers: { 'Accept': 'application/json' },
    });
  } catch (e) {
    return _json({ error: 'Upstream fetch failed', code: 'NETWORK' }, 502);
  }

  if (!res.ok) {
    // Don't leak the key — Marketaux echoes it in error bodies sometimes.
    return _json(
      { error: 'Upstream error', code: 'UPSTREAM_' + res.status },
      res.status === 429 ? 429 : 502,
      { 'Cache-Control': 'no-store' }
    );
  }

  let data;
  try { data = await res.json(); }
  catch (e) { return _json({ error: 'Bad upstream JSON', code: 'PARSE' }, 502); }

  // Normalise: take only the fields we actually use, strip Marketaux's nested
  // pagination metadata, sanity-clip strings to keep payload small.
  const articles = Array.isArray(data && data.data) ? data.data : [];
  const out = articles.map((a) => ({
    title: String(a.title || '').slice(0, 200),
    snippet: String(a.snippet || a.description || '').slice(0, 280),
    url: String(a.url || ''),
    source: String(a.source || ''),
    published_at: a.published_at || null,
    entities: Array.isArray(a.entities) ? a.entities.slice(0, 5).map((e) => ({
      symbol: String(e.symbol || '').slice(0, 12),
      name: String(e.name || '').slice(0, 80),
      sentiment_score: typeof e.sentiment_score === 'number' ? e.sentiment_score : null,
    })) : [],
  }));

  return _json(
    { articles: out, source: 'marketaux', asOf: new Date().toISOString() },
    200,
    { 'Cache-Control': 'public, s-maxage=3600, max-age=0, must-revalidate' }
  );
}
