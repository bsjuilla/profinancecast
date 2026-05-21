# scripts/ — photo + verification tooling

This directory holds the maintenance scripts that live alongside the deployed
ProFinanceCast app. They are intentionally inside `profinancecast/` (not a
sibling dir) so they ship with the repo and stay visible to anyone who clones it.

## integrate-photos.js (Tier-A through Tier-D)
The original 33-slot integration. Each slot in the `SLOTS` table declares:
- `file`: HTML file under `profinancecast/`
- `anchor`: a unique text fragment to locate in that file
- `position`: one of `before` · `after-opening-tag` · `before-parent-card` ·
  `before-parent-section` · `after-parent-section` · `replace-after-tag` ·
  `replace-inner`
- `html`: the `<figure><picture><img>` block to insert (auto-indented to the
  anchor's column)

Idempotent — skips a slot if its WebP filename is already present in the file.

Run:
```
node scripts/integrate-photos.js
```

## integrate-photos-batch-e.js (Tier-E, second wave)
The 12 new vintage-ledger photos generated 2026-05-21. Same engine, separate
SLOTS table so each tier is auditable on its own. 8 of 12 currently integrated;
4 are deferred (E4, E7, E8, E12) because they need more nuanced placement
(conditional rendering by score, per-page-specific layouts).

Run:
```
node scripts/integrate-photos-batch-e.js
```

## Photo class taxonomy

Six base classes in `css/pfc-photos.css`:

| Class | Aspect | Max-width | Use |
|---|---|---|---|
| `.pfc-photo-band` | 16:7 | 920 px | Section dividers (landing only) |
| `.pfc-photo-hero` | 16:9 | 480 px | Page-hero (or `.is-wide` 21:9 / `.is-cinema` 21:7) |
| `.pfc-photo-eyebrow` | 16:5 | 640 px | Thin strip above content (or `.is-cinema` 21:6, `.is-tide` 21:7) |
| `.pfc-photo-card` | 4:3 | 320 px | Inside cards, empty-states |
| `.pfc-photo-portrait` | 4:5 | 220 px | CTAs, auth side panel (or `.is-tall` 3:4) |
| `.pfc-photo-square` | 1:1 | 200 px | Talisman (or `.sm` 96px / `.md` 160px) |

All photos must:
- Ship as WebP at quality 80
- Include explicit `width` + `height` HTML attrs (CLS prevention)
- Use `loading="lazy"` and `decoding="async"`
- Have descriptive editorial alt text in the vintage-ledger register

The full visual brief is at `docs/superpowers/audits/2026-05-21-vintage-ledger-brief.md`.

## Adding a new photo slot

1. Generate the WebP (Midjourney v6 with `--style raw --v 6 --ar X:Y`,
   inheriting the master brief).
2. Convert PNG → WebP at quality 80 (see `scripts/convert-batch-e.py` for the
   Pillow pattern).
3. Save to `profinancecast/assets/img/photos/<slot-id>.webp`.
4. Add an entry to either `integrate-photos.js` SLOTS or
   `integrate-photos-batch-e.js` SLOTS depending on the tier.
5. Run the script. It's idempotent — re-running just skips already-integrated
   slots.
6. Verify visually with `screenshot-photos.py` (requires `$env:AUDIT_BYPASS_TOKEN`).

## convert-batch-e.py
One-shot batch converter for the 12 Tier-E PNGs from Downloads → repo WebPs.
Self-contained, no args.

```
python scripts/convert-batch-e.py
```

## screenshot-photos.py
Playwright harness that loads each modified page with the audit-bypass cookie
pre-set, captures full-page screenshots, and flags any `<figure>` with width
> 1100px or off-viewport positioning. Reads `AUDIT_BYPASS_TOKEN` from env.
This is the script the visual-regression CI workflow
(`.github/workflows/visual-regression.yml`) runs post-deploy on every push
to `main`.

Run locally:
```
$env:AUDIT_BYPASS_TOKEN = "..."   # PowerShell
python scripts/screenshot-photos.py
```

## Other (kept in `/scripts/` outside this repo for historical reasons)
- `verify-live.py` — post-deploy CSP + 200-status sanity check.
- `verify-sprint1.py`, `verify-sprint2.py`, `verify-sprint3.py` — older
  per-sprint Playwright checks.

These can be migrated in if needed; they're not on any automation hot path.
