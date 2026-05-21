# ProFinanceCast — CMO Go-To-Market Plan
**Date:** 2026-05-22 · **Author:** CMO Advisor · **Status:** Binding
**Scope:** Pre-PMF user acquisition — first 14 days of outbound effort
**Prerequisite reading:** `docs/STYLE-GUIDE.md`, `docs/superpowers/audits/2026-05-21-vintage-ledger-brief.md`

---

## Framing

The product is done enough to test with humans. The engineering polish waves are
behind us. The question is no longer "is it ready?" — it is "who is it for, what
do we say, and where do we say it first?"

This document gives three concrete ICP hypotheses to test, a message house to
govern every word we publish, and one binding channel commitment for the next
14 days. The founder executes this; it is not a strategy deck.

---

## ASK 1 — ICP HYPOTHESES (three candidates, ranked)

Ranking logic: proximity to a hire-trigger event, willingness to pay for a
privacy-first product, and channel concentration that a solo founder can reach
without an ad budget.

---

### ICP-1 (Primary Test) — The European Expat With a Cross-Border Money Problem

**One-sentence ICP:**
A 28-38 year-old professional living outside their home country (Portuguese in
Germany, French in Ireland, Spanish in the Netherlands) who earns in one
currency, holds accounts in two countries, and cannot find a single forecasting
tool that handles their actual situation — because every tool assumes one bank,
one currency, one tax regime, and demands an open-banking login they do not
trust with a foreign institution.

**Hire-trigger event:**
They just received a salary increase, are considering buying property in their
adopted country, or are planning repatriation within 3-5 years — any of these
forces them to actually model "what does my financial future look like if I
stay?" Spreadsheets break under multi-currency complexity. Mint and Monarch
require US bank links. YNAB has no forecasting. They search in frustration.

**The single channel:**
r/Financas (Portuguese), r/PersonalFinanceIreland, r/UKPersonalFinance, and
r/eupersonalfinance — specifically the weekly "rate my budget" and "help me
understand my finances" threads. These attract exactly the person who is
trying to model a future, not just track a past. r/eupersonalfinance is the
apex: 150k+ members, English-language, explicitly multi-country, under-served
by tools.

**The single message (5-12 words):**
"Your finances work across borders. Your tools should too."

**Why this ICP loses if we pick wrong:**
The disqualifying signal is session depth below 3 minutes on the dashboard. If
this ICP signs up but does not enter any data — not even a scenario — they
came for the landing page promise but the product did not match their mental
model. That means either the multi-currency UX is insufficient (product problem)
or the positioning mis-described the feature set (marketing problem). If
sign-up-to-data-entry conversion is below 30% by day 14, ICP-1 is wrong at the
product level, not the acquisition level.

---

### ICP-2 (Secondary Test) — The Anxious UK/IE Late-Starter

**One-sentence ICP:**
A 32-45 year-old in the UK or Ireland who started contributing to a pension
late, earns £45k-£90k, has no clear picture of whether they can retire before
65, and is paralysed between YOLO spending and under-informed saving — because
every calculator they find gives them a number with no narrative attached, and
every IFA they speak to charges £250/hr for a conversation that should take
20 minutes.

**Hire-trigger event:**
A birthday ending in 0 or 5, a colleague announcing early retirement, or a
pension statement arriving in the post with a number they do not understand.
The emotional state is "I should have started earlier — how bad is it really?"
The FIRE-date calculator is the exact tool for this moment.

**The single channel:**
r/FIREUK — 120k members, explicitly UK-focused, obsessed with forecasting their
own retirement date. The community already uses Excel models; ProFinanceCast is
a polished version of what they are building by hand. Threads titled "Am I on
track?" are posted daily and answered with spreadsheet screenshots. We slot
directly into that conversation.

**The single message (5-12 words):**
"See your FIRE date. No spreadsheet. No bank login."

**Why this ICP loses if we pick wrong:**
The disqualifying signal is that they sign up, run the FIRE-date tool once, and
never return. The FIRE-date calculator is a free public tool — if this ICP
treats it as a single-use calculator rather than the door into a forecasting
relationship, we have an acquisition problem: the JTBD was satisfied by the
free tool and the dashboard adds no incremental value. Measure 7-day return
rate. If below 20%, ICP-2 is a traffic-generator for free tools, not a user
base for the product.

---

### ICP-3 (Reserve) — The Self-Employed Professional Managing Irregular Income

**One-sentence ICP:**
A freelancer or sole-trader in the US, UK, or IE — designer, developer,
consultant, therapist — earning £40k-£120k with lumpy monthly cash flow, who
cannot use standard budgeting apps because their income does not arrive in
predictable monthly increments, and who lives in fear of a low month
destroying a high-month plan.

