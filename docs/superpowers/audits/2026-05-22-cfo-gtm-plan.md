# CFO GTM Plan — ProFinanceCast

**Date:** 2026-05-22
**Author:** cs-cfo-advisor
**Slice:** Pricing structure, unit economics, willingness-to-pay (WTP), 14-day channel-test budget, runway
**Currency:** EUR throughout
**Stage:** Pre-PMF, solo founder, ~0 users, ~€0 MRR

---

## Bottom Line (one-paragraph TL;DR)

> **Pro at €9/mo or €79/yr. Premium (Sage 500/mo) at €19/mo or €169/yr. Founders' lifetime at €6/mo, hard cap 100 seats, kill the offer after 30 days regardless of fill rate.** The 14-day channel test gets a hard cap of **€150-€250 total cash + 60-80 founder-hours**. If you cannot get a paid conversion or a payment-intent (checkout-started) at €9/mo within that window, the ICP is wrong — not the price. Runway at current burn (€20-40/mo) is effectively indefinite while costs are sub-€100/mo, so the constraint isn't cash, it's **the founder's calendar and motivation half-life** (estimated 6-9 months before energy taxes the experiment regardless of money). Do NOT raise outside capital before €3-5k MRR and >10% MoM growth for two consecutive months. Pricing is a hypothesis. The numbers below are the first falsifiable bet, not a strategy.

Before anything else: let's see the math.

---

## 1. PRICING STRUCTURE — the actual numbers

### 1.1 Comparable anchor set (EU privacy-first / personal finance SaaS)

| Tool | Monthly | Annual | Annual/Monthly ratio | Notes |
|---|---|---|---|---|
| YNAB | $14.99 (~€13.80) | $109 (~€100) | 0.61x → 39% discount | US-priced, sells in EU |
| Lunchmoney | $14 (~€12.90) | $100 (~€92) | 0.60x → 40% discount | Indie, privacy-leaning |
| Monarch Money | $14.99 (~€13.80) | $99.99 (~€92) | 0.56x → 44% discount | US-only effectively |
| Copilot | $13/mo | $95/yr (~€87) | 0.61x → 39% discount | US-only |
| Banktivity | — | $69.99/yr (~€64) | one-tier | Mac-only |
| Buxfer Pro | $4.99/mo | $39.99/yr | 0.67x → 33% discount | Low-anchor competitor |
| Toshl Pro | €2.99/mo | €23.99/yr | 0.67x → 33% discount | EU, low-anchor |
| Tiller | — | $79/yr (~€73) | annual-only | spreadsheet-based |
| **Median** | **~€12-13/mo** | **~€85-95/yr** | **~38% discount** | |

**The €5/mo anchor that lives in your head is wrong.** It's anchored to consumer impulse purchases (Spotify €10.99, Netflix €13.99), not to financial-tools willingness-to-pay. The category clears at €10-15/mo. Anything <€8/mo signals "hobby app" and attracts the lowest-LTV, highest-support-burden cohort.

### 1.2 Recommended pricing (the actual numbers)

#### **Pro Tier**

| | Price | Defense |
|---|---|---|
| **Monthly** | **€9.00/mo** | Just below €10 psychological barrier. Higher than the toy tools (Toshl/Buxfer), lower than the established US incumbents. Lets you tell EU buyers "we're €4 cheaper than YNAB" — a real wedge. |
| **Annual** | **€79/yr** (€6.58/mo equiv) | 27% discount vs monthly. Hits the €79-89 sweet spot below YNAB/Lunchmoney annual (€92-100). Round number, easy mental math. |
| **Annual discount** | **27%** | Not 30% — that's a Black Friday number and trains buyers to wait. Not 20% — too thin to motivate the cash-flow swap. 27% is the "fair, not desperate" discount that converts ~25-35% of buyers to annual at PMF stage. |

**Why not €7?** €7/mo says "I'm afraid of my price." It costs you €2/mo of margin per user × however many users convert anyway (most of whom would have paid €9). At 100 users that's €200/mo of free money you left on the table to feel safer.

