# 33 Image Superprompts — ProFinanceCast

**Inherits:** [vintage-ledger-brief.md](./2026-05-21-vintage-ledger-brief.md)
**Slot map source:** Coverage cartographer agent, 2026-05-21
**Format:** Each entry is a ready-to-paste Midjourney v6 prompt.
DALL-E 3 / Imagen 3 variants follow the same wording — strip the
trailing `--` flags and paste the body.

## How to use

1. Pick a slot below.
2. Copy the **PROMPT** block exactly.
3. Generate at 1024×1024 in Midjourney v6 (`--style raw` keeps it
   editorial; `--style 4c` if you want a touch more painterliness).
4. Export as WebP quality 80.
5. Save as `assets/img/photos/<slot-id>.webp`.
6. Apply the matching code stub from
   `code-stubs/<slot-id>.patch.md` (one file per slot — coming).

**Universal negative prompt** (already appended to every prompt below,
quoted once here for reference):

```
no people, no faces, no hands, no smartphones, no laptops, no tablets, no monitors,
no modern UI, no glass, no neon, no chrome, no plastic, no stock-photo register,
no clip-art, no emoji, no logos, no Bitcoin/crypto medallions, no flat illustration,
no 3D render, no AI uncanny gloss, no HDR, no sun flare, no watermark, no text
except hand-script ledger entries or letterpress, no piggy banks, no acorns,
no hockey-stick charts, no people pointing at screens, no fintech app mockup
```

---

## Tier A — Pro-gated workspace (top priority)

### A1 · `onboarding-welcome-vignette`

**File:** `onboarding.html:197` · **Aspect:** 4:3 · **Placement:** above the step heading inside the step card

> Macro photograph of a single pressed-flower botanical specimen — dried olive sprig with two small ivory letters and a wax-sealed envelope in chestnut wax — arranged on hand-torn cream linen paper. Single warm raking light from camera-left at 35°, casting a soft long shadow. Background: undyed natural linen weave. Champagne brass paperclip in the lower-right third holds the letters together. Shot on medium-format Phase One, 100mm macro, f/4, shallow but disciplined depth. Quiet, hushed, museum-vitrine register. Final-graded with subtle vignette, ~10% warm yellow bias, fine film grain.

```
PROMPT:
Vintage ledger / National Trust catalog register. Macro photograph of a pressed olive sprig, two folded ivory letters, and a chestnut-wax-sealed envelope arranged on hand-torn cream linen paper, warm raking light from camera-left at 35 degrees, soft long shadow, natural linen weave background, single champagne brass paperclip lower-right. Phase One medium format, 100mm macro, f/4, shallow disciplined depth of field, museum-vitrine quiet register, ~10% warm yellow bias, fine film grain, pre-graded. NEG: no people, no faces, no hands, no smartphones, no laptops, no tablets, no modern UI, no chrome, no plastic, no stock photo, no logos, no Bitcoin, no flat illustration, no 3D render, no HDR, no watermark, no text except letterpress, no piggy banks. --ar 4:3 --style raw --quality 2
```

### A2 · `onboarding-complete-keepsake`

**File:** `onboarding.html:464` · **Aspect:** 1:1 · **Placement:** above "You're all set"

```
PROMPT:
Vintage ledger / National Trust catalog register. Top-down macro of a small antique brass skeleton key resting alongside a chestnut wax-sealed vellum envelope on aged ivory paper with faint pink ledger rules, single overhead warm key light at 40 degrees from above, gentle specular pop on brass, soft chestnut wax sheen. Letterpress card in lower third reading "WELCOME" in 1960s monospaced caps. Phase One medium format 100mm macro, f/4, shallow depth, museum-vitrine register. NEG: no people, no faces, no hands, no smartphones, no laptops, no tablets, no modern UI, no chrome, no plastic, no stock photo, no logos, no Bitcoin, no flat illustration, no 3D render, no HDR, no watermark, no text except letterpress, no piggy banks. --ar 1:1 --style raw --quality 2
```

### A3 · `dashboard-upgrade-banner-flourish`

**File:** `dashboard.html:730` · **Aspect:** 1:1 · **Placement:** ~96px square left of `.upgrade-text`