**Hire-trigger event:**
A bad month that follows a good month, a new contract that changes their
income structure, or tax season revealing they saved nothing despite high
gross revenue. The cash-forecast (monthly KPIs) feature — which shows
irregular patterns — is precisely the tool for this anxiety.

**The single channel:**
The Indie Hackers "financial independence" threads and the "Show IH" board
— specifically posts from solo founders and freelancers discussing cash-flow
anxiety. This community has the right income profile, is comfortable with
browser-only products, and explicitly trusts privacy-first tools because they
are themselves builders.

**The single message (5-12 words):**
"Forecast the lean months before they happen."

**Why this ICP loses if we pick wrong:**
This ICP requires that the CSV import for recurring charges works perfectly on
day one — irregular earners have complex, idiosyncratic transaction patterns.
If the import fails or misclassifies charges, the trust is gone immediately.
The disqualifying signal is a support complaint about CSV import in the first
72 hours. ICP-3 has the highest churn risk if the data-ingestion layer has
any friction.

---

## ASK 2 — MESSAGE HOUSE

### Hero Promise (8-12 words)

**"Your financial future, forecast. Private by design. No bank login required."**

This is the auth page's existing best line extended by the brand's strongest
structural differentiator. It does three things in sequence: states the JTBD
(forecast your future), states the trust mechanism (private by design), and
removes the single biggest objection (no bank login). Every ICP above responds
to all three.

---

### Three Supporting Pillars

**Pillar 1 — The Ledger Runs Locally**

Claim: Your data never leaves your browser. ProFinanceCast performs all
calculations client-side — no server sees your numbers.

Proof: The product architecture is genuinely in-browser. This is verifiable:
open DevTools, run a forecast, watch zero financial data requests to any server.
The AES-256 letterpress card (`key-on-velvet.webp`) is the visual fact of this.

Photo-register anchor: `key-on-velvet.webp` — the brass skeleton key on emerald
velvet with the AES-256 letterpress card. The key is not a metaphor; it is
evidence. The caption reads: "The calculation stays on your desk."

**Pillar 2 — The Forecast Is a Relationship, Not a Report**

Claim: ProFinanceCast shows you 12 months forward, not last month's spending.
The ledger projects forward — this page records what has already happened.

Proof: The dashboard defaults to a 12-month forward view. The scenarios tool
lets you model multiple futures side-by-side. No other free-tier tool in this
category does forward forecasting without a paid tier or a bank-linked data feed.

Photo-register anchor: `compass-on-paper.webp` — the brass drafting compass mid-draw
on the grid sheet with "FUTURE VALUE" letterpress. The compass is navigating
forward. The caption reads: "Each line drawn is a possible future."

**Pillar 3 — Fifty Countries, One Register**

Claim: ProFinanceCast ships country-specific tools for US, UK, IE, FR, DE, SG,
CA, AU — take-home pay, mortgage affordability, FIRE date, compound interest,
debt strategy. The numbers use your tax system.

Proof: 50+ tool variants already live. The SAMPLE_USER is Portuguese with EUR.
The site works in the same editorial register whether you are in Dublin or
Singapore — no "US only" caveat, no purchasing power disclaimer.

Photo-register anchor: `coastal-window.webp` — the open notebook on the marble
sill overlooking the Lisbon-Alfama dawn. The blurred Mediterranean rooftops are
the proof of geography without flag-waving. The caption reads: "The same
calculation, wherever the sun rises."

---

### Anti-Positioning

**vs. Mint (RIP, but the category ghost):**
Mint tracked what happened. ProFinanceCast forecasts what will happen. Mint
required a bank login and then showed you a pie chart of regret. We require
neither the login nor the apology.

**vs. Monarch:**
Monarch is a beautiful US-centric subscription with bank sync at its core. We
are a privacy-first European-register tool with no sync at all — the model is
different, not just the price. Monarch's strength (live bank data) is our
deliberate absence.

**vs. YNAB:**
YNAB teaches you to budget the past. ProFinanceCast models the future. YNAB's
famous methodology requires you to trust the process; ours requires you to trust
the math. Different jobs. We are not competing for the same hire-trigger.

**vs. Lunchmoney:**
Lunchmoney is a developer-audience transaction tracker with CSV import and
multi-currency support — the closest competitor in feature overlap. The
differentiator is register: Lunchmoney looks like a beautiful spreadsheet.
ProFinanceCast looks like a forecasting house. The brand is the moat. If the
brand ever softens, Lunchmoney wins on feature depth.

