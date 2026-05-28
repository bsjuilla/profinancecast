// ── CONFIG — sourced from pfc-config.js (single source of truth) ──
const PAYPAL_CLIENT_ID = (window.PFC_CONFIG && window.PFC_CONFIG.PAYPAL_CLIENT_ID) || '';

let currentPlan       = 'free';
let checkoutPlan      = 'pro_annual';
let checkoutAmt       = 69;
let billingInterval   = 'annual';   // 'monthly' | 'annual' — drives Pro card price + CTA SKU
let paypalLoaded      = false;

// Human label lookup for SKU codes
const PLAN_LABELS = {
  pro_monthly:     'Pro (monthly)',
  pro_annual:      'Pro (annual)',
  premium_monthly: 'Premium (monthly)',
  premium_annual:  'Premium (annual)',
  founders:        'Founders Lifetime',
};

// Attach the user's Supabase JWT to PayPal API calls. Without this header the
// server returns 401, which is exactly what we want when an unauth'd browser
// pokes at /api/paypal/* directly.
function _authHeaders() {
  const session = (typeof PFCAuth !== 'undefined') ? PFCAuth.getSession() : null;
  const token = session?.access_token;
  return token ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
               : { 'Content-Type': 'application/json' };
}

// ── BILLING-INTERVAL TOGGLE ──
// Updates the Pro card price + CTA SKU. Default is annual (anchors €6.58/mo).
function setBillingInterval(interval) {
  billingInterval = interval === 'monthly' ? 'monthly' : 'annual';
  document.getElementById('seg-monthly').classList.toggle('active', billingInterval === 'monthly');
  document.getElementById('seg-annual').classList.toggle('active',  billingInterval === 'annual');
  document.getElementById('seg-monthly').setAttribute('aria-selected', billingInterval === 'monthly');
  document.getElementById('seg-annual').setAttribute('aria-selected',  billingInterval === 'annual');

  const num    = document.getElementById('pro-price-num');
  const suffix = document.getElementById('pro-price-suffix');
  const sash   = document.getElementById('sash-annual');
  // Premium card mirrors the Pro toggle (Wave-14 §C).
  const pNum    = document.getElementById('premium-price-num');
  const pSuffix = document.getElementById('premium-price-suffix');
  const pSash   = document.getElementById('sash-annual-premium');
  if (billingInterval === 'monthly') {
    num.textContent    = '€9';
    suffix.textContent = '· /month';
    if (sash) sash.hidden = true;
    if (pNum)    pNum.textContent    = '€19';
    if (pSuffix) pSuffix.textContent = '· /month';
    if (pSash)   pSash.hidden = true;
  } else {
    num.textContent    = '€79';
    suffix.textContent = '· /year';
    if (sash) sash.hidden = false;
    if (pNum)    pNum.textContent    = '€169';
    if (pSuffix) pSuffix.textContent = '· /year';
    if (pSash)   pSash.hidden = false;
  }
}

// Pro CTA — picks the right SKU based on the toggle
function openProCheckout() {
  if (billingInterval === 'monthly') {
    openCheckout('pro_monthly', 9);
  } else {
    openCheckout('pro_annual', 79);
  }
}

// Premium CTA — picks the right SKU based on the toggle (Wave-14 §C).
function openPremiumCheckout() {
  if (billingInterval === 'monthly') {
    openCheckout('premium_monthly', 19);
  } else {
    openCheckout('premium_annual', 169);
  }
}

// ── OPEN CHECKOUT ──
function openCheckout(plan, amount) {
  // EU CRD waiver gate (added 2026-05-23) — for the Founders one-time
  // purchase, refuse to proceed if the user has not explicitly ticked the
  // withdrawal-waiver checkbox. The checkbox is in billing.html next to the
  // founders-cta button. Pro/Premium recurring SKUs are unaffected (they
  // retain the standard 14-day withdrawal right under terms § 7a).
  if (plan === 'founders') {
    const waiverEl = document.getElementById('founders-waiver');
    if (!waiverEl || !waiverEl.checked) {
      // Don't open the modal. Visually nudge the user to the checkbox.
      const label = waiverEl ? waiverEl.closest('label') : null;
      if (label) {
        label.scrollIntoView({ behavior: 'smooth', block: 'center' });
        label.style.transition = 'box-shadow 200ms ease-out';
        label.style.boxShadow = '0 0 0 3px rgba(212,175,106,0.5)';
        setTimeout(() => { label.style.boxShadow = ''; }, 1200);
      }
      return;
    }
  }

  // CDO Wave-14: pfc.pro_intent fires on any paid-tier CTA. The `source` prop
  // captures which SKU drove it so we can split Pro vs Premium vs Founders
  // intent without leaking the amount (CDO PII rule — no raw 3+ digit numbers).
  if (window.PFCFunnel) {
    window.PFCFunnel.track('pfc.pro_intent', { source: plan });
  }
  checkoutPlan = plan;
  checkoutAmt  = amount;
  const label  = PLAN_LABELS[plan] || 'Pro';
  const billingLabel =
    plan === 'pro_monthly'     ? 'Monthly' :
    plan === 'pro_annual'      ? 'Annual'  :
    plan === 'premium_monthly' ? 'Monthly' :
    plan === 'premium_annual'  ? 'Annual'  :
    plan === 'founders'        ? 'One-time' : 'Annual';

  document.getElementById('modal-title').textContent    = 'Upgrade to ' + label;
  document.getElementById('summary-plan').textContent   = label;
  const billingEl = document.getElementById('summary-billing');
  if (billingEl) billingEl.textContent = billingLabel;
  document.getElementById('summary-total').textContent  = '€' + amount.toFixed(2);

  document.getElementById('overlay').classList.add('open');
  document.getElementById('success-screen').classList.remove('show');
  document.getElementById('payment-form').style.display = 'block';
  setMethod('paypal');
  loadPayPal();
}