**Why not €12?** Because you have €0 of brand and zero proof. €9 lets you A/B test up to €12 in three months once you have testimonials; you cannot test downward without devaluing the brand. **Always start in the lower-middle of the band and raise.**

**Why not €19?** That's Premium territory (see below). Don't blur the tiers.

#### **Premium Tier** (the Sage 500-AI-calls/mo tier)

| | Price | Defense |
|---|---|---|
| **Monthly** | **€19/mo** | 2.1x the Pro price. Premium tiers in SaaS typically run 2-3x base. Below €20 keeps it impulse-purchasable on personal credit cards. |
| **Annual** | **€169/yr** (€14.08/mo equiv) | 26% discount, same logic as Pro. |
| **Why not €15?** | Too close to Pro. Buyers won't see the value gap. The 2x ratio creates a clean "yes I want the AI" decision. |
| **Why not €29?** | At pre-PMF you have no proof Sage delivers €29/mo of value. €19 is the price at which a skeptical user will *try* it. €29 is the price at which they'll wait for reviews. |

#### **Founders' Pricing** (the lifetime-discount question)

**Recommendation:** **YES, but tightly bounded.**

| Parameter | Value | Defense |
|---|---|---|
| Price | **€6/mo for life** (or €59/yr lifetime-locked) | 33% off Pro. Generous enough to feel like a real reward, not so generous it cannibalizes future revenue. |
| Cap | **100 seats, hard** | Beyond 100, the discount stops mattering as "founding member" social proof and starts being a balance-sheet liability. |
| Time window | **30 days from launch of paid tier** | Even if you don't hit 100, kill the offer at day 30. Scarcity-by-time, not just by-seat. |
| Eligibility | Pro tier only, NOT Premium | Don't lock in lifetime discounts on a tier whose unit economics you haven't validated yet (Premium has Gemini cost exposure — section 3). |
| Communication | "First 100 supporters get €6/mo for life. After that, €9/mo." | Anchors the €9 price as the "normal" price even to people who miss the deal. |

**Worst-case revenue exposure of founders' tier:** 100 seats × €3/mo discount × 60 months (5-year LTV assumption) = **€18,000 cumulative discount foregone**. That's the price of social proof. Acceptable.

**If you're nervous,** offer **€6/mo for 12 months, then €9** instead of lifetime. Less powerful as social proof but caps the downside. My preference: lifetime. The bragging right matters more than the €18k.

### 1.3 The €5/mo trap (what we're rejecting and why)

You hear "people will pay €5/mo if you ask." That's true. People will also pay €0/mo if you ask. The €5 cohort is the **worst possible customer**:
- They pay €5/mo (= €60/yr) gross
- Stripe/PayPal fees: ~€0.45/mo (€5.40/yr)
- Net: €4.55/mo ≈ €54.60/yr
- One support ticket via email at 30 minutes of founder time ≈ €25-50 of opportunity cost (if founder hour ≈ €50-100/hr)
- Churn: low-price cohorts churn faster, not slower (lower psychological commitment)

A €5 user generates ~€55/yr net and consumes 30-60 min/yr of founder time. A €9 user generates ~€100/yr net and consumes the same ~30-60 min. **Same cost, 80% more revenue.** Vanity-pricing the tier kills the unit economics that the rest of this document depends on.

---

## 2. WILLINGNESS-TO-PAY HYPOTHESES (the experiments)

You do not know what people will pay. Anyone who claims to know is lying. The job is to design experiments that *disconfirm* your guess as fast and as cheaply as possible.

### 2.1 Experiment 1 (ship first) — "The €9 Smoke Test"

**Goal:** Disconfirm that Pro at €9/mo has any pull at all in the chosen ICP.

**What ships:**
- Pro page shows **€9/mo or €79/yr** (no founder discount visible yet)
- PayPal sandbox → swap to live for this test
- Single CTA: "Start 14-day free trial — no card required"
- Trial endpoint that does NOT require payment up front (collects email + intent, then asks for card on day 14)

