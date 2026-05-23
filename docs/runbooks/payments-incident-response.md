# Payments Incident Response Runbook

**Owner:** business060407@gmail.com (solo founder; sole on-call)
**Service:** ProFinanceCast payments (PayPal Orders + Billing Subscriptions on Vercel + Supabase)
**Last reviewed:** 2026-05-23
**Review cadence:** quarterly, or after any incident

> **First action in any incident: kill the payment intake before diagnosing.**
> One env var (`PAYMENTS_DISABLED=true` in Vercel → redeploy) stops new orders + subscriptions in ~60s. Diagnose with the bleeding stopped.

---

## Quick-reference dashboard

| Surface | URL / location |
|---|---|
| Vercel project | https://vercel.com/business060407s-projects/profinancecast |
| Vercel function logs | Vercel → project → Logs (last 1h tail by default) |
| Supabase dashboard | https://supabase.com/dashboard/project/hmopwxjkxqvubkifplnk |
| Supabase SQL editor | dashboard → SQL Editor |
| PayPal merchant dashboard | https://www.paypal.com/businessmanage (live) |
| PayPal developer dashboard | https://developer.paypal.com/dashboard (sandbox + webhook config) |
| Resend dashboard (alert delivery) | https://resend.com/emails |
| Alert mailbox | business060407@gmail.com (see post-launch TODO to split) |

---

## 0 — Universal first actions (do these BEFORE diagnosis, every incident)

```
[ ] 1. Enable kill switch
       Vercel → project → Settings → Environment Variables
       Add or set: PAYMENTS_DISABLED=true (Production)
       Trigger redeploy: vercel --prod  (or push an empty commit)
       Verify: curl -X POST https://profinancecast.com/api/paypal/create-order
              Expect: 503 { "maintenance": true }

[ ] 2. Open Vercel function logs in a tab and start tailing
       Vercel → project → Logs → Filter "api/paypal" + "api/subscription"

[ ] 3. Open Supabase SQL editor in a tab and run the triage query:
       SELECT created_at, event_type, user_id, provider_id, amount, currency
         FROM public.subscription_events
        ORDER BY created_at DESC LIMIT 50;

[ ] 4. Start an incident note (paste into a Google Doc or git commit body):
       - When you noticed
       - What triggered the alert
       - What you've changed so far (live edit as you go)
```

**Kill-switch impact:** new orders + new subscriptions return 503. Existing webhooks, status checks, cancellations, billing history, and entitlement reads all continue working — paid users are not affected.

---

## Scenario A — Suspected Supabase service-role key leak

**Indicators:** unexpected status='active' rows in subscriptions, unexplained quota changes in profiles, unexpected subscription_events entries, or a literal disclosure (key seen in a log paste, GitHub gist, Vercel build log).

**Time-to-revoke target: < 15 minutes**

```
[ ] 1. Enable PAYMENTS_DISABLED kill switch (universal step 1 above).

[ ] 2. Supabase Dashboard → Settings → API → 'service_role' → Regenerate
       Copy the new key (you only see it once — paste into 1Password first).

[ ] 3. Vercel → Settings → Environment Variables → SUPABASE_SERVICE_ROLE_KEY
       Edit → paste new key → Save → Redeploy (Production).

       Verify: curl https://profinancecast.com/api/subscription/status \
                 -H "Authorization: Bearer <valid-test-jwt>"
              Expect: 200 with plan in response (not 503).

[ ] 4. Audit recent writes for tampering. Run in Supabase SQL editor:

       SELECT user_id, plan, status, ai_queries_used, ai_queries_limit, updated_at
         FROM public.profiles
        WHERE updated_at > now() - INTERVAL '24 hours'
          AND (plan != 'free' OR ai_queries_limit > 10)
        ORDER BY updated_at DESC;

       SELECT user_id, plan, status, provider_capture_id, current_period_end, updated_at
         FROM public.subscriptions
        WHERE updated_at > now() - INTERVAL '24 hours'
        ORDER BY updated_at DESC;

       Any row you don't recognize as legitimate user activity → next step.

[ ] 5. If you find unauthorized escalations:
       - Revert by recomputing from authoritative source (PayPal capture history)
       - Email each affected user a heads-up (transparency builds trust)
       - Document the row IDs in the incident note

[ ] 6. Re-enable payments:
       Vercel env → PAYMENTS_DISABLED=false (or delete the variable) → redeploy
       Verify: curl -X POST https://profinancecast.com/api/paypal/create-order
              Expect: 401 (no auth) or 400 (missing body), NOT 503.

[ ] 7. Postmortem within 7 days. Update this runbook with anything you learned.
```

