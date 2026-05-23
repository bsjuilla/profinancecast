# VAT strategy for ProFinanceCast — decision doc

**Author:** Claude Opus 4.7 (1M context), 2026-05-23, in response to CISO finding #1 from the payments re-audit.
**Status:** decision-support document; **NOT legal or tax advice**.
**Read this BEFORE** you take the first EU consumer's money. Personal-liability exposure is real and uncapped.

> **One-line summary:** the cheapest "I don't want to deal with VAT" path for a solo founder at your stage is to switch from raw PayPal to a Merchant-of-Record provider (Lemon Squeezy or Polar). They become the seller-of-record and handle EU VAT, UK VAT, and US sales tax automatically. Cost: ~5% of revenue vs ~3% PayPal + your tax-compliance overhead. At your scale, MoR is cheaper than DIY.

---

## Why this matters (the actual risk, in plain English)

When you sell a digital service (Pro, Premium, Founders Lifetime) to a consumer in the EU, EU rules treat the **consumer's country** as the place of supply. That means:

- A user in Germany pays you €9 → **you owe German tax authority 19% VAT** (€1.44 of that €9 is theirs).
- A user in France → 20% VAT to France.
- A user in Hungary → 27% VAT to Hungary.

There's no "we're small, they won't notice" exception:
- **For non-EU sellers** (UK post-Brexit, US, anywhere else): VAT is owed from your **first €1** of EU sales. No threshold.
- **For EU sellers**: there's a €10,000/year EU-wide threshold *if* you sell from only ONE country to others. Above that, mandatory OSS registration. Below, you charge your home VAT rate (still owed, just easier).
- **Personal liability**: if your business isn't an entity with limited liability (Ltd, GmbH, BV, etc.), the VAT debt attaches to **you personally**. The tax authority can come after your house and savings, with a 10-year lookback window plus penalties and interest.

This is not a hypothetical. EU tax authorities have started auto-detecting cross-border digital sales via payment-processor data-sharing agreements. PayPal reports cross-border transaction volume to authorities in most EU countries. The detection rate is going up every year, not down.

---

## Your options, ranked by what I'd actually do at your stage

### Option A — Geo-restrict checkout (cheapest, ships today)

Block the checkout for non-allowed countries. You can sell to your home country + non-EU markets (US, UK, Canada, Australia, NZ, Singapore, etc.) — none of those have a "small foreign seller" VAT trigger at low volume. EU users see a polite "not yet available in your region" message.

**Pros:**
- 30-minute code change (drop-in below).
- Zero VAT exposure if you exclude EU entirely.
- No third-party dependency.
- Reversible — once you've picked a long-term strategy, flip the env var to undo.

**Cons:**
- You lose EU market access. EU is ~25% of global digital-services spend; losing it hurts growth.
- Your EUR pricing makes less sense if you're selling to US/UK users — you'd want to add GBP/USD pricing too.
- Doesn't address the question forever, just defers it.

**Verdict:** ship this **today** as a stop-gap. Buys you 30-60 days to decide on a longer-term path without taking on personal VAT liability. Code drop-in at the bottom of this doc.

### Option B — Merchant-of-Record (MoR) provider (best medium-term, ~1 week to migrate)

A Merchant of Record (MoR) becomes the legal seller. The customer buys from **Lemon Squeezy** (or Paddle, or Polar), not from you. The MoR collects, files, and remits all consumption taxes globally — EU VAT, UK VAT, US sales tax, AU GST, etc. — and pays you the net.

**The three I'd actually consider for a solo founder:**

| Provider | Fee | Subscription support | Best for |
|---|---|---|---|
| **Lemon Squeezy** (Stripe-owned, since Aug 2024) | 5% + $0.50/txn | Yes, native | Solo founders, modern API/UX, mature subscription handling, native customer portal |
| **Polar.sh** | 4% + $0.40/txn | Yes | Open-source / dev-tool founders, slightly cheaper, newer (small risk premium) |
| **Paddle** | 5% + $0.50/txn (10-tier discount as you grow) | Yes, mature | Higher-MRR products ($10k+ MRR), older + more enterprise-y |

