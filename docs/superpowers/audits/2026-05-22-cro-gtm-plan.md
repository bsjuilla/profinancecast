# ProFinanceCast — CRO GTM Plan
**Date:** 2026-05-22
**Author:** CRO Advisor (cs-cro-advisor)
**Audience:** Founder / sole executor
**Horizon:** 14-day channel test window

---

## Bottom Line

You are not off plan — there is no plan yet. That is the only real problem. The product is shippable. PayPal is 90% wired. The onboarding is six steps. The brand register is tighter than most Series A companies. The blocker is that zero humans outside the founder have been asked to use it. Fix that this week, not next week. Everything else in this document is scaffolding around that single action.

---

## 1. Pipeline Math

### Channel assumption

The CMO picks ONE channel for the 14-day test. Based on the product profile — privacy-first, no bank login, "quiet European forecasting house" register, solo founder with no ad budget — the only honest channel to test first is **direct warm outreach**: the founder contacts known individuals by name, by message, by hand. No broadcasting. No content waiting to compound. No ads. This is not a cop-out; it is the only channel where you get signal (do people want this) rather than noise (do people click).

Plausible reach from a warm network in 14 days: **40–80 people contacted**, if the founder commits 45 minutes per day to outreach.

### Funnel math — low / mid / high

The table below is not a forecast. It is a set of dials that let you read the week's numbers against a calibrated expectation.

| Stage | Low | Mid | High | Notes |
|---|---|---|---|---|
| Contacted | 40 | 60 | 80 | Hand-written, personalised messages |
| Clicked the link / visited | 30% = 12 | 45% = 27 | 60% = 48 | Many warm contacts will open out of courtesy |
| Signed up (auth.html) | 25% of visitors = 3 | 35% = 9 | 50% = 24 | Drop here is mostly "I'll do it later" friction |
| Completed onboarding (6 steps) | 40% of signups = 1 | 55% = 5 | 70% = 17 | Onboarding is the first real leak |
| Activated (definition in Section 2) | 50% of onboarding completers = 1 | 60% = 3 | 75% = 13 | Second real leak |
| Pro upgrade intent expressed | 5% of activated = 0 | 15% = 0–1 | 25% = 3 | PayPal not live — captures as interest, not revenue |

Read this table as: in the mid scenario you get roughly 27 visitors, 9 signups, 5 people who complete onboarding, 3 activated users, and 0–1 who raise their hand for Pro. That is the realistic output of 14 days of founder-led outreach. It is enough signal. It is not enough revenue.

### Where the funnel most likely breaks

**At onboarding step 2 (Income and Expenses).** The six-step wizard is well-built but it asks for take-home income, housing, food, transport, and other expenses before the user has seen any output. This is the classic "ask before you show" failure mode. Privacy-anxious users — which is your entire ICP — are more likely to abandon at the data-entry step than at any other point. They have not yet seen what they get in return for the numbers. The "live calculation" preview at the bottom of Step 2 partially mitigates this, but the user has to scroll to see it and may not realise it updates in real time.

The second-highest risk is **Step 0 to Step 1 abandonment**: a user who clicks through from your message, arrives at the onboarding wizard, reads "3 minutes" and "6 steps," and decides they do not have 3 minutes right now. This drop happens before you can measure anything.

### Instrumentation requirement — privacy-preserving

You already have Plausible (confirmed in `onboarding.html`). Plausible is cookieless, GDPR-compliant, and collects no PII. It does not break your privacy promise.

The one instrumentation change to make before the 14-day test: **add a Plausible custom event at each wizard step transition.** Specifically, fire `plausible('onboarding_step', {props: {step: '1'}})` (through step 6) on each "Next" button click. This gives you a step-by-step drop-off funnel that is:
- Fully server-side aggregated by Plausible
- No cookies, no fingerprinting, no PII
- Visible in your Plausible dashboard within minutes of a user triggering it

You do not need a third-party funnel tool. You do not need Mixpanel or Amplitude. Plausible custom events are the right call here.

One line of JavaScript per step button click. Ship it tonight alongside outreach prep.

---

## 2. Activation Moment

### Definition

A user is **activated** when they complete the onboarding wizard AND view the dashboard with at least one non-zero forecast metric rendered — specifically, when the projected 12-month net worth figure on `dashboard.html` displays a number other than $0 or "—".

That is the moment value is delivered. Not "signed up." Not "completed onboarding." The moment the chart loads with their numbers. Everything before that is preamble.

