// api/_lib/geo-gate.js
//
// CISO #1 fix — geo-restrict mutating payment endpoints to a configurable
// allow-list. Implements the "Option A — geo-restrict" strategy from
// docs/runbooks/vat-strategy.md.
//
// Why: selling digital services to EU consumers triggers personal VAT
// liability from the first €1 of sales. Until you (a) form an entity
// AND (b) register for VAT-OSS OR (c) switch to a Merchant of Record,
// the safest move is to not take EU money. This module enforces that.
//
// Behaviour:
//   - PAYMENTS_ALLOWED_COUNTRIES env unset → no-op (allows all countries)
//   - env set    → only listed ISO-3166 alpha-2 codes pass
//   - Country header missing (Tor, VPN, dev, edge-network hiccup) → BLOCK
//     when allow-list is set (fail-closed: never let an unknown country
//     bypass the gate by chance)
//
// Reads Vercel's `x-vercel-ip-country` header which is set on every request
// at the edge. Zero network calls, no IP logged or stored.
//
// Returns from checkGeo():
//   { allowed: true }                 — proceed
//   { allowed: false, country: 'DE' } — block, country known
//   { allowed: false, country: '(unknown)' } — block, country header missing
//
// HTTP 451 "Unavailable for legal reasons" is the right status code for
// VAT-driven geo-restrictions per RFC 7725.

export function checkGeo(req) {
  const allowedRaw = process.env.PAYMENTS_ALLOWED_COUNTRIES;
  if (!allowedRaw) return { allowed: true };  // gate disabled

  const allowed = new Set(
    allowedRaw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
  );

  // Header access differs between Node (req.headers.foo) and Edge
  // (req.headers.get(foo)). Support both.
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

/**
 * One-liner for handlers.
 *
 * NODE usage:
 *   if (geoBlockOrReject(req, res)) return;
 *
 * EDGE usage:
 *   const blocked = geoBlockOrReject(req, null);
 *   if (blocked) return blocked;  // Response object
 */
export function geoBlockOrReject(req, res) {
  const check = checkGeo(req);
  if (check.allowed) return null;

  const body = {
    error: `ProFinanceCast subscriptions are not yet available in your region (${check.country}). We're working on it — email hello@profinancecast.com to be notified when it launches.`,
    reason: 'geo_not_supported',
    country: check.country,
  };

  if (res && typeof res.status === 'function') {
    // Node runtime
    res.status(451).json(body);
    return true;
  }
  // Edge runtime — return a Response the caller forwards
  return new Response(JSON.stringify(body), {
    status: 451,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
