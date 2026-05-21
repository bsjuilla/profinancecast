# GC Marketing-Claims Compliance Overlay — ProFinanceCast

**Date:** 2026-05-22
**Author:** General Counsel (advisory)
**Companion to:** [`2026-05-22-gc-plan.md`](2026-05-22-gc-plan.md) — heavyweight risk memo (EAA, GDPR, MiFID II perimeter, Brussels I-bis). This memo does **not** repeat that context; cross-references are to §s of the prior memo.
**Scope:** clearance overlay for CMO message house, CRO channel test, CMO ICP hypotheses. ~15-min execution after advisors return.
**Status:** Not legal advice. Surface-the-questions. Engage outside counsel per prior memo §7.

---

## 1. The 3-Question Marketing-Claim Filter

Apply to **every** candidate claim before it ships. Founder runs this; counsel does not.

| # | Question | If YES → action |
|---|---|---|
| Q1 | Does the claim promise a **specific outcome** the user will receive? (e.g. "save €X," "retire 5 years sooner," "grow your wealth 3x") | **Rephrase** to capability of the tool, not the user's result. "Model how a €200/mo change shifts your projection" — not "save €200/mo with us." |
| Q2 | Does the claim imply **regulatory or professional status we don't hold**? (advisor, advice, planner, fiduciary, suitability) | **Drop** the term. Substitute from §2 list. No exceptions. Also see prior memo §4.1. |
| Q3 | Does the claim make a **specific named-competitor comparison** that could mislead (feature parity, price, accuracy)? | **Drop the name** OR factually qualify with a dated, sourced footnote. EU Directive 2006/114/EC on misleading/comparative advertising is enforceable by competitors, not just regulators. |

**Approval path (low-friction):**
- Q1/Q2/Q3 all NO → CMO ships, no GC review needed.
- Any YES that the CMO can fix with the substitution list → CMO ships the fix, logs the original + revision in a one-line CSV. No GC review.
- Any YES the CMO **can't** unambiguously fix → 15-min async GC review (email or Slack thread, screenshot of claim + context). Target turnaround: 24h.
- **Hard stop:** any claim that survives Q2 (advisor/advice framing) does **not** ship without outside counsel sign-off. No GC override.

---

## 2. Word-List Audit — Final

### 2.1 Forbidden words (final list, 15 — no additions tonight)

Extends prior memo §4.3:

`recommend, advise, advice, advisor, adviser, suitable, suitability, you should, allocate, allocation, optimal, portfolio (when used as a verb or as personalised output), risk score, fiduciary, planner`

### 2.2 Safe substitutes

`forecast, project, projection, model, scenario, illustrate, simulate, estimate, explore, visualise, what-if, range of outcomes, sensitivity, educational`

### 2.3 Grep pattern (run before every publish)

PowerShell-friendly, case-insensitive, word-boundary, runs on Windows + Vercel preview:

```powershell
Select-String -Path "**\*.{md,mdx,tsx,html}" -Pattern '\b(recommend|advis(e|or|er|ory)|suitab(le|ility)|you should|allocat(e|ion)|optimal|risk score|fiduciar(y|ies)|planner)\b' -CaseSensitive:$false
```

POSIX equivalent:
```bash
grep -rEni '\b(recommend|advis(e|or|er|ory)|suitab(le|ility)|you should|allocat(e|ion)|optimal|risk score|fiduciar(y|ies)|planner)\b' .
```

Wire into a pre-publish script (or a Vercel build-time check). **Zero hits required to deploy.**

### 2.4 Worked example

**Hero candidate:** "Get the financial advice you can't afford."

