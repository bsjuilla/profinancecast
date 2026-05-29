// api/cron/weekly-checkin.js — privacy-preserving Weekly Check-In sender.
//
// Triggered by Vercel Cron (see vercel.json -> crons; Sunday 17:00 UTC).
//
// SAFETY — three INDEPENDENT guards, so deploying this code can NEVER email
// anyone by accident. All three must pass before a single email is sent:
//   1. CRON_SECRET: requires `Authorization: Bearer <CRON_SECRET>`. Vercel
//      Cron attaches this automatically once CRON_SECRET is set in the project
//      env. A random web visitor (no header) gets 401.
//   2. Kill-switch: no-ops unless WEEKLY_CHECKIN_LIVE === '1'. Lets you deploy
//      dormant and flip it on deliberately when you're ready.
//   3. Opt-in: only profiles with weekly_checkin_opt_in = true are selected,
//      and only those not emailed in the last MIN_DAYS_BETWEEN days.
//
// The email (renderWeeklyCheckin) carries NO financial data — the server is
// blind to user finances by design. We store only a last-sent timestamp.
// Batch-capped per run (Resend rate safety); fail-open per recipient so one
// bad address never aborts the batch.
//
// Required env when live: CRON_SECRET, WEEKLY_CHECKIN_LIVE=1, SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY.

import { createClient } from '@supabase/supabase-js';
import { sendTransactionalEmail } from '../_lib/email/send.js';
import { renderWeeklyCheckin } from '../_lib/email/templates.js';

const BATCH_CAP        = 200;          // max recipients per cron run
const MIN_DAYS_BETWEEN = 6;            // never re-send within 6 days
const MS_PER_DAY       = 24 * 60 * 60 * 1000;

export default async function handler(req, res) {
  // Guard 1 — CRON_SECRET bearer token.
  const secret = process.env.CRON_SECRET;
  const auth   = req.headers.authorization || '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Guard 2 — kill-switch. Dormant until explicitly enabled.
  if (process.env.WEEKLY_CHECKIN_LIVE !== '1') {
    return res.status(200).json({ ok: true, sent: 0, reason: 'disabled' });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[cron/weekly-checkin] missing Supabase env');
    return res.status(500).json({ error: 'Server not configured' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const cutoffMs  = Date.now() - MIN_DAYS_BETWEEN * MS_PER_DAY;
  const cutoffIso = new Date(cutoffMs).toISOString();

  // Guard 3 — opted-in + due (null last-sent OR older than the cutoff).
  const { data: rows, error } = await supabase
    .from('profiles')
    .select('id, full_name, weekly_checkin_last_sent_at')
    .eq('weekly_checkin_opt_in', true)
    .or(`weekly_checkin_last_sent_at.is.null,weekly_checkin_last_sent_at.lt.${cutoffIso}`)
    .limit(BATCH_CAP);

  if (error) {
    console.error('[cron/weekly-checkin] query failed code=' + (error?.code || 'UNKNOWN'));
    return res.status(500).json({ error: 'query failed' });
  }

  const stamp = new Date().toISOString();
  // Idempotency bucket: anchor to THIS week's Sunday (UTC), not the calendar
  // day, so a send that slips past midnight on retry (e.g. a Sunday 23:59 send
  // whose stamp write failed, re-run after midnight) still shares ONE Resend
  // idempotency key and can't double-send (closes review LOW-2). Any weekday
  // maps back to its week's Sunday; next Sunday gets a fresh bucket.
  const _bucket = new Date(stamp);
  _bucket.setUTCDate(_bucket.getUTCDate() - _bucket.getUTCDay()); // Sun=0
  const weekKey = _bucket.toISOString().slice(0, 10);
  let sent = 0, skipped = 0, failed = 0;

  for (const row of (rows || [])) {
    try {
      // Defense-in-depth: re-check the 6-day window in JS even though the SQL
      // filter already excludes recent rows — guarantees no double-send even
      // if the .or() filter ever behaves unexpectedly.
      const last = row.weekly_checkin_last_sent_at ? Date.parse(row.weekly_checkin_last_sent_at) : 0;
      if (last && last > cutoffMs) { skipped++; continue; }

      // Resolve the recipient email from auth.users (profiles doesn't store it).
      const { data: u, error: uErr } = await supabase.auth.admin.getUserById(row.id);
      const email = u?.user?.email;
      if (uErr || !email) { skipped++; continue; }

      const firstName = (function () {
        const fn = row.full_name || u?.user?.user_metadata?.full_name || u?.user?.user_metadata?.name || '';
        return fn ? String(fn).trim().split(/\s+/)[0] : undefined;
      })();

      const tpl = renderWeeklyCheckin({ firstName });
      const r = await sendTransactionalEmail({
        to:             email,
        subject:        tpl.subject,
        text:           tpl.text,
        tag:            'weekly_checkin',
        // Per-user-per-week key so a cron retry (even across midnight) dedupes.
        idempotencyKey: `weekly:${row.id}:${weekKey}`,
      });

      if (r && r.sent) {
        sent++;
        const { error: upErr } = await supabase
          .from('profiles')
          .update({ weekly_checkin_last_sent_at: stamp })
          .eq('id', row.id);
        if (upErr) {
          // The email went out; if the stamp write fails we log it. The 6-day
          // window + Resend idempotency key still bound any duplicate risk.
          console.warn('[cron/weekly-checkin] stamp update failed code=' + (upErr?.code || 'UNKNOWN'));
        }
      } else {
        failed++;
      }
    } catch (e) {
      failed++;
      console.warn('[cron/weekly-checkin] recipient failed name=' + (e?.name || 'Error'));
    }
  }

  console.log(`[cron/weekly-checkin] sent=${sent} skipped=${skipped} failed=${failed} candidates=${(rows || []).length}`);
  return res.status(200).json({ ok: true, sent, skipped, failed, candidates: (rows || []).length });
}