---

### Turning "Not Financial Advice" Into Differentiation

Every fintech product displays this disclaimer. Most treat it as legal boilerplate
— small grey text in the footer, font-size 10px, ignored by users and search
bots alike.

ProFinanceCast does the opposite: it leads with the disclaimer as a positioning
statement.

**The line:** "This is a forecast, not advice. The difference matters."

Mechanism: Add this as a JetBrains Mono small-caps eyebrow on the dashboard
hero and on every public tool page — `FORECAST · NOT ADVICE` — styled in gold
at 11px. It reads as editorial confidence, not legal anxiety. The brand voice
is "quiet European forecasting house." A quiet European forecasting house
distinguishes itself from an IFA precisely by saying: we give you the numbers;
the judgment is yours.

This also differentiates from Sage AI: Sage is clearly labeled as a reasoning
tool, not a licensed advisor. The eyebrow treatment makes the distinction
typographically visible.

Competitors all hide this disclaimer. We stamp it on the front page like a
letterpress colophon. That is the brand move.

---

### Rejected Message (and why we rejected it)

**Rejected:** "Take control of your finances."

**Why:** Every personal finance product in existence says this. It is the
category's default hand-wave. It positions us in the category rather than
defining a new one. It also fails the JTBD test — no one wakes up thinking
"I want to take control." They wake up thinking "I need to know if I can afford
to quit my job in three years." The rejected message names the emotion we want
to sell without naming the instrument that sells it. A forecasting house does
not sell control; it sells clarity about the future. Those are different products.

---

## ASK 3 — ONE CHANNEL TEST (next 14 days)

**The channel:** r/eupersonalfinance (Reddit)

**Why this channel over all others:** It is the highest-concentration venue for
ICP-1 (European expat with cross-border money problems), it is English-language
so the founder can post without translation overhead, it is under-served by
product-led posts (the community gets spreadsheet screenshots, not tool links),
and it has a "tools and resources" culture — members actively share calculators
and apps when they genuinely help.

---

### The Acquisition Motion

**Week 1 (Days 1-7) — Value-first, no pitch:**

Post one genuinely useful comment per day in active threads. Target threads
with titles like "Am I saving enough?", "How do I model X?", "What tool do
you use for Y?". Answer the question with real math. At the bottom of each
comment, one line: "I built a free forecasting tool for exactly this — no bank
login, runs in-browser. Happy to share if useful."

Do not link in the first comment. Let the question get answered. If someone
asks "what tool?", reply with the link. This is the r/eupersonalfinance norm
— product links in unsolicited comments are removed by moderators.

**Day 5 — Submit one "Show Reddit" post:**

Title format: "I built a private financial forecasting tool for EU residents
— no bank login, no server, calculations run in your browser. Here is what
it can do."

Body: Three paragraphs. Paragraph 1 — the problem (cross-border finances are
genuinely hard to model; every tool assumes one country). Paragraph 2 — what
ProFinanceCast does differently (FIRE-date calculator, scenarios, 12-month
forecast, EUR/GBP/CHF support, in-browser). Paragraph 3 — what you want from
the community (honest feedback: what is missing for your situation?).

No vintage-ledger photos in the Reddit post. The editorial register is for the
product itself. The Reddit post is written in plain, direct prose — the same
voice the brand uses internally, without the Fraunces italic captions.

**Week 2 (Days 8-14) — Follow the signal:**

If the "Show Reddit" post gets >20 upvotes or >10 comments asking about
specific features, post a follow-up on day 12: "Update: added [feature X]
based on your feedback." This proves active development and closes the loop.

If the post gets fewer than 10 upvotes and no signups, do not post again.
Move to ICP-2 (r/FIREUK) immediately.

---

### Cost

**Money:** €0. Reddit posting is free. No paid promotion.

**Time:** 30 minutes per day for daily comments (Days 1-7). 90 minutes to
write and refine the "Show Reddit" post (Day 5). 30 minutes for follow-up
monitoring per day (Days 6-14). Total: approximately 7-8 hours over 14 days.

**Tonight (in your 90-minute execution window):**
- 30 minutes: Write the "Show Reddit" post in a Google Doc. Do not publish yet.
  Let it sit overnight. Read it again tomorrow with fresh eyes.
- 30 minutes: Find 3 active threads in r/eupersonalfinance right now and write
  one genuine, tool-free comment in each. These are Day 1 comments.
- 30 minutes: Confirm the four things the Reddit audience will see when they
  land: (1) the hero promise loads in under 2 seconds, (2) the FIRE-date
  calculator is findable from the homepage in one click, (3) the "no bank
  login" message is visible above the fold, (4) the EUR currency option works
  on first load. If any of these four fail, fix them before the Day 5 post.

