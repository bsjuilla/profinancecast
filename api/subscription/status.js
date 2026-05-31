// api/subscription/status.js
//
// The single, authoritative source for "what plan does this user have?".
// All client-side gating (PFCPlan.requirePlan, badges, feature unlocks)
// derives from this endpoint. The browser never decides plan state.
//
// Returns:
//   200 { plan: 'free'|'pro'|'premium', status, currentPeriodEnd, queries: {...} }
//   401 if no/invalid auth token
//
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional env: OWNER_EMAILS (comma-separated) — these emails get unlimited Pro

import { createClient } from '@supabase/supabase-js';

const OWNER_EMAILS = (process.env.OWNER_EMAILS || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

// W27-a #29 — only include diagnostic fields (_reason, _ownerEmailsConfigured)
// in non-production builds. In production these leak the existence of an
// OWNER_EMAILS allowlist and the decision-path through the entitlement
// resolver, which is unnecessary surface area for any authenticated user.
const IS_PROD = (process.env.VERCEL_ENV === 'production')
              || (process.env.NODE_ENV === 'production');
function _withDebug(payload, debug) {
  return IS_PROD ? payload : { ...payload, ...debug };
}

// B-P0-CORS-PIN (audit 2026-05-25) — explicit CORS allow-list pinned to
// prod origins (override via ALLOWED_ORIGINS env). Headers set BEFORE
// any early return so the browser shows real status codes on 4xx
// instead of opaque CORS errors. Same pattern as SAGE-P0-BACK.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ||
  'https://profinancecast.com,https://www.profinancecast.com')
  .split(',').map(s => s.trim()).filter(Boolean);
function _setCors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
  }
}

