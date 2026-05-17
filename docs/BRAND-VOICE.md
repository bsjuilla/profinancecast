# Brand Voice — ProFinanceCast

One page. Read it before you write anything that ships.

## Voice principles

- **Calm, not anxious.** Personal finance is already stressful. We are the steady voice that says "here is what the next ten years look like." We never hurry the reader.
- **Confident, not cocky.** We know forecasting math. We do not know your life. We say "your forecast" not "the right answer."
- **Plain English, no jargon.** If a 16-year-old wouldn't understand the sentence, rewrite it. "Compound growth," not "exponential capital appreciation."
- **Second-person, always.** "You'll see your net worth in 2030," never "Users will be able to see their projected net worth."
- **US English.** Color, optimize, organization, check (not cheque). One spelling system, sitewide.

## Words we use vs words we avoid

| Use | Avoid |
|---|---|
| forecast, project, model | predict |
| plan, see, decide | leverage, empower, unlock |
| decade, ten years, 2030 | "long-term," "the future" |
| $1,234 | ~$1k, $1k-ish, "a few grand" |
| free, forever | freemium, free-to-start |
| no bank login | "secure," "bank-grade encryption" |
| simple, calm, clear | revolutionary, disruptive, best-in-class, game-changing |
| email us, reply with one line | "submit a ticket," "open a case" |
| period (`.`) | exclamation marks (`!`) |

**On numbers:** every dollar figure ships in JetBrains Mono with `font-feature-settings: "tnum"` and a thousands separator. `$1,234` — never `$1234`, never `~$1k`, never `1.2k`.

## Headlines vs body

- **Display headlines:** Cormorant italic, sentence case, no terminal punctuation. Right: *Plan the next ten years*. Wrong: *Plan The Next Ten Years.*
- **Pull quotes:** Cormorant italic, max **one per page**.
- **Body copy:** Inter regular, sentence case, full sentences with periods.
- **Eyebrows / labels:** Inter 12px uppercase, `letter-spacing: 0.12em`.

## Three example transformations

**1. Hero (current `index.html`-style)**
- *Before:* "Empower your financial future with AI-powered forecasting!"
- *After:* "See where your money lands in 2030."
- *Why:* dropped "empower," dropped the exclamation, traded jargon for a concrete time horizon.

**2. Pricing (current `billing.html`-style)**
- *Before:* "Unlock premium features and take control with our best-in-class Pro plan!"
- *After:* "Pro adds scenarios, salary comparisons, and a quarterly Report Card. $9/month, or $69/year."
- *Why:* tells the reader what they get and what it costs in one breath.

**3. CTA / button copy (current `billing.html`-style)**
- *Before:* "Start your journey now!"
- *After:* "Try Pro free for 14 days"
- *Why:* names the product, the price (free), and the duration (14 days) — three concrete facts.

---

## Gold usage rules (WCAG-compliant)

Champagne gold `#D4AF6A` is a SURFACE ACCENT, never a body-text color on ivory.

| Surface | Gold as text? | Gold as decoration? |
|---|---|---|
| Canvas / surface / surface-2 (emerald-black) | Passes AAA (~7.5:1) — fine for any size | Always |
| Paper / paper-2 (ivory) | Fails WCAG AA (~1.95:1) — use `--paper-ink` for text | Borders, rules, ornaments, dividers only |

Only break this rule for the logo wordmark (Fraunces "PFC" at >=48px) on the emerald-black hero — and even there, ensure the surface contrast meets AAA. On ivory surfaces (`body[data-surface="ivory"]`, blog posts, report cards) the wordmark and all body text must use `var(--paper-ink)` (`#14201A`) for emerald-on-paper.

---

*If a sentence violates two or more rules above, rewrite the sentence — don't patch it.*
