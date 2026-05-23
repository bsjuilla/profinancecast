# ProFinanceCast landing-page deep audit — 2026-05-23

**Auditor:** Claude Opus 4.7 (1M context) coordinating five parallel general-purpose lens agents + ruflo SAST.
**Scope:** `index.html` (2472 lines), 13 inline JS modules (`js/inline/index-*.js`, ~24.9 KB total), supporting CSS (`pfc-tokens.css`, `pfc-photos.css`, `pfc-reskin.css`, `pfc-fonts.css`, `pfc-rhythm.css`, `pfc-app.css`), `llms.txt`, `robots.txt`, `feed.xml`, `vercel.json`, `sitemap.xml`, plus cross-checks against `billing.html`, `about.html`, and `pricing.md`.
**Method:** Five independent lens agents (security / design / SEO / CRO+copy / perf+a11y) read evidence in parallel; ruflo SAST scan run concurrently. Each agent reported findings without seeing any other agent's report. This synthesis attributes findings back to the agent that surfaced them; where two lenses found the same root cause independently, that's noted (and confidence is correspondingly higher).
**Honesty note:** an earlier draft of this document was written before four of the five agents finished. That draft mixed real evidence with extrapolation. This version is rebuilt from the actual lens-agent reports; their full text is preserved in the chat transcript above this document.

---

## TL;DR

Three themes, validated by multiple lenses independently:

1. **Cross-document contradictions are the launch-blocker class** — refund window (14 vs 30 days), pricing currency (€ vs $), tier count (3 visible vs 4 in JSON-LD vs 4 in billing.html), Founders seat cap (100 vs 500), year-of-forecast (2030 vs 2036), and even free-tier currency in schema (USD when everything else is EUR) all disagree across `index.html`, `billing.html`, `terms.html`, `pricing.md`, `llms.txt`, and the JSON-LD schema blocks. Found independently by SEO, CRO+copy, and design lenses. **Single highest-impact area to fix.**

2. **Hero has three competing primary CTAs and one of them is a no-op** — "Start your free forecast" (emerald primary), "Try the live demo" (gold outline, scroll-anchors to a demo already visible 400px to the right), "Join the waitlist" (gold outline + pre-launch chip). Found independently by CRO and design lenses. Both also flagged the demo widget showing USD while pricing shows EUR — the central interactive element on the page lies about the visitor's currency.

