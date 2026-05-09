// api/founders-claimed.js
//
// Public endpoint that returns how many Founders Lifetime seats have been
// claimed. Used by billing.html and index.html to replace the static
// "— of 500 claimed" placeholder with a live count.
//
// Counts subscriptions where amount_usd = 149 (the Founders Lifetime SKU).
// Capture-order.js writes amount_usd from the actual PayPal capture, so this
// is the authoritative count regardless of whether the row's plan column is
// 'pro' (SKU normalization — see capture-order.js#SKU_TO_PLAN).
//
// Returns:
//   200 { claimed: N, cap: 500, remaining: 500-N }
//
// No auth required (public count, no PII).
// Cached briefly so a viral homepage spike doesn't spam Supabase.

import { createClient } from '@supabase/supabase-js';

const FOUNDERS_PRICE_USD = 149;
const FOUNDERS_CAP       = 500;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    // Fail closed: surface the cap so UI shows "— of 500" rather than crashing.
    console.error('founders-claimed: missing Supabase env');
    return res.status(200).json({ claimed: null, cap: FOUNDERS_CAP, remaining: FOUNDERS_CAP });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  // amount_usd is numeric in Postgres; an exact-equality match on 149 is fine.
  // We only count active subscriptions — cancelled/refunded Founders shouldn't
  // free up a seat (the cap is a hard founder-cohort marker, not a live
  // entitlement count) but we exclude rows whose status was explicitly set
  // to 'refunded' so accidental refunds don't count toward the cap.
  const { count, error } = await supabase
    .from('subscriptions')
    .select('user_id', { count: 'exact', head: true })
    .eq('amount_usd', FOUNDERS_PRICE_USD)
    .neq('status', 'refunded');

  if (error) {
    console.error('founders-claimed: count query error:', error);
    // Fail closed with cap shown — UI degrades to "— of 500" rather than 500.
    return res.status(200).json({ claimed: null, cap: FOUNDERS_CAP, remaining: FOUNDERS_CAP });
  }

  const claimed = Math.max(0, Math.min(FOUNDERS_CAP, count || 0));
  const remaining = Math.max(0, FOUNDERS_CAP - claimed);

  // Edge cache 60s, stale-while-revalidate 300s.
  // Slightly stale counter is fine; Vercel edge absorbs viral spikes.
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300');
  return res.status(200).json({ claimed, cap: FOUNDERS_CAP, remaining });
}
