# Vintage-Ledger Visual Vocabulary — ProFinanceCast Master Brief

**Status:** v1.0 · 2026-05-21
**Source:** Extracted from the existing 8 deployed photographs + the
inline CSS treatment in `index.html` (lines 1411–1552). Every new image
prompt INHERITS this brief verbatim — see "How to use" at the bottom.

---

## Subject vocabulary

The register is **the desk of a careful pre-1965 bookkeeper**: physical,
hand-worked, paper-and-brass. Every prompt must select objects from this
controlled list (or close kin) and stage them as *evidence* that math
used to be done by hand.

### Primary objects (canonized in existing photos)

- Leather-bound bank ledger with stitched spine and rounded corners
- Fountain pen with gold-banded barrel and exposed nib (ink fresh or smudged)
- Brass drafting compass, mid-draw
- Brass skeleton key
- Ivory ledger-grid paper (faint pink rules, light yellowing)
- Folded vellum sheet with letterpress formula
- Deep-emerald velvet cloth or velvet-lined display box
- Small letterpress card stamped with monospaced code (e.g. `AES-256`)
- Pressed olive sprig, dried
- Sharpened graphite pencil with brass ferrule
- Struck wooden kitchen match against pure black, motion-frozen smoke
- Three small ceramic bowls on natural linen weave, with bronze + gold coins
- Walnut or oak desk corner with visible grain
- Folded financial broadsheet (real chart with two lines, no logos)
- Porcelain teacup with cobalt-blue floral edge, black tea
- Vellum envelope sealed with chestnut-coloured wax monogram
- Cloth-bound vintage finance book in olive or moss with gilt-embossed title
- Open paper notebook on a marble window sill overlooking a blurred
  Mediterranean dawn (terracotta rooftops, pastel facades, hazy sea —
  Lisbon Alfama register)

### Permitted secondary props

Loupe; pocket watch on a chain; inkwell; blotter; sealing-wax stick;
brass paperclip; sextant detail; antique abacus bead; slide rule;
hand-drawn graphite line chart; brass dividers; weight balance; brass
typewriter key labeled with a single letter; pressed flower; bound
notebook spine.

### **Strictly absent** (negative prompt — must include in every generation)

People, hands, faces; smartphones, laptops, tablets, computer monitors;
modern UI, glass dashboards, neon; office furniture (Aeron chairs,
IKEA desks); plastic; printed thermal receipts; credit cards; stock
photography of "happy investors"; chrome; clean-room studio sweep;
clip-art icons; bank logos; emoji; physical cryptocurrency coins (no
Bitcoin medallions); contemporary tech bros; barcode / QR surfaces;
PowerPoint-style infographics; flat-design illustration.

---

## Lighting & atmosphere

**Single warm key light, raking from camera-left or camera-right at low
angle (~30–45° from horizontal). Soft falloff to a deep emerald-black or
walnut shadow.** Afternoon-light-through-a-shutter register — light has
direction and is *editorial*, never flat softbox.

Specific recurring lighting modes (mined from the 8 references):

| Mode | Recipe | When to use |
|---|---|---|
| **Velvet vitrine** | Single overhead-ish top-down key; framed black/deep-green void around the subject; specular pop on metal | Talismans, security/feature icons (`key-on-velvet`, `hero-ledger`) |
| **Desk raking** | Side light, low angle, long soft shadows across paper grid; warm woodgrain glow | Working-surface vignettes (`compass-on-paper`, `desk-corner`) |
| **Environmental dawn** | Golden-hour back-light; Mediterranean dawn; subject in cool foreground shadow with haze-lit pastel city beyond | Hero / mobile alt (`coastal-window`) |
| **Pure isolation** | Subject on absolute black with a single warm rim from its own light source | Iconic single objects (`match-flame`, `gold-leaf-arrow`) |

**Mood lexicon to include:** *quiet · considered · hushed · museum-vitrine · library · archive · candle-adjacent · late afternoon · Mediterranean dusk · hand-worked.*

**Mood lexicon to ban:** *bright · cheerful · energetic · vibrant · hi-tech · futuristic · dynamic · modern · sleek · app-like.*

---

## Composition & camera

