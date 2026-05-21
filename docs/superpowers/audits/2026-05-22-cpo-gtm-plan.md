# CPO GTM Plan — ProFinanceCast
**Author:** CPO advisor
**Date:** 2026-05-22
**Stage:** Pre-PMF, solo founder, ~0 users, post-12-wave engineering polish sprint
**Time to execute:** ~60 minutes of decisions tonight, then handoff to CMO/CRO lanes

---

## Bottom Line (read first)

The product is not the problem. The onboarding path to the first value moment is.
A user lands, signs up, and faces an empty dashboard with no data and no clear
signal of what to do next. The 12-month forecast — the core product promise — is
invisible until they enter their numbers. Nothing shows them what "numbers entered"
looks like before they commit to doing it.

The single change that moves the needle most is not a feature build. It is sequencing:
show the forecast output before asking for the input. Three minutes of contact with
real output creates the "this is why I'm doing this" pull that makes them enter real data.

Everything else in this plan flows from that one sequencing decision.

---

## 1. JTBD Map

### Job 1 — The Anxious Estimator

**Statement:** When I lie awake wondering whether I can actually afford to buy a flat
in three years (or quit my job, or have a child), I want to see a number I can argue
with — not a calculator that tells me what I already know — so I can stop making
decisions from dread and start making them from a specific target.

The emotional context: this person is not bad with money. They are bad at tolerating
financial ambiguity. They have a spreadsheet they stopped updating because it never
told them anything they did not already feel. They are not looking for budgeting.
They are looking for resolution.

**Feature that serves it best:** The Scenarios page — specifically the live-preview
recalculator that shows surplus, net worth, and score updating as they type. This is
the best moment in the product. A user can model "what if I save $400 more per month"
and see the 10-year delta instantly. No peer product does this without a bank login.

**Friction before the value moment:** Scenarios is Pro-gated. A first-time free user
never touches it. The free 12-month forecast on the dashboard is the closest analog,
but the dashboard requires entering income, expenses, and savings before any chart
renders. The user hits an empty state with no indication of what a completed forecast
looks like. The friction is epistemic: they do not know if the output will be useful
before they invest the effort to input their data.

**Current alternative:** A Google Sheets template or a Reddit post with someone else's
numbers. Falls short because it requires manual formula-wiring and does not persist,
project forward, or update when one number changes. The user gets an answer for
today, not a living forecast.

---

### Job 2 — The Standing-Order Amnesiac

**Statement:** When I look at my bank statement at the end of the month and feel
vaguely robbed by charges I cannot name, I want to surface every recurring obligation
in one pass — rent, subscriptions, gym, annual fees — so I can see the actual fixed
cost of my life and decide what to cut, because the shame of not knowing what I am
paying for is worse than the cost of anything I would cancel.

The emotional context: this person does not feel in control of their money. They are
not in financial crisis but they suspect they are spending on things they have forgotten
they opted into. They want a single moment of clarity, not an ongoing system.

**Feature that serves it best:** The Recurring Charges page with CSV import. The CMO
audit (score 2.0/5) called out the instruction-manual prose, and the empty-state audit
showed it scoring 9/25. But the underlying mechanic — drop a bank CSV, surface every
recurring charge automatically — is genuinely differentiated. No bank-login required.
No PII leaves the device. This is the privacy-first value proposition made concrete.

