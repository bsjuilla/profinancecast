# ProFinanceCast — Audit Synthesis & Ranked Implementation Queue
**Date:** 2026-05-21 · Synthesis over 8 specialist audits.

## 1. Executive Summary

ProFinanceCast ships at elite cadence (10.3 commits/active-day, MTTR ~4 min) but with a **48% change-failure rate** — paying for speed in fix-forward commits. Visual story mostly there: net-worth (5/5 voice, 21/25 UX) and debt-optimizer (25/25) prove the brand can sing. The trouble is a thin layer of structural debris on a sound design system: keyboard-walk audit token, HttpOnly-false cookie ready for XSS exfiltration, integration script living **outside** the deployed repo, two-tier copy quality (app pages still read like a Notion template), ~54 empty zones from the photo-shrink. None catastrophic — but together they make the site feel like a cathedral with construction tape on the doors.

**Wave 1 closes the security gap, ends bus-factor risk, fixes 3 reviewer bugs, and turns the worst voice/UX breaks (onboarding 9/25, recurring 9/25, debt-optimizer emoji) into wins.** Wave 2 deploys the animation library, fills empty zones with Pattern-A italic captions, generates 12 new MJ prompts, lands visual-regression CI. Wave 3 is SSG, AVIF, JWT.

## 2. WAVE 1 — P0 (~2.5 dev-days)