```
PROMPT:
Vintage ledger / National Trust catalog register. Single antique gilded brass key with intricate bow ornamentation on deep emerald velvet display cushion, tight macro, single overhead warm light from camera-left at 30 degrees, gentle specular pop along the key shaft, soft falloff to near-black emerald shadow on the right, background fully black, dust motes barely visible in the light beam. Different framing and key-shape from any existing key-on-velvet photo. Phase One 100mm macro, f/4. NEG: no people, no faces, no hands, no smartphones, no laptops, no tablets, no modern UI, no chrome, no plastic, no stock photo, no logos, no Bitcoin, no flat illustration, no 3D render, no HDR, no watermark, no text. --ar 1:1 --style raw --quality 2
```

### A4 · `dashboard-masthead-band`

**File:** `dashboard.html:518` · **Aspect:** 16:5 panoramic · **Placement:** slim band between topbar and first card

```
PROMPT:
Vintage ledger / National Trust catalog register. Panoramic wide macro of a leather-bound ledger spine viewed in profile, lying flat on walnut woodgrain desk, gilt-embossed roman numerals "MCMLXII" visible along the spine, marbled chestnut-and-cream endpaper edge peeking from the cut-side, warm afternoon light raking from camera-right at 30 degrees casting a long soft shadow across the wood, ~35% negative space on the left filled with brass-pen-on-blotter. Phase One medium format 80mm, f/5.6, gentle compression. Final-graded. NEG: no people, no faces, no hands, no smartphones, no laptops, no tablets, no modern UI, no chrome, no plastic, no stock photo, no logos, no flat illustration, no 3D render, no HDR, no watermark. --ar 16:5 --style raw --quality 2
```

### A5 · `sage-welcome-portrait`

**File:** `sage.html:278` · **Aspect:** 1:1 · **Placement:** above the Sage welcome-avatar

```
PROMPT:
Vintage ledger / National Trust catalog register. Tight macro still life of a brass-banded fountain pen laid horizontally across a small leather-bound notebook, golden nib catching warm side light, single brass-rimmed loupe resting on the right page corner, paper edge shows faint ivory weave. Warm raking light from camera-left at 35 degrees. Background: deep emerald velvet cloth gathered loosely. The pen and notebook are the patient counsel — quiet, considered, never showy. Phase One 100mm macro, f/4. NEG: no people, no faces, no hands, no smartphones, no laptops, no tablets, no modern UI, no chrome, no plastic, no stock photo, no logos, no flat illustration, no 3D render, no HDR, no watermark, no text. --ar 1:1 --style raw --quality 2
```

### A6 · `sage-empty-context`

**File:** `sage.html:320` · **Aspect:** 3:2 · **Placement:** above the "Your numbers aren't in yet" copy

```
PROMPT:
Vintage ledger / National Trust catalog register. Wide three-quarter top-down of an OPEN blank ledger page with pink and faint-blue rules, fountain pen lying diagonally across the right page un-capped with ink at the nib, gentle window light from camera-right (you can see the soft falloff but no window in frame), single dried olive leaf and a brass paperclip in the lower-left third. The page is RECEPTIVE — open, waiting, never blank-as-empty. ~40% negative space. Phase One 100mm, f/5.6, museum-vitrine register. NEG: no people, no faces, no hands, no smartphones, no laptops, no tablets, no modern UI, no chrome, no plastic, no stock photo, no logos, no flat illustration, no 3D render, no HDR, no watermark. --ar 3:2 --style raw --quality 2
```

### A7 · `portfolio-empty-vault`

**File:** `portfolio.html:353` · **Aspect:** 4:3 · **Placement:** above "No holdings yet"

```
PROMPT:
Vintage ledger / National Trust catalog register. Three-quarter angle macro of a closed brass-bound deposit box / cash box on aged oak wood, brass hinges visible, intricate engraved monogram on the lid, single warm raking light from camera-right at 30 degrees casting a long soft shadow, background blurred to a deep emerald-walnut bokeh. The box is the vault BEFORE anything goes in — empty but full of potential. Phase One 100mm macro, f/4. ~35% negative space. NEG: no people, no faces, no hands, no smartphones, no laptops, no tablets, no modern UI, no chrome, no plastic, no stock photo, no logos, no Bitcoin, no flat illustration, no 3D render, no HDR, no watermark. --ar 4:3 --style raw --quality 2
```

### A8 · `portfolio-holdings-eyebrow`

