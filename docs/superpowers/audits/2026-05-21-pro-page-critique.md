# Pro Page Critique — 5 surfaces, ranked

**Method:** `critique` skill applied independently per page by parallel
agent dispatch. Each scored on Philosophy / Visual Hierarchy / Detail /
Functionality / Innovation (0-10), with evidence at file:line.

| Page | Mean | Phil | Hier | Det | Func | Innov |
|---|---|---|---|---|---|---|
| Report Card | **7.8** | 9 | 8 | 7 | 8 | 7 |
| Scenarios | **7.6** | 8 | 8 | 7 | 8 | 7 |
| Sage | **7.4** | 7 | 8 | 7 | 8 | 7 |
| Dashboard | **6.4** | 6 | 6 | 5 | 7 | 8 |
| Portfolio | **5.6** | 4 | 6 | 6 | 7 | 5 |

**Cross-page mean: 6.96/10 — slightly better than the landing's 6.8.**

---

## Cross-page pattern findings (the headline)

### Pattern 1 · The editorial register lives on Pro-gated SURFACES but dies on working SURFACES

Scenarios and Report Card use Fraunces italic headlines, monospaced
gold eyebrows, and proper gold CTAs — but specifically for the
**Free-tier preview**. The moment a Pro user lands on a working
surface (dashboard panels, sage chat body, portfolio holdings), the
register evaporates into generic dark-fintech: 4-up KPI cards,
Inter-only typography, teal-dominant accents, and no gold whatsoever.

The product is currently **best-dressed for the conversion moment, not
the daily-use moment**. This inverts the editorial-product instinct:
National Trust catalog typography should reward the paying member, not
just market to the trialist.

### Pattern 2 · Pro-gate inconsistency

Three Pro-gate patterns coexist:
- **Scenarios + Report Card** — editorial-preview gate (gold eyebrow + italic Fraunces + gold CTA + watermark or ghost cards). The good pattern.
- **Portfolio** — legacy teal-gradient banner (`portfolio.html:265-272`). Visual outlier.
- **Sage** — topbar Pro-pill + in-conversation `.limit-wall` (`sage.html:125-130`). Different but works.

The portfolio gate is now the visual outlier — and the only one of the
three that still treats Pro as a paywall rather than a *brand* moment.

### Pattern 3 · Hardcoded HTML demo values poison the dashboard

Health score `74`, inflation projections, spending breakdown values,
three sample goals, "$312 in interest" copy, and "Your savings rate of
19% is above the national average" are all baked into HTML, then
either overwritten by JS (numbers) or **left as static prose** (the
insight strings). This creates:
- A brief flash-of-someone-else's-finances on slow loads
- An **unresolvable lie** in the static insights cards because no JS
  rewrites them — every user sees "19%" regardless of their actual rate

This isn't a cosmetic bug, it's a data-correctness bug.

---

## Page details

### Dashboard · 6.4/10

**Strengths**
- 3-stage CSV import modal (`dashboard.html:561-719`) — genuinely
  ambitious, no PFA peer ships this
- What-if sliders with live recalc (`:884-903`)
- Sidebar logo correctly uses Fraunces "PFC + diamond" mark (`:438`)
- Single italic-gold month accent on masthead (`:520`)

**Weaknesses**
- Below the masthead: undifferentiated dark-fintech — 4-up KPI cards
  (`:756`), `.tabs` pill (`:739`) borrowed from generic SaaS analytics
- Emoji-driven category icons (`💳`, `🛡️`, `📊`) that would never
  appear in a Trust catalog
- Gold accent — the brand's whole register signal — appears exactly
  ONCE on the entire surface (the italic month)
- Fraunces loaded but used only in `.metric-val`, overpowered by
  Inter-set labels in the same card
- HTML demo values flash on slow loads: `:819, :919-931, :976, :998-1029, :1128-1167`
- Static "Sage insights" prose (`:916-933`, `:976`) is a flat lie — no
  JS rewrites these, every user sees the same numbers regardless of theirs

**Recommendations**
- **Keep:** the 3-stage CSV import modal (`:561-719`)
- **Fix:** replace ALL hardcoded demo values with `—` placeholders so
  users never see mock numbers during hydration; remove the static
  insights prose or wire it to real data
