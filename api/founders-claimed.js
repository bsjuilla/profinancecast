// api/founders-claimed.js
//
// Public endpoint that returns how many Founders Lifetime seats have been
// claimed. Used by billing.html and index.html to replace the static
// "— of 100 claimed" placeholder with a live count.
//
// Counts subscriptions where amount_usd = 149 (the Founders Lifetime SKU).
// Capture-order.js writes amount_usd from the actual PayPal capture, so this
// is the authoritative count regardless of whether the row's plan column is
// 'pro' (SKU normalization — see capture-order.js#SKU_TO_PLAN).
//
// Note: this counter is for marketing display only; it is allowed to be
// slightly stale. The HARD cap is enforced atomically by W26-d's
// founders_seats table + claim_founders_seat() Postgres function inside
// api/paypal/create-order.js. This endpoint is just a count.
//
// Returns:
//   200 { claimed: N, cap: 100, remaining: 100-N }
//
// No auth required (public count, no PII).
// Cached briefly so a viral homepage spike doesn't spam Supabase.

import { createClient } from '@supabase/supabase-js';

const FOUNDERS_PRICE_USD = 149;
// W26-d: corrected from stale 500 to canonical 100 (pricing.md, about.html,
// billing.html, index.html copy, waitlist.html all consistently say 100).
const FOUNDERS_CAP       = 100;

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
    // FULL-P1-D2 (audit 2026-05-27) — redact. Original log dumped the
    // full Supabase error object including query SQL fragments which
    // leak schema details to log aggregators. code-only matches the
    // account/delete.js + forecast/save.js pattern.
    console.error('[founders-claimed] count query failed code=' + (error?.code || 'UNKNOWN'));
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
