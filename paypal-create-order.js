// api/paypal/create-order.js
// Creates a PayPal order and returns the orderID to the frontend.
// The frontend then shows the PayPal popup for the user to approve.
//
// SETUP — add these to Vercel Environment Variables:
//   PAYPAL_CLIENT_ID     → your PayPal app Live Client ID
//   PAYPAL_CLIENT_SECRET → your PayPal app Live Secret
//   Both are found at: developer.paypal.com → Your App → Live credentials

const PAYPAL_BASE = 'https://api-m.paypal.com'; // live endpoint
// For testing use: 'https://api-m.sandbox.paypal.com'

async function getAccessToken() {
  const creds = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  if (!res.ok) throw new Error('Could not authenticate with PayPal');
  const data = await res.json();
  return data.access_token;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { plan, amount } = req.body;

  // Validate amount matches what we expect — prevents tampering
  const validPlans = { pro: 9.99, premium: 19.99 };
  if (!validPlans[plan] || validPlans[plan] !== amount) {
    return res.status(400).json({ error: 'Invalid plan or amount' });
  }

  try {
    const token = await getAccessToken();

    const order = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `pfc-${plan}-${Date.now()}` // idempotency key
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: {
            currency_code: 'USD',
            value: amount.toFixed(2)
          },
          description: `ProFinanceCast ${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan — Monthly`,
          soft_descriptor: 'PROFINANCECAST'
        }],
        application_context: {
          brand_name: 'ProFinanceCast',
          user_action: 'PAY_NOW',
          return_url: 'https://profinancecast.com/billing.html',
          cancel_url: 'https://profinancecast.com/billing.html'
        }
      })
    });

    if (!order.ok) {
      const err = await order.text();
      console.error('PayPal create order error:', err);
      return res.status(502).json({ error: 'Could not create PayPal order' });
    }

    const orderData = await order.json();
    return res.status(200).json({ orderID: orderData.id });

  } catch (err) {
    console.error('create-order error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