- **Quick-win:** drop the `💰💳🛡️📊` emoji in breakdown card icons —
  the register doesn't permit them

---

### Sage · 7.4/10

**Strengths**
- Most disciplined Pro surface
- Three-column conversation with Fraunces-set `Sage Pro` topbar (`sage.html:262`)
- Properly-sized Pro pill in gold (`:60`) — one of the few correct uses
  of `var(--gold)` in the whole product
- Snapshot panel gracefully empty-states to "Your numbers aren't in yet
  — finish onboarding to give Sage context" (`:321`)
- 2x3 starter grid (`:282-288`) reads like a tasteful onboarding rail
- Microcopy "Online — grounded in your numbers" (`:263`) is the
  editorial register doing real work in five words
- `_safeSageMarkdown` (sage-3.js:233) escapes Gemini output before
  applying markdown transforms — security matches visual register
- `userContext` builder clamps every field (sage-3.js:96-132)

**Weaknesses**
- `.bubble.user-b` colours the user message in `var(--teal-dim)` (`:88`)
  which visually competes with Sage's own avatar gradient (`:79`)
- Premium upgrade wall claims "500 messages/month" (`:298`) but the
  limit is hardcoded server-side; if it drifts the wall lies

**Recommendations**
- **Keep:** welcome avatar with concentric teal halos (`:68`) and the
  2x3 starter grid — cleanest welcome state in the product
- **Fix:** differentiate user vs Sage bubble color — currently both
  share the teal palette (`:87-88`)
- **Quick-win:** render the topbar usage pill (`:267-270`) with the
  gold/Fraunces stamp treatment — it's the only quota signal and
  deserves the register

---

### Portfolio · 5.6/10

**Strengths**
- 5-column add form is simple and direct (`:122-127`)
- `_fmt()` precision-by-magnitude logic in `portfolio-main.js:45`
  (dollars >$10, cents >$0.01, scientific below) — thoughtful detail
- Crypto-fallback caveat (`:278-281`) is editorial honesty:
  "crypto shown in USD — CoinGecko doesn't price in MUR"
- 15-min cache, refresh button, delete, allocation donut all work

**Weaknesses**
- Could ship in any robo-advisor with colors swapped — generic
- 3-up KPI strip (`:282-298`) with coloured `::after` accent bars
  is identical to a hundred fintech dashboards
- Holdings table (`:310-322`) uses Inter monospace fallback rather
  than committing to JetBrains Mono
- Crypto badge orange `#F7931A` (`:88`) introduces a fifth palette
  color that isn't anywhere else in the design system
- **No Fraunces, no italic accent, no gold anywhere on the working surface**
- Pro-gate banner (`:265-272`) is the only one of 5 pages still using
  the old palette-violating teal gradient — editorial-preview pattern
  that scenarios/report-card adopted never reached portfolio
- No cost-basis P&L, no sector grouping, no historical sparkline per row

**Recommendations**
- **Keep:** precision-by-magnitude formatter (`portfolio-main.js:42-47`)
  and the crypto-fallback subtitle
- **Fix:** rewrite the Pro-gate banner (`:265-272`) to match
  scenarios/report-card's editorial-preview pattern — gold eyebrow,
  italic Fraunces headline, gold CTA
- **Quick-win:** replace `s-teal/s-blue/s-amber` KPI accent bars
  with a single gold under-rule, set totals in Fraunces — instant
  register lift for ~10 lines of CSS

---

### Scenarios · 7.6/10

**Strengths**
- Editorial-preview pattern lands cleanly (`scenarios.html:760-786`)
- Reads like a print magazine column: monospaced "A taste of Pro"
  eyebrow in gold (`:761`), italic Fraunces "Scenarios live in Pro."
  headline (`:762`), two-card ghost gallery with `'Pro'` mono-stamps
  (`:199-206`), gold CTA `.cta-primary` (`:248-256`)
- CSS plumbing — `body[data-pfc-plan="free"] .scenarios-preview {
  display:block }` (`:159`) — right architectural choice
- 4-card summary strip with discrete colored accent bars (`:725-749`)
- Chart card with 6M/12M/24M range pills
- Live preview at top of form (`:867-881`) recalcs surplus/net-worth/score
  as user types — delightful interaction
