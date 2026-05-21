/**
 * swap-google-fonts.js — One-shot migration from Google Fonts CDN to
 * self-hosted woff2 via css/pfc-fonts.css.
 *
 * Removes from every HTML file:
 *   - <link rel="preconnect" href="https://fonts.googleapis.com" ...>
 *   - <link rel="preconnect" href="https://fonts.gstatic.com" ...>
 *   - <link rel="preload" as="style" href="https://fonts.googleapis.com/...">
 *   - <link rel="stylesheet" media="print" data-defer-style href="https://fonts.googleapis.com/...">
 *   - <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/..."></noscript>
 *
 * Inserts:
 *   - <link rel="stylesheet" href="css/pfc-fonts.css">  (one line)
 *
 * Path is "css/pfc-fonts.css" for root files, "../css/pfc-fonts.css" for
 * tools/*.html, "../../css/pfc-fonts.css" for tools/<sub>/*.html.
 *
 * Idempotent: skips files that already reference css/pfc-fonts.css.
 *
 * Run:  node scripts/swap-google-fonts.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function walk(dir, results) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (['node_modules', '.git', 'assets', 'scripts', 'api', 'js', 'css', 'docs'].includes(e.name)) continue;
      walk(path.join(dir, e.name), results);
    } else if (e.name.endsWith('.html')) {
      results.push(path.join(dir, e.name));
    }
  }
}

const files = [];
walk(ROOT, files);

function depthPrefix(relPath) {
  const depth = relPath.split(/[\\/]/).length - 1;
  if (depth === 0) return '';
  return '../'.repeat(depth);
}

let patched = 0, skipped = 0;
for (const file of files) {
  let src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);

  // We may need to strip remaining Google patterns even if css/pfc-fonts.css
  // is already present (e.g. a prior partial run). Only skip if the file
  // has NO Google refs at all.
  if (!src.includes('fonts.googleapis.com') && !src.includes('fonts.gstatic.com')) {
    skipped++; continue;
  }
  const hasLocal = src.includes('css/pfc-fonts.css');

  const prefix = depthPrefix(rel);
  const localFontsLink = `<link rel="stylesheet" href="${prefix}css/pfc-fonts.css">`;

  // Remove the 5 Google Fonts patterns. Keep the surrounding indentation.
  const patterns = [
    // preconnect googleapis
    /^[ \t]*<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com"[^>]*>[ \t]*\r?\n/gm,
    // preconnect gstatic
    /^[ \t]*<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com"[^>]*>[ \t]*\r?\n/gm,
    // preload as=style for fonts.googleapis
    /^[ \t]*<link rel="preload" as="style" href="https:\/\/fonts\.googleapis\.com\/[^"]*">[ \t]*\r?\n/gm,
    // print-onload swap with data-defer-style
    /^[ \t]*<link rel="stylesheet" media="print" data-defer-style href="https:\/\/fonts\.googleapis\.com\/[^"]*">[ \t]*\r?\n/gm,
    // noscript fallback
    /^[ \t]*<noscript><link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/[^"]*"><\/noscript>[ \t]*\r?\n/gm,
    // preload as=font (specific woff2 file URL, used in tools/<sub>/ pages)
    /^[ \t]*<link rel="preload" as="font" type="font\/woff2"[^>]*href="https:\/\/fonts\.gstatic\.com\/[^"]*"[^>]*>[ \t]*\r?\n/gm,
  ];

  let removed = 0;
  for (const re of patterns) {
    const before = src.length;
    src = src.replace(re, '');
    if (src.length !== before) removed++;
  }

  if (removed === 0) { skipped++; continue; }

  // Insert the local fonts <link> right before </head> ONLY if not
  // already present (idempotent across partial runs).
  if (!hasLocal) {
    src = src.replace(
      /^([ \t]*)<\/head>/m,
      `$1  ${localFontsLink}\n$1</head>`
    );
  }

  fs.writeFileSync(file, src, 'utf8');
  console.log(`+ ${rel} (removed ${removed} Google-Fonts patterns)`);
  patched++;
}

console.log(`\nPatched ${patched} files, skipped ${skipped}.`);