---

## Scenario B — PayPal account anomaly

**Indicators:** PayPal merchant-risk email; unexpected dispute spike (CUSTOMER.DISPUTE.CREATED webhooks); funds put on 21-day hold; webhook ID changed without your action; statement descriptor changed; account temporarily suspended.

```
[ ] 1. Enable PAYMENTS_DISABLED kill switch.

[ ] 2. Contact PayPal Merchant Risk team:
       https://www.paypal.com/businessmanage/account/resolutionCenter
       Phone (US): 1-888-221-1161   (EU varies by country)
       Have ready: merchant ID, recent transaction IDs, your business email.

[ ] 3. Rotate PayPal credentials:
       - PayPal Settings → Security → Login Password → change
       - Settings → 2FA → regenerate backup codes (revoke any older ones)
       - Developer Dashboard → My Apps → ProFinanceCast app → rotate Client Secret
       - Update Vercel env: PAYPAL_CLIENT_SECRET → redeploy.

[ ] 4. Verify webhook config still points to your URL:
       Developer Dashboard → Webhooks → confirm:
         URL = https://profinancecast.com/api/subscription/webhook-paypal
         Events subscribed = 13 (per docs/handoff/2026-05-23-payments-launch-state.md § C)
       If changed by an attacker, restore + rotate.

[ ] 5. Check for unauthorized refunds in PayPal Activity → Refunds (last 30 days).
       Cross-reference against your subscriptions / subscription_events.

[ ] 6. Re-enable payments only after PayPal confirms account in good standing.
```

---

## Scenario C — Webhook flood / card-testing attack

**Indicators:** sudden burst of `PAYMENT.CAPTURE.COMPLETED` webhooks (Vercel logs), sharp rise in PayPal disputes within an hour, capture amounts you've never seen, lots of `webhook_unresolvable_user` rows in subscription_events.

```
[ ] 1. Enable PAYMENTS_DISABLED kill switch IMMEDIATELY.
       This stops the attacker from minting more orders/subs.
       Existing in-flight webhooks continue; that's fine — they're now
       inert because no new captures can be made.

[ ] 2. Find the attacker fingerprint. In Vercel logs (last 1h):
       - Look for repeated POSTs to /api/paypal/create-order from the same IP
       - Or repeated unique reference_ids in subscription_events
       - Or a burst of new user signups followed by immediate purchases

[ ] 3. If IP-based:
       - Vercel Hobby has NO firewall — you must upgrade to Pro ($20/mo) for IP block
       - OR: deploy a Vercel Middleware that returns 403 for the IP range
       - Detailed code sketch at the end of this runbook (§ Appendix A)

[ ] 4. Audit financial impact:
       SELECT user_id, COUNT(*), SUM(amount), array_agg(provider_id)
         FROM public.subscription_events
        WHERE event_type = 'webhook_capture_completed'
          AND created_at > now() - INTERVAL '4 hours'
        GROUP BY user_id
       HAVING COUNT(*) > 3
        ORDER BY COUNT(*) DESC;

[ ] 5. Issue refunds for any disputed/fraudulent captures via PayPal dashboard.
       Or wait for dispute resolution if you can identify the legit transactions.

[ ] 6. Document the attacker pattern in this runbook so next attack is faster.

[ ] 7. Re-enable payments + monitor closely for 24h before declaring resolved.
```

---

