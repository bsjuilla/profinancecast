/**
 * pfc-news.js — Financial news client backed by /api/news (Marketaux).
 *
 * Used by:
 *   - Sage chatbot: 5 most-recent articles passed as `news_context`
 *     in /api/sage requests so Gemini can ground answers in real headlines.
 *   - (Future) dashboard ticker widget.
 *
 * Public API:
 *   PFCNews.getHeadlines(opts?) → Promise<Article[]>
 *     opts.limit  (default 5, max 10 — server caps at 3 per response on free)
 *     opts.topics (e.g. ['fed','crypto'] — allowlisted server-side)
 *   PFCNews.isAvailable() → boolean (false until first successful fetch)
 *
 * Cache: 1h in sessionStorage. News value drops fast; we don't want
 * yesterday's headlines surfaced in today's Sage conversation.
 *
 * Handles MISSING_KEY (Marketaux env var unset) silently — returns
 * empty array so Sage continues to work without news context.
 */
(function () {
  'use strict';

  const CACHE_KEY = 'pfc_news_v1';
  const TTL_MS = 60 * 60 * 1000;     // 1h
  let _inflight = null;
  let _available = null;             // null = unknown, true/false set after first probe

  function _now() { return Date.now(); }

  function _cacheGet(key) {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      const entry = JSON.parse(raw);
      if (!entry || !Array.isArray(entry.articles) || !entry.fetchedAt) return null;
      if (_now() - entry.fetchedAt > TTL_MS) return null;
      return entry.articles;
    } catch (_) { return null; }
  }

  function _cacheSet(key, articles) {
    try {
      sessionStorage.setItem(key, JSON.stringify({ articles: articles, fetchedAt: _now() }));
    } catch (_) {}
  }

  function _normaliseOpts(opts) {
    opts = opts || {};
    const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 5, 1), 10);
    const topics = Array.isArray(opts.topics) ? opts.topics.slice(0, 5) : [];
    return { limit, topics };
  }

  function _buildUrl(opts) {
    let url = '/api/news';
    if (opts.topics.length) url += '?topics=' + encodeURIComponent(opts.topics.join(','));
    return url;
  }

  function _cacheKey(opts) {
    return CACHE_KEY + ':' + opts.topics.join(',');
  }

  async function getHeadlines(rawOpts) {
    const opts = _normaliseOpts(rawOpts);
    const ck = _cacheKey(opts);
    const cached = _cacheGet(ck);
    if (cached) { _available = true; return cached.slice(0, opts.limit); }
    if (_inflight) return _inflight;

    _inflight = fetch(_buildUrl(opts), { credentials: 'omit' })
      .then(async (res) => {
        if (res.status === 503) {
          _available = false;
          _inflight = null;
          return [];
        }
        if (!res.ok) throw new Error('news_http_' + res.status);
        const data = await res.json();
        const articles = Array.isArray(data && data.articles) ? data.articles : [];
        _cacheSet(ck, articles);
        _available = articles.length > 0;
        _inflight = null;
        return articles.slice(0, opts.limit);
      })
      .catch((e) => {
        _inflight = null;
        try { console.warn('[PFCNews] fetch failed:', e && e.message); } catch (_) {}
        return [];
      });
    return _inflight;
  }

  function isAvailable() { return _available === true; }

  window.PFCNews = {
    getHeadlines: getHeadlines,
    isAvailable: isAvailable,
  };
})();