**Success metrics (the actual numbers):**

| Metric | Target | Kill threshold |
|---|---|---|
| Landing → trial signup | **≥ 4%** | < 1.5% over 200+ visitors → ICP wrong |
| Trial → paid conversion | **≥ 10%** | < 4% → product wrong OR price wrong, ambiguous |
| Card-add rate during trial (asked at day 7) | **≥ 25%** | < 10% → intent isn't real |
| First 100 visitors that even *click* the price page | **≥ 35%** of homepage visitors | < 15% → top of funnel positioning wrong |

**Sample-size note:** Below ~150-200 visitors you cannot distinguish signal from noise. If the channel test (section 4) doesn't deliver ≥150 unique landing visits, **the experiment is inconclusive, not failed.** Important distinction; founders confuse the two.

**Cost of running:** €0 incremental (lives inside the channel-test budget).

**Duration:** 14 days, matched to the channel test.

### 2.2 Experiment 2 (if Exp-1 fails) — "The €5 Diagnostic"

**Triggered when:** Exp-1 trial→paid conversion < 4% AND landing→trial ≥ 4%. (Meaning: people want the product but balk at €9.)

**What ships:**
- Same product, same trial flow
- Pro page A/B: 50% see €9, 50% see €5
- Run for 7 days minimum, ≥75 visitors per arm

**What it tests:** Is €9 a *price-elasticity* problem (cut price, conversions double) or a *value-perception* problem (cut price, conversions barely move)?

**Decision tree from Exp-2 outcome:**

| Outcome | Interpretation | Action |
|---|---|---|
| €5 converts ≥2x €9 | Price-elastic. People want it cheap. | NOT a green light to lower price. Means ICP is wrong (you've found the wrong-cohort). Move to ICP-2. |
| €5 converts 1.2-2x €9 | Mild elasticity, marginal customers. | Hold price at €9, focus on value comms. |
| €5 converts ≤1.1x €9 | Inelastic. Price is not the blocker. | Product/feature gap. Go back to product. **Do not lower price.** |
| Both arms convert <2% | Channel/ICP problem, not pricing. | Stop testing pricing. Find new ICP. |

**Key insight:** Lowering price to "win" a failing experiment is the most expensive mistake a pre-PMF founder makes. It locks in a low-value cohort and trains the market to expect cheap. **Exp-2 exists to *diagnose*, not to set the new price.**

### 2.3 Experiment 3 (if Exp-1 succeeds) — "Annual Push + Premium Test"

**Triggered when:** Exp-1 hits or exceeds targets.

**What ships:**
- Default the pricing page to **annual (€79)** with monthly as the secondary option
- Add Premium (€19/mo) as visible third tier
- A/B the founders' lifetime offer (50% see it, 50% don't) to test whether it accelerates conversion or just discounts existing buyers

**What it tests:**
1. Annual default capture rate (target: 30-45% of paid conversions go annual)
2. Premium attach rate (target: 5-15% of Pro converters upgrade or pick Premium directly)
3. Founders' offer lift (target: ≥1.5x conversion when shown vs not shown — if <1.2x, kill the offer; it's giving away margin without driving incremental signups)

**Cost of running:** €0 incremental.

**Duration:** 30 days from end of channel test.

---

## 3. UNIT ECONOMICS AT SCALE

### 3.1 Per-user economics (the assumed mix)

Assumed product mix at scale: **75% Pro / 20% Premium / 5% founders' grandfathered.** Conversion from free to paid: 2-5% (CRO will refine). Annual/monthly mix: assume 30% annual, 70% monthly initially.

**Blended ARPU per paying user:**
- Pro (monthly equiv): 0.75 × [(0.7 × €9) + (0.3 × €79/12)] = 0.75 × (€6.30 + €1.98) = **€6.21**
- Premium: 0.20 × [(0.7 × €19) + (0.3 × €169/12)] = 0.20 × (€13.30 + €4.23) = **€3.51**
- Founders': 0.05 × €6 = **€0.30**
- **Blended monthly ARPU ≈ €10.02**

