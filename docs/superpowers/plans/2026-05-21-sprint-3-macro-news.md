# Sprint 3: FRED Macro + Marketaux News Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax. Each task ships independently and is verifiable.

**Goal:** Add a macroeconomic-context card to the dashboard (FRED data) + financial-news context to the Sage chatbot (Marketaux), so users see "real yield" framing and "what's affecting my money this week" answers.

**Architecture:** Two Edge Functions on Vercel (no impact on the 12-Serverless cap). FRED uses the keyless `fredgraph.csv` endpoint to avoid yet another env var. Marketaux requires a free `MARKETAUX_API_KEY` because their API is gated. Server-side caching: macro = 6h, news = 1h. Client modules feed the widgets and chatbot context. Same CSP-clean patterns as Sprints 1 + 2.

**Tech Stack:** Vercel Edge runtime, Fetch API, CSV parsing (~12-line custom parser for FRED), JSON for Marketaux. No new client-side dependencies — Chart.js already loaded for any sparklines.

---

## File Structure

| Path | Responsibility |
|---|---|
| `api/macro.js` | Edge proxy → FRED. Returns `{fedFunds, mortgage30y, treasury10y, cpiYoY}` |
| `api/news.js` | Edge proxy → Marketaux. Returns recent financial headlines with entity tags |
| `js/pfc-macro.js` | Client module: `PFCMacro.get()` with 24h localStorage cache |
| `js/pfc-news.js` | Client module: `PFCNews.getHeadlines()` for Sage context + dashboard ticker |
| `js/inline/dashboard-3.js` | Add macro-widget renderer (already extracted in CSP refactor) |
| `js/inline/sage-2.js` | Modify to fetch news + inject into Sage system prompt |
| `dashboard.html` | Add `<div id="macro-widget">` slot + script tag for pfc-macro.js |
| `sage.html` | Add script tag for pfc-news.js |
| `scripts/verify-sprint3.py` | Playwright verification: probes endpoints + renders |

---

## Task 1: api/macro.js (FRED Edge proxy)

**Files:**
- Create: `api/macro.js`
- Verify: `node --check api/macro.js`

- [ ] Step 1: Write Edge handler that fetches 4 FRED series via fredgraph CSV, parses tail value of each, returns JSON
- [ ] Step 2: Add 6-hour edge cache header (`s-maxage=21600`)
- [ ] Step 3: Compute CPI YoY by comparing current month vs 12 months prior
- [ ] Step 4: Return shape: `{ fedFunds, mortgage30y, treasury10y, cpiYoY, asOf, source: "fred-stlouisfed" }`
- [ ] Step 5: Syntax check + commit

## Task 2: api/news.js (Marketaux Edge proxy)

**Files:**
- Create: `api/news.js`
- Env required: `MARKETAUX_API_KEY` in Vercel (user adds after deploy)

- [ ] Step 1: Edge handler that calls Marketaux `/news/all?language=en&filter_entities=true&limit=10`
- [ ] Step 2: Strip API key from any error path; return 503/MISSING_KEY shape (same as `/api/quote`)
- [ ] Step 3: Return shape: `{ articles: [{title, snippet, url, source, published_at, entities: [...]}], source: "marketaux" }`
- [ ] Step 4: 1-hour edge cache (`s-maxage=3600`)
- [ ] Step 5: Syntax check + commit

## Task 3: js/pfc-macro.js client module

**Files:**
- Create: `js/pfc-macro.js`

- [ ] Step 1: Implement `PFCMacro.get()` returning a Promise with the macro JSON, cached in localStorage for 24h
- [ ] Step 2: Expose `PFCMacro.lastUpdated()` for stale-state UI
- [ ] Step 3: In-flight de-dupe so concurrent callers share one fetch
- [ ] Step 4: Syntax check + commit

## Task 4: js/pfc-news.js client module

**Files:**
- Create: `js/pfc-news.js`

- [ ] Step 1: Implement `PFCNews.getHeadlines(opts)` returning up to N recent articles, 1h sessionStorage cache
- [ ] Step 2: Handle MISSING_KEY response silently (return empty array, log to console)
- [ ] Step 3: Syntax check + commit

## Task 5: Macro widget on dashboard

**Files:**
- Modify: `dashboard.html` — add macro card slot + pfc-macro.js script tag
- Modify: `js/inline/dashboard-3.js` — append macro-widget renderer

- [ ] Step 1: Add HTML slot `<div id="macro-widget">` in dashboard content
- [ ] Step 2: Append a `_renderMacroWidget()` IIFE to dashboard-3.js that pulls from PFCMacro and renders Fed funds / 30Y mortgage / CPI YoY / 10Y treasury as a 4-cell mini-strip with "real yield" hint
- [ ] Step 3: Add `<script src="js/pfc-macro.js">` to dashboard.html
- [ ] Step 4: Update CSP `connect-src` to include `fred.stlouisfed.org`
- [ ] Step 5: Syntax check + commit

## Task 6: Sage chatbot news context injection

**Files:**
- Modify: `sage.html` — add pfc-news.js script tag
- Modify: `js/inline/sage-2.js` — prepend recent news to the message sent to /api/sage

- [ ] Step 1: At Sage init, call `PFCNews.getHeadlines({limit: 5})` and cache locally
- [ ] Step 2: When user sends a message, attach the cached headlines as a `news_context` array in the request body so server-side Sage can include them in the Gemini prompt
- [ ] Step 3: Modify `api/sage.js` to read `news_context` and include it in the system prompt scaffold (max 5 headlines, 200 chars each, sanitized)
- [ ] Step 4: Update CSP `connect-src` to include `api.marketaux.com`
- [ ] Step 5: Syntax check + commit

## Task 7: Playwright verification

**Files:**
- Create: `scripts/verify-sprint3.py`

- [ ] Step 1: Test `/api/macro` returns 200 + numeric fields for fedFunds, mortgage30y
- [ ] Step 2: Test `/api/news` returns 200 with articles OR 503 MISSING_KEY (both acceptable initially)
- [ ] Step 3: Test dashboard HTML references pfc-macro.js + macro-widget div
- [ ] Step 4: Test sage HTML references pfc-news.js
- [ ] Step 5: Run full Sprint1+2+3 smoke (verify-live.py extended)

## Task 8: Deep audit (parallel agents)

Dispatch 3 audit agents in parallel after Sprint 3 ships:
- **Security agent** (security-review skill) — review every Edge function for key leakage, input validation, rate limiting, CSP correctness
- **Code-quality agent** — review all 6 new modules + portfolio + sprint-1 files for consistency, error handling, dead code
- **Architecture agent** — assess load-order, state coupling, naming, future scalability

Each agent reports under 600 words. I synthesize the findings, fix critical issues inline, document deferred items.

## Task 9: Final verification + commit

- [ ] Step 1: Re-run all three verify-sprintN.py scripts — 100% pass required
- [ ] Step 2: Re-run verify-live.py 26-page smoke
- [ ] Step 3: Confirm exactly 12 serverless + N Edge functions
- [ ] Step 4: Single summary commit with audit findings doc

---

## Risk Notes

- FRED's `fredgraph.csv` endpoint is undocumented stable URL (used by their own website). Could theoretically change format — mitigated by simple CSV parsing + obvious failure if shape changes.
- Marketaux free tier: 100 calls/day. With 1h edge cache, that's ~24 unique calls/day across all users.
- If Marketaux key is unset, Sage continues to function — news context is just empty.
