# VPE Tech-Debt + Throughput Audit — 2026-05-21

## Bottom line
Ship fast (227 commits / 22 active days = 10.3/day) but without safety rails. **Change failure rate ~48%** (73 fix commits / 151 feat+fix commits). Pattern: ship, watch what breaks, fix forward. Works at n=1; explodes the moment a contractor joins.

## DORA proxy metrics

| Metric | Measurement | Verdict |
|---|---|---|
| Deployment frequency | 10.3/active-day | **Elite** |
| Lead time | 60-120s commit→prod | Elite latency, Low rigor |
| MTTR | ~4min on Sage FUNCTION_INVOCATION_FAILED | **Elite** |
| Change failure rate | ~48% | **Low / failing** (Elite is ≤15%) |

The photo refactor alone took 4 commits (e1d35e0 → a7d2921 → c017bb3 → c535df7), 3 of them follow-on fixes within 90 min.

## Top 10 tech-debt items

| # | Item | Cost | Fix effort |
|---|---|---|---|
| 1 | **integrate-photos.js lives outside the deployed repo** (`scripts/` is at C:\Users\Nitin\profinancecast-audit\scripts\). Future contributors can't see how images are integrated. SLOTS table is the source of truth and it's invisible. | **High** (silent loss of memory) | 2h: move into `profinancecast/scripts/` + README |
| 2 | **`!important` on 6 photo selectors** to override HTML width/height attrs the script itself emits | Med | 1h: emit `style="aspect-ratio:..."` instead of width/height, drop !important |
| 3 | **Manual `?v=2` cache-bust on 27 files** | Med (guaranteed churn) | 3h: switch to hashed filenames or Cache-Control header |
| 4 | **27 HTML files manually edited rather than templated** | Very High (compounds every sprint) | High (SSG migration); short-term: `scripts/apply-to-all.js` regex tool |
| 5 | **No SRI on new `<link>` tags** | Low | 30min |
| 6 | **`screenshot-photos.py` hardcodes AUDIT token** in plaintext, in git | **High if repo leaks** | 30min: env var + rotate |
| 7 | **Screenshots taken but never compared** — no visual-regression | High (visual QA is manual) | 1d: pixelmatch against golden set |
| 8 | width/height HTML attrs are natural-image dims, then CSS overrides via max-width — wrong mental model | Low CLS, high cost | covered by #2 |
| 9 | integrate-photos.js has **5 string-parsing position modes** — one unbalanced `<div>` and silent corruption | Med | 1d: switch to node-html-parser/cheerio |
| 10 | No idempotency test for integrate-photos.js | Med | 2h: snapshot test |

## Production discipline gaps
- No CI gate (Vercel build = syntax check only)
- No PR review (4 recent PRs self-merged in minutes)
- No rollback runbook
- No SLO / error budget
- No visual-regression in CI
- CSP is excellent (don't lose this)
- `Cache-Control` on /js/ but not /css/ (that's why ?v=2 is needed)
- No structured logging / trace IDs in Vercel functions

## THE ONE refactor for next sprint

**Add Playwright visual-regression to a pre-deploy GitHub Action.**

Not SSG. Not partials. 1-2 days. Directly attacks the 48% change-failure rate.

**Why over alternatives:**
| Option | Effort | Pain prevented |
|---|---|---|
| **Visual-regression CI** | 1-2d | Exactly the failure mode of this sprint: 3 follow-on commits to fix layout we couldn't see in terminal |
| SSG (Eleventy/Astro) | 1-2 weeks | 27-file blast radius |
| Component partials | 3-5d | Some duplication |
| HTML parser in integrate-photos.js | 1d | Silent insertion bugs |

**Concrete 2-day plan:**
1. Repurpose `screenshot-photos.py` to capture baselines on main
2. Add pixelmatch or `playwright-test toHaveScreenshot`
3. GitHub Action: spin up Vercel preview → screenshot 26 pages → diff against baselines → block merge on >0.5% pixel diff
4. Update baselines via `[update-snapshots]` commit flag

**Acceptance test:** re-run this sprint's history. The `c017bb3` height-override commit should have been auto-caught before deploy.

## Bus-factor risks

| Risk | Severity | Mitigation |
|---|---|---|
| integrate-photos.js outside repo | **Critical** | Move into profinancecast/scripts/ this week |
| 7-mode insertion parser, zero tests | High | Snapshot test per mode (3h) |
| Photo class taxonomy undocumented | Med | `docs/photo-classes.md` (30min) |
| AUDIT_BYPASS token hardcoded in screenshot-photos.py | High | Env var + rotate (30min) |
| No vintage-ledger brief link from README | Med | docs/README.md index (20min) |
| Self-merging PRs in minutes | Med (future) | Enable branch protection on main NOW, even solo |
| No incident-response runbook | Med | docs/runbooks/vercel-rollback.md (30min) |

## Three founder decisions
1. **Spend 2 days on visual-regression CI?** VPE rec: **yes**. The math says you're already eating those 2 days monthly in fix-forward commits.
2. **Move integrate-photos.js into deployed repo this week?** VPE rec: **yes, non-negotiable**, 2h.
3. **SSG migration this quarter or next?** VPE rec: **defer**. Re-evaluate when HTML file count crosses 50 or when you hire help.
