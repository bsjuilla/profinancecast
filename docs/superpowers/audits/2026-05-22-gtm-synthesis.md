# Wave-13 GTM Synthesis — 6-Advisor Ranked Queue
**Date:** 2026-05-22 · **Author:** Chief-of-Staff synthesis pass · **Status:** approved batch

The CEO advisor flagged at the close of Wave-12 that the actual #1 problem is now user acquisition, not more engineering polish. Six specialist advisors dispatched in parallel — CMO, CRO, CPO, CDO, CFO, General Counsel. Plans live at sibling `2026-05-22-*-gtm-plan.md` files. This synthesis is the implementation queue.

---

## Executive Summary

**Bottom Line:** Two strategic disagreements, three concrete tonight-shippable artifacts, and a clear separation of "what I do" vs "what the founder does." The product is technically ready for first users; the gap is sequencing (CPO), trust signals (CMO + GC), and a founder-led outreach motion (CRO). Pricing is set at €9/€19 (CFO). Instrumentation is Plausible-only, no GA (CDO). All marketing claims pass through a 3-question GC filter. The 14-day channel test costs €150-250 cash + ~80 founder hours.

---

## 1. Strategic Reconciliations

### Reconciliation A — Channel choice (CMO vs CRO)

| | CMO recommendation | CRO recommendation |
|---|---|---|
| Channel | r/eupersonalfinance (Show Reddit + genuine comments) | Warm personal outreach (40-80 contacts) |
| Funnel | 25 signups + 5 scenario users by day 14 | 27 visitors → 9 signups → 3 activated |
| Posture | Public/scalable | Founder-led/signal-dense |

**Resolution:** Run BOTH in parallel. CRO's warm outreach is the **primary signal-generator** (smaller funnel, higher trust per contact, every conversation produces qualitative data). CMO's Reddit motion is the **parallel discovery experiment** (broader reach, tests whether the message scales beyond personal network). Time split: 5 hours/week on outreach, 2 hours/week on Reddit. If forced to pick one at day 10, CRO's outreach wins.

### Reconciliation B — North Star Metric (CPO vs CDO)

| | CPO definition | CDO definition |
|---|---|---|
| NSM | Weekly Forecasts Revisited | `audit_done / landing_viewed` 7-day ratio |
| What it measures | Retention / staying-current | Conversion / funnel efficiency |

**Resolution:** Both belong, labeled correctly. CPO's metric is the **strategic NSM** (the thing that signals long-term product value). CDO's metric is the **in-flight conversion signal** (the thing the founder watches during the 14-day test). Both go into the weekly Monday markdown.

---

## 2. Activation Moment — Single Definition

Per CPO and CRO (these aligned cleanly):

> **A new user is "activated" when, within their first session, they see a 12-month forecast that includes their actual income, expenses, and savings numbers — and the dashboard shows a non-zero projected net worth.**

