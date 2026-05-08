# Vendor Setup Guide

**Audience:** the founder (or whoever does the next deploy).
**Goal:** stand up the 5 deferred vendor accounts that the CEO roadmap (Gaps 1, 2, 3, 5, 7) treats as launch-blocking. Each section below is a 5-minute task. Do them in the order at the bottom.

> Total monthly cost at launch: **$0** for the first 30 days, then **~$21/mo** once Plausible's trial converts and Google Workspace seats are active.

---

## A. Error monitoring → Sentry (recommended)

**Why Sentry over alternatives.** The Sage 401 bug shipped to production and stayed broken because no one was watching the error stream. Sentry's free tier covers PFC's volume on day one and integrates with Vercel deploy notifications without code changes. LogRocket and Datadog are over-budget for pre-revenue; Bugsnag is comparable but the free tier is smaller.

**Free-tier limits.**
- 5,000 errors / month
- 50 session replays / month
- 10,000 performance events / month
- 1 team member

**5-minute setup.**
1. Go to https://sentry.io, sign up with `founder@profinancecast.com`.
2. Click **Create Project** → choose **Browser JavaScript** → name it `profinancecast-web`.
3. Copy the DSN from the install page. It looks like `https://abc123@o12345.ingest.sentry.io/67890`.
4. In Vercel → Project → Settings → Environment Variables, add:
   - **Key:** `NEXT_PUBLIC_SENTRY_DSN`
   - **Value:** the DSN from step 3
   - **Environments:** Production, Preview, Development
5. Redeploy (Vercel does this automatically on the next push).

**Code wiring (paste location).** Add to the `<head>` of every public HTML page (`index.html`, `blog.html`, `privacy.html`, `help.html`, `billing.html`, and the `/tools/*` pages once they ship):

```html
<script
  src="https://js.sentry-cdn.com/<DSN_PUBLIC_KEY>.min.js"
  crossorigin="anonymous"></script>
<script>
  window.Sentry && Sentry.init({
    dsn: '%NEXT_PUBLIC_SENTRY_DSN%',
    tracesSampleRate: 0.2,
    replaysOnErrorSampleRate: 1.0,
  });
</script>
```

**Naming convention.** We use the `NEXT_PUBLIC_` prefix even on this vanilla-JS project for forward-compatibility.

---

## B. Analytics → Plausible (recommended over PostHog)

**Why Plausible.** Privacy-first telemetry matches PFC's "no bank login" positioning. Cookieless (no banner needed in EU/UK), <1KB script, no user-level data. PostHog is more powerful (1M events/mo free) and is the right call **if** budget matters more than brand fit.

**Free-tier limits.**
- 30-day trial of any plan, no card required
- After 30 days: **$9/mo** (Growth plan, 10k pageviews/mo)
- Alternative: PostHog free = 1M events/mo

**5-minute setup.**
1. Go to https://plausible.io, sign up with `founder@profinancecast.com`.
2. Click **Add a website** → enter `profinancecast.com`.
3. Copy the script tag.
4. **No env vars needed.**

**Code wiring (paste location).** Add to the `<head>` of every **public marketing page** — *not* app pages: `index.html`, `blog.html`, `blog-debt-avalanche.html`, `privacy.html`, `help.html`, `billing.html`, and the `/tools/*` pages. **Do not** add to dashboard, scenarios, report-card, settings, salary-calculator, goals, recurring, net-worth, debt-optimizer, sage, onboarding, or auth pages.

```html
<script defer data-domain="profinancecast.com" src="https://plausible.io/js/script.js"></script>
```

**Custom events to fire (Sprint 2):** `signup_complete`, `onboarding_complete`, `first_forecast_run`, `tool_completed`, `paywall_shown`, `trial_started`, `pro_purchased`.

---

## C. Transactional + lifecycle email → Resend (recommended over Postmark)

**Why Resend.** Better DX, React Email templates, generous free tier. Postmark is the safer "old guard" choice but costs $15/mo at the floor.

