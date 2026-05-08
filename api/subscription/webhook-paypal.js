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

const PAYPAL_BASE = (process.env.PAYPAL_ENV === 'sandbox')
  ? 'https://api-m.sandbox.paypal.com'
  : 'https://api-m.paypal.com';

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
 * Returns true only when PayPal confirms the signature is valid.
 */
async function _verifySignature(req) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    console.error('PAYPAL_WEBHOOK_ID not configured — refusing to process webhook');
    return false;
  }
  const token = await _getAccessToken();
  const verifyRes = await fetch(`${PAYPAL_BASE}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_algo:         req.headers['paypal-auth-algo'],
      cert_url:          req.headers['paypal-cert-url'],
      transmission_id:   req.headers['paypal-transmission-id'],
      transmission_sig:  req.headers['paypal-transmission-sig'],
      transmission_time: req.headers['paypal-transmission-time'],
      webhook_id:        webhookId,
      webhook_event:     req.body,
    }),
  });
  if (!verifyRes.ok) return false;
  const data = await verifyRes.json();
  return data.verification_status === 'SUCCESS';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 1. Verify the webhook actually came from PayPal
  const valid = await _verifySignature(req).catch(() => false);
  if (!valid) {
    console.warn('Rejected unverified PayPal webhook');
    return res.status(401).json({ error: 'Signature verification failed' });
  }

  const event = req.body || {};
  const eventType = event.event_type;
  const resource  = event.resource || {};

  const supabase = createClient(
    process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  // Helper: append-only event log for audit M3.
  const _logEvent = async (extra) => {
    try {
      await supabase.from('subscription_events').insert({
        user_id: extra.user_id || null,
        event_type: extra.event_type || eventType,
        provider: 'paypal',
        provider_id: extra.provider_id || null,
        amount: extra.amount || null,
        currency: extra.currency || null,
        raw_payload: extra.raw_payload || event,
      });
    } catch (e) {
      console.error('[webhook-paypal] event log non-fatal:', e?.message || e);
    }
  };

  try {
    switch (eventType) {
      case 'PAYMENT.CAPTURE.COMPLETED': {
        // Audit H2 fallback: if api/paypal/capture-order.js 5xxed (or was
        // never reached), upgrade the user from this verified webhook event.
        const captureId = resource.id;
        const amount = resource.amount?.value;
        const currency = resource.amount?.currency_code || 'USD';
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
          console.warn(`[webhook-paypal] capture.completed without resolvable userId (capture ${captureId})`);
          break;
        }

        // Idempotency: if subscriptions already has this captureId active, skip.
        const { data: existing } = await supabase
          .from('subscriptions')
          .select('user_id, status, provider_capture_id')
          .eq('user_id', userId)
          .maybeSingle();
        if (existing?.provider_capture_id === captureId && existing.status === 'active') break;

        // Determine plan from amount (server is source of truth).
        const v = Number(amount).toFixed(2);
        let plan = null;
        if (v === '9.99' || v === '9.00') plan = 'pro';
        else if (v === '69.00') plan = 'pro';      // annual
        else if (v === '149.00') plan = 'pro';     // founders lifetime
        else if (v === '19.99') plan = 'premium';
        if (!plan) {
          console.warn(`[webhook-paypal] capture.completed amount ${v} ${currency} matched no plan`);
          break;
        }

        const days = (v === '69.00') ? 366 : (v === '149.00') ? 36500 : 30;
        const periodEnd = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
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
        break;
      }

      case 'PAYMENT.CAPTURE.REFUNDED':
      case 'PAYMENT.CAPTURE.REVERSED': {
        // Pull the original order to find the user_id we stored as custom_id
        const captureId = resource.id;
        const links = resource.links || [];
        const upLink = links.find(l => l.rel === 'up');
        if (!upLink) break;
        const orderRes = await fetch(upLink.href, {
          headers: { 'Authorization': `Bearer ${await _getAccessToken()}` },
        });
        if (!orderRes.ok) break;
        const order = await orderRes.json();
        const userId = order.purchase_units?.[0]?.custom_id;
        if (!userId) break;

        await supabase.from('subscriptions').update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancel_reason: eventType,
          updated_at: new Date().toISOString(),
        }).eq('user_id', userId);
        await supabase.from('profiles').update({ plan: 'free' }).eq('id', userId);
        await _logEvent({
          user_id: userId,
          event_type: eventType === 'PAYMENT.CAPTURE.REFUNDED' ? 'refund' : 'reversal',
          provider_id: captureId,
        });
        console.log(`Cancelled subscription for ${userId} via ${eventType} (capture ${captureId})`);
        break;
      }

      case 'BILLING.SUBSCRIPTION.CANCELLED':
      case 'BILLING.SUBSCRIPTION.EXPIRED': {
        const userId = resource.custom_id;
        if (!userId) break;
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
        console.log(`PayPal webhook: ignoring ${eventType}`);
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