function closeCheckout() {
  document.getElementById('overlay').classList.remove('open');
}

function closeOnOverlay(e) {
  if (e.target === document.getElementById('overlay')) closeCheckout();
}

// ── METHOD TOGGLE ──
function setMethod(m) {
  document.getElementById('method-paypal').classList.toggle('active', m === 'paypal');
  document.getElementById('method-card').classList.toggle('active', m === 'card');
  document.getElementById('section-paypal').classList.toggle('show', m === 'paypal');
  document.getElementById('section-card').classList.toggle('show', m === 'card');
}

// ── LOAD PAYPAL SDK ──
// W26-a #11: PayPal client IDs are always [A-Za-z0-9_-]. If pfc-config.js is
// tainted (misedit, copy-paste from a phishing page, or a future config
// supply-chain bug), refuse to interpolate the value into <script src>
// rather than letting an attacker-controlled string flow into the URL.
// Real PayPal client IDs are ~80 chars; we allow 30..160 to stay forgiving.
const PAYPAL_CLIENT_ID_RE = /^[A-Za-z0-9_-]{30,160}$/;

function loadPayPal() {
  if (paypalLoaded) { renderPayPalButtons(); return; }
  if (!PAYPAL_CLIENT_ID || PAYPAL_CLIENT_ID === 'YOUR_PAYPAL_CLIENT_ID') {
    document.getElementById('paypal-button-container').innerHTML =
      '<div style="background:var(--pfc-gold-soft);border-radius:var(--radius-sm);padding:var(--space-4);font-size:13px;color:var(--pfc-gold);line-height:1.6;">' +
      '<strong>Setup needed:</strong> Add your PayPal Client ID to PFC_CONFIG.PAYPAL_CLIENT_ID. See pfc-config.js.</div>';
    return;
  }
  if (!PAYPAL_CLIENT_ID_RE.test(PAYPAL_CLIENT_ID)) {
    // Don't echo the value back to the DOM — even in an error message — to
    // avoid making the page useful for testing XSS payloads against the SDK URL.
    console.error('[billing] PAYPAL_CLIENT_ID failed format validation; refusing to load SDK.');
    document.getElementById('paypal-button-container').innerHTML =
      '<div style="background:#fee;border-radius:var(--radius-sm);padding:var(--space-4);font-size:13px;color:#900;line-height:1.6;">' +
      '<strong>Payment unavailable:</strong> Configuration error. Please contact support.</div>';
    return;
  }
  // W28-b #39 — pin funding sources so PayPal can't surface "Pay Later" /
  // Venmo / region-specific buttons whose checkout flows we haven't tested.
  // enable-funding=card,paypal restricts the SDK to the two methods we
  // actually support; disable-funding=paylater,venmo is belt-and-braces in
  // case PayPal changes the enable-funding default to include them later.
  const script  = document.createElement('script');
  script.src    = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&currency=EUR&intent=capture&components=buttons&enable-funding=card,paypal&disable-funding=paylater,venmo`;
  script.onload = () => { paypalLoaded = true; renderPayPalButtons(); };
  script.onerror = () => {
    document.getElementById('paypal-button-container').innerHTML =
      '<div style="color:var(--pfc-terracotta);font-size:13px;padding:var(--space-3);">Could not load PayPal. Please check your internet connection.</div>';
  };
  document.head.appendChild(script);
}

// ── RENDER PAYPAL BUTTONS ──
function renderPayPalButtons() {
  const container = document.getElementById('paypal-button-container');
  container.innerHTML = '';
  if (typeof paypal === 'undefined') return;

  // W29-b #14 — Recurring (Billing Plans) vs one-shot (Orders) decision.
  // Founders Lifetime is always one-shot; everything else attempts the
  // subscription flow first. The server returns 503 with fallback:'use_create_order'
  // when the PAYPAL_PLAN_ID_* env vars aren't configured — we catch that and
  // render the one-shot button instead.
  if (checkoutPlan === 'founders') {
    return _renderOneShotButton();
  }
  // Recurring SKU: try subscription, fall back to one-shot on 503/feature-off.
  _tryRenderSubscriptionButton().catch(err => {
    console.warn('[billing] subscription flow unavailable, falling back to one-shot:', err?.message);
    _renderOneShotButton();
  });
}

// W29-b — Render the recurring-subscription button. Throws if the server
// returns "feature not configured" (503), causing the caller to fall back
// to the one-shot button.
async function _tryRenderSubscriptionButton() {
  // Pre-flight probe — call create-subscription without committing. If the
  // server returns 503 with fallback:'use_create_order', the feature isn't
  // configured for this SKU yet. We use a HEAD-like POST that we'll actually
  // commit in createSubscription below; the probe is wasted work in the
  // happy path but skipped in fallback. Net cost: one extra round-trip when
  // recurring IS configured — acceptable trade for clean fallback.
  //
  // Implementation: actually we delegate the "feature check" to the
  // createSubscription callback itself — the SDK swallows the throw and
  // re-renders the button as failed, which isn't great UX. So we probe
  // FIRST with a real call and either render the subscription button OR
  // throw to trigger fallback.
  // B-P0-PAYPAL-TIMEOUT fix (audit 2026-05-25) — pre-fix the probe had
  // no timeout. If the PayPal create-subscription endpoint hung
  // (upstream PayPal slow, network blip), the modal sat with no
  // feedback indefinitely and the user could rapid-click "Subscribe"
  // triggering duplicate subscription creation. 12s ceiling is well
  // above PayPal's typical p99 (~3s) but firmly below user-impatience
  // threshold. AbortController fires a clean error path that's already
  // handled by the caller's catch → fallback flow.
  const _probeAbort = new AbortController();
  const _probeTimer = setTimeout(() => _probeAbort.abort(), 12_000);
  let probe;
  try {
    probe = await fetch('/api/paypal/create-subscription', {
      method: 'POST',
      headers: _authHeaders(),
      body: JSON.stringify({ plan: checkoutPlan }),
      signal: _probeAbort.signal,
    });
  } catch (e) {
    clearTimeout(_probeTimer);
    if (e && e.name === 'AbortError') {
      throw new Error('subscription_probe_timeout');
    }
    throw e;
  }
  clearTimeout(_probeTimer);

  if (probe.status === 503) {
    // Feature not configured — fall back. (Throw triggers the catch in caller.)
    throw new Error('subscription_flow_disabled');
  }

  let probeData;
  try { probeData = await probe.json(); }
  catch (_) { throw new Error('subscription_response_unparseable'); }

  if (!probe.ok || !probeData.subscriptionID || !probeData.approveUrl) {
    // 4xx / 5xx — caller handles fallback. Server has already logged details.
    throw new Error(probeData.error || 'subscription_create_failed');
  }

  // We already created a real subscription. Render a single button that
  // sends the user to the approveUrl. PayPal then redirects back to
  // /billing.html?subscription=ok and the BILLING.SUBSCRIPTION.ACTIVATED
  // webhook lands to flip our DB row from APPROVAL_PENDING → ACTIVE.
  //
  // W29-d UX fix: button copy now communicates that BOTH PayPal account
  // and direct card payment are supported. PayPal's hosted approval page
  // shows "Pay with Debit or Credit Card" as a primary option below the
  // PayPal login, so users without a PayPal account can still subscribe.
  // Without this copy fix, conversions were leaking from card-only users
  // who saw "PayPal" and bounced.
  const container = document.getElementById('paypal-button-container');

  const btn = document.createElement('a');
  btn.href = probeData.approveUrl;
  btn.className = 'pay-now-btn';
  btn.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:10px;text-align:center;text-decoration:none;background:#ffc439;color:#003087;font-weight:600;padding:12px 16px;border-radius:6px;';
  btn.setAttribute('data-pfc-subscription-id', probeData.subscriptionID);

  // PayPal logo + Card icon next to button label so the dual-method
  // story is visible at a glance.
  const icons = document.createElement('span');
  icons.style.cssText = 'display:inline-flex;align-items:center;gap:6px;';
  icons.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M12.5 3C12 1.5 10.5 1 9 1H4L2 12h3l.5-3h2c3 0 5.5-1.5 5.5-4.5 0-.8-.2-1.1-.5-1.5z" fill="#003087"/><path d="M13.5 5c-.5 2.5-2.5 4-5.5 4H6.5L5.5 14h3l.3-2h1.7c3 0 5-1.5 5.5-4.5.2-1-.1-2-.5-2.5z" fill="#009CDE"/></svg>' +
    '<svg width="20" height="14" viewBox="0 0 20 14" fill="none" aria-hidden="true"><rect x="1" y="1" width="18" height="12" rx="1.5" stroke="#003087" stroke-width="1.3" fill="none"/><path d="M1 4.5h18" stroke="#003087" stroke-width="1.3"/><rect x="3" y="8" width="4" height="2" rx=".5" fill="#003087" opacity=".6"/></svg>';
  btn.appendChild(icons);

  const label = document.createElement('span');
  // Card-first framing (2026-05-28): "Pay with card or PayPal" puts the
  // payment method most customers actually use first. Conversion-audit
  // hypothesis: card-only users were bouncing on the "PayPal" lede even
  // though the underlying flow supports card without a PayPal account.
  label.textContent = 'Pay with card or PayPal';
  btn.appendChild(label);

  container.appendChild(btn);

  // Acceptance-marks strip (2026-05-28): simplified Visa / Mastercard /
  // Amex marks shown at point of payment to communicate "card is a real
  // first-class option here." Inline SVG — no external loads (CSP-safe),
  // ~600 bytes total. Each mark carries an aria-label so screen readers
  // announce them as the brand, not as "image." These are simplified
  // acceptance marks (not the licensed full logos) which is the
  // standard pattern for checkout pages everywhere.
  const cardStrip = document.createElement('div');
  // Class added for review finding #15 — gives a future strict-CSP
  // stylesheet a hook to restate the layout via `.pfc-card-strip { ... }`
  // without depending on the inline style.cssText below (which may be
  // stripped under `style-src` policies that omit 'unsafe-inline').
  cardStrip.className = 'pfc-card-strip';
  cardStrip.style.cssText = 'display:flex;justify-content:center;align-items:center;gap:8px;margin-top:10px;';
  cardStrip.setAttribute('aria-label', 'Cards accepted: Visa, Mastercard, American Express');
  cardStrip.innerHTML =
    '<svg viewBox="0 0 32 12" width="32" height="12" role="img" aria-label="Visa"><rect width="32" height="12" rx="1.5" fill="#1A1F71"/><text x="16" y="9" text-anchor="middle" font-family="Arial,sans-serif" font-size="7" font-weight="900" fill="white" letter-spacing="0.4">VISA</text></svg>' +
    '<svg viewBox="0 0 32 12" width="32" height="12" role="img" aria-label="Mastercard"><rect width="32" height="12" rx="1.5" fill="#ffffff" stroke="#dcdcdc" stroke-width="0.6"/><circle cx="13" cy="6" r="3.6" fill="#EB001B"/><circle cx="19" cy="6" r="3.6" fill="#F79E1B" fill-opacity="0.85"/></svg>' +
    '<svg viewBox="0 0 32 12" width="32" height="12" role="img" aria-label="American Express"><rect width="32" height="12" rx="1.5" fill="#006FCF"/><text x="16" y="9" text-anchor="middle" font-family="Arial,sans-serif" font-size="6" font-weight="900" fill="white" letter-spacing="0.3">AMEX</text></svg>';
  container.appendChild(cardStrip);

  // Helper line — explicit on both renewal AND card-without-paypal-account.
  const note = document.createElement('div');
  note.style.cssText = 'margin-top:8px;font-size:11px;color:var(--pfc-ink-muted);text-align:center;line-height:1.5;';
  note.innerHTML =
    'Visa, Mastercard, American Express, or any major debit card &mdash; ' +
    '<strong>no PayPal account needed</strong>.<br>' +
    'Renews automatically. Cancel any time &mdash; Pro stays active until period end.';
  container.appendChild(note);
}

// W29-b — Render the original one-shot Orders button. Used for Founders
// SKU always, and for Pro/Premium SKUs when subscription flow is disabled
// (env-var fallback).
function _renderOneShotButton() {
  paypal.Buttons({
    style: {
      layout:  'vertical',
      color:   'gold',
      shape:   'rect',
      label:   'pay',
      height:  44
    },

    // Step 1: create the order on your server (auth required)
    createOrder: async () => {
      // For Founders, forward the EU CRD waiver acknowledgement to the
      // server so an attacker calling /api/paypal/create-order directly
      // can't bypass the client-side checkbox gate (defense-in-depth).
      const body = { plan: checkoutPlan };
      if (checkoutPlan === 'founders') {
        const cb = document.getElementById('founders-waiver');
        body.waiver_acknowledged = !!(cb && cb.checked);
      }
      const res = await fetch('/api/paypal/create-order', {
        method: 'POST',
        headers: _authHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Order creation failed');
      return data.orderID;
    },

    // Step 2: capture the payment, then refresh entitlements from server
    onApprove: async (data) => {
      const res = await fetch('/api/paypal/capture-order', {
        method: 'POST',
        headers: _authHeaders(),
        body: JSON.stringify({ orderID: data.orderID, plan: checkoutPlan }),
      });
      const result = await res.json();
      if (result.status === 'COMPLETED') {
        // Force the entitlements module to fetch the new plan from the server
        if (typeof PFCPlan !== 'undefined') await PFCPlan.refresh();
        showSuccess(checkoutPlan);
        return;
      }
      // W28-b #34 — error matrix.
      // Server returns structured errors; map HTTP status + flags to a
      // user-message + recovery action. captureID is shown as a copy-able
      // reference so support can find the transaction immediately.
      _showCaptureError(res.status, result);
    },

    onError: (err) => {
      console.error('PayPal error:', err);
      _showCaptureError(0, { error: 'paypal_sdk_error', _sdkErr: String(err?.message || err) });
    },

    onCancel: () => {
      // User closed PayPal popup — do nothing
    }
  }).render('#paypal-button-container');
}

// W29-b — Handle return from PayPal subscription approval.
// PayPal redirects to /billing.html?subscription=ok after approval. We:
//   1. Strip the query string from the URL (don't leave the marker in the
//      browser history)
//   2. Refresh PFCPlan to pick up the new active sub
//   3. Show the success screen
// The webhook BILLING.SUBSCRIPTION.ACTIVATED will arrive within a few seconds
// and finalize the DB state; PFCPlan.refresh() pulls the active plan.
async function _handleSubscriptionReturn() {
  try {
    const params = new URLSearchParams(location.search);
    if (params.get('subscription') === 'ok') {
      history.replaceState(null, '', location.pathname);
      if (typeof PFCPlan !== 'undefined') {
        // The webhook may not have landed yet; poll PFCPlan.refresh a few
        // times so the UI flips to Pro as soon as the server has the row.
        for (let i = 0; i < 5; i++) {
          await PFCPlan.refresh();
          if (PFCPlan.get() !== 'free') break;
          await new Promise(r => setTimeout(r, 1500));
        }
      }
      // Show the success screen (re-use existing checkout-modal success state)
      const successScreen = document.getElementById('success-screen');
      const paymentForm   = document.getElementById('payment-form');
      const successMsg    = document.getElementById('success-msg');
      const overlay       = document.getElementById('overlay');
      if (overlay)        overlay.classList.add('active');
      if (paymentForm)    paymentForm.style.display = 'none';
      if (successScreen)  successScreen.classList.add('show');
      if (successMsg) {
        successMsg.textContent = "Auto-renewing subscription approved. Your next charge will appear in PayPal on the renewal date.";
      }
    } else if (params.get('subscription') === 'cancel') {
      // User clicked Cancel at PayPal — clean the URL, no state change.
      history.replaceState(null, '', location.pathname);
    }
  } catch (_) { /* silently ignore — non-critical UX */ }
}
if (typeof document !== 'undefined') {
  if (document.readyState !== 'loading') _handleSubscriptionReturn();
  else document.addEventListener('DOMContentLoaded', _handleSubscriptionReturn, { once: true });
}

// W28-b #34 — capture-error matrix.
// Maps HTTP status + server payload to a user-message and a recovery
// action. Replaces the previous alert() that dumped raw server error
// strings at the user. Surfaces captureID when present so support can
// find the transaction in PayPal in one query.
function _showCaptureError(httpStatus, result) {
  const captureId = result?.captureID || result?.captureId || null;
  const refundIssued = result?.refundIssued === true;

  // Decide the user-visible message + recovery hint.
  let title = 'Payment could not be completed';
  let body  = 'Please try again. If the problem keeps happening, email support@profinancecast.com.';
  let action = 'retry';

  if (httpStatus === 409) {
    if (refundIssued) {
      title = 'Refund issued automatically';
      body  = 'The captured amount didn\'t match the expected price, so we\'ve refunded it. The refund should appear in 3-5 business days.';
      action = 'support';
    } else if (result?.status === 'ALREADY_CAPTURED') {
      title = 'This order has already been processed';
      body  = 'Refresh the page — your account should already be upgraded. If not, contact support.';
      action = 'refresh';
    } else {
      title = 'Payment amount didn\'t match';
      body  = result?.error || 'Our team has been notified and will issue a manual refund within 24 hours.';
      action = 'support';
    }
  } else if (httpStatus === 403) {
    title = 'Account verification needed';
    body  = result?.error || 'Please confirm your email address, then try again.';
    action = 'verify-email';
  } else if (httpStatus === 401) {
    title = 'Please sign in again';
    body  = 'Your session expired during checkout. Sign in and try once more.';
    action = 'reauth';
  } else if (httpStatus === 500 && result?.retryable) {
    title = 'Payment captured but upgrade pending';
    body  = 'Your payment went through but your account hasn\'t flipped yet. Refresh in a moment, or contact support if Pro doesn\'t appear within 60 seconds.';
    action = 'refresh';
  } else if (httpStatus === 502) {
    title = 'Could not reach PayPal';
    body  = 'A transient error stopped the capture. Please try again in a moment.';
    action = 'retry';
  } else if (httpStatus === 0) {
    title = 'Network error during payment';
    body  = 'Check your connection and try again.';
    action = 'retry';
  }

  const container = document.getElementById('paypal-button-container');
  if (!container) return;

  // Build the error block using DOM APIs only — never innerHTML on
  // user-controlled data. CSP forbids inline event handlers
  // (script-src-attr 'none') and the bootstrap dispatcher doesn't
  // re-wire dynamically-inserted [data-pfc-on-click] nodes, so we use
  // real addEventListener calls below.
  container.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.style.cssText = 'background:rgba(199,84,80,0.06);border:1px solid rgba(199,84,80,0.25);border-radius:8px;padding:14px 16px;font-size:13px;color:var(--pfc-ink);line-height:1.55;';

  const titleEl = document.createElement('div');
  titleEl.style.cssText = 'font-weight:600;color:var(--pfc-terracotta);margin-bottom:6px;';
  titleEl.textContent = title;
  wrap.appendChild(titleEl);

  const bodyEl = document.createElement('div');
  bodyEl.style.cssText = 'margin-bottom:10px;';
  bodyEl.textContent = body;
  wrap.appendChild(bodyEl);

  if (captureId) {
    const refRow = document.createElement('div');
    refRow.style.cssText = 'font-size:11px;color:var(--pfc-ink-muted);margin-bottom:8px;';
    refRow.appendChild(document.createTextNode('Reference: '));
    const code = document.createElement('code');
    code.style.cssText = 'user-select:all;background:rgba(0,0,0,0.05);padding:1px 5px;border-radius:3px;';
    code.textContent = captureId;
    refRow.appendChild(code);
    wrap.appendChild(refRow);
  }

  // Recovery action — varies by error class. Use real elements + real
  // listeners so CSP (script-src-attr 'none') doesn't strip them.
  let action_el;
  if (action === 'retry') {
    action_el = document.createElement('button');
    action_el.className = 'pay-now-btn';
    action_el.textContent = 'Try again';
    action_el.addEventListener('click', () => {
      if (typeof renderPayPalButtons === 'function') renderPayPalButtons();
    });
  } else if (action === 'refresh') {
    action_el = document.createElement('button');
    action_el.className = 'pay-now-btn';
    action_el.textContent = 'Refresh page';
    action_el.addEventListener('click', () => location.reload());
  } else if (action === 'reauth') {
    action_el = document.createElement('a');
    action_el.className = 'pay-now-btn';
    action_el.style.cssText = 'display:inline-block;text-decoration:none;text-align:center;';
    action_el.href = 'auth.html?next=' + encodeURIComponent(location.pathname);
    action_el.textContent = 'Sign in';
  } else if (action === 'verify-email') {
    action_el = document.createElement('a');
    action_el.className = 'pay-now-btn';
    action_el.style.cssText = 'display:inline-block;text-decoration:none;text-align:center;';
    action_el.href = 'settings.html#email';
    action_el.textContent = 'Verify email';
  } else {
    action_el = document.createElement('a');
    action_el.className = 'pay-now-btn';
    action_el.style.cssText = 'display:inline-block;text-decoration:none;text-align:center;';
    action_el.href = 'mailto:support@profinancecast.com?subject=' +
      encodeURIComponent('Payment issue' + (captureId ? ' ' + captureId : ''));
    action_el.textContent = 'Contact support';
  }
  action_el.style.marginTop = '4px';
  wrap.appendChild(action_el);
  container.appendChild(wrap);
}

// Card-payment processing flows entirely through the PayPal SDK above
// (the user picks "Debit or Credit Card" inside the PayPal popup).
// No raw card data ever touches our server.

// ── SUCCESS ──
function showSuccess(plan) {
  document.getElementById('payment-form').style.display = 'none';
  document.getElementById('success-screen').classList.add('show');
  // All SKUs grant Pro features. Founders gets a slightly warmer prefix.
  const base = "All Pro features are active — 200 Sage messages a month, unlimited scenarios, comparison tools, and a quarterly Report Card.";
  const msg  = (plan === 'founders') ? "You're a Founder. " + base : base;
  document.getElementById('success-msg').textContent = msg;
  upgradePlan(plan);
}

function onPaymentSuccess() {
  closeCheckout();
  window.location.href = 'dashboard.html';
}

// All paid SKUs elevate the user. pro_* / founders -> Pro tier (200 Sage).
// premium_* -> Premium tier (500 Sage). Wave-14 §C.
function upgradePlan(plan) {
  const isPremium = plan === 'premium_monthly' || plan === 'premium_annual';
  currentPlan = isPremium ? 'premium' : 'pro';
  const sageCap   = isPremium ? 500 : 200;
  const tierLabel = isPremium ? 'Premium Plan' : 'Pro Plan';
  const desc      = sageCap + ' Sage messages a month · all Pro features active';

  document.getElementById('banner-plan-name').textContent = tierLabel;
  document.getElementById('banner-plan-desc').textContent = desc;
  document.getElementById('usage-text').textContent       = '0 / ' + sageCap;
  document.getElementById('usage-fill').style.width       = '0%';
  // Sidebar plan badge is updated by PFCPlan.applyBadges() on the next
  // refresh tick — no need to write directly to the canonical [data-plan-badge].
  document.getElementById('cancel-btn').style.display     = 'inline-block';

  // W28-d #37 — billing history is now sourced from /api/subscription/history
  // (subscription_events table) on every page load, so we don't need to write
  // a synthetic optimistic row here. The real row will appear within a few
  // seconds when refreshBillingHistory() is called after the webhook fires;
  // worst case the user sees it on their next page load.
  // We still kick off a refresh here so the row appears as soon as
  // subscription_events catches up.
  if (typeof refreshBillingHistory === 'function') {
    setTimeout(() => refreshBillingHistory(), 1500);
  }
}

// W28-d #37 — fetch real billing history from the server and render it
// into #billing-body. Replaces the previous synthetic one-row write that
// disappeared on refresh. Safe to call at any time; renders nothing when
// the user is unauthenticated.
async function refreshBillingHistory() {
  const tbody = document.getElementById('billing-body');
  if (!tbody) return;
  // Don't blow away the existing placeholder until we have data.
  let headers;
  try { headers = _authHeaders(); }
  catch (_) { return; /* not signed in — leave the empty-state row */ }

  let data;
  try {
    const res = await fetch('/api/subscription/history?limit=20', { headers });
    if (!res.ok) {
      // 5xx/4xx: keep whatever's currently rendered. Don't degrade to empty.
      return;
    }
    data = await res.json();
  } catch (_) {
    return;
  }
  const events = (data && Array.isArray(data.events)) ? data.events : [];

  // Clear and render. Use DOM APIs (no innerHTML on server data) so a
  // future PayPal field that slipped past redaction can't carry script.
  tbody.innerHTML = '';

  if (!events.length) {
    const row = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.style.cssText = 'text-align:center;color:var(--pfc-ink-faint);padding:var(--space-6);';
    td.textContent = 'No payments yet — you\'re on the free plan';
    row.appendChild(td);
    tbody.appendChild(row);
    return;
  }

  const STATUS_PILL_CLASS = {
    paid:           'status-pill status-paid',
    refunded:       'status-pill',
    reversed:       'status-pill',
    cancelled:      'status-pill',
    expired:        'status-pill',
    scheduled:      'status-pill',
    disputed:       'status-pill',
    'auto-refunded':'status-pill',
    support_review: 'status-pill',
  };

  for (const ev of events) {
    const row = document.createElement('tr');

    // Date
    const dateCell = document.createElement('td');
    dateCell.style.color = 'var(--pfc-ink-strong)';
    try {
      const d = new Date(ev.occurred_at);
      dateCell.textContent = isNaN(d.getTime())
        ? '—'
        : d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
    } catch (_) { dateCell.textContent = '—'; }
    row.appendChild(dateCell);

    // Label (event type pretty name)
    const labelCell = document.createElement('td');
    labelCell.style.color = 'var(--pfc-ink-strong)';
    labelCell.textContent = ev.label || ev.event_type || '—';
    row.appendChild(labelCell);

    // Amount
    const amtCell = document.createElement('td');
    if (typeof ev.amount === 'number' && Number.isFinite(ev.amount)) {
      const sym = (ev.currency === 'EUR') ? '€' : (ev.currency === 'USD' ? '$' : '');
      const span = document.createElement('span');
      span.className = 'num';
      span.textContent = sym + ev.amount.toFixed(2);
      amtCell.appendChild(span);
    } else {
      amtCell.textContent = '—';
    }
    row.appendChild(amtCell);

    // Method
    const methodCell = document.createElement('td');
    methodCell.textContent = (ev.provider === 'paypal') ? 'PayPal' : (ev.provider || '—');
    row.appendChild(methodCell);

    // Status pill
    const statusCell = document.createElement('td');
    const pill = document.createElement('span');
    pill.className = STATUS_PILL_CLASS[ev.status] || 'status-pill';
    pill.textContent = ev.status || 'unknown';
    statusCell.appendChild(pill);
    row.appendChild(statusCell);

    // Receipt placeholder (no per-event receipts yet; column kept for layout parity)
    const receiptCell = document.createElement('td');
    const dash = document.createElement('span');
    dash.style.color = 'var(--pfc-ink-faint)';
    dash.textContent = '—';
    receiptCell.appendChild(dash);
    row.appendChild(receiptCell);

    tbody.appendChild(row);
  }
}

// Refresh history on load (once auth resolves) and when the tab regains
// focus (a webhook may have landed while it was backgrounded).
if (typeof window !== 'undefined') {
  const _boot = () => { try { refreshBillingHistory(); } catch (_) {} };
  if (typeof PFCAuth !== 'undefined' && typeof PFCAuth.onReady === 'function') {
    PFCAuth.onReady(_boot);
  } else if (document.readyState !== 'loading') {
    _boot();
  } else {
    document.addEventListener('DOMContentLoaded', _boot, { once: true });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') _boot();
  });
}

// W28-c #33 / #38 — styled cancel modal replaces native confirm/alert.
// Shows the user's actual current_period_end and a retention prompt
// before they cancel. Wires PFCFunnel analytics on each step
// (cancel_intent_opened / cancel_kept / cancel_confirmed / cancel_failed)
// so the funnel is visible in analytics — native confirm() emitted nothing.
function _trackCancel(name, props) {
  try {
    if (window.PFC && typeof window.PFC.track === 'function') {
      window.PFC.track('pfc.' + name, props || {});
    }
  } catch (_) { /* analytics never blocks UX */ }
}

function _showCancelState(stateId) {
  ['cancel-confirm-state', 'cancel-done-state', 'cancel-error-state'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = (id === stateId) ? '' : 'none';
  });
}

function openCancelModal() {
  const ov = document.getElementById('cancel-overlay');
  if (!ov) return;
  ov.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  _showCancelState('cancel-confirm-state');
}

function closeCancelModal() {
  const ov = document.getElementById('cancel-overlay');
  if (!ov) return;
  ov.style.display = 'none';
  document.body.style.overflow = '';
}

function closeCancelModalOnOverlay(e) {
  // Only close when the user clicks the dark overlay (not the modal itself).
  if (e && e.target && e.target.id === 'cancel-overlay') {
    _trackCancel('cancel_abandoned', { via: 'overlay_click' });
    closeCancelModal();
  }
}

// Format an ISO timestamp into "15 June 2026" UK-style.
function _formatPeriodEnd(iso) {
  if (!iso) return 'the end of your current billing period';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return 'the end of your current billing period';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch (_) { return 'the end of your current billing period'; }
}

async function confirmCancel() {
  _trackCancel('cancel_intent_opened');
  openCancelModal();
  // Fetch fresh period_end in parallel — the modal shows "Loading…" until
  // we have it. If status.js fails or is slow, the modal still renders;
  // the user just sees a generic "end of current period" phrase.
  try {
    const headers = _authHeaders();
    const res = await fetch('/api/subscription/status', { headers });
    if (res.ok) {
      const data = await res.json();
      const dateEl = document.getElementById('cancel-period-end-date');
      if (dateEl) dateEl.textContent = _formatPeriodEnd(data.currentPeriodEnd);
    } else {
      // Network/auth error — show neutral fallback rather than spinning forever.
      const dateEl = document.getElementById('cancel-period-end-date');
      if (dateEl) dateEl.textContent = _formatPeriodEnd(null);
    }
  } catch (_) {
    const dateEl = document.getElementById('cancel-period-end-date');
    if (dateEl) dateEl.textContent = _formatPeriodEnd(null);
  }
}

function onCancelKept() {
  _trackCancel('cancel_kept');
  closeCancelModal();
}

async function onCancelConfirmed() {
  const btn = document.getElementById('cancel-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Cancelling…'; }
  try {
    const res = await fetch('/api/subscription/cancel', { method: 'POST', headers: _authHeaders() });
    if (!res.ok) {
      let errMsg = 'Could not cancel';
      try { errMsg = (await res.json()).error || errMsg; } catch (_) {}
      throw new Error(errMsg);
    }
    const result = await res.json().catch(() => ({}));
    if (typeof PFCPlan !== 'undefined') await PFCPlan.refresh();

    // Show success state with the actual period_end echoed from the
    // server response (server is source of truth for the date).
    const doneMsg = document.getElementById('cancel-done-msg');
    if (doneMsg) {
      const dateStr = _formatPeriodEnd(result.current_period_end);
      doneMsg.textContent =
        'Your Pro features stay active until ' + dateStr + '. After that, your account returns to Free.';
    }
    _showCancelState('cancel-done-state');

    // Hide the cancel button on the page so the user can't open the modal again.
    const cancelBtn = document.getElementById('cancel-btn');
    if (cancelBtn) cancelBtn.style.display = 'none';

    _trackCancel('cancel_confirmed', { reason: 'user_requested' });
  } catch (e) {
    const errEl = document.getElementById('cancel-error-msg');
    if (errEl) {
      errEl.textContent = (e && e.message)
        ? e.message + '. If this keeps happening, email support@profinancecast.com.'
        : 'Please try again, or email support if this keeps happening.';
    }
    _showCancelState('cancel-error-state');
    _trackCancel('cancel_failed', { error: String(e?.message || e).slice(0, 80) });
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Cancel anyway'; }
  }
}

// Founders seat counter — 3-state copy, sold-out handling, no polling.
// Refreshes once on load + on visibilitychange (5-min throttle).
let _foundersLastFetch = 0;
async function refreshFoundersCount() {
  const els = document.querySelectorAll('[data-founders-counter]');
  const cta = document.getElementById('founders-cta');
  if (!els.length) return;
  const now = Date.now();
  if (now - _foundersLastFetch < 5 * 60 * 1000) return; // 5-min throttle
  _foundersLastFetch = now;
  try {
    const r = await fetch('/api/founders-claimed', { cache: 'no-store' });
    if (!r.ok) return;
    const data = await r.json();
    if (data.claimed == null) return; // fail-closed; keep placeholder
    const claimed = data.claimed;
    const cap = data.cap || 100;
    const remaining = Math.max(0, cap - claimed);
    let copy;
    if (remaining === 0) {
      copy = 'All ' + cap + ' founder seats claimed. Thank you.';
      if (cta) {
        cta.disabled = true;
        cta.textContent = 'Founders Lifetime closed';
        cta.style.opacity = '0.4';
        cta.style.cursor = 'not-allowed';
        cta.setAttribute('aria-disabled', 'true');
        const note = document.createElement('p');
        note.style.cssText = 'font-family:var(--font-display);font-style:italic;color:var(--ink-2);margin-top:8px;font-size:14px;';
        note.textContent = 'Pro at €9 a month or €79 a year remains the same product.';
        cta.parentNode.insertBefore(note, cta.nextSibling);
      }
    } else if (remaining <= 10) {
      copy = 'Only ' + remaining + ' seats remaining — closes when sold out';
    } else if (remaining <= 50) {
      copy = remaining + ' of ' + cap + ' seats remaining · closes day 30';
    } else {
      copy = claimed + ' of ' + cap + ' claimed · closes day 30';
    }
    els.forEach(el => el.textContent = copy);
  } catch (_) { /* keep placeholder */ }
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshFoundersCount();
});

// Wire the Founders waiver checkbox to enable/disable the CTA button.
// CSP forbids inline event handlers, so this DOMContentLoaded listener does
// the binding. The button is rendered with disabled=true so this is the only
// path to enable it; if JS fails to load, the user can never check out
// Founders, which is the right fail-closed posture for a CRD waiver gate.
function _wireFoundersWaiver() {
  const cb  = document.getElementById('founders-waiver');
  const btn = document.getElementById('founders-cta');
  if (!cb || !btn) return;
  const sync = () => {
    btn.disabled = !cb.checked;
    btn.setAttribute('aria-disabled', String(!cb.checked));
    btn.style.opacity = cb.checked ? '' : '0.5';
    btn.style.cursor  = cb.checked ? '' : 'not-allowed';
    btn.title = cb.checked ? '' : 'Tick the waiver above to enable';
  };
  cb.addEventListener('change', sync);
  sync();
}

// Boot: keep UI in sync with whatever the server says is the current plan
window.addEventListener('DOMContentLoaded', () => {
  // Default the Pro card to annual pricing
  setBillingInterval('annual');

  // EU CRD waiver wiring for Founders Lifetime
  _wireFoundersWaiver();

  // Live Founders seat count
  refreshFoundersCount();

  // B-P0-PLAN-FLASH fix (audit 2026-05-25) — extracted the banner-write
  // logic into a single function so we can call it both from PFCPlan.
  // onChange AND from the initial refresh() resolution. The HTML now
  // ships visibility:hidden on #current-plan-banner so the "Loading…"
  // text never paints to a Pro user. Once we have a real plan value
  // (from PFCPlan.refresh()), we paint the correct copy and reveal.
  // Same regression class as DASH-PROD-FIX-4 / RC-P0-PLAN-FLASH /
  // SAGE-P0-UX (banner-flash on cold load for paying users).
  function _renderPlanBanner(plan) {
    const safePlan = (plan === 'premium' || plan === 'pro') ? plan : 'free';
    currentPlan = safePlan;
    const banner = document.getElementById('banner-plan-name');
    const tier =
      safePlan === 'premium' ? 'Premium' :
      safePlan === 'pro'     ? 'Pro'     :
                               'Free';
    if (banner) banner.textContent = tier + ' Plan';
    const sidebar = document.getElementById('sidebar-plan');
    if (sidebar) sidebar.textContent = tier + ' plan';
    // Sage usage row only meaningful on paid tiers (Sage = Pro-only feature)
    const usageBlock = document.getElementById('plan-usage-block');
    if (usageBlock) usageBlock.style.display = (safePlan === 'free' ? 'none' : '');
    const desc = document.getElementById('banner-plan-desc');
    if (desc) {
      desc.textContent =
        safePlan === 'free'    ? 'Core forecasting tools · no card required' :
        safePlan === 'premium' ? '500 Sage messages a month · all Pro features active' :
                                 '200 Sage messages a month · all Pro features active';
    }
    // Reveal the banner now that we have a real plan value. Setting
    // visibility (not display) preserves the layout slot — no reflow.
    const root = document.getElementById('current-plan-banner');
    if (root) root.style.visibility = 'visible';
  }

  if (typeof PFCPlan !== 'undefined') {
    PFCPlan.onChange(_renderPlanBanner);
    // Wait for the real plan to land BEFORE the first paint of the
    // banner. If PFCPlan.refresh() rejects, fall back to PFCPlan.get()
    // (cached value, often correct) and reveal anyway — better to show
    // a possibly-stale plan than a permanently-hidden banner.
    if (typeof PFCPlan.refresh === 'function') {
      PFCPlan.refresh()
        .then(() => _renderPlanBanner(PFCPlan.get ? PFCPlan.get() : 'free'))
        .catch(() => _renderPlanBanner(PFCPlan.get ? PFCPlan.get() : 'free'));
    } else if (PFCPlan.get) {
      _renderPlanBanner(PFCPlan.get());
    }
  } else {
    // PFCPlan didn't load — reveal the banner with the "Loading…"
    // placeholder so the layout doesn't stay blank forever. This is
    // a degraded path; auth + entitlements scripts are normally
    // required to reach /billing.
    const root = document.getElementById('current-plan-banner');
    if (root) root.style.visibility = 'visible';
  }
});