**File:** `portfolio.html:302` · **Aspect:** 16:6 · **Placement:** thin band between card-header and holdings table

```
PROMPT:
Vintage ledger / National Trust catalog register. Wide panoramic macro of a row of antique paper share certificates fanned out flat on a walnut desk, ornate engraved borders visible, gilt-stamped headings (period-correct ornamental serifs, never modern company names), warm afternoon side light from camera-left at 25 degrees, gentle paper shadow. Brass paperweight in the lower-right third holds the leftmost certificate. Phase One 80mm, f/5.6. ~30% negative space. NEG: no people, no faces, no hands, no smartphones, no laptops, no tablets, no modern UI, no chrome, no plastic, no stock photo, no logos, no Bitcoin, no flat illustration, no 3D render, no HDR, no watermark, no real bank or company names. --ar 16:6 --style raw --quality 2
```

### A9 · `scenarios-page-hero`

**File:** `scenarios.html:702` · **Aspect:** 21:9 · **Placement:** full-width page-hero band

```
PROMPT:
Vintage ledger / National Trust catalog register. Ultra-wide macro of an antique mercury weather glass / barometer on a polished marble table, brass calibration ring with engraved degree marks, glass tube with mercury column at mid-range, walnut wooden base, single warm raking light from camera-right at 30 degrees making the mercury column glow soft amber, deep emerald velvet drape blurred in the background. Phase One medium format 80mm, f/5.6, gentle compression. The barometer is the instrument that MEASURES POSSIBLE FUTURES. ~45% negative space. NEG: no people, no faces, no hands, no smartphones, no laptops, no tablets, no modern UI, no chrome, no plastic, no stock photo, no logos, no flat illustration, no 3D render, no HDR, no watermark. --ar 21:9 --style raw --quality 2
```

### A10 · `scenarios-empty-compass`

**File:** `scenarios.html:511` · **Aspect:** 3:2 · **Placement:** above the empty-state copy (replacing the emoji icon)

```
PROMPT:
Vintage ledger / National Trust catalog register. Three-quarter angle macro of antique brass navigation dividers mid-step across an aged yellowed nautical chart, fine ink contour lines visible, faded compass rose in the upper-right corner of the chart, warm raking light from camera-left at 30 degrees. Distinct from the existing compass-on-paper photo — this is DIVIDERS (two-legged measuring tool) not a drafting compass, and the chart is nautical not financial. Phase One 100mm macro, f/4. NEG: no people, no faces, no hands, no smartphones, no laptops, no tablets, no modern UI, no chrome, no plastic, no stock photo, no logos, no flat illustration, no 3D render, no HDR, no watermark. --ar 3:2 --style raw --quality 2
```

### A11 · `report-card-keepsake`

**File:** `report-card.html:443` · **Aspect:** 4:5 portrait · **Placement:** left of the "Pro removes the watermark" copy

```
PROMPT:
Vintage ledger / National Trust catalog register. Portrait macro of a framed letterpress certificate on aged ivory linen-textured paper, frame is dark mahogany with gilded inner liner, certificate text ornamental serif reading "MERIT" in large caps with smaller hand-script below (never a real name, just calligraphic flourish), single warm key light from camera-left at 35 degrees casting a soft shadow on the wall behind. Background: muted walnut-grain wall. The certificate is an heirloom — quiet, considered, framed-to-keep. Phase One 80mm, f/5.6. NEG: no people, no faces, no hands, no smartphones, no laptops, no tablets, no modern UI, no chrome, no plastic, no stock photo, no logos, no flat illustration, no 3D render, no HDR, no watermark, no actual names. --ar 4:5 --style raw --quality 2
```

### A12 · `debt-empty-quiet`

**File:** `debt-optimizer.html:386` · **Aspect:** 4:3 · **Placement:** above "Add your loans, credit cards..."

```
PROMPT:
Vintage ledger / National Trust catalog register. Tight three-quarter macro of a snuffed wooden kitchen match resting beside a closed cream envelope stamped with letterpress "PAID" in chestnut ink, single thin trail of smoke from the match drifting up and to the right, single warm rim light from camera-right at 30 degrees, deep matte-black background, ~40% negative space above. Distinct from match-flame.webp — this is the AFTERMATH, not the strike. Phase One 100mm macro, f/4, frozen-motion smoke. NEG: no people, no faces, no hands, no smartphones, no laptops, no tablets, no modern UI, no chrome, no plastic, no stock photo, no logos, no flat illustration, no 3D render, no HDR, no watermark. --ar 4:3 --style raw --quality 2
```