- **Master aspect:** square 1024 × 1024 source for every generation.
  The site CSS crops to various final aspects (16:7 band, 4:5 CTA,
  1:1 bento, ~18:5 gold strip). **Place the subject so the central
  horizontal third still reads when cropped to 16:7 AND the central
  square still reads when cropped to 1:1.**
- **Framing:** rule-of-thirds for stagings (hero-ledger places the
  book central but the writing column lives in the left third). Tight
  macro for talismans. Wider three-quarter top-down for desk vignettes.
- **Camera signature:** medium-format-digital register (Phase One /
  Hasselblad), 80–100mm-equivalent macro. Gentle compression. Shallow
  but disciplined depth — focal subject razor-sharp, paper texture
  resolved; backgrounds dissolve to even velvet grain. **No fisheye,
  no wide-angle distortion, no tilt-shift miniature.**
- **Negative space:** ≥35% of the frame is "breathing room" — velvet,
  paper, or sky. The brand is restrained; the image must be too.
- **No text inside the image** unless it is hand-script ledger entries
  or letterpress (e.g. `Compound Interest 1962`, `FUTURE VALUE`,
  `AES-256`). Never UI text, never sans-serif callouts, never branded captions.

---

## Color & material palette

Lives in the dark-emerald site palette (`--canvas #0B1410`, `--ink #F0EDE2`,
`--money #2BB67D`, `--gold #D4AF6A`).

