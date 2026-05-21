/**
 * inventory-inline-handlers.js — Categorize every inline event handler
 * across the deployed repo, so we can plan the migration to addEventListener.
 *
 * Goal: produce a report grouped by PATTERN, not by file. A handler like
 *   onclick="setStrategy('avalanche')"
 * is a simple-fn-literal-arg pattern that's mechanically convertible. A
 * handler like
 *   onclick="this.classList.toggle('open'); refresh(this)"
 * is complex and needs page-specific surgery.
 *
 * Patterns we detect (in priority order — first match wins):
 *   1. simple-fn-noarg          : onclick="fnName()"
 *   2. simple-fn-literal-arg    : onclick="fnName('foo')" / fnName(42)
 *   3. simple-fn-this-arg       : onclick="fnName(this)"
 *   4. window-location-literal  : onclick="window.location.href='/x'"
 *   5. simple-return-false      : onclick="fnName(); return false"
 *   6. complex                  : everything else (multi-statement, this.*, etc.)
 *
 * Output: a markdown table to stdout + counts.
 *
 * Run:  node scripts/inventory-inline-handlers.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EVENTS = ['click', 'input', 'change', 'submit', 'keyup', 'keydown', 'keypress',
                'focus', 'blur', 'mouseover', 'mouseout', 'mouseenter', 'mouseleave',
                'wheel', 'load'];

// Walk *.html under ROOT (skip node_modules, .git, docs, assets, css, js, api, .github)
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

const RE = new RegExp(`\\bon(${EVENTS.join('|')})="([^"]+)"`, 'g');

function classify(expr) {
  const e = expr.trim().replace(/\s+/g, ' ');
  // 1. simple no-arg call
  if (/^[a-zA-Z_$][\w$]*\(\)\s*;?\s*$/.test(e)) return 'simple-fn-noarg';
  // 2. simple literal-arg call (string or number)
  if (/^[a-zA-Z_$][\w$]*\(\s*['"][^'"]*['"]\s*\)\s*;?\s*$/.test(e) ||
      /^[a-zA-Z_$][\w$]*\(\s*-?\d+(\.\d+)?\s*\)\s*;?\s*$/.test(e)) return 'simple-fn-literal-arg';
  // 3. this-arg call
  if (/^[a-zA-Z_$][\w$]*\(\s*this\s*(?:,\s*['"][^'"]*['"]\s*)?\)\s*;?\s*$/.test(e)) return 'simple-fn-this-arg';
  // 4. this.value-arg call (common for input handlers)
  if (/^[a-zA-Z_$][\w$]*\(\s*this\.value\s*\)\s*;?\s*$/.test(e)) return 'simple-fn-this-value-arg';
  // 5. window.location.href = '...' navigation
  if (/^window\.location\.href\s*=\s*['"][^'"]*['"]\s*;?\s*$/.test(e)) return 'window-location-literal';
  // 6. multi-statement, this-mutation, assignment, or anything else complex
  return 'complex';
}

const patterns = {
  'simple-fn-noarg':       [],
  'simple-fn-literal-arg': [],
  'simple-fn-this-arg':    [],
  'simple-fn-this-value-arg': [],
  'window-location-literal':  [],
  'complex':               [],
};

const files = walk(ROOT);
let total = 0;
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  let m;
  RE.lastIndex = 0;
  while ((m = RE.exec(src)) !== null) {
    total++;
    const event = m[1];
    const expr = m[2];
    const pattern = classify(expr);
    patterns[pattern].push({
      file: path.relative(ROOT, file).replace(/\\/g, '/'),
      event,
      expr,
    });
  }
}

console.log(`Scanned ${files.length} HTML files. Found ${total} inline event handlers.\n`);
console.log('| Pattern                      | Count | % of total | Mechanically convertible? |');
console.log('|------------------------------|-------|------------|---------------------------|');
const order = ['simple-fn-noarg', 'simple-fn-literal-arg', 'simple-fn-this-arg',
               'simple-fn-this-value-arg', 'window-location-literal', 'complex'];
for (const p of order) {
  const n = patterns[p].length;
  const pct = ((n / total) * 100).toFixed(1).padStart(5);
  const mech = p === 'complex' ? 'No  (manual)' : 'Yes (script)';
  console.log(`| ${p.padEnd(28)} | ${String(n).padStart(5)} |    ${pct}%  | ${mech}              |`);
}
console.log();

console.log('=== TOP 20 most common COMPLEX expressions ===');
const counts = {};
for (const h of patterns.complex) counts[h.expr] = (counts[h.expr] || 0) + 1;
const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 20);
for (const [expr, n] of top) {
  const short = expr.length > 90 ? expr.slice(0, 87) + '...' : expr;
  console.log(`  ${String(n).padStart(3)}x  ${short}`);
}
console.log();

console.log('=== FILES WITH THE MOST HANDLERS ===');
const fileCounts = {};
for (const p of Object.values(patterns)) for (const h of p) {
  fileCounts[h.file] = (fileCounts[h.file] || 0) + 1;
}
const topFiles = Object.entries(fileCounts).sort((a, b) => b[1] - a[1]).slice(0, 15);
for (const [f, n] of topFiles) console.log(`  ${String(n).padStart(3)}  ${f}`);
