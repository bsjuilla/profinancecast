// api/_lib/weekly-checkin-core.js — shared logic for the Weekly Check-In
// retention feature.
//
// Lives under api/_lib/ so Vercel does NOT count it as a deployable serverless
// function (the Hobby plan caps deployable functions at ~12; underscore-
// prefixed paths are excluded). The thin HTTP surface is hosted on
// api/founders-claimed.js, which dispatches into the three functions below.
// This keeps the feature fully functional while adding ZERO new functions.
//
// Privacy: the cron sends a content-free email (renderWeeklyCheckin) and stores
// only a boolean preference + a last-sent timestamp. No financial figure ever
// leaves the server.

import { sendTransactionalEmail } from './email/send.js';
import { renderWeeklyCheckin } from './email/templates.js';

const BATCH_CAP        = 200;          // max recipients per cron run
const MIN_DAYS_BETWEEN = 6;            // never re-send within 6 days
const MS_PER_DAY       = 24 * 60 * 60 * 1000;

// Read the caller's Weekly Check-In opt-in flag. Throws on DB error (caller
// maps to a 500). Returns boolean.
export async function getWeeklyOptIn(supabase, userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('weekly_checkin_opt_in')
    .eq('id', userId)
    .single();
  if (error) { const e = new Error('read_failed'); e.code = error.code; throw e; }
  return !!(data && data.weekly_checkin_opt_in);
}

// Set the caller's opt-in flag (scoped to their own row by the caller).
export async function setWeeklyOptIn(supabase, userId, optIn) {
  const { error } = await supabase
    .from('profiles')
    .update({ weekly_checkin_opt_in: !!optIn })
    .eq('id', userId);
  if (error) { const e = new Error('update_failed'); e.code = error.code; throw e; }
  return !!optIn;
}

// Cron send. The CALLER must enforce auth (CRON_SECRET) and the
// WEEKLY_CHECKIN_LIVE kill-switch BEFORE invoking this. Opted-in + due rows
// only; batch-capped; fail-open per recipient. Returns a summary object.
export async function runWeeklyCheckin(supabase) {
  const cutoffMs  = Date.now() - MIN_DAYS_BETWEEN * MS_PER_DAY;
  const cutoffIso = new Date(cutoffMs).toISOString();

  // Guard: opted-in + due (null last-sent OR older than the cutoff).
  const { data: rows, error } = await supabase
    .from('profiles')
    .select('id, full_name, weekly_checkin_last_sent_at')
    .eq('weekly_checkin_opt_in', true)
    .or(`weekly_checkin_last_sent_at.is.null,weekly_checkin_last_sent_at.lt.${cutoffIso}`)
    .limit(BATCH_CAP);
  if (error) { const e = new Error('query_failed'); e.code = error.code; throw e; }

  const stamp = new Date().toISOString();
  // Idempotency bucket: anchor to THIS week's Sunday (UTC) so a retry that
  // slips past midnight still shares one Resend idempotency key (no double-send).
  const _bucket = new Date(stamp);
  _bucket.setUTCDate(_bucket.getUTCDate() - _bucket.getUTCDay()); // Sun=0
  const weekKey = _bucket.toISOString().slice(0, 10);

  let sent = 0, skipped = 0, failed = 0;
  for (const row of (rows || [])) {
    try {
      // Defense-in-depth: re-check the 6-day window in JS regardless of the
      // SQL filter, so no double-send is possible.
      const last = row.weekly_checkin_last_sent_at ? Date.parse(row.weekly_checkin_last_sent_at) : 0;
      if (last && last > cutoffMs) { skipped++; continue; }

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
        idempotencyKey: `weekly:${row.id}:${weekKey}`,
      });

      if (r && r.sent) {
        sent++;
        const { error: upErr } = await supabase
          .from('profiles')
          .update({ weekly_checkin_last_sent_at: stamp })
          .eq('id', row.id);
        if (upErr) console.warn('[weekly-checkin] stamp update failed code=' + (upErr?.code || 'UNKNOWN'));
      } else {
        failed++;
      }
    } catch (e) {
      failed++;
      console.warn('[weekly-checkin] recipient failed name=' + (e?.name || 'Error'));
    }
  }

  console.log(`[weekly-checkin] sent=${sent} skipped=${skipped} failed=${failed} candidates=${(rows || []).length}`);
  return { sent, skipped, failed, candidates: (rows || []).length };
}
