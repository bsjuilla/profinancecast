# Quarterly Audit Cadence

**Status:** active · **Owner:** Founder · **Established:** 2026-05-21

The brand-discipline + photo-pipeline + voice-rules that took 11 waves to install
will rot in 90 days without enforcement. This file is the source-of-truth schedule.
Set a recurring calendar event on each date below, 60-90 min block each time.

## Schedule

| Date | What to audit | Skill to invoke |
|---|---|---|
| **2026-08-21** | First quarterly: voice (CMO lens), photo register (vintage-ledger brief), CSP integrity | `c-level-skills:cmo-advisor` + spot-check via Playwright |
| **2026-11-21** | Second quarterly: a11y regression (WCAG 2.1 AA), perf regression (Lighthouse), CSP integrity | `c-level-skills:cpo-advisor` + Lighthouse CI history |
| **2027-02-21** | Third quarterly: full annual review — every audit category from 2026-05-21 + new findings since | `c-level-skills:chief-of-staff` orchestrates |
| **2027-05-21** | One-year anniversary: re-run the 8-agent audit cycle from scratch and diff against this baseline | New audit cycle |

## Each quarterly audit MUST check

1. **STYLE-GUIDE.md compliance** — grep every new page added since last audit for:
   - Eyebrow mandate (CATEGORY · SUBJECT in JetBrains Mono small-caps)
   - No emoji in product UI
   - Empty-state register uses "the ledger is X" pattern, never "no X yet" / "get started"
2. **Photo-class taxonomy compliance** — every new photo follows
   `docs/photo-classes.md` (max-width caps, aspect-ratios, WebP+AVIF sources)
3. **CSP integrity** — `curl -sI https://www.profinancecast.com | grep -i content-security-policy`
   should still show `script-src-attr 'none'`, `font-src 'self' data:`, no `https://fonts.*`
4. **Visual-regression CI history** — Actions tab → all runs last 90 days green or
   diagnosed
5. **Spawn the original 8 audit agents** with `--scope "since 2026-05-21"` if
   any have new findings worth surfacing

## Triggers OUTSIDE the calendar

Run an ad-hoc audit IMMEDIATELY when any of these fire:

- A contractor is onboarded → re-read STYLE-GUIDE.md with them BEFORE first commit
- A new page is added to the sidebar/footer/marketing nav → photo + eyebrow + voice check
- A new third-party script is added to CSP allowlist → CISO consult, audit innerHTML
  sinks that handle data from that source
- `vercel.json` CSP is touched → diff against the locked baseline below
- Vercel publishes a security advisory affecting our stack → CISO consult
- A user reports any of: missing alt text, keyboard trap, FOIT, broken click → run
  Wave-11 click-test (E2E suite once it exists)

## Locked CSP baseline (post Wave-11)

```
default-src 'self';
script-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com
  https://www.paypal.com https://www.paypalobjects.com
  https://js.sentry-cdn.com https://static.cloudflareinsights.com https://plausible.io;
script-src-elem 'self' [same allowlist];
script-src-attr 'none';
style-src 'self' 'unsafe-inline';
font-src 'self' data:;
img-src 'self' data: https:;
connect-src 'self' https://*.supabase.co https://api-m.paypal.com
  https://api-m.sandbox.paypal.com https://api.frankfurter.dev
  https://date.nager.at https://*.ingest.sentry.io https://*.ingest.us.sentry.io
  https://cloudflareinsights.com https://static.cloudflareinsights.com
  https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://plausible.io;
frame-src https://www.paypal.com; frame-ancestors 'none';
base-uri 'self'; form-action 'self'; object-src 'none';
upgrade-insecure-requests
```

Any CSP loosening MUST go through CISO review + a written justification appended
to this file.

## What gets dropped if a quarter is too busy

In priority order — protect from the bottom up:

1. Voice compliance (CMO lens) — ALWAYS run; cheapest, fastest, highest brand impact
2. Photo register compliance — run unless no new photos shipped
3. CSP integrity check — automate via CI eventually
4. Lighthouse perf history — skip if no traffic yet
5. Full a11y audit — skip if no new pages, defer to next quarter

If a quarter genuinely gets dropped, log the skip in a `skips:` section here with
the reason. Two consecutive skips = CEO red flag, the cadence isn't real.