export default async function handler(req, res) {
  try {
  _setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing auth token' });

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('subscription/status: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
    return res.status(200).json({ plan: 'free', status: 'config_missing' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid auth token' });
  }
  const userId = userData.user.id;
  const userEmail = (userData.user.email || '').toLowerCase();

  // _reason is a non-secret diagnostic string explaining the decision path.
  // Helps debug "I'm Pro but the site shows Free" without needing server logs.
  // Always one of:
  //   owner_override        → email matched OWNER_EMAILS
  //   active_subscription   → subscriptions row found with status=active, period valid
  //   no_subscription_row   → no row in subscriptions for this user
  //   sub_status_<status>   → row exists but status != active
  //   sub_expired           → row active but current_period_end is past
  //   db_error              → Supabase query failed

  // Owner override: env-driven, server-side. Single source of truth — every
  // gate downstream reads from this endpoint, so flipping the env propagates.
  if (userEmail && OWNER_EMAILS.includes(userEmail)) {
    // W27-a #9 carry-over: owner override also requires confirmed email so a
    // malicious unverified signup using business060407@gmail.com can't grab
    // owner access. Auditor noted this risk under finding #9 — we already
    // gated the payment flow in W26-a; doing the same here for completeness.
    if (!userData.user.email_confirmed_at) {
      // Fall through to the normal subscription lookup; this user gets no
      // override. They will be treated like any other unconfirmed account.
    } else {
      return res.status(200).json(_withDebug({
        plan: 'pro',
        status: 'owner_override',
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        cancelledAt: null,
        provider: null,
        queries: { used: 0, limit: 999999, resetsAt: null },
      }, {
        _reason: 'owner_override',
        _ownerEmailsConfigured: OWNER_EMAILS.length > 0,
      }));
    }
  }

  // Look up active subscription. If none, return free.
  const { data: sub, error: subErr } = await supabase
    .from('subscriptions')
    .select('plan, status, current_period_end, cancel_at_period_end, cancelled_at, provider')
    .eq('user_id', userId)
    .maybeSingle();

  if (subErr) {
    // W27-a #18 — return HTTP 503 on DB error so PFCPlan.refresh() treats
    // the response as a transient failure and preserves the user's
    // last-known-good cached plan (pfc-entitlements.js:84-115) rather than
    // silently demoting every Pro user to Free while Supabase is degraded.
    // FULL-P1-E (audit 2026-05-27) — redact. Supabase error.details on
    // this SELECT can include the user_id we filtered on. Code-only is
    // enough to triage CONNECTION_FAILED vs PERMISSION_DENIED (RLS) vs
    // FUNCTION_NOT_FOUND. This is a hot path (every page load) so the
    // log volume here is meaningful — keeping it terse also reduces
    // log spend.
    console.error('[subscription/status] query failed code=' + (subErr?.code || 'UNKNOWN'));
    return res.status(503).json(_withDebug(
      { plan: 'unknown', status: 'db_error' },
      { _reason: 'db_error', _ownerEmailsConfigured: OWNER_EMAILS.length > 0 }
    ));
  }

  // Treat subscriptions whose period_end is in the past as "free".
  // cancel_at_period_end=true while period_end is still in the future =>
  // user retains Pro until period end (audit H1).
  //
  // FULL-P0-A2 fix (audit 2026-05-26) — pre-fix this line treated EVERY
  // non-'active' status as free, which silently demoted past_due users
  // mid-cycle on the first PayPal renewal failure. Documented intent
  // (webhook-paypal.js SUSPENDED handler comments + cancel modal copy)
  // is "user keeps access until period_end" — i.e. a grace period that
  // matches industry norm (Stripe, Apple App Store, etc) so a card-
  // expiry or bank decline doesn't kill access before the user can
  // update payment details. We now respect that contract:
  //   - status='active'   while period_end > now  → paid plan
  //   - status='past_due' while period_end > now  → paid plan (grace)
  //   - any status when period_end is in the past → free
  //   - any other status (cancelled, expired, suspended-without-period_end,
  //     etc) → free
  // This is the canonical source of truth for the entire client (every
  // PFCPlan.requirePlan call reads from /api/subscription/status), so
  // changing it here propagates the grace period everywhere automatically.
  const now = Date.now();
  const periodEnd = sub?.current_period_end ? new Date(sub.current_period_end).getTime() : 0;
  const expired = periodEnd && periodEnd < now;
  const STILL_PAID_STATUSES = new Set(['active', 'past_due']);
  const inGrace = (sub && sub.status === 'past_due' && !expired);
  const plan = (sub && STILL_PAID_STATUSES.has(sub.status) && !expired) ? sub.plan : 'free';
  let reason;
  if (!sub) reason = 'no_subscription_row';
  else if (sub.status === 'active' && expired) reason = 'sub_expired';
  else if (sub.status === 'active') reason = 'active_subscription';
  else if (sub.status === 'past_due' && expired) reason = 'past_due_period_ended';
  else if (sub.status === 'past_due') reason = 'past_due_in_grace';
  else reason = 'sub_status_' + (sub.status || 'unknown');

  // Optional: include AI query usage (+ plan for the lazy reconcile below)
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, ai_queries_used, ai_queries_limit, ai_queries_reset_at')
    .eq('id', userId)
    .maybeSingle();

  // B-P0-CANCEL-GRACE (swarm audit) — lazy reconcile of profiles.plan, which
  // api/sage.js reads as its server-side Pro gate. When a scheduled-cancel or
  // already-terminal subscription's paid period has lapsed, self-heal so the
  // server stops granting Pro features after period end. Scoped to
  // definitively-ended subs (cancel_at_period_end / cancelled / expired) so an
  // active sub mid-renewal is never touched. Best-effort and only on the rare
  // terminal-expired path: it awaits ≤2 cheap indexed writes (so the reconcile
  // actually flushes before the serverless fn freezes) and only writes when
  // profiles.plan is actually still paid, so it self-limits to one round.
  if (sub && expired && profile && profile.plan && profile.plan !== 'free'
      && (sub.cancel_at_period_end === true || sub.status === 'cancelled' || sub.status === 'expired')) {
    try {
      await supabase.from('profiles').update({ plan: 'free' }).eq('id', userId);
      if (sub.status !== 'cancelled' && sub.status !== 'expired') {
        await supabase.from('subscriptions').update({
          status: 'expired', subscription_state: 'EXPIRED', updated_at: new Date().toISOString(),
        }).eq('user_id', userId);
      }
    } catch (_) { /* non-fatal reconcile */ }
  }

  return res.status(200).json(_withDebug({
    plan,
    status: sub?.status || 'free',
    currentPeriodEnd: sub?.current_period_end || null,
    cancelAtPeriodEnd: sub?.cancel_at_period_end === true,
    cancelledAt: sub?.cancelled_at || null,
    provider: sub?.provider || null,
    // FULL-P0-A2 — surface the grace-period flag so the client can show
    // a "Update payment method" banner before the user wakes up to a
    // post-period_end downgrade. PFCPlan reads this; pages should render
    // a warning when inGrace=true (defer to a P1 UI follow-up).
    inGrace,
    queries: profile ? {
      used: profile.ai_queries_used || 0,
      limit: profile.ai_queries_limit || (plan === 'premium' ? 500 : plan === 'pro' ? 200 : 10),
      resetsAt: profile.ai_queries_reset_at,
    } : null,
  }, {
    _reason: reason,
    _ownerEmailsConfigured: OWNER_EMAILS.length > 0,
  }));
  } catch (err) {
    // W27-a #18 — return 503 on unhandled errors too so PFCPlan.refresh()
    // preserves the user's last-known-good plan instead of silently
    // demoting every Pro user to Free during a server hiccup.
    // FULL-P1-E — redact stack. Unhandled errors thrown from inside
    // this handler can have the Bearer token in scope when the stack
    // is captured.
    console.error('[subscription/status] unhandled name=' + (err?.name || 'Error') + ' code=' + (err?.code || 'UNKNOWN'));
    return res.status(503).json(_withDebug(
      { plan: 'unknown', status: 'error_fallback' },
      { _reason: 'unhandled_error' }
    ));
  }
}