### A13 · `goals-empty-horizon`

**File:** `goals.html:638` · **Aspect:** 3:2 · **Placement:** above empty-state copy

```
PROMPT:
Vintage ledger / National Trust catalog register. Wide environmental shot through an arched window of a stone Mediterranean villa at dusk — distant lighthouse on a rocky promontory just visible against blue-grey sea, terracotta rooftops in the foreground softly blurred, single brass-handled telescope or sextant on the window sill in sharp focus in the lower-left third. Warm golden-hour back-light pouring in. Phase One 80mm, f/4, gentle compression. The horizon is what you walk toward. ~50% negative space. NEG: no people, no faces, no hands, no smartphones, no laptops, no tablets, no modern UI, no chrome, no plastic, no stock photo, no logos, no flat illustration, no 3D render, no HDR, no watermark. --ar 3:2 --style raw --quality 2
```

### A14 · `networth-archive-hero`

**File:** `net-worth.html:322` · **Aspect:** 16:9 wide · **Placement:** inside `.nw-hero`, between eyebrow and headline

```
PROMPT:
Vintage ledger / National Trust catalog register. Wide three-quarter macro of three leather-bound ledgers stacked spines-facing-camera on a walnut desk, gilt-embossed years readable on the spines ("1962", "1973", "1984" or similar period-correct), a single fountain pen laid horizontally across the topmost spine, warm raking afternoon light from camera-right at 25 degrees, soft shadow falling left, deep emerald-walnut bokeh background. The archive made physical. Phase One 80mm, f/5.6. ~25% negative space. NEG: no people, no faces, no hands, no smartphones, no laptops, no tablets, no modern UI, no chrome, no plastic, no stock photo, no logos, no flat illustration, no 3D render, no HDR, no watermark. --ar 16:9 --style raw --quality 2
```

### A15 · `cashflow-tide-band`

**File:** `cash-forecast.html:279` · **Aspect:** 21:7 panoramic · **Placement:** slim band masthead

```
PROMPT:
Vintage ledger / National Trust catalog register. Ultra-wide panoramic macro of weathered limestone harbour-wall tide marks — horizontal water-level rings visible on the stone, slight algae stain at the lowest line, single brass mooring ring bolted into the stone in the right third, water reflection blurred at the bottom edge. Soft Mediterranean overcast light from above. Phase One 50mm, f/8 (slightly deeper depth for this environmental). Money flowing in and out, measured by the marks left behind. NEG: no people, no faces, no hands, no smartphones, no laptops, no tablets, no modern UI, no chrome, no plastic, no stock photo, no logos, no flat illustration, no 3D render, no HDR, no watermark. --ar 21:7 --style raw --quality 2
```

### A16 · `salary-empty-envelope`

**File:** `salary-calculator.html:638` · **Aspect:** 4:3 · **Placement:** above empty-state copy

```
PROMPT:
Vintage ledger / National Trust catalog register. Three-quarter macro of an unopened cream pay-packet envelope on a leather desk blotter, embossed seal on the envelope reading "WAGES" in letterpress chestnut ink, a fountain pen laid at a 30-degree diagonal across the lower-right corner of the envelope, single warm side light from camera-left at 35 degrees, walnut woodgrain edge visible in the lower frame. Phase One 100mm macro, f/4. The negotiation moment, period-correct. ~35% negative space. NEG: no people, no faces, no hands, no smartphones, no laptops, no tablets, no modern UI, no chrome, no plastic, no stock photo, no logos, no flat illustration, no 3D render, no HDR, no watermark. --ar 4:3 --style raw --quality 2
```

### A17 · `recurring-csv-invitation`

**File:** `recurring.html:317` · **Aspect:** 4:3 · **Placement:** above "automatically finds every recurring charge"

