// api/_lib/email/templates.js
//
// Customer-facing transactional email templates. Plain text only — no
// HTML, no images, no marketing fluff. Bank-grade receipts.
//
// Each renderer is a pure function (no I/O) that returns:
//   { subject, text }
//
// Tone: terse, factual, EU-consumer-rights aware. Includes the PayPal
// transaction ID for chargeback evidence + the 14-day refund pointer
// where applicable. Plain text means: no XSS surface, no image
// blocking, no HTML-vs-text-part divergence, easy to test.
//
// Plan display names (kept consistent across all templates):
//   - 'founders' / 'founders_lifetime' → 'Founders Lifetime'
//   - 'pro'                            → 'Pro'
//   - 'premium'                        → 'Premium'

const SUPPORT_EMAIL = 'support@profinancecast.com';
const SIGNATURE     = '— ProFinanceCast';

function _planLabel(plan) {
  if (plan === 'founders' || plan === 'founders_lifetime') return 'Founders Lifetime';
  if (plan === 'pro')     return 'Pro';
  if (plan === 'premium') return 'Premium';
  return 'Plan';
}

function _money(amount, currency) {
  // Defensive coercion — PayPal payloads sometimes deliver amounts as
  // strings (e.g. resource.amount.value = "9.00"). Number() handles
  // both. Critically: null/undefined/empty-string render as '— CUR'
  // so a malformed webhook payload produces "Amount: — EUR" rather
  // than the misleading "Amount: 0.00 EUR" (which Number(null)=0
  // would otherwise yield and which would tell a paying customer
  // they paid nothing).
  const cur = currency || 'EUR';
  if (amount === null || amount === undefined || amount === '') {
    return `— ${cur}`;
  }
  const n = Number(amount);
  if (!Number.isFinite(n)) return `${amount} ${cur}`;
  return `${n.toFixed(2)} ${cur}`;
}