**Why it fails:** Q2 (uses "advice" — regulated term); Q1 (implies a user outcome they'll receive); arguably Q3 (compares us by price to a class of unnamed competitors — advisors — which is comparative advertising adjacent).

**Substitution-rule rewrite (drop "advice," reframe to capability, drop the comparison):**

> "Forecast your financial future. Without the price tag of a planner."

Still risky — "planner" is a forbidden word. Second pass:

> **"Model your money the way the pros model theirs."**

This works because: no outcome promise (no specific number), no regulated term, capability-focused, no named competitor. Still surface to outside counsel before launch — "the pros" could be read as an authority appeal, depending on jurisdiction.

---

## 3. Channel-Specific Landmines

| Channel | Most-likely founder misstep | Specific fix | Channel rules to respect |
|---|---|---|---|
| **Twitter / X** | "ProFinanceCast helped a beta user save €4,200 this year" — testimonial-as-claim, no substantiation, regulated-domain. | Reframe as anonymised scenario: "One scenario in PFC: a €200/mo change shifts the 20-yr projection by ~€60K. Try yours." No real-user attribution unless documented consent + audit trail. | EU DSA Art. 26 (transparent ads) doesn't apply to organic but mind FTC-equivalent disclosure if any paid amplification. |
| **Reddit r/personalfinance** | Founder posts a direct link to PFC in answer to a user's planning question. | **Don't post the link at all.** Comment substantively, mention you build a forecasting tool in your profile, let users self-discover. r/personalfinance bans self-promotion (Rule 9) — one mod report = permaban + brand damage. | r/personalfinance Rule 9: no self-promotion, no surveys, no link drops. Also r/eupersonalfinance — similar rule. |
| **Hacker News** | "Show HN: ProFinanceCast — better than [Competitor]." | Drop the comparison. "Show HN: ProFinanceCast — a forecasting tool for European personal finance." HN audience punishes marketing language; treat as a technical-honest channel. | HN guidelines: no marketing language, no astroturfing. Sock-puppet upvoting = permaban + domain ban. |
| **Indie Hackers** | Posting MRR / user-count claims that aren't audited. | Only post numbers you can produce a Stripe/PayPal screenshot for if asked. If pre-revenue, say "pre-revenue, building toward launch." | IH culture rewards honesty over puffery. Inflated numbers get called out publicly. |
| **Product Hunt** | Launch-day copy that says "the AI financial advisor for Europe." | Drop "advisor." Drop "AI" unless you actually have an AI feature (AI-washing is now an FTC + likely EU enforcement priority — prior memo §3 row 8). | PH allows comparison but moderators remove clearly misleading claims. One takedown = lost launch day. |
| **Newsletter (own list)** | "This week's recommendation: increase your emergency fund." | "This week's scenario: model a 6-month emergency fund vs. 3-month and see the projection difference." No personal recommendations from the brand voice, ever. | See §4 below for GDPR/ePrivacy on the list itself. |

---

## 4. Waitlist Email — GDPR + ePrivacy

If CRO recommends a waitlist before PayPal integration, the **minimum** to be clean:

1. **The sentence next to the email field** (verbatim, no edits):
   > "I want product updates from ProFinanceCast. I can unsubscribe in one click. [Privacy notice](/privacy)."
   Checkbox **unticked by default** (Art. 7(2) GDPR + ePrivacy Art. 13). No pre-tick. No bundled consent with ToS.

2. **The single record to keep** per signup (one row in a spreadsheet or DB table is fine):
   - email
   - consent timestamp (ISO 8601, UTC)
   - exact opt-in copy version (hash or version-string of the sentence above)
   - source URL (which page / which CTA)
   - IP **optional** — collecting it strengthens the audit trail but adds a data category; if you collect it, document the lawful basis (legitimate interest, balancing test on file).

3. **Unsubscribe mechanism:** every email contains a one-click unsubscribe link (RFC 8058 List-Unsubscribe-Post header for Gmail/Yahoo bulk-sender compliance — Feb 2024 rules — separate from GDPR but required for deliverability). Unsubscribe must be honoured within 72h, ideally instant.

4. **Deletion-request drill:** **Day 14** post-launch of the waitlist, founder must:
   - send themselves a deletion request from a personal email,
   - measure how long their own SOP takes to honour it,
   - confirm the record is deleted from every system (mailer, CRM, backups, analytics).
   GDPR Art. 17 deadline is one month. If your own drill takes more than a week, the SOP is broken — fix before user #1.

---

## 5. Proactive Flag — The One Tempting Phrase

**The temptation:** the CMO will want a hero or social tagline along the lines of:

> "Smarter than your financial advisor. Free."

This packages three problems in nine words: (a) implicit advice/advisor framing — Q2 fail; (b) comparative claim against a regulated profession — comparative advertising under 2006/114/EC; (c) "smarter" is an unsubstantiated superiority claim — misleading-advertising trigger in every EU member state, plus reputational risk if any advisor's professional body picks it up.

**Safe alternative:**

> "Forecast your finances. Bring the model to your advisor — or just to yourself."

This works because: positions PFC as a **complement** to (not substitute for) regulated advice, removes the superiority claim, keeps a clear value proposition, and stays defensible if a regulator opens a file. It also opens an ICP door (people who already see an advisor are a real segment).

---

## Bottom Line

- **Sign / negotiate / do not sign:** N/A (clearance overlay, no contract).
- **The Risks:** (1) regulated-term creep in fast-shipping marketing copy → MiFID II perimeter risk (prior memo §4); (2) unsubstantiated outcome promises → misleading-advertising exposure (Directive 2005/29/EC); (3) waitlist consent debt accumulating before deletion SOP is tested.
- **Counter-proposals:** the 3-question filter (§1), the grep gate (§2.3), the Day-14 deletion drill (§4).
- **Outside-counsel action items:** add **one** question to prior memo §7 list: *"Confirm whether our forecasting language + disclaimer keeps us outside financial-promotion rules in DE / FR / ES / IT / NL when we run paid social acquisition."* No extra budget needed — fold into existing €600–€1500 engagement.
- **Your decision:** does the CMO own the grep gate (recommended — speed) or does GC (slower, safer)? My call: CMO owns it, GC spot-audits weekly.
- **Disclaimer:** Not legal advice. Surface-the-questions. Engage qualified EU-qualified counsel per prior memo §7 before any paid acquisition campaign goes live.