## Scenario D — Suspected data breach (Supabase exposure)

**Indicators:** confirmed unauthorized access to Supabase project; database dump posted publicly; auth.users data showing on a paste site; Supabase notifies you of a security event.

**GDPR clock starts at AWARENESS, not at confirmation. 72-hour notification window.**

```
[ ] 1. Enable PAYMENTS_DISABLED kill switch.

[ ] 2. Note exact timestamp of awareness in your incident log. This is t=0
       for the 72-hour GDPR clock.

[ ] 3. Contain:
       - Rotate SUPABASE_SERVICE_ROLE_KEY (Scenario A steps 2-3)
       - Rotate SUPABASE_ANON_KEY: Supabase → Settings → API → regenerate
         → update Vercel env SUPABASE_ANON_KEY → redeploy
         → Also update js/pfc-config.js:46 since that's the client-shipped value
       - If you suspect database-level breach: Supabase → Settings → restore from
         backup to pre-breach point, then replay any legitimate writes
         (subscription_events is your audit trail).

[ ] 4. Assess scope:
       - Read Supabase audit logs (Settings → Audit Logs)
       - Determine which tables were accessed
       - Determine which users were affected
       - Document in incident log

[ ] 5. Notify (GDPR Art. 33 + 34):
       a. Supervisory authority of country of main establishment.
          If you're EU-based: ICO (UK) / CNIL (FR) / IDPC (IE) / etc.
          Online breach reporting forms — typically a 1-hour form fill.
          (Confirm jurisdiction with legal counsel — see also CISO § 1 about
          Article 27 EU representative.)
       b. Affected users (Art. 34) "without undue delay".
          Email template starting point:
            "We're writing to inform you of a security incident we identified
             on <DATE> in our systems at ProFinanceCast. [What was accessed].
             [What we've done]. [What you can do]. We are sorry."

[ ] 6. Engage outside counsel BEFORE public statement. (CISO flagged: no
       counsel currently retained — pre-launch TODO.)

[ ] 7. Postmortem in 7 days; publish summary on a status page (build one if not
       yet — even a single static page is enough for transparency).
```

---

## Scenario E — Suspected payment-state corruption (no breach, just a bug)

**Indicators:** a user reports "I paid but I'm still Free" or "I cancelled but I'm being charged"; an alert from `_alertOps` fires.

```
[ ] 1. DO NOT enable PAYMENTS_DISABLED — this is a single-user issue, not a
       systemic incident. Other users should continue paying.

[ ] 2. Identify the user:
       - Get their email from the support message
       - Look up user_id:
         SELECT id, email, email_confirmed_at FROM auth.users WHERE email = '<them>';

[ ] 3. Pull their state:
       SELECT * FROM public.subscriptions WHERE user_id = '<their-id>';
       SELECT * FROM public.profiles WHERE id = '<their-id>';
       SELECT * FROM public.subscription_events
        WHERE user_id = '<their-id>' ORDER BY created_at DESC LIMIT 20;
       SELECT * FROM public.subscription_periods
        WHERE user_id = '<their-id>' ORDER BY period_start DESC LIMIT 10;

[ ] 4. Cross-reference with PayPal:
       PayPal dashboard → Activity → search by user's email or capture/sub ID

[ ] 5. Reconcile:
       - If they paid and we have the row but status is wrong:
         Manually upsert via SQL editor.
       - If they paid and we have NO row: capture-order.js failed; manually
         create the subscriptions + subscription_periods rows from PayPal data.
       - If they cancelled and we still have status='active': run cancel.js
         logic manually OR cancel via PayPal then wait for the webhook.

[ ] 6. Email the user once their state is fixed. Confirm the date they can
       expect access through. Apologize.

[ ] 7. If the same bug class hits a second user, escalate to systemic
       (treat as Scenario A or C depending on shape).
```

---

## Scenario F — Vercel function quota hit

**Indicators:** Vercel dashboard shows function invocations approaching Hobby limits; 503s in production for `api/*` routes; sudden burst of traffic from a viral moment.