function _date(iso) {
  // Render as YYYY-MM-DD — consumer-friendly, jurisdiction-neutral,
  // and avoids the timezone confusion of localized formats. If no
  // input is provided, use today's date in UTC.
  //
  // Defensive parse (code review patch): pass the input through
  // `new Date(...).toISOString()` so a malformed input (e.g. a
  // localized date string from a future caller, or a non-ISO timestamp)
  // either renders correctly or falls back to today rather than
  // silently truncating to a plausible-looking but wrong date.
  if (!iso) return new Date().toISOString().slice(0, 10);
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
    return d.toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

// ---------------------------------------------------------------------------
// 1. Founders Lifetime receipt (one-time €149)
// ---------------------------------------------------------------------------

export function renderFoundersReceipt({ amount, currency, txnId, dateIso }) {
  const dateStr   = _date(dateIso);
  const amountStr = _money(amount, currency);

  const subject = 'Your ProFinanceCast Founders Lifetime — receipt';
  const text = [
    'Thank you for becoming a founding member of ProFinanceCast.',
    '',
    'This email is your receipt:',
    '',
    `  Amount:         ${amountStr}`,
    `  Date:           ${dateStr}`,
    `  Transaction ID: ${txnId || 'N/A'}`,
    '  Plan:           Founders Lifetime (Pro features, forever)',
    '',
    'At checkout you waived the 14-day right of withdrawal in exchange',
    'for immediate access. As a result, this purchase is non-refundable',
    'under EU consumer-rights rules.',
    '',
    'Your Founders Lifetime entitlement does not expire and is not tied',
    'to any renewal. Keep this email for your records.',
    '',
    `Support: ${SUPPORT_EMAIL}`,
    '',
    SIGNATURE,
  ].join('\n');

  return { subject, text };
}

// ---------------------------------------------------------------------------
// 2. Subscription receipt — Pro or Premium, first charge OR recurring renewal
// ---------------------------------------------------------------------------
//
// One template covers both first-charge and recurring renewal — the only
// real difference is the lede sentence and the subject prefix. Keeping
// these unified means one place to fix when the refund policy changes.

export function renderSubscriptionReceipt({
  amount, currency, plan, periodEnd, txnId, dateIso, isRenewal,
}) {
  const dateStr   = _date(dateIso);
  const amountStr = _money(amount, currency);
  const planStr   = _planLabel(plan);
  const nextStr   = _date(periodEnd);
  const isRen     = !!isRenewal;

  const subject = isRen
    ? `ProFinanceCast ${planStr} — renewal receipt`
    : `Your ProFinanceCast ${planStr} — receipt`;

  const lines = [];
  lines.push(isRen
    ? `Your ProFinanceCast ${planStr} subscription has renewed.`
    : `Thank you for subscribing to ProFinanceCast ${planStr}.`);
  lines.push('');
  lines.push('This email is your receipt:');
  lines.push('');
  lines.push(`  Amount:         ${amountStr}`);
  lines.push(`  Date:           ${dateStr}`);
  lines.push(`  Transaction ID: ${txnId || 'N/A'}`);
  lines.push(`  Plan:           ${planStr}`);
  lines.push(`  Next charge:    ${nextStr}`);
  lines.push('');
  lines.push('Cancel any time from Settings on profinancecast.com.');
  lines.push('Refunds are available within 14 days of any charge — reply to');
  lines.push(`this email or write to ${SUPPORT_EMAIL}.`);
  lines.push('');
  lines.push('Your numbers stay encrypted in your browser; we never see them.');
  lines.push('');
  lines.push(`Support: ${SUPPORT_EMAIL}`);
  lines.push('');
  lines.push(SIGNATURE);

  return { subject, text: lines.join('\n') };
}

// ---------------------------------------------------------------------------
// 3. Refund confirmation
// ---------------------------------------------------------------------------

export function renderRefundConfirmation({
  amount, currency, plan, originalTxnId, dateIso,
}) {
  const dateStr   = _date(dateIso);
  const amountStr = _money(amount, currency);
  const planStr   = _planLabel(plan);

  const subject = 'ProFinanceCast — refund processed';
  const text = [
    'Your refund has been processed.',
    '',
    `  Amount refunded:       ${amountStr}`,
    `  Refund date:           ${dateStr}`,
    `  Original transaction:  ${originalTxnId || 'N/A'}`,
    `  Plan:                  ${planStr}`,
    '',
    'The amount will appear on your statement within 5–10 business days,',
    'depending on your card issuer or bank.',
    '',
    `Your ${planStr} features have ended. Your account has been moved to`,
    'the Free plan and your data remains on your device unchanged.',
    '',
    'If you did NOT request this refund, please contact us immediately at',
    `${SUPPORT_EMAIL}.`,
    '',
    `Support: ${SUPPORT_EMAIL}`,
    '',
    SIGNATURE,
  ].join('\n');

  return { subject, text };
}

// ---------------------------------------------------------------------------
// 4. Cancellation confirmation
// ---------------------------------------------------------------------------

export function renderCancellationConfirmation({
  plan, periodEnd, paypalCancelFailed,
}) {
  const planStr = _planLabel(plan);
  const endStr  = _date(periodEnd);

  const subject = `ProFinanceCast ${planStr} — cancellation confirmed`;

  const lines = [];
  lines.push(`You've cancelled your ProFinanceCast ${planStr} subscription.`);
  lines.push('');
  lines.push(`Your ${planStr} features remain active until ${endStr}. After`);
  lines.push('that date your account will move to the Free plan automatically —');
  lines.push('no further action needed.');
  lines.push('');
  lines.push('Your forecasting tools stay available on the Free plan, including');
  lines.push('the ten-year net-worth projection and the debt-free month estimate.');
  lines.push('All of your data continues to live encrypted in your browser.');
  lines.push('');
  if (paypalCancelFailed) {
    lines.push(`Note: we couldn't reach PayPal to confirm cancellation on their`);
    lines.push('side. Your access here will end on schedule, but you may want to');
    lines.push('verify the subscription is closed in your PayPal account too. If');
    lines.push(`you see another charge after ${endStr}, reply to this email and`);
    lines.push("we'll refund it.");
    lines.push('');
  }
  lines.push('Refunds are available within 14 days of your last charge — reply');
  lines.push(`to this email or write to ${SUPPORT_EMAIL}.`);
  lines.push('');
  lines.push(`Support: ${SUPPORT_EMAIL}`);
  lines.push('');
  lines.push(SIGNATURE);

  return { subject, text: lines.join('\n') };
}

// ---------------------------------------------------------------------------
// 5. Account deletion confirmation (goodbye)
// ---------------------------------------------------------------------------

export function renderAccountDeletionGoodbye({ hadActiveSub }) {
  const subject = 'ProFinanceCast — your account has been deleted';

  const lines = [];
  lines.push('Your ProFinanceCast account has been permanently deleted.');
  lines.push('');
  lines.push('What we removed:');
  lines.push('  - Your authentication record');
  lines.push('  - Your subscription history on our servers');
  if (hadActiveSub) {
    lines.push('  - Any active subscription has been cancelled');
  }
  lines.push('');
  lines.push("What's still on your device:");
  lines.push('  Your forecast inputs, debts, goals and net-worth history are');
  lines.push("  stored encrypted in your browser's local storage — we never");
  lines.push('  had a copy on our servers. To remove them from your device,');
  lines.push('  open profinancecast.com on the same browser and click "wipe"');
  lines.push('  in Settings before signing in to any other account.');
  lines.push('');
  lines.push('Refund policy:');
  lines.push("  If you paid within the last 14 days, you're entitled to a full");
  lines.push('  refund. Reply to this email within 14 days of your most recent');
  lines.push('  charge to claim it.');
  lines.push('');
  lines.push('If you did NOT request this deletion, contact us immediately at');
  lines.push(`${SUPPORT_EMAIL}.`);
  lines.push('');
  lines.push('Thanks for trying ProFinanceCast.');
  lines.push('');
  lines.push(SIGNATURE);

  return { subject, text: lines.join('\n') };
}