This definition matters because it creates an exact boolean you can check: did the user reach `dashboard.html` with their data loaded. Plausible can confirm this with a `dashboard_activated` custom event fired once when the net-worth projection renders with a value greater than zero.

### Time targets

- **P50 (median user):** 4–6 minutes from landing on `onboarding.html` to seeing a rendered dashboard.
- **P90 (slow/cautious user):** 10–12 minutes. If a user is taking longer, they are either re-reading the privacy panel carefully (fine) or they have abandoned a tab (not recoverable by onboarding changes).

The six-step wizard is designed for 3 minutes. The gap between 3-minute design intent and 4–6 minute P50 reality is normal — people read, re-read, second-guess numbers. Design for the P50, not the happy path.

### Activation rate target for first 100 users

Target 20%. This is honest. Pre-PMF, privacy-first products where users must manually enter financial data have activation rates of 15–25% in the first cohort. The reasons for the other 75–80% are: tab abandonment, "I'll do it properly later," not having salary numbers to hand, and a general reluctance to put financial data anywhere new. You can move this number with onboarding changes, but 20% is the honest baseline to plan against.

If you hit 30% or above in the first 14 days, the onboarding is working and you should replicate it without changes.

### First draft onboarding change to move the activation number

**Change in `onboarding.html`, Step 0 (Welcome panel):** Before the six features list, add a single sentence in teal: "No bank connection. Your numbers stay in your browser." Then add a "What you'll see at the end" preview — a static screenshot or SVG mockup of the dashboard chart with placeholder numbers (e.g., "Net worth in 12 months: $14,340"). This is a promise of the output, shown before the user is asked for any input.

The psychological mechanic: users abandon forms when they do not know what success looks like. Show the destination at the start. The forecast chart is the product's strongest moment. Move it to Step 0 as a static promise, then deliver it live at the end.

This change does not require modifying the wizard logic. It is one HTML block added to `step-0` in `onboarding.html`. It can be done in 30 minutes.

**Change in `onboarding.html`, Step 2 (Income and Expenses):** Scroll the live-preview panel into view automatically when any of the four income/expense inputs changes. Currently the preview sits below the fold on mobile. On mobile, after the first `calcLive` event fires, call `document.getElementById('income-preview').scrollIntoView({behavior:'smooth', block:'nearest'})`. This makes the live-calculation feedback immediate and visible, which justifies the act of entering numbers.

---

## 3. Pro-Tier Conversion — PayPal Decision

### The honest assessment of PayPal's status

The `create-order.js` file confirms the API integration is structurally complete: authentication, SKU prices, PayPal order creation, return URLs, and the `capture-order.js` pathway all exist. The blocker is that `PAYPAL_ENV` is set to `'sandbox'` and the production credentials are not wired. This is a configuration and testing gap, not an architectural gap. The PayPal integration is probably 3–5 hours of work to go live: switch env to production, test with a real $1 charge, confirm the Supabase subscription row writes correctly after capture.

### Recommendation: ship PayPal production in the 14-day window, but it is NOT P0 for the first 7 days

Here is the tradeoff written plainly:

**Option A — Waitlist Pro tier (days 1–14):** When a user clicks "Upgrade to Pro" on `billing.html`, the button submits their email to a waitlist (the newsletter subscribe API already exists at `api/newsletter/subscribe.js`). You send a personal email when PayPal goes live. No revenue captured. You do learn: how many activated users express Pro intent.

**Option B — Ship PayPal production now and delay outreach by 1 week:** You get a payment-capable product but you lose 7 days of user signal. At pre-PMF with zero users, paying users are not your constraint — learning is. A week of delay to capture $9–$69 from 0–2 users is a bad trade.

**Option C — Hybrid (recommended):** Run the 14-day outreach with the waitlist Pro flow for days 1–7. In parallel, spend 3–5 hours in the first 3 days completing the PayPal production switch. Flip it on at day 4 or 5. This means your first 10 users land in a waitlist experience but your next cohort lands in a payment-capable product. You do not delay outreach and you do not give up revenue from week 2.

The one thing to avoid: showing users a "Upgrade to Pro" button that navigates to `billing.html` and then does nothing or shows an error. That actively damages trust for a privacy-first product. The waitlist flow must communicate clearly: "Pro payments open in [date]. We'll email you." Exact copy matters. Brand voice says "period, not exclamation." Say: "Pro launches for payment on [date]. We'll send you one email when it's ready."

---

## 4. The First 10 Users — 14-Day Plan

### Who those 10 users are

