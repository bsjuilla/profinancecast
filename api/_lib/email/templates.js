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
  // Defensive fallback (review finding #2): the previous default
  // 'Plan' produced ungrammatical output like "Your Plan features
  // have ended." On unknown plan, fall back to 'Pro' (the most
  // common subscriber tier) so receipts stay grammatical, and log
  // so the data anomaly is observable rather than silent.
  console.warn('[email/templates] _planLabel: unknown plan=' + String(plan).slice(0, 50) + ' — using Pro fallback');
  return 'Pro';
}

function _money(amount, currency) {
  // Defensive coercion — PayPal payloads sometimes deliver amounts as
  // strings (e.g. resource.amount.value = "9.00"). Number() handles
  // both. Critically: null/undefined/empty-string render as '— CUR'
  // so a malformed webhook payload produces "Amount: — EUR" rather
  // than the misleading "Amount: 0.00 EUR" (which Number(null)=0
  // would otherwise yield and which would tell a paying customer
  // they paid nothing).
  if (amount === null || amount === undefined || amount === '') {
    return `— ${currency || 'EUR'}`;
  }
  // Review finding #9: previously the helper silently fell back to
  // 'EUR' when currency was missing AND amount was present, which
  // means a real charge in a non-EUR currency with a typo'd field
  // would render as "9.00 EUR". Warn so the data anomaly is
  // observable; keep the EUR default so the receipt still sends
  // (single-currency product today; the helper is forward-looking).
  if (!currency) {
    console.warn('[email/templates] _money: currency missing for amount=' + String(amount).slice(0, 20) + ' — defaulting to EUR');
  }
  const cur = currency || 'EUR';
  const n = Number(amount);
  if (!Number.isFinite(n)) return `${amount} ${cur}`;
  return `${n.toFixed(2)} ${cur}`;
}

