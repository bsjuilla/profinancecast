/**
 * integrate-photos-batch-e.js — Tier-E batch (12 new vintage-ledger photos).
 *
 * Loaded the same `pic()` helper + insertion engine as integrate-photos.js
 * (sibling file). This script only contains the SLOTS table for Tier-E.
 *
 * Tier-E = the second wave: dashboard accents, report-card hero, debt A/B
 * eyebrow, blog mid-article still-lifes, auth success keepsake.
 *
 * Run:  node scripts/integrate-photos-batch-e.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function pic(slot, klass, alt, width, height, caption) {
  const figcaption = caption ? `\n  <figcaption>${caption}</figcaption>` : '';
  return `<figure class="pfc-photo-figure">
  <picture>
    <source srcset="assets/img/photos/${slot}.webp" type="image/webp">
    <img class="${klass}" src="assets/img/photos/${slot}.webp"
         alt="${alt}"
         loading="lazy" decoding="async"
         width="${width}" height="${height}">
  </picture>${figcaption}
</figure>`;
}

const SLOTS = [
  // E3 — report-card merit certificate as page-hero ABOVE the canvas card
  {
    file: 'report-card.html',
    anchor: '<div class="page-layout">',
    position: 'before',
    html: pic('report-card-merit-certificate', 'pfc-photo-hero',
      'Heirloom letterpress merit certificate on aged ivory linen with gilded olive-wreath border and chestnut wax seal — the report card as an heirloom.',
      1672, 941),
  },

  // E5 — debt avalanche vs snowball cinema-eyebrow above the Payoff strategy card
  {
    file: 'debt-optimizer.html',
    anchor: '<div class="card-title" style="margin-bottom:14px;">Payoff strategy</div>',
    position: 'before',
    html: pic('debt-avalanche-vs-snowball-still-life', 'pfc-photo-eyebrow is-cinema',
      'Two parallel rows of period coins on walnut — left graduated largest-to-smallest, right inverted, a brass ruler across the midline. Two methods compared as objects.',
      2174, 723),
  },

  // E9 — blog 50/30/20 mid-article triptych before "When it works"
  {
    file: 'blog-50-30-20.html',
    anchor: '<h2>When it works</h2>',
    position: 'before',
    html: pic('blog-50-30-20-jar-triptych', 'pfc-photo-square',
      'Three cream porcelain jars labeled NEEDS, WANTS, SAVE in letterpress chestnut ink on hand-torn linen — the rule made tactile, no charts.',
      1254, 1254),
  },

  // E10 — blog avalanche method, toppling-matches metaphor mid-article
  {
    file: 'blog-debt-avalanche-method.html',
    anchor: '<h2>Where avalanche underperforms',
    position: 'before',
    html: pic('blog-debt-avalanche-toppling-matches', 'pfc-photo-card',
      'A row of seven wooden matches mid-cascade on walnut — the avalanche metaphor made tactile.',
      1448, 1086),
  },

  // E11 — blog inflation fading-banknote before the three-numbers callout
  {
    file: 'blog-inflation.html',
    anchor: '<h2>Three numbers worth memorizing</h2>',
    position: 'before',
    html: pic('blog-inflation-fading-banknote', 'pfc-photo-card',
      'An ornamental ten-shilling-style banknote on marble, the right half faded sepia, the left half legible — a brass loupe resting on the decay.',
      1448, 1086),
  },

  // E6 — cash-forecast surplus envelope card next to the Ending cash KPI
  {
    file: 'cash-forecast.html',
    anchor: '<div class="kpi-sub" id="kpi-net-sub">What you keep this month</div>',
    position: 'after-parent-section',
    html: pic('cashflow-surplus-envelope', 'pfc-photo-card',
      'An aged cream envelope flap lifted to reveal an ornamental banknote corner and a dried olive sprig, letterpress SURPLUS stamp at upper-left.',
      1448, 1086),
  },

  // E1 — dashboard savings-rate beaker beside the insights row
  {
    file: 'dashboard.html',
    anchor: '<div id="insights-list">',
    position: 'before',
    html: pic('dashboard-savings-rate-vignette', 'pfc-photo-square',
      'An antique brass-and-glass laboratory beaker half-filled with bronze and gold coins on emerald velvet — savings rate as a measured pour.',
      1254, 1254),
  },

  // E2 — dashboard net-worth pullquote portrait inside the net-worth panel
  {
    file: 'dashboard.html',
    anchor: 'Net worth milestones',
    position: 'before',
    html: pic('dashboard-networth-pullquote', 'pfc-photo-portrait',
      'A hand-drawn graphite line chart on cream ledger paper ascending lower-left to upper-right, sharpened pencil with brass ferrule laid below — the trend, in ink.',
      1122, 1402),
  },

  // E4 — report-card overdue stamp (alternate state for F-grade users; renders alongside E3 for now as a smaller accent)
  // SKIPPED in this batch — needs conditional render based on score; defer to next session.

  // E7 — portfolio share-certificate close (4:3 card) — defer; needs portfolio empty-state context refinement
  // E8 — portfolio currency-triptych (16:5 eyebrow) — defer; needs FX widget anchor on portfolio
  // E12 — auth success-keepsake — defer; needs auth success-state DOM anchor identification
];

// ── Apply each slot ──────────────────────────────────────────────────
let ok = 0, fail = [], skipped = [];

function indentTo(text, indent) {
  return text.split('\n').map((l, i) => i === 0 ? l : indent + l).join('\n');
}

for (const s of SLOTS) {
  const file = path.join(ROOT, s.file);
  if (!fs.existsSync(file)) { fail.push(`${s.file}: not found`); continue; }
  const orig = fs.readFileSync(file, 'utf8');

  const slotMatch = s.html.match(/photos\/([^.\s]+)\.webp/);
  const slotId = slotMatch ? slotMatch[1] : null;
  if (slotId && orig.includes(`photos/${slotId}.webp`)) {
    skipped.push(`${s.file}/${slotId} (already integrated)`);
    continue;
  }

  const idx = orig.indexOf(s.anchor);
  if (idx === -1) {
    fail.push(`${s.file}: anchor not found: ${s.anchor.slice(0,60)}...`);
    continue;
  }
  const idx2 = orig.indexOf(s.anchor, idx + 1);
  if (idx2 !== -1) {
    fail.push(`${s.file}: anchor not unique: ${s.anchor.slice(0,60)}...`);
    continue;
  }

  const lineStart = orig.lastIndexOf('\n', idx) + 1;
  const indentMatch = orig.slice(lineStart, idx).match(/^\s*/);
  const indent = indentMatch ? indentMatch[0] : '';
  const blockIndented = indentTo(s.html, indent);

  let next;
  switch (s.position) {
    case 'before':
      next = orig.slice(0, lineStart) + indent + blockIndented + '\n' + orig.slice(lineStart);
      break;
    case 'after-parent-section': {
      // Walk forward to the nearest </div> at the same or lower indent as the parent
      // For simplicity, insert just after the line containing the anchor
      const lineEnd = orig.indexOf('\n', idx);
      const insertAt = lineEnd === -1 ? orig.length : lineEnd + 1;
      next = orig.slice(0, insertAt) + indent + blockIndented + '\n' + orig.slice(insertAt);
      break;
    }
    default:
      fail.push(`${s.file}: unknown position ${s.position}`);
      continue;
  }

  fs.writeFileSync(file, next, 'utf8');
  ok++;
  console.log(`+ ${s.file} [${slotId}]`);
}

console.log(`\nApplied ${ok} / ${SLOTS.length}`);
if (skipped.length) console.log(`\nSkipped (already integrated):\n  ` + skipped.join('\n  '));
if (fail.length) {
  console.log(`\nFailed:\n  ` + fail.join('\n  '));
  process.exit(1);
}
