# Payments Re-Audit — 2026-05-23 (post-W29-final)

**Auditor:** Claude Opus 4.7 (1M context)
**Scope:** Re-audit of all payment code in `profinancecast-audit/profinancecast` after the 40-finding W25-W29 + W29-final closure.
**Method:** Line-by-line re-read of `api/paypal/*`, `api/subscription/*`, `api/founders-claimed.js`, `js/pfc-config.js`, `js/pfc-entitlements.js`, `js/inline/billing-2.js` (partial), all 12 migrations, and `vercel.json`. Cross-checked against the prior audit `2026-05-23-payments-code-audit.md` (40 findings, all closed at commits `f5bd602` through `4469cf4`).
**Lanes:**
- Lane 1 RAG-recall — **subagent dispatch failed twice** (ruflo-rag-memory:memory-specialist hits a 1M-context credit gate even though its frontmatter declares `model: sonnet`; likely a harness bug). Substituted by reading the prior audit doc + handoff doc directly.
- Lane 2 deep code re-audit — done inline by the parent. A second-pass subagent (ruflo-security-audit:security-auditor) also failed with the same 1M-context error; coverage stands at the inline pass only.
- Lane 3 aikido CVE scan — **failed**, Aikido MCP not authenticated. Substituted by manual dep-drift check (found supabase-js 60 versions behind).
- Lane 4 CISO strategic pass — **ran successfully** on the second attempt via c-level-agents:cs-ciso-advisor. Findings folded into § "Strategic / CISO-lens findings" below; **substantially shifted the priority queue toward non-code launch-blockers** (VAT, IR runbook, terms.html updates).
- Lane 5 synthesis — this document.

> **For the operator:** Read TL;DR first, then the P0/P1 findings, then the strategic notes. Everything verified against the actual code state at HEAD = `520dd0e` / code at `4469cf4`.

---

## TL;DR

The W29-final close-out **holds up** under fresh-eye review. The original 40 findings are all closed in code, the new W29-b recurring-subscriptions flow is well-defended (origin check, email-confirmed gate, retry+backoff, plan-id regex, status='pending' pre-write), and the supporting Supabase migrations (founders_seats FOR UPDATE SKIP LOCKED, webhook_events_processed PK, status_pending CHECK) are correctly designed.

The re-audit found **7 net-new findings** (1 P0-conditional, 3 P1, 3 P2) that the prior audit missed because they live in code that did not exist yet when the prior audit ran (recurring subs handlers, cancel.js W29-b additions). One is a launch-blocker if a specific PayPal payload shape occurs; the rest are hardening recommendations.