Rounding to **€10/mo blended ARPU** for the rest of this section. (Within ±10% given the uncertainty in mix.)

**Per-user variable costs (monthly):**

| Cost | Per Pro user | Per Premium user | Notes |
|---|---|---|---|
| Payment processing (PayPal/Stripe, ~2.9% + €0.30) | ~€0.56 | ~€0.85 | Higher % drag at lower price points |
| Supabase row/storage allocation | ~€0.05-0.15 | ~€0.05-0.20 | Negligible until 10k+ users |
| Upstash Redis ops | ~€0.02-0.10 | ~€0.05-0.20 | Depends on session pattern |
| Gemini API (Sage) | ~€0.05-0.30 | **~€2.50-6.00** | The big variable — see 3.4 |
| Email/transactional (Resend or similar) | ~€0.02 | ~€0.02 | |
| **Total variable per Pro** | **~€0.70-1.15** | | |
| **Total variable per Premium** | | **~€3.45-7.25** | |

**Gross margin per user:**
- Pro: (€9 - €0.92 avg) / €9 = **~90% gross margin** (very healthy)
- Premium: (€19 - €5.35 avg) / €19 = **~72% gross margin** (acceptable, watch Gemini)
- Founders': (€6 - €0.62) / €6 = **~90% gross margin**

### 3.2 At 100 paying users

| Metric | Value |
|---|---|
| Paying users | 100 (75 Pro + 20 Premium + 5 Founders) |
| **MRR** | **~€1,000** (€10 blended × 100) |
| **ARR** | **~€12,000** |
| Variable COGS/mo | ~€135-200 |
| Gross profit/mo | ~€800-865 |
| **Gross margin** | **~80-87%** |
| Fixed infra cost/mo | €20-50 |
| **Net contribution/mo (pre-founder-salary)** | **~€750-845** |
| Breakeven | Already at €0 founder salary — you're profitable. Not against founder time. |

**Verdict at 100:** Side-project successful. Pays for the tools. Doesn't pay rent. Doesn't justify founder going full-time.

### 3.3 At 1,000 paying users

| Metric | Value |
|---|---|
| Paying users | 1,000 (750 Pro + 200 Premium + 50 Founders) |
| **MRR** | **~€10,000** |
| **ARR** | **~€120,000** |
| Variable COGS/mo | ~€1,350-2,000 |
| Fixed infra cost/mo | ~€80-150 (Vercel Pro €20, Supabase Pro €25, Upstash Pay-as-you-go €30-80, Plausible €19, Sentry Team €26) |
| Gross profit/mo | ~€7,850-8,570 |
| **Gross margin** | **~78-86%** |
| Customer support load | ~2-5 tickets/day → 1-3 hours/day founder time |
| **Net contribution/mo (pre-founder-salary)** | **~€7,700-8,400** |
| Breakeven against €60k/yr founder salary | Yes — €7,700-8,400/mo covers a €60k salary (€5,000/mo) with €2,700-3,400 leftover for tax/buffer/reinvestment |

**Verdict at 1,000:** Real business. Founder pays themselves modestly. Can hire a part-time support person at ~1,500 users to claw back support time. **This is the "go full-time" threshold (see 5.2).**

### 3.4 At 10,000 paying users — and the Gemini cost ceiling

| Metric | Value |
|---|---|
| Paying users | 10,000 (7,500 Pro + 2,000 Premium + 500 Founders) |
| **MRR** | **~€100,000** |
| **ARR** | **~€1.2M** |
| Variable COGS/mo | **see breakdown below** |

**Variable cost decomposition at 10k:**
- Payment fees: ~€6,200/mo (2.9% + €0.30 × ~10k transactions)
- Supabase Pro/Team tier (compute + storage + bandwidth): ~€500-1,500/mo
- Upstash: ~€200-500/mo
- Email/transactional: ~€100-300/mo
- **Gemini API (Sage)**: **€5,000-15,000/mo** — the dominant variable cost