You are bsjuilla / business060407@gmail.com. You do not have a named warm network in what you have shared, so this section works from the realistic categories of a solo technical founder's network and gives you the selection logic to find your 10.

**Category A — Ex-colleagues (target 4–5 people).** People who have seen you build things before and trust your judgment. Specifically: anyone who worked with you in a technical or finance-adjacent role in the last 3 years. They have credibility context. They will try the product because of you, not because of the product. Target: 4 names. If you have worked at any company with a finance, operations, or engineering team, you have these people.

**Category B — Friends or family with a financial concern (target 2–3 people).** Not friends who are "supportive." Friends who have mentioned a financial question in the last 6 months — buying a house, paying off a loan, worried about savings. These people have the pain the product solves. They are not doing you a favour; they are getting a tool that is relevant to their actual situation.

**Category C — Twitter/X mutual who engages with personal finance content (target 2–3 people).** Not a cold DM to a stranger. A reply to someone who has publicly discussed FIRE, debt payoff, forecasting, or "I wish I had a tool that did X." Your Twitter handle is bsjuilla. Search your own followers for people who have posted about personal finance in the last 30 days. Pick 2–3 with fewer than 2,000 followers — they are more likely to respond and try something new.

**Do not target:** Personal finance influencers, anyone with "advisor" or "CFP" in their bio, anyone you would describe as "probably not interested but worth a try."

### The outreach message (80 words, for a warm contact)

Use this template. Customise the first sentence with one specific detail per person. Send it via the channel where you already talk to them — DM, WhatsApp, iMessage, or email. Do not use LinkedIn InMail as the first touch.

---

Hi [Name],

I have been building a financial forecasting tool for the past several months and I am at the point where I need real people to use it. You came to mind because [one specific reason: you mentioned your mortgage, you work in finance, you have talked about saving more].

It takes 4 minutes to set up. No bank connection — you just type in your numbers. Would you be willing to try it this week and tell me one thing that confused you?

[link to profinancecast.com]

---

That message is 79 words. The crucial elements: one specific personal reason, a concrete time commitment (4 minutes), the privacy assurance (no bank connection), and a single ask ("one thing that confused you") rather than general feedback.

Send 10 of these in the first 3 days. Do not wait until the product feels "more ready." It is ready.

### Follow-up cadence

If no response in 48 hours, one follow-up: "Did you get a chance to try it? Even a 2-minute look would help." One follow-up only. Do not chase.

For anyone who signs up and completes onboarding: send a personal message within 24 hours. "What did the forecast show you? Was it useful or did it feel off?" This conversation is your PMF signal.

### When do you have PMF — quantitative definition

You are not looking for PMF in 14 days. That is not an honest claim. What you are looking for in 14 days is signal that PMF is achievable. The specific signal:

**PMF-approaching threshold (set this as your 14-day goal):**
- 10 signups from warm outreach
- At least 5 complete onboarding and reach the dashboard
- At least 3 of those 5 come back to the product a second time without being asked (return visit, confirmed via Plausible)
- At least 2 of the 5 say, unprompted, something like "I didn't know my net worth would be X" or "I found out I can be debt-free in Y months" — a specific number from the forecast that surprised them

If you hit those four conditions, you have evidence that the product delivers a moment of value. You do not have PMF. You have a signal worth doubling the cohort to confirm.

**PMF confirmed threshold (60-day view, not 14-day):**
- 40% of activated users return within 7 days without prompting
- At least 3 users respond to the question "how would you feel if ProFinanceCast disappeared tomorrow?" with "very disappointed" (Sean Ellis benchmark, informal version)
- At least 1 user upgrades to Pro or joins the Pro waitlist unprompted

These numbers are small because the cohort is small. You do not need 100 responses. You need a consistent qualitative signal that 2–3 users depend on this tool for something they could not get elsewhere.

---

## 5. Anti-Recommendations

### Strategies being rejected and why

**Paid advertising (Google Ads, Meta, Reddit).** Rejected for this 14-day window and for the next 60 days. Paid ads require a conversion-optimised landing page, a cost-per-acquisition baseline, and enough volume to run a statistically meaningful test. You have none of those. More importantly, paid ads for a privacy-first product carry an inherent contradiction: if a user arrives because you targeted them with a behavioural ad, they have already seen you participating in the data economy you claim to opt out of. The audience most likely to pay for privacy-first software is also the audience most likely to use an ad blocker. Paid ads before PMF is the most common founder mistake in consumer fintech because it feels like "doing GTM" without requiring the discomfort of direct sales.

