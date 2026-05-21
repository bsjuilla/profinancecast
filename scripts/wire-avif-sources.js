/**
 * wire-avif-sources.js — For the 4 photos that now have AVIF siblings,
 * inject a <source type="image/avif"> BEFORE the existing webp source
 * in every <picture> that references them. Browsers select sources
 * top-to-bottom by media + type acceptability; AVIF goes first so AVIF-
 * capable engines pick the smaller file, while older browsers fall
 * through to WebP and then the <img> src.
 *
 * Idempotent: skips files that already have an avif source for the slot.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const SLOTS = [
  'cashflow-tide-band',
  'onboarding-complete-keepsake',
  'portfolio-holdings-eyebrow',
  'onboarding-welcome-vignette',
];

function walk(dir, results) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) {
      if (f.name === 'node_modules' || f.name === '.git' || f.name === 'assets') continue;
      walk(p, results);
    } else if (f.name.endsWith('.html')) {
      results.push(p);
    }
  }
}

const files = [];
walk(ROOT, files);

let totalPatched = 0;
for (const file of files) {
  let src = fs.readFileSync(file, 'utf8');
  let changed = false;

  for (const slot of SLOTS) {
    // Match: <source srcset="...path/SLOT.webp" type="image/webp">
    // - Capture any path prefix (e.g. assets/img/photos/ or ../assets/img/photos/)
    const re = new RegExp(
      `(<source srcset="([^"]*?/)${slot}\\.webp" type="image/webp">)`,
      'g'
    );
    src = src.replace(re, (whole, fullTag, pathPrefix) => {
      // Skip if previous line already has avif for the same slot
      // (idempotency check) — look 200 chars back.
      const idx = src.indexOf(whole);
      const window = src.slice(Math.max(0, idx - 200), idx);
      if (window.includes(`${slot}.avif`)) return whole;
      const avifTag = `<source srcset="${pathPrefix}${slot}.avif" type="image/avif">\n        $&`;
      changed = true;
      totalPatched++;
      return `<source srcset="${pathPrefix}${slot}.avif" type="image/avif">\n        ${fullTag}`;
    });
  }

  if (changed) {
    fs.writeFileSync(file, src, 'utf8');
    console.log(`+ ${path.relative(ROOT, file)}`);
  }
}

console.log(`\nPatched ${totalPatched} <picture> blocks.`);
