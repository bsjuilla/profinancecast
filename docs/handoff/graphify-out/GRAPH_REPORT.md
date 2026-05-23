# Graph Report - payments-corpus  (2026-05-23)

## Corpus Check
- Corpus is ~26,847 words - fits in a single context window. You may not need a graph.

## Summary
- 135 nodes · 201 edges · 21 communities (15 shown, 6 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_W29-Final P0 Cluster (recurring sub bugs)|W29-Final P0 Cluster (recurring sub bugs)]]
- [[_COMMUNITY_capture-order.js Internals|capture-order.js Internals]]
- [[_COMMUNITY_W26 Defense-in-Depth P0s|W26 Defense-in-Depth P0s]]
- [[_COMMUNITY_create-subscription.js Internals|create-subscription.js Internals]]
- [[_COMMUNITY_webhook-paypal.js Helpers|webhook-paypal.js Helpers]]
- [[_COMMUNITY_create-order.js Internals|create-order.js Internals]]
- [[_COMMUNITY_history.js (Edge Runtime)|history.js (Edge Runtime)]]
- [[_COMMUNITY_cancel.js (Local + PayPal Cancel)|cancel.js (Local + PayPal Cancel)]]
- [[_COMMUNITY_W25 Money-Loss Trio|W25 Money-Loss Trio]]
- [[_COMMUNITY_Refund + Replay Defense|Refund + Replay Defense]]
- [[_COMMUNITY_status.js Contract + P1 Fixes|status.js Contract + P1 Fixes]]
- [[_COMMUNITY_status.js Internals|status.js Internals]]
- [[_COMMUNITY_Migration Files|Migration Files]]
- [[_COMMUNITY_PayPal External System|PayPal External System]]
- [[_COMMUNITY_Subscription Plans Catalog|Subscription Plans Catalog]]
- [[_COMMUNITY_Webhook Event Handlers|Webhook Event Handlers]]
- [[_COMMUNITY_Origin Normalization|Origin Normalization]]
- [[_COMMUNITY_Founders Atomic Cap System|Founders Atomic Cap System]]
- [[_COMMUNITY_Truthful Marketing Fixes|Truthful Marketing Fixes]]
- [[_COMMUNITY_Deferred Work|Deferred Work]]

## God Nodes (most connected - your core abstractions)
1. `api/subscription/webhook-paypal.js` - 20 edges
2. `api/paypal/capture-order.js` - 10 edges
3. `api/paypal/create-subscription.js` - 10 edges
4. `handler()` - 7 edges
5. `handler()` - 7 edges
6. `api/paypal/create-order.js` - 7 edges
7. `handler()` - 6 edges
8. `handler()` - 6 edges
9. `Apply 6 Supabase migrations in SQL Editor` - 6 edges
10. `api/subscription/cancel.js` - 5 edges

## Surprising Connections (you probably didn't know these)
- `Founders welcome email (DEFERRED)` --would_extend--> `api/subscription/webhook-paypal.js`  [INFERRED]
  2026-05-23-payments-launch-state.md → webhook-paypal.js
- `W29-final P0a â€” create-subscription.js status=active pre-write` --fixes_in--> `api/paypal/create-subscription.js`  [EXTRACTED]
  2026-05-23-payments-launch-state.md → create-subscription.js
- `Re-audit NEW-P0a â€” ACTIVATED writes null period_end if PayPal omits next_billing_time` --semantically_similar_to--> `W29-final P0b â€” current_period_end not set on ACTIVATED`  [INFERRED] [semantically similar]
  2026-05-23-payments-reaudit.md → 2026-05-23-payments-launch-state.md
- `W29-final P0c â€” Pro Annual â‚¬79 misclassified as monthly` --fixes_in--> `api/subscription/webhook-paypal.js`  [EXTRACTED]
  2026-05-23-payments-launch-state.md → webhook-paypal.js
- `Re-audit NEW-P0a â€” ACTIVATED writes null period_end if PayPal omits next_billing_time` --fixes_in--> `api/subscription/webhook-paypal.js`  [EXTRACTED]
  2026-05-23-payments-reaudit.md → webhook-paypal.js

## Hyperedges (group relationships)
- **W29-b Billing Plans rollout (code + migration + env vars + dashboard)** — commit_1cc6618, mig_billing_plans_columns, setup_vercel_env, setup_paypal_dashboard, file_create_subscription [EXTRACTED 1.00]
- **Founders 100-seat atomic enforcement (3 RPCs + table + 3 code sites)** — commit_fcf5848, mig_founders_seats, file_create_order, file_capture_order, file_webhook_paypal [EXTRACTED 1.00]
- **status=pending exploit fix chain (migration + endpoint + status.js contract)** — commit_4469cf4, mig_status_pending, file_create_subscription, file_status [EXTRACTED 1.00]

## Communities (21 total, 6 thin omitted)

### Community 0 - "W29-Final P0 Cluster (recurring sub bugs)"
Cohesion: 0.15
Nodes (18): P0 #7 â€” Webhook idempotency only on current sub, P1 #13 â€” subscription_periods history table missing, P1 #14 â€” Renewal logic not implemented, Re-audit NEW-P0a â€” ACTIVATED writes null period_end if PayPal omits next_billing_time, W29-final P0a â€” create-subscription.js status=active pre-write, W29-final P0b â€” current_period_end not set on ACTIVATED, W29-final P0c â€” Pro Annual â‚¬79 misclassified as monthly, W29-b â€” PayPal Billing Plans recurring (1cc6618) (+10 more)

