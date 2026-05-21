# Warm-Outreach Script v1 — 80 Words

**Channel:** Personal DMs / emails to ex-colleagues, friends with a specific
financial concern, Twitter mutuals who discuss personal finance.
**Volume:** 40-80 contacts over 14 days.
**Source:** CRO Wave-13 plan §4 + CMO message-house anchor + GC word-list pass.
**Voice:** brand-aligned (no exclamation marks, one personal hook, concrete time
ask, narrow request).

---

## The script (80 words)

> Hey [name],
>
> Brief one — I've been building a privacy-first financial forecasting tool for
> the past few months. It runs in your browser; nothing leaves your device.
> Twelve-month projection in about four minutes. Country-aware for US / UK /
> IE / FR / DE.
>
> You mentioned [the specific thing — bonus timing, the house plan, the new
> job, the freelance lumpy income, etc.] a while back. Would you spend four
> minutes trying it and tell me what felt off?
>
> Link: profinancecast.com
> No signup until step three; no card; no bank login.
>
> [Founder first name]

---

## Personalisation rules

1. **One personal hook per message.** Reference the specific financial
   conversation you've had with this person. If you can't remember one, they
   are not on this list — drop them.
2. **No mass-send.** Each message is hand-edited for the hook. Send 5-8 per
   day max.
3. **No batch reply expectation.** Some will not reply. The signal is in the
   ones who do.

---

## The 3 contact categories (CRO §4)

### Category A — Ex-colleagues (highest signal density)
- People you have worked with who have shared a specific financial concern
- The hook is the specific concern, not the work history
- Expected response rate: 30-40%

### Category B — Friends with a specific money problem
- Friends who have asked you a money question in the last 6 months
- The hook is "you asked about X" — they remember
- Expected response rate: 50-70%
- Highest signal density; lowest scale

### Category C — Twitter mutuals discussing personal finance
- Mutuals (not followers) who post about personal-finance topics
- Slightly more formal hook; reference a specific tweet of theirs
- Expected response rate: 10-20%

---

## What goes in the running doc per outreach

For every message sent, log one row in `metrics/outreach.csv`:

```
date,category,name_hash,specific_hook,replied,signed_up,activated,feedback
2026-05-23,A,abc123,bonus-timing-Mar,y,y,y,"too many decimal places in EUR formatting"
```

`name_hash` = first letter of first name + first letter of last name +
3-digit random. No PII in the log; only the founder knows who maps to what.

---

## When to STOP doing warm outreach

- Day 14 with <3 replies → outreach list quality was bad; rebuild the list
- Day 14 with >20 replies but 0 activations → product onboarding is broken;
  fix it before more outreach
- Any signal that ex-colleagues feel pestered → stop on that specific person,
  audit message tone

---

## What this script does NOT do

- Does not promise an outcome ("you'll save €X")
- Does not call the recipient by a financial label ("you're a saver who needs
  X")
- Does not mention "advice" / "recommend" / "suitable" — all forbidden words
- Does not include a referral incentive (no €5 for a friend; that signal is
  noise pre-PMF)
- Does not include a Calendly link (no founder-call ask; that's a different
  motion if the first message converts)

---

## Compliance pass

Runs through `node scripts/check-marketing-claims.js docs/marketing/outreach-script-v1.md`:

- ✓ No forbidden words
- ✓ No outcome promise
- ✓ No named-competitor comparison
- ✓ Names privacy posture explicitly (no bank login, nothing leaves device)
- ✓ Compliant with GC Wave-13 marketing-claims §1 (3-question filter)

---

*Authored 2026-05-22. v1. Iterate based on day-7 reply data.*
