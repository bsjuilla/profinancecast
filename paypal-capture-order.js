// api/paypal/capture-order.js
// Called after the user approves payment in the PayPal popup.
// Captures the funds (moves money to your PayPal account)
// and upgrades the user's plan in Supabase.

const PAYPAL_BASE = 'https://api-m.paypal.com';

async function getAccessToken() {
  const creds = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  });
  if (!res.ok) throw new Error('PayPal auth failed');
  return (await res.json()).access_token;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orderID, plan } = req.body;
  if (!orderID || !plan) return res.status(400).json({ error: 'Missing orderID or plan' });

  try {
    const token = await getAccessToken();

    // Capture the payment — this moves money to your PayPal account
    const capture = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!capture.ok) {
      const err = await capture.text();
      console.error('Capture error:', err);
      return res.status(502).json({ error: 'Payment capture failed' });
    }

    const captureData = await capture.json();

    if (captureData.status !== 'COMPLETED') {
      return res.status(402).json({ error: 'Payment not completed', status: captureData.status });
    }

    // ── UPGRADE USER IN SUPABASE ──
    // Uncomment and configure once Supabase is set up:
    //
    // import { createClient } from '@supabase/supabase-js'
    // const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    //
    // const userId = req.headers['x-user-id'] // pass from frontend after auth
    // await supabase.from('profiles').update({
    //   plan: plan,
    //   plan_started_at: new Date().toISOString(),
    //   paypal_order_id: orderID,
    //   ai_queries_used: 0,
    //   ai_queries_reset_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    // }).eq('id', userId)

    // Log the payment (important for your records)
    console.log(`PAYMENT CAPTURED: Plan=${plan}, OrderID=${orderID}, Amount=${captureData.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value}`);

    return res.status(200).json({
      status: 'COMPLETED',
      plan,
      orderID,
      captureID: captureData.purchase_units?.[0]?.payments?.captures?.[0]?.id
    });

  } catch (err) {
    console.error('capture-order error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