**SEO and content compounding.** The blog exists and has well-written posts. That is good. But ranking for consumer-finance keywords in Europe or the US within 6 months for a new domain has a probability of 5–15% for any given target keyword, even with excellent content. The FIRE, personal finance, and debt-payoff keyword categories are dominated by NerdWallet, MoneySavingExpert, ThisIsMoneyUK, and similar publishers with 10,000+ inbound links. SEO is a year-three strategy. It should not be abandoned — the blog is a long-term asset — but no founder should count on SEO traffic to validate PMF in a 14-day window. "SEO will compound" is a true statement about a 24-month horizon, not a 14-day one.

**Product Hunt launch.** Rejected for this window. Product Hunt works best when you have 20–50 existing users who can leave honest reviews and answer questions in the comments on launch day. Launching with zero users means your launch day performance is entirely dependent on the PH community discovering you cold, which produces a spike of 50–200 visitors who convert at 1–3% and then disappear. You will get dashboard stats and zero learning. Do the warm outreach first, get 10–20 real users, then consider PH as an amplification layer at day 30.

### What the founder will want to argue and the pushback

The founder will say: "I want to launch publicly on Twitter/X right now. I have been building for months and I want to announce it." The pushback is not "do not tweet." The pushback is: tweet after you have 5 users who have given you consent to quote their reaction. A tweet that says "I built a thing, here it is" with zero social proof produces a few dozen clicks and a 1–2% signup rate from cold traffic. A tweet that says "3 people found out their net worth will cross $50,000 by 2027 using this — here is the tool I built" has a factual claim, a human outcome, and something worth sharing. You cannot write that tweet until you have the 5 users. The 14-day window is how you get the material for the tweet, not the tweet itself. Wait 14 days. Then tweet.

The founder will also say: "I want to run a Founders Lifetime deal on AppSumo or a deal site." Rejected. AppSumo audiences buy tools at deep discount, churn at high rates, and generate support volume that overwhelms solo founders. The Founders Lifetime at $149 is priced correctly for a warm audience who believes in the product. It is priced incorrectly for an AppSumo buyer who paid $29. Do not dilute the Founders tier. It is a trust signal — 500 seats, never reopens — and that signal only works if the price and audience stay intentional.

---

## Execution Checklist — Tonight and This Week

Ship all of these before sending the first outreach message. Total estimated time: 2.5–3 hours.

**Tonight (engineering, 90 minutes):**
1. Add Plausible custom events to each of the 6 onboarding step transitions. (`plausible('onboarding_step', {props: {step: 'N'}})` on each Next button click.)
2. Add the "What you'll see" static preview to `onboarding.html` Step 0 — one static image or SVG of the dashboard forecast chart with placeholder numbers.
3. Add scroll-into-view on the income-preview panel after first `calcLive` event fires on mobile.
4. Wire the waitlist flow on `billing.html` — when Pro upgrade is clicked, show a modal: "Pro payment launches [date]. We'll send you one email." Submit email to `api/newsletter/subscribe.js`.

**Tonight (outreach prep, 30 minutes):**
5. Write 10 personalised versions of the outreach message above. One per person. Specific first sentence for each.
6. Stage them in whatever app you use to communicate with each person. Do not send yet.

**Day 1 (first thing, 20 minutes):**
7. Send all 10 messages.

**Days 1–3 (PayPal production, 3–5 hours in parallel):**
8. Switch `PAYPAL_ENV` to `'live'`. Wire production credentials. Test with a real card on a $1 charge to a test SKU. Confirm Supabase subscription row writes. Flip on for billing.html by day 4.

**Day 7 (review):**
9. Pull Plausible: step-by-step drop-off rates. Where does the onboarding funnel break?
10. Count: signups, onboarding completers, return visits.
11. Message every user who completed onboarding: "What did the forecast show you?"
12. Adjust the outreach message based on what you learn. Send the next batch.

---

## The Metric You Watch Weekly

One number: **activated users who return within 7 days without prompting.**

Not signups. Not page views. Not PayPal revenue. The return rate of activated users is the leading indicator of retention, which is the leading indicator of NRR, which is the only thing that determines whether Pro tier becomes a real revenue line. At pre-PMF with a handful of users, every other metric is noise. Watch the return rate. If it is below 20%, the product is not yet sticky enough to charge for. If it is above 40%, you are building something people rely on. That is the dial.

---

*The metric you do not watch is the one that kills you. Pull this weekly.*
