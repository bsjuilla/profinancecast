// api/founders-claimed.js
//
// PRIMARY (public, no auth): returns how many Founders Lifetime seats have
// been claimed. Used by billing.html and index.html to replace the static
// "— of 100 claimed" placeholder with a live count. Counts subscriptions
// where amount_usd = 149 (the Founders Lifetime SKU). Marketing display only;
// allowed to be slightly stale. The HARD cap is enforced atomically by W26-d's
// founders_seats table inside api/paypal/create-order.js.
//
// This file ALSO hosts two Weekly-Check-In surfaces, dispatched by the
// Authorization header, so the feature adds ZERO new serverless functions
// (Vercel Hobby plan caps deployable functions; the heavy logic lives in the
// uncounted api/_lib/weekly-checkin-core.js):
//   - Authorization: Bearer <CRON_SECRET>  -> run the weekly send (Vercel Cron)
//   - Authorization: Bearer <user JWT>      -> GET/POST the user's opt-in flag
//   - no Authorization                      -> the public Founders count (below)
//
// Returns (public count): 200 { claimed: N, cap: 100, remaining: 100-N }
//
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Weekly-checkin extras when live: CRON_SECRET, WEEKLY_CHECKIN_LIVE=1, RESEND_API_KEY

import { createClient } from '@supabase/supabase-js';
import {
  getWeeklyOptIn,
  setWeeklyOptIn,
  runWeeklyCheckin,
} from './_lib/weekly-checkin-core.js';

const FOUNDERS_PRICE_USD = 149;
// W26-d: corrected from stale 500 to canonical 100 (pricing.md, about.html,
// billing.html, index.html copy, waitlist.html all consistently say 100).
const FOUNDERS_CAP       = 100;

function _svc() {
  return createClient(
    process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  // ── Weekly Check-In CRON branch — secret bearer (Vercel Cron) ──────────────
  // Three independent guards: (1) bearer must equal CRON_SECRET; (2) the
  // WEEKLY_CHECKIN_LIVE kill-switch; (3) opt-in default false (inside the
  // runner's query). A missing CRON_SECRET means this branch is never entered.
  if (bearer && process.env.CRON_SECRET && bearer === process.env.CRON_SECRET) {
    res.setHeader('Cache-Control', 'no-store');
    if (process.env.WEEKLY_CHECKIN_LIVE !== '1') {
      return res.status(200).json({ ok: true, sent: 0, reason: 'disabled' });
    }
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[founders-claimed:cron] missing Supabase env');
      return res.status(500).json({ error: 'Server not configured' });
    }
    try {
      const summary = await runWeeklyCheckin(_svc());
      return res.status(200).json({ ok: true, ...summary });
    } catch (e) {
      console.error('[founders-claimed:cron] failed name=' + (e?.name || 'Error') + ' code=' + (e?.code || 'UNKNOWN'));
      return res.status(500).json({ error: 'cron failed' });
    }
  }

  // ── Weekly Check-In OPT-IN branch — user JWT bearer ────────────────────────
  // Any non-secret bearer is treated as a user access token: verified via
  // auth.getUser, then every query is scoped to that verified user's own row.
  if (bearer) {
    res.setHeader('Cache-Control', 'no-store');
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: 'Server not configured' });
    }
    const supabase = _svc();
    const { data: userData, error: userErr } = await supabase.auth.getUser(bearer);
    if (userErr || !userData?.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const userId = userData.user.id;
    try {
      if (req.method === 'POST') {
        let body = req.body;
        if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
        const optIn = body && body.weeklyCheckinOptIn;
        if (typeof optIn !== 'boolean') {
          return res.status(400).json({ error: 'weeklyCheckinOptIn must be a boolean' });
        }
        const v = await setWeeklyOptIn(supabase, userId, optIn);
        return res.status(200).json({ weeklyCheckinOptIn: v });
      }
      const v = await getWeeklyOptIn(supabase, userId);
      return res.status(200).json({ weeklyCheckinOptIn: v });
    } catch (e) {
      console.error('[founders-claimed:pref] failed code=' + (e?.code || 'UNKNOWN'));
      return res.status(500).json({ error: 'Preference update failed' });
    }
  }

  // ── PUBLIC branch — Founders-claimed count (original behavior, unchanged) ──
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    // Fail closed: surface the cap so UI shows "— of 100" rather than crashing.
    console.error('founders-claimed: missing Supabase env');
    return res.status(200).json({ claimed: null, cap: FOUNDERS_CAP, remaining: FOUNDERS_CAP });
  }

  const supabase = _svc();

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
    // Fail closed with cap shown — UI degrades to "— of 100" rather than 500.
    return res.status(200).json({ claimed: null, cap: FOUNDERS_CAP, remaining: FOUNDERS_CAP });
  }

  const claimed = Math.max(0, Math.min(FOUNDERS_CAP, count || 0));
  const remaining = Math.max(0, FOUNDERS_CAP - claimed);

  // Edge cache 60s, stale-while-revalidate 300s.
  // Slightly stale counter is fine; Vercel edge absorbs viral spikes.
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300');
  return res.status(200).json({ claimed, cap: FOUNDERS_CAP, remaining });
}
