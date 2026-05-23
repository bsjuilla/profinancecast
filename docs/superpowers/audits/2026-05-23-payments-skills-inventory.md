# Payments Skills Inventory — ProFinanceCast Audit

**Date:** 2026-05-23
**Scope:** Map available skills to payments audit needs (security, vulnerability testing, debugging, threat modeling, PCI compliance, webhook hardening).

## Skill Triage Table

| Skill | Bucket | When to fire |
|---|---|---|
| `security-review` (built-in) | MUST INVOKE | Run FIRST on the payments diff/branch to baseline correctness + auth bugs in checkout, webhook handlers, refund flows. |
| `ruflo-security-audit:audit` | MUST INVOKE | Run immediately after `security-review` for project-wide vulnerability sweep (deps, secrets, config) before going deep on flows. |
| `ruflo-security-audit:security-scan` | MUST INVOKE | Pair with `audit` — targeted scan of `/api/webhooks/*`, Stripe handlers, checkout routes for OWASP/injection patterns. |
| `ruflo-security-audit:dependency-check` | MUST INVOKE | Run early — confirm Stripe SDK, signature-verification libs, crypto libs are not on CVE list before trusting their output. |
| `aikido:scan` | MUST INVOKE | Secondary SAST pass after Ruflo — cross-check findings, catches different patterns (especially secret leakage in webhook logs). |
| `engineering-advanced-skills:skill-security-auditor` | MUST INVOKE | Threat-model the payments surface (auth bypass, replay, idempotency, signature spoof) BEFORE writing fixes — informs what to test. |
| `code-review` (built-in) | MUST INVOKE | After security passes, run on payments diff at `--effort high` to catch logic bugs (currency rounding, race conditions on refund/charge). |
| `systematic-debugging` | MUST INVOKE | Fire whenever a payment-flow bug is reproduced — enforces hypothesis/binary-search discipline instead of guess-patching live money paths. |
| `debugging-wizard` | MUST INVOKE | Use for webhook-delivery failures and Stripe event replay debugging where stack traces are async/multi-service. |
| `verify` / `verification-before-completion` | MUST INVOKE | Gate every payments fix — actually replay the webhook / hit the endpoint with test card, do not trust unit tests alone. |
| `c-level-agents:ciso-review` | MUST INVOKE | After technical audit completes — CISO lens on PCI scope, residual risk, audit-log gaps, incident-response readiness. |
| `using-superpowers` | MUST INVOKE | Invoke at session start so the audit agent actually chains the other skills instead of free-styling. |
| `pair-programming` | SHOULD CONSIDER | For complex webhook signature/idempotency rewrites where two-pass reasoning helps. |
| `test-driven-development` | SHOULD CONSIDER | If patching reveals missing tests around refund/partial-capture/3DS edge cases. |
| `engineering-advanced-skills:api-test-suite-builder` | SHOULD CONSIDER | Build regression suite for webhook endpoints once threat model is mapped. |
| `engineering-advanced-skills:env-secrets-manager` / `secrets-vault-manager` | SHOULD CONSIDER | If audit finds Stripe keys in env or logs — rotate + vault them. |
| `engineering-advanced-skills:observability-designer` | SHOULD CONSIDER | If audit reveals webhook failures are invisible — design logging/alerting for payment events. |
| `eng-runbook` / `runbook-generator` | SHOULD CONSIDER | Produce on-call runbook for Stripe outages, disputed charges, webhook backlogs after audit. |
| `webapp-testing` / `playwright-skill` | SHOULD CONSIDER | E2E test the checkout UI against trust-signal/CSRF expectations. |
| `claude-api` | SHOULD CONSIDER | Only if payments code calls Anthropic SDK (unlikely — skip unless found). |
| `writing-plans` | SHOULD CONSIDER | If audit produces a multi-week remediation roadmap. |
| All `html-ppt-*`, `zhangzara-*`, `marketing-skills:*`, `image`, `video`, `social-*`, `ad-creative`, `banner-design`, `dating-web`, `pricing-page`, deck/slide templates, `algorithmic-art`, `canvas-design`, `kami-*`, brand/CIP/logo skills, `c-level-skills:cmo-*`, `cro-*`, `cfo-*` (non-CISO) | N/A | Marketing, design, presentation, growth — irrelevant to a payments security audit. |

## Synthesis — Recommended Invocation Sequence

The payments audit should fire skills in this order:

1. `using-superpowers` (set discipline)
2. `engineering-advanced-skills:skill-security-auditor` (threat model first — know what to look for)
3. `ruflo-security-audit:dependency-check` -> `ruflo-security-audit:audit` -> `ruflo-security-audit:security-scan` -> `aikido:scan` (broad-to-narrow SAST)
4. `security-review` -> `code-review --effort high` (manual + LLM review of payments diff)
5. `systematic-debugging` / `debugging-wizard` (only when a real bug surfaces — not pre-emptively)
6. `verify` / `verification-before-completion` (gate every single fix against a replayed webhook or test charge)
7. `c-level-agents:ciso-review` (close out: PCI scope, residual risk, IR readiness)

Everything else (marketing, design, deck/template skills) is N/A and should be ignored for this audit.