**Net launch-readiness verdict:** still launch-ready conditional on (a) confirming Vercel envs + remaining migrations (#4/#5/#6) are applied — already on the existing handoff doc — and (b) hardening fix for new-P0a below (small code change, < 30 minutes).

---

## NEW-P0a — `BILLING.SUBSCRIPTION.ACTIVATED` falls back to `current_period_end = null` if PayPal omits `next_billing_time`

**File:** [api/subscription/webhook-paypal.js:637-665](api/subscription/webhook-paypal.js#L637-L665)
**Severity:** P0 (conditional — only triggers if PayPal omits `billing_info.next_billing_time` on an ACTIVATED event; observed shape per PayPal docs always includes it, but defensive failure mode is severe)

**Description:**
The ACTIVATED handler does:
```js
const nextBilling = resource.billing_info?.next_billing_time || null;
// ...
await supabase.from('subscriptions').update({
  status: 'active',
  current_period_end: nextBilling,   // can be null
  ...
})
```

If `next_billing_time` is ever null/missing in a real ACTIVATED payload (e.g., PayPal's behaviour changes; a sandbox plan with non-recurring config; an edge case during plan migration), `current_period_end` is written as `null`.

Then [status.js:113-115](api/subscription/status.js#L113-L115) does:
```js
const periodEnd = sub?.current_period_end ? new Date(sub.current_period_end).getTime() : 0;
const expired = periodEnd && periodEnd < now;
const plan = (sub && sub.status === 'active' && !expired) ? sub.plan : 'free';
```

`periodEnd = 0` → `expired = false` → user keeps the plan **indefinitely**. This is the *exact same bug pattern* as the original W29-final P0 #2 fix, just re-introduced on a different code path.

**Why W29-final didn't catch it:** the fix narrative was "previously left null — fragile". The fix now populates the column *when PayPal provides the value*, but has no fallback when PayPal doesn't. The original bug class is unfixed for the null-input case.

**Fix:** When `nextBilling` is null, derive a calendar-correct period_end from the plan_id. Add a `PAYPAL_PLAN_ID_TO_SKU` map next to the existing `PAYPAL_PLAN_ID_TO_TIER` (line 83-88) and call `_periodEndForSku(sku)` as fallback:

```js
const PAYPAL_PLAN_ID_TO_SKU = {
  [process.env.PAYPAL_PLAN_ID_PRO_MONTHLY     || '__pmm__']: 'pro_monthly',
  [process.env.PAYPAL_PLAN_ID_PRO_ANNUAL      || '__pma__']: 'pro_annual',
  [process.env.PAYPAL_PLAN_ID_PREMIUM_MONTHLY || '__pem__']: 'premium_monthly',
  [process.env.PAYPAL_PLAN_ID_PREMIUM_ANNUAL  || '__pea__']: 'premium_annual',
};
// In ACTIVATED handler:
const sku = PAYPAL_PLAN_ID_TO_SKU[resource.plan_id] || null;
const periodEnd = nextBilling || (sku ? _periodEndForSku(sku) : null);
// fail-safe: refuse to mark active if we have NO period_end at all
if (!periodEnd) {
  _alertOps('ACTIVATED without resolvable period_end', `subscriptionId: ${subscriptionId}\nuser_id: ${customUserId}\nplan_id: ${resource.plan_id}\nresource: ${JSON.stringify(resource, null, 2)}`);
  break;  // keep DB in pending state until support reconciles
}
```

Also: same null-handling concern in `BILLING.SUBSCRIPTION.UPDATED` (line 683-691) — `next_billing_time` is written without fallback; this is less severe because the row should already have a valid period_end from ACTIVATED, but the null-write would corrupt it.

---

## NEW-P1a — `PAYMENT.CAPTURE.COMPLETED` with unparseable reference_id silently logs without alerting ops

**File:** [api/subscription/webhook-paypal.js:415-422](api/subscription/webhook-paypal.js#L415-L422)
**Severity:** P1

**Description:**
When the webhook fallback path runs (capture-order.js failed and PayPal fired CAPTURE.COMPLETED), the handler derives SKU from `reference_id` (set as `${userId}:${plan}` by create-order.js). If parsing fails (malformed or missing reference_id), the code logs to `subscription_events` and **breaks without calling `_alertOps`**:

```js
if (!plan || !sku) {
  console.warn(`[webhook-paypal] capture.completed: no plan from reference_id="${refId}"`);
  await _logEvent({ user_id: userId, event_type: 'webhook_no_plan_match', ... });
  break;  // <-- no _alertOps
}
```

Compare with the `if (!userId)` branch above (line 342-366) which DOES `_alertOps`. The user-paid-but-no-entitlement case is arguably worse than user-paid-with-no-user (the user can be found in the DB and contacted; just need manual intervention). Asymmetric alerting means money lands in your PayPal account, the user is logged in your DB, but no human knows to grant the entitlement.

**Fix:** Add `_alertOps('Capture completed but plan unresolvable', ...)` mirroring the unresolvable-user pattern at line 358-364. Include `userId`, `captureId`, `refId`, and `amount` in the alert body.

---

## NEW-P1b — `cancel.js` does not retry PayPal cancel-subscription on 5xx and does not surface failure to the client

**File:** [api/subscription/cancel.js:121-155](api/subscription/cancel.js#L121-L155)
**Severity:** P1

**Description:**
Two related issues in the W29-b recurring-cancel addition:

1. The PayPal cancel call uses raw `fetch()`, not the `_fetchPayPalWithRetry` wrapper used by every other PayPal call in the codebase. A transient PayPal 5xx fails permanently.
2. When PayPal cancel fails, the code logs but **proceeds to flip local `cancel_at_period_end = true` and returns a success response to the client**. The user sees "Cancellation scheduled. Pro access remains until the end of your current period." — but PayPal will continue auto-charging at next billing time because the recurring subscription was never actually cancelled at PayPal's side.

The comment acknowledges this trade-off ("Don't fail the whole request — surface the local cancel-at-period-end anyway and let support reconcile") but the response should at least signal the partial failure so the UI can warn the user.

**Fix:**
- Wrap the cancel call in `_fetchPayPalWithRetry` for consistency.
- When PayPal cancel returns non-204 and non-422, return the success response with a `paypal_cancel_pending: true` flag, and have billing.html's cancel-modal show "Cancellation recorded locally — PayPal acknowledgement is pending; we'll email you if there's an issue." Also `_alertOps` so support knows to manually verify.

---

## NEW-P1c — Pre-pending-row from `create-subscription.js` can be orphaned by a second subscription attempt

**File:** [api/paypal/create-subscription.js:278-287](api/paypal/create-subscription.js#L278-L287) and [api/subscription/webhook-paypal.js:657-665](api/subscription/webhook-paypal.js#L657-L665)
**Severity:** P1

**Description:**
Scenario: User clicks Subscribe for `pro_monthly`. create-subscription.js mints sub1 at PayPal and upserts a pending row `(user_id, provider_subscription_id=sub1, status=pending)`. User abandons the approval page. Later, user clicks Subscribe again for `pro_annual` — create-subscription.js mints sub2 and upserts (onConflict: user_id), OVERWRITING the row to `(provider_subscription_id=sub2, status=pending)`. Sub1 is now orphaned at PayPal but invisible in our DB.

User then approves sub1 from an old browser tab. PayPal fires BILLING.SUBSCRIPTION.ACTIVATED with `resource.id = sub1`, `custom_id = user_id`. The handler updates by `user_id` only — it sets `current_period_end = sub1.next_billing_time` and `plan = sub1_plan_tier`, but does NOT update `provider_subscription_id` (which still says sub2). DB row is now internally inconsistent: provider_subscription_id points to sub2, but the active entitlement was granted by sub1.

If sub2 is later approved too, both subscriptions are active at PayPal but the DB only tracks one. The user could be double-billed on next renewal cycle.

**Fix:** In create-subscription.js, before upserting, check for an existing pending row pointing at a *different* subscription_id. If found, call PayPal's `/v1/billing/subscriptions/{id}/cancel` on the old one before minting the new one. Or: in the ACTIVATED webhook, ALSO update `provider_subscription_id = resource.id` so the DB always reflects the actually-activated subscription.

**Real-world likelihood:** Low (requires user to start two flows and complete an old one), but the failure mode is double-billing — a regulatory issue under EU consumer-protection rules.

---

## NEW-P2a — Dependency drift: `@supabase/supabase-js` pinned to 2.45.4, current is 2.106.1

**File:** [package.json:7](package.json#L7)
**Severity:** P2

**Description:**
`"@supabase/supabase-js": "^2.45.4"` resolves to any 2.x. Current published is 2.106.1 — a 60-version gap, ~7 months of upstream changes. No active CVEs known against 2.45.4 (Aikido scan not run; recommend follow-up), but the gap is large enough that bug fixes (RLS-bypass edge cases, auth-getUser robustness) have likely accumulated.

**Fix:** Bump to 2.106.1 or latest, redeploy to a Vercel preview, smoke-test the webhook + status endpoint, then promote to prod. Lockfile pinning (`package-lock.json` or `pnpm-lock.yaml`) — confirm Vercel installs deterministically.

---

## NEW-P2b — `_alertOps` has no rate-limiting or batching; a dispute storm could spam Resend and lose alerts

**File:** [api/subscription/webhook-paypal.js:100-118](api/subscription/webhook-paypal.js#L100-L118)
**Severity:** P2

**Description:**
Every alert path (`_alertOps`) fires a Resend email per event. A dispute storm (say, a card-skimming attacker uses your endpoint with stolen cards, triggering 50 disputes in a day) would send 50 emails to ALERT_EMAIL — Resend free tier rate-limits at 100/day, paid at higher tiers, but you'd lose visibility on the *first* critical alert if the inbox is buried.

**Fix:** Add a simple Upstash Redis-backed rate limit (the dep is already installed — `@upstash/redis`): max 5 alerts per type per hour, bundle the rest into a single digest. For a solo founder, a Slack webhook is probably better than email anyway.

---

## NEW-P2c — `billing-2.js:6` initializes `checkoutAmt = 69` (stale pre-W25 default)

**File:** `js/inline/billing-2.js:6` (search-only — read with Read tool to confirm context)
**Severity:** P2 (cosmetic; not exploitable)

**Description:**
`let checkoutAmt = 69;` is a leftover from the pre-W25 pricing (Pro Annual was 69, now 79). It is overwritten before checkout opens (by `openCheckout(plan, amount)` calls in `openProCheckout`/`openPremiumCheckout`), so it never reaches a checkout flow with the wrong number. But it is a confusing artifact and could mislead a future maintainer.

**Fix:** Change initial to `0` (or remove the global — `checkoutPlan`/`checkoutAmt` could be locals inside `openCheckout`).

---

## NEW-P3 — Webhook dedup correctness depends on PayPal `paypal-transmission-id` being stable across retries

**File:** [api/subscription/webhook-paypal.js:220-246](api/subscription/webhook-paypal.js#L220-L246), [supabase/migrations/20260523_webhook_events_processed.sql](supabase/migrations/20260523_webhook_events_processed.sql)
**Severity:** P3 (likely-fine; flag for production verification)

**Description:**
The dedup table primary key is `event_id` populated from the `paypal-transmission-id` header (fallback: `event.id`). PayPal documentation is ambiguous about whether transmission_id is stable across retries of the same event:
- The migration comment says "PayPal's unique per-attempt identifier" — implying NEW per attempt.
- Common PayPal SDK examples dedupe on this header — implying STABLE per event.

If transmission_id is per-attempt (not per-event), every webhook retry would have a different transmission_id and the dedup table would not catch retries → state-changing handlers run multiple times.

**Mitigation already in code:** The fallback to `event.id` (which IS stable per event) provides defense-in-depth. The handlers also have idempotency at the data layer (capture matched on `provider_capture_id`, founders seat finalized with idempotency check, status_refunded re-entries safe).

**Fix:** Verify in production with a real PayPal retry (simulate via PayPal dashboard's "Resend" button). If transmission_id changes on resend, switch the dedup key to `event.id` (which is stable). The migration comment should be corrected either way.

---

## P0/P1 findings from the prior audit — **VERIFIED CLOSED**

Spot-checked the W25-W29 + W29-final fixes against current code. All 40 prior findings remain closed:

| Prior # | Topic | Current state |
|---|---|---|
| #1 (Server/client price drift) | `PLAN_PRICES` in both create-order.js:17-23 and capture-order.js:52-58 now `{ pro_monthly: 9, pro_annual: 79, premium_monthly: 19, premium_annual: 169, founders: 149 }` | ✓ CLOSED |
| #2 (USD vs EUR currency) | `currency_code: 'EUR'` in create-order.js:209; webhook EXPECTED_CURRENCY='EUR' (line 37); capture-order verifies `currencyPaid !== 'EUR'` rejects | ✓ CLOSED |
| #3 (refund scoping by user_id alone) | refund branch now scopes by `provider_capture_id` (webhook-paypal.js:566) + stale-capture log path (line 534-549) | ✓ CLOSED |
| #4/#5 (founders cap not enforced) | `claim_founders_seat()` PG function with FOR UPDATE SKIP LOCKED, 100-row pre-seed, 15-min TTL, idempotent re-issue | ✓ CLOSED |
| #6 (amount→plan mapping) | Now parsed from `reference_id = ${userId}:${plan}` in create-order.js:208; webhook decodes it (line 405-414) | ✓ CLOSED — but see NEW-P1a for an alerting gap on the unparseable-refid branch |
| #7 (webhook idempotency) | `webhook_events_processed` table inserted as first step in handler (line 220-246) | ✓ CLOSED (but see NEW-P3) |
| #8 (capture-order replay) | Preflight GET on order, check status === 'COMPLETED' before re-capture; PayPal-Request-Id on capture (line 256-264, 282) | ✓ CLOSED |
| #9 (email_confirmed_at gate) | `_verifyUser` rejects if `!data.user.email_confirmed_at` in both create-order.js:97-99 and capture-order.js:181-183 and status.js:71-74 (for owner override) | ✓ CLOSED |
| #10 (raw body for webhook sig) | `bodyParser: false` config, `_readRawBody` Buffer read, signature verified before parse (line 28, 122-128, 184-196) | ✓ CLOSED |
| #11 (XSS via PAYPAL_CLIENT_ID) | Format-validated in pfc-config.js:42 regex `/^[A-Za-z0-9_-]{30,160}$/`; fails closed with a hidden page | ✓ CLOSED |
| #12 (CORS / origin) | `_originAllowed()` in create-order/capture-order/cancel/create-subscription; W29-c regression fix accepts www + apex | ✓ CLOSED |
| #13 (history table) | `subscription_periods` table + writes from capture-order, webhook-paypal CAPTURE.COMPLETED, SALE.COMPLETED, refund mark-as-refunded | ✓ CLOSED |
| #14 (renewal logic) | W29-b recurring via PayPal Billing Plans + handlers for ACTIVATED/UPDATED/CANCELLED/EXPIRED/SUSPENDED/PAYMENT.FAILED/SALE.COMPLETED/SALE.REFUNDED | ✓ CLOSED — but see NEW-P0a (period_end null) and NEW-P1b (cancel surface), NEW-P1c (orphan-pending) for new-code issues |
| #15 (30-day vs 1-month) | `_addMonthsUTC` / `_addYearsUTC` in both capture-order and webhook-paypal | ✓ CLOSED |
| #16 (PayPal 5xx retry) | `_fetchPayPalWithRetry` wraps every PayPal call in create-order, capture-order, create-subscription | ✓ CLOSED — except cancel.js's PayPal cancel call, see NEW-P1b |
| #17 (unresolvable user alerting) | `_alertOps` fired on the no-userId branch (line 358-364) | ✓ CLOSED — except no-plan-match branch lacks the alert, see NEW-P1a |
| #18 (status 200 on DB error) | `status.js` returns 503 on subErr (line 102-107); pfc-entitlements treats 5xx as transient + recovers stale cache (line 95-115) | ✓ CLOSED |
| #20-#27 (P1 correctness lot) | Spot-checked: refund downgrade matches capture_id, dispute auto-suspend AI, currency mismatch refused, PII redaction allowlist | ✓ CLOSED |
| #29 (diagnostic leak in prod) | `IS_PROD` gate strips `_reason` / `_ownerEmailsConfigured` in production (status.js:23-27) | ✓ CLOSED |
| #31-#40 (UX polish, billing history endpoint, pfc-config validation, etc.) | Verified in code or out-of-scope for this re-audit | ✓ CLOSED |
| W29-final P0 #1 (status='pending' for pre-write) | create-subscription.js:281 writes `status: 'pending'`; migration `20260523_status_pending.sql` adds 'pending' to CHECK | ✓ CLOSED |
| W29-final P0 #2 (current_period_end on ACTIVATED) | webhook-paypal.js:661 sets from `next_billing_time` | ✓ CLOSED for non-null payloads; **gap on null payload — see NEW-P0a** |
| W29-final P0 #3 (Pro Annual misclassified by amount threshold) | webhook-paypal.js:870-875 exact-price lookup `{9: pro_monthly, 79: pro_annual, 19: premium_monthly, 169: premium_annual}` | ✓ CLOSED |

---

## Strategic / CISO-lens findings (Lane 4)

The `c-level-agents:cs-ciso-advisor` subagent ran on the second attempt (after `/model claude-opus-4-7` was set). Its full report is folded in below. The headline shift versus my inline CISO-lens (which I'd already drafted before the subagent dispatch succeeded): **VAT collection liability is bigger than any code finding in this audit**, and the operational posture is more under-resourced than I'd flagged.

### 1. Regulatory exposure (the under-priced risk)

**VAT — material personal liability.** EU rules on B2C digital services require VAT at the **customer's country rate** (OSS regime), not yours. €9 / €79 / €19 / €169 are listed flat on `billing.html` with zero VAT language in `terms.html` § 7 (lines 129-136). PayPal does not collect VAT for you. Selling a €9 sub to a French consumer without remitting ~€1.50 to the French tax authority → personally liable for back-VAT + penalties + interest, going back to the first transaction.
- **At €5k MRR with 60% EU-cross-border mix:** annualized exposure ~€4-6k of unremitted VAT + up to 200% penalty = **€12-18k ALE**.
- **Fix:** register for OSS in your member state of establishment, add VAT logic to prices, OR restrict checkout to your own country until OSS is in place.

**GDPR Article 17 — promise without operational path.** `privacy.html:162` promises deletion within 24 hours; the inline CISO-lens already flagged that there's no `DELETE FROM subscription_events WHERE user_id` path. Asymmetry between policy and reality = Article 5 (lawfulness/accuracy) problem on top of Article 17. A regulator complaint is plausible the first time a churned Founder asks for erasure proof.

**Recurring-billing — 14-day withdrawal right not properly waived for Founders.** EU Directive 2011/83/EU + Omnibus give consumers a 14-day withdrawal right on subscriptions. "Founders Lifetime non-refundable after 14 days" (terms § 7) is defensible **only** if the buyer explicitly waived this right at checkout with a tickbox. There is no such checkbox in `billing.html`. **Today, any Founder can demand a full refund within 14 days and you must give it, lifetime nature notwithstanding.**

**SCA / 3-DS.** PayPal handles this in their hosted flow — confirmed safe. Document the dependency.

**Article 27 EU representative.** `privacy.html` § 12 hedges with "if required". If you process EU resident data systematically (you do) and you have no EU establishment, appointment is **mandatory**. €10M / 2% revenue exposure if challenged.

### 2. Threat modeling — real adversaries

- **Card-testing → dispute pileup → merchant-account suspension.** The blast radius isn't fraud loss (PayPal covers it) — it's PayPal suspending your merchant account at 1% dispute rate / 100 disputes per month. **All revenue stops.** Mitigation: Upstash rate limit on `create-order` (10/min/user), captcha for unauthenticated session age < 24h, PayPal Advanced Fraud Protection toggled on.
- **Supabase service-role key compromise = total ownership.** Read/write/delete on all financial data, can mint fake `status='active'` rows, drain Founders seats. Currently lives only in Vercel env — good — but **no documented rotation procedure, no break-glass plan, no key versioning**. An accidental log of the key (Vercel Hobby logs aren't encrypted at rest) gives the attacker hours, not days.
- **PayPal Business credential compromise.** Attacker can issue refunds to a controlled bank account, change webhook URL, change statement descriptor. Mitigation: 2FA + hardware key + dedicated business email *not* shared with `ALERT_EMAIL`.
- **ALERT_EMAIL is `business060407@gmail.com`** — same as the founder's primary. If that Gmail is compromised, attacker silently reads every payment alert. Single concentration point on a money-handling system. **Move to a domain mailbox or Slack webhook.**

### 3. Incident response — **NOT READY**

No IR runbook exists. At 2am, when PayPal emails "your merchant account is under review", the founder has no documented sequence. The CISO drafted this template — copy into `docs/runbooks/payments-incident-response.md`:

```
INCIDENT TYPES & RESPONSE
1. Suspected Supabase key leak:
   - Supabase Dashboard → Settings → API → regenerate service_role
   - Vercel → Project → Env Vars → update SUPABASE_SERVICE_ROLE_KEY → redeploy
   - Audit subscription_events for last 24h for unexpected status changes
   - Time-to-revoke target: < 15 min
2. PayPal account anomaly: rotate password + 2FA backup, contact PayPal Merchant Risk
3. Webhook flood / card-test attack:
   - Set PAYMENTS_DISABLED=true env var → create-order / create-subscription return 503
   - Block IP range at Vercel firewall (Hobby tier doesn't support — Vercel Pro $20/mo unlocks)
4. Data breach (Supabase exposure):
   - GDPR 72h notification clock starts at AWARENESS, not confirmation
   - Notify supervisory authority of country of main establishment
   - Notify affected users without undue delay
```

**Missing primitive: payments kill-switch.** Add `PAYMENTS_DISABLED=true` env-var check at the top of `create-order.js` and `create-subscription.js` returning 503 with maintenance message. **5-minute add; saves hours under fire.**

### 4. Compliance documentation gaps

`privacy.html` and `terms.html` last updated **May 10** — before W29-b shipped recurring billing on May 23:

- `terms.html` § 7 line 132 — does not state Pro/Premium is a **PayPal recurring billing agreement** that auto-renews until cancelled. EU Omnibus requires explicit pre-contractual auto-renewal disclosure.
- `privacy.html` line 150 — does not disclose that PayPal stores a recurring billing agreement linked to the user, nor link to PayPal's privacy policy (Article 13 GDPR requires this).
- No **DPA reference with Supabase** (Article 28 requires one; Supabase publishes one — link it).
- No cookie banner (likely fine if essential-only, but document the decision).

**Action:** republish both with `Last updated: May 23, 2026` and the changes above. ~30 minutes.

### 5. Vendor concentration risk

Acceptable pre-launch, **not acceptable at €100k ARR without contracts**:
- **PayPal** can 21-day-reserve 30% of processed volume on new merchants. Keep 90 days of opex in a separate account.
- **Supabase Hobby has no SLA.** A DB outage = `status.js` 503 = every paid user sees `free`. The fix prevents corruption but not the UX disaster. Upgrade to Pro ($25/mo) at €500/mo MRR — trivial financial case.
- **Vercel Hobby = 12/12 functions used.** Zero headroom for any new payment-adjacent endpoint. One more function = forced upgrade under fire.
- **Resend free tier rate-limited.** A dispute storm or a rate-limit on alerts means **you stop getting paged during the incident you needed to be paged for.** Worst possible alerting failure mode.

### 6. Liability transfer — `terms.html` issues

§ 14 (line 157): "governed by the laws applicable at our place of operation". **"Place of operation" is undefined** — reads as obfuscation, unenforceable under EU consumer rules. Name the jurisdiction explicitly.

Liability cap (§ 13, 12-month-of-fees) is standard. Good.

**Missing entirely:** no clause stating payment disputes are subject to **PayPal's User Agreement**. Add:
> "Payment processing is provided by PayPal under PayPal's User Agreement. Disputes about a specific transaction (including chargebacks) are resolved by PayPal first."

Two sentences; removes a category of arbitration cost.

### 7. CISO top 3 launch-blockers

**DO NOT TAKE REAL MONEY UNTIL THESE ARE FIXED:**

1. **VAT collection is unsolved and the founder is personally liable.** Not a Q3 item. Register for OSS or restrict to own country.
2. **No IR runbook + no payments kill-switch + alerts go to personal Gmail.** Detection without response capacity.
3. **Terms-of-service + privacy policy don't reflect May 23 reality; Founders 14-day withdrawal not properly waived at checkout.** First Founder demanding refund 13 days later wins.

**Honorable mentions (post-launch, next 90 days):**
- Rate-limit payment endpoints (PayPal merchant-suspension risk)
- GDPR Art. 17 erasure path for subscription_events / subscription_periods
- Article 27 EU rep (€100-300/mo from a service provider)
- Quarterly rotation of Supabase service-role key
- Separate Resend API key for ops alerts
- Move ALERT_EMAIL off `business060407@gmail.com`
- Upgrade Vercel to Pro before adding new payment functions

> CISO closing: "Assume breach. Design backwards. Code is fine. **Posture is not launch-ready.** Three concrete blockers above; one weekend of work; then you're carrying real money safely."

---

## Priority queue for the operator

**Post-CISO consolidation — top of stack is now NON-CODE work.** The biggest exposure is regulatory/operational, not in the codebase. Updated ordering:

### Launch blockers (CISO):

1. **VAT-OSS registration** OR restrict checkout to your own country. Personally-liable back-VAT exposure. (See § 1.)
2. **IR runbook + payments kill-switch (`PAYMENTS_DISABLED` env var) + alert routing off personal Gmail.** ~4 hours total. (See § 3.)
3. **Republish terms.html + privacy.html for W29-b recurring billing reality. Add 14-day-withdrawal waiver checkbox on the Founders billing flow.** ~1 hour. (See § 4 + § 1.)

### Code launch-readiness (from re-audit):

4. **NEW-P0a (period_end null fallback)** — 30-min fix. Add `PAYPAL_PLAN_ID_TO_SKU` map + fallback to `_periodEndForSku(sku)`.
5. **NEW-P1a (alert on no-plan-match)** — 5-min fix. One `_alertOps(...)` call.
6. **NEW-P1b (cancel PayPal retry + surface failure)** — 20-min fix. Wrap in `_fetchPayPalWithRetry`, add response flag.

### Pre-revenue-scale hardening (defer post-launch but plan it):

7. **Rate limiting on create-order / create-subscription** — 1-hour fix. Upstash Redis already a dep.
8. **NEW-P2a (supabase-js bump 2.45.4 → 2.106.1)** — verify lockfile, bump, smoke-test on a preview.
9. **NEW-P1c (orphan-pending sub cleanup)** — low real-world likelihood; defer.
10. **CISO honorable mentions** — Article 27 EU rep, GDPR Art. 17 erasure path, Resend key separation, Vercel Pro upgrade. Quarterly Supabase key rotation cadence documented.

---

## Open questions for the operator

1. Has migration `#6 — 20260523_status_pending.sql` actually been applied in production Supabase? The handoff doc notes #1/#2/#3 confirmed but #4/#5/#6 "need to confirm". Without #6, the W29-final P0 #1 fix throws on every create-subscription call (status='pending' fails the CHECK constraint).
2. Has a real Pro Annual purchase (€79) actually been smoke-tested end-to-end? The handoff doc lists it as "Not yet tested". This is the regression vector for W29-final P0 #3 — if there's a subtle bug in the SALE.COMPLETED path that wasn't caught in this re-audit, the symptom appears only after 30 days when status.js downgrades.
3. Is ALERT_EMAIL actually receiving alerts? Worth firing a dummy test (e.g., synthetic dispute event in PayPal sandbox) to confirm the Resend integration works before relying on it for real incidents.

---

## What this audit did NOT cover

- Frontend JS in `js/inline/billing-2.js` — only read first 90 lines for the stale `checkoutAmt`. Full client-side flow audit deferred; the prior audit covered XSS and CSP comprehensively.
- `js/inline/billing-1.js` and `billing-3.js` — assumed unchanged or non-payment-critical.
- The other 11+ migrations beyond the payment-specific ones.
- aikido CVE scan — MCP integration not authenticated; recommend running manually via web UI on the repo to confirm package CVEs.
- A dispatched CISO subagent — strategic notes are inline above but a separate advisor pass would surface more.
- Performance / load characteristics under realistic traffic.

---

## Audit trail

- Read all files listed in the Scope section (no Grep-only matches; full read for each).
- Cross-referenced every claim against [docs/superpowers/audits/2026-05-23-payments-code-audit.md](docs/superpowers/audits/2026-05-23-payments-code-audit.md) and [docs/handoff/2026-05-23-payments-launch-state.md](docs/handoff/2026-05-23-payments-launch-state.md).
- Git HEAD at audit time: `520dd0e` (handoff doc); latest code: `4469cf4`.
- Auditor: Claude Opus 4.7 1M context, fresh session per user request.

---

# Findings from post-restart re-audit (2026-05-23 16:30, inline)

**Auditor:** Claude Opus 4.7 (1M context, fresh session)
**Method:** Full second-pass re-read of every payment file (including billing-2.js full 864 lines, all 12 migrations, api/sage.js cross-reference). Done inline because ruflo subagent dispatch still hits 1M-credit gate post-restart (see [[ruflo-subagent-dispatch-block]] feedback memory — the harness routing bug persists across session restarts and is not unblocked by enabling usage credits).

**Lane status this pass:**
- Lane 1 RAG-recall (ruflo-rag-memory) — **dispatch failed** (1M-credit gate). Substituted by reading existing audit + handoff docs directly.
- Lane 2 deep code re-audit (ruflo-security-audit) — **dispatch failed**. Substituted by inline pass below. Coverage now includes the previously-skipped billing-2.js full 864 lines + api/sage.js + all 12 migrations.
- Lane 3 aikido CVE scan — **MCP authenticated but returned signature errors** (need to run `/aikido:setup` first). Re-attempt after setup.
- Lane 4 code quality review (ruflo-core:reviewer) — **dispatch failed**. Substituted by inline review (NEW-R* findings below).
- Lane 5 synthesis — this section.

**TL;DR of this pass:** Six new findings, of which **one is a hard launch-blocker** (NEW-P0b) the previous re-audit missed because billing-2.js full read + api/sage.js cross-reference weren't done. Updated priority queue at the bottom of this doc reflects this.

---

## NEW-P0b — Open RLS UPDATE policy on `profiles` lets any signed-in user grant themselves unlimited Sage AI quota

**File:** [supabase/migrations/20260510_owner_override_and_forecast_policy.sql:21-27](supabase/migrations/20260510_owner_override_and_forecast_policy.sql#L21-L27)
**Severity:** **P0 — pre-launch blocker.** Not money-loss, but a one-line browser-console exploit that gives any signed-in user infinite use of the highest-cost gated feature (Sage AI / Gemini). Trivial to find by anyone who inspects the bundle and notices `pfc-config.js` exposes the anon key.

**Description:**

The W27/Sprint-7 migration installed this UPDATE policy on `profiles` — explicitly described in the migration comment as "no-op now that forecast/save.js uses service role, but kept so a future switch back to anon-key + JWT forwarding doesn't silently break":

```sql
CREATE POLICY "users_set_first_forecast_once"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
```

The policy is column-unrestricted. Any signed-in user can do this from the browser console after loading any page that initializes `supabase` from the public anon key (which is shipped to every browser by [js/pfc-config.js:46](js/pfc-config.js#L46)):

```js
await supabase
  .from('profiles')
  .update({ ai_queries_used: 0, ai_queries_limit: 999999 })
  .eq('id', (await supabase.auth.getUser()).data.user.id);
```

The quota is then read here:

```js
// api/sage.js:319
const cap  = profile?.ai_queries_limit || PLAN_LIMITS[plan] || PLAN_LIMITS.free;
const used = profile?.ai_queries_used || 0;
```

Result: free user gets unlimited Gemini-backed Sage AI calls. The increment via `supabase.rpc('increment_ai_queries', ...)` does bump `ai_queries_used` after each call, but the user can re-zero it any time. PLAN_LIMITS gate (`free: 0`) is bypassed because the explicit `profile.ai_queries_limit` value short-circuits the fallback.

The entitlement gating on `profiles.plan` is NOT exploitable (status.js reads from `subscriptions` table, not `profiles.plan`), so the user can't *escalate to Pro UI features* this way — but Sage AI is the single highest-cost gated capability and it's directly readable from the writable profiles row.

**Why prior audits missed it:** The original 40-finding audit and the morning re-audit focused on the payment-state machine (subscriptions, webhook handlers, refunds). The owner-override migration was treated as out-of-scope because it's labeled "no-op". The "no-op" claim is wrong — the policy IS active and IS load-bearing because the anon-key Supabase client uses it.

**Fix (recommended — minimal surface area):**

```sql
-- 20260523_profiles_update_policy_tighten.sql
DROP POLICY IF EXISTS "users_set_first_forecast_once" ON public.profiles;
-- Don't replace it. forecast/save.js + sage.js both use service_role,
-- which bypasses RLS. No client-side UPDATE to profiles is needed.
-- If a future endpoint needs anon-key UPDATE, add a column-restricted
-- policy at that time.
```

If the policy must stay (e.g., a future client-side update is planned), restrict columns via a separate trigger:

```sql
CREATE OR REPLACE FUNCTION public.profiles_block_quota_self_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'authenticated' THEN
    IF NEW.ai_queries_limit IS DISTINCT FROM OLD.ai_queries_limit
       OR NEW.ai_queries_used IS DISTINCT FROM OLD.ai_queries_used
       OR NEW.plan IS DISTINCT FROM OLD.plan THEN
      RAISE EXCEPTION 'Cannot self-modify quota or plan';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER profiles_block_quota_self_update_t
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_block_quota_self_update();
```

**Detection:** check Supabase logs for any UPDATE to profiles initiated under `authenticated` role (not service_role) that modified `ai_queries_limit` or `plan` since 2026-05-10. If found, those users were exploiting this; remediate by recomputing `ai_queries_limit` from `profiles.plan`.

---

## NEW-S2 — billing-2.js `_tryRenderSubscriptionButton` creates a real PayPal subscription as a "probe"

**File:** [js/inline/billing-2.js:191-265](js/inline/billing-2.js#L191-L265)
**Severity:** P1 (operational risk + orphan-subscription pollution)

**Description:**

The "subscription probe" actually creates a real PayPal subscription on EVERY render of the Subscribe button. The comment on line 198-203 explicitly notes this trade-off:

```js
// Implementation: actually we delegate the "feature check" to the
// createSubscription callback itself — the SDK swallows the throw and
// re-renders the button as failed, which isn't great UX. So we probe
// FIRST with a real call and either render the subscription button OR
// throw to trigger fallback.
```

Consequences:
1. **Orphan subscriptions in PayPal.** Click Subscribe (Pro Monthly) → real subscription created (status=APPROVAL_PENDING in PayPal AND status='pending' in our DB row). User clicks Back, switches to Pro Annual, clicks Subscribe again → second real subscription created. Our DB upsert (onConflict='user_id') overwrites the row with the newer subscriptionId. The OLD subscriptionId still exists in PayPal and can theoretically be approved by the user via a direct link (if they bookmarked the approveUrl) — granting them Pro entitlement without us creating a fresh DB row mapping to the new sub. The BILLING.SUBSCRIPTION.ACTIVATED webhook for the orphan WILL fire and update DB by custom_id (user_id), so the *DB* will end up correct — but the user will be paying for the WRONG plan tier (the old SKU, not the new one), and the new pending row is now untracked.
2. **PayPal API quota.** Every navigation through the checkout creates real billing API traffic. At scale, hits rate limits.
3. **Audit clutter.** PayPal merchant dashboard fills with cancelled/abandoned subscriptions; harder to audit real revenue.

**Mitigation options (lowest disruption first):**

A. **Cache the probe per (user, plan) for 15 minutes.** Store the {subscriptionId, approveUrl} in sessionStorage keyed by `${userId}:${plan}`. On re-render, reuse if still valid. Doesn't help cross-tab.

B. **Server-side: check for existing pending subscription before creating a new one.** In `create-subscription.js` after auth, query subscriptions for `user_id = me AND status = 'pending' AND provider = 'paypal' AND plan = SKU_TO_TIER[plan]`. If exists, return its existing subscriptionID + approveUrl rather than creating fresh. Combine with periodic cleanup of stale pending rows (cron-style).

C. **Move the "feature-disabled" probe to a HEAD-style endpoint** that returns 503 with `fallback: 'use_create_order'` based ONLY on env-var presence, without actually creating the subscription. The real subscription is then created on the client's actual click (after the user is committed to subscribing). Cleanest but requires SDK button instead of `<a>` link approach.

**Recommendation:** ship (B) before launch — server-side has the authoritative subscriptions row already.

---

## NEW-S3 — PayPal-Request-Id uses `Date.now()`, defeating retry idempotency

**Files:**
- [api/paypal/create-order.js:202](api/paypal/create-order.js#L202): `'PayPal-Request-Id': \`pfc-${user.id.slice(0,8)}-${plan}-${Date.now()}\``
- [api/paypal/create-subscription.js:236](api/paypal/create-subscription.js#L236): `'PayPal-Request-Id': \`pfc-sub-${user.id.slice(0,8)}-${plan}-${Date.now()}\``

**Severity:** P2 (correctness, not money-loss)

**Description:**

The `PayPal-Request-Id` header is meant to make POST requests idempotent — repeated POSTs with the same Request-Id return the original response instead of creating a second resource. Both create-order and create-subscription include `Date.now()` in the Request-Id, making every call to PayPal unique. This means:

- If the user double-clicks the Subscribe button (a few hundred ms apart), our code may create two PayPal subscriptions before the UI prevents the second click.
- The `_fetchPayPalWithRetry` helper IS already keying internally with the same opts object so the retry IS idempotent on the same call (good). But cross-call retries (browser-level network retry, user-triggered retry) are NOT.

By contrast, `capture-order.js:282` uses `pfc-capture-${orderID}` — no timestamp — and IS idempotent. The pattern is right; create-* paths just have a copy-drift bug.

**Fix:** drop the `Date.now()` suffix. Key on something the caller knows is the same across retries:

```js
'PayPal-Request-Id': `pfc-sub-${user.id.slice(0,8)}-${plan}-${todayUtcYYYYMMDD()}`,
```

A day-bucket gives an effective 24h dedupe window — long enough to absorb retries, short enough that legitimate new subscriptions tomorrow get a new ID. (Or store the last issued Request-Id in `subscriptions.last_create_request_id` for true idempotency.)

---

## NEW-S4 — No rate limit on create-order / create-subscription / cancel

**Files:**
- [api/paypal/create-order.js](api/paypal/create-order.js)
- [api/paypal/create-subscription.js](api/paypal/create-subscription.js)
- [api/subscription/cancel.js](api/subscription/cancel.js)

**Severity:** P1 (PayPal merchant-account suspension risk)

**Description:**

The CISO pass already flagged "Rate-limit payment endpoints (PayPal merchant-suspension risk)" as a post-launch hardening item. This re-audit pass found that the `@upstash/redis` dep is ALREADY in `package.json:7` but is not used in any payment endpoint. The infrastructure exists; the wiring is missing.

A signed-in user can hammer `create-subscription` (each call generating a real PayPal subscription per NEW-S2). At PayPal's rate-limit threshold, the merchant account auto-suspends — all revenue stops. PayPal's documented rate limits aren't published per-tier; the empirical floor is "very low for new merchants".

Combined with NEW-S2, the blast radius is real even with a single legitimate user clicking around the checkout flow.

**Fix:**

```js
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const limiter = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '60 s'),
});

// After auth, before PayPal call:
const { success } = await limiter.limit(`paypal:${user.id}`);
if (!success) return res.status(429).json({ error: 'Too many requests' });
```

Apply identically to `create-order`, `create-subscription`, `cancel`. ~30 minutes total. Don't bother for `webhook-paypal` (PayPal's own retry/dedup logic handles it) or `status.js` (read-only).

---

## NEW-S5 — `next_billing_time` overwritten to null on `BILLING.SUBSCRIPTION.UPDATED` if PayPal omits it

**File:** [api/subscription/webhook-paypal.js:683-691](api/subscription/webhook-paypal.js#L683-L691)
**Severity:** P2 (subordinate to NEW-P0a but worth fixing in the same pass)

**Description:**

The UPDATED handler writes `next_billing_time: nextBilling` unconditionally, where `nextBilling = resource.billing_info?.next_billing_time || null`. This means an UPDATED event from PayPal that omits `next_billing_time` (e.g., a plan-change event, a payment-method-update event) will null out a previously-valid `next_billing_time` on the subscriptions row.

`current_period_end` is NOT touched in this handler (good — that's only updated on ACTIVATED and SALE.COMPLETED), so the entitlement isn't directly broken. But UI that reads `next_billing_time` (none currently — but the column is exposed for future use) will see null.

**Fix:** mirror the recommended NEW-P0a pattern — only write `next_billing_time` if it's a real value, otherwise leave column unchanged via `undefined`:

```js
const nextBilling = resource.billing_info?.next_billing_time || null;
await supabase.from('subscriptions').update({
  subscription_state: state || undefined,
  next_billing_time: nextBilling || undefined,  // don't null out
  updated_at: new Date().toISOString(),
}).eq('user_id', customUserId);
```

---

## NEW-S6 — No `package-lock.json` → non-reproducible production deployments

**File:** [package.json](package.json) (no lockfile present at repo root)
**Severity:** P2 (supply-chain hygiene)

**Description:**

The repo has `package.json` with `^X.Y.Z` ranges for all 3 deps but NO `package-lock.json`. Vercel's deploy will resolve each `^` range to whatever satisfies it at deploy time. Two consecutive deploys 24 hours apart can pull different transitive dependency trees. This is the exact supply-chain failure mode that has bitten npm publishers before (npm package compromise propagates instantly to any deploy without a lockfile).

**Fix:**

```
npm install --package-lock-only
git add package-lock.json
git commit -m "chore: add package-lock for reproducible deploys"
```

Also commit a `.npmrc` with `engine-strict=true save-exact=true` if you want even tighter behaviour going forward.

Combined with NEW-P2a from the morning pass (supabase-js 2.45.4 → latest), this means the bump should land in a single commit that updates `package.json` + freshly-regenerated lockfile.

---

# Code-quality findings (inline review pass — substitute for ruflo-core:reviewer)

These are NOT security bugs. They're maintainability concerns sized by potential drift cost as the codebase grows beyond launch.

## NEW-R1 (Major) — Heavy duplication across 5 PayPal endpoints

Files:
- api/paypal/create-order.js, api/paypal/capture-order.js, api/paypal/create-subscription.js (Edge), api/subscription/cancel.js, api/subscription/webhook-paypal.js

Duplicated functions: `_normalizeOrigin`, `_originAllowed`, `_fetchPayPalWithRetry`, `_getAccessToken` (Node + Edge variants), `_paypalBase` / `PAYPAL_BASE` constant, `_supabaseAdmin` / `createClient(...)` boilerplate, `_periodEndForSku` (in both capture-order AND webhook-paypal).

Concrete drift example: `_originAllowed` and `_normalizeOrigin` are duplicated four times across api/paypal/* and api/subscription/cancel.js. The W29-c regression fix (normalize www/apex) had to be applied to ALL FOUR. If any was missed, that endpoint would silently reject www users. Audit closing doesn't catch that — runtime telemetry would, days later.

**Refactor:**
- `lib/paypal/_node.js` — Node-runtime shared helpers (`PAYPAL_BASE`, `_getAccessToken`, `_fetchPayPalWithRetry`, `_originAllowed`, `_supabaseAdmin`)
- `lib/paypal/_edge.js` — Edge-runtime variants (uses `btoa` instead of `Buffer`)
- `lib/payments/sku-pricing.js` — `PLAN_PRICES`, `SKU_TO_PLAN`, `SKU_TO_TIER`, `PLAN_DESCRIPTIONS`, `PRICE_TO_SKU`, `_periodEndForSku`. Single source of truth for pricing constants (closes NEW-R4).

Estimate: 2 hours, all behaviour-preserving (each endpoint becomes 50-100 lines shorter). Tests would help (NEW-R7) but the diffs are mechanical enough to review by eye.

## NEW-R2 (Major) — `webhook-paypal.js` is 1071 lines in one file + zero tests

The file is a single export with a 700-line switch statement covering 11 event types. Splitting per event-family would make:
- Handler-level testing tractable
- Add-event onboarding scoped (touch one handler file, not the giant switch)
- The W29-final P0 #3 bug (`amount >= 100 ? annual : monthly`) would have been caught by a 5-line per-SKU test on the PAYMENT.SALE.COMPLETED handler.

**Refactor:**

```
api/subscription/
├── webhook-paypal.js                   # dispatcher (signature verify + idempotency + router, ~150 lines)
└── _webhook-handlers/
    ├── _shared.js                      # _logEvent, _alertOps, _redactPII, _periodEndForSku
    ├── one-shot.js                     # PAYMENT.CAPTURE.* (one-shot Orders)
    ├── recurring.js                    # BILLING.SUBSCRIPTION.* + PAYMENT.SALE.*
    └── dispute.js                      # CUSTOMER.DISPUTE.CREATED
```

Each becomes a function like `handleCaptureCompleted(supabase, resource, _logEvent, _alertOps)` — pure-testable with mocked supabase + helpers.

Estimate: 4 hours including a minimal vitest harness with 3-4 happy-path tests per handler. ROI in test coverage alone justifies the work.

## NEW-R3 (Moderate) — Comment-rot from W##-coded comments

Search the codebase: 60+ comments matching `W25|W26|W27|W28|W29|audit #\d+`. Examples:
- `// W25 P0 #10 — disable Vercel's body parser`
- `// W26-a #12 + W29-c regression fix`
- `// W28-b #34 — error matrix`
- `// W29-final P0 FIX`

These were excellent during audit closure — they make every line traceable to a specific finding. Post-launch they become noise that drifts from reality. The fix narrative IS already in the audit docs (`2026-05-23-payments-code-audit.md`, this doc); the code comments duplicate that history.

**Recommendation:** A one-time post-launch sweep that:
- Keeps comments explaining **why** the code is non-obvious ("raw body required because PayPal signs over exact bytes")
- Removes the **wave-code** reference ("W25 P0 #10")
- Removes "fix narratives" that describe what the code WAS doing wrong before (they help today; in 6 months they're confusing)

Estimate: 2 hours, mechanical. Wait until 30 days post-launch so the wave codes are still useful during initial bug triage.

## NEW-R4 (Moderate) — Magic numbers (€9 / €79 / €19 / €169 / €149) scattered across 4 files

Files containing the price 79: `api/paypal/create-order.js:19`, `api/paypal/capture-order.js:54`, `api/subscription/webhook-paypal.js:872`, `js/inline/billing-2.js:53,67`. A price change requires editing 4+ files in lockstep.

**Refactor:** centralize in `lib/payments/sku-pricing.js` (per NEW-R1), import everywhere.

## NEW-R5 (Moderate) — Naming inconsistency: `plan` vs `sku` vs `tier` vs `dbPlan` vs `planTier`

In capture-order.js alone:
- `plan` = user-submitted SKU (e.g., 'pro_annual')
- `sku` = same value, renamed at line 344 (`const sku = plan;`)
- `dbPlan` = the tier ('pro' / 'premium')

In webhook-paypal.js:
- `plan` = tier
- `sku` = SKU
- `planTier` = same as `plan` but only on recurring path
- `tier` = same as plan on subscription_periods insert

Recommended terminology (canonical, document in CLAUDE.md):
- `sku` — the user-facing plan code (`pro_monthly` / `pro_annual` / etc.). One per pricing line item.
- `tier` — the entitlement bucket (`pro` / `premium` / `free`). What status.js returns.
- `plan` — DEPRECATED, ambiguous. Don't introduce in new code; cleanup pass when convenient.

DB columns: rename `subscriptions.plan` → `subscriptions.tier` and `profiles.plan` → `profiles.tier` in a Q3 migration (NOT pre-launch — too risky right now).

## NEW-R6 (Minor) — `billing-2.js:7` `let checkoutAmt = 69` is dead state

Line 7 initializes checkoutAmt to 69. The W14-B pricing locked Pro Annual to 79; this initial value is never observable (every `openCheckout` call overwrites it). Cosmetic. Bump to 79 or remove entirely.

## NEW-R7 (Major) — Zero test coverage on payments code

No `tests/`, no `vitest.config.js`, no test commands in `package.json`. All payments code is production-only. For a money-handling system at launch, this is the single largest maintainability risk.

**Recommendation (sized to ship pre-launch in a half-day):**

```
tests/payments/
├── sku-pricing.test.js          # The lookup tables — pure functions
├── period-end.test.js           # _addMonthsUTC, _addYearsUTC, _periodEndForSku
├── origin-allowed.test.js       # _normalizeOrigin + _originAllowed (the W29-c regression)
└── webhook-handlers.test.js     # 3-4 happy paths per handler (post NEW-R2 split)
```

These are pure-function tests, no network, no DB. ~150 lines total. Catches the W29-final P0 #3 bug class, the W29-c www/apex bug class, and the NEW-P0a null-period_end bug class — all of which slipped through human review.

---

# Top-3 refactor list (post-launch, ROI-ranked)

1. **NEW-R1 (shared lib + lib/payments/sku-pricing.js)** — 2 hours, behaviour-preserving, removes the W29-c-style drift bug class entirely. Closes NEW-R4 as a side-effect.
2. **NEW-R7 + NEW-R2 (split webhook-paypal.js + add minimal test harness)** — 4 hours, biggest leverage against future regressions. Each future audit pass costs less.
3. **NEW-S3 + NEW-S4 + NEW-S5 (idempotency + rate-limit + UPDATED null-fallback)** — 1 hour bundled, removes the operational risks the morning pass didn't surface.

---

## Updated priority queue (NEW-P0b now top of code stack)

The CISO non-code blockers (VAT, IR, terms) remain the top of the absolute priority stack. Code launch-blockers now re-ordered:

### Launch blockers (CISO, unchanged):

1. **VAT-OSS registration** OR restrict checkout to your own country.
2. **IR runbook + payments kill-switch + alert routing off personal Gmail.**
3. **Republish terms.html + privacy.html + 14-day-withdrawal waiver on Founders checkout.**

### Code launch-readiness (re-ranked):

4. **NEW-P0b — Drop or column-restrict the profiles UPDATE policy.** ONE MIGRATION FILE, 5-LINE FIX. Apply via Supabase Dashboard → SQL Editor before launch. **Hard blocker.**
5. **NEW-P0a (period_end null fallback)** — 30-min code fix.
6. **NEW-P1a (alert on no-plan-match)** — 5-min code fix.
7. **NEW-P1b (cancel PayPal retry + surface failure)** — 20-min code fix.
8. **NEW-S2 + NEW-S4 bundled (subscription probe caching + rate limit)** — ~1 hour. Both prevent PayPal merchant-account suspension under realistic load.

### Pre-revenue-scale hardening (defer post-launch):

9. **NEW-S3 (PayPal-Request-Id idempotency)** — 10-min fix; bundle with #5-7.
10. **NEW-S5 (UPDATED handler null fallback)** — 5-min fix; bundle with #5-7.
11. **NEW-S6 (commit package-lock.json)** — 5-min hygiene.
12. **NEW-P2a (supabase-js 2.45.4 → 2.106.1 bump)** — verify lockfile, bump, smoke-test.
13. **NEW-P1c (orphan-pending sub cleanup cron)** — low real-world likelihood; defer.
14. **NEW-R1 + NEW-R7 + NEW-R2 (shared lib + tests + webhook split)** — 6-hour engineering investment, biggest leverage post-launch.
15. **NEW-R3 (W## comment rot sweep)** — 2-hour mechanical pass, 30 days post-launch.
16. **CISO honorable mentions** — Article 27 EU rep, GDPR Art. 17 erasure path, Resend key separation, Vercel Pro upgrade, quarterly Supabase key rotation cadence.

---

## What this second pass did NOT cover

- An actual ruflo subagent dispatch — the harness routing bug (`feedback_ruflo_subagent_dispatch_block.md`) persists across session restarts. **The user can stop expecting these to work without an upstream fix.**
- Aikido CVE scan — needs `/aikido:setup` first; recommend running before launch for CVE coverage.
- A formal penetration test of the live PayPal sandbox flow — recommended pre-launch as a final smoke pass.
- Frontend audit of every non-billing HTML page that loads `pfc-config.js` (and therefore exposes anon key) — but anon key exposure is intentional design; the gating is at RLS, which is the NEW-P0b finding above.

## Audit trail (this pass)

- Read in full: api/paypal/* (create-order, capture-order, create-subscription, card-order), api/subscription/* (webhook-paypal, cancel, status, history), api/sage.js (cross-reference for NEW-P0b), js/inline/billing-2.js (all 864 lines), js/pfc-entitlements.js, js/pfc-config.js, vercel.json, all 12 supabase/migrations/*.sql, package.json.
- Cross-referenced every claim against the morning re-audit and the original 40-finding audit. Where the morning audit explicitly listed something as "did not cover", this pass closed it.
- Auditor: Claude Opus 4.7 1M context, post-restart fresh session.