- Color picker with 8 scenario colors (`:896-903`)
- Dashed `.add-scenario-btn` (`:346-357`)

**Weaknesses**
- Legacy `.pro-gate` redirect comment at `:147` signals abandoned
  redesign
- Hardcoded preview deltas "+$8,420" and "+$3,180" (`:768, :774`)
  never recalculated — savvy users notice they're decorative
- `scenarios-3.js:79` has a no-op: `savings += surplus - (surplus < 0 ? 0 : 0)`
  — leftover from earlier formula, should be deleted

**Recommendations**
- **Keep:** the editorial preview block (`:760-786`) — this is the
  pattern every Pro-gate should use
- **Fix:** dead arithmetic at `scenarios-3.js:79` — compute something or delete
- **Quick-win:** animate the live-preview numbers on change with a
  one-frame highlight — modal is great, a 200ms flash closes the gap

---

### Report Card · 7.8/10

**Strengths**
- Strongest Pro page philosophically
- Whole concept — printable, shareable financial grade card with
  vintage-ledger styling — exactly what the editorial register was built for
- `#rc-canvas` (`report-card.html:66-72`) carries gradient
  `#0B1410 → #1C3328 → #0B1410` with two concentric circle decorations,
  136px grade ring, 3-up metric strip in mono, four animated category bars
- **Free-tier watermark — repeating diagonal gold lines + a `Pro preview`
  stamp (`:128-142`)** — the most tasteful gate in the product. It
  doesn't BREAK the design, it SIGNS it.
- SVG ring stroke math (report-card-3.js:75-80) — `circ=351.9`
  precomputed from `2πr` with r=56, dash transition uses same easing as bars
- `grade()` table (report-card-3.js:50-58) is editorial copy:
  "Exceptional", "Strong fundamentals across all areas",
  "Critical — Urgent action required"

**Weaknesses**
- Long inline comment at `:218-224` admits the ivory-paper redesign
  was attempted and parked because hardcoded dark gradient and
  `var(--text)` couplings broke it. Real architectural cost — canvas
  locked to dark.
- Eyebrow color on `.rc-invitation` (`:171`) was explicitly downgraded
  to `--paper-ink` for WCAG AA on ivory — good fix but reveals
  unresolved surface duality.
- `#rc-canvas::before/::after` (`:71-72`) decorative circles scaled too
  large — `width:400px; right:-100px` on ~480px container means visual
  barely shows.
- Static "Last shipped 2026-05-10" footer (`:525`) — a downloaded
  report card with a fixed shipped-date undercuts the "your current
  numbers" framing.

**Recommendations**
- **Keep:** watermark stack `repeating-linear-gradient(135deg,
  rgba(212,175,106,0.04) 0 18px, transparent 18px 36px)` (`:131`) —
  single best Pro-gate moment in the product
- **Fix:** kill the static "Last shipped 2026-05-10" footer (`:525`)
- **Quick-win:** reduce `::before/::after` decorative circles
  (`:71-72`) by 50% so they actually appear inside visible card bounds

---

## Top 5 fixes ranked by impact

| # | Fix | File:line | Effort | Why now |
|---|---|---|---|---|
| 1 | **Strip hardcoded demo values from dashboard** | `dashboard.html:819, 916-933, 976, 998-1029, 1128-1167` | 30 min | Static "19%" / "$312 saved" insight prose is currently a flat lie for any user whose numbers differ |
| 2 | **Re-skin portfolio Pro-gate** to match scenarios pattern | `portfolio.html:265-272` | 20 min | Portfolio is the visual outlier; this is the cheapest unify-the-product move |
| 3 | **Lift editorial register into Pro working surfaces** | `dashboard.html:756-781`, `portfolio.html:282-298` | 1-2 hr | Fraunces + gold accent on KPI titles — the register currently dies the moment a user pays |
| 4 | **Rewrite emoji icons** in dashboard breakdown + report-card | `dashboard.html` (multiple), `report-card-3.js:118-121` | 15 min | `💰💳🛡️📊` break the National Trust catalog register |
| 5 | **Delete dead code & abandoned-redesign comments** | `scenarios-3.js:79`, `report-card.html:218-224, :525` | 5 min | Trust signals — code reviewers should see clean code |

**Estimated total: ~3-4 hours to ship all five fixes.**
