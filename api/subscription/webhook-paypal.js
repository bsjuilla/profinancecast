// api/subscription/webhook-paypal.js
//
// Receives PayPal webhooks (refunds, disputes, subscription cancels) and
// updates the user's subscription row accordingly. PayPal will retry failed
// deliveries, so handlers MUST be idempotent.
//
// Setup (one-time):
//   1. PayPal developer dashboard → Apps → your app → Add Webhook
//   2. URL = https://profinancecast.com/api/subscription/webhook-paypal
//   3. Subscribe to events:
//        PAYMENT.CAPTURE.COMPLETED   ← audit H2 fallback (NEW)
//        PAYMENT.CAPTURE.REFUNDED
//        PAYMENT.CAPTURE.REVERSED
//        BILLING.SUBSCRIPTION.CANCELLED
//        BILLING.SUBSCRIPTION.EXPIRED
//        CUSTOMER.DISPUTE.CREATED
//   4. Copy the webhook ID into Vercel env: PAYPAL_WEBHOOK_ID
//
// Required env: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV,
//               PAYPAL_WEBHOOK_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js';

// W25 P0 #10 — disable Vercel's body parser. PayPal's webhook signature
// is computed over the exact raw bytes PayPal sent; the default parser
// re-orders keys and changes whitespace, breaking verification silently
// (HTTP 401 on every real event despite "valid" signatures).
export const config = { api: { bodyParser: false } };

const PAYPAL_BASE = (process.env.PAYPAL_ENV === 'sandbox')
  ? 'https://api-m.sandbox.paypal.com'
  : 'https://api-m.paypal.com';

// W27-a #23 — every SKU is billed in EUR (see create-order.js, capture-order.js).
// The webhook fallback used to default currency to 'USD' if PayPal omitted the
// field, which would let a misconfigured order silently upgrade a user.
const EXPECTED_CURRENCY = 'EUR';

// W27-a #15 — period lengths in months/years, not 30-day chunks.
// addMonths and addYears do calendar-correct arithmetic in UTC so a user who
// pays on 31-Jan doesn't get an Apr-02 period end via 60-day arithmetic.
function _addMonthsUTC(date, months) {
  const d = new Date(date);
  const desiredMonth = d.getUTCMonth() + months;
  d.setUTCMonth(desiredMonth);
  // If the original day-of-month doesn't exist in the target month (e.g. 31->Feb),
  // setUTCMonth rolls over into the next month. Detect that and clamp to the
  // last day of the intended month.
  if (d.getUTCMonth() !== ((desiredMonth % 12) + 12) % 12) {
    d.setUTCDate(0); // last day of previous month = last day of target month
  }
  return d;
}
function _addYearsUTC(date, years) {
  const d = new Date(date);
  const target = d.getUTCFullYear() + years;
  d.setUTCFullYear(target);
  // Handle Feb-29 anniversaries on non-leap years.
  if (d.getUTCFullYear() !== target) d.setUTCDate(0);
  return d;
}
function _periodEndForSku(sku, fromIso) {
  const from = fromIso ? new Date(fromIso) : new Date();
  switch (sku) {
    case 'pro_monthly':
    case 'premium_monthly':
      return _addMonthsUTC(from, 1).toISOString();
    case 'pro_annual':
    case 'premium_annual':
      return _addYearsUTC(from, 1).toISOString();
    case 'founders':
      return _addYearsUTC(from, 100).toISOString();
    default:
      return null;
  }
}

// W27-a #17 — best-effort alert sink for events that need human follow-up
// (unresolvable user on a real captured payment, mismatched currency, etc.).
// Sends to ALERT_EMAIL via Resend if both env vars are present; otherwise
// becomes a no-op and the event lives only in subscription_events + Vercel logs.
// Non-blocking on the happy path; never throws.
async function _alertOps(subject, body) {
  const apiKey = process.env.RESEND_API_KEY;
  const to     = process.env.ALERT_EMAIL;
  const from   = process.env.ALERT_FROM_EMAIL || 'alerts@profinancecast.com';
  if (!apiKey || !to) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from, to: [to],
        subject: `[PFC alerts] ${subject}`,
        text: body,
      }),
    });
  } catch (e) {
    console.error('[webhook-paypal] _alertOps failed:', e?.message || e);
  }
}

