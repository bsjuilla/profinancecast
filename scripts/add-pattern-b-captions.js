/**
 * add-pattern-b-captions.js — Empty-Zone Pattern B fix.
 *
 * Adds a Fraunces italic <figcaption> below each .pfc-photo-card figure
 * inside Pro empty-state cards (researcher audit Pattern B, 2026-05-21).
 *
 * These captions are SHORTER than Pattern A's — they sit inside a card,
 * not a full-width hero zone, so they need to read as a quiet sub-text
 * to the photo, not a page-level statement.
 *
 * Idempotent: skips figures that already contain a <figcaption>.
 *
 * Run:  node scripts/add-pattern-b-captions.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const CAPTIONS = [
  ['portfolio.html',          'portfolio-empty-vault',     'The vault is closed — for now.'],
  ['goals.html',              'goals-empty-horizon',       'A horizon, named.'],
  ['debt-optimizer.html',     'debt-empty-quiet',          'Paid in full, or not yet started.'],
  ['salary-calculator.html',  'salary-empty-envelope',     'The unopened envelope — your negotiation moment.'],
  ['recurring.html',          'recurring-csv-invitation',  'Statements ingested; charges surfaced.'],
];

let ok = 0, skip = 0, fail = [];

for (const [file, slot, caption] of CAPTIONS) {
  const fp = path.join(ROOT, file);
  if (!fs.existsSync(fp)) { fail.push(`${file}: not found`); continue; }
  let src = fs.readFileSync(fp, 'utf8');

  // Find the <picture>…<img class=…{slot}…</picture> then </figure>.
  const slotRe = new RegExp(`(<picture>[\\s\\S]*?${slot}\\.webp[\\s\\S]*?<\\/picture>)([\\s\\S]*?)(<\\/figure>)`, 'm');
  const m = src.match(slotRe);
  if (!m) { fail.push(`${file}: anchor picture for ${slot} not found`); continue; }
  if (/<figcaption/.test(m[2])) { skip++; continue; }

  // Detect indent — use indent of the matching block start
  const idx = src.indexOf(m[0]);
  const lineStart = src.lastIndexOf('\n', idx) + 1;
  const indentMatch = src.slice(lineStart, idx).match(/^(\s*)/);
  const indent = indentMatch ? indentMatch[1] : '    ';

  const figCaption = `\n${indent}  <figcaption>${caption}</figcaption>`;
  const next = src.slice(0, idx + m[1].length) + figCaption + src.slice(idx + m[1].length);
  fs.writeFileSync(fp, next, 'utf8');
  console.log(`+ ${file} [${slot}]`);
  ok++;
}

console.log(`\nApplied ${ok} / ${CAPTIONS.length} (skipped ${skip} already-captioned)`);
if (fail.length) { console.log('\nFailed:\n  ' + fail.join('\n  ')); process.exit(1); }
