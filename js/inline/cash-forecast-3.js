  // cash-forecast is a FREE public tool: privacy-first, runs in-browser,
  // localStorage-only — no login required. It is SEO-indexed and listed in the
  // sitemap, so it must NOT be auth-gated. A previous PFCAuth.requireAuth() here
  // forced login and made Googlebot hit the auth wall, preventing the page from
  // being indexed at all. Intentionally no route guard now (matches the other
  // public /tools/ calculators).