**Pros:**
- **Zero VAT work.** Ever. They handle every country.
- Handles US sales tax automatically too (which would otherwise also bite you in some states above their economic-nexus thresholds).
- Customer-facing invoicing, dunning, tax-compliant receipts — all done for you.
- Personal-liability risk goes to ~zero (you're a supplier, not a seller-of-record).

**Cons:**
- Migration cost: rip out PayPal Billing Plans (W29-b work) and rewire to MoR equivalent. Probably ~1 week of work including testing.
- 5% fee vs ~3% PayPal. At €1k MRR that's €20/mo extra. At €10k MRR it's €200/mo — but tax-prep costs alone would be €100-300/mo if you DIY.
- Locks you into the MoR's customer-facing branding (their domain on the checkout page, their invoices, etc.).
- Founders Lifetime would also flow through them.

**Verdict:** **the right answer for you within 60 days.** Lemon Squeezy is my recommendation specifically — Stripe ownership de-risks the business, the API is the most modern, and the founder-friendly support is real. Migration plan sketched below.

### Option C — Register for VAT-OSS yourself (DIY, properly)

If you're EU-established, register in your home country's One-Stop-Shop. File one return per quarter covering all EU sales. Charge the buyer's country rate. If you're non-EU established, register via the **Non-Union OSS** — typically through Ireland, Estonia, or Malta. Estonia's e-Residency program is the cleanest path for non-EU founders.

**Pros:**
- Keep your existing PayPal integration.
- Lower per-transaction cost (no MoR fee).
- More margin once you're > €50k ARR.

**Cons:**
- Real setup work: 2-4 weeks, ~€500-2000 in accountant + legal fees.
- Recurring quarterly filings forever.
- You need to detect buyer country, calculate per-country VAT, store the invoice, etc. PayPal doesn't do this automatically.
- Mistakes are personal — under-collection is a personal debt to a foreign tax authority.

**Verdict:** **wait until you're > €50k ARR before considering this.** Below that level the MoR fee is cheaper than the operational overhead of doing it right.

### Option D — Form a UK Ltd (or equivalent) before launch

Independent of A/B/C. Forming a UK Ltd (£12, ~1 hour online via Companies House) creates a separate legal person that becomes the contracting party with your customers. **The Ltd becomes the VAT debtor; your personal assets are protected** (subject to the usual director-liability exceptions for fraud / wrongful trading).

**Cost:** £12 incorporation + ~£500-1500/year for an accountant + £40/year confirmation statement. Total first year ~£600-1500.

**Pros:**
- Caps your downside on every other category of risk, not just VAT.
- Required eventually anyway for serious business.
- Doesn't conflict with A, B, or C — you can do this AND any of them.

**Cons:**
- Annual paperwork (corporation tax return, confirmation statement, accounts).
- Need to maintain corporate formalities (separate bank account, no commingling).

**Verdict:** **do this within 90 days regardless of which other option you pick.** It's the single most-important asset-protection move you can make. Even more important than VAT strategy because it also limits your downside on data-breach claims, dispute-pileup chargebacks, and contractual-liability exposure.

---

## My recommendation for ProFinanceCast at this exact moment

Three actions in this order:

### Action 1 — TODAY (15 minutes)
**Geo-restrict to non-EU + your home country** via the env-var-gated drop-in at the bottom of this doc. Set `PAYMENTS_ALLOWED_COUNTRIES=GB,US,CA,AU,NZ,SG,HK,JP,KR,IL,AE,CH,NO` (or whatever your actual allow-list is). This **eliminates EU personal VAT liability** until you have a longer-term plan in place. Reversible.

### Action 2 — THIS WEEK (1-2 hours)
**Form a UK Ltd** via [companies-house.gov.uk](https://www.gov.uk/limited-company-formation). £12, online, ~1 hour. Open a Wise Business or Mercury account for the Ltd. Move PayPal Business account ownership to the Ltd's name. **This caps your personal liability across every other risk class, not just VAT.**

### Action 3 — WITHIN 60 DAYS (1 week of dev work)
**Migrate from raw PayPal to Lemon Squeezy.** When you do this you can re-enable EU sales because Lemon Squeezy handles VAT. The migration plan:

```
Week 1, day 1-2: Sign up for Lemon Squeezy, configure products
                 (Pro Monthly, Pro Annual, Premium Monthly, Premium Annual,
                  Founders Lifetime). Set up webhooks.

Week 1, day 3-4: Rewrite api/paypal/create-order.js → api/lemon/checkout.js
                 (their hosted checkout — simpler than building one).
                 Rewrite webhook-paypal.js → webhook-lemon.js
                 (same event types: order_created, subscription_created,
                  subscription_cancelled, subscription_payment_success,
                  subscription_payment_failed, refund_created).
                 Keep both code paths live initially behind a feature flag.

Week 1, day 5:   Test in Lemon Squeezy test mode. Test refunds.
                 Test cancel flow. Test recurring renewal.

Week 1, day 6:   Soft-launch: 100% new signups go to Lemon Squeezy.
                 Existing PayPal recurring subs continue until cancelled.

Week 2+:         Gradually migrate existing recurring subs at their next
                 renewal opportunity (or offer them a migration with one
                 month free as a thank-you).
                 Remove geo-restrict env var. EU users can now sign up.

Week 4:          Sunset old PayPal endpoints once no active recurring
                 subs remain on PayPal.
```

The whole migration is one focused week of dev work. Worth it.

---

## What I am NOT recommending

- **"Just don't collect VAT and hope nobody notices."** That's the path to a €50k tax bill from the German tax authority with three years of penalty interest. The data-sharing between PayPal and EU tax authorities is real.
- **"Use Stripe Tax."** Stripe Tax *calculates* VAT but doesn't *remit* it for you — you still need to register, file, and pay in every country. Half-solution.
- **"Charge a flat 'VAT included' and call it a day."** This actively makes it worse — you've now collected VAT you have no legal right to collect and no entity to remit it through.
- **"Form a Delaware LLC."** Doesn't help with EU VAT — VAT is per-customer-jurisdiction. A US entity selling to EU consumers still owes EU VAT. And US LLC formation has its own complications (state filing fees, registered-agent fees, harder banking from outside the US).

---

## Drop-in geo-gate code (Action 1)

The kill switch you already have (`PAYMENTS_DISABLED=true`) is binary — all or nothing. This adds an allow-list. Set `PAYMENTS_ALLOWED_COUNTRIES` in Vercel env to a comma-separated ISO-3166-alpha-2 country code list. If unset, all countries allowed (current behaviour). If set, requests from countries not in the list get 451 "Unavailable for legal reasons."

**Step 1** — add a new file `api/_lib/geo-gate.js`:

```js
// api/_lib/geo-gate.js
//
// Geo-restrict mutating payment endpoints to a configurable allow-list.
// Reads Vercel's x-vercel-ip-country header (set on every request at the
// edge — no network call needed, no IP logged).
//
// Behaviour:
//   - PAYMENTS_ALLOWED_COUNTRIES unset → allow all (no-op)
//   - PAYMENTS_ALLOWED_COUNTRIES set   → only listed countries pass
//   - Country header missing (Tor, VPN, dev) → block by default when
//     allow-list is set (fail-closed: never let an unknown country
//     bypass the gate)
//
// Returns:
//   { allowed: true }           — proceed
//   { allowed: false, country } — block with 451 (Unavailable for legal reasons)

export function checkGeo(req) {
  const allowedRaw = process.env.PAYMENTS_ALLOWED_COUNTRIES;
  if (!allowedRaw) return { allowed: true };  // gate disabled

  const allowed = new Set(
    allowedRaw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
  );

  // Header access differs between Node (req.headers.foo) and Edge (req.headers.get(foo))
  const headers = req.headers;
  const country = (
    typeof headers.get === 'function'
      ? headers.get('x-vercel-ip-country')
      : headers['x-vercel-ip-country']
  ) || '';
  const cc = country.toUpperCase();

  if (!cc) return { allowed: false, country: '(unknown)' };  // fail closed
  if (!allowed.has(cc)) return { allowed: false, country: cc };
  return { allowed: true };
}

export function geoBlockOrReject(req, res) {
  const check = checkGeo(req);
  if (check.allowed) return null;
  const body = {
    error: `ProFinanceCast subscriptions are not yet available in your region (${check.country}). We're working on it — email hello@profinancecast.com to be notified when it launches.`,
    reason: 'geo_not_supported',
    country: check.country,
  };
  if (res && typeof res.status === 'function') {
    res.status(451).json(body);
    return true;
  }
  return new Response(JSON.stringify(body), {
    status: 451,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
```

**Step 2** — wire into `api/paypal/create-order.js`, just after the kill-switch check:

```js
import { geoBlockOrReject } from '../_lib/geo-gate.js';

// ... in handler, after PAYMENTS_DISABLED check:
if (geoBlockOrReject(req, res)) return;
```

**Step 3** — wire into `api/paypal/create-subscription.js`, same place:

```js
import { geoBlockOrReject } from '../_lib/geo-gate.js';

// ... in handler, after PAYMENTS_DISABLED check:
const geo = geoBlockOrReject(req, res);
if (geo) return geo;   // Edge runtime returns a Response object
```

**Step 4** — set the env var in Vercel:
- `PAYMENTS_ALLOWED_COUNTRIES = GB,US,CA,AU,NZ,SG,HK,JP,KR,IL,AE,CH,NO`

(Adjust the list to fit your strategy. The 13 above are: UK, North America English-speaking, English Asia-Pacific, Israel, UAE, Switzerland, Norway — all non-EU, English-friendly, low-VAT-risk for a small foreign seller.)

**Step 5** — also gate the client-side. Hide the Subscribe / Founders buttons for blocked countries so users don't get a confusing 451 in the console. Sketch in `js/inline/billing-2.js`:

```js
// On DOMContentLoaded, probe /api/geo and hide checkout buttons for
// non-allowed countries.
fetch('/api/geo').then(r => r.ok ? r.json() : null).then(g => {
  if (!g) return;
  const ALLOWED = (window.PFC_CONFIG?.PAYMENTS_ALLOWED_COUNTRIES || '').split(',').filter(Boolean);
  if (ALLOWED.length && !ALLOWED.includes(g.countryCode)) {
    document.querySelectorAll('[id$="-cta"]').forEach(b => {
      b.disabled = true;
      b.textContent = `Not yet available in ${g.countryName || g.countryCode}`;
      b.style.opacity = '0.5';
    });
  }
});
```

(That requires `PAYMENTS_ALLOWED_COUNTRIES` to also be in `pfc-config.js` — or you can fetch a `/api/payments-allowed-regions` endpoint that returns the same list from the env. Either works.)

---

## What I am NOT (mandatory caveat)

- I am not your lawyer.
- I am not your accountant.
- I have not reviewed your specific tax-residency situation.
- This document is a research summary to support YOUR decision, not a substitute for professional advice.

**Before acting on Option C or D, talk to a UK accountant who handles digital-services VAT.** The £200-400 consultation fee is the cheapest piece of insurance you'll buy this year. Specifically ask:
- "Where am I tax-resident for VAT purposes given that I'm a UK national operating a digital-services business?"
- "If I form a UK Ltd, what's my VAT registration trigger threshold?"
- "Does the Non-Union OSS apply to me, or am I in scope for UK VAT-only?"
- "What's my exposure for the last 12 months of sales if I've not been registered?"

---

## Action checklist

- [ ] **Today**: pick an allow-list. Add `PAYMENTS_ALLOWED_COUNTRIES` env var in Vercel. Apply the code drop-ins above. Deploy.
- [ ] **This week**: Form a UK Ltd via Companies House (£12, 1 hour).
- [ ] **Within 14 days**: Book a consultation with a UK accountant who handles digital-services VAT.
- [ ] **Within 60 days**: Migrate from PayPal Billing Plans to Lemon Squeezy (1 week of dev work). Remove geo-gate after launch.
- [ ] **Forever**: re-read this doc every 6 months. VAT rules and MoR provider economics change.

---

## See also

- [docs/runbooks/payments-incident-response.md](payments-incident-response.md) — IR runbook
- [docs/superpowers/audits/2026-05-23-payments-reaudit.md](../superpowers/audits/2026-05-23-payments-reaudit.md) — full audit with the CISO findings this doc responds to
- Lemon Squeezy docs: <https://docs.lemonsqueezy.com/help/getting-started>
- Polar.sh: <https://polar.sh>
- UK Companies House registration: <https://www.gov.uk/limited-company-formation>
- EU VAT-OSS overview: <https://taxation-customs.ec.europa.eu/online-services/online-services-and-databases-taxation/oss-one-stop-shop_en>
