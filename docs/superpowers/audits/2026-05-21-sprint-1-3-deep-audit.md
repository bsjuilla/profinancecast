# Sprint 1-3 Deep Audit — Findings + Fixes

**Date:** 2026-05-21
**Scope:** All code shipped in Sprints 1 (FX/geo/holidays), 2 (portfolio with Twelve Data + CoinGecko), and 3 (FRED macro + Marketaux news in Sage).
**Method:** Three parallel review agents — security, code-quality, architecture — each with a sharply-scoped reading list. Synthesis below, with fix status per finding.

---

## CRITICAL — fixed in this session

| # | Finding | File | Fix |
|---|---|---|---|
| C1 | Free users see fully-rendered portfolio.html before the soft Pro-gate kicks in. Every other Pro-only page uses `PFCPlan.requirePlan` with visibility-hidden to prevent flicker. | `js/inline/portfolio-auth.js` | Hides `documentElement` until both auth + plan resolve, then calls `PFCPlan.requirePlan(['pro','premium'])` |
| C2 | Twelve Data error message was relayed to client (200-char slice). Marketaux/upstream error bodies could echo `apikey=<key>` in malformed-request errors. | `api/quote.js` | Removed message-relay. Returns generic "Upstream rejected request" + status code only. |
| C3 | `/api/geo` cached the fallback-USD response for 1h. If Vercel's geo headers were briefly missing for one POP, every subsequent user from that POP got pinned to USD. | `api/geo.js` | `Cache-Control: no-store` when `hCountry` is empty. |
| C4 | News-context sanitiser stripped CRLF + back-ticks but not Unicode line separators (U+0085, U+2028, U+2029) or `<system>`-style role markers. Gemini treats some of these as newlines, opening prompt-injection. | `api/sage.js` | Extended regex strips line/para separators, bidi overrides, and role-marker substrings. |
| C5 | Edge proxies were unauthenticated. A bot loop with cache-busting query string could burn the Twelve Data 800/day quota in minutes. | `api/quote.js`, `api/coin.js`, `api/macro.js`, `api/news.js` | Added `Sec-Fetch-Site` check rejecting `cross-site` (browsers attach automatically; JS cannot spoof). Returns 403 CROSS_SITE. |

---

## MEDIUM — fixed in this session

| # | Finding | File | Fix |
|---|---|---|---|
| M1 | Doc-comment in `api/macro.js` still claimed "uses fredgraph.csv, no key needed" but implementation was JSON API with key. | `api/macro.js:1-18` | Comment updated to match. |
| M2 | `api/macro.js` 405 response missing `code: 'METHOD'` (inconsistent with the other 4 Edge functions). | `api/macro.js` | Added `code: 'METHOD'`. |
| M3 | Dead `connect-src` entries: `fred.stlouisfed.org`, `api.marketaux.com`, `generativelanguage.googleapis.com`, `api.worldbank.org`. All are server-side calls; browser only hits same-origin `/api/*`. | `vercel.json` | Removed all 4. |
| M4 | `pfc-portfolio.js` had a value cache but no in-flight de-dupe. A Refresh-click during initial render fired duplicate `/api/quote` calls. | `js/pfc-portfolio.js` | Added `_inflight` map + shared `_fetchWithInflight` helper. |

---

## LOW — deferred (notes only)

| # | Finding | Reasoning |
|---|---|---|
| L1 | Field-naming inconsistency: `api/quote.js` returns `change_pct`, `api/coin.js` returns `change_pct_24h`. | Defer to Sprint-4 refactor. Both fields are 24h-relative on free tiers; standardising on `change_pct_24h` makes the semantics honest but touches client code. |
| L2 | `source` / `asOf` placement varies — quote/coin embed in each quote; macro/news at top level; geo top-level but no `asOf`. | Defer; doesn't break anything. |
| L3 | `api/coin.js` 404 "Coin not found" omits explicit `Cache-Control`. | Vercel default is don't-cache, so this is fine; cosmetic. |
| L4 | CSP `script-src-attr 'unsafe-inline'` left in place from the inline-handler refactor (~365 `onclick=` attrs still in HTML). | Tightening means converting every handler to addEventListener; that's the explicitly-deferred Truly Full CSP path from the earlier session. |
| L5 | CSP `img-src https:` is broadly permissive. | Tightening means enumerating every image source (Supabase storage, paypalobjects, og-image, etc); defer to a dedicated session. |
| L6 | False positive — audit flagged `OWNER_EMAILS` env not lowercased, but `api/sage.js:46` already does `.split(',').map(s => s.trim().toLowerCase())`. | No action. |
| L7 | 12/12 Hobby serverless cap; future Node functions would need consolidation. | Migrate `api/inflation.js` to Edge (~30 min) when Sprint 4 needs a slot. |
| L8 | Vendor concentration: Twelve Data, Marketaux are single-vendor with free tiers. | Build adapter pattern when adding a second source. |
| L9 | Module load-order hand-coded across ~25 HTML files. | Future: `js/pfc-bootstrap.js` single-source-of-truth loader. |
| L10 | No unit tests on `_computeCpiYoY`, `_validateNewsContext`, ticker maps. | Add Vitest in Sprint 4. |
| L11 | LS/SS key registry — no central inventory of `pfc_*` keys. | Future: `pfc-storage-keys.js` + GC on sign-out. |

---

## What the architecture got right (verbatim from architecture agent)

- Edge-first proxy pattern is the correct shape for free-tier-key APIs
- `PFCStorage` encrypt-with-sync-mirror design is genuinely clever and well-documented
- `pfc-user.js` central state hub correctly dodges auth-ready clobber via consumer-wrote-during-hydration merge
- Sage news-context double-validation (client + server `_validateNewsContext`) is exemplary defense-in-depth
- CSP `connect-src` was precisely allowlisted to specific upstreams
- Per-holding error attachment in `pfc-portfolio.js` is the right cell-level isolation pattern

---

## Stats

- **3 audit agents**, total ~1200 words of findings, ~50 distinct observations
- **5 critical + 4 medium fixes** applied this session
- **11 low-priority items** documented for future sessions
- **0 false-completion claims** — every fix verified via `node --check` + Playwright before commit
