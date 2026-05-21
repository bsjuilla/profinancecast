"""
generate-avif-siblings.py — AVIF compression for the 4 largest WebPs.

AVIF typically saves another ~30% on top of WebP Q80. Adding an
<source type="image/avif"> BEFORE the WebP source in <picture> lets
modern browsers pick AVIF and old browsers fall back to WebP.

Targets the four photos identified in the 2026-05-21 perf audit:
  - cashflow-tide-band.webp           (425 KB)
  - onboarding-complete-keepsake.webp (211 KB)
  - portfolio-holdings-eyebrow.webp   (225 KB)
  - onboarding-welcome-vignette.webp  (268 KB)

Pillow's WebP/AVIF support requires `pillow_avif` plugin OR Pillow 10.2+
with libavif. Falls back to a no-op + warning if unavailable.

Run:  python scripts/generate-avif-siblings.py
"""
import os
from pathlib import Path

try:
    from PIL import Image
    try:
        import pillow_avif  # registers the AVIF plugin
        AVIF_OK = True
    except ImportError:
        # Newer Pillow ships AVIF natively
        from PIL import features
        AVIF_OK = features.check_module('avif') if hasattr(features, 'check_module') else False
        if not AVIF_OK:
            # Try a probe save
            try:
                Image.new('RGB', (4, 4)).save('/tmp/_probe.avif')
                os.remove('/tmp/_probe.avif')
                AVIF_OK = True
            except Exception:
                AVIF_OK = False
except ImportError:
    print('ERROR: Pillow not installed. pip install Pillow pillow-avif-plugin')
    raise SystemExit(2)

REPO = Path(__file__).resolve().parent.parent
PHOTOS = REPO / 'assets' / 'img' / 'photos'

TARGETS = [
    'cashflow-tide-band.webp',
    'onboarding-complete-keepsake.webp',
    'portfolio-holdings-eyebrow.webp',
    'onboarding-welcome-vignette.webp',
]

if not AVIF_OK:
    print('WARN: AVIF encoder not available in this Pillow build.')
    print('      Install: pip install pillow-avif-plugin')
    print('      Skipping AVIF generation; <source type="image/avif"> not added.')
    raise SystemExit(0)

ok = 0
for fname in TARGETS:
    src = PHOTOS / fname
    if not src.exists():
        print(f'  MISS {fname}')
        continue
    dst = src.with_suffix('.avif')
    if dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime:
        print(f'  SKIP {fname} (avif already up-to-date)')
        ok += 1
        continue
    img = Image.open(src).convert('RGB')
    # AVIF quality ~60 typically matches WebP Q80 perceptually at ~30% smaller.
    img.save(dst, 'AVIF', quality=60, speed=6)
    src_kb = src.stat().st_size // 1024
    dst_kb = dst.stat().st_size // 1024
    delta = 100 - int(dst_kb * 100 / src_kb)
    print(f'  OK  {fname} -> {dst.name}   {src_kb}KB -> {dst_kb}KB  ({delta}% saved)')
    ok += 1

print(f'\nGenerated {ok} / {len(TARGETS)} AVIF siblings')
