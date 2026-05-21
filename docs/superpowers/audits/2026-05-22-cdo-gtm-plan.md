# CDO GTM Instrumentation Plan — Privacy-First Funnel Without Breaking the Promise
**Owner:** Founder (Solo) · **Written:** 2026-05-22 · **Horizon:** 14-day channel test + first 10 paying users

> **Bottom Line:** The CRO can have "conversion by funnel step" tomorrow using only Plausible custom events + one Upstash counter. No cookies, no third-party scripts, no banner update. The privacy posture *is* the brand — instrumentation must clear that bar before it clears any analytics bar.
>
> **The Decision:** Five funnel events in Plausible, one NSM counter in Upstash, one ratio metric on a Monday markdown file. Reject Hotjar, GA, FB Pixel, FullStory categorically.
>
> **Forcing question for every event below:** *"What decision does this number drive on Monday morning?"* If the answer is "I don't know yet," it doesn't ship.

---

## 1. The Privacy-Preserving Funnel — 6 Events

ProFinanceCast is browser-resident, audit-mode, no bank login. The funnel is therefore short and observable from the **client + edge** only — no server-side user table to join against, no session graph to rebuild. That constraint is a feature: it forces aggregate thinking from day one.

### Event Inventory

| # | Event Name | Meaning | Fire Location | Tool |
|---|---|---|---|---|
| 1 | `pfc.landing_viewed` | A human (not bot) rendered the landing page above the fold | `app/page.tsx` mount, after IntersectionObserver confirms hero in view | **Plausible** auto-pageview (no custom event needed) |
| 2 | `pfc.demo_started` | User clicked the "Try the Demo" CTA (or scrolled to demo widget and interacted) | `<DemoCTA onClick>` handler in `components/landing/DemoCTA.tsx` | **Plausible** custom event |
| 3 | `pfc.audit_run_completed` | User completed one full local forecast computation (the core "aha") | `lib/forecast/engine.ts` — fire on `onComputeSuccess` callback, debounced 2s | **Plausible** custom event |
| 4 | `pfc.scenario_compared` | User created a second scenario or toggled a what-if (signal of depth, not just dabbling) | `lib/scenario/store.ts` — first time `scenarios.length >= 2` per session | **Plausible** custom event |
| 5 | `pfc.export_clicked` | User clicked Export PDF / CSV — strongest unbiased "I got value" signal | `<ExportButton onClick>` handler | **Plausible** custom event |
| 6 | `pfc.waitlist_joined` | User submitted the waitlist form (Pro tier interest) | `app/api/waitlist/route.ts` server handler, on successful insert | **Plausible** custom event + **Upstash INCR** (atomic counter for live dashboard) |

**Total: 6 events. One per funnel stage. No redundancy.**

### Per-Event Payload Rules (Hard <200 byte ceiling)

Plausible custom events allow **props** (string key/value). The payload allow-list:

**ALLOWED props:**
- `variant` — A/B copy variant (e.g. `hero_v1`, `hero_v2`) if running an experiment. Max 16 chars.
- `referrer_bucket` — coarse bucket only: `direct | organic | social | referral | unknown`. Computed client-side from `document.referrer` hostname matched against a 6-line allow-list; everything else collapses to `unknown`.
- `forecast_horizon_bucket` (event 3 only) — `<1y | 1-5y | 5y+`. Never the actual horizon number, never income.

