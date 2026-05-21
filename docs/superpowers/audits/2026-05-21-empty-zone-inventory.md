# Empty-Zone + Structural Inventory — 2026-05-21
**54 empty zones found across 27 pages.** The 30-45% photo-shrink created two dominant whitespace patterns: 480px hero islands (~480px void each side on 1440px viewports) and 320px Pro empty-state cards (~440px bare canvas to the right).

## Distribution
| Page type | Pages | Zones | Avg |
|---|---|---|---|
| App dashboard / tools (Pro) | 14 | 27 | 1.9 |
| Standalone tools (public) | 2 | 6 | 3.0 |
| Blog posts | 7 | 11 | 1.6 |
| Blog index | 1 | 4 | 4.0 |
| Auth / onboarding | 2 | 3 | 1.5 |
| Info pages | 2 | 3 | 1.5 |

## Top 10 highest-leverage zones (P0)
1. **`/onboarding` step 1** — `onboarding-welcome-vignette.webp` renders 0×0 (file missing). Every new user's first screen.
2. **`/onboarding` step 6** — `onboarding-complete-keepsake.webp` missing. Finish-line emotional payoff is blank.
3. **`/report-card`** — `report-card-keepsake.webp` missing. Pro upgrade CTA renders as 600px of blank vertical space.
4. **`/sage` empty-context** — `sage-empty-context.webp` missing. "Your numbers aren't in yet" state, common for new users, icon-only.
5. **`/dashboard` upgrade banner right-half** — 200px key + 440px bare emerald canvas at highest-conversion surface. Add gold-leaf SVG rule or widen photo.
6. **`/blog` article thumbnail grid** — 6 placeholder SVG bar-chart icons. One repeating ledger thumbnail pattern would lift register.
7. **`/blog` featured-article** — `.feat-img` constrained by hero rule (480px capped on a card meant for full-width).
8. **`/debt-optimizer` empty-state gap** — `debt-empty-quiet` 320px + 760px bare canvas in debts section.
9. **`/portfolio` allocation panel** — Right column shows "No current value" text-only at 1440px.
10. **`/tools/debt-strategy` vs-band** — `debt-strategy-vs-band.webp` reported 0×0 (file missing); page's flagship moment depends on it.

## Cross-cutting patterns
- **Pattern A** — 480px hero island: every `.pfc-photo-hero` page has ~480px void each side. Fix: Fraunces italic caption below every hero closes the gap without changing size. Affects: net-worth, journal, scenarios, help, about + 7 blog posts.
- **Pattern B** — Pro empty-state cards: 320px photo + 400-480px bare canvas right. Affects: portfolio (vault), goals, debt-optimizer, salary-calculator, recurring. Fix: Fraunces caption or SVG rule after photo.
- **Pattern C** — 4 missing-file empty zones (onboarding ×2, report-card, sage). NOT whitespace problems — broken UI requiring photo generation.
- **Pattern D** — All 7 blog posts share template with hero + 1500-2500 words text + no mid-article imagery. Template-level fix: pullquote + SVG divider in shared CSS applies to all 7.
- **Pattern E** — Emoji icons in empty states (history tabs, debt-optimizer, scenarios). Replace with 96px `.pfc-photo-square.sm` talisman crops of existing photos.

[Full 27-row table available in agent transcript]
