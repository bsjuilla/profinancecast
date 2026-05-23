#!/usr/bin/env node
/**
 * scripts/wire-avif-sources.js
 *
 * Idempotent transform: for every HTML file at the repo root, finds
 * each `<source srcset="assets/img/photos/<name>.webp" type="image/webp">`
 * line and prepends a matching AVIF source line ABOVE it, but only if:
 *   (a) the corresponding .avif file actually exists on disk, AND
 *   (b) an AVIF source for the same image isn't already present.
 *
 * Why this is safer than per-file Edit calls:
 *   - One pass handles all 32 HTML files identically
 *   - Filename derivation is mechanical (.webp → .avif on same basename)
 *   - Existing AVIF references are detected and skipped
 *   - Original indentation is preserved character-for-character
 *   - --dry-run shows the diff before any file is touched
 *
 * Usage:
 *   node scripts/wire-avif-sources.js --dry-run    # preview, no writes
 *   node scripts/wire-avif-sources.js              # apply
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const PHOTOS_DIR = path.join(REPO_ROOT, 'assets', 'img', 'photos');
const DRY_RUN = process.argv.includes('--dry-run');

// Matches lines like:
//   <source srcset="assets/img/photos/foo.webp" type="image/webp">         (root pages)
//   <source srcset="../assets/img/photos/foo.webp" type="image/webp">      (tools/* pages)
// with optional whitespace. Capture: indent, path-prefix, basename.
const WEBP_SOURCE_RE = /^(\s*)<source\s+srcset="((?:\.\.\/)?)assets\/img\/photos\/([A-Za-z0-9_-]+)\.webp"\s+type="image\/webp">\s*$/;

const AVIF_LINE = (indent, prefix, basename) =>
  `${indent}<source srcset="${prefix}assets/img/photos/${basename}.avif" type="image/avif">`;

function avifExists(basename) {
  return fs.existsSync(path.join(PHOTOS_DIR, `${basename}.avif`));
}

function processFile(file) {
  const filePath = path.join(REPO_ROOT, file);
  const original = fs.readFileSync(filePath, 'utf8');
  const lines = original.split(/\r?\n/);
  const lineEnding = original.includes('\r\n') ? '\r\n' : '\n';

  const out = [];
  let inserted = 0;
  let skippedAlreadyPresent = 0;
  let skippedMissingAvif = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(WEBP_SOURCE_RE);

    if (m) {
      const [, indent, prefix, basename] = m;
      const avifLine = AVIF_LINE(indent, prefix, basename);

      // Idempotency: if previous output line is already this AVIF source, skip insertion.
      const prev = out.length > 0 ? out[out.length - 1] : '';
      const alreadyPresent = prev.trim() === avifLine.trim();

      if (alreadyPresent) {
        skippedAlreadyPresent += 1;
        out.push(line);
        continue;
      }

      if (!avifExists(basename)) {
        skippedMissingAvif += 1;
        out.push(line);
        continue;
      }

      out.push(avifLine);
      out.push(line);
      inserted += 1;
    } else {
      out.push(line);
    }
  }

  const updated = out.join(lineEnding);
  const changed = updated !== original;

  return {
    file,
    inserted,
    skippedAlreadyPresent,
    skippedMissingAvif,
    changed,
    updated,
    filePath,
  };
}

function walkHtmlFiles(dir, baseDir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      // Skip noise: node_modules, docs/, .git/, scripts/, api/, css/, js/.
      if (['node_modules', 'docs', '.git', 'scripts', 'api', 'css', 'js', 'assets', 'supabase'].includes(entry.name)) continue;
      walkHtmlFiles(path.join(dir, entry.name), baseDir, results);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      results.push(path.relative(baseDir, path.join(dir, entry.name)));
    }
  }
  return results;
}

function main() {
  const htmlFiles = walkHtmlFiles(REPO_ROOT, REPO_ROOT).sort();

  let totalInserted = 0;
  let totalSkippedPresent = 0;
  let totalSkippedMissing = 0;
  const changedFiles = [];

  for (const file of htmlFiles) {
    const r = processFile(file);
    totalInserted += r.inserted;
    totalSkippedPresent += r.skippedAlreadyPresent;
    totalSkippedMissing += r.skippedMissingAvif;

    if (r.inserted > 0 || r.skippedMissingAvif > 0) {
      console.log(
        `  ${file.padEnd(40)}  +${String(r.inserted).padStart(2)} avif` +
        (r.skippedAlreadyPresent ? `  (${r.skippedAlreadyPresent} already present)` : '') +
        (r.skippedMissingAvif ? `  (${r.skippedMissingAvif} skipped, AVIF missing)` : '')
      );
    }
    // Only write when an AVIF source was actually inserted. Comparing
    // `updated !== original` would also match line-ending normalisation
    // (split/join can mix LF/CRLF on Windows + git-autocrlf checkouts),
    // which produces noisy "modified" files with empty git diffs.
    if (r.inserted > 0 && !DRY_RUN) {
      fs.writeFileSync(r.filePath, r.updated);
      changedFiles.push(file);
    }
  }

  console.log('');
  console.log(`Total AVIF sources inserted:  ${totalInserted}`);
  console.log(`Already present (skipped):    ${totalSkippedPresent}`);
  console.log(`AVIF missing on disk:         ${totalSkippedMissing}`);
  console.log(`Files modified:               ${changedFiles.length}${DRY_RUN ? ' (DRY-RUN)' : ''}`);
}

main();
