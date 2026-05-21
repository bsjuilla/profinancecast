# COO Cadence Plan — Making the Audit Actually Happen
**Owner:** Founder · **Written:** 2026-05-22 · **Horizon:** Q3 2027 (4 quarters)

---

## 1. Commitment Device

**Primary: GitHub Issue auto-created 14 days before each audit date.**

A cron job in `.github/workflows/audit-reminder.yml` opens a GitHub Issue titled
`[AUDIT DUE] Quarterly Audit — YYYY-MM-DD` exactly 14 days before each scheduled date.
The issue body is pre-filled with the exact checklist from `quarterly-audit-cadence.md`.
The issue cannot be closed without a linked commit or a comment that begins `SKIP:` —
forcing an explicit, logged decision either way.

Why this beats a calendar reminder: it lives in the same tool you ship code in. It shows
up in your repo's open issue count. It stares at you every time you open GitHub. It costs
you a deliberate action to dismiss it. A calendar reminder costs you one thumb-tap.

**Backup: Pre-written self-email via Gmail scheduled send.**

Draft one email per audit date now. Subject: `[ProFinanceCast] Quarterly Audit Due — Aug 21`.
Body: the MVA checklist below, plus a single line: "If you skip this, log it in the skips:
section of quarterly-audit-cadence.md. Two skips in a row is a CEO red flag you wrote
yourself." Schedule each email to arrive on the -14 day mark (Aug 7, Nov 7, Feb 7, May 7).
No Zapier required — Gmail's native scheduled send works.

---

### Artifact: `.github/workflows/audit-reminder.yml`

```yaml
name: Quarterly Audit Reminder

on:
  schedule:
    # Runs at 08:00 UTC on the -14 day before each audit date
    # Aug 21 audit  → fires Aug 7
    - cron: '0 8 7 8 *'
    # Nov 21 audit  → fires Nov 7
    - cron: '0 8 7 11 *'
    # Feb 21 audit  → fires Feb 7
    - cron: '0 8 7 2 *'
    # May 21 audit  → fires May 7
    - cron: '0 8 7 5 *'
  workflow_dispatch:

jobs:
  open-audit-issue:
    runs-on: ubuntu-latest
    permissions:
      issues: write
    steps:
      - name: Determine audit date
        id: date
        run: |
          MONTH=$(date +%-m)
          case $MONTH in
            8)  echo "audit_date=2026-08-21" >> $GITHUB_OUTPUT ;;
            11) echo "audit_date=2026-11-21" >> $GITHUB_OUTPUT ;;
            2)  echo "audit_date=2027-02-21" >> $GITHUB_OUTPUT ;;
            5)  echo "audit_date=2027-05-21" >> $GITHUB_OUTPUT ;;
          esac

      - name: Open audit issue
        uses: actions/github-script@v7
        with:
          script: |
            const auditDate = '${{ steps.date.outputs.audit_date }}';
            const title = `[AUDIT DUE] Quarterly Audit — ${auditDate}`;
            const body = `## Quarterly Audit Checklist\n\n` +
              `**Due:** ${auditDate}  |  **Owner:** Founder  |  **Est. time:** 30-90 min\n\n` +
              `### Minimum Viable Audit (30 min)\n` +
              `- [ ] Voice compliance: grep new pages for eyebrow mandate + no-emoji rule\n` +
              `- [ ] CSP integrity: \`curl -sI https://www.profinancecast.com | grep -i content-security-policy\`\n` +
              `- [ ] CI history: Actions tab → all runs last 90 days green or diagnosed\n\n` +
              `### Full Audit (90 min — add if time allows)\n` +
              `- [ ] Photo-class taxonomy: every new photo follows docs/photo-classes.md\n` +
              `- [ ] Lighthouse perf history\n` +
              `- [ ] a11y regression (WCAG 2.1 AA)\n` +
              `- [ ] Spawn original 8 audit agents with --scope "since last audit"\n\n` +
              `### Close this issue by\n` +
              `Linking a commit that contains audit findings, OR\n` +
              `Commenting \`SKIP: <reason>\` and logging it in the \`skips:\` section of ` +
              `\`docs/quarterly-audit-cadence.md\`.\n\n` +
              `> Two consecutive SKIP comments = CEO red flag. The cadence isn't real.`;
            await github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title,
              body,
              labels: ['audit', 'cadence']
            });