```
[ ] 1. Check current quota:
       Vercel → project → Settings → Usage
       Hobby plan limits: 100GB-hours/mo, 100 function deploys/day,
                          12 Node serverless functions max

[ ] 2. If you're at the 12-function cap: any new function deploy fails.
       Audit: api/*.js (Node) + count. Edge functions don't count.

[ ] 3. If traffic-based:
       - Upgrade to Pro ($20/mo) for higher quotas + IP firewall
       - Or temporarily enable PAYMENTS_DISABLED to shed load if it's
         specifically the payment endpoints that are overwhelmed

[ ] 4. Cache status.js heavier if read-side is the bottleneck:
       - Currently 30s cache in client (pfc-entitlements.js)
       - Could push to 5min if needed; webhook will catch downgrades faster
```

---

## Health-check checklist (run after ANY scenario, before declaring resolved)

```
[ ] Login + sign-up:  https://profinancecast.com/auth.html
[ ] Status endpoint:  GET /api/subscription/status with a known user JWT → 200
[ ] Create-order:     POST /api/paypal/create-order with a test user → orderID
                      (with PAYMENTS_DISABLED=false)
[ ] Cancel:           POST /api/subscription/cancel → ok=true, no
                      paypal_cancel_failed flag
[ ] Webhook:          (Optional) fire a PayPal sandbox event → 200 received
[ ] Founders count:   GET /api/founders-claimed → claimed count matches reality
[ ] Sage AI:          POST /api/sage with a Pro user JWT → 200 response

If all 7 pass, declare incident resolved. Email yourself a 1-line summary.
```

---

## Appendix A — Vercel middleware IP block (Hobby-friendly)

```ts
// middleware.ts — placed at repo root for Vercel to pick up.
import { NextResponse } from 'next/server';

const BLOCKED_IPS = new Set([
  // populated during incident response — keep this empty by default
]);

export function middleware(req) {
  const ip = req.ip || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (ip && BLOCKED_IPS.has(ip)) {
    return new Response('Forbidden', { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/paypal/:path*', '/api/subscription/:path*'],
};
```

> **NOTE:** This static project doesn't currently use Next.js. The middleware
> only kicks in on `/api/*` paths if Vercel's middleware runtime is enabled
> for the project (which it is for any `api/` deploy). To deploy: add the
> file at repo root, list affected IPs in `BLOCKED_IPS`, redeploy.

---

## Appendix B — Resend alert pipeline verification

Run this dummy alert from `~/profinancecast-audit/profinancecast` (or any
Node REPL with the env vars set):

```bash
node -e '
fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    "Authorization": "Bearer " + process.env.RESEND_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    from: process.env.ALERT_FROM_EMAIL,
    to: [process.env.ALERT_EMAIL],
    subject: "[PFC alerts] runbook smoke test",
    text: "If you see this, your alert pipeline works.",
  }),
}).then(r => r.text()).then(console.log)
'
```

Expect: response JSON with `id`. Check inbox. If you don't get the email
within 60s, alert delivery is broken — fix BEFORE next incident.

---

## Maintenance

- Re-run the health-check checklist quarterly even when there's no incident.
- After each real incident: update the relevant scenario with anything you
  learned. The runbook should grow over time.
- Drill at least once: deliberately set PAYMENTS_DISABLED=true on a Sunday
  morning, watch what happens, recover. The first time should not be during
  a real fire.

## See also

- [docs/handoff/2026-05-23-payments-launch-state.md](../handoff/2026-05-23-payments-launch-state.md) — full state of payments system
- [docs/superpowers/audits/2026-05-23-payments-reaudit.md](../superpowers/audits/2026-05-23-payments-reaudit.md) — open findings + CISO launch-blockers
- [docs/superpowers/audits/poc/NEW-P0b-rls-quota-escalation.js](../superpowers/audits/poc/NEW-P0b-rls-quota-escalation.js) — PoC for the RLS escalation fixed by 20260523_profiles_update_policy_tighten.sql