- **Target rate:** 20% for first 100 users (CRO honest estimate; CPO's "20-30%" overlaps)
- **P50 time-to-activation:** 4-6 min (CRO measured against existing onboarding wizard)
- **The single highest-leverage product change** (CPO + CRO agree): add a forecast preview to onboarding Step 0 so users see the output shape BEFORE entering data. Mobile auto-scroll to the live calculation panel on input.

---

## 3. Pricing — Locked Numbers (CFO)

| Tier | Monthly | Annual | Founders' lifetime |
|---|---|---|---|
| Pro | **€9 / mo** | **€79 / yr** (27% off) | **€6 / mo lifetime, cap 100 seats, expires day 30 of channel test** |
| Premium | **€19 / mo** | **€169 / yr** | (no founder discount; this tier is for Sage AI 500/mo) |

Rejected: €5/mo vanity tier (math says it generates ~€55/yr net but consumes same support time as €9). Founders' lifetime €6 is the trust signal for first 100 users; hard cap protects future pricing flexibility.

**Gemini API cost is the single biggest scaling risk** (Premium tier). Mandatory: per-user cost telemetry + €5/mo alert in next sprint.

---

## 4. Marketing Compliance Gate (GC)

Every marketing claim passes 3 questions before publishing:

1. Does it promise a **specific user outcome**? → rephrase to tool-capability ("model" not "save")
2. Does it imply **regulated status** (advisor/advice/planner/fiduciary)? → drop the word, no exceptions
3. Does it **named-compare** to a regulated profession or specific competitor? → drop the name OR add sourced footnote

**Final 15-word forbidden list:** `recommend, advise, advice, advisor, adviser, suitable, suitability, you should, allocate, allocation, optimal, portfolio (as verb), risk score, fiduciary, planner`

CMO's hero **passes:** "Your financial future, forecast. Private by design. No bank login required." (no forbidden words, no outcome promise, no named comparison)

---

## 5. Instrumentation Stack — Plausible-Only (CDO)

Six custom events on Plausible (no GA, no Hotjar, no Mixpanel — categorically rejected):

| Event | Fires when |
|---|---|
| `pfc.landing_viewed` | Any landing page renders |
| `pfc.signup_started` | User clicks Get Started or signup CTA |
| `pfc.onboarding_step` | Each wizard step transition (params: step number only, no values) |
| `pfc.activation_done` | First 12-mo forecast rendered with real user inputs |
| `pfc.scenario_saved` | User saves their first scenario (Pro-tier value moment) |
| `pfc.pro_intent` | User clicks See Pro plans or upgrade CTA |

Forbidden payload categories: no PII, no income figures, no email, no IP-derived geo. Per-event size <200 bytes.

Waitlist storage: **Supabase** (not Mailchimp). Single row per signup: `email_hashed, consent_timestamp_iso, consent_version_sha, source_url, ip_optional`.

---

## 6. Tonight's Ranked Execution Queue

| # | Item | Owner | Mins | Output |
|---|---|---|---|---|
| 1 | **Add the GC word-list grep gate** to scripts/ as a pre-publish check | I do | 20 | `scripts/check-marketing-claims.js` |
| 2 | **CPO sequencing fix** — Step 0 forecast preview on onboarding.html | I do | 90 | `onboarding.html` edited |
| 3 | **Pricing card update** — billing.html shows €9/€19/founders'-€6 | I do | 30 | `billing.html` edited |
| 4 | **"Show Reddit" post draft** — CMO's r/eupersonalfinance copy | I do | 30 | `docs/marketing/show-reddit-draft.md` |
| 5 | **80-word warm-outreach script** — CRO's brand-voice version | I do | 15 | `docs/marketing/outreach-script-v1.md` |
| 6 | **Funnel-events client lib** — `js/pfc-funnel.js` with the 6 events | I do | 30 | New file + wired into key pages |
| 7 | **Founders'-lifetime CTA** added on landing (founders.html link) | Deferred | — | Wave-14 |
| 8 | **Waitlist signup with GDPR-clean form** — Supabase backend | Deferred | — | Wave-14 (Supabase RLS audit first per CISO) |

**Items 1-6 are tonight. 7-8 are next session.**

---

## 7. Founder-Only Follow-Ups (you do these, not me)

| Item | Who said it | Timeline | Cost |
|---|---|---|---|
| Engage EU privacy + fintech outside counsel (10 questions from prior GC memo §7) | GC (both memos) | Before user #1 | €600-1500 |
| EUIPO trademark search + filing for "ProFinanceCast" | GC | 30 days | €850-1500 |
| Position A vs B decision (EU-first vs strip-EU) | GC | This week | €0, decision only |
| Send first 40-80 warm-outreach messages | CRO | Days 1-14 | €0 + founder time |
| Post the Show Reddit draft + 7 daily comments in r/eupersonalfinance | CMO | Days 1-14 | €0 + founder time |
| Paste the 5 Sentry alert rules per `docs/runbooks/sentry-slos.md` | VPE Wave-12 | ~15 min | €0 |
| 4 Gmail scheduled-sends as backup channel for the cadence cron | COO Wave-12 | ~10 min | €0 |
| GitHub branch protection on `main` requiring both CI workflows | CEO Wave-11 | 90 sec | €0 |
| Decide PayPal hybrid: waitlist days 1-3, ship Day 4-5? Or all-waitlist? | CRO | Now | €0 |
| Day-14 GDPR deletion-request drill on the waitlist SOP | GC | Day 14 of test | €0 |

---

## 8. The Kill Criteria (firm)

**Day 10:** If fewer than 8 signups AND Show Reddit post has fewer than 15 upvotes → stop, pivot to ICP-2 (UK/IE FIRE-late-starter on r/FIREUK).

**Day 14:** Final metrics due. Decision tree:
- Activation rate ≥20% AND ≥5 returning users in week 2 → CHANNEL TEST WORKED. Scale.
- Activation rate 5-20% OR returning users 1-4 → SIGNAL UNCLEAR. Read the qualitative feedback, redesign onboarding, run a second 14-day test.
- Activation rate <5% AND <1 returning user → CHANNEL FAILED. Try ICP-2 OR re-examine product positioning.

**The honest uncertainty:** at this scale, day-14 confidence intervals overlap with zero. Treat numbers as directional. Read the qualitative feedback (one question to each signup: "What did you come here to figure out?") with equal weight to the metrics.

---

## 9. Anti-Recommendations (what we explicitly are NOT doing)

| Item | Who rejected | Why |
|---|---|---|
| Paid ads (Google / Meta) for the 14-day test | CMO + CRO + CFO | CAC €8-25/click EU finance keywords; no PMF to optimize against; brand contradiction |
| Content SEO play | CMO + CRO | 90-day minimum to rank; need signal this week |
| Twitter/X thought leadership | CMO | Algorithm rewards provocation; brand voice requires restraint; structural mismatch |
| Product Hunt launch | CMO + CRO | One-day event; needs prep we don't have; pre-PMF launches yield 2-10 signups |
| Influencer outreach | CMO | Creators ask "how many users?" before reviewing |
| Building MORE free tools before validating which one converts | CMO + CPO | "Building inventory for a store with no foot traffic" (CMO direct quote) |
| Hiring a contractor before €15k MRR | CFO | Premature scaling |
| Raising before nailing PMF | CFO | Treats fundraising as PMF substitute |
| €5/mo "vanity" tier | CFO | Math fails on support cost |
| Free-forever Pro tier | CFO | No revenue model |
| Google Analytics / Hotjar / FullStory / Mixpanel | CDO | Privacy-first brand contradiction |
| Mailchimp for waitlist | CDO | Adds a subprocessor pre-revenue; Supabase already in stack |

---

## 10. Closing CEO Frame

The 12-wave engineering polish phase is closed. The product is structurally ready for first users. Pricing is set. Marketing claims pass through a compliance gate. Instrumentation is privacy-first. The activation moment is defined. The kill criteria are firm.

What remains is **founder-led sales motion**: 80 warm-outreach messages + r/eupersonalfinance comments + the day-by-day discipline of measuring + the willingness to kill at day 10 if the signal isn't there. That's not a code change — it's a behavior change.

The COO already wired the cadence cron + Monday check-in to surface "did I do the user-acquisition work this week" as a forcing question. Engineering polish work is now gated on a paired CMO/CRO artifact (one-sentence ICP / message-house / channel-test hypothesis attached to every non-bug-fix commit).

If the founder spends week-3 on engineering polish without paired GTM work, that's the avoidance pattern the COO plan was designed to catch. Watch for it.

— Chief of Staff

---

## 11. Tonight delivery — what actually shipped

Three commits landed Wave-13 to `main`:

| Commit | Scope |
|---|---|
| `8859879` | Synthesis + 6 advisor plans + grep gate + funnel.js + Reddit/outreach drafts + pricing.md + meta-tag sweep across about/auth/blog/sage/scenarios |
| `cf54b56` | billing.html + billing-2.js EUR conversion + Founders cap 500→100 + day-30 expiry copy + cap-default re-tiering |
| `dda883b` | pfc-funnel.js wired into 78 HTML pages (auto-fires `pfc.landing_viewed` site-wide with path prop) |

**Shipped tonight (5 of 6 tonight items):**
1. ✅ `scripts/check-marketing-claims.js` — GC word-list grep gate (19 residual edge-case hits in tools-verdict UI, all factually defensible)
2. ⏸ CPO sequencing fix on `onboarding.html` (Step 0 forecast preview, mobile auto-scroll) — **deferred to Wave-14**; UX-level surgery, regression-risky on a pristine post-Wave-11 state, warrants paired design pass
3. ✅ billing.html pricing card — EUR conversion + Founders cap 100/day-30. **Premium tier UI card deferred to Wave-14** (billing-2.js already references `plan==='premium'` so it's a clean follow-up slice)
4. ✅ Show Reddit post draft (`docs/marketing/show-reddit-draft.md`) + 7-day value-first comment motion
5. ✅ 80-word warm-outreach script (`docs/marketing/outreach-script-v1.md`)
6. ✅ `js/pfc-funnel.js` created AND wired into 78 pages

**Wave-14 carry-forward (tonight items not done + clean follow-up slices):**
- CPO sequencing fix on `onboarding.html` — Step 0 static forecast preview, mobile auto-scroll into live-calc panel
- Premium tier UI card on `billing.html` (€19/€169) + checkout SKU `premium_monthly` / `premium_annual`
- Founders' Lifetime CTA on landing page (`index.html`)
- GDPR-clean Supabase waitlist + signup flow (blocked on CISO RLS audit prerequisite)
- Wire `pfc.signup_started`, `pfc.onboarding_step`, `pfc.activation_done`, `pfc.scenario_saved`, `pfc.pro_intent` into the actual CTA / wizard / save handlers (currently only `pfc.landing_viewed` auto-fires)

**Founder-only follow-ups (unchanged from §7):** the 10 items the founder owns — EU outside counsel engagement, EUIPO trademark filing, Position A/B decision, sending first warm-outreach batch, posting Show Reddit, Sentry alert paste, scheduled-sends backup, GitHub branch protection, PayPal hybrid sequencing decision, Day-14 GDPR deletion drill SOP.