---

### Success Metric

**Primary:** 25 new signups (account creations) by Day 14.

**Secondary:** 5 users who enter at least one scenario (not just the dashboard
— an actual scenario comparison). Scenarios signal that the user came for
forecasting, not just a calculator, which means they match the ICP.

**Why 25:** Pre-PMF, we need qualitative signal, not scale. 25 signups from a
targeted community gives us 25 real conversations. We email each one (the
founder's email is in the account record) with one question: "What did you
come here to figure out?" The answers define the next ICP refinement.

---

### Kill Criterion

If, by Day 10, fewer than 8 signups have been generated AND the "Show Reddit"
post has fewer than 15 upvotes, stop. Do not wait for Day 14.

Move immediately to ICP-2 motion: write one post for r/FIREUK targeting the
FIRE-date calculator specifically. The message shifts from "cross-border
forecasting" to "see your FIRE date without a spreadsheet." The product does
not change; the ICP frame does.

---

### The Output Artifact (ship tonight)

**The first thing you publish is not the Reddit post.**

The first thing you publish is a pinned update to the ProFinanceCast about
page or journal adding one paragraph:

> "ProFinanceCast is built for people whose financial lives do not fit inside
> a single country or a single bank's app. The ledger runs in your browser.
> Nothing leaves your desk."

This is the landing strip for every Reddit visitor who checks "what is this
thing" before signing up. The Reddit post sends them here. If the about page
does not say this, the Reddit post converts at 20% of its potential.

Write that paragraph first. Then write the Reddit post. Then post the Day 1
comments.

---

## What I Am Not Recommending

**Paid social (Meta, Google):** CAC on personal finance keywords is €8-25 per
click in EU markets. At zero users and an unvalidated ICP, paying for traffic
before we know what converts is burning money to confirm ignorance faster.

**Content SEO:** Correct long-term play. Wrong first-14-days play. SEO takes
90 days minimum to index and rank. The founder needs signal this week, not in
August.

**Twitter/X thought leadership:** The audience for a quiet European forecasting
house does not live on X. The brand voice requires restraint. The X algorithm
rewards provocation. Structural mismatch.

**ProductHunt launch:** PH launches are a one-day event that rewards
preparation (hunter relationships, voting networks, pre-launch email lists)
we do not have. A cold PH launch with zero users and no hunter network
typically produces 50-200 visitors and 2-10 signups — the same result as the
Reddit test, with more effort and no qualitative feedback.

**Influencer outreach / personal finance YouTubers:** Right audience, wrong
stage. Any creator worth their audience will ask "how many users do you have?"
before reviewing a product. Come back when ICP-1 or ICP-2 has produced 100
signups and 3 testimonials.

**Building more free tools to drive SEO:** We already have 50+ country-specific
tool variants. More tools before we understand which tool converts to sign-up is
building inventory for a store with no foot traffic.

---

## Decision Point

The founder's call is whether to run ICP-1 (European expat, r/eupersonalfinance)
or ICP-2 (UK late-starter, r/FIREUK) first.

My recommendation is ICP-1 because the product's existing EUR support and the
Lisbon-register photography are already-built assets that make the ICP-1
landing page honest. ICP-2 requires no product change but the brand's visual
register (Mediterranean dawn) is currently optimised for the European expat
story, not the UK FIRE story. Run ICP-1 for 14 days. If the kill criterion
fires, ICP-2 is ready.

Pick the ICP. Everything cascades from there.

---

**Bottom Line:** Ship the about-page paragraph tonight, write the Reddit post
in draft, post three genuine comments in r/eupersonalfinance. Measure signups
and scenario-completion at Day 10. If the number is below 8, pivot to
r/FIREUK with the FIRE-date message. The brand is strong enough to support
either story — choose the ICP that the existing product already serves best,
which is the person who lives across borders and does not trust bank-linked apps.

**The Story:** A private forecasting house for people whose finances cross
borders — no bank login, runs in your browser, sees 12 months forward.

**The Math:** 25 signups at €0 spend, 7-8 hours of founder time over 14 days.
5 scenario-completers = first PMF signal.

**How to Act:**
1. Tonight — add the one-paragraph "cross-border" statement to the about page.
2. Tonight — write three on-topic Reddit comments in r/eupersonalfinance
   (value-first, no link unless asked).
3. Day 5 — publish the "Show Reddit" post. Link in bio, not in post body.

**Your Decision:** ICP-1 or ICP-2 first. The plan above executes ICP-1.
