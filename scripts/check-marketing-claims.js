/**
 * check-marketing-claims.js — Pre-publish word-list gate per GC Wave-12 plan.
 *
 * Runs the 15-word forbidden-term grep across HTML + markdown content.
 * Exits 1 if any forbidden term is found, with file + line + matched word
 * + a one-line suggested substitution.
 *
 * Intended for: pre-commit hook OR GitHub Action OR manual run before
 * any marketing content (landing, blog, social copy, email body) ships.
 *
 * The CMO owns this gate. GC spot-audits weekly per the marketing-claims
 * plan §1 approval path.
 *
 * Origin: docs/superpowers/audits/2026-05-22-gc-marketing-plan.md §2
 *
 * Run:  node scripts/check-marketing-claims.js [path1] [path2] ...
 *       (no args → scans the whole repo)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// The final 15-word list (GC memo §2.1). Each entry is { word, sub } where
// `word` is the regex pattern to match and `sub` is the suggested replacement.
// Words organised by root so common variants (advise/advisor/advisory) match
// one entry. All matches are case-insensitive.
const FORBIDDEN = [
  { re: /\brecommend(s|ed|ing|ation|ations)?\b/i,   sub: 'illustrate · model · forecast' },
  { re: /\badvi[cs]e\b/i,                            sub: 'forecast · scenario · projection' },
  { re: /\badvis(or|er|ors|ers|ory)\b/i,             sub: '(brand-voice: drop, do not substitute)' },
  { re: /\bsuitab(le|ility)\b/i,                     sub: 'fits · matches · aligns with' },
  { re: /\byou should\b/i,                           sub: 'you could · one approach · scenarios show' },
  { re: /\ballocat(e|ed|ing|ion|ions)\b/i,           sub: 'model · project · distribute (non-finance only)' },
  { re: /\boptimal\b/i,                              sub: 'efficient · effective · one path' },
  { re: /\brisk score\b/i,                           sub: 'risk profile illustration · scenario sensitivity' },
  { re: /\bfiduciar(y|ies)\b/i,                      sub: '(drop — regulated term, no substitute)' },
  { re: /\bplanner(s)?\b/i,                          sub: '(drop — regulated profession, no substitute)' },
  { re: /\bportfolio (your|my|our|their|the user)/i, sub: 'positions · holdings · the line items' },
  // Marketing-superlative class — flagged by GC memo §5 worked example
  { re: /\bsmarter than\b/i,                         sub: '(drop — comparative superiority claim)' },
  { re: /\bbeat(s)? (your|the) (advisor|advisers|planner)\b/i, sub: '(drop — regulated comparison)' },
];

// Skip globs — these are NOT marketing surfaces. The grep should focus on
// content that ships to USERS (pages, meta tags, marketing docs) not the
// internal infrastructure that legitimately discusses regulated terms.
const SKIP = [
  // Internal docs — audit reports, runbooks, planning, governance
  /docs\/superpowers/i,
  /docs\/runbooks/i,
  /docs\/quarterly-audit-cadence/i,
  /docs\/photo-classes/i,
  /docs\/STYLE-GUIDE/i,
  /docs\/VENDOR-SETUP/i,
  // Marketing docs that LEGITIMATELY discuss the rules (meta-discussion)
  /docs\/marketing\/show-reddit-draft/i,
  /docs\/marketing\/outreach-script-v1/i,
  // Build/code/asset dirs
  /node_modules|\.git|\/assets|\/css|\/js|\/api|\/.github|\/scripts/i,
];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', '.git', 'assets', 'css', 'js', 'api', '.github', 'scripts'].includes(e.name)) continue;
      walk(full, out);
    } else if (e.name.endsWith('.html') || e.name.endsWith('.md') || e.name.endsWith('.mdx')) {
      out.push(full);
    }
  }
  return out;
}

const targets = process.argv.slice(2).length
  ? process.argv.slice(2).map(p => path.resolve(p))
  : walk(ROOT);

let hits = 0;
const REL = (p) => path.relative(ROOT, p).replace(/\\/g, '/');

for (const file of targets) {
  const rel = REL(file);
  if (SKIP.some(re => re.test(rel))) continue;

  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); }
  catch (_) { continue; }

  // Pre-strip several blocks from the scan because flagging them would be
  // the grep over-firing on the cure for the disease:
  //   1. <p class="pfc-disclaimer"> — GC-blessed protective language
  //   2. <p class="pfc-lede"> — opening paragraph of blog posts; the
  //      essay-style framing where words like "advice" appear in
  //      legitimate educational discussion that the blog body then
  //      disclaims with a pfc-disclaimer block
  //   3. <h2>Frequently asked questions</h2> through closing — schema.org
  //      FAQ structured data legitimately discusses financial concepts
  //      using their natural terminology
  //   4. Bulleted lists that ENUMERATE forbidden words (self-referential
  //      meta-discussion in marketing-docs, the GC plan itself, etc.)
  let scanText = raw
    .replace(/<p[^>]*class="pfc-disclaimer"[^>]*>[\s\S]*?<\/p>/gi, '')
    .replace(/<div[^>]*class="pfc-disclaimer"[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<p[^>]*class="pfc-lede"[^>]*>[\s\S]*?<\/p>/gi, '')
    // Schema.org FAQ JSON-LD blocks: contain factual finance terminology
    .replace(/<script[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi, '')
    // Self-referential list lines that ENUMERATE forbidden words in
    // marketing-docs (e.g. "Does not mention 'advice / recommend / suitable'")
    .split('\n')
    .filter(line => {
      // Quote-comma-separated word lists are clearly enumerative, not claims
      const matches = line.match(/(?:advice|recommend|suitable|optimal|advisor|adviser|planner|allocate)/gi) || [];
      if (matches.length >= 3) return false; // 3+ forbidden words on one line = enumeration, skip
      return true;
    })
    .join('\n');

  const lines = scanText.split(/\r?\n/);
  const origLines = raw.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip code-fence blocks heuristically — only flag prose content
    if (/^\s*(\/\/|\/\*|\*|--|#\s|\s{4,})/.test(line)) continue;
    for (const { re, sub } of FORBIDDEN) {
      const m = line.match(re);
      if (!m) continue;
      // Negation guard — line must NOT have "not", "isn't", "doesn't",
      // "no " immediately preceding the matched word within ~30 chars.
      // This eliminates "not advice", "isn't an adviser", etc. — the
      // self-disclaiming uses that are GC-blessed.
      const idx = m.index;
      const window = line.slice(Math.max(0, idx - 30), idx).toLowerCase();
      if (/\b(not|isn'?t|aren'?t|doesn'?t|don'?t|no|never|without|free of|outside|nothing)\b[^.]*$/.test(window)) {
        continue; // negation immediately precedes — disclaimer pattern
      }
      // Compound-noun guard — "robo-advisor", "robo advisors" naming a
      // financial product category in an educational article. These are
      // factual nouns, not us claiming advisory status. Allow if
      // hyphen-prefixed by a clearly non-regulated term.
      if (/(robo|automated|algorithmic|software)[\s-]$/i.test(line.slice(Math.max(0, idx - 20), idx))) {
        continue;
      }
      hits++;
      console.log(`${rel}:${i + 1}: ${m[0].toUpperCase().padEnd(15)} | suggest: ${sub}`);
      console.log(`    >  ${(origLines[i] || line).trim().slice(0, 110)}${(origLines[i] || line).length > 110 ? '…' : ''}`);
    }
  }
}

if (hits === 0) {
  console.log('✓ No forbidden marketing terms found.');
  process.exit(0);
} else {
  console.log(`\n✗ ${hits} forbidden-term occurrence(s) found. Rewrite or drop before publish.`);
  console.log('  (See docs/superpowers/audits/2026-05-22-gc-marketing-plan.md §2 for substitution rules.)');
  process.exit(1);
}