**Free-tier limits.**
- 100 emails / day, 3,000 / month, 1 verified domain
- $20/mo upgrade unlocks 50k/mo

**5-minute setup.**
1. Go to https://resend.com, sign up with `founder@profinancecast.com`.
2. **Domains** → **Add Domain** → `profinancecast.com`. Add the SPF/DKIM/MX-equivalent DNS records.
3. **API Keys** → **Create API Key** → `profinancecast-prod` → Full access.
4. Copy the key (starts with `re_...`) — shown once.
5. In Vercel env vars: **Key:** `RESEND_API_KEY`, **Value:** the key, **Environments:** Production only.

**Code wiring.** Resend is server-only — never expose `RESEND_API_KEY` to the browser. The orchestrator will add `lib/email.js` and templates in a follow-up. No HTML changes for now.

When the module ships: `api/email/send.js`, `api/email/templates/welcome.js`, `trial-ending.js`, `receipt.js`, `winback-day7.js`, `winback-day30.js`, `winback-day90.js`. Sender: `founder@profinancecast.com` for transactional, `team@profinancecast.com` for lifecycle.

---

## D. Customer support email → Google Workspace ($6/user/month)

**Why Google Workspace.** Domain email for `support@` and `founder@` requires a real mailbox. GW is the lowest-risk, highest-deliverability option; alternatives have edge cases (Zoho deliverability, Cloudflare can't reply *as* the address).

**Cost.** $6/user/mo × 2 seats = **$12/month**.

**5-minute setup (plus 1 hour DNS).**
1. https://workspace.google.com → **Get Started**.
2. Business name `ProFinanceCast`, region, team size = 2.
3. **Use a domain I already own** → `profinancecast.com`.
4. Add the TXT verification record at your DNS host. Click **Verify**.
5. Create users: `support@profinancecast.com`, `founder@profinancecast.com`.
6. **Add the 5 MX records** at your DNS host. Wait 1 hour.
7. Test by emailing `founder@` from a personal account.

**No env vars or code changes.** It's purely a mail destination.

**Auto-reply (set on day one).**
> Thanks for writing in — we read every email. We aim to reply within 24 hours on weekdays. If this is about a refund, just reply with one line and we'll process it.
> — the team at ProFinanceCast

---

## E. Accessibility CI → axe-core via @axe-core/cli

**Why axe-core.** WCAG 2.1 AA is non-negotiable for an EU/UK audience. axe-core is the de-facto standard. Free, open source.

**Cost.** $0.

**5-minute setup (local).**
1. `npm i -D @axe-core/cli`
2. `npx axe https://profinancecast.com --save axe-report.json`
3. Fix any rule with impact `critical` or `serious`.

**CI integration.** Create `.github/workflows/a11y.yml` running `npx @axe-core/cli "$VERCEL_PREVIEW_URL" --exit` on push/PR. The `--exit` flag fails the workflow on any critical/serious violation, blocking merge. No env vars, no API keys.

**Pages to audit.** Same list as Plausible's public pages, plus `auth.html`.

---

## Setup order

| Order | Vendor | Why now |
|---|---|---|
| 1 | **Sentry** | Visibility on every other change you ship. |
| 2 | **Plausible** | Measure whether the rest of the roadmap is working. |
| 3 | **Resend** | Goes live when email templates ship in Sprint 2. |
| 4 | **Google Workspace** | Goes live before any public launch. |
| 5 | **axe-core** | Last — install once the site is stable enough that fail-on-violation is fair. |

## Total monthly cost

| Vendor | First 30 days | After 30 days |
|---|---|---|
| Sentry | $0 | $0 |
| Plausible | $0 (trial) | $9 |
| Resend | $0 | $0 |
| Google Workspace (2 seats) | $12 | $12 |
| axe-core | $0 | $0 |
| **Total** | **$12** | **$21** |

If PostHog is chosen instead of Plausible, the post-trial number drops to $12/mo total.
