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

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing auth token' });

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

  // Owner override: env-driven, server-side. Single source of truth — every
  // gate downstream reads from this endpoint, so flipping the env propagates.
  if (userEmail && OWNER_EMAILS.includes(userEmail)) {
    return res.status(200).json({
      plan: 'pro',
      status: 'owner_override',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      cancelledAt: null,
      provider: null,
      queries: { used: 0, limit: 999999, resetsAt: null },
    });
  }

  // Look up active subscription. If none, return free.
  const { data: sub, error: subErr } = await supabase
    .from('subscriptions')
    .select('plan, status, current_period_end, cancel_at_period_end, cancelled_at, provider')
    .eq('user_id', userId)
    .maybeSingle();

  if (subErr) {
    console.error('subscription/status query error:', subErr);
    // Fail closed: return free, not 500, so the UI degrades gracefully
    return res.status(200).json({ plan: 'free', status: 'unknown' });
  }

  // Treat subscriptions whose period_end is in the past as "free".
  // cancel_at_period_end=true while period_end is still in the future =>
  // user retains Pro until period end (audit H1).
  const now = Date.now();
  const periodEnd = sub?.current_period_end ? new Date(sub.current_period_end).getTime() : 0;
  const expired = periodEnd && periodEnd < now;
  const plan = (sub && sub.status === 'active' && !expired) ? sub.plan : 'free';

  // Optional: include AI query usage
  const { data: profile } = await supabase
    .from('profiles')
    .select('ai_queries_used, ai_queries_limit, ai_queries_reset_at')
    .eq('id', userId)
    .maybeSingle();

  return res.status(200).json({
    plan,
    status: sub?.status || 'free',
    currentPeriodEnd: sub?.current_period_end || null,
    cancelAtPeriodEnd: sub?.cancel_at_period_end === true,
    cancelledAt: sub?.cancelled_at || null,
    provider: sub?.provider || null,
    queries: profile ? {
      used: profile.ai_queries_used || 0,
      limit: profile.ai_queries_limit || (plan === 'premium' ? 500 : plan === 'pro' ? 200 : 10),
      resetsAt: profile.ai_queries_reset_at,
    } : null,
  });
}