**Why Gemini is the cost ceiling:**

Premium tier promises 500 AI calls/mo. At 2,000 Premium users that's **1M Gemini calls/mo**. At Gemini 2.5 Flash pricing (~$0.075-0.30 per million input tokens, $0.30-2.50 per million output tokens), assume:
- Avg call: 500 input tokens + 300 output tokens
- Cost per call: ~$0.0001-0.0008 (€0.00009-0.00075)
- 1M calls/mo: **$100-800 (€90-740)**

Add Pro tier "light" AI usage (assume 20 calls/mo × 7,500 = 150k calls): another €13-110.

**That suggests €100-850/mo at 10k users — well within margin.** *Caveat:* this assumes (a) Flash-tier model not Pro-tier, (b) no chain-of-thought / agentic workflows that 10x token use, (c) prompt caching is enabled. If the product evolves to use Gemini 2.5 Pro or agentic loops, **multiply by 10-30x.** That's the **€5,000-15,000/mo** range and the reason Premium gross margin is the one to watch.

**The CFO rule:** Every Premium feature must have a per-call cost cap. Engineering: log cost-per-user per month and alert if any Premium user exceeds €5/mo in API costs. That user is either abusing the tier or your prompt design is broken.

**At 10k users, what changes:**

| Area | Change required |
|---|---|
| Infra | Upgrade Supabase to Team tier (~€500/mo). Vercel Pro adequate until ~50k DAU. |
| Hires | 1 customer success/support (FT, ~€45-55k/yr). 1 part-time engineer or contractor for incident response. Founder remains CEO/product. |
| Fixed costs | ~€8-10k/mo (salaries dominate) |
| Net margin | (€100k - €5k variable - €10k fixed) / €100k = **~85% gross, ~50-60% net** after founder + 1 hire |

**Verdict at 10k:** Real SaaS company. ~€600k-720k/yr in profit before tax. Fundable, but probably doesn't need it.

### 3.5 The honest uncertainty

| Number | Confidence | Sensitivity |
|---|---|---|
| ARPU = €10/mo blended | ±20% | Mix of monthly/annual and Pro/Premium drives this |
| Free→paid conversion 2-5% | Wide range | Below 1.5% kills the funnel math at any price |
| Gemini cost scaling | ±10x | Single biggest forecasting risk. Could be €100 or €15,000 at 10k Premium users. |
| Support burden | ±50% | Founder UX work in next 30 days materially changes this |

Build the spreadsheet with **named inputs** (ARPU, conversion, Gemini cost/call) and sliders. Update monthly. Do not anchor on point estimates.

---

## 4. THE 14-DAY CHANNEL TEST BUDGET

### 4.1 Hard cash cap

| Item | Budget | Defense |
|---|---|---|
| **Total cash for paid acquisition** | **€150-€250** | Enough to drive ~75-150 clicks on a niche channel at €1-3 CPC. Below that, statistical noise dominates. Above €250, you're funding the test, not testing the channel. |
| **Tools (Plausible upgrade if needed, link shortener, etc.)** | **€0-€30** | Use existing free-tier wherever possible. |
| **Content production (designs, copy, video if needed)** | **€0-€50** | Use Canva free, write copy yourself, use existing screenshots. |
| **TOTAL HARD CAP** | **€250 (preferred €180)** | If the CRO comes back with a plan that needs >€300, push back. |

### 4.2 Hard kill criteria

Stop spending **immediately** if any of:

1. **Visitor → trial signup < 1.5%** over 200+ unique landing-page visitors → ICP wrong, change ICP not price
2. **Trial → paid conversion < 4%** with sample size ≥30 trial signups → product/price problem, run Exp-2
3. **CAC tracking above €40 per trial signup** at any point during the test → unit economics broken even before you measure LTV
4. **Cumulative cash spent ≥ €200** without a single trial signup → channel is wrong, kill immediately
5. **Day 7 mid-test review:** if spend pace projects >€250 by day 14, pause and reassess

