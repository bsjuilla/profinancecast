/**
 * add-pattern-a-captions.js — Empty-Zone Pattern A fix.
 *
 * Adds a single Fraunces italic <figcaption> below every 480px-wide
 * .pfc-photo-hero figure on the 11 hero pages that have ~480px of bare
 * canvas on each side (researcher empty-zone audit, 2026-05-21).
 *
 * One line of italic text closes the visual gap without changing the
 * photo size or position.
 *
 * Idempotent: skips figures that already contain a <figcaption>.
 *
 * Run:  node scripts/add-pattern-a-captions.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Caption text per page. Each is a single line of editorial prose, voiced
// to fit the page's content, NOT the photo subject directly.
const CAPTIONS = [
  ['net-worth.html',                   'networth-archive-hero',       'The dashboard projects forward; this page records what has already happened.'],
  ['journal.html',                     'journal-page-hero',           'Practical writing, dated and private.'],
  ['scenarios.html',                   'scenarios-page-hero',         'Each scenario is a possible future, measured against the others.'],
  ['help.html',                        'help-vade-mecum',             'Answers to the questions people ask most.'],
  ['about.html',                       'about-house-portrait',        'A quiet European forecasting house — privacy-first, jargon-light.'],
  ['blog-emergency-fund.html',         'blog-emergency-fund-hero',    'A reserve is a household ritual, not a portfolio strategy.'],
  ['blog-50-30-20.html',               'blog-50-30-20-hero',          'The rule still works as a checkpoint — but the brackets have moved.'],
  ['blog-debt-avalanche-method.html',  'blog-debt-avalanche-method-hero', 'Mathematically optimal; behaviourally proven only sometimes.'],
  ['blog-index-funds.html',            'blog-index-funds-hero',       'Buy the haystack — not the needle.'],
  ['blog-inflation.html',              'blog-inflation-hero',         'Inflation does not announce itself. It accrues.'],
  ['blog-net-worth.html',              'blog-net-worth-hero',         'Tracking it is more important than maximising it.'],
  ['blog-salary-negotiation.html',     'blog-salary-negotiation-hero','Salary negotiation, in three honest moves.'],
];

let ok = 0, skip = 0, fail = [];

for (const [file, slot, caption] of CAPTIONS) {
  const fp = path.join(ROOT, file);
  if (!fs.existsSync(fp)) { fail.push(`${file}: not found`); continue; }
  let src = fs.readFileSync(fp, 'utf8');

  // Find the <picture>...<img class="...{slot}..."...></picture> block,
  // then the </picture> just after it, then check if a <figcaption>
  // already follows in the same figure. If yes, skip.
  const slotRe = new RegExp(`(<picture>[\\s\\S]*?${slot}\\.webp[\\s\\S]*?<\\/picture>)([\\s\\S]*?)(<\\/figure>)`, 'm');
  const m = src.match(slotRe);
  if (!m) { fail.push(`${file}: anchor picture for ${slot} not found`); continue; }
  if (/<figcaption/.test(m[2])) { skip++; continue; }

  // Detect indent — use the indent of </picture>.
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
