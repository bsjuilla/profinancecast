# Runbook · Vercel Rollback
**Last updated:** 2026-05-21 · **Tested on:** Vercel dashboard (May 2026 UI)

When prod breaks and you need to get back to a known-good state in **under
5 minutes** without a code change. Vercel keeps the last ~100 deployments;
any of them can be promoted to prod with one click.

## Decision tree

1. **Can you reproduce the bug locally?**
   - YES → fix in code, commit, push. Don't roll back.
   - NO → roll back, THEN diagnose without the meter running.
2. **Is the bug user-visible right now (not just in logs)?**
   - YES → roll back first, post-mortem later. Aim for MTTR < 5 min.
   - NO → finish your current task; investigate when you can context-switch.

## Steps — Vercel Dashboard (1-click rollback)

1. Open https://vercel.com/dashboard
2. Click the **ProFinanceCast** project tile
3. Sidebar → **Deployments**
4. Scroll the deployment list. The current live deployment shows a
   **green "Current"** badge. The deployment immediately below it (or any
   green "Ready" deployment further down) is your rollback candidate.
5. Click the **⋯** menu on the candidate row → **Promote to Production**
6. Confirm. Vercel switches the production alias to the older deployment
   in ~10-15 seconds. No build runs (the artifact already exists).
7. Hard-refresh `Ctrl+Shift+R` on `https://profinancecast.com` to confirm.

## Steps — Vercel CLI (if dashboard is slow)

```
npm i -g vercel
vercel login           # paste OTP from email
vercel ls profinancecast --limit 10
# pick the deployment URL ending in .vercel.app
vercel promote https://profinancecast-<old-sha>.vercel.app --scope <team>
```

The `vercel promote` command does the same thing as the dashboard's
"Promote to Production" button.

## Verifying the rollback

1. **Status page**: `curl -I https://profinancecast.com` — expect HTTP 200.
2. **CSP**: `curl -sI https://profinancecast.com | grep -i content-security` —
   expect the long allowlist string. If it returns Vercel's default CSP
   instead of ours, the rollback hit a deployment before CSP hardening.
3. **API**: `curl -s https://profinancecast.com/api/audit-login?_ok=1 -o /dev/null -w '%{http_code}\n'`
   — expect 302 (new split-cookie code) or 403 (older code; auth still
   works but cookies aren't split — still acceptable for emergency rollback).
4. **Sentry**: open the project's Sentry, confirm error volume drops to
   pre-incident baseline within 5 minutes of the rollback.

## After the rollback — write the incident note

Save to `docs/runbooks/incidents/YYYY-MM-DD-<short-name>.md` with:

- **Symptom**: what the user / observability tool saw.
- **Trigger**: which commit introduced it (use `git log --oneline -20`).
- **Detection lag**: time from deploy → user-visible symptom.
- **Recovery lag**: time from detection → rollback live.
- **Root cause**: one sentence.
- **Fix**: link to the PR / commit that ships the real fix.
- **Prevention**: how this would have been caught earlier
  (e.g. "would have been caught by visual-regression CI" — VPE Wave-2 item).

## What rollback does NOT undo

- **Database / Supabase migrations**: structural changes to tables, RLS
  policies, or stored procedures persist across deploys. Roll those back
  separately via the Supabase dashboard.
- **Env var changes**: rotated secrets stay rotated. If you need to
  un-rotate `AUDIT_BYPASS_TOKEN`, do it in the Vercel Environment
  Variables panel.
- **External webhook state**: PayPal, Plausible, Sentry continue to
  receive events at their current configured endpoints.

## Escalation contacts

- Vercel support: https://vercel.com/help (Pro plan = 1-business-day SLA;
  Hobby plan = community only — escalate to status.vercel.com for outages).
- Supabase support: https://supabase.com/support (Pro plan = 24h SLA).
- DNS / domain registrar: as configured in `vercel.json` `domains` setting.

## Related

- [Vercel rollback docs](https://vercel.com/docs/deployments/managing-deployments#promoting-a-deployment-to-production)
- [Synthesis ranked queue](../superpowers/audits/2026-05-21-synthesis-ranked-queue.md) — see VPE recommendation #4 (visual-regression CI to prevent the bugs that drive rollbacks).