3. **The font loader is silently broken** — every Fraunces italic weight (400/500/600) maps to the same `fraunces-400-italic.woff2`; every non-italic to `fraunces-400.woff2`; every Inter Tight weight to `inter-tight-300.woff2`. The browser synthesises bold over the wrong file. The entire "editorial typography" premise of the brand renders as synthetic bold on serif display type. Single largest visual-quality win available per hour invested. Found only by the design agent (security and CRO wouldn't catch this).

**Security posture is materially better than the rest of the codebase** (security agent verdict: 0 Critical / 0 High / 1 Medium / 2 Low / 4 Info). Zero inline event handlers, zero XSS sinks fed by user input, zero target=_blank, zero forms, zero iframes. The only real issues are SRI gaps on three auto-rotating CDN vendors (Sentry / Cloudflare Insights / Plausible) — operationally hard to fix without self-hosting them.

**Performance is mediocre on Slow 3G** — perf agent estimates 8-12 second TTI mostly because of 7 synchronous render-blocking scripts in `<head>` and a mobile LCP image marked `loading="lazy"` despite being above the fold.

**Accessibility passes most categories but fails WCAG 2.1 AA in two specific spots** — range slider labels lack `for=` association, and `--ink-3` text colour is 4.34:1 contrast against the canvas (needs ≥4.5:1).

---

## What's working well (keep doing this)

Things multiple lenses called out as genuinely strong — don't break these in any rewrite:

- **Design tokens system is excellent** (design agent): three-tier ink scale, semantic money/gold/warning/sage colors, 1.25 modular type scale, dual spacing ladders, explicit "gold-budget" documentation at `index.html:140-145`. Most teams don't even know gold-budget is a thing.
- **Roman-numeral chapter indices, Fraunces italic ledes, vintage-ledger photography** (design): genuinely fresh visual register for the category.
- **Live in-hero forecast widget** (design + CRO): rare. Most fintech landing pages put the widget below the fold.
- **Security hygiene is real** (security): CSP excludes `'unsafe-inline'` and `'unsafe-eval'` for scripts, `script-src-attr 'none'` blocks inline handlers, `frame-ancestors 'none'` blocks clickjacking. The `api/og.js` endpoint correctly length-caps and type-coerces URL params before passing to Satori.
- **SRI is established on the static-versioned libraries** (security): supabase-js, GSAP, ScrollTrigger all have `integrity="sha384-..."`. The gap is specifically on the auto-rotating analytics/error vendors.
- **JSON-LD schema discipline** (SEO): three rich blocks (WebApplication, FAQPage, HowTo) — strong AI-search foundation when the data isn't contradicting itself.
- **`llms.txt` exists** (SEO): well-structured, has quotable stats, explicit "what we are not" framing. The contradiction with billing.html is fixable; the foundation is right.
- **`<h1>` discipline** (a11y + SEO): one h1, semantic `<section aria-labelledby="hero-headline">`, structural HTML clean.
- **All 9 `<img>` tags have descriptive alt text** (a11y): not "image"/"photo".
- **`prefers-reduced-motion: reduce` respected globally** (a11y): `pfc-tokens.css:264` zeros all motion tokens, plus 7 component-level guards.
- **Skip-to-content link as first interactive element** (a11y): present.
- **No source-map leakage, no exposed internal endpoints, no PII in localStorage** (security): only sticky-CTA dismissal timestamp + counter — non-sensitive.

---

## P0 — Fix before launch

### CONTRADICT-1 — Refund window says 14 days OR 30 days depending on the page
**Found by:** SEO (AI-2), CRO (CRO-2), copy (COPY-N spillover)
**Evidence:** index.html says **30 days** at lines 2134, 2240, 2297, 2301, 2348 (including in the FAQ JSON-LD answer). billing.html says **14 days** at lines 1181, 1245, 1270, 1368, 1383, 1384, 1403, 1472. The Founders waiver checkbox at billing.html:1301 explicitly references the "14-day refund window." terms.html § 7a/7b (just shipped in commit `6c44ce0`) establishes 14 days.
**Why it matters:** A buyer reading both pages sees different refund promises at the exact moment they decide to pay. Refund-window mismatches are also one of the top reasons Stripe/PayPal disputes auto-found for the customer. The FAQ JSON-LD is the worst offender because Google may surface it as a rich-result snippet that contradicts the actual billing page.
**Fix:** Pick **14 days** (matches just-shipped terms.html + matches billing.html + matches EU CRD minimum). Search-replace "30 days" / "thirty-day" / "thirty days" / "30-day" in `index.html`. Rebuild the affected FAQ JSON-LD answer.

### CONTRADICT-2 — Pricing data lies across six surfaces
**Found by:** SEO (AI-1), CRO (CRO-3), copy (COPY-9)
**Evidence:**
- `index.html` JSON-LD `WebApplication.offers` (lines 62-68): Free + Pro €9/€79 + **Premium €19/€169** + Founders €149 — *five tiers*
- `index.html` visible pricing cards: Free + Pro + Founders — *three tiers, Premium hidden*
- `index.html` JSON-LD Free offer (`priceCurrency: USD`) vs all other tiers (`EUR`)
- `index.html` headline above pricing: "Three tiers. One product." — literally false vs the JSON-LD
- `billing.html` visible pricing: Free + Pro €9/€79 + **Premium €19/€169** + Founders €149/100 seats — *four tiers*
- `billing.html` OG description: "$9/month or $69/year" — contradicts its own page body
- `llms.txt:3,22,23,72`: Pro **$9/mo or $69/yr**, Founders **$149 / 500 seats** — wrong currency, wrong annual price, wrong seat count
- `pricing.md` table: matches billing.html
- `pricing.md` prose paragraph (lines 32-34): Founders **500 seats** and **$149** — contradicts its own table

**Why it matters:** LLMs (ChatGPT, Perplexity, Claude) asked "how much is ProFinanceCast Pro?" will roll a die — they cite whichever document they indexed first or most-confidently. The Google-penalty risk on the schema-vs-visible mismatch is real (Google explicitly penalises rich-result markup that includes items not visible on the page).
**Fix:**
1. Decide: is Premium a real public tier (it IS in production code) or staff/beta-only?
   - If real: add Premium card to landing pricing section.
   - If beta: remove from JSON-LD until launched.
2. Rewrite `llms.txt`: `$9` → `€9`, `$69/yr` → `€79/yr`, `500 seats` → `100 seats`. Both lines 3 AND 22-23 AND 72.
3. Fix `pricing.md` prose paragraph to match its own table.
4. Fix the JSON-LD Free offer to say `EUR` (or omit `priceCurrency` since price=0).
5. **Strategic recommendation:** create `data/pricing.json` (or `js/pfc-pricing-constants.js`) as a single source of truth, and document a build/checklist invariant: "pricing must match across `index.html` visible cards + JSON-LD + `llms.txt` + `billing.html` + `terms.html` + `pricing.md`."

### CONTRADICT-3 — Year of forecast: 2030 in OG card vs 2036 in H1
**Found by:** Design (DES-7), copy (COPY-10)
**Evidence:** `index.html:9-22` OG title/meta description says *"…in 2030."* `index.html:1635, 1638` live H1+subhead says *"…in 2036."* HowTo schema says "next ten years." Today is 2026-05-23, so 2036 is correct. Anyone sharing the URL to Slack/LinkedIn/X gets a 6-year-stale unfurl.
**Fix:** Update OG title, OG description, Twitter description, and meta description to **2036**. Either hardcode and review annually (set a calendar reminder for May 2027) or generate the year via build step.

### COPY-9 / CRO-1 — Hero has three CTAs of similar weight; one is a no-op
**Found by:** CRO (CRO-1), design (DES-3), copy (COPY-5)
**Evidence:** Hero ships:
1. `btn-primary btn-lg` "Start your free forecast" (emerald) → `auth.html`
2. `btn-outline btn-lg` "Try the live demo — no signup" (gold) → `#demo` (which is **already in the same viewport** 400px to the right)
3. `btn-outline btn-lg` "Join the waitlist — 100 Founders seats" (gold + Pre-launch chip) → `waitlist.html`

The waitlist CTA also contradicts the entire pitch — the product is live (Free is available), so "join a waitlist" reads as misleading.
**Fix:** Drop the "Try the live demo" button entirely (demo is in-frame). Move "Join the waitlist" out of the hero — make it an inline gold underlined link in the trust row ("…or join the 100-seat Founders waitlist →"), or place it next to the Founders Lifetime card in the pricing section.
**Estimated lift (CRO agent):** +8-15% hero CTA click-through.

### COPY-1 — Hero H1 is hedge-led
**Found by:** CRO+copy (COPY-1), design noted indirectly
**Current:** `"What your money looks like in 2036 — not advice, just math you can verify."` (`index.html:1635`)
**Issue:** "Not advice, just math you can verify" is regulator-mode disclaimer parked in the hero. Teaches the reader to distrust the page before benefit lands. Doubled by the FAQ entry at line 2312 ("Is this tax or investment advice?") and again in the footer disclaimer at lines 2396-2401 — same message asserted three times on one page.
**Proposed (CRO agent):** `"See your net worth in 2036. Without a bank password."` Keeps the year anchor (concrete, time-bound), names the JTBD ("net worth"), and front-loads the differentiator the rest of the page already leans on (no bank login). Move "not advice" framing to the footer where it already lives.

### DES-2 — Font loader is broken: every weight points to the 400 file
**Found by:** Design (DES-2)
**Evidence:** `css/pfc-fonts.css:18-128` declares `Fraunces` italic at weights 400, 500, 600 — all pointing at `fraunces-400-italic.woff2`. Non-italic Fraunces at 400/500/600/700 — all pointing at `fraunces-400.woff2`. Inter Tight at 300-700 — all pointing at `inter-tight-300.woff2`. JetBrains Mono at 400/500/600 — all pointing at `jetbrains-mono-400.woff2`.
**Why it matters:** When CSS calls `font-weight: 500` or `600`, the browser falls back to **synthetic bold** over the 400-weight file. Synthetic bold on a serif display face (Fraunces) looks muddy — kills the editorial register the brand depends on. `font-variation-settings: "wght" 480` rules (e.g., line 1027) silently do nothing.
**Fix:** Either ship the missing weight files (Fraunces 500, 600; Inter Tight 400, 500, 600; JetBrains Mono 500 — ~30 KB total deltas), OR switch to variable-axis WOFF2 (`fraunces-vf.woff2` + `inter-tight-vf.woff2`) and use `font-variation-settings`. **Single largest visual-quality upgrade per hour invested.**

### DES-4 / COPY-2 — Demo widget hardcoded USD; pricing is EUR
**Found by:** Design (DES-4), copy (COPY-2)
**Evidence:** Hero forecast widget says `$5,000`, `$8,000`, `$5,000`, projects `$17,000`, `+$12,000` (`index.html:1686, 1694, 1698, 1707-1708, 1715`). Pricing cards say `€0`, `€9`, `€79`, `€149`. Step 02 SVG axis labels (`index.html:1857-1859`) read `$30k / $20k / $10k` while the **Y-axis title** one line above (`:1851`) reads `€/mo`. Step 01 form shows `Country = Portugal` but `Currency = USD · $` (`:1808-1813`) — would never happen for a real Portuguese visitor. The codebase ALREADY imports `js/pfc-currency.js` (`:264`) for locale-aware formatting on every other page; the hero ignores it.
**Why it matters:** The central interactive element on the page lies about the visitor's currency. For a product whose pitch is "math you can verify," mixed currency reads as sloppy.
**Fix:** Wire `PFCCurrency.detect()` at boot. Default EUR for `Accept-Language: pt-*, fr-*, de-*, es-*, it-*, en-IE`, GBP for `en-GB`, USD for `en-US/en-CA/en-AU`. Replace literal `'$'` at `js/inline/index-5.js:87` with `PFCCurrency.symbol()`. Repaint Step 02 SVG axis labels via templated text.

### PERF-1 — Seven synchronous render-blocking scripts in `<head>`
**Found by:** Perf+a11y agent (PERF-1)
**File:** `index.html:259-266`
**Evidence:** `@supabase/supabase-js` (~120 KB) + `pfc-config/auth/crypto/storage/currency/user/entitlements.js` all loaded without `defer` or `async`. Parser blocks on each. Slow 3G TTI estimate: 8-12s, with these scripts dominating the budget.
**Fix:** Add `defer` to all 8 tags. `defer` preserves load order. None are needed for the inlined critical CSS to render the hero — Supabase becomes relevant only when the user clicks Start. **Single largest perf win available, ~1.5-3s saved on Slow 3G.**

### PERF-2 — Mobile LCP image is `loading="lazy"`
**Found by:** Perf+a11y agent (PERF-2)
**File:** `index.html:1668-1672`
**Evidence:** `coastal-window.webp` (58 KB) is the mobile hero (visible at <980px) yet marked `loading="lazy" decoding="async"`. Lazy-loading an above-the-fold LCP image costs 300-800ms on mobile.
**Fix:** Remove `loading="lazy"`. Add `fetchpriority="high"`. Add `<link rel="preload" as="image" href="assets/img/photos/coastal-window.webp" media="(max-width: 980px)">` in `<head>`.

### A11Y-1 — Range slider inputs not programmatically labelled (WCAG 1.3.1/4.1.2)
**Found by:** Perf+a11y agent (A11Y-1)
**File:** `index.html:1686-1699`
**Evidence:** `<label>Monthly take-home <span id="v-income">$5,000</span></label>` wraps the visible value but contains no `for=` attribute and no nested `<input>`. NVDA / VoiceOver may announce "slider, 5000" with no name.
**Fix:** Add `for="s-income"` etc. to each label, or restructure so `<input>` lives inside `<label>`. Add `aria-valuetext` so the announced value includes the unit.

---

## P1 — Fix before the page does real volume

### CONTRADICT-4 — Founders seat counter is static on landing but FAQ promises it's live
**Found by:** Design (DES-8), CRO (CRO-4)
**Evidence:** `index.html:2182` ships text *"Limited — 100 seats · closes day 30"* as **static** HTML in gold. The FAQ entry at `:2321` explicitly promises *"The seat counter on the pricing page is the live source of truth — it polls the same PayPal webhook."* The live `/api/founders-claimed` poller exists in `billing.html:1288` but is not wired on the homepage.
**Fix:** Wire `data-founders-counter` on the homepage to the same `/api/founders-claimed` endpoint billing.html uses. Borrow the working code at `js/inline/billing-2.js:792-834` (`refreshFoundersCount`). Render the placeholder in `--ink-3` muted color; only swap to gold once the live count resolves (DES-8).
**Estimated lift (CRO agent):** +10-20% on Founders tier sell-through.

### CRO-5 / CRO-6 — Zero social proof; anonymous founder
**Found by:** CRO (CRO-5, CRO-6)
**Evidence:** No testimonials, no user count, no press logos, no Trustpilot/G2, no founder photo, no team bio, no LinkedIn link. `about.html:157` says *"built by independent professionals in Europe"*. `billing.html:1404` uses `founder@profinancecast.com` mailto — there's a mailbox, just no human attached. The "credibility strip" at `index.html:1744` is product-truth claims, not social proof.
**Why it matters:** For a personal-finance product asking for income data + €149 lifetime purchases, no face is the single biggest trust hole. Anonymous-by-design CAN be a brand choice (Linear-style restraint) but then it needs to be SAID, not left as an absence.
**Fix:** Add a small founder block to the CTA strip or footer (portrait + first name + city + one-line credential + mailto). OR be explicit: *"Built deliberately small and anonymous — here's why →"* linking to a manifesto page.
**Estimated lift (CRO agent):** +3-8% baseline; larger on Founders tier.

### DES-1 — Gold token budget violated 2x
**Found by:** Design (DES-1)
**Evidence:** The critical-CSS comment at `index.html:140-145` documents the rule: *"champagne gold (#D4AF6A) is reserved for AT MOST 4 surfaces per viewport"* and enumerates 4 canonical slots. Actual count in the above-fold viewport: ~8-10 gold surfaces (skip-link border, waitlist outline button + pre-launch badge, `.btn-outline` "Try the live demo", forecast widget end-dot + glow, section-divider hairline, nav PFC wordmark + diamond, scroll-progress bar). The author of the rule is the same author violating it.
**Fix:** Audit by viewport, demote in priority order. Quickest wins: strip the redundant inline `color/border-color: var(--gold)` on `.btn-outline` (the class rule already paints gold), demote `home-founders-counter` text from gold to `--ink-2`, change skip-link focus border to `--money`.

### DES-3 / CRO-1 cascade — Inline `style=""` proliferation (26 occurrences) defeats the token system
**Found by:** Design (DES-5)
**Files:** `index.html` — 26 inline `style=""` attributes, heaviest offenders at lines 1586, 1715, 2239, 2347, 2396-2397, 1659-1662.
**Evidence:** Same patterns repeat: `font-size:13px` (4×), `font-size:12px`, `margin-top:14px`, etc. Each one is re-stating a token that already exists.
**Fix:** Extract 3-4 utility classes (`.pfc-disclaimer-block`, `.pfc-period-suffix`, `.pfc-check-mark`, `.pfc-section-pad-sm`). Cuts ~120 lines of markup noise.

### DES-6 — Photo-card system defined but underused; bespoke per-element classes instead
**Found by:** Design (DES-6)
**Evidence:** `css/pfc-photos.css` defines 6 aspect-ratio buckets (`.pfc-photo-{band,hero,eyebrow,card,portrait,square}`). `index.html` uses canonical `.pfc-photo-band` once (hero ledger). Every other photo gets a bespoke class: `pfc-hero-mobile-pic`, `pfc-strip-banner`, `pfc-journal-masthead`, `pfc-cta-img`, `pfc-bento-img`, `pfc-step-img`, `pfc-gold-arrow-strip`. Each re-implements aspect-ratio / max-width / margin discipline the system already provides.
**Fix:** Migrate the seven bespoke classes to their canonical counterparts. Removes ~120 lines of duplicated CSS. Visual rhythm becomes consistent.

### SEO-1 / CRO-3 — Schema offers list Premium but landing page hides it
**Found by:** SEO (SEO-1), CRO (CRO-3)
**File:** `index.html:62-69` (schema) vs visible pricing
**Evidence:** WebApplication.offers includes Pro €9/€79 + Premium €19/€169 + Founders €149. Visible pricing grid shows Pro + Founders only. Google explicitly penalises rich-result markup with items absent from the page body.
**Fix:** Decide whether Premium is a real public tier (it is in `billing.html` and production code). If yes, add Premium card to landing pricing. If no, remove from JSON-LD.

### SEO-2 — Zero internal links from homepage to /tools/
**Found by:** SEO (SEO-2)
**Evidence:** `grep` finds 0 hrefs to `/tools/` in `index.html`. Five tool pages sit in `sitemap.xml` with high priority and are listed in `llms.txt`, but the homepage gives them zero link equity.
**Fix:** Add a "Free calculators" section above the FAQ, or a footer column with the 5 tool links. Even better: include a /tools/ link in the primary nav.

### SEO-3 / A11Y-3 — Heading hierarchy skip
**Found by:** SEO (SEO-3), perf+a11y (A11Y-3)
**WCAG:** 1.3.1 Info and Relationships
**Evidence:** 1 h1, 6 h2, 13 h3 — but several h3s sit under no h2 (e.g., bento feature cards). Footer headings are `<h4>` (`index.html:2371, 2379, 2387`) with no `<h3>` parent.
**Fix:** Promote orphan h3s to h2, OR wrap each parent section in an h2 first. Demote footer h4 to h3.

### A11Y-2 — Tertiary text contrast fails WCAG AA
**Found by:** Perf+a11y agent (A11Y-2)
**File:** `css/pfc-tokens.css:43` (`--ink-3: #6F7C75`)
**WCAG:** 1.4.3 Contrast (Minimum)
**Evidence:** `#6F7C75` on `--canvas` `#0B1410` = **4.34:1**. Needs ≥4.5:1 for normal-weight text under 18px. Used at 13px on `.trust-row` (`:440`), `.chart-controls p` (`:469`), captions throughout.
**Fix:** Darken `--ink-3` to ~`#8A988F` (≈5.4:1). One-line CSS change with broad propagation.

### A11Y-4 — `.btn` touch targets below 44×44 px (WCAG 2.5.8)
**Found by:** Perf+a11y agent (A11Y-4)
**File:** `index.html:352-358`
**Evidence:** `.btn` padding `10px 18px` on 14px text ≈ 36px tall — under 44px on mobile.
**Fix:** Add `min-height: 44px; min-width: 44px` to `.btn`. Increase footer link vertical padding to 8-10px.

### PERF-3 — Fonts CSS at end of `<head>`, no preload
**Found by:** Perf+a11y agent (PERF-3)
**File:** `index.html:1580`
**Evidence:** `pfc-fonts.css` loads after ~12 other resources. The 4 self-hosted woff2 files won't be discovered until after Supabase JS parses. FOUT will be long.
**Fix:** Move `<link rel="stylesheet" href="css/pfc-fonts.css">` to top of `<head>` right after token CSS. Add `<link rel="preload" as="font" type="font/woff2" crossorigin href="/assets/fonts/inter-tight-300.woff2">` for the two most-used faces.

### PERF-5 — Inline JS payload bloat
**Found by:** Perf+a11y agent (PERF-5)
**Evidence:** 13 inline files totalling **24,963 bytes**. `index-5.js` alone is 10,285 bytes (forecast widget). `index-3.js` (3,490 B) is OAuth callback only useful if hash contains `access_token`.
**Fix:** Bundle/minify into 2 files (above-fold init vs. below-fold). Lazy-init forecast widget on first `pointerdown` rather than on load.

### PERF-8 — Cache headers too short on JS, missing on fonts/css/img
**Found by:** Perf+a11y agent (PERF-8)
**File:** `vercel.json:23-26`
**Evidence:** `/js/(.*)` gets `max-age=300` (5 min). No rule for `/assets/fonts/`, `/css/`, `/assets/img/` — fall back to Vercel default.
**Fix:** Add rules with `max-age=31536000, immutable` for fonts, css, images (they're content-addressable in practice — change filename when content changes). Bump JS to at least `max-age=86400, must-revalidate`.

### COPY-3 / COPY-4 / COPY-5 / COPY-12 — Copy drift (group)
**Found by:** CRO+copy
- **COPY-3:** Hero subhead repeats the H1 year (echo) — rewrite to "Type four numbers. See your debt-free month, your net worth in 2036, and which goals make it. No bank login, ever."
- **COPY-4:** "Sage AI — 200 messages / month" is jargon to a cold visitor. Rewrite to "Ask Sage, your financial coach — 200 questions / month."
- **COPY-5:** Five different verbs across CTAs that all do the same thing: *Start free / Start your free forecast / Get started free / Run the forecast / Try ProFinanceCast*. Pick one ("Run my forecast — free").
- **COPY-12:** Voice drift — body is private-bank-quarterly tone ("editorial photograph of a vintage compound-interest ledger"); buttons are generic SaaS ("Start free"). Lift buttons to match.

---

## P2 — Improvements, not blockers

### SEC-1 — Missing SRI on three CDN scripts (Sentry, Cloudflare Insights, Plausible)
**Found by:** Security agent (SEC-1)
**File:** `index.html:1574, 1576, 1578`
**Risk:** CDN supply-chain attack / DNS hijack would execute arbitrary JS under the page origin. With Supabase anon key in scope, attacker could phish credentials or skim auth callback.
**Fix:** All three vendors auto-rotate bundles per release, so SRI requires a CI step to re-download on vendor change. Realistic options: (a) self-host the three vendors and SRI-pin (operational cost: a CI step per release), or (b) accept residual risk and document. The CSP `script-src` allowlist remains the only meaningful defense today.

### SEC-2 — `img-src https:` wildcard
**Found by:** Security agent (SEC-2)
**File:** `vercel.json:13`
**Fix:** Narrow to `'self' data: https://profinancecast.com` and add explicit OG/asset hosts as needed. Not exploitable on its own (no inline scripts to inject an `<img>`), but defense-in-depth.

### SEC-3 — Missing `crossorigin="anonymous"` on Cloudflare Insights + Plausible
**Found by:** Security agent (SEC-3)
**Fix:** Add `crossorigin="anonymous"` to both tags. Without it, even if SRI is added later, the integrity check would silently skip — and JS errors thrown from them surface as opaque "Script error." in Sentry, degrading the very telemetry the page pays for.

### SEC-4 — CSP `script-src` over-permissive on landing page
**Found by:** Security agent (SEC-4)
**Evidence:** PayPal origins are allowed globally but the landing page never loads PayPal SDK (only billing.html does).
**Fix:** Per-route CSP in `vercel.json` — stricter for `/`, permissive for `/billing.html`. ~20 min.

### SEO-5 — `<title>` 68 chars (over 60); description 175 chars (over 160)
**Found by:** SEO agent (SEO-5)
**Fix:** Tighten title to ≤60 (e.g., "ProFinanceCast — Ten-year net-worth forecast, no bank login"). Trim description to ~155 chars.

### SEO-6 — Sitemap URL pattern inconsistency
**Found by:** SEO agent (SEO-6)
**Evidence:** Some entries are `/blog` (no extension), others `/blog-emergency-fund.html`. If server serves both for the same content, Google sees duplicate.
**Fix:** Verify every sitemap URL returns 200 (not 301). Pick one URL pattern; 301 the other. Add self-referential canonical to every page.

### AI-3 — Empty `Organization.sameAs`
**Found by:** SEO agent (AI-3)
**File:** `index.html:39`
**Evidence:** `"sameAs": []` — provides no entity-graph linkage. Google + AI search use sameAs to confirm entity identity.
**Fix:** Add Twitter/X, LinkedIn, GitHub if public.

### AI-4 — No named author / E-E-A-T signals
**Found by:** SEO agent (AI-4)
**Evidence:** `llms.txt:66` says "Replies come from the team, not a named individual." Honest but kills the **E** in Google's E-E-A-T for a YMYL (Your Money, Your Life) topic.
**Fix:** Even one named, photographed methodology author would lift this materially. Pairs with CRO-6 (anonymous founder).

### A11Y-5 — `role="banner"` on `<nav>` is incorrect
**Found by:** Perf+a11y agent (A11Y-5)
**File:** `index.html:1589`
**Fix:** Remove `role="banner"`. `banner` belongs on `<header>`; `<nav>` already implies `role="navigation"`.

### A11Y-6 — No `prefers-color-scheme` support
**Found by:** Perf+a11y agent (A11Y-6)
**Evidence:** Design forces dark. There IS a `[data-surface="ivory"]` light variant in `pfc-tokens.css:253` but it's never auto-applied.
**Fix:** Add `@media (prefers-color-scheme: light) { :root { ... swap to ivory palette ... } }`. OR accept dark-forced as brand choice and document it.

### DES-5 / DES-8 / DES-9 / DES-10 — Detail drift (group)
**Found by:** Design agent
- **DES-5:** 26 inline `style=""` (already listed under P1)
- **DES-8:** Founders counter ships gold before API resolves (use `--ink-3` placeholder)
- **DES-9:** Six raw-px font-sizes that have token equivalents (`13px → var(--t-13)` etc.)
- **DES-10:** Two bento icons use inline gold backgrounds, violating budget — strip overrides

### CRO-7 — Pro purchase requires bounce through auth
**Found by:** CRO agent
**File:** `index.html:2176`
**Evidence:** Pro CTA target is `auth.html?next=/billing.html`. Six clicks minimum to checkout. Free CTA has the same friction.
**Fix:** Let visitors run the forecast on their own numbers in the hero widget *before* signup. Currently the widget runs on dummy $5,000 data. The signup ask comes after the user sees their actual chart.
**Estimated lift (CRO agent):** +15-25% on Free signup.

### COPY-6 — Founders Lifetime undersold
**Found by:** CRO+copy (COPY-6)
**Current:** "Pay once. Pro forever. Helps fund the project."
**Proposed:** "Pay once, use forever. Breaks even at year 2 vs Pro annual. 100 seats only."
**Rationale:** Charity frame vs value frame. Gives the buyer the break-even math + the deadline.

### COPY-7 — FAQ answers run 60-90 words; the 30-day refund lie lives here
**Found by:** CRO+copy (COPY-7)
**Fix:** Shorten each to ≤40 words. Lead with the answer, not the framing. Strip the competitor-takedown lede.

### COPY-8 — "Built in Europe" badge unverifiable
**Found by:** CRO+copy (COPY-8)
**Fix:** "Hosted in the EU" or "Frankfurt-hosted" if true; otherwise drop. Vague marketing claims weaken the surrounding verifiable trust badges.

### Content-1 — Weak keyword targeting in H1
**Found by:** SEO agent (Content-1)
**Evidence:** Title and H1 lead on "plan the next ten years, without a bank password" — strong differentiator, weak on transactional intent. Primary searchable terms ("net worth forecast", "personal finance forecasting") appear in body but not in H1 region.
**Fix:** Add a sub-headline or eyebrow naming "ten-year net-worth forecast" near the H1.

### Content-2 — Quotable stats live only in llms.txt
**Found by:** SEO agent (Content-2)
**Evidence:** `llms.txt:69-73` lists strong stats ($2,400-$4,100 avalanche savings; $77,800 from $500/mo at 5%). These don't appear on the homepage in plain text — many LLM crawlers don't honor llms.txt yet.
**Fix:** Add a "By the numbers" or "Quick math" strip on index.html with the three quotable figures, one sentence each, sourced.

### PERF-4 — Six third-party origins requested
**Found by:** Perf+a11y agent (PERF-4)
**Fix:** Add `<link rel="dns-prefetch">` and `<link rel="preconnect">` for `cdn.jsdelivr.net` (loads Supabase SDK on every page). Sentry/Plausible/CF beacons are already `defer`/`async` — acceptable.

### PERF-6 — `pfc-tokens.css` render-blocking despite only ~12 tokens used pre-paint
**Found by:** Perf+a11y agent (PERF-6)
**Fix:** Apply the same `media="print" onload="this.media='all'"` swap used for `pfc-app.css:242` after extracting the truly critical tokens.

### Other small finds
- A11Y-7: skip-link hop-on-focus uses `data-pfc-on-focus="_pfc_style2"` instead of pure CSS `:focus { top: 8px; }`
- A11Y-8: `<picture>` `<source>` duplicates `<img src>` — adds bytes for zero benefit; AVIF variants exist but aren't referenced

---

## Top-10 ROI-ranked quick wins (each <1 hour)

1. **Fix the refund-window contradiction.** Search-replace "30 days" → "14 days" in `index.html`. 5 min. Closes CONTRADICT-1.
2. **Reconcile pricing across landing / JSON-LD / llms.txt / pricing.md.** 20 min. Closes CONTRADICT-2 + COPY-9.
3. **Update OG/meta to say 2036 instead of 2030.** 2 min. Closes CONTRADICT-3.
4. **Remove the redundant "Try the live demo" hero button + demote waitlist to inline link.** 10 min. Closes CRO-1 / DES-3.
5. **Add `defer` to the 7 head scripts at `index.html:259-266`.** 5 min. Closes PERF-1. Saves 1.5-3s on Slow 3G.
6. **Remove `loading="lazy"` from mobile hero image; add `fetchpriority="high"`.** 2 min. Closes PERF-2. Saves ~500ms mobile LCP.
7. **Add `for=` to the four range slider labels.** 3 min. Closes A11Y-1.
8. **Darken `--ink-3` to ~`#8A988F`.** 1 min CSS edit. Closes A11Y-2.
9. **Wire the live `#home-founders-counter` to `/api/founders-claimed`.** 15 min — copy existing code from billing.html. Closes CONTRADICT-4.
10. **Fix llms.txt currency + seat count.** 5 min. Critical for AI-search citations.

**Total time: <90 minutes. Closes 4 P0s and 6 P1s.**

---

## Deeper refactors (post-launch, each ≥half a day)

- **Fix the font loader** (DES-2). Single largest visual-quality upgrade. ~1 hour to ship missing weight files, OR ~2 hours to switch to variable axis.
- **Move all landing JS to defer/async** (PERF-1, PERF-5). Split inline `index-*.js` into 2 bundles. ~1 day. Reduces Slow 3G TTI by 4-6s.
- **Hero copy rewrite + A/B test via GrowthBook** (COPY-1). Ship variant. Measurable conversion lift.
- **Migrate 7 bespoke photo classes to `pfc-photo-*` system** (DES-6). ~2 hours. Removes ~120 lines of CSS.
- **Strip 22+ inline `style=""` attributes**, extract 3-4 utility classes (DES-5). ~2 hours.
- **Add social proof + founder presence** (CRO-5, CRO-6, AI-4). Portrait + name + credential. ~half day.
- **Wire `PFCCurrency.detect()` into hero demo** (COPY-2, DES-4). Touch slider widget + 3 inline SVG charts.
- **Self-host Sentry / Plausible / Cloudflare Insights** (SEC-1). Real engineering: ~1 day including the CI auto-update job.
- **Make pricing a single source of truth** (architectural — see next section).

---

## The #1 architectural recommendation: ONE pricing source of truth

The single biggest fragility this audit surfaced is that pricing, refund terms, seat counts, and tier list are duplicated across **eight** surfaces:

1. `index.html` visible pricing cards
2. `index.html` JSON-LD `WebApplication.offers`
3. `index.html` FAQ schema answers
4. `index.html` H1/subhead year
5. `billing.html` visible pricing cards + OG description
6. `terms.html` § 7a/7b
7. `llms.txt`
8. `pricing.md` (and its own internal table-vs-prose mismatch)

All eight must agree. Currently the audit found **five categories of disagreement** (refund window, currency, tier count, seat cap, year-of-forecast). This will keep producing P0 bugs forever unless centralised.

**Recommended fix:** create `data/pricing.json` (or `js/pfc-pricing-constants.js`) as the canonical source. Even without a build step, a documented invariant in `CLAUDE.md` listing "these eight files must match on pricing" prevents the next drift.

This is the **#1 change** I'd make. Everything else is cosmetic relative to this.

---

## Audit trail + verification

- Five lens agents dispatched independently (security, design, SEO, CRO+copy, perf+a11y). Each read evidence in full and returned a markdown report with severity-tagged findings; none saw any other agent's report.
- Ruflo SAST scan completed concurrently. Same 125 codebase-wide medium findings as the May 23 payments re-audit — **no landing-page-specific net-new security issues.**
- Cross-validation: findings flagged by ≥2 independent lenses (refund-window, pricing contradictions, hero tri-CTA, currency mismatch, year drift, seat-counter staleness) carry higher confidence and are the P0 set.
- Disagreements were minimal. Where two lenses framed the same finding differently (e.g., SEO called Premium-in-schema a "lie" while CRO called it "missing from landing"), the synthesis adopts the framing that matches the actual product state — Premium IS a real tier in `billing.html`, so the landing page is incomplete, not the schema wrong.
- Total real findings: ~50 across all five lenses + ruflo.
- An earlier draft of this document (written before four of the five agents finished) extrapolated section content. That draft has been replaced. The PERF-N and A11Y-N findings in this document come from the actual perf+a11y agent report; all SEC-N, DES-N, SEO-N, AI-N, CRO-N, COPY-N, and Content-N findings come from this fresh round of dispatches and are quoted with file:line evidence.

## Full per-lens reports

Each agent's complete report (1500-2200 words apiece) is preserved verbatim in the chat transcript above this document. Search the transcript for `SEC-1`, `DES-1`, `SEO-1`, `AI-1`, `CRO-1`, `COPY-1`, `PERF-1`, or `A11Y-1` to dig into a specific finding's evidence chain.

# Round 2 — Specialty lens additions (2026-05-23)

After the 5-lens synthesis above, **six additional specialty lenses** were dispatched in parallel to surface findings the first five would miss. Lenses: mobile-deep-dive, E2E funnel flow, editorial proofread, trust + legal compliance, browser/device compat, imagery + asset audit.

Total NEW findings: ~80 across all six. Cross-validated findings (where round-2 confirmed something round-1 already flagged) raised confidence further on the P0 set — refund-window contradiction (4 lenses now agree), font-loader broken (Design + Imagery both confirmed), hero stacking (CRO + Design + Mobile all agree).

This section appends only NEW findings; ones that re-derive what's already in rounds 1-5 above are referenced inline ("confirms X-N").

## Round-2 P0 — additional launch-blockers

### TRUST-2 — Non-essential third-party scripts load without consent
**Found by:** Trust/Legal agent
**File:** `index.html:1574` (Sentry), `:1576` (Cloudflare Insights), `:1578` (Plausible)
**Regulation:** ePrivacy Directive Art. 5(3) (EU/UK PECR)
**Evidence:** All three fire on initial load with no consent gate. Plausible and CF Insights claim "cookieless" — but PECR's broader rule covers "storage of, or access to, information," and CF processes IP for fraud detection. Sentry SDK touches localStorage.
**Risk:** `privacy.html § 8` claim "no third-party analytics cookies" becomes technically defensible but the broader claim is wrong. Regulators read these broadly.
**Fix:** Either (a) gate Sentry/CF behind a runtime trigger (load Sentry only on first error fire), or (b) acknowledge in privacy.html § 8 "non-cookie beacons to CF/Plausible/Sentry occur." Advisory — not strict legal advice.

### TRUST-3 — No imprint / company-registration disclosure
**Found by:** Trust/Legal agent
**File:** missing across index, about, privacy, terms
**Regulation:** EU CRD Art. 6, EU eCommerce Directive Art. 5, German Telemediengesetz §5 (Impressum), UK Companies Act §82
**Risk:** Serving DE without an Impressum is a known cease-and-desist target (Abmahnung industry). EU consumers can't exercise withdrawal right without seller identity disclosure.
**Fix:** Add a `legal.html` or extend privacy.html: legal entity name, registration number, registered address, supervisory authority (if any). Link from footer as "Imprint" / "Legal disclosures." **Hard launch-blocker for DE/AT traffic.**

### MOB-1 — Mobile hero stacks 5 elements before fold-2 widget on iPhone 15
**Found by:** Mobile agent (extends CRO-1)
**File:** `index.html:1620-1740`, `:816-823`
**Evidence:** On viewports ≤540px the hero collapses to single-col with: eyebrow chip + H1 (~240px tall) + sub (~100px) + 3 stacked full-width CTAs (~180px) + waitlist line + trust-row + `coastal-window.webp` (480px) + 48px gap + chart-frame (~600px). Total pre-fold-2 height: ~1450px. The live demo widget (the perf agent's whole reason to preload its image) doesn't appear until the **4th** swipe down.
**Fix:** On ≤540px hide the `coastal-window.webp` element (MOB-2), drop the waitlist button (per CRO-1), drop the "Try the live demo" button. Cuts mobile hero from ~1450px to ~620px.

### MOB-2 — Mobile-only hero photo is redundant decoration
**Found by:** Mobile agent + Imagery agent
**Evidence:** `coastal-window.webp` is 480px tall on mobile, adds 58 KB, and the editorial photo band immediately below (`hero-ledger.webp`) delivers the same vibe. The mobile photo is also off-register vs the rest of the photo set (Kinfolk-travel light vs vintage-ledger warm-amber).
**Fix:** Delete `.pfc-hero-mobile-pic` entirely (saves 58 KB + ~400ms LCP) OR move it AFTER the live demo widget.

### IMG-1 — Static assets have NO Cache-Control header
**Found by:** Imagery agent (extends PERF-8)
**File:** `vercel.json:4-27`
**Evidence:** Header block covers `/(.*)` (security only) and `/js/(.*)` (5-min cache). NO rule for `/assets/img/(.*)` or `/assets/fonts/(.*)`. Vercel defaults to short revalidation — repeat visitors re-validate ~875 KB of images + ~53 KB of fonts every navigation.
**Fix:** Add `{ "source": "/assets/(img|fonts)/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] }`. Saves ~930 KB per repeat view.

### IMG-2 — AVIF assets exist on disk but are never served
**Found by:** Imagery agent (NEW; perf agent flagged AVIF availability without confirming files)
**Files:** `assets/img/photos/cashflow-tide-band.avif`, `onboarding-*.avif`, `portfolio-holdings-eyebrow.avif` exist but are not referenced. None of the LANDING-page images (hero-ledger, compass, key, seedling, etc.) have AVIF variants on disk.
**Fix:** Generate AVIF for the 10 landing images via `avifenc`. Prepend `<source type="image/avif">` BEFORE the WebP source. ~150 KB total saved first paint.

## Round-2 P1 — additional fixes before scaling

### MOB-3 — Sticky CTA dismiss × is 40×40, below WCAG 2.5.5 floor
**File:** `index.html:879-886`
**Fix:** `width: 44px; height: 44px;` + `margin-left: 6px` to prevent accidental dismissal.

### MOB-4 — Slider thumb is 22×22 — the PRIMARY mobile interaction
**File:** `index.html:489-502`
**Evidence:** Slider thumb is the central mobile differentiator (perf agent already preloaded the hero photo around it). 22px thumb is half WCAG floor. Drag latency on Galaxy S24 measured 80-140ms vs 30ms with 44px thumb.
**Fix:** Bump thumb to 28px + wrap input in a 44px-tall hit-box, OR add `touch-action: pan-y` to the input.

### MOB-5 — Nav `top: 16px` ignores iOS notch / Dynamic Island safe area
**File:** `index.html:309-320`, `:202-212`
**Fix:** `top: max(16px, env(safe-area-inset-top))`. Lands correctly on all iOS form factors (especially landscape on iPhone 15 Pro+).

### MOB-6 — `apple-touch-icon` is SVG; iOS Safari ignores SVG
**File:** `index.html:7`
**Evidence:** Apple's docs require PNG. When user adds-to-home, Safari falls back to a screenshot of the page (dark canvas + Fraunces H1 → unreadable thumbnail).
**Fix:** Generate 180×180 PNG from logo-512.png, add `<link rel="apple-touch-icon" sizes="180x180" href="/assets/img/apple-touch-icon-180.png">`.

### MOB-7 — Mesh-blob animation runs on mobile, eats GPU
**File:** `index.html:892-944`
**Evidence:** Three 56vw blurred (`filter: blur(120px)`) blobs animate 65-80s loops. iPhone 12 mini and below: 8-15% sustained GPU during the 80s the user is reading the hero.
**Fix:** `@media (max-width: 540px) { .hero-mesh .mesh-blob { display: none; } }` or pause animations.

### FNL-1 — Founders pricing CTA scrolls nowhere
**File:** `index.html:2189` → `auth.html?next=/billing.html#founders`
**Evidence:** Element ID on billing.html is `card-founders` (`billing.html:1274`), not `founders`. Browser fails anchor lookup → user lands at top of billing.html.
**Fix:** Add `id="founders"` as secondary anchor on the founders card in billing.html (one-line, no auth.js change).

### FNL-3 — Hero "Start your free forecast" CTA lands on a LOGIN form
**File:** `index.html:1641` → `auth.html` (which boots `view-login` by default)
**Evidence:** First-time visitor sees login (not signup), has to click "Create one free →". Burns the curiosity that motivated the click.
**Fix:** Append `#signup` to all "Start" CTAs that target first-time users. Or route to `onboarding.html` directly.

### TRUST-4 — Jurisdiction `<!-- TODO -->` still in production terms.html
**File:** `terms.html:184`
**Evidence:** A leaked TODO in customer-facing legal text damages trust and signals unfinished review. Could be argued in court as evidence the operator hadn't agreed jurisdiction.
**Fix:** Replace with confirmed jurisdiction or delete the conditional comment.

### TRUST-5 — "AI advisor" wording vs "not advice" disclaimer
**File:** `index.html:2066, 2214`, schema FAQ `:84-100`
**Regulation:** EU AI Act draft Art. 50; UK FCA PERG 8 on what constitutes investment advice
**Risk:** "Sage AI · your personal advisor" + example prompt "should I pay off the car or invest?" reads as personalised financial-advice marketing. Regulator could argue this is a financial promotion.
**Fix:** Rename Sage to "planning assistant" or "scenario explorer" in copy + JSON-LD. Move "not advice" disclaimer above the Sage section (currently 800px below).

### TRUST-7 — No accessibility statement (EAA enters force 2025-06-28)
**File:** missing
**Regulation:** European Accessibility Act 2019/882, applies to e-commerce. ProFinanceCast sells subscriptions.
**Risk:** Each EU state can fine; Germany's BFSG up to €100k.
**Fix:** Publish `accessibility.html`: WCAG 2.1 AA target, known gaps, contact for complaints, last audit date. Link from footer.

### TRUST-8 — VAT not disclosed on pricing
**File:** `index.html:64-68` JSON-LD prices, `:2174`, `terms.html:132-135`
**Regulation:** EU CRD Art. 6(1)(e) — total price incl. taxes must be shown before checkout
**Fix:** Add "Prices shown are inclusive of VAT where applicable" near the pricing cards. Per vat-strategy.md the entity isn't VAT-registered yet, so disclosure that VAT isn't currently charged would also work.

### COMPAT-1 — Missing `-webkit-backdrop-filter` on the fixed nav + sticky CTA
**File:** `index.html:209, 316, 1051`; `css/pfc-app.css:154, 416`; `pfc-blog.css:53`; `pfc-reskin.css:46`
**Affected:** Safari < 17 (iOS 16.x still ships WebKit 16)
**Evidence:** Without the `-webkit-` prefix, the nav pill on iOS 16 renders flat — title content scrolls visibly through it.
**Fix:** Add `-webkit-backdrop-filter: blur(20px) saturate(140%);` before every `backdrop-filter` declaration. Only `pfc-tool-page.css:34-35` currently has both.

### COMPAT-2 — No `@media (forced-colors: active)` styles
**File:** entire CSS surface (0 hits)
**Affected:** Windows High Contrast Mode, vision-needs users
**Evidence:** Hero/Pro/Bento cards, `.price-card.hot` gold border, scroll-progress bar all carry color through background/box-shadow/stroke. Forced-colors mode strips those → invisible CTA buttons, unreadable "Most chosen" pill.
**Fix:** Add `@media (forced-colors: active)` block pinning `border: 1px solid CanvasText` on `.btn/.price-card/.bento-card`, `forced-color-adjust: none` on the brand SVG.

### COMPAT-3 — `text-wrap: balance/pretty` no fallback for iOS Safari ≤17.3
**File:** `index.html:1027, 1029, 1225`
**Affected:** iOS Safari 16.x, 17.0-17.3 (balance shipped 17.4)
**Fix:** Verify on iOS 16 device. Hard-wrap with `<br>` at known break points if unacceptable. Pure progressive enhancement otherwise.

### IMG-3 — Every `<img>` declares wrong intrinsic dimensions (`1024×1024`)
**File:** index.html:1670, 1762, 1773, 1834, 2089, 2142, 2251, 2335
**Evidence:** All 8 landing `<img>` tags hardcode 1024×1024. Actual natural dims: hero-ledger 1111×1415, compass 1448×1086, etc. CSS aspect-ratio overrides the shape but the wrong HTML attrs defeat browser pre-layout CLS reservation.
**Fix:** Set width/height to actual natural dimensions. Zero KB, proper CLS + SEO image indexing.

### IMG-4 — Photos served at 2-6× displayed pixel size
**Evidence:**
- key-on-velvet 1254×1254 displayed at ~200 CSS px = 6× oversize (save ~50 KB)
- compass-on-paper 1448×1086 in step column ~320 CSS px = 4.5× (save ~60 KB)
- match-flame 1122×1402 at ~140 CSS px = ~4× (save ~15 KB)
- coastal-window 1536×1024 mobile-only at ~720 CSS px = 2× (save ~25 KB)
- seedling-coin 1774×887 displayed ~720 CSS px = ~1.2× (marginal)
**Fix:** Generate appropriately sized variants. Combined ~150 KB saved.

### IMG-9 — Font weight files DO NOT EXIST on disk (confirms DES-2)
**File:** `css/pfc-fonts.css` + `assets/fonts/`
**Evidence:** CSS declares Fraunces 400/500/600 italic + 400/500/600/700, Inter Tight 300/400/500/600/700, JetBrains Mono 400/500/600 = 14 weights. On disk: only 4 files (`fraunces-400`, `fraunces-400-italic`, `inter-tight-300`, `jetbrains-mono-400`). All weight declarations point to the same single file per family. This is intentional-but-broken: `scripts/self-host-fonts.py` only downloaded one weight per family.
**Fix:** Either (a) download the declared weights (~25-35 KB per added file), or (b) prune CSS to only declare what exists. Option (b) is more honest; option (a) restores designer intent.

### IMG-12 — `logo-512.png` is 1.4 MB; never rendered as `<img>`
**File:** `assets/img/logo-512.png` (1,423,364 bytes), `logo-card.png` (also 1,423,364 — likely byte-identical duplicate)
**Evidence:** Only referenced in JSON-LD Organization schema. Should be ~15 KB as PNG. Crawlers fetch the full 1.4 MB for structured-data validation.
**Fix:** pngquant + oxipng → ~15 KB. Delete duplicate. Saves ~2.8 MB from deploy bundle, ~1.4 MB any crawler that fetches schema.org logo.

## Round-2 P2 — improvements (compact list)

**Mobile (MOB-8 to MOB-12):**
- Bento cursor-tracking radial-gradient is hover-only; mobile users see nothing — wrap in `@media (hover: hover)`
- No `manifest.webmanifest`, no `apple-mobile-web-app-capable` — product is a PWA in everything but the install prompt
- No `srcset` `2x` variants for retina; mobile-only switch at 980px
- `overscroll-behavior: contain` not set
- Desktop `scroll-padding-top: 88px` mismatched on mobile (nav is ~72px there)

**Funnel (FNL-2, FNL-4, FNL-5, FNL-6, FNL-8):**
- Footer "Create account" → `auth.html` lands on login view, not signup; should append `#signup`
- Footer "Sage AI" → Pro-gated page silently redirects free users to billing (paywall masquerading as feature link)
- `<a href="blog">` relies on Vercel `cleanUrls: true`; breaks under `file://` / non-Vercel hosts — use `blog.html`
- `refreshFoundersCount` updates `_foundersLastFetch` on failure → throttles retries for 5min after a CDN hiccup
- OAuth error callback loses `next=` intent — pass through

**Editorial (proofreader top wins):**
- `index.html:2042` "dismissable" → **dismissible**
- `:2095` "settings to wipe" → "one tap in **Settings**"
- `:1827` "Real inflation pulled from the World Bank…" → "**We pull** real inflation…" (missing verb)
- `:2012` "0.5 percent rate cut" → **"0.5% rate cut"** (matches all other % usage)
- `:2289, :2305` strike "literally" / "actually" filler
- `:1654` "Join the waitlist — 100 Founders seats" → "**Founders Lifetime seats**"
- British vs American spelling drift: pick British (modelled, optimiser, personalised, harmonised, amortisation) to match BrE register set by "behavioural" / "anonymised"
- `billing.html` has "Free plan" / "Free Plan" / "free plan" — pick one
- "$" vs "€" same-page mixing in hero demo (already covered as P0 by Design+CRO)

**Trust/Legal (TRUST-6, -9, -10, -11, -12, -13, -14, -15):**
- "Bank-level encryption" (privacy.html:132) overclaims — drop to "AES-256-GCM, TLS 1.3 — industry-standard ciphers"
- Founders 14-day waiver not previewed on landing card
- "Built in Europe" claim unverifiable — pair with TRUST-3 imprint
- Sage example "should I pay off car or invest?" is textbook investment-advice phrasing — add in-card disclaimer
- Footer disclaimer is AFTER the CTA — add 1-line micro-disclaimer above the bottom CTA
- privacy.html § 8 should acknowledge Sentry localStorage usage
- No newsletter form on landing today; if added, replicate `waitlist.html` GDPR consent pattern
- No age gate; 16+ rule asserted in terms only — fine for non-regulated personal finance

**Browser/Compat (COMPAT-4 to COMPAT-15):**
- `min-height: 100svh` without `100vh` fallback for iOS 15 / older Firefox
- No print stylesheet on landing (only app pages have one)
- `scroll-behavior: smooth` set inline before `prefers-reduced-motion` CSS loads — add inline override
- No `prefers-contrast` or `prefers-reduced-data` support
- No CSS `contain: layout paint` on cards (layout thrash during reveals on low-end Android)
- No service worker (PWA roadmap item)
- `decideDestination()` in `index-3.js:44-46` race when PFCUser undefined under slow first paint
- No browser sniffing (positive — clean)

**Imagery (IMG-5 to IMG-16):**
- Photo set 9/10 hits the "vintage ledger" brief; `coastal-window.webp` is the outlier (Kinfolk travel light vs warm-amber register)
- Hero alt text describes physical photo (correct WCAG pattern)
- Inline SVGs are clean (no editor cruft) — positive
- No CSS background-images for raster — positive
- `/api/og` endpoint has no edge cache header — every social-media unfurl regenerates the PNG. Add `cache-control: public, max-age=86400, s-maxage=604800, immutable`
- Logo wordmark renders as Fraunces `<text>` SVG → glyph reflow on cold cache; convert "PFC" letters to outlined SVG `<path>`
- Confirm photo license attribution if anything is sourced rather than original-shoot

---

## Cross-validated findings (confidence ↑)

These were found INDEPENDENTLY by ≥2 lenses; treat as the most reliable:

| Finding | Lenses agreeing |
|---|---|
| Refund window 14 vs 30 days | SEO + CRO + Copy + Trust (4×) |
| Pricing/currency contradictions across 6 surfaces | SEO + CRO + Copy + Editorial + Mobile (5×) |
| Hero 3-CTA overload | CRO + Design + Mobile (3×) |
| Hero demo USD vs page EUR | Design + Copy + Mobile + Editorial (4×) |
| Font loader silently broken | Design + Imagery (2× — Imagery confirmed files don't exist on disk) |
| Mobile LCP image `loading=lazy` + redundant | Perf + Mobile + Imagery (3×) |
| AVIF available but not served | Perf + Imagery (2×) |
| Year-of-forecast 2030 vs 2036 | Design + Copy (2×) |
| `.btn` touch targets <44px | Perf+A11y + Mobile (2×) |
| Footer h4 with no h3 parent | SEO + Perf+A11y (2×) |
| `--ink-3` contrast fails WCAG AA | Perf+A11y (1×; visible to anyone running Lighthouse) |

---

## Related docs

- [2026-05-23-payments-reaudit.md](2026-05-23-payments-reaudit.md) — payments audit
- [../../runbooks/payments-incident-response.md](../../runbooks/payments-incident-response.md) — IR runbook
- [../../runbooks/vat-strategy.md](../../runbooks/vat-strategy.md) — VAT decision doc
