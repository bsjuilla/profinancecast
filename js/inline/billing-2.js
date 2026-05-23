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
function loadPayPal() {
  if (paypalLoaded) { renderPayPalButtons(); return; }
  if (!PAYPAL_CLIENT_ID || PAYPAL_CLIENT_ID === 'YOUR_PAYPAL_CLIENT_ID') {
    document.getElementById('paypal-button-container').innerHTML =
      '<div style="background:var(--pfc-gold-soft);border-radius:var(--radius-sm);padding:var(--space-4);font-size:13px;color:var(--pfc-gold);line-height:1.6;">' +
      '<strong>Setup needed:</strong> Add your PayPal Client ID to PFC_CONFIG.PAYPAL_CLIENT_ID. See pfc-config.js.</div>';
    return;
  }
  const script  = document.createElement('script');
  script.src    = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&currency=EUR&intent=capture&components=buttons`;
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
      const res = await fetch('/api/paypal/create-order', {
        method: 'POST',
        headers: _authHeaders(),
        body: JSON.stringify({ plan: checkoutPlan }),
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
      } else {
        alert(result.error || 'Payment could not be completed. Please try again.');
      }
    },

    onError: (err) => {
      console.error('PayPal error:', err);
      document.getElementById('paypal-button-container').innerHTML =
        '<div style="color:var(--pfc-terracotta);font-size:13px;padding:var(--space-3);">Payment failed. Please try again or use card payment.</div>';
    },

    onCancel: () => {
      // User closed PayPal popup — do nothing
    }
  }).render('#paypal-button-container');
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

  // Add billing history row
  const tbody = document.getElementById('billing-body');
  const today = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
  const planLabel = PLAN_LABELS[plan] || 'Pro';
  tbody.innerHTML = `
    <tr>
      <td style="color:var(--pfc-ink-strong);">${today}</td>
      <td style="color:var(--pfc-ink-strong);">${planLabel}</td>
      <td><span class="num">€${checkoutAmt.toFixed(2)}</span></td>
      <td>PayPal</td>
      <td><span class="status-pill status-paid">Paid</span></td>
      <td><span style="color:var(--pfc-ink-faint);">—</span></td>
    </tr>`;
}

async function confirmCancel() {
  if (!confirm('Cancel your subscription? Your Pro features stay active until the end of the current billing period.')) return;
  const btn = document.getElementById('cancel-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Cancelling…'; }
  try {
    const res = await fetch('/api/subscription/cancel', { method: 'POST', headers: _authHeaders() });
    if (!res.ok) throw new Error((await res.json()).error || 'Could not cancel');
    if (typeof PFCPlan !== 'undefined') await PFCPlan.refresh();
    alert('Subscription cancelled. Your plan reverts to Free at the end of the current billing period.');
    if (btn) btn.style.display = 'none';
  } catch (e) {
    alert('Could not cancel: ' + e.message + '\nIf this keeps happening, email support@profinancecast.com.');
    if (btn) { btn.disabled = false; btn.textContent = 'Cancel subscription'; }
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

// Boot: keep UI in sync with whatever the server says is the current plan
window.addEventListener('DOMContentLoaded', () => {
  // Default the Pro card to annual pricing
  setBillingInterval('annual');

  // Live Founders seat count
  refreshFoundersCount();

  if (typeof PFCPlan !== 'undefined') {
    PFCPlan.onChange(plan => {
      currentPlan = plan;
      const banner = document.getElementById('banner-plan-name');
      if (banner) banner.textContent = (plan === 'free' ? 'Free' : 'Pro') + ' Plan';
      const sidebar = document.getElementById('sidebar-plan');
      if (sidebar) sidebar.textContent = (plan === 'free' ? 'Free' : 'Pro') + ' plan';
      // Sage usage row only meaningful on paid tiers (Sage = Pro-only feature)
      const usageBlock = document.getElementById('plan-usage-block');
      if (usageBlock) usageBlock.style.display = (plan === 'free' ? 'none' : '');
      const desc = document.getElementById('banner-plan-desc');
      if (desc) {
        desc.textContent = (plan === 'free')
          ? 'Core forecasting tools · no card required'
          : (plan === 'premium' ? '500 Sage messages a month · all Pro features active'
                                : '200 Sage messages a month · all Pro features active');
      }
    });
    PFCPlan.refresh();
  }
});