### Community 1 - "capture-order.js Internals"
Cohesion: 0.24
Nodes (14): _addMonthsUTC(), _addYearsUTC(), _autoRefund(), _fetchPayPalWithRetry(), _getAccessToken(), handler(), _normalizeOrigin(), _originAllowed() (+6 more)

### Community 2 - "W26 Defense-in-Depth P0s"
Cohesion: 0.23
Nodes (14): P0 #11 â€” PAYPAL_CLIENT_ID interpolated unchecked, P0 #12 â€” No origin/CSRF check on payment endpoints, P0 #4 â€” Founders cap not enforced, P0 #5 â€” Founders cap copy/API mismatch 100/500, P0 #9 â€” _verifyUser ignores email_confirmed_at, W27-c â€” client + reliability (3f238e0), W26-a â€” quick-win P0s (4ecc166), W29-c â€” origin www+apex fix (9106fe4) (+6 more)

### Community 3 - "create-subscription.js Internals"
Cohesion: 0.27
Nodes (11): config, _fetchPayPalWithRetry(), _getAccessToken(), handler(), _json(), _normalizeOrigin(), _originAllowed(), _requestOrigin() (+3 more)

### Community 4 - "webhook-paypal.js Helpers"
Cohesion: 0.3
Nodes (11): _addMonthsUTC(), _addYearsUTC(), _alertOps(), config, _getAccessToken(), handler(), PAYPAL_PLAN_ID_TO_TIER, _periodEndForSku() (+3 more)

### Community 5 - "create-order.js Internals"
Cohesion: 0.36
Nodes (9): _fetchPayPalWithRetry(), _getAccessToken(), handler(), _normalizeOrigin(), _originAllowed(), PLAN_DESCRIPTIONS, PLAN_PRICES, _requestOrigin() (+1 more)

### Community 6 - "history.js (Edge Runtime)"
Cohesion: 0.33
Nodes (6): config, EVENT_LABEL, handler(), _json(), STATUS_BY_TYPE, VISIBLE_EVENT_TYPES

### Community 7 - "cancel.js (Local + PayPal Cancel)"
Cohesion: 0.67
Nodes (5): _getPayPalAccessToken(), handler(), _normalizeOrigin(), _originAllowed(), _paypalBase()

### Community 8 - "W25 Money-Loss Trio"
Cohesion: 0.5
Nodes (5): P0 #1 â€” Client/server price drift, P0 #10 â€” Webhook signature on parsed body, P0 #2 â€” Currency UI EUR vs server USD, P0 #6 â€” Webhook amount-to-plan inference broken, W25 â€” P0 money-loss trio (f5bd602)

### Community 9 - "Refund + Replay Defense"
Cohesion: 0.4
Nodes (5): P0 #3 â€” Refund branch user_id-only scoping, P0 #8 â€” Capture endpoint no replay protection, P1 #20 â€” Refund unconditionally sets profiles.plan=free, W26-b â€” refund scoping + capture replay (2a077f3), W27-b â€” compliance + fraud (3923ce5)

### Community 10 - "status.js Contract + P1 Fixes"
Cohesion: 0.4
Nodes (5): P1 #15 â€” 30-day arithmetic vs calendar months, P1 #18 â€” status.js silent demotion to Free on DB error, W27-a â€” surgical P1s (d3e3cc1), api/subscription/status.js, status.js as plan source-of-truth

### Community 11 - "status.js Internals"
Cohesion: 0.67
Nodes (3): handler(), OWNER_EMAILS, _withDebug()

### Community 12 - "Migration Files"
Cohesion: 0.5
Nodes (4): P2 #37 â€” Billing history overwritten on success, W28-d â€” billing history endpoint (36dd276), api/subscription/history.js (Edge), Vercel (hosting, 12 Node function cap)

### Community 13 - "PayPal External System"
Cohesion: 1.0
Nodes (3): P2 #31 â€” Fake 14-day trial CTA copy (LEGAL RISK), P2 #32 â€” No card required claim contradicts flow, W28-a â€” truthful marketing (f4dc17d)

## Knowledge Gaps
- **33 isolated node(s):** `PLAN_PRICES`, `SKU_TO_PLAN`, `PLAN_QUERIES`, `PLAN_PRICES`, `PLAN_DESCRIPTIONS` (+28 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `api/subscription/webhook-paypal.js` connect `W29-Final P0 Cluster (recurring sub bugs)` to `Refund + Replay Defense`, `W26 Defense-in-Depth P0s`, `status.js Contract + P1 Fixes`?**
  _High betweenness centrality (0.082) - this node is a cross-community bridge._
- **Why does `api/paypal/capture-order.js` connect `W26 Defense-in-Depth P0s` to `W29-Final P0 Cluster (recurring sub bugs)`, `Refund + Replay Defense`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Why does `api/paypal/create-subscription.js` connect `W29-Final P0 Cluster (recurring sub bugs)` to `W26 Defense-in-Depth P0s`, `Migration Files`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **What connects `PLAN_PRICES`, `SKU_TO_PLAN`, `PLAN_QUERIES` to the rest of the system?**
  _33 weakly-connected nodes found - possible documentation gaps or missing edges._