function _date(iso) {
  // Render as YYYY-MM-DD — consumer-friendly, jurisdiction-neutral.
  // Returns null on missing or unparseable input so callers can
  // distinguish a real date from "we don't know" (review finding #3).
  // For transaction-date fields where 'today' is an acceptable
  // default, use _dateOrToday() below.
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

function _dateOrToday(iso) {
  // Convenience wrapper for transaction-date fields (Founders receipt,
  // subscription receipt 'Date:', refund receipt) where today's date
  // is a sensible default if the caller forgot to pass dateIso.
  return _date(iso) || new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// 1. Founders Lifetime receipt (one-time €149)
// ---------------------------------------------------------------------------

export function renderFoundersReceipt({ amount, currency, txnId, dateIso }) {
  const dateStr   = _dateOrToday(dateIso);
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
// 1b. Founders Lifetime WELCOME — onboarding email with seat number
// ---------------------------------------------------------------------------
//
// Distinct from the receipt above: the receipt is the legal transaction
// record; this is the warm welcome that gives the founder their seat number
// and shows them how to start. Sent best-effort + idempotency-keyed from
// capture-order.js. seatNo may be null (finalize_founders_seat didn't return
// one); we degrade to a generic "one of N founding members" line rather than
// printing "Founder #null". Contains NO financial data.

export function renderFoundersWelcome({ seatNo, cap = 100, firstName }) {
  const seatN    = Number(seatNo);
  const hasSeat  = Number.isFinite(seatN) && seatN > 0;
  const capN     = Number.isFinite(Number(cap)) && Number(cap) > 0 ? Number(cap) : 100;
  const namePart = (firstName && typeof firstName === 'string' && firstName.trim())
    ? `, ${firstName.trim()}`
    : '';

  const seatLine = hasSeat
    ? `You're Founder #${seatN} of ${capN}.`
    : `You're one of just ${capN} founding members.`;
  const subject = hasSeat
    ? `Welcome, founder — you're #${seatN} of ${capN}`
    : 'Welcome to ProFinanceCast — you’re a founding member';

  const text = [
    `Welcome${namePart} — and thank you.`,
    '',
    seatLine,
    '',
    'Your Founders Lifetime unlocks every Pro feature, forever — multi-',
    'scenario planning, the full portfolio, Ask Sage, and your quarterly',
    'Report Card. No renewals, no price changes, ever.',
    '',
    'Start here:',
    '  1. Add your numbers (income, expenses, savings, debt) — about 2 min',
    '  2. Watch your 10-year net-worth forecast update live',
    '  3. Check your Report Card grade and build your first scenario',
    '',
    '  https://www.profinancecast.com/dashboard',
    '',
    'A note on privacy: your financial numbers are encrypted in your own',
    'browser and never reach our servers. Even we cannot see them — that is',
    'the whole point.',
    '',
    `Questions? Just reply to this email, or write to ${SUPPORT_EMAIL}.`,
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
  const dateStr   = _dateOrToday(dateIso);
  const amountStr = _money(amount, currency);
  const planStr   = _planLabel(plan);
  // Review finding #3: if periodEnd is missing/unparseable, render
  // "Next charge: not scheduled" instead of silently falling back to
  // today's date (which would tell the customer their next charge is
  // today — wrong + alarming).
  const nextStr   = _date(periodEnd) || 'not scheduled';
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
  const dateStr   = _dateOrToday(dateIso);
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
  plan, periodEnd, paypalCancelFailed, hoursUntilNextCharge,
}) {
  const planStr = _planLabel(plan);
  const endStr  = _date(periodEnd);

  const subject = `ProFinanceCast ${planStr} — cancellation confirmed`;

  const lines = [];
  lines.push(`You've cancelled your ProFinanceCast ${planStr} subscription.`);
  lines.push('');
  // Review finding #3: if periodEnd missing/unparseable, use phrasing
  // that doesn't depend on a specific date (rather than silently
  // rendering today's date, which would tell the customer they lose
  // access today).
  if (endStr) {
    lines.push(`Your ${planStr} features remain active until ${endStr}. After`);
    lines.push('that date your account will move to the Free plan automatically —');
    lines.push('no further action needed.');
  } else {
    lines.push(`Your ${planStr} features remain active until the end of your`);
    lines.push('current billing period. After that, your account moves to the');
    lines.push('Free plan automatically — no further action needed.');
  }
  lines.push('');
  lines.push('Your forecasting tools stay available on the Free plan, including');
  lines.push('the ten-year net-worth projection and the debt-free month estimate.');
  lines.push('All of your data continues to live encrypted in your browser.');
  lines.push('');
  if (paypalCancelFailed) {
    // Review finding #14: time-aware warning. If the next renewal is
    // <24h away we treat the failed-cancel as urgent (PayPal may
    // charge before our retry catches up). If it's <72h, normal-
    // urgency advisory. If >72h, soften the warning — our ops alert
    // will resolve before the next billing cycle in nearly all cases.
    const hrs = (typeof hoursUntilNextCharge === 'number' && Number.isFinite(hoursUntilNextCharge))
      ? hoursUntilNextCharge : null;
    if (hrs !== null && hrs < 24) {
      lines.push(`Important: we couldn't confirm cancellation with PayPal and your`);
      lines.push(`next billing cycle is within 24 hours. PayPal may attempt one more`);
      lines.push(`charge before our retry catches up. If they do, reply to this`);
      lines.push(`email immediately and we'll refund it. We're also working on this`);
      lines.push(`from our side.`);
      lines.push('');
    } else if (hrs !== null && hrs < 72) {
      lines.push(`Note: we couldn't reach PayPal to confirm cancellation on their`);
      lines.push(`side. Your next renewal is in the next few days, so please verify`);
      lines.push(`the subscription is closed in your PayPal account (Activity →`);
      lines.push(`Recurring payments). If you see another charge, reply to this`);
      lines.push(`email and we'll refund it.`);
      lines.push('');
    } else {
      lines.push(`Note: PayPal didn't confirm cancellation on the first try. Your`);
      lines.push(`access here will end on schedule and our system will keep`);
      lines.push(`retrying on PayPal's side. You don't need to do anything — if`);
      lines.push(`anything goes wrong, reply to this email and we'll refund any`);
      lines.push(`charge that slips through.`);
      lines.push('');
    }
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

// ---------------------------------------------------------------------------
// 6. Weekly Check-In — privacy-preserving retention nudge
// ---------------------------------------------------------------------------
//
// Sent by the Weekly Check-In cron (hosted on api/founders-claimed.js, logic
// in api/_lib/weekly-checkin-core.js) to OPTED-IN users only. CRITICAL: this
// email carries NO financial data. The server is blind to the user's numbers
// (encrypted client-side), so the email is a content-free invitation; the
// grade / "thing that moved" / suggested action are all computed client-side
// AFTER the user clicks through. The curiosity gap IS the mechanic. The
// privacy line is a retention asset, not a disclaimer. Includes a one-click
// opt-out instruction (anti-spam / GDPR).

export function renderWeeklyCheckin({ firstName } = {}) {
  const namePart = (firstName && typeof firstName === 'string' && firstName.trim())
    ? ` ${firstName.trim()}`
    : '';

  const subject = 'Your weekly money check-in is ready';
  const lines = [
    `Hi${namePart},`,
    '',
    "It's time for your weekly money check-in.",
    '',
    'Open ProFinanceCast to see, in about 30 seconds:',
    '  - This week’s financial-health grade',
    '  - The one thing that moved the most',
    '  - Your single suggested action for the week ahead',
    '',
    '  https://www.profinancecast.com/report-card',
    '',
    'Your numbers are computed privately in your own browser — we can’t see',
    'them, and we never will. This email contains nothing about your finances.',
    '',
    'Prefer not to get these? Turn off the Weekly Check-In any time under',
    'Settings → Notifications on profinancecast.com.',
    '',
    SIGNATURE,
  ];

  return { subject, text: lines.join('\n') };
}
