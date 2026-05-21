# Sentry SLOs — Paste-Into-UI Runbook

**Author:** VPE Wave-12 plan · **Owner:** Founder · **Audience:** future-self setting up Sentry alerts for the first time

This runbook walks the founder through the 5 alert rules + 1 release-health
threshold the VPE recommends configuring NOW (pre-launch) so the moment a
real user shows up, alerts fire on the same thresholds. Pre-PMF "every new
prod issue is interesting" — rules deliberately tight, with tuning
checkpoints at week 1 and week 4 post-launch.

---

## Pre-flight (5 min)

1. **Confirm both Sentry projects exist.** You should have one project for
   client-side JS (`profinancecast-web`) and one for Vercel Edge
   functions (`profinancecast-edge`). If only one exists, create the
   second — Edge errors are categorically different from client errors
   and should not share issue grouping.
2. **Verify Sentry environment is set correctly.** Visit prod, open
   DevTools, run:
   ```js
   Sentry.getClient().getOptions().environment
   ```
   Should print `"production"`. If it prints `"preview"` or `undefined`,
   `js/pfc-sentry.js` has a bug.
3. **Confirm `autoSessionTracking: true` took effect** (added Wave-12):
   ```js
   Sentry.getClient().getOptions().autoSessionTracking
   ```
   Should return `true`. Required for Alert rule 5.

---

## Alert rule 1 — Edge function success rate

**Project:** `profinancecast-edge`
**Path:** *Alerts → Create Alert Rule → Metric Alert*

| Field | Value |
|---|---|
| Metric | `count_if(event.type, equals, error)` divided by `count()` — Sentry calls this "Failure Rate" |
| Filter | `environment:production` |
| Time window | 1 hour |
| Trigger (Warning) | failure rate > **0.5%** |
| Trigger (Critical) | failure rate > **2.0%** |
| Resolve | when value ≤ threshold for 2 consecutive windows |
| Action | Email founder + (later) post to `#alerts` Slack |

**Why these numbers:** Edge functions (`/api/audit-login`, future Supabase-proxying endpoints) are the only server surface. 99.5% allows 1 in 200 to fail (Vercel cold-start, transient Supabase blip) without paging. Below that = real bug.

---

## Alert rule 2 — Client-side unhandled error rate

**Project:** `profinancecast-web`
**Path:** *Alerts → Create Alert Rule → Issue Alert*

| Field | Value |
|---|---|
| Conditions | The issue is seen more than **20 times in 1 hour** AND environment equals `production` |
| Action | Email founder |

**Why 20 events / hour:** at ~0 users, this approximates ">2% of sessions hit an exception" without needing the session-tracking SDK upgrade to fire. Once you have >500 sessions/day, tighten to a session-percentage trigger.

---

## Alert rule 3 — Event volume spike

**Project:** `profinancecast-web`
**Path:** *Alerts → Create Alert Rule → Metric Alert*

| Field | Value |
|---|---|
| Metric | `count()` |
| Filter | `environment:production` |
| Time window | 5 minutes |
| Trigger | count > **10×** rolling 24h average → Critical |
| Action | Email founder |

**Why a 5-min spike rule:** catches infinite-retry loops, runaway useEffect bugs, scraping incidents faster than rule 2's hourly window.

---

## Alert rule 4 — New issue first-seen on production

**Both projects.**
**Path:** *Alerts → Create Alert Rule → Issue Alert*

| Field | Value |
|---|---|
| Condition | A new issue is created |
| Filter | `environment:production` AND `level:[error, fatal]` |
| Action | Email founder |

**Pre-PMF:** every brand-new production issue is worth a glance. **Rescind this rule** once daily new-issue volume exceeds ~5/day (likely post-launch when scrapers start probing the site). Until then, the diagnostic value of seeing each new error class is high.

---

## Alert rule 5 — Release health (crash-free sessions)

**Project:** `profinancecast-web`
**Path:** *Releases → [latest release] → Set Health Threshold*

| Field | Value |
|---|---|
| Health metric | Crash-Free Sessions |
| Threshold | ≥ **99%** |
| Window | 24 hours post-deploy |
| Action | Email founder if release falls below threshold |

**Requires:** `autoSessionTracking: true` in `js/pfc-sentry.js` (already enabled in Wave-12 commit).

---

## What we are explicitly NOT alerting on