| # | Item | File(s) | Edit | Effort | Sources |
|---|---|---|---|---|---|
| 1 | **Rotate AUDIT_BYPASS token** | Vercel env + scripts/screenshot-photos.py | `openssl rand -hex 32` → Vercel env var; remove hardcoded literal from screenshot script, read from os.environ | 30m | Sec HIGH + VPE #6 |
| 2 | **Fix `_safeEqual` length-oracle leak** | api/audit-login.js:37-38 | Replace early-exit with XOR-accumulated `diff` over `max(a.length,b.length)` | 15m | Sec HIGH-2 |
| 3 | **Split audit cookie (HttpOnly + JS-flag)** | api/audit-login.js + js/pfc-audit-mode.js | `pfc_audit_session=<nonce>` HttpOnly; new `pfc_audit_mode_active=1` for JS detection | 1h | Sec HIGH-1 |
| 4 | **Stop LS overwrite in audit-mode** | js/pfc-audit-mode.js:66-67 | Guard each setItem with `if (!localStorage.getItem(KEY))` | 15m | Sec MED-4 |
| 5 | **Move integrate-photos.js into deployed repo** | scripts/integrate-photos.js → profinancecast/scripts/ + README | Move + document SLOTS table + 7 insertion modes | 2h | VPE #1 (bus-factor CRITICAL) |
| 6 | **Reviewer Bug 1 — `height:100%` → `height:auto`** | css/pfc-photos.css:96 | **DONE — verify in next Vercel deploy** | 0 | Reviewer Bug 1 |
| 7 | **Reviewer Bug 2 — explicit max-width on is-tall** | css/pfc-photos.css:75 | **DONE — verify** | 0 | Reviewer Bug 2 |
| 8 | **Reviewer Bug 3 — tools/*.html `?v=2`** | tools/take-home-pay.html, tools/debt-strategy.html | **DONE — verify** | 0 | Reviewer Bug 3 |
| 9 | **Verify Vercel `/tools/*` rewrites** | vercel.json | Add rewrite for clean URLs if missing; confirm both `.html` + clean resolve | 30m | CPO #1 |
| 10 | **Verify zero-data photo renders on real new account** | onboarding/report-card/sage | Files exist on disk. Test true zero-data user (not audit-mode SAMPLE_USER) | 1h | CPO + Empty-Zone P0 #1-4 |
| 11 | **Kill emoji in debt-optimizer strategy buttons** | debt-optimizer.html | 🔥→`OPTIMAL` (amber), ⚡→`PROVEN` (teal), JetBrains Mono small-caps | 20m | CMO #4 |
| 12 | **"You're all set!" → "The ledger is open."** | onboarding (completion step) | Direct rewrite | 5m | CMO #1 |
| 13 | **"No debts added yet" → "The ledger is clear."** | debt-optimizer.html empty-state | Direct rewrite | 5m | CMO #2 |
| 14 | **Sentry/Supabase blocking-script `defer`** | auth.html:568, about/settings/take-home-pay + ~20 pages with Supabase CDN | Add `defer` attribute | 30m | A11y/Perf #2+#7 |
| 15 | **`fetchpriority="high"` + `loading="eager"` on LCP** | index/dashboard/journal/about/help | First above-fold `<img>` per page | 30m | Perf #1 |
| 16 | **focus-visible ring on inline-styled buttons** | css/pfc-app.css + dashboard/scenarios/goals | New `.btn-inline:focus-visible { outline:2px solid var(--gold); outline-offset:2px }` | 1h | A11y #5 (HIGH) |
| 17 | **`<label for="forgot-email">` fix** | auth.html:770-771 | Add for= attr | 2m | A11y #1 (HIGH) |

**Wave 1 total: ~7 h wall-clock, 2-3 sessions.**

## 3. WAVE 2 — P1 (next sprint, ~4-6 dev-days)

| # | Item | Notes |
|---|---|---|
| 1 | Deploy `pfc-anim.css` + `pfc-anim.js` | All 10 animations ready. Doc at `audits/2026-05-21-anim-library.md` |
| 2 | Voice rewrites — remaining CMO top-10 (lines 3, 5-10) | recurring, portfolio, goals, history, scenarios |
| 3 | Codify `docs/STYLE-GUIDE.md` (3 rules) | Eyebrow Mandate · Empty-State Register · Emoji Prohibition |
| 4 | Add missing eyebrows on 5 pages | debt-optimizer, portfolio, report-card, history, cash-forecast |
| 5 | Generate 12 new MJ prompts → WebP | Highest impact: E3 (report-card cert), E1 (savings beaker), E12 (auth success keepsake) |
| 6 | Empty-zone Pattern A — Fraunces italic captions below 480px heroes | 11 pages (net-worth + 7 blogs + journal/help/about/scenarios) |
| 7 | Empty-zone Pattern B — caption/SVG rule right of 320px Pro photos | portfolio, goals, debt-optimizer, salary-calc, recurring |
| 8 | Zero-state placeholder rule (CPO Move 1) | recurring skeleton, goals ghost-card, portfolio placeholder donut, history faded row |
| 9 | Move auth.html onclick → addEventListener | Prep for tightening CSP script-src-attr |
| 10 | Tighten CSP `script-src-attr 'none'` | After #9 + programmatic font-loader replacement |
| 11 | Two-step audit-login redirect (no token in Referer) | Validate → `/api/audit-login?_ok=1` → `/` |
| 12 | Vercel KV nonce revocation list | 24h TTL; individual session revoke |
| 13 | Notifications dot a11y | `<span role="status" aria-label="N new">` |
| 14 | `aria-hidden="true"` on decorative SVGs + atmospheric photos | Stops AT announcing ornament |
| 15 | Self-host or preload Fraunces 600 italic + Inter Tight 400 | 150-300ms FCP gain |
| 16 | AVIF siblings for 4 photos >200 KB | ~400 KB savings (~8% bundle) |
| 17 | scripts/apply-to-all.js regex tool | Short-term mitigation until SSG |
| 18 | Idempotency snapshot test for integrate-photos.js + cheerio rewrite | Removes "one unbalanced div = silent corruption" risk |
| 19 | Branch protection on main (even solo) | Forces PR review |
| 20 | **Visual-regression CI** via Playwright + pixelmatch | **VPE's "ONE refactor"** — 1-2d; attacks 48% CFR |
| 21 | Content-hash cache-bust OR Cache-Control on /css/ | Ends ?v=N treadmill |
| 22 | Rate-limit `/api/audit-login` (5/IP/5min) | Defense-in-depth |
| 23 | `docs/photo-classes.md` taxonomy | Bus-factor mitigation |
| 24 | `docs/runbooks/vercel-rollback.md` | 30m; incident-response runbook |

## 4. WAVE 3 — P2 (polish, next quarter)

- SSG migration (Eleventy/Astro) when HTML count >50 or contractor joins
- Short-lived signed JWTs (1h + `jti`) for audit sessions
- AVIF for entire 41-image bundle
- `no-unsanitized/property` ESLint + audit 117 innerHTML sinks
- Bump `--ink-2` contrast to ≥4.6:1 OR restrict to ≥18px text
- `aria-labelledby` figures→headings semantics
- `X-PFC-Audit: true` response header
- Below-fold image audit for "3 above-fold" perf rule
- Bento talisman → inline SVG + requestIdleCallback photo swap
- Drop redundant `<section aria-label>` duplicating `<figcaption>`
- Recompress photos one tier (Q75) after AVIF ships
- SLO + error budget + structured logging in Vercel functions
- SRI on third-party `<link>`/`<script>`

## 5. Today vs. Tomorrow

**Day 1 (~3h, all independent ≤30 min edits, low blast radius):**
- #1 Rotate AUDIT_BYPASS token
- #2 _safeEqual fix
- #4 LS overwrite guard
- #6, #7 Already done — verify
- #8 Already done — verify
- #9 Vercel /tools/* rewrites
- #11 Debt-optimizer emoji → JetBrains badges
- #12, #13 Voice rewrites
- #17 label for= fix

**Day 2 (~4h, multi-file + manual verification):**
- #3 Split audit cookie HttpOnly + JS-flag
- #5 Move integrate-photos.js into repo + README
- #10 Verify zero-data state on real new account
- #14, #15, #16 Sentry defer + LCP fetchpriority + focus-visible (batched)

## 6. Push-back — Where Audits Over-Prescribed

- **CPO's "tools/*.html 0/25 — 404"** — NOT 404. Bug 3 cache-bust (already fixed) is the real cause. Wave 1 #8 is verify-only.
- **Empty-Zone "4 missing photo files"** — NOT missing. All four exist (137-268 KB on disk). They render 0×0 in audit mode because SAMPLE_USER has data and they're conditional zero-state renders. Don't regenerate.
- **VPE's "visual-regression CI THIS sprint"** — Wave 2, not Wave 1. CFR is real but baselining before security/integrate-photos fix means baselining a half-broken cookie.
- **Sec LOW-6 rate-limit now** — Defense-in-depth, not urgent. 26-char token brute-force is impractical even unrate-limited. Wave 2.
- **CMO "Pro shimmer per badge"** — Animation library Wave 2 handles this. Don't hand-roll.
- **A11y `--ink-2` contrast bump** — Site-wide token change with redesign blast radius. Wave 3 after proper contrast audit.
- **VPE full SSG migration** — VPE themselves says defer. Wave 3 only.
