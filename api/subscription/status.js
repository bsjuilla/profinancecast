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

import { createClient } from '@supabase/supabase-js';

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

  // Look up active subscription. If none, return free.
  const { data: sub, error: subErr } = await supabase
    .from('subscriptions')
    .select('plan, status, current_period_end, provider')
    .eq('user_id', userId)
    .maybeSingle();

  if (subErr) {
    console.error('subscription/status query error:', subErr);
    // Fail closed: return free, not 500, so the UI degrades gracefully
    return res.status(200).json({ plan: 'free', status: 'unknown' });
  }

  // Treat subscriptions whose period_end is in the past as "free"
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
    provider: sub?.provider || null,
    queries: profile ? {
      used: profile.ai_queries_used || 0,
      limit: profile.ai_queries_limit || (plan === 'premium' ? 150 : plan === 'pro' ? 60 : 5),
      resetsAt: profile.ai_queries_reset_at,
    } : null,
  });
}
