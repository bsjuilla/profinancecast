// api/paypal/card-order.js
//
// ⚠️  REMOVED — this endpoint accepted raw card numbers (PAN + CVV) and forwarded
// them to PayPal. Doing that puts the merchant inside PCI-DSS scope (SAQ-D),
// which requires quarterly ASV scans, formal compliance documentation,
// and is illegal to do without that. Even though the data was not stored,
// it transited the server, which is enough to trigger SAQ-D scope.
//
// The replacement: PayPal's hosted card fields (Advanced Checkout) embed
// card inputs in PayPal-controlled iframes inside billing.html. The card
// data goes from the user's browser straight to PayPal — your server only
// ever sees the resulting orderID. That keeps the merchant on SAQ-A scope.
//
// Frontend wiring lives in billing.html (#paypal-card-fields-container).
// Order creation/capture continues to flow through:
//   POST /api/paypal/create-order
//   POST /api/paypal/capture-order
//
// This stub is kept so any clients still pointing at the old URL get a
// clear, honest 410 instead of a silent failure.

export default function handler(req, res) {
  return res.status(410).json({
    error: 'This endpoint has been removed for PCI-DSS compliance.',
    use: 'POST /api/paypal/create-order then capture via the PayPal SDK in billing.html.',
  });
}
