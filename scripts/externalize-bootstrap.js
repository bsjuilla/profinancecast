/**
 * externalize-bootstrap.js — Replace the inline bootstrap <script> block
 * with an external <script src="js/pfc-inline-bootstrap.js" defer> tag.
 *
 * Background: v1-v3 of the bootstrap were inline <script> blocks per
 * page. The Wave-11 CSP tighten (script-src-elem 'self') blocked them
 * silently — pages rendered fine, but every data-pfc-on-* button was
 * dead. The e2e-smoke workflow caught this on its first run.
 *
 * This script:
 *   1. Strips ALL <script>...PFC_INLINE_BOOTSTRAP_v[1234]...</script>
 *      blocks from each HTML file
 *   2. Replaces with a single <script src="js/pfc-inline-bootstrap.js"
 *      defer></script> tag just before </body>
 *   3. Adjusts the path prefix for files in tools (../js/) or
 *      tools-subdirectories (../../js/)
 *
 * Idempotent: if a file already has the external tag, the inline blocks
 * (if any) are stripped but no duplicate external tag is added.
 *
 * Run:  node scripts/externalize-bootstrap.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Matches <script>...PFC_INLINE_BOOTSTRAP_v[N]...</script> spanning multiple
// lines. Non-greedy through </script> so we never slurp adjacent script tags.
const INLINE_RE = /<script>\s*\n?\s*\/\*\s*PFC_INLINE_BOOTSTRAP_v\d[\s\S]*?<\/script>\s*\n?/g;

// External tag marker — what we're inserting AND what we check for to dedupe.
const EXTERNAL_MARKER = 'pfc-inline-bootstrap.js';

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

function pathPrefix(file) {
  // Determine the relative path from this HTML file's directory back to /js/
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const depth = rel.split('/').length - 1;
  if (depth === 0) return 'js/';
  return '../'.repeat(depth) + 'js/';
}

let stripped = 0;
let inserted = 0;
let already_had = 0;
let no_inline = 0;
for (const file of walk(ROOT)) {
  let src = fs.readFileSync(file, 'utf8');
  const blockCount = (src.match(INLINE_RE) || []).length;
  const hasExternal = src.includes(EXTERNAL_MARKER);

  if (blockCount === 0 && hasExternal) { already_had++; continue; }
  if (blockCount === 0 && !hasExternal) { no_inline++; continue; }

  // Strip all inline bootstrap blocks
  src = src.replace(INLINE_RE, '');
  stripped += blockCount;

  // Insert external tag just before </body> if not already present
  if (!hasExternal) {
    const prefix = pathPrefix(file);
    const tag = `<script src="${prefix}pfc-inline-bootstrap.js" defer></script>\n`;
    const m = src.match(/<\/body>/i);
    if (m) {
      src = src.slice(0, m.index) + tag + src.slice(m.index);
    } else {
      src += '\n' + tag;
    }
    inserted++;
  }

  fs.writeFileSync(file, src, 'utf8');
}

console.log(`Inline bootstrap blocks stripped:        ${stripped}`);
console.log(`Fresh <script src> tags inserted:        ${inserted}`);
console.log(`Files that already had external tag:     ${already_had}`);
console.log(`Files with no bootstrap at all:          ${no_inline}`);