### 4.3 Founder opportunity cost — the unquantified line item

Founder spending 14 days on GTM is **not free**. Loose quantification:

- Founder hour value (opportunity cost): ~€50-100/hr based on (a) what the founder could earn contracting, (b) what comparable senior engineers cost in EU markets
- 14 days × ~6 productive hours/day (GTM is exhausting) = **~84 hours**
- Implied opportunity cost: **€4,200-€8,400** of foregone engineering output

**Is that worth it?** Pre-PMF, yes — but only if the test is *designed to disconfirm*, not to "see what happens." The cost of 14 days of GTM with no falsifiable hypothesis is the same €4,200-€8,400, but you learn nothing. **The hypothesis is the entire value.**

What you lose by NOT engineering for 14 days: maybe one major feature, several bug fixes, polish on the Pro page. None of which matters if no one wants the product. **Order of operations is correct: GTM test first, polish second.**

### 4.4 "Free" channels with hidden costs

| Channel | Cash cost | Hidden cost (founder hours) | True cost |
|---|---|---|---|
| Reddit (r/personalfinance, r/eupersonalfinance) | €0 | 4-6h to write a quality post, monitor comments, respond | ~€200-600 in founder time |
| Twitter/X organic | €0 | 30-60 min/day × 14 days = 7-14h | ~€350-1,400 |
| ProductHunt launch | €0 (free to launch) | 8-16h prep + launch day | ~€400-1,600 |
| Indie Hackers / Hacker News | €0 | 2-4h for a thoughtful post | ~€100-400 |
| Personal LinkedIn | €0 | 1-2h to write, 30 min to respond | ~€50-200 |
| **Founder-written newsletter post (substack, etc.)** | €0 | 3-5h | ~€150-500 |
| Cold DM (founders in finance/SaaS communities) | €0 | 4-8h, low conversion, energy-drain | ~€200-800 |

**Key insight:** "Free" channels cost €100-€1,600 in founder-time per channel. Pick **one paid + one organic** for the 14-day test, not three. **The discipline of saying no to channels is more valuable than running them all poorly.**

### 4.5 What I'd actually budget (recommendation)

| Item | Amount |
|---|---|
| Paid channel (CRO picks: likely targeted Reddit ads, Twitter ads, or niche newsletter sponsorship) | €150 |
| Buffer for retargeting / second-creative iteration | €50 |
| Landing page tooling (existing) | €0 |
| Analytics (Plausible already paid) | €0 |
| **Cash total** | **€200** |
| Organic channel (one only — e.g., a thoughtful Reddit post in r/eupersonalfinance) | €0 cash + ~6 founder-hours |
| **TOTAL** | **€200 + ~80 founder-hours** |

If the CRO proposes Google Ads or Meta Ads at this stage, **push back hard.** Those channels need €1,000+ to even seed the algorithm and are wrong for pre-PMF privacy-positioned tooling. Reddit ads, X ads, or a single newsletter sponsorship are the right shape.

---

## 5. RUNWAY MATH

### 5.1 Current burn and runway

| Cost item | Monthly | Annualized | Notes |
|---|---|---|---|
| Vercel Hobby | €0 | €0 | Free until ~100GB bandwidth |
| Supabase Free | €0 | €0 | Free until 500MB DB / 2GB bandwidth |
| Upstash Redis Free | €0 | €0 | 10k commands/day |
| Plausible | ~€9 | €108 | Cheapest paid tier; could move to free self-host but not worth it |
| Sentry Free | €0 | €0 | 5k errors/mo |
| Cloudflare Free | €0 | €0 | |
| Gemini API | €0-50 | €0-600 | Current usage at ~0 users is minimal |
| Domain | ~€1 | ~€12 | Amortized |
| PayPal/Stripe | €0 | €0 | Until first transaction |
| **TOTAL** | **€10-60/mo** | **€120-720/yr** | Center estimate: **€25/mo / €300/yr** |