// Reads the raw incoming bytes as a Buffer. Used for PayPal webhook
// signature verification (which must see byte-identical input).
async function _readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

async function _getAccessToken() {
  const creds = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error('PayPal auth failed');
  return (await res.json()).access_token;
}

/**
 * Verifies the webhook signature with PayPal so we don't trust spoofed events.
 * W25 P0 #10: accepts headers + raw body STRING (not the parsed req.body).
 * The raw string is then parsed into webhook_event for the API contract,
 * but signature verification keys on the headers + raw byte signature
 * that PayPal computed BEFORE Vercel's parser re-emitted whitespace.
 * Returns true only when PayPal confirms the signature is valid.
 */
async function _verifySignature(headers, rawBodyString) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    console.error('PAYPAL_WEBHOOK_ID not configured — refusing to process webhook');
    return false;
  }
  let parsedEvent;
  try { parsedEvent = JSON.parse(rawBodyString); }
  catch (_) { return false; }
  const token = await _getAccessToken();
  const verifyRes = await fetch(`${PAYPAL_BASE}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_algo:         headers['paypal-auth-algo'],
      cert_url:          headers['paypal-cert-url'],
      transmission_id:   headers['paypal-transmission-id'],
      transmission_sig:  headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'],
      webhook_id:        webhookId,
      webhook_event:     parsedEvent,
    }),
  });
  if (!verifyRes.ok) return false;
  const data = await verifyRes.json();
  return data.verification_status === 'SUCCESS';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // W25 P0 #10 — read raw body bytes. bodyParser is disabled at top of file
  // so req is a raw stream here, NOT a parsed object.
  let rawBody;
  try { rawBody = (await _readRawBody(req)).toString('utf8'); }
  catch (e) {
    console.error('Failed to read webhook raw body:', e);
    return res.status(400).json({ error: 'Bad request' });
  }

  // 1. Verify the webhook actually came from PayPal (raw-body version)
  const valid = await _verifySignature(req.headers, rawBody).catch(() => false);
  if (!valid) {
    console.warn('Rejected unverified PayPal webhook');
    return res.status(401).json({ error: 'Signature verification failed' });
  }

  // 2. Parse the body NOW for routing (verification already passed on raw bytes)
  let event;
  try { event = JSON.parse(rawBody); }
  catch (_) { return res.status(400).json({ error: 'Invalid JSON' }); }
  const eventType = event.event_type;
  const resource  = event.resource || {};

  const supabase = createClient(
    process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  // W26-c #7 — Idempotency check (MUST come before any state-changing work).
  // PayPal retries on any non-2xx (and sometimes even on 2xx). Without this,
  // a retried PAYMENT.CAPTURE.COMPLETED would re-upsert the subscription
  // row, potentially clobbering cancel_at_period_end / period_end state
  // set since the first delivery.
  //
  // We key on PayPal-Transmission-Id, which is unique per delivery attempt.
  // Falls back to event.id if the header is missing (defense-in-depth).
  // The PRIMARY KEY on the table makes the ON CONFLICT atomic — two
  // concurrent deliveries can't both win.
  const transmissionId = req.headers['paypal-transmission-id'] || event.id || null;
  if (transmissionId) {
    const { data: dedupRow, error: dedupErr } = await supabase
      .from('webhook_events_processed')
      .insert({
        event_id: transmissionId,
        event_type: eventType || 'unknown',
        provider: 'paypal',
      })
      .select('event_id')
      .maybeSingle();
    if (dedupErr) {
      // Postgres error code 23505 = unique_violation = we've seen this event before.
      if (dedupErr.code === '23505') {
        return res.status(200).json({ received: true, deduplicated: true });
      }
      // Any other DB error: log + fall through. We'd rather process the event
      // twice than reject a real webhook and have PayPal retry forever.
      console.error('[webhook-paypal] dedup insert error (continuing):', dedupErr);
    } else if (!dedupRow) {
      // No row returned + no error = also a conflict swallowed by the row
      // visibility rules. Treat as duplicate.
      return res.status(200).json({ received: true, deduplicated: true });
    }
  } else {
    console.warn('[webhook-paypal] no transmission_id and no event.id; cannot deduplicate');
  }

  // Helper: append-only event log for audit M3.
  // W27-a #25 — surfaces both throws AND Supabase-shaped errors. We don't
  // re-throw (audit-log failures should never break the webhook 200-ack), but
  // we make sure the failure isn't invisible: it gets a structured console
  // record AND a best-effort email to ALERT_EMAIL.
  const _logEvent = async (extra) => {
    try {
      const { error: insertErr } = await supabase.from('subscription_events').insert({
        user_id: extra.user_id || null,
        event_type: extra.event_type || eventType,
        provider: 'paypal',
        provider_id: extra.provider_id || null,
        amount: extra.amount || null,
        currency: extra.currency || null,
        raw_payload: extra.raw_payload || event,
      });
      if (insertErr) {
        console.error('[webhook-paypal] event-log insert error:', {
          message: insertErr.message, details: insertErr.details, code: insertErr.code,
          event_type: extra.event_type, provider_id: extra.provider_id,
        });
        _alertOps('subscription_events insert failed', JSON.stringify({
          db_error: { message: insertErr.message, code: insertErr.code },
          extra,
        }, null, 2));
      }
    } catch (e) {
      console.error('[webhook-paypal] event log threw:', e?.message || e);
      _alertOps('subscription_events insert threw', String(e?.stack || e));
    }
  };

  try {
    switch (eventType) {
      case 'PAYMENT.CAPTURE.COMPLETED': {
        // Audit H2 fallback: if api/paypal/capture-order.js 5xxed (or was
        // never reached), upgrade the user from this verified webhook event.
        const captureId = resource.id;
        const amount = resource.amount?.value;
        const currency = resource.amount?.currency_code || 'EUR';
        const userId =
          resource.custom_id ||
          resource.invoice_id ||
          resource.supplementary_data?.related_ids?.custom_id ||
          null;

        await _logEvent({
          user_id: userId,
          event_type: 'webhook_capture_completed',
          provider_id: captureId,
          amount,
          currency,
        });

        if (!userId) {
          // W27-a #17 — Fail-open audit + ALERT.
          // PayPal verified the event but we cannot map it to a user. We
          // 200-ack so PayPal stops retrying, but operations MUST know: real
          // money landed and we don't know whose entitlement to flip.
          // Logs subscription_events for audit AND fires an email if
          // ALERT_EMAIL + RESEND_API_KEY are configured.
          console.warn(`[webhook-paypal] capture.completed without resolvable userId (capture ${captureId})`);
          await _logEvent({
            user_id: null,
            event_type: 'webhook_unresolvable_user',
            provider_id: captureId,
            amount,
            currency,
            raw_payload: { reason: 'no_custom_id_no_invoice_id', event },
          });
          _alertOps(
            'Payment captured without resolvable user — manual reconciliation needed',
            `A PayPal capture completed but we cannot map it to a user.\n\n` +
            `captureId: ${captureId}\namount: ${amount} ${currency}\nevent.id: ${event.id}\n\n` +
            `Reconcile via the PayPal dashboard and look up the buyer's email; ` +
            `if they have an account, manually upsert their subscriptions row.`
          );
          break;
        }

        // W27-a #23 — verify currency before any state-changing work. The
        // create-order side bills exclusively in EUR; a webhook event whose
        // currency_code is anything else is either misconfiguration or a
        // suspicious replay from a sandbox tenant. Refuse to upgrade.
        if (currency !== EXPECTED_CURRENCY) {
          console.warn(`[webhook-paypal] capture.completed currency mismatch: ${currency}, expected ${EXPECTED_CURRENCY}`);
          await _logEvent({
            user_id: userId,
            event_type: 'webhook_currency_mismatch',
            provider_id: captureId,
            amount,
            currency,
            raw_payload: { reason: 'unexpected_currency', expected: EXPECTED_CURRENCY, event },
          });
          _alertOps(
            'Webhook currency mismatch on capture',
            `captureId: ${captureId}\nuser_id: ${userId}\namount: ${amount} ${currency}\nexpected: ${EXPECTED_CURRENCY}`
          );
          break;
        }

        // Idempotency: if subscriptions already has this captureId active, skip.
        const { data: existing } = await supabase
          .from('subscriptions')
          .select('user_id, status, provider_capture_id')
          .eq('user_id', userId)
          .maybeSingle();
        if (existing?.provider_capture_id === captureId && existing.status === 'active') break;

        // W25 P0 #6 fix: derive plan from reference_id (we set this in
        // create-order.js:83 as `${user.id}:${plan}`). Amount-based inference
        // was brittle — it broke silently every time prices changed and was
        // already wrong on every value at audit time. Parsing the reference
        // is unambiguous.
        const pu = resource.supplementary_data?.related_ids
                ? (event.resource?.purchase_units?.[0] || {})
                : (resource.purchase_units?.[0] || {});
        const refId = pu.reference_id || resource.reference_id || '';
        const [, refSku] = String(refId).split(':');
        const VALID_SKUS = ['pro_monthly','pro_annual','premium_monthly','premium_annual','founders'];
        const sku = VALID_SKUS.includes(refSku) ? refSku : null;
        const SKU_TO_TIER = {
          pro_monthly: 'pro', pro_annual: 'pro',
          premium_monthly: 'premium', premium_annual: 'premium',
          founders: 'pro',
        };
        const plan = sku ? SKU_TO_TIER[sku] : null;
        if (!plan || !sku) {
          console.warn(`[webhook-paypal] capture.completed: no plan from reference_id="${refId}"`);
          await _logEvent({
            user_id: userId, event_type: 'webhook_no_plan_match',
            provider_id: captureId, amount, currency,
            raw_payload: { reason: 'unparseable_reference_id', refId },
          });
          break;
        }

        // W27-a #15 — calendar-correct period end (months/years, not 30-day
        // chunks). Buying on 31-Jan now renews on 28-Feb, not 02-Mar.
        const periodEnd = _periodEndForSku(sku, new Date().toISOString());
        const nowIso = new Date().toISOString();

        const { error: upsertErr } = await supabase.from('subscriptions').upsert({
          user_id: userId,
          status: 'active',
          plan,
          provider: 'paypal',
          provider_capture_id: captureId,
          amount_usd: Number(amount),
          current_period_end: periodEnd,
          cancel_at_period_end: false,
          cancelled_at: null,
          updated_at: nowIso,
        }, { onConflict: 'user_id' });
        if (upsertErr) {
          console.error('[webhook-paypal] fallback upsert err:', upsertErr);
          await _logEvent({
            user_id: userId,
            event_type: 'webhook_capture_upsert_failed',
            provider_id: captureId,
            amount,
            currency,
            raw_payload: { event, db_error: upsertErr },
          });
        }

        // W26-d #4/#5: finalize the Founders seat as a fallback if this is
        // a founders SKU and the seat wasn't already finalized by
        // capture-order.js (e.g., the user closed the tab before the
        // capture-order response landed). Idempotent.
        if (sku === 'founders') {
          const { error: finErr } = await supabase.rpc(
            'finalize_founders_seat',
            { p_user_id: userId, p_capture_id: captureId }
          );
          if (finErr) {
            console.error('[webhook-paypal] finalize_founders_seat err:', finErr);
          }
        }
        break;
      }

      case 'PAYMENT.CAPTURE.REFUNDED':
      case 'PAYMENT.CAPTURE.REVERSED': {
        // W26-b #3/#20 — Refund scoping.
        // Previous behaviour matched on user_id ALONE, so refunding an OLD
        // capture would silently downgrade the user's CURRENT (different)
        // active subscription. Now we match on user_id AND provider_capture_id
        // so the refund only affects the exact subscription it pertains to.
        // Refund of a stale capture is logged for audit but does not touch
        // an unrelated active row.
        const captureId = resource.id;
        const links = resource.links || [];
        const upLink = links.find(l => l.rel === 'up');
        if (!upLink) {
          await _logEvent({ user_id: null, event_type: 'webhook_unresolvable_user',
            provider_id: captureId, raw_payload: { reason: 'refund_no_up_link', event } });
          break;
        }
        const orderRes = await fetch(upLink.href, {
          headers: { 'Authorization': `Bearer ${await _getAccessToken()}` },
        });
        if (!orderRes.ok) {
          await _logEvent({ user_id: null, event_type: 'webhook_unresolvable_user',
            provider_id: captureId, raw_payload: { reason: 'refund_order_fetch_failed', event } });
          break;
        }
        const order = await orderRes.json();
        const userId = order.purchase_units?.[0]?.custom_id;
        if (!userId) {
          await _logEvent({ user_id: null, event_type: 'webhook_unresolvable_user',
            provider_id: captureId, raw_payload: { reason: 'refund_no_custom_id', event } });
          break;
        }

        // Look up the subscription that THIS capture funded. Only downgrade
        // if the refund matches the user's CURRENT capture.
        const { data: currentSub } = await supabase
          .from('subscriptions')
          .select('user_id, status, provider_capture_id, plan')
          .eq('user_id', userId)
          .maybeSingle();

        const captureMatches = currentSub?.provider_capture_id === captureId;

        if (!captureMatches) {
          // Stale refund: log + acknowledge but do NOT touch the active row.
          // This is the bug-class of #3/#20: a year-old refund shouldn't kill
          // a current subscription.
          await _logEvent({
            user_id: userId,
            event_type: 'webhook_refund_stale_capture',
            provider_id: captureId,
            raw_payload: {
              reason: 'refund_capture_does_not_match_current_subscription',
              refund_capture_id: captureId,
              current_capture_id: currentSub?.provider_capture_id || null,
              event,
            },
          });
          break;
        }

        // Refund matches the user's current active capture — downgrade them.
        const { error: updErr } = await supabase.from('subscriptions').update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancel_reason: eventType,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('provider_capture_id', captureId);  // belt-and-braces double bind

        if (updErr) {
          console.error('[webhook-paypal] refund update err:', updErr);
        }
        await supabase.from('profiles').update({ plan: 'free' }).eq('id', userId);
        await _logEvent({
          user_id: userId,
          event_type: eventType === 'PAYMENT.CAPTURE.REFUNDED' ? 'refund' : 'reversal',
          provider_id: captureId,
        });
        break;
      }

      case 'BILLING.SUBSCRIPTION.CANCELLED':
      case 'BILLING.SUBSCRIPTION.EXPIRED': {
        const userId = resource.custom_id;
        if (!userId) {
          await _logEvent({ user_id: null, event_type: 'webhook_unresolvable_user',
            provider_id: resource.id || null,
            raw_payload: { reason: 'subscription_event_no_custom_id', event } });
          break;
        }
        await supabase.from('subscriptions').update({
          status: eventType === 'BILLING.SUBSCRIPTION.CANCELLED' ? 'cancelled' : 'expired',
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('user_id', userId);
        await supabase.from('profiles').update({ plan: 'free' }).eq('id', userId);
        await _logEvent({
          user_id: userId,
          event_type: eventType === 'BILLING.SUBSCRIPTION.CANCELLED' ? 'subscription_cancelled' : 'subscription_expired',
          provider_id: resource.id || null,
        });
        break;
      }

      case 'CUSTOMER.DISPUTE.CREATED': {
        // Flag for manual review — don't auto-cancel since most disputes are resolved.
        const orderId = resource.disputed_transactions?.[0]?.seller_transaction_id;
        await _logEvent({
          user_id: null,
          event_type: 'dispute_created',
          provider_id: orderId || resource.dispute_id || resource.id || null,
        });
        if (!orderId) break;
        await supabase.from('subscriptions').update({
          dispute_open: true, updated_at: new Date().toISOString(),
        }).eq('provider_capture_id', orderId);
        break;
      }

      default:
        // Unhandled event types are fine — just acknowledge so PayPal doesn't retry forever.
        await _logEvent({
          user_id: null,
          event_type: 'unhandled:' + eventType,
          provider_id: event.id || null,
        });
    }
    return res.status(200).json({ received: true });
  } catch (e) {
    console.error('webhook-paypal error:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
}
