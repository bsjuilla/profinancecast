# Image-Placement Audit · ProFinanceCast Public Pages

**Date:** 2026-05-21
**Method:** CEO-pattern parallel dispatch of a design-audit agent over all public HTML at `profinancecast/`.
**Headline finding:** index.html is photo-rich; everything else (blog index, 7 blog posts, 4 info pages) is photo-zero. The editorial promise breaks the moment a visitor clicks "Blog".

Existing photography library at `assets/img/photos/`: coastal-window, compass-on-paper, desk-corner, gold-leaf-arrow, hero-ledger, key-on-velvet, match-flame, seedling-coin. All 1024×1024 editorial WebP, vintage/ledger/Mediterranean tone. **All eight currently used only on index.html.**

---

## High-impact slots (P0)

### 1. Blog index featured card → real photography
**File:** `blog.html:451-477`
**Current:** generic green/blue SVG chart inside `.feat-img`
**Why P0:** First thing a visitor to `/blog` sees. Looks like every other fintech blog.
**Recommend:** Macro shot of **two stacks of vintage banknotes on a balance-scale, one stack visibly taller, dark velvet backdrop** — literal avalanche-vs-snowball comparison.
**Size:** 1200×800 (3:2)

### 2. Blog index 6 article-card thumbnails
**File:** `blog.html:494-582` (six cards)
**Current:** uniform inline SVG charts. Wall of charts.
**Recommend topical 600×600 square crops:**
| Post | Image direction |
|---|---|
| Emergency fund | Jar of coins on linen, soft daylight |
| Salary negotiation | Brass typewriter key labeled "RAISE" |
| 50/30/20 | Pie chart drawn in ink on parchment |
| Inflation | Eroding sugar cube under water drip |
| Net worth | Antique balance sheet half-folded |
| Index funds | Wide field of identical wheat stalks |

### 3. Blog post hero / lede banners
**File:** every `blog-*.html` (8 posts), just above the H1
**Current:** breadcrumb → title with no visual hook
**Recommend:** **1200×500 editorial banner** above each H1, matching the `.pfc-photo-band` pattern from index.html (line 1736).
| Post | Banner direction |
|---|---|
| Debt avalanche | Snow-covered mountain range in cross-section, debt papers in bottom strata |
| Emergency fund | Tin labeled "Reserve" on a kitchen shelf |
| Index funds | Wide field of identical wheat stalks (matches the article card) |
| Inflation | Wax-sealed letter from 1923 showing a 1,000,000-mark stamp |
| Net worth | Stacked leather ledgers with a fountain pen across the top |
| 50/30/20 | Three jars of different sizes labeled "Needs / Wants / Save" |
| Salary negotiation | Two business cards on a marble surface, one cut in half |
| Wealth building | Long exposure of a candle burning down through the night |

### 4. Pricing section breathing room
**File:** `index.html:2115-2127`
**Current:** seedling-coin photo above pricing cards. Three-card grid is dense, uniform.
**Recommend:** **800×300 horizontal vignette between Pro and Founders cards** — wax-sealed envelope with red ribbon on a leather blotter — to anchor "Founders Lifetime" visually.

---

## Medium-impact (P1)

### 5. Step 01 "Drop in your numbers"
**File:** `index.html:1766-1800`
**Current:** Step 02 (compass) + Step 03 (scenario diagram) have visuals; Step 01 is just an input-mockup.
**Recommend:** 600×600 — **fountain pen mid-stroke writing in a leather notebook with columns "Income / Debt / Goals" handwritten in iron-gall ink.**

### 6. Credibility-strip masthead ornament
**File:** `index.html:1721-1730`
**Current:** four data-point cells text-only between hero and photo band.
**Recommend:** **1400×80 calligraphy flourish hairline** above the row — gold ink on emerald.

### 7. FAQ section opener
**File:** `index.html:2259-2265`
**Current:** Section v (Common questions) starts cold.
**Recommend:** **800×500 vignette right after section-head** — stack of leather-bound legal volumes with a folded letter peeking out, marble inkwell on the side. Anchors "plain answers, no fine print."

### 8. Help page H1 hook
**File:** `help.html` above line 226
**Current:** H1 sits on bare canvas.
**Recommend:** **640×400 editorial photo** — brass library card-catalog drawer half-open, manila tabs visible.

### 9. About page section breaks
**File:** `about.html` around line 144 and line 158
**Two image breaks:**
- **Between "About ProFinanceCast" and "Methodology"** — 1000×400 wide crop, **slide-rule and printed mortality table on a draughtsman's desk**.
- **Before "What we are not"** — 600×600 square, **empty bank-vault door slightly ajar, no contents visible** (literal "what we are not").

---

## Nice-to-have (P2)

### 10. Blog newsletter card banner
**File:** `blog.html:587-595`
**Recommend:** 1200×200 strip — **wax-sealed envelope being slid under a door**, evokes weekly delivery.

### 11. Per-post FAQ section marker
**File:** every `blog-*.html` (FAQ section)
**Recommend:** Small 200×200 vignette — antique brass question-mark stamp on ivory paper.

### 12. Legal pages (privacy, terms) H1 ornament
**File:** `privacy.html:104`, `terms.html:94`
**Recommend:** Thin 1200×180 hairline-and-flourish strip below the H1 on each. Pure decoration; signals care.

### 13. CTA strip supporting image
**File:** `index.html:2308-2330`
**Current:** match-flame works but gets cropped tight on mobile.
**Recommend:** Second 1200×300 supporting strip below CTA copy — horizon line photographed at dawn from the Portuguese coast. Frames "ten years out."

### 14. Pricing tier monograms
**File:** `index.html:2173-2216` (pricing-compare table header row)
**Recommend:** Three 80×80 antique brass-stamp vignettes — simple / double / crowned monogram — above Free / Pro / Founders names. Adds tier hierarchy without layout change.

### 15. Footer brand-column monogram
**File:** `index.html:2337-2348`
**Recommend:** 160×160 monogram tile — embossed gold "PFC" on dark leather. Closes the footer the way the hero-ledger opens the page.

---

## Production guidance

- **Editorial style:** never stock-photo "happy people pointing at laptops". Always vintage / ledger / Mediterranean register.
- **Hero asset budget:** 8 P0 banners + 6 article thumbnails = 14 new images. At ~$15-30 each from a commercial editorial photographer or careful Unsplash curation, ~$200-400 total.
- **AI generation viable:** Midjourney v6+ in `--style raw --ar 3:2` mode hits this aesthetic well; "macro photograph vintage finance ledger fountain pen marble brass" + specific subject usually yields usable frames. Always license-cleared the resulting set before deploy.
- **Sizing recommendations:** WebP, quality 80, lazy-load below the fold. Match existing `.pfc-photo-band` and `.pfc-step-img-wrap` CSS so they share the editorial framing (vignette + caption mono label).

## What's NOT recommended

- Adding more photography to the dashboard. The dashboard is a working surface, not editorial. Different register intentional.
- "Hero illustration" cartoony svg-art. Doesn't match the photographic register.
- More than one strong image per section — visual rhythm depends on contrast with text-only intervals.