**Runway:** If the founder has any savings or income covering personal expenses, **the company runway is effectively infinite** at this burn. A €1,000 buffer covers ~3 years of company costs at center estimate.

**The actual constraint is not money. It's the founder's:**
1. **Time-availability** (other obligations, day job, family)
2. **Motivation half-life** (estimated 6-9 months at zero traction before energy drops materially)
3. **Personal cash runway** (what covers rent + food while doing this)

**CFO honest take:** I don't know the founder's personal runway. **That's the number I need before I can give real runway advice.** Until then, treat the company as cash-indefinite and the founder as the limiting reagent.

### 5.2 Full-time-on-this threshold

| Scenario | MRR threshold | Defense |
|---|---|---|
| **Minimum to consider "this is real"** | **€500/mo** (~50 paying users) | Sub-€500/mo could be 5 friends paying out of pity. Above €500/mo from strangers = signal. |
| **"Side project + treat seriously"** | **€500-€2,000/mo** | Justifies 10-20h/week, not full-time |
| **Quit-the-day-job threshold (frugal)** | **€3,500-€5,000/mo** | Covers EU founder living costs (rent + tax + minimal lifestyle) in a mid-cost city. Sub-Berlin/Paris numbers. |
| **Quit-the-day-job threshold (sustainable)** | **€6,000-€8,000/mo** | Covers living + tax + ~€1k/mo savings + buffer |
| **"Hire your first person" threshold** | **€12,000-€15,000/mo** | Covers founder + 1 mid-level hire after tax |

**My recommendation:** Founder stays part-time / lean until **€3,500/mo MRR** with **>10% MoM growth for 2 consecutive months**. Below that, quitting prematurely converts company runway burn into personal-cash burn at 50-100x the rate. The math is brutal: founder personal burn (rent + tax + life in EU) is probably **€3,000-€5,000/mo**, vs company burn of **€25/mo**. Going full-time **multiplies total burn by ~150x**. Do that only when MRR justifies it.

### 5.3 First fundraising trigger

**The bootstrap-vs-raise question:**

| Path | When to choose it |
|---|---|
| **Bootstrap forever** | If ARR plateaus at €100k-€500k, market is sufficient, founder values control. Most likely path for this product given the EU privacy-finance niche. |
| **Raise (small)** | At **€8-15k MRR (€100-180k ARR)** with **>15% MoM for 3 months** AND a clear use-of-funds (e.g., "I need a second engineer to ship integrations to bank X, Y, Z"). Target: €250k-€750k angel/pre-seed. |
| **Raise (institutional)** | At **€25-50k MRR with >10% MoM**, expansion thesis (B2B2C, partnerships, multi-market). Target: €1-3M seed. |
| **Never raise** | Default. Don't raise unless you have a specific bottleneck money fixes that effort cannot. |

**Hard CFO rule for this founder:** **Do not take a meeting with an investor before €5k MRR.** Pre-PMF fundraising at this stage destroys two things — (a) valuation (you sell 20-30% for €200k because you have no leverage), (b) optionality (your investors now expect 10-20x returns, forcing growth choices that may not match the EU-privacy positioning). The privacy-finance niche may well cap at €1-3M ARR — a beautiful bootstrap outcome but a disastrous venture outcome.

---

## 6. ANTI-RECOMMENDATIONS

**What looks attractive at pre-PMF that I reject:**

