// api/paypal/card-order.js
// Processes a direct card payment via PayPal's Advanced Card Payments API.
// The card number never touches your server in a stored way —
// it passes through only to PayPal's secure servers.
//
// NOTE: PayPal Advanced Card Payments requires your account to be
// approved for card processing. To enable it:
//   1. Log in to paypal.com/businessmanage
//   2. Go to Account Settings → Website Payments
//   3. Enable "PayPal Payments Advanced" or "Hosted Fields"
//   This is free and typically approved within 1-2 business days.

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

  const { plan, amount, card } = req.body;

  const validPlans = { pro: 9.99, premium: 19.99 };
  if (!validPlans[plan] || validPlans[plan] !== amount) {
    return res.status(400).json({ error: 'Invalid plan or amount' });
  }
  if (!card?.number || !card?.expiry_month || !card?.expiry_year || !card?.cvv) {
    return res.status(400).json({ error: 'Missing card details' });
  }

  // Basic card number validation
  const cleanNumber = card.number.replace(/\s/g, '');
  if (cleanNumber.length < 13 || cleanNumber.length > 19 || !/^\d+$/.test(cleanNumber)) {
    return res.status(400).json({ error: 'Invalid card number' });
  }

  try {
    const token = await getAccessToken();

    // Create and immediately capture a card order
    const orderRes = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `pfc-card-${plan}-${Date.now()}`
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: { currency_code: 'USD', value: amount.toFixed(2) },
          description: `ProFinanceCast ${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan`
        }],
        payment_source: {
          card: {
            name: card.name,
            number: cleanNumber,
            expiry: `${card.expiry_year}-${card.expiry_month.toString().padStart(2,'0')}`,
            security_code: card.cvv,
            billing_address: {
              country_code: 'MU' // Mauritius — update if user is elsewhere
            }
          }
        }
      })
    });

    if (!orderRes.ok) {
      const errBody = await orderRes.json().catch(() => ({}));
      console.error('Card order error:', errBody);
      const userMsg = errBody?.details?.[0]?.description || 'Card payment was declined';
      return res.status(402).json({ error: userMsg });
    }

    const orderData = await orderRes.json();

    if (orderData.status === 'COMPLETED') {
      // Card was automatically captured
      console.log(`CARD PAYMENT: Plan=${plan}, OrderID=${orderData.id}`);
      return res.status(200).json({ status: 'COMPLETED', orderID: orderData.id });
    }

    // If CREATED/APPROVED, capture it
    if (orderData.status === 'APPROVED' || orderData.status === 'CREATED') {
      const captureRes = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderData.id}/capture`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      const captureData = await captureRes.json();
      if (captureData.status === 'COMPLETED') {
        return res.status(200).json({ status: 'COMPLETED', orderID: orderData.id });
      }
    }

    return res.status(402).json({ error: 'Payment could not be completed. Please try PayPal instead.' });

  } catch (err) {
    console.error('card-order error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