```
PROMPT:
Vintage ledger / National Trust catalog register. Top-down macro of a folded period bank statement on cream-tinted paper held in place by a tarnished brass clip, faint pencil annotations in the margin, single dried olive leaf to the side, warm raking light from camera-right at 30 degrees casting a long shadow across the paper. The artifact the feature ingests, rendered as a hand-worked document. Phase One 100mm macro, f/4. ~25% negative space. NEG: no people, no faces, no hands, no smartphones, no laptops, no tablets, no modern UI, no chrome, no plastic, no stock photo, no logos, no real bank name, no real account numbers, no flat illustration, no 3D render, no HDR, no watermark. --ar 4:3 --style raw --quality 2
```

### A18 · `history-archive-eyebrow`

**File:** `history.html:248` · **Aspect:** 16:5 panoramic · **Placement:** thin band above first card row

```
PROMPT:
Vintage ledger / National Trust catalog register. Ultra-wide three-quarter macro of a library card-catalog wooden drawer pulled half-open, manila index card tabs visible in handwritten ink (period-correct ornamental script, never real names), brass drawer-pull handle catching warm light in the right third, mahogany cabinet woodgrain blurred behind. Single warm key from camera-right at 25 degrees. Your full history rendered as a real archive. Phase One 50mm, f/5.6, gentle environmental compression. NEG: no people, no faces, no hands, no smartphones, no laptops, no tablets, no modern UI, no chrome, no plastic, no stock photo, no logos, no flat illustration, no 3D render, no HDR, no watermark, no real names. --ar 16:5 --style raw --quality 2
```

### A19 · `journal-page-hero`

**File:** `journal.html:186` · **Aspect:** 16:9 · **Placement:** page-hero band above first journal card

```
PROMPT:
Vintage ledger / National Trust catalog register. Wide three-quarter macro of a worn Moleskine-style leather notebook open to a half-finished page, faint pencil entries visible (ornamental script, never real readable words), porcelain teacup with cobalt floral edge to the upper-right with black tea inside, brass paperclip on the open page, deep walnut desk woodgrain background slightly blurred. Warm afternoon side light from camera-right at 30 degrees. Private finance journaling, intimate scale. Phase One 80mm, f/5.6. NEG: no people, no faces, no hands, no smartphones, no laptops, no tablets, no modern UI, no chrome, no plastic, no stock photo, no logos, no flat illustration, no 3D render, no HDR, no watermark, no readable text. --ar 16:9 --style raw --quality 2
```

---

## Tier B — Auth & onboarding edges

### B1 · `auth-left-still-life`

**File:** `auth.html` (left auth panel) · **Aspect:** 3:4 portrait · **Placement:** background-foreground vignette in left panel

```
PROMPT:
Vintage ledger / National Trust catalog register. Portrait three-quarter macro of a single antique brass house key, fountain pen with gold band, and a small folded vellum letter arranged on aged cream paper with faint ledger rules, single warm raking light from camera-left at 35 degrees, soft long shadow falling to the right, background fades to deep emerald-walnut bokeh. The "you're about to begin" moment. Phase One 100mm macro, f/4. ~30% negative space at top. NEG: no people, no faces, no hands, no smartphones, no laptops, no tablets, no modern UI, no chrome, no plastic, no stock photo, no logos, no flat illustration, no 3D render, no HDR, no watermark. --ar 3:4 --style raw --quality 2
```

---

## Tier C — Public info pages

### C1 · `about-house-portrait`

**File:** `about.html:138` · **Aspect:** 16:10 · **Placement:** above the H1 inside `<main>`

```
PROMPT:
Vintage ledger / National Trust catalog register. Wide environmental shot of an interior of a stone-built late-Victorian ledger / counting room — arched stone window pouring soft golden afternoon light from the right onto a clerk's high standing desk with an open ledger and brass-tipped quill stand, deep emerald-and-walnut interior, dust motes barely visible in the light beam, ~50% negative space. The "quiet European forecasting house" made literal. Phase One 50mm, f/4. NEG: no people, no faces, no hands, no smartphones, no laptops, no tablets, no modern UI, no chrome, no plastic, no stock photo, no logos, no flat illustration, no 3D render, no HDR, no watermark. --ar 16:10 --style raw --quality 2
```

### C2 · `help-vade-mecum`

**File:** `help.html:100` · **Aspect:** 16:9 · **Placement:** above the eyebrow inside `main.help-main`

