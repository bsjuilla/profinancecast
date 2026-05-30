    window.addEventListener('DOMContentLoaded', () => {
      // Pro-gated (Pro/Premium). requirePlan() handles the full chain with no
      // content flash: not-logged-in → /auth.html, logged-in-but-free →
      // /billing.html?upgrade=, Pro/Premium → render. The free public version
      // lives at /tools/debt-strategy-compare/ (indexed, ungated). Falls back
      // to requireAuth if entitlements failed to load.
      if (typeof PFCPlan !== 'undefined') PFCPlan.requirePlan(['pro','premium']);
      else if (typeof PFCAuth !== 'undefined') PFCAuth.requireAuth();
    });
