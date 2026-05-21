/**
 * integrate-photos.js — Batch HTML insertions for the 33 image slots.
 *
 * Each entry says:
 *   file:      path relative to profinancecast/
 *   anchor:    text/regex to find in the file (must match exactly once)
 *   position:  'before' | 'after' (insert relative to anchor)
 *   html:      the markup to insert (auto-indented to the anchor's indent)
 *
 * If a slot needs more nuance, it's left out of this batch and handled inline.
 *
 * Run:  node scripts/integrate-photos.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'profinancecast');

// Helper to build a standard <figure> with WebP + alt
function pic(slot, klass, alt, width, height, caption) {
  const figcaption = caption
    ? `\n  <figcaption>${caption}</figcaption>`
    : '';
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
// tools/* needs ../assets path
function picTools(slot, klass, alt, width, height) {
  return `<figure class="pfc-photo-figure">
  <picture>
    <source srcset="../assets/img/photos/${slot}.webp" type="image/webp">
    <img class="${klass}" src="../assets/img/photos/${slot}.webp"
         alt="${alt}"
         loading="lazy" decoding="async"
         width="${width}" height="${height}">
  </picture>
</figure>`;
}

const SLOTS = [
  // ── TIER A: Pro-gated ────────────────────────────────────────────────
  {
    file: 'onboarding.html',
    anchor: '<h2 class="step-heading">First, tell us about yourself</h2>',
    position: 'before',
    html: pic('onboarding-welcome-vignette', 'pfc-photo-card',
      'Pressed olive sprig, two folded ivory letters, and a chestnut-wax-sealed envelope arranged on hand-torn cream linen paper — quiet welcome.',
      1448, 1086,
      'Open the books. The first page is the hardest.'),
  },
  {
    file: 'onboarding.html',
    // Just before the success step (step 6) — find the completion heading
    anchor: 'id="complete-name"',
    position: 'before',
    html: pic('onboarding-complete-keepsake', 'pfc-photo-square',
      'Antique brass skeleton key resting beside a chestnut-wax-sealed vellum envelope on aged ivory paper — your account, sealed.',
      1254, 1254,
      'Welcome aboard. Your forecast is ready.'),
  },
  {
    file: 'dashboard.html',
    anchor: '<div class="upgrade-text">',
    position: 'before',
    html: pic('dashboard-upgrade-banner-flourish', 'pfc-photo-square',
      'A single antique gilded brass key on deep emerald velvet — what Pro unlocks.',
      1254, 1254) + '\n      ',
  },
  {
    file: 'sage.html',
    anchor: '<div class="welcome-avatar">S</div>',
    position: 'before',
    html: pic('sage-welcome-portrait', 'pfc-photo-square',
      'Brass-banded fountain pen laid across a leather-bound notebook on emerald velvet — Sage as patient counsel.',
      1254, 1254),
  },
  {
    file: 'portfolio.html',
    anchor: '<strong>No holdings yet</strong>',
    position: 'before',
    html: pic('portfolio-empty-vault', 'pfc-photo-card',
      'Closed brass-bound deposit box on aged oak — the vault before anything goes in.',
      1448, 1086),
  },
  {
    file: 'portfolio.html',
    anchor: '<table class="holdings-table" id="pf-table">',
    position: 'before',
    html: pic('portfolio-holdings-eyebrow', 'pfc-photo-eyebrow is-tall',
      'Row of antique paper share certificates fanned out on walnut desk — positions, period-correct.',
      2048, 768),
  },
  {
    file: 'scenarios.html',
    anchor: '<div class="empty-state-icon">',
    position: 'before',
    html: pic('scenarios-empty-compass', 'pfc-photo-card',
      'Antique brass navigation dividers mid-step across an aged nautical chart — measuring possible futures.',
      1536, 1024),
  },
  {
    file: 'report-card.html',
    anchor: 'Pro removes the watermark',
    position: 'before',
    html: pic('report-card-keepsake', 'pfc-photo-portrait',
      'Framed letterpress merit certificate on aged ivory — the report card as an heirloom.',
      1122, 1402) + '\n            ',
  },
  {
    file: 'debt-optimizer.html',
    anchor: 'Add your loans, credit cards',
    position: 'before',
    html: pic('debt-empty-quiet', 'pfc-photo-card',
      'Snuffed wooden match beside an envelope stamped PAID — debts on the verge of being put to rest.',
      1448, 1086),
  },
  {
    file: 'goals.html',
    // Empty state — find a stable selector
    anchor: 'No goals yet',
    position: 'before',
    html: pic('goals-empty-horizon', 'pfc-photo-card',
      'Distant lighthouse seen through an arched Mediterranean window at dusk — what you walk toward.',
      1536, 1024),
  },
  {
    file: 'net-worth.html',
    // Find the hero section
    anchor: 'class="nw-hero',
    position: 'replace-after-tag',
    html: pic('networth-archive-hero', 'pfc-photo-hero',
      'Three leather-bound ledgers stacked spines-facing-camera on walnut desk, gilt years readable — the archive made physical.',
      1672, 941),
  },
  {
    file: 'cash-forecast.html',
    anchor: '<div class="tb-title">Cash forecast</div>',
    position: 'before-parent-section',
    html: pic('cashflow-tide-band', 'pfc-photo-eyebrow is-tide',
      'Weathered limestone harbour-wall tide marks with brass mooring ring — money flowing in and out, measured.',
      2171, 724),
  },
  {
    file: 'salary-calculator.html',
    anchor: 'id="empty-state"',
    position: 'after-opening-tag',
    html: pic('salary-empty-envelope', 'pfc-photo-card',
      'Unopened pay-packet envelope stamped WAGES with fountain pen across — the negotiation moment, period-correct.',
      1448, 1086),
  },
  {
    file: 'recurring.html',
    anchor: 'automatically finds every recurring',
    position: 'before-parent-card',
    html: pic('recurring-csv-invitation', 'pfc-photo-card',
      'Folded period bank statement held in a brass clip with pencil annotations — the artifact this feature ingests.',
      1448, 1086),
  },
  {
    file: 'history.html',
    anchor: '<div class="tb-title">',
    position: 'after-parent-section',
    html: pic('history-archive-eyebrow', 'pfc-photo-eyebrow',
      'Library card-catalog drawer pulled half-open with manila tabs — your full history rendered as a real archive.',
      2243, 701),
  },
  {
    file: 'journal.html',
    anchor: '<div class="tb-title">',
    position: 'after-parent-section',
    html: pic('journal-page-hero', 'pfc-photo-hero',
      'Worn Moleskine open to a half-finished page beside a cobalt-edged teacup — private finance journaling.',
      1672, 941),
  },
  {
    file: 'dashboard.html',
    anchor: '<div class="tabs">',
    position: 'before',
    html: pic('dashboard-masthead-band', 'pfc-photo-eyebrow',
      'Leather-bound ledger spine in profile on walnut desk, gilt-embossed roman numerals MCMLXII — the front page register for your dashboard.',
      2243, 701) + '\n    ',
  },
  {
    file: 'sage.html',
    anchor: 'Your numbers aren\'t in yet',
    position: 'before',
    html: pic('sage-empty-context', 'pfc-photo-card',
      'Open blank ledger page with fountain pen across the right page — the page is receptive, not blank.',
      1536, 1024),
  },
  {
    file: 'scenarios.html',
    anchor: '<div class="topbar"',
    position: 'before',
    html: pic('scenarios-page-hero', 'pfc-photo-hero is-wide',
      'Antique mercury weather glass on polished marble with brass calibration ring — the instrument that measures possible futures.',
      1915, 821) + '\n  ',
  },

  // ── TIER B: Auth ─────────────────────────────────────────────────────
  {
    file: 'auth.html',
    anchor: '<div class="left-content"',
    position: 'before',
    html: pic('auth-left-still-life', 'pfc-photo-portrait is-tall',
      'Antique brass house key, fountain pen, and a folded vellum letter on aged cream paper — the you-are-about-to-begin moment.',
      1086, 1448),
  },

  // ── TIER C: Public ───────────────────────────────────────────────────
  {
    file: 'about.html',
    anchor: '<h1 id="about-headline">',
    position: 'before',
    html: pic('about-house-portrait', 'pfc-photo-hero',
      'Interior of a stone-built late-Victorian counting room with arched window pouring golden light — the quiet European forecasting house.',
      1586, 992),
  },
  {
    file: 'help.html',
    // Try the eyebrow first
    anchor: 'class="help-eyebrow"',
    position: 'before-parent-section',
    html: pic('help-vade-mecum', 'pfc-photo-hero',
      'Small leather-bound reference manual open with a red silk ribbon bookmark — the help page as a vade mecum.',
      1672, 941),
  },
];

// Add 7 blog hero slots programmatically — uniform pattern
const BLOG_HEROES = [
  ['blog-debt-avalanche-method.html', 'blog-debt-avalanche-method-hero',
   'Snowy mountain cross-section diorama with debt ledger papers in the bottom strata — the avalanche method made literal.'],
  ['blog-emergency-fund.html', 'blog-emergency-fund-hero',
   'Antique tin labeled RESERVE on a wooden kitchen shelf in warm light — emergency fund as household ritual.'],
  ['blog-index-funds.html', 'blog-index-funds-hero',
   'Wide field of identical golden wheat stalks at golden hour with distant farmhouse — the index analogy made visible.'],
  ['blog-inflation.html', 'blog-inflation-hero',
   'Wax-sealed letter from 1923 with a 1,000,000 Mark hyperinflation stamp on marble — the historical artifact of inflation.'],
  ['blog-net-worth.html', 'blog-net-worth-hero',
   'Three leather-bound ledgers stacked horizontally on walnut with a fountain pen across the top — net worth as the archive.'],
  ['blog-50-30-20.html', 'blog-50-30-20-hero',
   'Three cream porcelain jars labeled NEEDS, WANTS, SAVE on a wooden kitchen counter — the 50/30/20 rule as household ritual.'],
  ['blog-salary-negotiation.html', 'blog-salary-negotiation-hero',
   'Two cream business cards on polished marble, one pristine, one cut in half — the inadequate offer made visible.'],
];
for (const [file, slot, alt] of BLOG_HEROES) {
  SLOTS.push({
    file,
    anchor: '<article',
    position: 'after-opening-tag',
    html: pic(slot, 'pfc-photo-hero', alt, 1672, 941),
  });
}

// blog.html featured-art — REPLACE the existing SVG inside .feat-img
SLOTS.push({
  file: 'blog.html',
  anchor: 'class="feat-img"',
  position: 'replace-inner',
  html: `<picture>
        <source srcset="assets/img/photos/blog-featured-art.webp" type="image/webp">
        <img src="assets/img/photos/blog-featured-art.webp"
             alt="Steep slope of stacked period coins under candle flame casting chiaroscuro — the avalanche method, story-led not chart-led."
             loading="lazy" decoding="async"
             width="1448" height="1086"
             style="width:100%;height:100%;object-fit:cover;">
      </picture>`,
});

// Tools — different asset path
SLOTS.push(
  {
    file: 'tools/take-home-pay.html',
    anchor: 'id="r-takehome"',
    position: 'before-parent-card',
    html: picTools('takehome-result-coronation', 'pfc-photo-square',
      'Banded stack of period banknotes on cream paper with brass paperclip — the actual money that lands.',
      1254, 1254),
  },
  {
    file: 'tools/debt-strategy.html',
    anchor: 'id="cardAvalanche"',
    position: 'before',
    html: picTools('debt-strategy-vs-band', 'pfc-photo-eyebrow is-cinema',
      'Two stacks of stamped envelopes side by side on walnut desk, left stack taller — avalanche vs snowball, no illustration.',
      1659, 948),
  },
);

// ── Apply each slot ──────────────────────────────────────────────────
let ok = 0, fail = [], skipped = [];

function indentTo(text, indent) {
  return text.split('\n').map((l, i) => i === 0 ? l : indent + l).join('\n');
}

for (const s of SLOTS) {
  const file = path.join(ROOT, s.file);
  if (!fs.existsSync(file)) { fail.push(`${s.file}: not found`); continue; }
  const orig = fs.readFileSync(file, 'utf8');

  // Check if already integrated — look for the slot identifier in the file
  const slotMatch = s.html.match(/photos\/([^.\s]+)\.webp/);
  const slotId = slotMatch ? slotMatch[1] : null;
  if (slotId && orig.includes(`photos/${slotId}.webp`)) {
    skipped.push(`${s.file}/${slotId} (already integrated)`);
    continue;
  }

  // Find anchor — string match, must be unique
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

  // Detect indent of the anchor line
  const lineStart = orig.lastIndexOf('\n', idx) + 1;
  const indentMatch = orig.slice(lineStart, idx).match(/^\s*/);
  const indent = indentMatch ? indentMatch[0] : '';
  const blockIndented = indentTo(s.html, indent);

  let next;
  switch (s.position) {
    case 'before':
      next = orig.slice(0, lineStart) + indent + blockIndented + '\n' + orig.slice(lineStart);
      break;
    case 'after-opening-tag': {
      // Find the > that closes this tag
      const closeIdx = orig.indexOf('>', idx);
      if (closeIdx === -1) { fail.push(`${s.file}: no closing > for ${s.anchor}`); continue; }
      next = orig.slice(0, closeIdx+1) + '\n' + indent + '  ' + indentTo(s.html, indent + '  ') + orig.slice(closeIdx+1);
      break;
    }
    case 'before-parent-card':
    case 'before-parent-section': {
      // Walk back to the nearest opening <div> at less indent
      const before = orig.slice(0, idx);
      const reversed = before.split('\n').reverse();
      let acc = 0, parentLineStart = -1;
      for (let i = 0; i < reversed.length; i++) {
        const line = reversed[i];
        if (/<div\b/.test(line) && !/\/div>/.test(line)) {
          parentLineStart = before.length - (reversed.slice(0, i+1).join('\n').length);
          break;
        }
      }
      if (parentLineStart < 0) parentLineStart = lineStart;
      const pIndentMatch = orig.slice(parentLineStart, idx).match(/^(\s*)/);
      const pIndent = pIndentMatch ? pIndentMatch[1] : indent;
      next = orig.slice(0, parentLineStart) + pIndent + indentTo(s.html, pIndent) + '\n' + orig.slice(parentLineStart);
      break;
    }
    case 'after-parent-section': {
      // Find matching > of nearest containing tag
      const closeIdx = orig.indexOf('>', idx);
      next = orig.slice(0, closeIdx+1) + '\n' + indent + indentTo(s.html, indent) + orig.slice(closeIdx+1);
      break;
    }
    case 'replace-after-tag': {
      const closeIdx = orig.indexOf('>', idx);
      next = orig.slice(0, closeIdx+1) + '\n' + indent + '  ' + indentTo(s.html, indent + '  ') + orig.slice(closeIdx+1);
      break;
    }
    case 'replace-inner': {
      // Find opening <div ... feat-img"> then replace its inner content
      const openStart = orig.lastIndexOf('<', idx);
      const openEnd = orig.indexOf('>', idx) + 1;
      // Find matching close
      const tag = orig.slice(openStart, openEnd).match(/<(\w+)/);
      if (!tag) { fail.push(`${s.file}: can't find tag for replace-inner`); continue; }
      const closeTag = `</${tag[1]}>`;
      const closeIdx = orig.indexOf(closeTag, openEnd);
      if (closeIdx === -1) { fail.push(`${s.file}: no closing ${closeTag}`); continue; }
      next = orig.slice(0, openEnd) + '\n' + indent + '  ' + indentTo(s.html, indent + '  ') + '\n' + indent + orig.slice(closeIdx);
      break;
    }
    default:
      fail.push(`${s.file}: unknown position ${s.position}`);
      continue;
  }

  fs.writeFileSync(file, next, 'utf8');
  ok++;
  console.log(`+ ${s.file} [${slotId || '?'}]`);
}

console.log(`\nApplied ${ok} / ${SLOTS.length}`);
if (skipped.length) console.log(`\nSkipped (already integrated):\n  ` + skipped.join('\n  '));
if (fail.length) {
  console.log(`\nFailed:\n  ` + fail.join('\n  '));
  process.exit(1);
}
