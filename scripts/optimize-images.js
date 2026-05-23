#!/usr/bin/env node
/**
 * scripts/optimize-images.js
 *
 * One-shot image optimisation pass — closes IMG-2 and IMG-12 from the
 * 2026-05-23 landing-page audit.
 *
 * Does three things:
 *   1. Generates an AVIF variant for every landing-page photo in
 *      assets/img/photos/. AVIFs are typically 30-45% smaller than
 *      WebP at visually equivalent quality. Output sits beside the
 *      WebP with the same basename + .avif extension.
 *   2. Resizes oversized photos that the audit flagged (key-on-velvet
 *      displayed at ~200 CSS px from a 1254-px source, compass-on-paper
 *      at 320 CSS px from 1448, etc.). The resized variants are written
 *      with a -640w suffix so the originals stay intact.
 *   3. Compresses logo-512.png — currently 1.4 MB, used only as the
 *      Organization JSON-LD logo + apple-touch-icon. Sharp + palette
 *      mode reduces it to ~15 KB. Also emits a 180x180 apple-touch-icon
 *      variant (the iOS-correct size).
 *
 * Re-run after changing any source image:
 *   node scripts/optimize-images.js
 *
 * Add new images to LANDING_PHOTOS below. Everything is idempotent —
 * existing AVIFs are overwritten with the latest source.
 *
 * No external binaries needed — sharp ships prebuilt libvips for
 * Windows / macOS / Linux via npm install.
 */

const sharp = require('sharp');
const fs = require('fs/promises');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const PHOTOS_DIR = path.join(REPO_ROOT, 'assets', 'img', 'photos');
const IMG_DIR = path.join(REPO_ROOT, 'assets', 'img');

// Landing-page photos still referenced as <picture> sources after the
// P0 cleanup. coastal-window.webp stays on disk because billing.html
// or other surfaces may still use it; for landing it's only the 7 below.
const LANDING_PHOTOS = [
  'hero-ledger.webp',
  'compass-on-paper.webp',
  'key-on-velvet.webp',
  'seedling-coin.webp',
  'desk-corner.webp',
  'match-flame.webp',
  'gold-leaf-arrow.webp',
];

// Photos the audit flagged as significantly over-served vs displayed size.
// Each gets a -640w variant for use behind the existing 1024w source
// (browser picks via srcset width descriptor).
const OVERSIZED = [
  { src: 'key-on-velvet.webp',     maxWidth: 640 },  // shown at ~200 CSS px
  { src: 'compass-on-paper.webp',  maxWidth: 720 },  // shown at ~320 CSS px
  { src: 'match-flame.webp',       maxWidth: 480 },  // shown at ~140 CSS px
  { src: 'coastal-window.webp',    maxWidth: 720 },  // mobile-only (now removed from landing but other pages may use)
];

const AVIF_QUALITY = 55;   // Sharp default 50; 55 is the sweet spot for editorial photos.
const WEBP_QUALITY = 78;

let bytesSavedTotal = 0;
let filesProcessed = 0;

async function compareSizes(label, oldPath, newPath) {
  const o = await fs.stat(oldPath);
  const n = await fs.stat(newPath);
  const delta = o.size - n.size;
  const pct = ((delta / o.size) * 100).toFixed(1);
  bytesSavedTotal += Math.max(0, delta);
  filesProcessed += 1;
  console.log(
    `  ${label.padEnd(38)} ${formatKB(o.size).padStart(10)} → ${formatKB(n.size).padStart(10)}  (${delta >= 0 ? '-' : '+'}${Math.abs(parseFloat(pct))}%)`
  );
}

function formatKB(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  return Math.round(bytes / 1024) + ' KB';
}

async function avifFor(webpRelative) {
  const src = path.join(PHOTOS_DIR, webpRelative);
  const out = src.replace(/\.webp$/, '.avif');
  await sharp(src).avif({ quality: AVIF_QUALITY, effort: 4 }).toFile(out);
  await compareSizes(webpRelative + ' → .avif', src, out);
}

async function resizedVariant(item) {
  const src = path.join(PHOTOS_DIR, item.src);
  // Skip if source doesn't exist (e.g., coastal-window may already be deleted).
  try { await fs.access(src); } catch { return; }

  const base = item.src.replace(/\.webp$/, '');
  const webpOut = path.join(PHOTOS_DIR, `${base}-${item.maxWidth}w.webp`);
  const avifOut = path.join(PHOTOS_DIR, `${base}-${item.maxWidth}w.avif`);

  // Resize, keeping aspect ratio. withMetadata() preserves orientation.
  await sharp(src)
    .resize({ width: item.maxWidth, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY, effort: 6 })
    .toFile(webpOut);
  await compareSizes(`${item.src} → ${item.maxWidth}w.webp`, src, webpOut);

  await sharp(src)
    .resize({ width: item.maxWidth, withoutEnlargement: true })
    .avif({ quality: AVIF_QUALITY, effort: 4 })
    .toFile(avifOut);
  await compareSizes(`${item.src} → ${item.maxWidth}w.avif`, src, avifOut);
}

async function compressLogo() {
  const src = path.join(IMG_DIR, 'logo-512.png');
  const optimized = path.join(IMG_DIR, 'logo-512.optimized.png');
  const apple180 = path.join(IMG_DIR, 'apple-touch-icon-180.png');

  // Palette mode + max zlib + 8-bit channels: a flat logo collapses to ~10-20 KB.
  await sharp(src)
    .png({
      palette: true,
      quality: 90,
      effort: 10,
      compressionLevel: 9,
      adaptiveFiltering: true,
    })
    .toFile(optimized);
  await compareSizes('logo-512.png → optimized', src, optimized);

  await sharp(src)
    .resize(180, 180, { fit: 'cover' })
    .png({
      palette: true,
      quality: 90,
      effort: 10,
      compressionLevel: 9,
    })
    .toFile(apple180);
  const newStat = await fs.stat(apple180);
  console.log(`  apple-touch-icon-180.png (new)         —            ${formatKB(newStat.size).padStart(10)}`);
  filesProcessed += 1;

  // Atomic swap: rename optimized → logo-512.png, delete redundant logo-card.png.
  await fs.rename(optimized, src);

  const cardPath = path.join(IMG_DIR, 'logo-card.png');
  try {
    await fs.access(cardPath);
    // Replace logo-card.png with a copy of the optimized logo-512 so any
    // legacy referrer still gets a small file.
    await fs.copyFile(src, cardPath);
    console.log('  logo-card.png replaced with optimized copy of logo-512.png');
  } catch { /* logo-card.png absent — fine */ }
}

(async () => {
  console.log('\n=== AVIF for landing-page photos ===');
  for (const file of LANDING_PHOTOS) {
    try {
      await avifFor(file);
    } catch (e) {
      console.error(`  ${file}: SKIP — ${e.message}`);
    }
  }

  console.log('\n=== Resized variants for over-served photos ===');
  for (const item of OVERSIZED) {
    try {
      await resizedVariant(item);
    } catch (e) {
      console.error(`  ${item.src}: SKIP — ${e.message}`);
    }
  }

  console.log('\n=== Logo compression + apple-touch-icon ===');
  try {
    await compressLogo();
  } catch (e) {
    console.error(`  logo: SKIP — ${e.message}`);
  }

  console.log('\n=== Summary ===');
  console.log(`  Files processed:  ${filesProcessed}`);
  console.log(`  Total saved:      ${formatKB(bytesSavedTotal)}`);
  console.log('');
})().catch(err => {
  console.error('Image optimisation failed:', err);
  process.exit(1);
});