- **p95 latency.** Traces are off (`tracesSampleRate: 0`) — no signal.
- **Apdex.** Same reason.
- **Specific endpoint error rates.** Wait until you have traffic before slicing.
- **Memory / CPU.** Vercel doesn't expose these; Sentry doesn't have the data.

---

## Notification routing

Until Slack is wired, all alerts → `business060407@gmail.com`. Set up a Gmail filter:

- **From:** `noreply@sentry.io`
- **Label:** `eng/sentry`
- **Snooze:** active hours only (do NOT mute — pre-launch you want immediate signal)
- **Inbox:** keep `level:Critical` alerts in inbox; auto-archive `level:Warning`

Do NOT use the default Sentry digest. Pre-PMF you want every alert as it fires, not batched.

---

## Tuning schedule

| Week | Action |
|---|---|
| **Week 1 post-launch** | Review every alert that fired. For each false positive: tune the rule OR add a `Sentry.ignoreErrors` entry in `pfc-sentry.js`. Prefer the latter for known-noisy third parties. |
| **Week 4 post-launch** | Review for missed positives. If a user reported a bug that did NOT page you, work backwards: was the error captured? grouped? filtered? Fix the rule. |
| **Month 3 post-launch** | Promote rule 2 from event-count to session-percent. Promote rule 4 from "any new issue" to "any new critical/fatal issue." |

---

## Verification (do these after pasting the rules in)

1. **Trigger rule 4 manually:**
   ```js
   // In DevTools on production
   Sentry.captureException(new Error('SLO test from founder ' + new Date().toISOString()))
   ```
   Confirm the issue appears in `profinancecast-web` within 30s and rule 4 sends an email.

2. **Trigger an Edge test:**
   ```
   curl 'https://www.profinancecast.com/api/audit-login?t=intentionally-bad'
   ```
   Confirm the 403 surfaces in `profinancecast-edge` within 30s.

3. **Confirm session tracking is live:**
   ```js
   // In DevTools on production
   Sentry.getClient().getOptions().autoSessionTracking
   ```
   Returns `true`. Visit a release in Sentry UI, confirm session count > 0 within ~5 min of refreshing the page.

4. **Mark the verification events as Resolved** in Sentry UI so they don't skew the rule-2 thresholds going forward.

---

## What you (founder) must do that the runbook cannot

1. **Confirm both Sentry projects exist.** If only one exists, create `profinancecast-edge`. Copy its DSN. Wire it into the Edge function — that's out of scope for this 60-min Wave-12 slot. Flag as Wave-13.
2. **Paste each of the 5 alert rules into the Sentry UI** following the tables above. Sentry's API supports rule creation via Terraform but at ~0 users that's overkill; ~15 min of clicking is the right tool.
3. **Confirm the alert email destination** in *Settings → Notifications* is `business060407@gmail.com`.
4. **Run the 4 verification steps** above and confirm emails arrive.
5. **Set the Gmail filter** for `from:noreply@sentry.io` → label `eng/sentry`.

---

## Risk box

**If Sentry alerts fire false-positive (you wake up to noise):**
- **Impact:** alert fatigue → you start ignoring real ones (#1 cause of observability dying).
- **Recovery:** the Tuning Schedule above has week-1 and week-4 review prompts. Tune the noisy rule OR add a specific `ignoreErrors` entry — never the lazy fix of "just disable the alert."
- **Worst case if you ignore tuning:** in 6 months Sentry costs $26/mo + you have a Pavlovian flinch at the email. Recoverable by spending one Saturday afternoon archiving rules.

**If Sentry alerts fail to fire on a real bug:**
- **Impact:** bug ships, user complains via human channel, observability gap visible in retro.
- **Recovery:** post-mortem question is "was the error captured at all?" If yes (in Sentry but no alert), rule is too loose — tighten. If no (not in Sentry at all), SDK is misconfigured — check `beforeSend` isn't returning `null`, check `denyUrls` regex, check Edge function project has a DSN wired.

**If `autoSessionTracking: true` causes a measurable bundle/perf regression:**
- **Impact:** ~5KB extra bundle for session-pings. Negligible on a static-site JS payload.
- **Recovery:** set to `false`, lose rule 5 (release health). Acceptable trade-off if it ever shows on the perf budget — which it won't.

---

*Runbook authored 2026-05-22. Next review: 1 week post-launch.*