```

Commit this file tonight. It fires automatically. Zero willpower required.

---

## 2. Minimum Viable Audit (30 minutes, one quarter, no excuses)

Three checks, in order. Stop when you run out of time — but do not skip check 1.

**Check 1 (10 min) — Voice compliance.**
Grep every file added since the last audit date for: missing eyebrow pattern, emoji
characters, "no X yet" / "get started" empty-state copy. One terminal command covers it:
```
git diff --name-only <last-audit-tag> HEAD -- '*.tsx' '*.ts' | xargs grep -l "get started\|no .* yet\|emoji"
```
Flag anything that surfaces. Fix it or open a ticket.

**Check 2 (10 min) — CSP integrity.**
```
curl -sI https://www.profinancecast.com | grep -i content-security-policy
```
Diff the output against the locked baseline in `quarterly-audit-cadence.md`. Any new
directive not in the baseline = stop and investigate before closing the audit issue.

**Check 3 (10 min) — CI history.**
Open the Actions tab. Every run in the last 90 days should be green or have a dated
comment explaining a known failure. If you find a silent red run with no explanation,
that is the audit finding. Log it, open a fix ticket, close the audit issue.

If all three pass, the quarter is clean. Write one sentence in the audit issue and close it.

---

## 3. Cadence Owns the Owner — Q3 2027 State (4 Quarters In)

By the fourth quarter, "founder remembers" must be fully replaced. The target state:

**The audit is part of a contractor's job description.**
When the first part-time engineering contractor or QA hire joins (assume Q1 2027 at the
earliest), the quarterly audit is listed as a standing deliverable in their scope-of-work
document — not a favor they do, a thing they get paid to do. The GitHub Issue auto-assigns
to them on creation. The founder reviews their findings and signs off; the founder does not
run the checks.

**The audit produces a public artifact.**
By Q3 2027 the quarterly audit summary is published to a changelog or a "product integrity"
page visible to users. This is the hardest commitment device: publishing the result means
you can't quietly skip. The newsletter cadence (if one exists by then) requires linking to
the audit summary. Audience accountability beats internal accountability every time.

**The skip policy has teeth.**
Two consecutive skips in `quarterly-cadence.md` triggers a mandatory async retro with
whoever is in a COO or Chief-of-Staff seat by then (even if that's a fractional hire or
an advisor). The founder does not get to unilaterally decide the cadence is fine.

---

## 4. Operating Rhythm That Surfaces "You're Avoiding User-Acquisition Work"

The CEO's message named the next sprint clearly: ICP definition, message house, one channel
test. That is CMO + CRO territory. The COO's job is to make sure it doesn't stay a message.

**The weekly check-in owns the sprint boundary.**
Every Monday, before opening any code editor, the founder answers three questions in a
running doc (a Notion page, a pinned GitHub Discussion, a local markdown file — pick one
and commit):

1. What did I ship toward ICP / message house / channel test last week?
2. What is blocking it this week?
3. Is there anything I did last week that I should have said no to?

If question 1 answer is "nothing," that is the flag. The cadence surfaces avoidance; it
does not fix it. But seeing "nothing" written down two Mondays in a row is the forcing
function. Solo founders avoid user-acquisition work because it is uncomfortable and
ambiguous. Making the avoidance visible and logged is the minimum intervention.

**The sprint gate: no new engineering polish without a paired user-acquisition commit.**
Starting tonight's batch, any engineering work that is not a bug fix requires a paired
artifact in the CMO/CRO lane: a draft ICP hypothesis, a message-house bullet, or a channel
test hypothesis. It does not have to be finished — it has to exist. One sentence is enough.
This is not a bureaucratic rule. It is a forcing function that prevents the founder from
spending 12 more weeks on engineering polish while user acquisition stays at zero.

**The 90-day CMO/CRO OKR.**
Set one KR for the quarter ending 2026-08-21: "One channel test run end-to-end with
results logged, regardless of outcome." A channel test that fails is a success. A channel
test that never starts is the only failure mode. The August audit checks this KR alongside
the engineering checks.

---

## Watch For (Anti-Patterns)

**1. The quiet extension.**
You reschedule an audit date once for a "good reason." Then again. The dates in
`quarterly-audit-cadence.md` are now aspirational, not real. Defense: the GitHub Issue
was auto-created. Closing it with `SKIP:` requires typing a reason. Two `SKIP:` comments
in the issue history is the audit finding.

**2. The polish trap re-activating.**
After tonight's batch closes, a "small thing" surfaces in the UI that "will only take an
hour." It takes three days. The ICP work gets pushed. Defense: the Monday check-in question
makes this visible. If the sprint gate rule is in place, the polish work requires a paired
CMO/CRO artifact first.

**3. The audit becoming a rubber stamp.**
The checklist gets run, nothing fails, the issue gets closed in 10 minutes every quarter.
The audit is now theater. Defense: the full 8-agent cycle runs at least once per year
(May 2027). The annual re-run is specifically designed to catch drift that the lightweight
quarterly checks miss.

**4. The commitment device becoming invisible.**
The GitHub Issue auto-creates but you've trained yourself to ignore the `audit` label.
Defense: the backup self-email arrives 14 days out. Two channels, both require active
dismissal.

**5. User-acquisition work gets its own "someday" backlog.**
ICP, message house, and channel test live in a doc that is never opened. Defense: they
live in the Monday check-in, not a backlog. A backlog can be ignored. A weekly question
cannot — you either answer it or you see the blank.

---

**Bottom Line:** The cadence is real only when the cost of skipping exceeds the cost of
doing it. The GitHub cron + self-email creates that cost. The Monday check-in makes
avoidance of user-acquisition work legible. The contractor job description removes
"founder remembers" from the system entirely by Q3 2027.

Rhythm beats heroics. Set the cadence and let the cadence run the business.
