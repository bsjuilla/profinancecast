// api/subscription/history.js — W28-d billing-history endpoint.
//
// EDGE RUNTIME (Vercel Hobby plan caps Node serverless functions at 12;
// we're at exactly 12 already, so this MUST be Edge to keep the deploy
// shipping. Edge functions don't count toward the cap.)
//
// Returns the authenticated user's billing history derived from the
// subscription_events table (W24/W27-b audit-log). Used by billing.html
// to replace the synthetic one-row history (audit #37) with real data
// from the server.
//
// GET /api/subscription/history?limit=20
// Auth: Bearer <Supabase JWT>
// Returns:
//   200 { events: [
//     { id, occurred_at, event_type, plan, amount, currency, provider_id, status }
//   ] }
//   401 if no/invalid auth
//   500 on DB error (client preserves last-known billing history)
//
// Only emits a curated subset of fields — never the raw_payload (W27-b
// already redacts PII at write time, but we extra-gate on the read side).
// The client trusts the field names and renders them in the table.

export const config = { runtime: 'edge' };

import { createClient } from '@supabase/supabase-js';

function _json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

// We only surface events the user would recognise on a billing statement.
// Webhook/audit-noise events (unresolvable_user, stale_capture, etc.) stay
// in subscription_events for support reconciliation but never reach the UI.
const VISIBLE_EVENT_TYPES = new Set([
  'webhook_capture_completed',
  'refund',
  'reversal',
  'cancellation_scheduled',
  'subscription_cancelled',
  'subscription_expired',
  'auto_refund_on_amount_mismatch',
  'auto_refund_failed',
  'dispute_created',
]);

// Pretty labels for the UI. Falls back to the raw event_type when no
// mapping is defined (so a future event type doesn't render as blank).
const EVENT_LABEL = {
  webhook_capture_completed:       'Payment received',
  refund:                          'Refund issued',
  reversal:                        'Payment reversed',
  cancellation_scheduled:          'Cancellation scheduled',
  subscription_cancelled:          'Subscription cancelled',
  subscription_expired:            'Subscription expired',
  auto_refund_on_amount_mismatch:  'Auto-refund (price mismatch)',
  auto_refund_failed:              'Auto-refund failed — support reviewing',
  dispute_created:                 'Dispute opened',
};

const STATUS_BY_TYPE = {
  webhook_capture_completed:       'paid',
  refund:                          'refunded',
  reversal:                        'reversed',
  cancellation_scheduled:          'scheduled',
  subscription_cancelled:          'cancelled',
  subscription_expired:            'expired',
  auto_refund_on_amount_mismatch:  'auto-refunded',
  auto_refund_failed:              'support_review',
  dispute_created:                 'disputed',
};

export default async function handler(req) {
  if (req.method !== 'GET') return _json({ error: 'Method not allowed' }, 405);

  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return _json({ error: 'Missing auth token' }, 401);

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('subscription/history: missing Supabase env');
    return _json({ error: 'Service not configured' }, 503);
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  // Resolve user from the bearer token. service_role bypasses RLS, so we
  // MUST scope queries to data.user.id ourselves below.
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) return _json({ error: 'Invalid auth token' }, 401);
  const userId = userData.user.id;

  // Parse limit query param (default 20, max 100).
  const url = new URL(req.url);
  let limit = parseInt(url.searchParams.get('limit') || '20', 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 20;
  if (limit > 100) limit = 100;

  const { data: events, error: qErr } = await supabase
    .from('subscription_events')
    .select('id, created_at, event_type, provider, provider_id, amount, currency')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (qErr) {
    console.error('subscription/history query error:', qErr);
    // 503 so the client preserves any cached history rather than rendering empty.
    return _json({ error: 'Could not load history' }, 503);
  }

  // Filter to user-visible types, map to UI shape.
  const visible = (events || [])
    .filter(e => VISIBLE_EVENT_TYPES.has(e.event_type))
    .map(e => ({
      id:           e.id,
      occurred_at:  e.created_at,
      event_type:   e.event_type,
      label:        EVENT_LABEL[e.event_type] || e.event_type,
      status:       STATUS_BY_TYPE[e.event_type] || 'unknown',
      amount:       (e.amount != null) ? Number(e.amount) : null,
      currency:     e.currency || null,
      provider:     e.provider || 'paypal',
      // provider_id intentionally NOT returned in the standard payload —
      // it's a sensitive capture reference. Surface only on demand if
      // we ever add a per-event detail view.
    }));

  return _json({ events: visible });
}