1. **Raising any capital before €5k MRR.** Anti-pattern. Investor money at zero traction sets a low valuation, dilutes the founder 20-40%, imports growth expectations that may not match the niche, and adds a board even if informal. Stay alone, stay cheap, stay nimble. Money buys nothing pre-PMF that effort doesn't already buy.
2. **Pricing by feature count ("Pro has 5 budgets, Premium has unlimited").** Anti-pattern. Customers don't buy features, they buy outcomes. Tier by *value delivered* (basic budgeting vs AI-powered insights) not by counting. Feature-count pricing trains buyers to nickel-and-dime you and makes every product decision a pricing-ladder problem.
3. **A free-forever Pro tier "to seed the funnel."** Anti-pattern. You already have a freemium model (free tier exists). Adding a free Pro tier dilutes the paid signal you desperately need. The 14-day trial is your funnel mechanism. Don't muddy it.
4. **Discounts at <€9 to "fight off" Toshl/Buxfer.** Anti-pattern. You are not competing with Toshl on price; you're competing on positioning (privacy, EU, AI). Match price to the *anchor* you want buyers to use (YNAB/Lunchmoney), not the cheapest competitor.
5. **Pricing announcements made permanent.** Anti-pattern. Every price you publish today should be revisitable in 60-90 days. Use phrases like "Launch pricing" or "Founders' rate" in copy so buyers don't feel rugged when you raise. **Pricing is a hypothesis until you have 200+ paying users.**
6. **Lifetime deals beyond the founders' 100-seat cap (AppSumo-style).** Anti-pattern. Mortgages future MRR for one-time cash. The 100-seat founder cap is the maximum acceptable balance-sheet exposure. AppSumo or similar bulk-LTD deals beyond that are pre-PMF revenue cocaine — feels great, kills you slowly.
7. **Hiring (anyone) before €15k MRR.** Anti-pattern. Every euro of founder time is the cheapest engineering hour you'll ever have. Hire when revenue can absorb a €50k+ EU all-in cost, not before.
8. **Spending more than €250 on the 14-day test.** Already covered. Anti-pattern. €1,000 ad spend tests the channel, not the product. You need to test the product first.

---

## EXECUTION CHECKLIST (~30 minutes after all advisors return)

- [ ] Set Pro tier pricing in product to **€9/mo or €79/yr** (replace "See Pro plans" CTA with actual numbers)
- [ ] Set Premium tier pricing to **€19/mo or €169/yr**
- [ ] Create founders' offer banner: "First 100 supporters: €6/mo for life — until [date 30 days out]"
- [ ] Build cost-per-user dashboard input (Gemini calls per user, Supabase rows per user) — even a Google Sheet is fine
- [ ] Confirm PayPal live-mode keys ready to swap from sandbox
- [ ] Set hard channel-test cash cap of **€200-250** in whatever ad account CRO chooses
- [ ] Write down the **kill criteria** from section 4.2 as a sticky note literally next to the laptop
- [ ] Define and document the **success metric for Exp-1** before launching the channel test (target: 4% landing→trial)
- [ ] Confirm personal runway with CEO advisor (this is the missing input)

---

## CLOSING

Pricing is a hypothesis. The €9/€19 numbers above are the first falsifiable bet, not a strategy. The 14-day test exists to disconfirm them. The runway is fine; the founder's calendar and motivation are the scarce resources.

**Numbers don't lie; founders' optimism does.** Build the spreadsheet. Re-run it monthly. Update it from actuals, not from hopes.

Here's the spreadsheet structure to build (named inputs):
- ARPU_blended (€10)
- Conv_free_to_paid (2-5%)
- Mix_pro_premium_founders (75/20/5)
- Mix_monthly_annual (70/30)
- Gemini_cost_per_call (€0.0001-0.0008)
- Premium_calls_per_user (500/mo cap)
- Variable_payment_fee_pct (2.9% + €0.30)
- Fixed_infra_monthly (€25 → €150 → €1,000 as scale grows)
- Founder_salary_target (€60k/yr at threshold)

Plug it in. Move every slider. See which one breaks the business first. That's the metric you watch obsessively for the next 90 days.

---

*Prepared by cs-cfo-advisor. Cross-reference with cs-cro-advisor (conversion targets + channel choice), cs-ceo-advisor (capital allocation across product/GTM/runway), cs-gc-advisor (PayPal live-mode + EU consumer-rights for trials and lifetime offers).*
