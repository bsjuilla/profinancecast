# ProFinanceCast — Style Guide
**Status:** active · **Updated:** 2026-05-21 · **Owner:** Founder
**Origin:** Codified after the 2026-05-21 brand-voice audit revealed two-tier
copy quality (marketing pages strong; app pages reading like Notion templates).

The brand is **a quiet European forecasting house** — privacy-first, editorial
in voice, vintage-ledger in visual register. The brief that governs imagery is
[`docs/superpowers/audits/2026-05-21-vintage-ledger-brief.md`](superpowers/audits/2026-05-21-vintage-ledger-brief.md).
This file governs **copy and microcopy**.

Three rules. They override taste; they are not negotiable.

---

## Rule 1 · The Eyebrow Mandate

Every page and every in-app section that introduces a new concept opens with a
JetBrains Mono small-caps eyebrow tag **before** the h1 / h2.

**Format:** `CATEGORY · SUBJECT`

- All caps
- `letter-spacing: 0.18em`
- `color: var(--gold, #D4AF6A)`
- `font-family: var(--font-mono, 'JetBrains Mono', monospace)`
- `font-size: 11px` (or `clamp(10px, 0.9vw, 12px)`)
- Separator is a middle dot ` · ` (U+00B7), surrounded by single spaces.

**Canonical example** (from net-worth.html):
```html
<div class="nw-hero-eyebrow">The archive · Net worth</div>
```

**Prohibited in eyebrow position:**
- Functional system labels: `Loading…`, `About you`, `Income & expenses`,
  `Step 1 of 5`, status spinners
- Truncated headings or ellipses
- Tense-shifting verbs ("Choose your…", "Select a…")
- Anything that names the *user action* rather than the *editorial subject*

If the section has no editorial name yet, **name it before shipping the copy.**
"Untitled" is not a name.

---

## Rule 2 · The Empty-State Register

Empty states use the **ledger metaphor**, never the task-management prompt.
The ledger can be:

| Verb | When | Example |
|---|---|---|
| **clear** | nothing has been added yet | "The ledger is clear." |
| **unwritten** | the user hasn't yet committed an entry | "This page is unwritten." |
| **open** | the user is welcome to begin | "The ledger is open." |
| **waiting** | a value will appear once data resolves | "Awaiting your first entry." |

**Prohibited empty-state copy:**
- `No X yet` / `Nothing X yet` / `X not added yet`
- `Get started` / `Let's get started` / `Get started by …`
- `Click here to …` / `Tap to …` (instructional, not editorial)
- `Add your first …` *as the heading* (acceptable as the CTA *button*, not as
  the container copy)
- Any sentence ending in `!`

**Acceptable two-line empty-state pattern:**
```html
<div class="empty-state">
  <div class="empty-headline">The ledger is clear.</div>
  <div class="empty-sub">Add your first obligation — the optimizer orders them by cost.</div>
  <button class="cta">Add the first entry</button>
</div>
```

The headline establishes the editorial register; the sub-line names the
mechanic; the button is direct and functional. **Order matters.**

---

## Rule 3 · The Emoji and Badge Prohibition

**No emoji anywhere in the product UI.** This extends the brief's photography
ban to all rendered copy surfaces.

Specifically prohibited inside:
- Button labels and badges
- Strategy / option selectors (e.g. avalanche / snowball cards)
- Category pickers
- Status chips
- Tooltips and helper text
- Toast notifications
- Empty-state copy

**The single permitted decorative mark** is the PFC brand diamond
(already in the SVG brand-mark) and the typographic em-dash `—` used as a
section separator.

**Permitted alternative — JetBrains Mono small-caps text badges:**

| Old (banned) | New (permitted) | Color token |
|---|---|---|
| 🔥 Saves most money | `OPTIMAL` | `var(--gold)` |
| ⚡ Most motivating | `PROVEN` | `var(--teal)` |
| 🚀 Faster setup | `QUICK` | `var(--teal)` |
| 💎 Premium | `PRO ONLY` | `var(--gold)` |
| 🧪 Beta | `BETA` | `var(--amber)` |
| ✅ Done | `COMPLETE` or check-SVG | `var(--teal)` |

**Badge CSS pattern:**
```css
.badge-mono {
  display: inline-block;
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 3px 9px;
  border-radius: 6px;
}
.badge-optimal { background: rgba(212,175,106,0.12); color: var(--gold); }
.badge-proven  { background: rgba(43,182,125,0.12);  color: var(--teal); }
.badge-pro     { background: rgba(212,175,106,0.18); color: var(--gold); }
```

---

## Tone calibration (style notes)

The voice is **plain, confident, and unhurried**. We do not hedge, but we do not
sell either. We do not use exclamation marks. We name competitors plainly when
useful (`How is ProFinanceCast different from Mint, Monarch, or YNAB?` —
acceptable; `We're better than Mint!` — banned).

**Preferred constructions:**
- `The ledger projects forward — this page records what has already happened.`
- `Each scenario is a possible future, measured against the others.`
- `Buy the haystack — not the needle.`

**Banned constructions:**
- `Let's get started!` / `Welcome aboard! Your forecast is ready!`
- `A taste of Pro` / `Same product as Free; more rope`
- `Loading your X…` *as primary copy* (acceptable only as inline spinner text)
- Any sentence longer than ~22 words without a comma break
- Three or more sentences in a single empty-state container

---

## Enforcement

- **At edit time:** copy that violates Rules 1–3 must be rewritten before commit.
  CMO-style voice audits are run quarterly; the next is scheduled for
  2026-08-21.
- **At template time:** the empty-state and eyebrow patterns should be folded
  into reusable shared CSS classes (`.empty-state-headline`, `.eyebrow-mono`)
  so the patterns are mechanically applied, not memorised.
- **At review time:** any PR adding or modifying user-facing copy on a Pro-gated
  or marketing page MUST be eyeballed for Rule-2 (empty-state register) and
  Rule-3 (emoji) violations.

---

## Related documents

- [Vintage-ledger photography brief](superpowers/audits/2026-05-21-vintage-ledger-brief.md)
- [CMO voice audit (2026-05-21)](superpowers/audits/2026-05-21-cmo-voice-audit.md)
- [Synthesis ranked queue](superpowers/audits/2026-05-21-synthesis-ranked-queue.md)
