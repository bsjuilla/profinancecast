/**
 * check-photo-idempotency.js — Sanity check that no photo slot has been
 * double-integrated into the same HTML file.
 *
 * The integration scripts (integrate-photos.js, integrate-photos-batch-e.js)
 * are SUPPOSED to be idempotent — they skip slots already present. This
 * check verifies that property by:
 *   1. Walking every HTML file in the deployed repo.
 *   2. Counting occurrences of each `assets/img/photos/<slot>.webp` reference.
 *   3. Failing CI (exit 1) if any (file, slot) pair appears more than once.
 *
 * Caveat: a single <picture> contains both a <source srcset=...> and an
 * <img src=...> for the same slot, so the raw count per slot is normally 2
 * (one source + one img). The threshold is therefore "more than 2 per
 * <figure>". We detect this by counting <figure> blocks per slot instead.
 *
 * Run:  node scripts/check-photo-idempotency.js
 * Exit: 0 if clean, 1 if any double-integration found.
 *
 * Origin: VPE bus-factor item #10 in the 2026-05-21 synthesis queue.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'assets', 'scripts', 'docs', 'api']);

function walk(dir, results) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), results);
    } else if (entry.name.endsWith('.html')) {
      results.push(path.join(dir, entry.name));
    }
  }
}

const files = [];
walk(ROOT, files);

let failures = 0;
let totalFiguresChecked = 0;

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');

  // Find every <figure class="pfc-photo-figure"> ... </figure> block.
  const figureRe = /<figure class="pfc-photo-figure"[^>]*>[\s\S]*?<\/figure>/g;
  const figures = src.match(figureRe) || [];
  totalFiguresChecked += figures.length;

  // For each figure, extract the slot id from its first photos/SLOT.webp.
  const slotCounts = {};
  for (const fig of figures) {
    const m = fig.match(/photos\/([a-z0-9-]+)\.webp/);
    if (!m) continue;
    const slot = m[1];
    slotCounts[slot] = (slotCounts[slot] || 0) + 1;
  }

  // Slots appearing more than once in this file => double-integration.
  for (const [slot, count] of Object.entries(slotCounts)) {
    if (count > 1) {
      console.error(`  FAIL ${path.relative(ROOT, file)}: slot "${slot}" appears in ${count} <figure> blocks`);
      failures++;
    }
  }
}

console.log(`\nChecked ${totalFiguresChecked} <figure> blocks across ${files.length} HTML files.`);

if (failures > 0) {
  console.error(`\n${failures} double-integration(s) found. Re-run integrate-photos.js's idempotency guard.`);
  process.exit(1);
}

console.log('OK: no double-integrations.');
