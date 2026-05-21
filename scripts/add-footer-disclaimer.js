/**
 * add-footer-disclaimer.js — Inject the "not financial advice" disclaimer
 * <p> element into every <footer class="site-footer"> block, just before
 * the closing </footer> tag.
 *
 * Per GC Wave-12 recommendation: real HTML node, not CSS ::after, because
 * screen-reader and regulator-citation expectations require it in the
 * markup. Idempotent — skips any footer that already contains the
 * disclaimer marker.
 *
 * Skips: app-gated pages (dashboard, sage, etc.) which intentionally have
 * no footer. Skips: index.html which has its own custom .footer-bottom
 * (handled separately).
 *
 * Run:  node scripts/add-footer-disclaimer.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MARKER = 'footer-disclaimer';

const DISCLAIMER_HTML = `
  <p class="footer-disclaimer" role="note" aria-label="Important regulatory notice">
    <strong>Not financial advice.</strong> ProFinanceCast provides forecasting and educational tools only.
    We are not a regulated financial-services firm, do not provide investment advice, recommendations, or
    suitability assessments, and do not consider your individual circumstances. Consult a qualified
    financial adviser before any financial decision.
  </p>`;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (['node_modules', '.git', 'docs', 'assets', 'css', 'js', 'api', '.github', 'scripts'].includes(e.name)) continue;
      walk(path.join(dir, e.name), out);
    } else if (e.name.endsWith('.html')) {
      out.push(path.join(dir, e.name));
    }
  }
  return out;
}

// Match <footer class="site-footer">...</footer>. Non-greedy on the body
// so we don't accidentally span multiple footers (shouldn't exist but
// defensive).
const FOOTER_RE = /(<footer[^>]*class="[^"]*site-footer[^"]*"[^>]*>)([\s\S]*?)(<\/footer>)/g;

let touched = 0, skipped = 0, no_footer = 0;
for (const file of walk(ROOT)) {
  const orig = fs.readFileSync(file, 'utf8');
  if (!orig.includes('site-footer')) { no_footer++; continue; }
  if (orig.includes(MARKER)) { skipped++; continue; }

  let next = orig;
  let injected = false;
  next = next.replace(FOOTER_RE, (m, openTag, body, closeTag) => {
    injected = true;
    // Insert disclaimer just before </footer>, preserving body whitespace.
    return openTag + body + DISCLAIMER_HTML + '\n' + closeTag;
  });

  if (injected) {
    fs.writeFileSync(file, next, 'utf8');
    touched++;
  } else {
    skipped++;
  }
}

console.log(`Files touched (disclaimer injected): ${touched}`);
console.log(`Files skipped (already had marker or no match): ${skipped}`);
console.log(`Files with no site-footer at all: ${no_footer}`);
