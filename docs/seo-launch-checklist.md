# SEO Launch Checklist — Phase 2 Tools

After the phase-2 SEO funnel tools land on production, these are the steps that move the 45 new pages from "deployed" to "indexed and ranking". Most of it is one-time setup that you run in a browser — 15 minutes total.

---

## 1. Google Search Console — sitemap submission

**Time:** 3 minutes
**Why:** Tells Google there are 45 new URLs. Without this, Google finds them slowly via internal-link discovery (days to weeks).

Steps:

1. Open https://search.google.com/search-console
2. Select the `profinancecast.com` property (if not yet verified, see step 5)
3. Left sidebar → **Sitemaps**
4. Under "Add a new sitemap", paste: `https://profinancecast.com/sitemap.xml`
5. Click **Submit**
6. Within 24 hours, the row should show **Status: Success** and **Discovered URLs: 62** (the post-phase-2 count). If it shows fewer, the sitemap fetched a cached older version — wait, then click the row → **See details** → resubmit.

**Verification query** (you can run this anytime to see indexed count):
```
site:profinancecast.com/tools
```
Expected: climbs from ~2 to ~45+ over the following 7-21 days.

---

## 2. Google Search Console — URL inspection on each global tool

**Time:** 6 minutes (1 minute × 5 tools + 1 each for tools/ index)
**Why:** Forces Google to crawl the 5 global pages immediately rather than waiting on the natural crawl schedule. Country variants get picked up via the hreflang matrix once the globals are indexed.

Steps for each URL below:

1. In GSC, paste the URL into the top search bar
2. Click **Test live URL**
3. Verify: "URL is available to Google" + schema.org valid (3 items: SoftwareApplication, BreadcrumbList, FAQPage) + mobile usability OK
4. Click **Request indexing** (the button at the right of the inspection result)
5. Wait ~10 seconds for confirmation

URLs to inspect:
- https://profinancecast.com/tools/
- https://profinancecast.com/tools/compound-interest
- https://profinancecast.com/tools/mortgage-affordability
- https://profinancecast.com/tools/fire-date
- https://profinancecast.com/tools/debt-strategy-compare
- https://profinancecast.com/tools/savings-rate

Note: GSC has a daily indexing-request quota (~10 per day). The 6 above fit. The 40 country variants will get crawled organically over the following week via the hreflang signals.

---

## 3. Bing Webmaster Tools

**Time:** 3 minutes
**Why:** Bing + DuckDuckGo (which uses Bing's index) give you 5-10% additional organic traffic if your audience is US/UK. Free, low effort.

Steps:

1. Open https://www.bing.com/webmasters
2. If profinancecast.com is not yet added: **Add site** → paste URL → verify via meta tag or DNS (DNS easiest, same as Google verification)
3. Once verified → left sidebar → **Sitemaps**
4. **Submit sitemap** → `https://profinancecast.com/sitemap.xml`
5. Left sidebar → **URL inspection** → paste each of the 6 URLs from step 2 → **Submit URL** for each

---

## 4. Schema.org validation (final sanity)

**Time:** 2 minutes
**Why:** GSC's URL inspector validates schema, but the standalone validator gives richer error output.

Steps:

1. Open https://validator.schema.org
2. Paste `https://profinancecast.com/tools/compound-interest` → **Run test**
3. Expected: 0 errors, 0 warnings. Three items detected: `SoftwareApplication`, `BreadcrumbList`, `FAQPage`
4. Repeat for 1 country variant: `https://profinancecast.com/tools/compound-interest/uk` — the country variant should show position 4 in `BreadcrumbList` (the country page) and `priceCurrency: GBP` on the `SoftwareApplication`

If errors appear, see [lighthouse-audit-checklist.md](./lighthouse-audit-checklist.md) for the remediation playbook.

---

## 5. Set up GSC if you haven't already

**Time:** 5 minutes one-time
**Why:** Steps 1-2 above require an active GSC property.

1. Open https://search.google.com/search-console → **Add property**
2. Choose **Domain** property type → paste `profinancecast.com`
3. Verify via DNS TXT record (Cloudflare → DNS → Add record → TXT type → name `@`, value from GSC)
4. Wait 5-10 minutes for DNS propagation → click **Verify**

---

## 6. Watch the first 14 days

The signals that tell you Phase 2 is working:

| Metric | Where to check | First-week expectation | 14-day expectation |
|---|---|---|---|
| URLs indexed | GSC → Coverage | 6-10 of 45 | 30-45 of 45 |
| Impressions on tool URLs | GSC → Performance → Pages → filter `/tools/` | 50-500 | 1,000-5,000 |
| Plausible `tool_view` events | Plausible dashboard → Custom events | tracks pageviews | trending up if SEO is working |
| Plausible `tool_compute` events | Plausible dashboard | should be 30-60% of tool_view | indicates engagement |
| Plausible `cta_signup_click` events | Plausible dashboard | start small | 2-8% of tool_view if positioning is right |

If `cta_signup_click ÷ tool_view < 1%` after 14 days, the CTA copy or position needs A/B testing — see `marketing-skills:page-cro`.

---

## When something looks wrong

**"URL is not on Google" in GSC inspection:** The page was crawled but flagged. Click **Page indexing** in the inspection result to see why. Most common cause: a stale `noindex` meta tag (none of the phase-2 pages should have one — verify with `view-source` for `<meta name="robots" content="index,follow">`).

**Schema.org validator shows warnings:** Most "warnings" are advisory (e.g. "consider adding aggregateRating"). They do not block indexing.

**Sitemap shows fewer URLs than 62:** Check that `https://profinancecast.com/sitemap.xml` returns 200 (not 404) and that the file contains all 62 `<url>` blocks. Vercel sometimes caches old sitemaps for up to 24 hours.