```
PROMPT:
Vintage ledger / National Trust catalog register. Wide three-quarter macro of a small leather-bound reference manual open with a red silk ribbon bookmark draped down the right page, gilt-edged page edges visible, gentle warm side light from camera-left at 35 degrees, walnut desk woodgrain background blurred. The help page as a vade mecum, not a FAQ. Phase One 80mm, f/5.6. NEG: no people, no faces, no hands, no smartphones, no laptops, no tablets, no modern UI, no chrome, no plastic, no stock photo, no logos, no flat illustration, no 3D render, no HDR, no watermark, no readable text. --ar 16:9 --style raw --quality 2
```

### C3 · `blog-featured-art`

**File:** `blog.html:453` · **Aspect:** 4:3 · **Placement:** replaces the inline SVG inside `.feat-img`

> The current featured post is "Avalanche method". This image is FOR the featured slot — re-shoot if the featured post topic changes.

```
PROMPT:
Vintage ledger / National Trust catalog register. Three-quarter macro of a steep slope of stacked period coins (bronze, brass, tarnished silver — graduated tones), warm candle flame in a brass holder casting low rim light from camera-right, light spills across the highest coins creating a chiaroscuro descent into shadow. A story-led "avalanche" without illustration. Phase One 100mm macro, f/4. Deep matte background. ~30% negative space upper-left. NEG: no people, no faces, no hands, no smartphones, no laptops, no tablets, no modern UI, no chrome, no plastic, no stock photo, no logos, no Bitcoin, no flat illustration, no 3D render, no HDR, no watermark. --ar 4:3 --style raw --quality 2
```

### C4 · `blog-debt-avalanche-method-hero`

**File:** `blog-debt-avalanche-method.html` (between `<article>` open and byline) · **Aspect:** 16:9

```
PROMPT:
Vintage ledger / National Trust catalog register. Wide three-quarter macro of a cross-section diorama of snowy mountains carved from cardstock, debt-ledger papers visible in the bottom strata of the model, single warm key light from camera-right at 30 degrees casting cool blue shadows in the snow side and warm amber in the paper strata. ~30% negative space at top. Phase One 80mm, f/5.6, gentle compression. NEG: no people, no faces, no hands, no smartphones, no laptops, no tablets, no modern UI, no chrome, no plastic, no stock photo, no logos, no flat illustration, no 3D render, no HDR, no watermark. --ar 16:9 --style raw --quality 2
```

### C5 · `blog-emergency-fund-hero`

**File:** `blog-emergency-fund.html` (between `<article>` open and byline) · **Aspect:** 16:9

```
PROMPT:
Vintage ledger / National Trust catalog register. Wide three-quarter macro of a single antique tin labeled "RESERVE" in letterpress chestnut ink, sitting on a wooden kitchen shelf, soft warm overhead light from the upper-right, faint linen tea-towel draped to the side, brass spice tin partly visible in the right third. Phase One 80mm, f/4. ~40% negative space at left. NEG: no people, no faces, no hands, no smartphones, no laptops, no tablets, no modern UI, no chrome, no plastic, no stock photo, no logos, no flat illustration, no 3D render, no HDR, no watermark. --ar 16:9 --style raw --quality 2
```

### C6 · `blog-index-funds-hero`

**File:** `blog-index-funds.html` (between `<article>` open and byline) · **Aspect:** 16:9

```
PROMPT:
Vintage ledger / National Trust catalog register. Wide environmental three-quarter shot of a wheat field of identical golden stalks at golden hour, each stalk nearly identical (the index analogy), distant single farmhouse silhouette on the horizon in the right third, warm low sun back-lighting from camera-right at 15 degrees. Phase One 50mm, f/8. ~30% negative space at top. NEG: no people, no faces, no hands, no smartphones, no laptops, no tablets, no modern UI, no chrome, no plastic, no stock photo, no logos, no flat illustration, no 3D render, no HDR, no watermark. --ar 16:9 --style raw --quality 2
```

### C7 · `blog-inflation-hero`

**File:** `blog-inflation.html` (between `<article>` open and byline) · **Aspect:** 16:9

```
PROMPT:
Vintage ledger / National Trust catalog register. Wide three-quarter macro of a wax-sealed letter from circa 1923 with a postage stamp clearly showing the denomination "1,000,000 Mark" or similar hyperinflation-era German stamp, letter rests on a marble desk corner, single warm raking light from camera-left at 30 degrees casting a long soft shadow. The historical inflation artifact, museum-quality. Phase One 100mm macro, f/4. ~30% negative space. NEG: no people, no faces, no hands, no smartphones, no laptops, no tablets, no modern UI, no chrome, no plastic, no stock photo, no logos, no flat illustration, no 3D render, no HDR, no watermark. --ar 16:9 --style raw --quality 2
```