**FORBIDDEN — and the linter rule that enforces it:**
- No email, no name, no UUID, no fingerprint
- No income figure, no goal amount, no net worth, no any user financial input *ever*
- No IP, no IP-derived geo (Plausible already strips this at ingest — but assume nothing; don't pass it client-side either)
- No `user_id`, no `session_id`, no anonymous device hash
- No URL query strings beyond `utm_source` / `utm_medium` / `utm_campaign` (Plausible captures these natively; do not duplicate into props)
- No timestamps at second granularity (Plausible already buckets to the hour)

**Enforcement:** A single `lib/analytics/track.ts` wrapper is the only call site allowed. It accepts a typed `EventName` union and a `props` object validated against a Zod schema. ESLint rule `no-restricted-imports` blocks direct `window.plausible` calls everywhere else. CISO's privacy posture is now a compile-time check, not a code-review check.

### The One Pattern I Recommend: Plausible Custom Events Only (defend against the others)

| Alternative | Why I reject it |
|---|---|
| **Sentry transactions** | Sentry is for errors and performance, not product analytics. Stretching it dilutes the error signal and burns the free tier. Sentry stays errors-only, scrubbed, as deployed. |
| **Server logs (Vercel)** | Logs are ephemeral, expensive to query, lossy, and require a parser to derive a funnel. Plausible already does this with a dashboard. Don't rebuild Datadog for 6 events. |
| **Vercel Edge log + cron aggregation** | Adds a moving part (cron + storage + dashboard). Plausible costs 9 EUR/mo and ships the dashboard. Buy, don't build. |
| **Upstash counters for everything** | Counters give you totals, not funnels. You'd lose the ability to ask "of users who saw the landing page, what fraction completed an audit?" Reserve Upstash for the **one** atomic counter you need (waitlist size for the live "join the X others waiting" social proof). |
| **PostHog / Mixpanel / Amplitude** | All set cookies by default, even in "EU mode." The configuration burden plus the cookie-banner blast radius outweighs the marginal capability. Revisit at 1k MAU, not before. |

**Sequencing:** Plausible custom events for the 6-event funnel, one Upstash `INCR pfc:waitlist:count` on the waitlist endpoint for the live counter. That is the entire stack.

---

## 2. North Star Metric + Counter Metrics

### Where the NSM Lives

The CPO will pick the NSM (my recommendation: `pfc.audit_run_completed` — it's the moment the user has seen their own future on the screen, which is the value prop in one event). Wherever they land, the metric **lives in the Plausible custom-event dashboard, full stop.** Not Vercel Analytics (no custom-event support at the free tier), not a custom Upstash counter (we'd lose the cohorting).

The **single exception** is the waitlist counter — that's an Upstash `INCR` because we need a live number on the marketing page ("147 builders already on the waitlist"), and Plausible can't serve a live read.

### Counter Metrics (Guard Against Gaming the NSM)

If NSM = `audit_run_completed`, here are the 5 counters that catch a hollow NSM:

| # | Counter | What it catches |
|---|---|---|
| C1 | **Audit-completion → scenario-comparison conversion %** | Catches "users ran the demo once and bounced." Real value triggers a second look. |
| C2 | **Audit-completion → export-click conversion %** | Strongest unbiased "I got something I'll act on" signal. If C2 stays under 5%, the audit output isn't useful. |
| C3 | **Median time on `/audit` page (Plausible auto)** | Catches bots and accidental loads. Under 30s = the user didn't actually engage. |
| C4 | **Audits per unique visitor per week (cohorted by week-of-arrival)** | Catches one-shot users vs. returning users. Pre-PMF target: ≥1.3 by week 2 of arrival. |
| C5 | **Referrer-bucket distribution of audit-completers** | Catches "the metric is up but only because of one viral post." If 80% of completions come from one bucket, you don't have product traction, you have one channel. |

### The Monday 30-Second Ratio

**`audit_run_completed / landing_viewed` for the trailing 7 days, displayed in the Plausible "Goals" panel as a percentage.**

That's it. One number. The founder reads it Monday morning. Trend it weekly in `metrics/weekly.md` (a 5-line markdown file in the repo, one row per week — see §3).

- **<2%:** the landing page doesn't convert. Fix landing, don't touch the product.
- **2–5%:** working, watch it. Test variants.
- **>5%:** something good is happening. Investigate channel mix (C5).
- **>10% on N<50:** noise. Wait.

Why a ratio and not a raw count: a raw count goes up because traffic goes up. A ratio goes up because the product gets sharper. Pre-PMF, only the second one matters.

---

## 3. Channel Test → Decision Pipeline (Day-14 Discipline)

### The "Data-Informed vs. Noise" Threshold — Be Honest

For most pre-PMF organic channels, day 14 will not give you statistical significance, and pretending otherwise is the most common founder self-deception. Numbers I will defend:

| Funnel Stage | Minimum N at day 14 to call it "data-informed" | Below that = "directional only" |
|---|---|---|
| Landing views | **≥ 400** unique visitors from the test channel | <400: trend only; do not kill |
| Demo started | **≥ 80** | <80: instinct call, not data call |
| Audit completed | **≥ 25** | <25: every data point is anecdote |
| Waitlist joined | **≥ 8** | <8: zero-vs-one is meaningless |

**The honest framing:** at day 14, on a pre-PMF channel, the 95% confidence interval on conversion rate usually overlaps with zero. Make that explicit in the kill-or-continue note. The CRO's kill criterion should be paired with my "is the N even large enough to fire it?" check.

### Day-14 Dashboard View — Where It Lives

**Primary: Plausible "Filtered by `utm_source=<channel_test_tag>`" view, bookmarked.**

Every link the founder posts during the 14-day test carries `?utm_source=test_<channel>_<week>` (one tag per channel test). Plausible filters the whole funnel by that tag. The dashboard view is:

1. Unique visitors (with the utm tag)
2. Goal completions table: `demo_started`, `audit_run_completed`, `scenario_compared`, `export_clicked`, `waitlist_joined`
3. Conversion % per goal (Plausible computes this natively from goal / visitors)

**Secondary: A 9-line snapshot copied into `metrics/channel-tests.md` on day 14 + day 21 (the +7d residual).**

```
## Channel test: <name> · <start>–<end>
| Stage | N | CR vs landing | Data-informed? |
| Landing      | XXX | 100%   | Y/N |
| Demo started | XX  | XX.X%  | Y/N |
| Audit done   | XX  | XX.X%  | Y/N |
| Compared     | XX  | XX.X%  | Y/N |
| Exported     | XX  | XX.X%  | Y/N |
| Waitlist     | XX  | XX.X%  | Y/N |
Verdict: KILL / CONTINUE / EXTEND-7D
Reason (one sentence):
```

### Monday Running-Doc Entry Format (slots into the COO's cadence)

The COO already established a Monday running doc. The CDO's entry into it each Monday is **exactly 6 lines**, no more:

```
### Data — Week of YYYY-MM-DD
NSM ratio (audit_done / landing_viewed, trailing 7d): X.X%  (Δ vs last week: +/- X.Xpp)
Audits completed: XXX  (Δ: +/- XX)
Waitlist net adds: XX  (running total: XXX)
Active channel test: <name>  · day X of 14  · status: ON-TRACK / AT-RISK / KILL
Counter watch: <which of C1–C5 changed >10% this week, or "none">
Decision needed from CEO: <one line, or "none">
```

Six lines. If it can't fit in six lines, the founder doesn't read it. If the founder doesn't read it, it doesn't drive decisions, and we're back to vanity metrics.

---

## 4. Waitlist → Real-User Transition

If the CRO greenlights the waitlist Pro tier (defer PayPal), here's the architecture.

### Where the Waitlist Email Lives

**Recommendation: Supabase table `waitlist`, single table, RLS locked.**

Defended against the others:

| Option | Verdict |
|---|---|
| **Mailchimp** | NO. Pre-revenue, $0 list, US sub-processor adds GDPR sub-processor disclosure obligation, dilutes the privacy brand. Revisit at 500 confirmed subscribers. |
| **Vercel KV / Upstash list** | Tempting (cheap, edge-native), but you can't query it easily for migration day. Waitlist is a structured record (email, timestamp, source utm, consent_version, double-opt-in_at). Use a real table. |
| **Plain Vercel Edge log + Upstash counter** | Use Upstash for the **count only** (for the live "join the N others" widget). The actual emails go to Supabase. Two purposes, two stores, both minimal. |
| **Supabase table** | YES. You're already deploying on Vercel; Supabase is the lowest-friction Postgres + RLS + EU-hosted region. Free tier covers 500 MB which is ~500k waitlist rows. |

**Schema (the entire thing):**

```sql
create table waitlist (
  id uuid primary key default gen_random_uuid(),
  email_hash text not null unique,        -- sha256(lowercased email + pepper)
  email_ciphertext bytea not null,        -- AES-GCM encrypted, key in Vercel env
  signup_at timestamptz not null default now(),
  utm_source text,
  utm_campaign text,
  consent_version text not null,          -- e.g. '2026-05-22-v1', references privacy policy commit hash
  double_opt_in_at timestamptz,
  unsubscribed_at timestamptz
);
-- No name. No company. No "what are you hoping to use this for." Email + provenance only.
```

Hashing email + storing ciphertext side-by-side lets us: (1) check duplicates without decrypting, (2) honor a deletion request by deleting the row, (3) export the active list for migration by decrypting in a one-off script. The pepper lives in Vercel env var, not the codebase.

### GDPR Posture (echo the GC)

The GC flagged that user #1 is the GDPR trigger. For the waitlist specifically:

1. **Lawful basis:** Consent (Art. 6(1)(a)). The signup form has a single checkbox: *"Email me when ProFinanceCast Pro is ready. I can unsubscribe with one click."* No pre-tick. Consent version is logged with the row (the `consent_version` column references the privacy policy commit hash on the day they signed up — this is how you defend against "the policy changed under me").
2. **Double opt-in:** Resend / Postmark transactional email with a confirmation link. Row is dormant until `double_opt_in_at` is set. Without this, the list is unusable in the EU and a liability in the UK.
3. **Right to erasure:** A `/unsubscribe?token=<hmac>` endpoint sets `unsubscribed_at` AND deletes `email_ciphertext` (keeping only the hash, for "do not re-add" enforcement). 30-day SLA, but in practice it's instant.
4. **Data export (Art. 15):** A `/api/me/export?token=<hmac>` endpoint returns the user's row as JSON. Build it on day one — it's 15 lines.
5. **No tracking pixels in waitlist emails.** Resend lets you disable open-tracking and click-tracking. Disable both. The privacy brand doesn't get a footnote.
6. **Sub-processor list:** Vercel, Supabase, Resend. Three. Published at `/privacy/sub-processors`. Update via PR, not a CMS, so it's audit-traceable.

### Migration Path (Waitlist → Paying Users on PayPal Day)

The transition needs to be **invitation-based, batched, and revocable**, not a flood-the-doors launch:

1. **Day -7 before PayPal goes live:** Send an "early access" email to the first batch (smallest N you can stand — start with 20 confirmed double-opt-ins, sorted by `signup_at` ASC). Email contains a one-time-use `access_token` that maps to a Stripe/PayPal checkout link tagged `?cohort=wave1`.
2. **Day 0:** PayPal live. Wave 1 already converting or not.
3. **Day +7:** Read the wave 1 conversion rate. If >20% paid, send wave 2 (next 50). If <10%, **stop and diagnose** before sending wave 2 — you have a pricing or product problem, not a list problem.
4. **Conversion event:** `pfc.waitlist_converted` fires on successful checkout, with prop `wave=1|2|3`. This is the data that tells the CRO whether the waitlist was a real demand signal or a polite-email-collector.
5. **List hygiene:** Any waitlist row with no double-opt-in 30 days after signup gets auto-purged. Any unconverted row 90 days after their wave invitation gets a final email + auto-purge. The list shrinks deliberately; it doesn't accumulate.

### The "First 10 Paying Users" Feedback Mechanism (NOT NPS)

NPS is useless at N=10. The signal is too noisy and the question ("would you recommend") is the wrong question pre-PMF — they haven't had the product long enough to recommend anything.

**Replace NPS with the Sean Ellis question + one open follow-up, sent at day-14 of paid use:**

> *"How would you feel if you could no longer use ProFinanceCast?"*
> [ ] Very disappointed   [ ] Somewhat disappointed   [ ] Not disappointed   [ ] N/A — I haven't really used it
>
> *"What's the one thing you'd build next?"* (free text, optional)

Sent via a plain Resend email, response captured in a Supabase `feedback` table (same schema discipline: hashed email, ciphertext, response, timestamp). Target: ≥40% "very disappointed" by user #10 = PMF signal. Below 25% = no PMF; do not scale spend.

The open-text answers are the actual fuel — they're the next sprint's backlog, in the users' own language. Read them out loud on Monday. That's the ritual.

---

## 5. Anti-Patterns — What the Founder Will Be Tempted By and Why I Reject Each

**The CISO already said "trust the existing privacy posture; don't add Hotjar." I echo that conviction without hedge.** Privacy-first is not a feature flag — it's a recruitment, retention, and brand asset that compounds. Each tool below would burn that asset for a marginal analytics gain.

- **Google Analytics 4** — Sets cookies, ships data to a US sub-processor that's been struck down twice under Schrems, triggers a cookie banner that contradicts the audit-mode privacy promise on the landing page. The first user who notices the GA script in DevTools writes a tweet that costs more than the data is worth. **Reject.**
- **Hotjar / session replay** — Records keystrokes, mouse trails, and form inputs. Even with "mask sensitive fields" toggled, the regulatory and reputational tail risk on a *financial planning* product is uncapped. One missed mask = one income figure in a third-party server. **Reject, and the CISO already vetoed it. Don't relitigate.**
- **Facebook Pixel** — Marketing-team magnet, GDPR landmine. Forces cookie banner, ships behavior data to Meta, and Meta's data-use terms make you a joint controller. There is no privacy-first config that doesn't gut its utility. **Reject.**
- **FullStory** — Same problem class as Hotjar, slightly nicer dashboard. Same answer. **Reject.**
- **Mixpanel / Amplitude / PostHog Cloud** — Tempting because they have funnels and cohorts out of the box. All set cookies or device IDs in default config; the "EU mode" configurations are partial and fragile. Marginal upside over Plausible custom events at <1k MAU is approximately zero. **Defer to 1k MAU; revisit then.**
- **Intercom / Drift chat widgets** — Adds a 200KB third-party script, sets cookies, ships every chat to a US sub-processor. For a solo founder pre-PMF, "email me at founder@" beats every chat widget. **Reject until headcount > 5.**
- **Heap "autocapture"** — The pitch is "capture everything, decide later." Privacy-first means **decide first, capture deliberately**. Autocapture is the opposite philosophy in one product. **Reject categorically.**

---

## Execution Checklist (45-minute build after all advisors return)

- [ ] Add 5 Plausible custom events to `lib/analytics/track.ts` wrapper (10 min)
- [ ] Add ESLint `no-restricted-imports` rule blocking direct `window.plausible` (5 min)
- [ ] Add Zod schema for event props (5 min)
- [ ] Wire 5 event call sites (DemoCTA, ForecastEngine.onComputeSuccess, ScenarioStore, ExportButton, WaitlistForm) (15 min)
- [ ] Create Plausible Goals for each event in the Plausible dashboard (5 min)
- [ ] Add `INCR pfc:waitlist:count` to `/api/waitlist/route.ts` (3 min)
- [ ] Create `metrics/weekly.md` template with the 6-line Monday entry format (2 min)

**Total: 45 minutes. Ship today.**

---

## Cross-Checks Owed

- **cs-general-counsel-advisor:** Confirm the consent-version-as-policy-commit-hash pattern is defensible under GDPR Art. 7(1) ("controller shall be able to demonstrate consent"). Confirm Resend's EU data-residency claim is sufficient or whether Postmark's EU region is required.
- **cs-ciso-advisor:** Confirm the `email_hash + email_ciphertext` pattern with pepper-in-env is acceptable. Confirm Supabase RLS policy denies all reads from anon role.
- **cs-cpo-advisor:** Lock in the NSM choice (my recommendation: `pfc.audit_run_completed`). If they pick a different NSM, the counter-metric set in §2 changes.
- **cs-cmo-advisor:** Agree on the `utm_source=test_<channel>_<week>` tagging convention before any channel test posts go out. Inconsistent tagging here makes §3 useless.
- **cs-cro-advisor:** Pair the kill criterion with the "minimum N for data-informed" thresholds in §3. A kill criterion fired at N=12 is a feeling, not a decision.

---

**Your Decision (Founder):** Approve the 6-event funnel as the *complete* analytics stack for the next 90 days. No additions without a written "what decision does this drive on Monday" justification. The instrumentation plan is small on purpose — pre-PMF, instrumentation surface area should grow slower than user count, not faster.

**Closing:** Data is leverage, not exhaust. Treat it like an asset on the balance sheet. Six events, one ratio, one Monday entry — that's the whole asset until user #100.