**Friction before the value moment:** The page presents as an instruction manual, not
an invitation. The current topbar copy ("Upload a bank CSV to detect all your recurring
charges automatically") is functional and lifeless. The empty state has no ghost rows
showing what the output looks like. A new user has to trust that something interesting
will happen before they see any evidence it will. The onboarding wizard does not
introduce this feature at all — it is discovered only by lateral navigation.

**Current alternative:** Manual bank-statement review or a budgeting app that requires
bank-login OAuth (Mint, Monarch, Emma). Falls short because those require credential
handoff, which this user specifically avoids, or because they require ongoing connection
which introduces security surface the user is uncomfortable with.

---

### Job 3 — The Debt-Sequence Optimizer

**Statement:** When I have multiple debts (a card, a student loan, a car payment) and
someone tells me to "pay the high-interest one first," I want to see the exact payoff
timeline and total interest cost for both strategies laid out as a forecast — not a
rule of thumb — so I can make the decision once, automate it, and stop relitigating
it every month, because the mental load of managing it manually is the reason I am not
doing it.

The emotional context: this person knows the theory. They do not need education. They
need a specific, personalized answer they can commit to. The problem is not knowledge,
it is closure.

**Feature that serves it best:** The Debt Optimizer page. This is the highest-scoring
no-photo page in the UX hierarchy audit (25/25) — dense, functional, data-complete.
The avalanche vs. snowball comparison with total-interest difference is the exact output
this job requires.

**Friction before the value moment:** Entry requires adding each debt manually — balance,
interest rate, minimum payment. For someone carrying three or four debts, this is a
5-8 minute data-entry session before any insight appears. The empty state ("The ledger
is clear" after the CMO fix) communicates nothing about what the payoff timeline will
look like. There is no ghost state showing the output format. The user cannot estimate
whether the effort of entering their debts is worth the quality of the insight they
will receive.

**Current alternative:** The NerdWallet or Bankrate debt payoff calculators. Falls
short because they are single-debt calculators, they require re-entering data each
visit, and they produce a single timeline rather than a side-by-side strategy comparison.

---

## 2. Activation Definition

### The Activation Moment

**Definition:** The user generates a 12-month forecast with at least three real data
inputs (any combination of: income, one expense category, savings rate, one debt, or
one goal) and views the resulting chart.

This is the activation event.

### Why this, and not the two alternatives I considered

**Alternative 1 rejected: Account creation.**
Account creation is not a value signal. It is an intent signal. Pre-PMF, the gap
between "signed up" and "got value" is where nearly all users will drop. Counting
signups as activation would make the rate look good and the product look fine, right
up until it is not. At this stage you cannot afford that kind of false confidence.

**Alternative 2 rejected: Day-2 return.**
Return on day two is a retention signal, not an activation signal. It tells you
something happened that was worth coming back for. But it does not tell you what.
A user who returned because they forgot to bookmark something looks identical to a
user who returned because the forecast changed their mind about something. You need
to instrument the cause, not just detect the effect. Day-2 return is the right metric
for the week-4 retention check, not the activation definition.

**Why the 3-input forecast is the right call:**
Three inputs is the threshold where the forecast starts reflecting a real person's
situation rather than a default skeleton. One input (income only) produces a forecast
that is almost certainly wrong in ways the user cannot see. Three inputs produces
something arguable. "Arguable" is the emotional register that creates engagement.
The user who argues with their forecast, adjusts a number, and watches the 12-month
chart change — that is the activation moment. It maps directly to the Scenarios
live-preview interaction that is the product's strongest feature.

It is also observable. The database knows when a user has saved at least three fields
and rendered the forecast chart. This is not a survey question. It is a behavioral signal.

### First-100-users target rate

Target: 20-30% of users who create an account will reach this activation moment within
their first session.

The honest range is lower than this. Pre-PMF with no guided onboarding and an empty
dashboard state, the real number without intervention is probably 5-10%. The 20-30%
target is achievable only with the single-highest-leverage change described in section 4.
If activation is below 20% after 20 users, the sequencing fix in section 4 is not
working and the team needs to watch session recordings before shipping anything else.

---

## 3. North Star Metric

### The North Star

**Weekly Forecasts Revisited:** The number of sessions per week in which a user who
previously reached the activation event returns and updates at least one data input,
triggering a forecast recalculation.

This measures whether the product is doing the job it was hired to do. A financial
forecast is only valuable if it stays current. A user who enters their numbers once
and never returns got a one-time calculator, not a forecasting tool. A user who comes
back when their income changes, when they add a debt, when they hit a goal — that user
is getting the job done.

### Why not MAU or WAU

Monthly or weekly active users is the wrong metric for a personal finance forecasting
product. Most users should be infrequent. A household budget is not a social feed. The
expected update cadence is once a month when salary clears, or once a quarter when
something changes. A user who opens the app every day is probably anxious, not healthy.
A user who opens it once a month, updates their numbers, and leaves having made a
decision — that is the ideal user behavior.

MAU/WAU rewards engagement without regard for whether the engagement produced a useful
outcome. It incentivizes the founder to add notification hooks and gamification to pull
users back. That is the opposite of the product's brand promise: a quiet European
forecasting house does not send push notifications to remind you it exists.

Weekly Forecasts Revisited is sparse by design. It rewards quality of engagement over
frequency.

### Targets (set tonight)

**Month 1 (June 2026):** 0. There are no users. The target for month 1 is to have the
metric instrumented and readable. Do not invent a user count to make the chart move.
The North Star at zero is honest signal that user acquisition has not started. If it
reads zero in month 2, the Monday check-in question surfaces why.

**Month 3 (August 2026):** 5 weekly forecasts revisited per week. This requires
approximately 20-30 activated users with at least one returning user per cohort.
It is achievable if the first channel test (CRO's 10-user plan) runs in June.

**Month 6 (November 2026):** 25 weekly forecasts revisited per week. This requires
either a larger user base with similar retention, or early cohorts showing high return
rates. At this number the retention curve is meaningful enough to read. Below 25,
cohort analysis is noise.

These numbers are pre-revenue, pre-marketing-spend, solo-founder realistic. They
are not venture targets. They are signal targets: by month 6, the product should
be able to answer the question "do users come back to update their forecast" with
a real answer from real behavior, not inference.

---

## 4. The Single Highest-Leverage Change

### The Change

**Page:** Onboarding wizard, step 1 (the first screen a new user sees after account
creation).

**Current state:** Step 1 asks for income. The user enters a number into a form field.
They see no output. They do not know what they are building toward or what the
completed forecast will look like.

**The change:** Before the income field appears, show a 15-second animated preview of
a completed 12-month forecast. Not a marketing screenshot. A live-rendered demo using
plausible sample numbers (income: $5,000/month, expenses: $3,200/month, savings rate:
15%) with the chart running. Show the forecast line. Show the cash buffer. Show the
12-month projection. Then say: "This is what your forecast will look like. Replace
these numbers with yours."

The form fields follow immediately. The user is now filling in a template they have
already seen the output of, not entering data into a void.

**The specific interaction change:** Replace the current step-1 blank form with a two-
panel layout: left panel shows the live demo forecast (using the existing dashboard
forecast code, pre-seeded with sample data); right panel shows the income input field
with the label "Start with your monthly take-home income." As the user types, the demo
forecast on the left updates in real time. They are watching their own forecast emerge
from the sample baseline. The first input is already an activation-proximate experience.

**Why this is friction-removal, not a feature build:** The forecast rendering code
already exists. The dashboard already supports pre-seeded sample data (the audit mode
SAMPLE_USER demonstrates this). The onboarding wizard HTML structure already has a
step-panel layout. This change is sequencing and wiring, not new functionality.

**Estimated effort:** 3-4 hours. One hour to wire the sample-data pre-seed into the
onboarding step-1 panel. One hour to wire the real-time update so the forecast
recalculates as the user types their income. One hour of CSS work to produce the
two-panel layout (the auth page two-column pattern is already in the design system).
One hour of testing the onboarding wizard E2E (the VPE's e2e-smoke flow B already
covers the wizard — extend it to validate the left panel renders).

**What it lets the message house say:** "In 3 minutes you will see your own 12-month
financial forecast. No bank login. No subscription. Start with your income." This is
a claim the current onboarding cannot support because the user sees nothing for the
first 3 minutes. After this change, the claim is true on arrival.

**The CMO/CRO implication:** The CMO's ICP messaging and the CRO's channel test both
need a landing-to-activation promise they can state truthfully. "See your forecast in
3 minutes" is that promise. It is specific, time-bounded, and the product can now
deliver it.

---

## 5. What to Stop Building

Stop building anything that is not directly observable by the 30th activated user.

The CEO and COO have already named the polish trap. Here is the CPO's version with
specific examples drawn from the existing backlog and wave plans.

**Stop building:**

The 33-slot photography system (Midjourney superprompts, Tier A through D). The images
are beautiful and the brief is correct. They are also invisible to the first 100 users
because the first 100 users are not on the landing page for more than 90 seconds before
signing up. Generating and integrating 33 editorial photos before you have PMF signal is
the polish trap dressed as brand work. Ship the 2 that directly affect the activation
moment (onboarding-welcome-vignette and onboarding-complete-keepsake) and freeze the
rest until month 3.

The animation library (pfc-anim.css, Wave 2, all 10 animations). Animation serves
engaged users. You have no engaged users yet. Defer the entire Wave 2 animation
deployment until the North Star reads 10 weekly forecasts revisited per week. At that
point you have users worth delighting.

The Wave 3 SSG migration. This is a correct architectural decision for a product with
50+ HTML files and growing traffic. It is the wrong priority for a product with 0 users.
The current architecture is not the bottleneck. User acquisition is the bottleneck.

The CSP tightening (converting 365 onclick= attributes to addEventListener, removing
script-src-attr unsafe-inline). This is real security work and it was correctly deferred
to Wave 2. Keep it deferred. The security audit showed the critical issues are already
fixed (C1-C5 in the Sprint 1-3 audit). The remaining CSP hardening is not a pre-PMF
priority.

The Lighthouse CI pipeline (VPE Item B). The VPE correctly deferred this. Reinforce
that deferral: performance regressions have zero blast radius when there are zero users.
Build the Lighthouse baseline after the first channel test returns data on real user
paths.

The Report Card keepsake photo and the portfolio Pro-gate reskin (although both take
under 30 minutes). The reason to stop is not effort — it is attention. Every hour spent
on the product before the first 10 users is an hour not spent finding the first 10 users.
The product is shippable today. The onboarding sequence fix is the only product change
that moves the activation rate. Everything else is optimization of a funnel with no
traffic.

**The framing to commit to, starting tonight:**

No new product work ships until it is answerable to the question: "which of the 3 JTBDs
does this serve, and at which step in the activation path?" If the answer is "it makes
the product better after activation," it goes to the backlog and stays there until the
North Star reads 10. If the answer is "it removes friction between account creation and
the first forecast," it may ship. Nothing else may.

The product is not the constraint. The founder's time is the constraint, and the
constraint is currently being spent on the wrong side of the funnel.

---

## Handoff Notes for Adjacent Advisors

**For the CMO:** The ICP this product serves best is Job 1 (the Anxious Estimator)
combined with a privacy stance. The differentiator is not the forecast — it is "no bank
login, no PII, runs in your browser." The message house should lead with what the user
does not have to give up to get the forecast, not with the forecast itself. The specific
claim that can be made truthfully today: "See your 12-month forecast in 3 minutes. No
bank connection required. Nothing leaves your device."

**For the CRO:** The 10-user plan needs to put people in front of the onboarding wizard,
not the landing page. Conversion at the landing page is a later problem. The activation
rate test is: do users who enter the onboarding wizard reach the 3-input forecast within
their first session? Run the first test with people who are already motivated (personal
finance communities, the founder's network) before testing cold traffic. You need to
know if the activation moment works before you test whether the channel works.

**For the CEO:** The decision the founder needs to make tonight is not what to build.
It is to stop building until 30 users have been through the activation moment and the
North Star can be read. The product is ready. The sequencing change (section 4) is a
3-4 hour ship. After that, the founder should not open a code editor for product
improvements until the CMO and CRO plans have returned their first data.

---

*Cut the roadmap by half. The half you cut is where focus lives.*