### C8 · `blog-net-worth-hero`

**File:** `blog-net-worth.html` (between `<article>` open and byline) · **Aspect:** 16:9

```
PROMPT:
Vintage ledger / National Trust catalog register. Wide three-quarter macro of three leather-bound ledgers stacked horizontally on a walnut desk, a fountain pen with gold band laid diagonally across the top, gilt year-stamps visible on the spines (period-correct), brass paperweight in the lower-right corner. Warm raking afternoon light from camera-right at 30 degrees. Distinct framing from networth-archive-hero (this is wider, more environmental). Phase One 80mm, f/5.6. NEG: no people, no faces, no hands, no smartphones, no laptops, no tablets, no modern UI, no chrome, no plastic, no stock photo, no logos, no flat illustration, no 3D render, no HDR, no watermark. --ar 16:9 --style raw --quality 2
```

### C9 · `blog-50-30-20-hero`

**File:** `blog-50-30-20.html` (between `<article>` open and byline) · **Aspect:** 16:9

```
PROMPT:
Vintage ledger / National Trust catalog register. Three-quarter macro of three different-sized cream porcelain jars on a wooden kitchen counter — large jar labeled "NEEDS", medium labeled "WANTS", small labeled "SAVE" in letterpress chestnut ink, single small brass scoop visible to the side, warm overhead-right light at 30 degrees. The 50/30/20 rule rendered as a household ritual. Phase One 80mm, f/5.6. ~30% negative space. NEG: no people, no faces, no hands, no smartphones, no laptops, no tablets, no modern UI, no chrome, no plastic, no stock photo, no logos, no flat illustration, no 3D render, no HDR, no watermark, no piggy banks. --ar 16:9 --style raw --quality 2
```

### C10 · `blog-salary-negotiation-hero`

**File:** `blog-salary-negotiation.html` (between `<article>` open and byline) · **Aspect:** 16:9

```
PROMPT:
Vintage ledger / National Trust catalog register. Tight three-quarter macro of two cream business cards on a polished marble surface, one card pristine, the other cut precisely in half along the long edge (the "half" suggests an inadequate offer), single brass straight-edge ruler visible above showing the cut line, single warm raking light from camera-right at 35 degrees. Phase One 100mm macro, f/4. ~30% negative space. NEG: no people, no faces, no hands, no smartphones, no laptops, no tablets, no modern UI, no chrome, no plastic, no stock photo, no logos, no readable text on cards, no flat illustration, no 3D render, no HDR, no watermark. --ar 16:9 --style raw --quality 2
```

### C11 · `blog-wealth-building-hero` *(if/when this post exists)*

**File:** placeholder for a future post · **Aspect:** 16:9

```
PROMPT:
Vintage ledger / National Trust catalog register. Wide three-quarter macro long-exposure of a beeswax candle burning down through the night — wax melted into a soft pool, single warm flame motion-frozen with subtle smoke trail, deep matte black background, brass candle-holder visible in the lower third. The slow compounding of wealth made literal. Phase One 80mm, f/5.6. ~40% negative space above the flame. NEG: no people, no faces, no hands, no smartphones, no laptops, no tablets, no modern UI, no chrome, no plastic, no stock photo, no logos, no flat illustration, no 3D render, no HDR, no watermark. --ar 16:9 --style raw --quality 2
```

---

## Tier D — Standalone tools

### D1 · `takehome-result-coronation`

**File:** `tools/take-home-pay.html:310` · **Aspect:** 1:1 · **Placement:** left of `.result-hero`

```
PROMPT:
Vintage ledger / National Trust catalog register. Tight macro of a single neat banded stack of period banknotes on cream paper (banknotes are ornamental, never real currency — generic engraved bills), brass paperclip holding the band, single warm raking light from camera-left at 35 degrees, soft long shadow. The actual money that lands. Phase One 100mm macro, f/4. ~30% negative space. NEG: no people, no faces, no hands, no smartphones, no laptops, no tablets, no modern UI, no chrome, no plastic, no stock photo, no logos, no real currency, no political figures, no flat illustration, no 3D render, no HDR, no watermark. --ar 1:1 --style raw --quality 2
```

