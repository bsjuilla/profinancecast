# Photo Class Taxonomy
**Updated:** 2026-05-21 · **Lives in:** `css/pfc-photos.css`

Six base classes govern every photo on the site. They were tuned in two
visual-QA rounds (2026-05-21) to feel like **editorial accents**, never
like billboards. The vintage-ledger visual brief is at
[`docs/superpowers/audits/2026-05-21-vintage-ledger-brief.md`](superpowers/audits/2026-05-21-vintage-ledger-brief.md).

## Quick reference

| Class | Aspect | Max-width | Typical use |
|---|---|---|---|
| `.pfc-photo-band` | 16:7 | **920 px** | Section dividers — landing page only |
| `.pfc-photo-hero` | 16:9 | **480 px** | Page-hero accent above an h1 |
| `.pfc-photo-hero.is-wide` | 21:9 | 560 px | Wider hero variant |
| `.pfc-photo-hero.is-cinema` | 21:7 | 620 px | Widest hero variant |
| `.pfc-photo-eyebrow` | 16:5 | **640 px** | Thin band above content |
| `.pfc-photo-eyebrow.is-tall` | 16:6 | 640 px | Slightly taller eyebrow |
| `.pfc-photo-eyebrow.is-cinema` | 21:6 | 720 px | Cinema eyebrow |
| `.pfc-photo-eyebrow.is-tide` | 21:7 | 720 px | Tide-band variant |
| `.pfc-photo-card` | 4:3 | **320 px** | Inside cards, empty-states |
| `.pfc-photo-portrait` | 4:5 | **220 px** | CTAs, auth side panel |
| `.pfc-photo-portrait.is-tall` | 3:4 | 220 px | Taller portrait variant |
| `.pfc-photo-square` | 1:1 | **200 px** | Talisman (default) |
| `.pfc-photo-square.sm` | 1:1 | 96 px | Inline icon-scale square |
| `.pfc-photo-square.md` | 1:1 | 160 px | Mid-scale square |

All photos:
- Ship as WebP at quality 80 (master source).
- Optionally have an AVIF sibling at quality 60 for ~25-30% bandwidth saving.
- Include explicit HTML `width` + `height` attrs on `<img>` (CLS prevention).
- Use `loading="lazy"` + `decoding="async"`.
- Have descriptive editorial alt text in the vintage-ledger register.

## Canonical markup

```html
<figure class="pfc-photo-figure">
  <picture>
    <source srcset="assets/img/photos/slot-id.avif" type="image/avif">
    <source srcset="assets/img/photos/slot-id.webp" type="image/webp">
    <img class="pfc-photo-hero" src="assets/img/photos/slot-id.webp"
         alt="Descriptive editorial caption in the vintage-ledger register."
         loading="lazy" decoding="async"
         width="1672" height="941">
  </picture>
  <figcaption>Optional Fraunces italic caption.</figcaption>
</figure>
```

Note: the photo class lives on the `<img>` itself, **not** a wrapper div.
CSS uses `img.pfc-photo-* { width: 100% !important; height: auto !important }`
to let the CSS `aspect-ratio` rule drive the layout box even when the
`<img>` carries HTML `width`/`height` attrs (which would otherwise win).

## When to pick which class

- **`.pfc-photo-hero`** — top-of-page, above h1. Use sparingly: one hero per
  page. If the topbar already carries the title, the hero goes INSIDE
  `.content` immediately below the topbar, never above it (the 2026-05-21
  visual-QA round found that above-topbar heroes overshadow the title).
- **`.pfc-photo-eyebrow`** — section divider OR thin masthead band. Goes
  above sub-section h2s. The `.is-tide` variant (21:7) reads as a
  panoramic; reserve for high-conversion surfaces like cash-forecast.
- **`.pfc-photo-card`** — empty-state cards or content-card insertions.
  Centered (`margin: 0 auto`); 4:3 aspect keeps cards landscape-balanced.
- **`.pfc-photo-portrait`** — auth side panel, two-column splits where one
  side is vertical.
- **`.pfc-photo-square`** — talisman / decorative accent. Default 200px
  feels right beside KPI cards; bump to `.md` 160px for inline badges or
  `.sm` 96px for icon-scale uses.

## Eyebrow companion class

`.pfc-eyebrow-mono` (also in pfc-photos.css) is the JetBrains Mono small-caps
gold tag that goes **above** every page title or section heading. Codified
in [`STYLE-GUIDE.md`](STYLE-GUIDE.md) Rule 1. Format: `Category · Subject`.

## Adding a new photo slot

1. Generate via Midjourney v6 (master brief inherited via the
   2026-05-21 superprompts file).
2. Convert PNG → WebP at quality 80 (see `scripts/convert-batch-e.py`).
3. If the file exceeds 200 KB, also generate an AVIF sibling
   (`scripts/generate-avif-siblings.py`).
4. Save to `assets/img/photos/<slot-id>.webp`.
5. Add an entry to `scripts/integrate-photos.js` (Tier A-D) or
   `scripts/integrate-photos-batch-e.js` (Tier E and later).
6. Run the script. Idempotent — re-running skips already-integrated slots.
7. Verify visually with `scripts/screenshot-photos.py` (requires the
   `AUDIT_BYPASS_TOKEN` env var matching the Vercel value).