**Background field — pick ONE per image and commit:**
- Ink-emerald velvet (#0F2A1F → #1A3326)
- Walnut/oak woodgrain (#3B2A1C → #1A100A)
- Aged ivory parchment (#E8DFC6 → #C9B98E)
- Pure black (#000000)

**Hero metals:** champagne brass (#C9A45F → #D4AF6A) and warm gold leaf
ONLY. **Never silver, never chrome, never rose gold.** The accent
should never exceed ~10% of the pixel area (key, compass joint,
ferrule, gilt title).

**Living accent:** emerald appears only as velvet ground or pressed
olive — never as a tinted highlight or neon green. Gain-green is
reserved for the site's chart strokes, not photos.

**Forbidden colors:** electric blue, hot pink, purple, cyan, neon
green, fluorescent yellow, true white. Off-white is always warm-biased
(≥10% yellow).

**Materials, always:** patinated brass, oxidised gilt, leather
(cordovan/chestnut/oxblood), velvet (emerald/midnight), aged paper
(1880–1970 stocks), letterpress card, marble (Carrara, warm cream),
oiled walnut, linen weave.

**Materials, never:** anodized aluminium, glossy plastic, carbon
fibre, glass touchscreens, vinyl, acrylic, neon tubing, LED,
plexiglass.

---

## Treatment — CSS-side

What the page does to the image AFTER it lands. Authors must therefore
deliver photos that already *look correct without any filter*. **No
compensating filters are applied by the site.**

- **Containers:** `.pfc-photo-band` (full-bleed editorial), `.pfc-step-img`
  (in-step illustration), `.pfc-bento-img` (≤120px talisman),
  `.pfc-cta-img` (4:5 vertical), `.pfc-journal-masthead` (broad strip),
  `.pfc-strip-banner` (16:7 wide), `.pfc-hero-mobile-pic` (mobile 1:1),
  `.pfc-gold-arrow-strip` (decorative).
- **Aspect ratios per slot:** band 16:7, hero-mobile 1:1, bento 1:1
  capped 120px, CTA strip 4:5 capped 380px, journal masthead
  `clamp(140px,18vw,280px)` × full width, gold-arrow ~18:5 capped 280px.
- **Border-radius:** `var(--r-md)` (~14px) for band/journal/hero,
  `var(--r-sm)` for bento, `var(--r-lg)` for hero anchor.
- **Object-fit:** `cover` everywhere. Gold-arrow uses `opacity:0.85`
  and no radius.
- **No CSS filter, no sepia, no mix-blend-mode, no vignette overlay,
  no gradient fade-to-canvas, no drop-shadow.** Photos are delivered
  final-graded.
- **Caption type:** Fraunces italic, `clamp(15px,1.2vw,18px)`,
  `--ink-2`, 56ch, centred — every band photo may be followed by one
  italic caption sentence.

**Implication:** every new prompt must request the photo *already* with
vignette / warmth / film-grain baked in. No CSS safety net.

---

## Output specs

- **Format:** WebP, lossy, quality 80 (matches existing 8).
- **Resolution:** 1024 × 1024 native master.
- **Filename:** kebab-case noun phrase, e.g. `ledger-emerald-velvet.webp`,
  `seal-and-broadsheet.webp`. No timestamps. No version suffix.
- **Path:** `assets/img/photos/<slot-id>.webp` where `<slot-id>` is the
  slot identifier from the superprompts doc.
- **HTML envelope:** always `<picture>` with a `<source srcset>` and a
  fallback `<img>`; always explicit `width="1024" height="1024"`; always
  `loading="lazy" decoding="async"`; always a real descriptive `alt`
  (existing alts are ~25 words and read like museum captions — match that).

---

## Master negative prompt (append to every Midjourney/DALL-E request)

```
no people, no faces, no hands holding objects, no smartphones, no laptops,
no tablets, no computer monitors, no modern office, no glass UI, no neon,
no chrome, no plastic, no stock-photo register, no clip-art icons,
no emoji, no QR codes, no bank logos, no crypto medallions,
no Bitcoin imagery, no flat-design illustration, no 3D render look,
no AI-art uncanny gloss, no over-saturated color, no HDR,
no sun-flare lens artifacts, no watermark, no signature,
no text other than hand-script ledger entries or letterpress formulae,
no cheerful "money" clichés (jars of coins, dollar-sign sunglasses, piggy banks),
no clichéd growth metaphors (acorns→oaks, hockey-stick charts on tablets),
no people pointing at screens, no fintech app mockup
```

---

## How to use this brief

Every superprompt in `2026-05-21-superprompts.md` is composed of:

```
[Brief preamble — one line referencing this doc]
[Slot-specific subject + composition — 2-3 sentences]
[Master negative prompt — paste verbatim from above]
[Aspect ratio + style refs — Midjourney --ar flag, --style raw, etc.]
```

When Vercel deploys, the photographer / AI generator sees the same
constraint set every time. Drift across slots = breaks register.

---

## Reference inventory — what each existing photo teaches us

| File | What it canonizes | Slot |
|---|---|---|
| `hero-ledger.webp` | Brand totem: leather ledger + fountain pen on **deep emerald velvet**, top-down, hand-script `Compound Interest 1962`. Visual thesis. | `.pfc-photo-band` after credibility strip |
| `coastal-window.webp` | "European, considered, sun-warmed" environmental — open notebook on marble sill, blurred Lisbon-Alfama dawn beyond. | `.pfc-hero-mobile-pic` |
| `compass-on-paper.webp` | Tool-on-grid-paper register — brass drafting compass + letterpress `FUTURE VALUE` sheet + pressed olive, raking warm light. | `.pfc-step-img` (Step 02) |
| `gold-leaf-arrow.webp` | Decorative punctuation — single curved gold-leaf brushstroke on warm parchment. Confirms gold is the only accent. | `.pfc-gold-arrow-strip` |
| `key-on-velvet.webp` | Museum-vitrine register — brass skeleton key on emerald velvet box with letterpress card `AES-256`. | `.pfc-bento-img` (security) |
| `seedling-coin.webp` | Triptych-narrative on natural linen — empty → bronze coin → tarnished gold sovereign + olive sprig. "Progress over time". | `.pfc-strip-banner` (pricing) |
| `desk-corner.webp` | "Editorial / journal" register — walnut desk with financial broadsheet, porcelain teacup, wax-sealed envelope, cloth-bound *Intelligent Investor*. | `.pfc-journal-masthead` |
| `match-flame.webp` | Pure-black isolation, single warm flame, motion-frozen smoke. "Ignite / start" gesture. | `.pfc-cta-img` |

**Note:** `future-value-paper.webp` is referenced in the project spec
but **not on disk** — its formula appears inside `compass-on-paper.webp`.
Either commission a standalone tight-macro of the folded
`FV = PV × (1+r)^n` vellum sheet, or drop it from the inventory.