### D2 · `debt-strategy-vs-band`

**File:** `tools/debt-strategy.html:326` · **Aspect:** 21:6 panoramic · **Placement:** thin band above both strategy cards

```
PROMPT:
Vintage ledger / National Trust catalog register. Ultra-wide panoramic three-quarter macro of two stacks of stamped cream envelopes side by side on a walnut desk — left stack noticeably taller, both stacks neat and bound with brass clips, letterpress "INVOICE" stamp visible on the topmost envelope of each, single warm side light from camera-right at 30 degrees casting a unified long shadow. The two methods compared visually without illustration. Phase One 50mm, f/5.6, gentle compression. NEG: no people, no faces, no hands, no smartphones, no laptops, no tablets, no modern UI, no chrome, no plastic, no stock photo, no logos, no real names, no flat illustration, no 3D render, no HDR, no watermark. --ar 21:6 --style raw --quality 2
```

---

## Index — all 33 slot identifiers

For convenience when filing the generated `.webp` files in `assets/img/photos/`:

| # | Slot ID | Aspect | Tier | Page |
|---|---|---|---|---|
| 1 | `onboarding-welcome-vignette` | 4:3 | A | onboarding |
| 2 | `onboarding-complete-keepsake` | 1:1 | A | onboarding |
| 3 | `dashboard-upgrade-banner-flourish` | 1:1 | A | dashboard |
| 4 | `dashboard-masthead-band` | 16:5 | A | dashboard |
| 5 | `sage-welcome-portrait` | 1:1 | A | sage |
| 6 | `sage-empty-context` | 3:2 | A | sage |
| 7 | `portfolio-empty-vault` | 4:3 | A | portfolio |
| 8 | `portfolio-holdings-eyebrow` | 16:6 | A | portfolio |
| 9 | `scenarios-page-hero` | 21:9 | A | scenarios |
| 10 | `scenarios-empty-compass` | 3:2 | A | scenarios |
| 11 | `report-card-keepsake` | 4:5 | A | report-card |
| 12 | `debt-empty-quiet` | 4:3 | A | debt-optimizer |
| 13 | `goals-empty-horizon` | 3:2 | A | goals |
| 14 | `networth-archive-hero` | 16:9 | A | net-worth |
| 15 | `cashflow-tide-band` | 21:7 | A | cash-forecast |
| 16 | `salary-empty-envelope` | 4:3 | A | salary-calculator |
| 17 | `recurring-csv-invitation` | 4:3 | A | recurring |
| 18 | `history-archive-eyebrow` | 16:5 | A | history |
| 19 | `journal-page-hero` | 16:9 | A | journal |
| 20 | `auth-left-still-life` | 3:4 | B | auth |
| 21 | `about-house-portrait` | 16:10 | C | about |
| 22 | `help-vade-mecum` | 16:9 | C | help |
| 23 | `blog-featured-art` | 4:3 | C | blog index |
| 24 | `blog-debt-avalanche-method-hero` | 16:9 | C | blog post |
| 25 | `blog-emergency-fund-hero` | 16:9 | C | blog post |
| 26 | `blog-index-funds-hero` | 16:9 | C | blog post |
| 27 | `blog-inflation-hero` | 16:9 | C | blog post |
| 28 | `blog-net-worth-hero` | 16:9 | C | blog post |
| 29 | `blog-50-30-20-hero` | 16:9 | C | blog post |
| 30 | `blog-salary-negotiation-hero` | 16:9 | C | blog post |
| 31 | `blog-wealth-building-hero` | 16:9 | C | (future post) |
| 32 | `takehome-result-coronation` | 1:1 | D | tools/take-home-pay |
| 33 | `debt-strategy-vs-band` | 21:6 | D | tools/debt-strategy |

**Top 5 by impact** (drop-in ROI order — generate these first):
1. `onboarding-welcome-vignette` (every new user sees it first)
2. `onboarding-complete-keepsake` (final-step emotional payoff, screenshot moment)
3. `sage-welcome-portrait` (Pro's most-visited surface, humanises Sage)
4. `portfolio-empty-vault` (day-1 empty state for new Pro users)
5. `dashboard-upgrade-banner-flourish` (direct conversion lever, highest-traffic Pro surface)
